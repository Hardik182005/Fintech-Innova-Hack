"""Settings assembly, specifically the Cloud Run database wiring.

On Cloud Run the database password arrives from Secret Manager as its own
environment variable, so `database_url` is assembled at startup rather than
supplied whole. A mistake here does not raise — it produces a syntactically
valid URL pointing at the wrong host, or one that silently drops the password
and falls back to the local default. Both fail closed at connect time, but far
from the cause. These tests pin the assembly.
"""

from __future__ import annotations

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

from credence.config import Settings


def test_local_default_url_is_used_when_no_host_supplied():
    """With no host/password (local dev), database_url passes through verbatim."""
    s = Settings(database_url="postgresql+psycopg://u:p@localhost:5432/db")
    assert s.database_url == "postgresql+psycopg://u:p@localhost:5432/db"


def test_url_is_assembled_from_host_and_password():
    s = Settings(database_host="10.10.0.3", database_password="s3cret")
    assert s.database_url == "postgresql+psycopg://credence:s3cret@10.10.0.3:5432/credence"


def test_assembly_requires_both_host_and_password():
    """A half-configured deployment must not silently build a passwordless URL."""
    default = Settings().database_url

    assert Settings(database_host="10.10.0.3").database_url == default
    assert Settings(database_password="s3cret").database_url == default


@pytest.mark.parametrize(
    ("raw", "encoded"),
    [
        ("p@ss", "p%40ss"),  # @ would otherwise terminate the userinfo section
        ("a/b", "a%2Fb"),  # / would otherwise start the path
        ("a:b", "a%3Ab"),  # : would otherwise split user from password
        ("a?b", "a%3Fb"),  # ? would otherwise start the query string
    ],
)
def test_password_url_special_characters_are_escaped(raw: str, encoded: str):
    """A generated password containing URL-structural characters must not
    re-point the connection. Unescaped, `p@ss` turns the host into `ss@...`."""
    s = Settings(database_host="10.10.0.3", database_password=raw)
    assert f":{encoded}@10.10.0.3:" in s.database_url


def test_non_default_user_port_and_name_are_honoured():
    s = Settings(
        database_host="db.internal",
        database_password="pw",
        database_user="other",
        database_name="ledger",
        database_port=6543,
    )
    assert s.database_url == "postgresql+psycopg://other:pw@db.internal:6543/ledger"


def _signing_key_pem() -> str:
    """A throwaway Ed25519 key, for tests that need a deployed run mode to be
    constructible at all. What the key is never matters here."""
    return (
        Ed25519PrivateKey.generate()
        .private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        .decode("ascii")
    )


# --- fixture-gateway guard -------------------------------------------------
#
# The deployed sandbox ran for its entire life on FixtureModelGateway because
# model_provider defaults to "fixture" and the Cloud Run service never set
# CREDENCE_MODEL_PROVIDER. Nothing failed: the API kept returning well-formed
# analyses no model had produced, while the GPU sat idle and the site claimed
# a live 24B. These pin the guard that makes that combination unstartable.


@pytest.mark.parametrize("run_mode", ["GCP_COST", "GCP_ACCURACY"])
def test_fixture_gateway_is_rejected_on_deployed_run_modes(run_mode: str):
    with pytest.raises(ValueError, match="fixture"):
        Settings(run_mode=run_mode, model_provider="fixture")


@pytest.mark.parametrize("run_mode", ["GCP_COST", "GCP_ACCURACY"])
@pytest.mark.parametrize("provider", ["ollama", "disabled"])
def test_real_and_disabled_providers_are_permitted_when_deployed(run_mode: str, provider: str):
    """'disabled' stays legal: it blocks AI-dependent approval paths outright,
    which fails closed. Only 'fixture' fabricates plausible model output."""
    settings = Settings(
        run_mode=run_mode,
        model_provider=provider,
        # A deployed run mode also demands a stable signing key; supplied here
        # so this test keeps failing for provider reasons only.
        passport_signing_key_pem=_signing_key_pem(),
    )
    assert settings.model_provider == provider


@pytest.mark.parametrize("run_mode", ["LOCAL_DEV", "DEMO_LOCKED"])
def test_fixture_gateway_remains_available_off_gcp(run_mode: str):
    """Unit tests and local dev still need the deterministic gateway."""
    assert Settings(run_mode=run_mode, model_provider="fixture").model_provider == "fixture"


def test_model_roles_share_one_tag():
    """One GPU with OLLAMA_MAX_LOADED_MODELS=1 cannot serve two tags without
    evicting and reloading ~15GB per call. The previous defaults pointed the
    analyst at qwen3:8b, which was never pulled onto the GPU instance at all.

    _env_file=None isolates this from the developer's local .env, which
    legitimately runs two small models against a local Ollama.
    """
    s = Settings(_env_file=None)
    assert s.ollama_analyst_model == s.ollama_critic_model
    assert "qwen3" not in s.ollama_analyst_model

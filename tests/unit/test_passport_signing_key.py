"""The passport signing key must outlive the process that issued the passport.

This is a regression suite for a defect that reached the deployed sandbox: the
signer generated a fresh Ed25519 key per process, so issuance and verification
agreed inside one instance and disagreed everywhere else. Deploying a new
revision rejected live credit applications with AGENT_IDENTITY_INVALID, and
running more than one instance would have made the rejections random.

The tests below pin the two properties that were missing — a key that survives
a restart, and a deployed service that refuses to start without one — rather
than the implementation that currently provides them.
"""

from __future__ import annotations

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.asymmetric.rsa import generate_private_key
from pydantic import ValidationError

from credence.config import Settings
from credence.passport.keys import (
    LocalDevSigner,
    StaticEd25519Signer,
    verify_signature,
)


def _pem() -> str:
    return (
        Ed25519PrivateKey.generate()
        .private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        .decode("ascii")
    )


DATA = b"passport-payload-bytes"


# --- the defect itself -----------------------------------------------------


def test_two_signers_from_one_pem_verify_each_others_signatures():
    """The actual failure: instance A signs, instance B verifies. Constructing
    the signer twice stands in for two replicas, and for the same replica
    before and after a redeploy."""
    pem = _pem()
    a, b = StaticEd25519Signer(pem), StaticEd25519Signer(pem)

    assert verify_signature(b.public_key_pem(), a.sign(DATA), DATA)
    assert verify_signature(a.public_key_pem(), b.sign(DATA), DATA)


def test_ephemeral_signers_cannot_verify_each_other():
    """Contrast case, and the reason the bug was invisible in tests that only
    ever built one signer: each LocalDevSigner is a different identity."""
    a, b = LocalDevSigner(), LocalDevSigner()

    assert not verify_signature(b.public_key_pem(), a.sign(DATA), DATA)


def test_key_version_identifies_the_key():
    """A passport records key_version, so it must name the key that signed it
    and not a hand-set constant that can drift from the key."""
    pem = _pem()

    assert StaticEd25519Signer(pem).key_version == StaticEd25519Signer(pem).key_version
    assert StaticEd25519Signer(pem).key_version != StaticEd25519Signer(_pem()).key_version
    assert LocalDevSigner().key_version != LocalDevSigner().key_version


# --- refusing to start without a stable key --------------------------------


@pytest.mark.parametrize("run_mode", ["GCP_COST", "GCP_ACCURACY"])
def test_deployed_run_mode_requires_a_configured_key(run_mode):
    """Falling back to an ephemeral key is exactly what shipped. A deployed
    service must fail loudly at startup instead."""
    with pytest.raises(ValidationError, match="PASSPORT_SIGNING_KEY_PEM"):
        Settings(run_mode=run_mode, model_provider="ollama", passport_signing_key_pem="")


@pytest.mark.parametrize("run_mode", ["GCP_COST", "GCP_ACCURACY"])
def test_deployed_run_mode_accepts_a_configured_key(run_mode):
    settings = Settings(
        run_mode=run_mode, model_provider="ollama", passport_signing_key_pem=_pem()
    )
    assert StaticEd25519Signer(settings.passport_signing_key_pem).sign(DATA)


def test_local_dev_still_runs_without_a_key():
    """Developers and unit tests must not need a secret to start."""
    assert Settings(run_mode="LOCAL_DEV").passport_signing_key_pem == ""


# --- rejecting keys that would fail later ----------------------------------


def test_non_ed25519_key_is_rejected_at_construction():
    """A wrong key type would otherwise surface at signing time, on a live
    request, as an opaque error."""
    rsa_pem = (
        generate_private_key(public_exponent=65537, key_size=2048)
        .private_bytes(
            encoding=serialization.Encoding.PEM,
            format=serialization.PrivateFormat.PKCS8,
            encryption_algorithm=serialization.NoEncryption(),
        )
        .decode("ascii")
    )

    with pytest.raises(ValueError, match="must be Ed25519"):
        StaticEd25519Signer(rsa_pem)


def test_malformed_pem_is_rejected():
    with pytest.raises(ValueError):
        StaticEd25519Signer("not a pem at all")


def test_surrounding_whitespace_is_tolerated():
    """Secret Manager payloads routinely arrive with a trailing newline."""
    assert StaticEd25519Signer(f"\n  {_pem()}  \n").sign(DATA)

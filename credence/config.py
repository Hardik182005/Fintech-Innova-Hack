"""Central configuration. Secrets are never hard-coded; they arrive via the
environment (locally from .env, on GCP from Secret Manager injection)."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache
from urllib.parse import quote_plus

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class RunMode(StrEnum):
    LOCAL_DEV = "LOCAL_DEV"
    GCP_COST = "GCP_COST"
    GCP_ACCURACY = "GCP_ACCURACY"
    DEMO_LOCKED = "DEMO_LOCKED"


class Environment(StrEnum):
    SANDBOX = "sandbox"
    PRODUCTION = "production"  # not enabled for the hackathon


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="CREDENCE_", env_file=".env", extra="ignore")

    run_mode: RunMode = RunMode.LOCAL_DEV
    environment: Environment = Environment.SANDBOX

    database_url: str = "postgresql+psycopg://credence:credence@localhost:5432/credence"

    # Cloud Run supplies the database password from Secret Manager as its own
    # environment variable, because a secret can only be injected as a whole
    # value — it cannot be interpolated into the middle of a connection URL by
    # the platform. So the URL is assembled here at startup instead of being
    # shipped with the credential embedded in it. Locally these stay empty and
    # database_url above is used verbatim.
    database_host: str = ""
    database_password: str = ""
    database_user: str = "credence"
    database_name: str = "credence"
    database_port: int = 5432

    @model_validator(mode="after")
    def _assemble_database_url(self) -> Settings:
        if self.database_host and self.database_password:
            # quote_plus: a generated password may contain characters that are
            # structural in a URL, and a naive f-string would silently produce
            # a connection string pointing somewhere else.
            self.database_url = (
                f"postgresql+psycopg://{quote_plus(self.database_user)}:"
                f"{quote_plus(self.database_password)}@"
                f"{self.database_host}:{self.database_port}/{self.database_name}"
            )
        return self

    # Passport issuance
    passport_issuer: str = "credence-sandbox"
    passport_audience: str = "credence-api"
    passport_max_ttl_seconds: int = 24 * 3600
    # Ed25519 private key PEM (PKCS#8), injected from Secret Manager on GCP.
    # Empty means LOCAL_DEV's ephemeral key — see the validator below for why
    # that is refused on a deployed service.
    passport_signing_key_pem: str = ""

    # Policy engine (OPA). Fail closed when unreachable.
    opa_url: str = "http://localhost:8181"
    opa_timeout_seconds: float = 2.0

    # Local AI. LOCAL_DEV uses Ollama (fully local, no external API); GCP
    # profiles use a private vLLM gateway. Deterministic paths must work with
    # the provider disabled (CPU/degraded profile) — "fixture" is used in
    # tests, "disabled" blocks auto-approval paths needing AI evidence checks.
    model_provider: str = "fixture"  # ollama | fixture | disabled
    ollama_base_url: str = "http://localhost:11434"
    # One GPU, OLLAMA_MAX_LOADED_MODELS=1: every role is served by the same
    # loaded model. Pointing roles at different tags would thrash the single
    # L4 (evict + reload ~15GB per call), so analyst and critic share one tag.
    # This must match the tag the inference container actually verified at
    # startup; a mismatch here is a silent 404 from Ollama at request time.
    ollama_analyst_model: str = "mistral-small3.2:24b-instruct-2506-q4_K_M"
    ollama_critic_model: str = "mistral-small3.2:24b-instruct-2506-q4_K_M"
    ollama_embedding_model: str = "qwen3-embedding:0.6b"
    model_timeout_seconds: float = 120.0
    model_max_output_tokens: int = 1024
    # Serving context window, sent per request. Setting OLLAMA_CONTEXT_LENGTH
    # on the inference container is not sufficient: Ollama overrode it with a
    # VRAM-derived default of 4096, which truncates evidence bundles without
    # any error. Must match the inference container's value or the first
    # request forces a model reload.
    model_context_tokens: int = 8192

    # Cloud Run inference is private (ingress=internal) and IAM-protected. The
    # API mints a Google-signed OIDC identity token for this audience rather
    # than calling the service unauthenticated.
    inference_use_oidc: bool = True

    # Resilience. One retry only: a 24B generation is expensive and a retry
    # storm against a single GPU is how a slow model becomes a dead one.
    model_max_retries: int = 1
    model_circuit_fail_threshold: int = 3
    model_circuit_reset_seconds: float = 60.0

    # Demo endpoints bearer token (sandbox only). Deliberately has no default:
    # a shipped default is a shipped credential, and every deployment that
    # forgot to override it would share the same one. Absent token means the
    # demo surface stays closed.
    demo_reset_token: str = ""

    # Voice is disabled by default and is never on the critical path.
    voice_provider: str = "disabled"  # elevenlabs | disabled

    # ElevenLabs text-to-speech. The key is aliased to the unprefixed
    # ELEVENLABS_API_KEY (third-party secrets arrive under their own names);
    # it is server-side only and must never be logged, echoed in a response,
    # or sent to the browser. Empty key means voice stays off.
    elevenlabs_api_key: str = Field(default="", validation_alias="ELEVENLABS_API_KEY")
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # a stock ElevenLabs voice

    # A deployed GCP service must never silently fall back to the in-process
    # fixture gateway. That failure mode is invisible from the outside — the
    # API keeps returning well-formed analyses that no model ever produced,
    # and the GPU sits idle while the site claims it is serving. Fail startup
    # instead, loudly, so the deployment is caught before it can mislead.
    # "fixture" stays legal for LOCAL_DEV and for unit tests.
    @model_validator(mode="after")
    def _forbid_fixture_gateway_on_gcp(self) -> Settings:
        deployed = self.run_mode in (RunMode.GCP_COST, RunMode.GCP_ACCURACY)
        if deployed and self.model_provider == "fixture":
            raise ValueError(
                f"model_provider='fixture' is not permitted with run_mode={self.run_mode}. "
                "A deployed environment must use the real private inference gateway "
                "(CREDENCE_MODEL_PROVIDER=ollama) or explicitly 'disabled'. "
                "The fixture gateway is for LOCAL_DEV and unit tests only."
            )
        return self

    # A deployed service must sign passports with a key that outlives the
    # process. The ephemeral dev key looks harmless because issuance and
    # verification both succeed within one instance — but it is only valid
    # there and only until the next deploy. In production that showed up as
    # applications rejected with AGENT_IDENTITY_INVALID immediately after a
    # revision rollout, and it would have shown up again as nondeterministic
    # rejections once more than one instance was serving. Refuse to start
    # rather than fall back to a key that quietly expires with the process.
    @model_validator(mode="after")
    def _require_stable_signing_key_on_gcp(self) -> Settings:
        deployed = self.run_mode in (RunMode.GCP_COST, RunMode.GCP_ACCURACY)
        if deployed and not self.passport_signing_key_pem.strip():
            raise ValueError(
                f"CREDENCE_PASSPORT_SIGNING_KEY_PEM is required with run_mode={self.run_mode}. "
                "Without it every passport is signed by a per-process key that no other "
                "instance can verify and that every redeploy invalidates."
            )
        return self

    # Demo endpoints require the sandbox environment *and* an operator-supplied
    # token. Fail closed on both counts.
    @property
    def demo_enabled(self) -> bool:
        return self.environment == Environment.SANDBOX and bool(self.demo_reset_token)


@lru_cache
def get_settings() -> Settings:
    return Settings()

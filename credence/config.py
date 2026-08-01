"""Central configuration. Secrets are never hard-coded; they arrive via the
environment (locally from .env, on GCP from Secret Manager injection)."""

from __future__ import annotations

from enum import StrEnum
from functools import lru_cache

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

    # Passport issuance
    passport_issuer: str = "credence-sandbox"
    passport_audience: str = "credence-api"
    passport_max_ttl_seconds: int = 24 * 3600

    # Policy engine (OPA). Fail closed when unreachable.
    opa_url: str = "http://localhost:8181"
    opa_timeout_seconds: float = 2.0

    # Model gateway (vLLM). Disabled by default; deterministic paths must work
    # without it (CPU/degraded profile).
    model_gateway_url: str | None = None

    # Voice is disabled by default and is never on the critical path.
    voice_provider: str = "disabled"

    # Demo endpoints are only mounted in the sandbox environment.
    @property
    def demo_enabled(self) -> bool:
        return self.environment == Environment.SANDBOX


@lru_cache
def get_settings() -> Settings:
    return Settings()

"""Agent Passport payload and envelope schemas (spec §5.1)."""

from __future__ import annotations

import base64
import json
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class PassportPayload(BaseModel):
    """The signed content of an Agent Passport. No PII beyond opaque IDs."""

    model_config = ConfigDict(extra="forbid")

    agent_id: str
    organization_id: str
    owner_user_id: str
    agent_public_key_pem: str | None = None
    model_provider: str
    model_name: str
    model_version_hash: str
    purpose: str
    permitted_task_categories: list[str]
    max_borrowing_authority_minor: int = Field(ge=0)
    max_transaction_value_minor: int = Field(ge=0)
    approved_vendor_categories: list[str] = Field(default_factory=list)
    approved_vendor_ids: list[str] = Field(default_factory=list)
    currency: str = "INR"
    valid_from: datetime
    expires_at: datetime
    environment: str = "sandbox"
    nonce: str
    key_version: str
    issuer: str
    audience: str

    def canonical_bytes(self) -> bytes:
        """Deterministic serialization used for signing and verification."""
        data = self.model_dump(mode="json")
        return json.dumps(data, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode(
            "utf-8"
        )


class SignedPassport(BaseModel):
    model_config = ConfigDict(extra="forbid")

    payload: PassportPayload
    signature_b64: str
    signer_public_key_pem: str

    @property
    def signature(self) -> bytes:
        return base64.b64decode(self.signature_b64)

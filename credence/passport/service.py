"""Agent Passport issuance, verification, and revocation.

Verification is fail-closed: any error, missing field, unknown issuer, bad
signature, expiry, revocation, audience mismatch, or nonce replay yields an
explicit denial with a canonical reason code. Every privileged request must
pass verification; there is no cached "trusted" shortcut.
"""

from __future__ import annotations

import base64
import secrets
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Protocol

from credence.errors import ReasonCode
from credence.passport.keys import Signer, verify_signature
from credence.passport.schemas import PassportPayload, SignedPassport


class RevocationStore(Protocol):
    def is_revoked(self, agent_id: str, nonce: str) -> bool: ...
    def revoke(self, agent_id: str, nonce: str, reason: str) -> None: ...


class NonceStore(Protocol):
    """Tracks single-use request nonces to block replay of privileged calls."""

    def consume(self, nonce: str) -> bool:
        """Return True if the nonce was fresh and is now consumed."""
        ...


class InMemoryRevocationStore:
    def __init__(self) -> None:
        self._revoked: dict[tuple[str, str], str] = {}
        self._revoked_agents: dict[str, str] = {}

    def is_revoked(self, agent_id: str, nonce: str) -> bool:
        return agent_id in self._revoked_agents or (agent_id, nonce) in self._revoked

    def revoke(self, agent_id: str, nonce: str, reason: str) -> None:
        # Empty nonce revokes the agent entirely (kill switch).
        if nonce:
            self._revoked[(agent_id, nonce)] = reason
        else:
            self._revoked_agents[agent_id] = reason


class InMemoryNonceStore:
    def __init__(self) -> None:
        self._seen: set[str] = set()

    def consume(self, nonce: str) -> bool:
        if nonce in self._seen:
            return False
        self._seen.add(nonce)
        return True


@dataclass
class VerificationResult:
    valid: bool
    reasons: list[ReasonCode] = field(default_factory=list)

    @property
    def reason_codes(self) -> list[str]:
        return [r.value for r in self.reasons]


class PassportService:
    def __init__(
        self,
        signer: Signer,
        revocations: RevocationStore,
        trusted_issuers: set[str] | None = None,
        expected_audience: str = "credence-api",
        max_ttl: timedelta = timedelta(hours=24),
    ):
        self._signer = signer
        self._revocations = revocations
        self._trusted_issuers = trusted_issuers or {signer.issuer}
        self._expected_audience = expected_audience
        self._max_ttl = max_ttl

    def issue(
        self,
        *,
        agent_id: str,
        organization_id: str,
        owner_user_id: str,
        model_provider: str,
        model_name: str,
        model_version_hash: str,
        purpose: str,
        permitted_task_categories: list[str],
        max_borrowing_authority_minor: int,
        max_transaction_value_minor: int,
        approved_vendor_categories: list[str] | None = None,
        approved_vendor_ids: list[str] | None = None,
        currency: str = "INR",
        ttl: timedelta = timedelta(hours=1),
        environment: str = "sandbox",
        now: datetime | None = None,
    ) -> SignedPassport:
        if ttl > self._max_ttl:
            raise ValueError(f"ttl {ttl} exceeds maximum permitted {self._max_ttl}")
        now = now or datetime.now(UTC)
        payload = PassportPayload(
            agent_id=agent_id,
            organization_id=organization_id,
            owner_user_id=owner_user_id,
            model_provider=model_provider,
            model_name=model_name,
            model_version_hash=model_version_hash,
            purpose=purpose,
            permitted_task_categories=permitted_task_categories,
            max_borrowing_authority_minor=max_borrowing_authority_minor,
            max_transaction_value_minor=max_transaction_value_minor,
            approved_vendor_categories=approved_vendor_categories or [],
            approved_vendor_ids=approved_vendor_ids or [],
            currency=currency,
            valid_from=now,
            expires_at=now + ttl,
            environment=environment,
            nonce=secrets.token_urlsafe(24),
            key_version=self._signer.key_version,
            issuer=self._signer.issuer,
            audience=self._expected_audience,
        )
        signature = self._signer.sign(payload.canonical_bytes())
        return SignedPassport(
            payload=payload,
            signature_b64=base64.b64encode(signature).decode("ascii"),
            signer_public_key_pem=self._signer.public_key_pem(),
        )

    def revoke(self, agent_id: str, reason: str, nonce: str = "") -> None:
        self._revocations.revoke(agent_id, nonce, reason)

    def verify(
        self,
        passport: SignedPassport,
        *,
        required_scope: str | None = None,
        request_nonce_store: NonceStore | None = None,
        request_nonce: str | None = None,
        now: datetime | None = None,
    ) -> VerificationResult:
        """Verify signature, issuer, audience, validity window, revocation,
        scope, and (optionally) a single-use request nonce. Fail closed."""
        now = now or datetime.now(UTC)
        reasons: list[ReasonCode] = []
        p = passport.payload

        try:
            # 1. Trusted issuer key. Only the service's own signer key is
            # trusted; the PEM embedded in the envelope must match it, so a
            # forger cannot supply their own key.
            if p.issuer not in self._trusted_issuers:
                reasons.append(ReasonCode.ISSUER_UNKNOWN)
            trusted_pem = self._signer.public_key_pem()
            if passport.signer_public_key_pem != trusted_pem:
                reasons.append(ReasonCode.AGENT_IDENTITY_INVALID)
            elif not verify_signature(trusted_pem, passport.signature, p.canonical_bytes()):
                reasons.append(ReasonCode.AGENT_IDENTITY_INVALID)

            # 2. Audience
            if p.audience != self._expected_audience:
                reasons.append(ReasonCode.AUDIENCE_MISMATCH)

            # 3. Validity window
            if p.valid_from > now:
                reasons.append(ReasonCode.PASSPORT_NOT_YET_VALID)
            if p.expires_at <= now:
                reasons.append(ReasonCode.AUTHORIZATION_EXPIRED)

            # 4. Revocation (kill switch)
            if self._revocations.is_revoked(p.agent_id, p.nonce):
                reasons.append(ReasonCode.PASSPORT_REVOKED)

            # 5. Scope
            if required_scope is not None and required_scope not in p.permitted_task_categories:
                reasons.append(ReasonCode.SCOPE_MISSING)

            # 6. Single-use request nonce (replay protection for privileged calls)
            if request_nonce_store is not None:
                if not request_nonce or not request_nonce_store.consume(request_nonce):
                    reasons.append(ReasonCode.NONCE_REPLAYED)
        except Exception:  # noqa: BLE001 — any unexpected failure denies
            reasons.append(ReasonCode.AGENT_IDENTITY_INVALID)

        return VerificationResult(valid=not reasons, reasons=reasons)

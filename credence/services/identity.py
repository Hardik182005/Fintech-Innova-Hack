"""Organizations, users (sandbox bearer auth), agents, passports, and the
owner kill switch with measured enforcement latency."""

from __future__ import annotations

import hashlib
import json
import secrets
from datetime import UTC, datetime, timedelta
from functools import lru_cache

from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.audit import append_audit_event
from credence.config import get_settings
from credence.errors import CredenceError, ReasonCode
from credence.finance_models import CreditVault, FreezeEvent
from credence.models import (
    Agent,
    AgentPassport,
    AgentStatus,
    Organization,
    PassportRevocation,
    User,
)
from credence.passport.keys import LocalDevSigner, Signer, StaticEd25519Signer
from credence.passport.schemas import SignedPassport
from credence.passport.service import PassportService, RevocationStore


@lru_cache
def get_signer() -> Signer:
    """The process-wide passport signer.

    A configured key (Secret Manager on GCP) is used when present; otherwise
    LOCAL_DEV falls back to an ephemeral key. There is deliberately no fallback
    on a deployed service — Settings refuses to start without a static key,
    because an ephemeral one invalidates every passport on redeploy and cannot
    be verified by a sibling instance.
    """
    settings = get_settings()
    pem = settings.passport_signing_key_pem.strip()
    if pem:
        return StaticEd25519Signer(pem, issuer=settings.passport_issuer)
    return LocalDevSigner(issuer=settings.passport_issuer)


class DbRevocationStore(RevocationStore):
    """Revocations backed by passport_revocations + agent status."""

    def __init__(self, session: Session):
        self._session = session

    def is_revoked(self, agent_id: str, nonce: str) -> bool:
        agent = self._session.get(Agent, agent_id)
        if agent is None or agent.status == AgentStatus.REVOKED:
            return True
        row = self._session.execute(
            select(PassportRevocation.id)
            .where(
                PassportRevocation.agent_id == agent_id,
                PassportRevocation.passport_nonce.in_(["", nonce]),
            )
            .limit(1)
        ).scalar_one_or_none()
        return row is not None

    def revoke(self, agent_id: str, nonce: str, reason: str) -> None:
        self._session.add(
            PassportRevocation(
                organization_id=self._session.get(Agent, agent_id).organization_id,
                agent_id=agent_id,
                passport_nonce=nonce,
                reason=reason,
                revoked_by="system",
            )
        )


def passport_service(session: Session) -> PassportService:
    settings = get_settings()
    return PassportService(
        signer=get_signer(),
        revocations=DbRevocationStore(session),
        expected_audience=settings.passport_audience,
        max_ttl=timedelta(seconds=settings.passport_max_ttl_seconds),
    )


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_organization(
    session: Session, name: str, owner_email: str
) -> tuple[Organization, User, str]:
    org = Organization(name=name)
    session.add(org)
    session.flush()
    raw_token = f"cred_sk_{secrets.token_urlsafe(32)}"
    owner = User(
        organization_id=org.id,
        email=owner_email,
        role="OWNER",
        api_token_hash=_hash_token(raw_token),
    )
    session.add(owner)
    session.flush()
    append_audit_event(
        session,
        actor_type="USER",
        actor_id=owner.id,
        event_type="ORGANIZATION_CREATED",
        payload={"organization_id": org.id, "name": name},
        organization_id=org.id,
        resource_id=org.id,
    )
    return org, owner, raw_token


def authenticate(session: Session, token: str) -> User | None:
    if not token:
        return None
    return session.execute(
        select(User).where(User.api_token_hash == _hash_token(token))
    ).scalar_one_or_none()


def create_agent(
    session: Session,
    *,
    organization_id: str,
    owner_user_id: str,
    name: str,
    model_provider: str,
    model_name: str,
    model_version_hash: str,
) -> Agent:
    agent = Agent(
        organization_id=organization_id,
        owner_user_id=owner_user_id,
        name=name,
        model_provider=model_provider,
        model_name=model_name,
        model_version_hash=model_version_hash,
    )
    session.add(agent)
    session.flush()
    append_audit_event(
        session,
        actor_type="USER",
        actor_id=owner_user_id,
        event_type="AGENT_CREATED",
        payload={"agent_id": agent.id, "name": name, "model": model_name},
        organization_id=organization_id,
        resource_id=agent.id,
    )
    return agent


def issue_passport(
    session: Session,
    *,
    agent_id: str,
    purpose: str,
    permitted_task_categories: list[str],
    max_borrowing_authority_minor: int,
    max_transaction_value_minor: int,
    approved_vendor_ids: list[str],
    ttl_hours: int = 1,
) -> tuple[AgentPassport, SignedPassport]:
    agent = session.get(Agent, agent_id)
    if agent is None:
        raise CredenceError(ReasonCode.AGENT_IDENTITY_INVALID, f"unknown agent {agent_id}")
    if agent.status != AgentStatus.ACTIVE:
        raise CredenceError(ReasonCode.AGENT_FROZEN, f"agent status {agent.status}")

    service = passport_service(session)
    signed = service.issue(
        agent_id=agent.id,
        organization_id=agent.organization_id,
        owner_user_id=agent.owner_user_id,
        model_provider=agent.model_provider,
        model_name=agent.model_name,
        model_version_hash=agent.model_version_hash,
        purpose=purpose,
        permitted_task_categories=permitted_task_categories,
        max_borrowing_authority_minor=max_borrowing_authority_minor,
        max_transaction_value_minor=max_transaction_value_minor,
        approved_vendor_ids=approved_vendor_ids,
        ttl=timedelta(hours=ttl_hours),
    )
    row = AgentPassport(
        organization_id=agent.organization_id,
        agent_id=agent.id,
        nonce=signed.payload.nonce,
        key_version=signed.payload.key_version,
        issuer=signed.payload.issuer,
        payload_json=signed.payload.model_dump_json(),
        signature_b64=signed.signature_b64,
        valid_from=signed.payload.valid_from,
        expires_at=signed.payload.expires_at,
    )
    session.add(row)
    session.flush()
    append_audit_event(
        session,
        actor_type="USER",
        actor_id=agent.owner_user_id,
        event_type="PASSPORT_ISSUED",
        payload={
            "agent_id": agent.id,
            "nonce": signed.payload.nonce,
            "expires_at": signed.payload.expires_at.isoformat(),
        },
        organization_id=agent.organization_id,
        resource_id=row.id,
    )
    return row, signed


def verify_stored_passport(session: Session, agent_id: str) -> tuple[bool, list[str]]:
    """Verify the agent's most recent stored passport (fail closed)."""
    row = session.execute(
        select(AgentPassport)
        .where(AgentPassport.agent_id == agent_id)
        .order_by(AgentPassport.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if row is None:
        return False, [ReasonCode.AGENT_IDENTITY_INVALID.value]
    signed = SignedPassport(
        payload=json.loads(row.payload_json),
        signature_b64=row.signature_b64,
        signer_public_key_pem=get_signer().public_key_pem(),
    )
    result = passport_service(session).verify(signed)
    return result.valid, result.reason_codes


def kill_switch(
    session: Session,
    *,
    agent_id: str,
    actor_id: str,
    action: str,  # FREEZE | UNFREEZE | REVOKE
    reason: str,
    requested_at: datetime | None = None,
) -> FreezeEvent:
    """Owner kill switch. Blocks all future spending immediately; records the
    measured latency between request and enforcement."""
    requested_at = requested_at or datetime.now(UTC)
    agent = session.get(Agent, agent_id)
    if agent is None:
        raise CredenceError(ReasonCode.AGENT_IDENTITY_INVALID, f"unknown agent {agent_id}")

    if action == "FREEZE":
        agent.status = AgentStatus.FROZEN
    elif action == "UNFREEZE":
        if agent.status == AgentStatus.REVOKED:
            raise CredenceError(ReasonCode.PASSPORT_REVOKED, "revoked agents cannot be unfrozen")
        agent.status = AgentStatus.ACTIVE
    elif action == "REVOKE":
        agent.status = AgentStatus.REVOKED
        DbRevocationStore(session).revoke(agent_id, "", reason)
        # Freeze all open vaults of this agent.
        for vault in session.execute(
            select(CreditVault).where(
                CreditVault.agent_id == agent_id,
                CreditVault.status.in_(["CREATED", "ACTIVE", "SPENDING"]),
            )
        ).scalars():
            vault.status = "FROZEN"
            vault.frozen_reason = f"agent revoked: {reason}"
    else:
        raise CredenceError(ReasonCode.POLICY_DENIED, f"unknown kill-switch action {action}")

    enforced_at = datetime.now(UTC)
    event = FreezeEvent(
        organization_id=agent.organization_id,
        subject_type="AGENT",
        subject_id=agent_id,
        action=action,
        reason=reason,
        actor_id=actor_id,
        requested_at=requested_at,
        enforced_at=enforced_at,
        latency_ms=int((enforced_at - requested_at).total_seconds() * 1000),
    )
    session.add(event)
    session.flush()
    append_audit_event(
        session,
        actor_type="USER",
        actor_id=actor_id,
        event_type=f"AGENT_{action}",
        payload={"agent_id": agent_id, "reason": reason, "latency_ms": event.latency_ms},
        organization_id=agent.organization_id,
        resource_id=agent_id,
    )
    return event

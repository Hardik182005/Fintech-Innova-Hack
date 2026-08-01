"""Append-only, hash-chained audit log.

Each event's hash covers its canonical payload and the previous event's hash,
so any mutation or deletion breaks verification from that point forward. This
is tamper-EVIDENT (not blockchain immutability) — described accurately per
spec §13. High-impact events additionally get a KMS signature in Phase 5.
"""

from __future__ import annotations

import hashlib
import json
from typing import Any

from sqlalchemy import select, text
from sqlalchemy.orm import Session

from credence.models import AuditEvent
from credence.telemetry import current_request_id

GENESIS_HASH = "0" * 64

# Serialises appenders across sessions. Any stable 64-bit constant works; this
# one spells "credence chain" to a debugger reading pg_locks.
_CHAIN_LOCK_KEY = 0x63_72_65_64_63_68_61_69


def _lock_chain(session: Session) -> None:
    """Take a transaction-scoped exclusive lock on the chain head.

    `_latest()` followed by an insert is a read-then-write on shared state: two
    concurrent transactions can both read the same head and both append with the
    same prev_hash, which is indistinguishable from tampering when the chain is
    verified (observed live as a fork at one seq). Row locks cannot close this —
    the row that needs locking is the one about to be inserted — so appenders
    serialise on an advisory lock instead, released automatically at commit.

    SQLite (the unit-test engine) runs single-writer already and has no advisory
    locks, so only PostgreSQL takes one.
    """
    if session.get_bind().dialect.name == "postgresql":
        session.execute(text("SELECT pg_advisory_xact_lock(:key)"), {"key": _CHAIN_LOCK_KEY})


def _canonical(payload: dict[str, Any]) -> str:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256(data: str) -> str:
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def _latest(session: Session) -> AuditEvent | None:
    return session.execute(
        select(AuditEvent).order_by(AuditEvent.seq.desc()).limit(1)
    ).scalar_one_or_none()


def append_audit_event(
    session: Session,
    *,
    actor_type: str,
    actor_id: str,
    event_type: str,
    payload: dict[str, Any],
    organization_id: str | None = None,
    resource_id: str | None = None,
    request_id: str | None = None,
) -> AuditEvent:
    if request_id is None:
        # Correlation id of the HTTP request being served (set by the
        # middleware in credence.api.app); None outside a request context.
        request_id = current_request_id()
    payload_json = _canonical(payload)
    payload_hash = _sha256(payload_json)
    _lock_chain(session)
    prev = _latest(session)
    prev_hash = prev.event_hash if prev is not None else GENESIS_HASH
    event_hash = _sha256(
        _canonical(
            {
                "prev_hash": prev_hash,
                "payload_hash": payload_hash,
                "actor_type": actor_type,
                "actor_id": actor_id,
                "event_type": event_type,
                "organization_id": organization_id,
                "resource_id": resource_id,
            }
        )
    )
    event = AuditEvent(
        organization_id=organization_id,
        actor_type=actor_type,
        actor_id=actor_id,
        event_type=event_type,
        resource_id=resource_id,
        request_id=request_id,
        payload_json=payload_json,
        payload_hash=payload_hash,
        prev_hash=prev_hash,
        event_hash=event_hash,
    )
    session.add(event)
    session.flush()
    return event


def verify_chain(session: Session) -> tuple[bool, int | None]:
    """Walk the full chain. Returns (intact, first_broken_seq)."""
    prev_hash = GENESIS_HASH
    for event in session.execute(select(AuditEvent).order_by(AuditEvent.seq)).scalars():
        if event.prev_hash != prev_hash:
            return False, event.seq
        if _sha256(event.payload_json) != event.payload_hash:
            return False, event.seq
        expected = _sha256(
            _canonical(
                {
                    "prev_hash": event.prev_hash,
                    "payload_hash": event.payload_hash,
                    "actor_type": event.actor_type,
                    "actor_id": event.actor_id,
                    "event_type": event.event_type,
                    "organization_id": event.organization_id,
                    "resource_id": event.resource_id,
                }
            )
        )
        if event.event_hash != expected:
            return False, event.seq
        prev_hash = event.event_hash
    return True, None

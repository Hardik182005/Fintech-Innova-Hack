"""ORM-level immutability guard for financial and audit records.

Journal transactions, journal entries, and audit events are append-only:
corrections happen through reversal entries, never edits. Any ORM update or
delete against these tables raises ImmutableRecordError before flush.
Database-level protection (REVOKE UPDATE/DELETE, triggers) is added in the
Postgres migrations; this guard catches application-code mistakes everywhere,
including tests on SQLite.
"""

from __future__ import annotations

from sqlalchemy import event
from sqlalchemy.orm import Session

from credence.errors import CredenceError, ReasonCode
from credence.models import AuditEvent, JournalEntry, JournalTransaction

IMMUTABLE_TYPES = (JournalTransaction, JournalEntry, AuditEvent)


class ImmutableRecordError(CredenceError):
    def __init__(self, detail: str):
        super().__init__(ReasonCode.IMMUTABLE_RECORD, detail)


@event.listens_for(Session, "before_flush")
def _reject_mutations(session: Session, _ctx, _instances) -> None:
    for obj in session.dirty:
        if isinstance(obj, IMMUTABLE_TYPES) and session.is_modified(obj):
            raise ImmutableRecordError(f"update rejected on {type(obj).__name__}")
    for obj in session.deleted:
        if isinstance(obj, IMMUTABLE_TYPES):
            raise ImmutableRecordError(f"delete rejected on {type(obj).__name__}")

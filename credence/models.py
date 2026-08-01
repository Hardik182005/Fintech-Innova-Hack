"""Core relational model (initial subset — see docs/IMPLEMENTATION_PLAN.md for
the full table roadmap). Every tenant-owned table carries organization_id.

Financial and audit records are immutable: updates/deletes are rejected at the
ORM layer (see credence.immutability) and by the absence of any mutating API.
"""

from __future__ import annotations

import uuid
from datetime import UTC, datetime
from enum import StrEnum

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from credence.db import Base


def _id(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:20]}"


def utcnow() -> datetime:
    return datetime.now(UTC)


class Organization(Base):
    __tablename__ = "organizations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("org"))
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("usr"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    role: Mapped[str] = mapped_column(String(30), default="OWNER")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentStatus(StrEnum):
    ACTIVE = "ACTIVE"
    FROZEN = "FROZEN"
    REVOKED = "REVOKED"


class Agent(Base):
    __tablename__ = "agents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("agt"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    name: Mapped[str] = mapped_column(String(200))
    status: Mapped[str] = mapped_column(String(20), default=AgentStatus.ACTIVE)
    model_provider: Mapped[str] = mapped_column(String(100))
    model_name: Mapped[str] = mapped_column(String(200))
    model_version_hash: Mapped[str] = mapped_column(String(128))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AgentPassport(Base):
    __tablename__ = "agent_passports"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("psp"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    nonce: Mapped[str] = mapped_column(String(64), unique=True)
    key_version: Mapped[str] = mapped_column(String(40))
    issuer: Mapped[str] = mapped_column(String(100))
    payload_json: Mapped[str] = mapped_column(Text)
    signature_b64: Mapped[str] = mapped_column(Text)
    valid_from: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PassportRevocation(Base):
    __tablename__ = "passport_revocations"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("rvk"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    passport_nonce: Mapped[str] = mapped_column(String(64), default="")  # "" = all passports
    reason: Mapped[str] = mapped_column(String(500))
    revoked_by: Mapped[str] = mapped_column(String(32))
    revoked_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Vendor(Base):
    __tablename__ = "vendors"
    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    category: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")


# --- Ledger (double-entry, immutable) ---------------------------------------


class AccountType(StrEnum):
    ASSET = "ASSET"
    LIABILITY = "LIABILITY"
    INCOME = "INCOME"
    EXPENSE = "EXPENSE"


class LedgerAccount(Base):
    __tablename__ = "ledger_accounts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("acc"))
    code: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(20))
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    # Null organization_id = platform-level account (e.g. lender liquidity).
    organization_id: Mapped[str | None] = mapped_column(
        ForeignKey("organizations.id"), nullable=True, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("code", "organization_id", name="uq_account_code_org"),)


class JournalTransaction(Base):
    __tablename__ = "journal_transactions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("jtx"))
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    event_type: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(500), default="")
    reference_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    entries: Mapped[list[JournalEntry]] = relationship(back_populates="transaction")


class EntryDirection(StrEnum):
    DEBIT = "DEBIT"
    CREDIT = "CREDIT"


class JournalEntry(Base):
    __tablename__ = "journal_entries"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    journal_transaction_id: Mapped[str] = mapped_column(
        ForeignKey("journal_transactions.id"), index=True
    )
    account_id: Mapped[str] = mapped_column(ForeignKey("ledger_accounts.id"), index=True)
    direction: Mapped[str] = mapped_column(String(6))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    transaction: Mapped[JournalTransaction] = relationship(back_populates="entries")
    __table_args__ = (
        CheckConstraint("amount_minor > 0", name="ck_entry_positive"),
        CheckConstraint("direction IN ('DEBIT','CREDIT')", name="ck_entry_direction"),
    )


# --- Audit chain (append-only, hash-chained) --------------------------------


class AuditEvent(Base):
    __tablename__ = "audit_events"
    seq: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    id: Mapped[str] = mapped_column(String(32), unique=True, default=lambda: _id("aud"))
    organization_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    actor_type: Mapped[str] = mapped_column(String(20))  # USER | AGENT | SYSTEM
    actor_id: Mapped[str] = mapped_column(String(64))
    event_type: Mapped[str] = mapped_column(String(60), index=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    payload_json: Mapped[str] = mapped_column(Text)
    payload_hash: Mapped[str] = mapped_column(String(64))
    prev_hash: Mapped[str] = mapped_column(String(64))
    event_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (Index("ix_audit_org_seq", "organization_id", "seq"),)

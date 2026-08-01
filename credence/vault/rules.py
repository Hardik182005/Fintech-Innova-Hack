"""Deterministic vault spending rules (spec §5.5).

Pure functions: no I/O, no LLM involvement, fully unit-testable. The API layer
feeds these with database state; OPA independently re-evaluates the same
constraints as a second control (defense in depth). A proposal must pass BOTH
to reach execution.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta

from credence.errors import ReasonCode


@dataclass(frozen=True)
class VaultLimits:
    vault_id: str
    status: str  # CREATED | ACTIVE | SPENDING | FROZEN | EXPIRED | CLOSED ...
    agent_status: str  # ACTIVE | FROZEN | REVOKED
    currency: str
    total_limit_minor: int
    spent_minor: int
    per_transaction_limit_minor: int
    daily_limit_minor: int
    spent_today_minor: int
    allowed_vendor_ids: frozenset[str]
    vendor_purposes: dict[str, frozenset[str]] = field(default_factory=dict)
    expires_at: datetime | None = None
    transaction_count: int = 0
    max_transactions: int = 100
    # Velocity / anti-splitting controls
    velocity_window: timedelta = timedelta(minutes=10)
    velocity_max_transactions: int = 5


@dataclass(frozen=True)
class RecentSpend:
    vendor_id: str
    amount_minor: int
    at: datetime


@dataclass(frozen=True)
class SpendProposal:
    vault_id: str
    vendor_id: str
    amount_minor: int
    currency: str
    purpose_code: str
    idempotency_key: str
    at: datetime


@dataclass
class ProposalDecision:
    allow: bool
    reasons: list[ReasonCode]

    @property
    def reason_codes(self) -> list[str]:
        return [r.value for r in self.reasons]


SPENDABLE_STATUSES = {"ACTIVE", "SPENDING"}


def evaluate_proposal(
    vault: VaultLimits,
    proposal: SpendProposal,
    recent: list[RecentSpend] | None = None,
    now: datetime | None = None,
) -> ProposalDecision:
    """Evaluate every deterministic control. Collects ALL violated rules so
    audit events and the demo can show the complete reason set."""
    now = now or datetime.now(UTC)
    recent = recent or []
    reasons: list[ReasonCode] = []

    if not proposal.idempotency_key:
        reasons.append(ReasonCode.IDEMPOTENCY_KEY_REQUIRED)

    if vault.agent_status == "FROZEN":
        reasons.append(ReasonCode.AGENT_FROZEN)
    elif vault.agent_status == "REVOKED":
        reasons.append(ReasonCode.PASSPORT_REVOKED)

    if vault.status == "FROZEN":
        reasons.append(ReasonCode.VAULT_FROZEN)
    elif vault.status in ("CLOSED", "REPAID", "DEFAULTED"):
        reasons.append(ReasonCode.VAULT_CLOSED)
    elif vault.status == "EXPIRED":
        reasons.append(ReasonCode.VAULT_EXPIRED)
    elif vault.status not in SPENDABLE_STATUSES:
        reasons.append(ReasonCode.VAULT_CLOSED)

    if vault.expires_at is not None and vault.expires_at <= now:
        if ReasonCode.VAULT_EXPIRED not in reasons:
            reasons.append(ReasonCode.VAULT_EXPIRED)

    if proposal.currency != vault.currency:
        reasons.append(ReasonCode.CURRENCY_MISMATCH)

    if proposal.amount_minor <= 0:
        reasons.append(ReasonCode.TRANSACTION_LIMIT_EXCEEDED)
    else:
        if proposal.amount_minor > vault.per_transaction_limit_minor:
            reasons.append(ReasonCode.TRANSACTION_LIMIT_EXCEEDED)
        if vault.spent_minor + proposal.amount_minor > vault.total_limit_minor:
            reasons.append(ReasonCode.TASK_LIMIT_EXCEEDED)
        if vault.spent_today_minor + proposal.amount_minor > vault.daily_limit_minor:
            reasons.append(ReasonCode.DAILY_LIMIT_EXCEEDED)

    if proposal.vendor_id not in vault.allowed_vendor_ids:
        reasons.append(ReasonCode.VENDOR_NOT_ALLOWED)
    else:
        purposes = vault.vendor_purposes.get(proposal.vendor_id)
        if purposes is not None and proposal.purpose_code not in purposes:
            reasons.append(ReasonCode.PURPOSE_MISMATCH)

    if vault.transaction_count + 1 > vault.max_transactions:
        reasons.append(ReasonCode.TXN_COUNT_EXCEEDED)

    window_start = now - vault.velocity_window
    in_window = [r for r in recent if r.at >= window_start]
    if len(in_window) + 1 > vault.velocity_max_transactions:
        reasons.append(ReasonCode.VELOCITY_EXCEEDED)

    # Anti-splitting: several sub-limit spends to one vendor inside the window
    # that together exceed the per-transaction cap are treated as one large
    # attempted payment.
    same_vendor = [r for r in in_window if r.vendor_id == proposal.vendor_id]
    aggregated = sum(r.amount_minor for r in same_vendor) + max(proposal.amount_minor, 0)
    if len(same_vendor) >= 2 and aggregated > vault.per_transaction_limit_minor:
        reasons.append(ReasonCode.SPLIT_PATTERN_DETECTED)

    return ProposalDecision(allow=not reasons, reasons=reasons)

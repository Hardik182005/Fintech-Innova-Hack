"""Layer A — deterministic feature pipeline (spec §5.3A).

Features are computed exclusively from database records; nothing here reads
model output. Ratios are integer parts-per-million (ppm) for exactness.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from credence.finance_models import CreditVault, Repayment, RiskEvent
from credence.models import Agent

PPM = 1_000_000


def _ppm(numerator: int, denominator: int, default: int = 0) -> int:
    if denominator <= 0:
        return default
    return (numerator * PPM) // denominator


@dataclass(frozen=True)
class AgentHistoryFeatures:
    tasks_total: int
    tasks_succeeded: int
    task_success_rate_ppm: int
    repayments_total: int
    repaid_in_full: int
    repayment_rate_ppm: int
    total_defaulted_minor: int
    current_outstanding_minor: int
    policy_violation_count: int
    blocked_spend_attempts: int
    identity_age_days: int
    is_first_credit: bool

    def as_dict(self) -> dict:
        return asdict(self)


def compute_features(
    session: Session, agent_id: str, now: datetime | None = None
) -> AgentHistoryFeatures:
    now = now or datetime.now(UTC)

    vaults = list(
        session.execute(select(CreditVault).where(CreditVault.agent_id == agent_id)).scalars()
    )
    terminal = [
        v for v in vaults if v.status in ("REPAID", "PARTIALLY_REPAID", "DEFAULTED", "CLOSED")
    ]
    succeeded = [v for v in terminal if v.status in ("REPAID", "CLOSED")]

    repayments = list(
        session.execute(
            select(Repayment).where(Repayment.vault_id.in_([v.id for v in vaults] or [""]))
        ).scalars()
    )
    repaid_full = sum(1 for r in repayments if r.kind == "WATERFALL" and r.loss_minor == 0)
    defaulted_minor = sum(r.loss_minor for r in repayments)

    outstanding = sum(
        v.principal_outstanding_minor
        for v in vaults
        if v.status not in ("REPAID", "CLOSED", "DEFAULTED")
    )

    violations = session.execute(
        select(func.count(RiskEvent.id)).where(
            RiskEvent.subject_id == agent_id,
            RiskEvent.event_type == "POLICY_VIOLATION",
        )
    ).scalar_one()
    blocked = session.execute(
        select(func.count(RiskEvent.id)).where(
            RiskEvent.subject_id == agent_id,
            RiskEvent.event_type == "SPEND_BLOCKED",
        )
    ).scalar_one()

    agent = session.get(Agent, agent_id)
    created = agent.created_at if agent else now
    if created.tzinfo is None:
        created = created.replace(tzinfo=UTC)
    age_days = max(0, (now - created).days)

    return AgentHistoryFeatures(
        tasks_total=len(terminal),
        tasks_succeeded=len(succeeded),
        task_success_rate_ppm=_ppm(len(succeeded), len(terminal)),
        repayments_total=len(repayments),
        repaid_in_full=repaid_full,
        repayment_rate_ppm=_ppm(repaid_full, len(repayments)),
        total_defaulted_minor=defaulted_minor,
        current_outstanding_minor=outstanding,
        policy_violation_count=int(violations),
        blocked_spend_attempts=int(blocked),
        identity_age_days=age_days,
        is_first_credit=len(vaults) == 0,
    )

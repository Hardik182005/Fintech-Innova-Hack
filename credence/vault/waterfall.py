"""Repayment and recovery waterfalls (spec §5.4).

Pure, deterministic, integer-minor-unit arithmetic. The ordering is fixed:

Repayment (revenue received):
  1. outstanding principal
  2. lender/protocol fee
  3. replenish any first-loss/sponsor reserve that was drawn
  4. remainder released to the owner

Recovery (task failed / revenue insufficient):
  1. sweep unspent vault balance
  2. apply revenue received so far
  3. draw the sponsor/owner reserve, capped at the signed authorization
  4. remaining shortfall is recorded as simulated loss (bounded, visible)
"""

from __future__ import annotations

from dataclasses import dataclass, field

from credence.money import require_non_negative


@dataclass(frozen=True)
class WaterfallAllocation:
    step: str
    amount_minor: int


@dataclass
class WaterfallResult:
    allocations: list[WaterfallAllocation] = field(default_factory=list)
    principal_repaid_minor: int = 0
    fee_paid_minor: int = 0
    reserve_replenished_minor: int = 0
    owner_released_minor: int = 0
    principal_outstanding_minor: int = 0
    fee_outstanding_minor: int = 0

    @property
    def total_allocated_minor(self) -> int:
        return sum(a.amount_minor for a in self.allocations)


def run_repayment_waterfall(
    *,
    revenue_minor: int,
    principal_outstanding_minor: int,
    fee_due_minor: int,
    reserve_drawn_minor: int = 0,
) -> WaterfallResult:
    """Allocate collected task revenue in the mandatory order. Conservation:
    every minor unit of revenue is allocated exactly once."""
    remaining = require_non_negative(revenue_minor, "revenue")
    require_non_negative(principal_outstanding_minor, "principal outstanding")
    require_non_negative(fee_due_minor, "fee due")
    require_non_negative(reserve_drawn_minor, "reserve drawn")

    result = WaterfallResult()

    principal_pay = min(remaining, principal_outstanding_minor)
    if principal_pay:
        result.allocations.append(WaterfallAllocation("REPAY_PRINCIPAL", principal_pay))
    remaining -= principal_pay
    result.principal_repaid_minor = principal_pay
    result.principal_outstanding_minor = principal_outstanding_minor - principal_pay

    fee_pay = min(remaining, fee_due_minor)
    if fee_pay:
        result.allocations.append(WaterfallAllocation("PAY_FEE", fee_pay))
    remaining -= fee_pay
    result.fee_paid_minor = fee_pay
    result.fee_outstanding_minor = fee_due_minor - fee_pay

    reserve_pay = min(remaining, reserve_drawn_minor)
    if reserve_pay:
        result.allocations.append(WaterfallAllocation("REPLENISH_RESERVE", reserve_pay))
    remaining -= reserve_pay
    result.reserve_replenished_minor = reserve_pay

    if remaining:
        result.allocations.append(WaterfallAllocation("RELEASE_TO_OWNER", remaining))
    result.owner_released_minor = remaining
    return result


@dataclass
class RecoveryResult:
    swept_unspent_minor: int = 0
    revenue_applied_minor: int = 0
    reserve_drawn_minor: int = 0
    simulated_loss_minor: int = 0
    recovered_total_minor: int = 0
    steps: list[WaterfallAllocation] = field(default_factory=list)


def run_recovery_waterfall(
    *,
    amount_owed_minor: int,
    unspent_vault_minor: int,
    revenue_received_minor: int,
    reserve_available_minor: int,
    reserve_cap_minor: int,
) -> RecoveryResult:
    """Bounded recovery when a task fails. The reserve draw never exceeds the
    signed authorization cap; any remainder is explicit simulated loss."""
    owed = require_non_negative(amount_owed_minor, "amount owed")
    require_non_negative(unspent_vault_minor, "unspent vault balance")
    require_non_negative(revenue_received_minor, "revenue received")
    require_non_negative(reserve_available_minor, "reserve available")
    require_non_negative(reserve_cap_minor, "reserve cap")

    result = RecoveryResult()

    sweep = min(owed, unspent_vault_minor)
    if sweep:
        result.steps.append(WaterfallAllocation("SWEEP_UNSPENT", sweep))
    owed -= sweep
    result.swept_unspent_minor = sweep

    revenue = min(owed, revenue_received_minor)
    if revenue:
        result.steps.append(WaterfallAllocation("APPLY_REVENUE", revenue))
    owed -= revenue
    result.revenue_applied_minor = revenue

    reserve = min(owed, reserve_available_minor, reserve_cap_minor)
    if reserve:
        result.steps.append(WaterfallAllocation("DRAW_RESERVE_CAPPED", reserve))
    owed -= reserve
    result.reserve_drawn_minor = reserve

    result.simulated_loss_minor = owed
    if owed:
        result.steps.append(WaterfallAllocation("SIMULATED_LOSS", owed))
    result.recovered_total_minor = sweep + revenue + reserve
    return result

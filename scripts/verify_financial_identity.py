"""Independent recomputation of the repayment and recovery waterfalls.

This deliberately does NOT import credence.vault.waterfall. The arithmetic
below is written a second time, from the spec's ordering in §5.4, so that
agreement between the two is evidence rather than tautology. Importing the
implementation and comparing it to itself would prove nothing.

Integer minor units throughout. No float appears anywhere in this file: a
float would make the conservation identity approximately true, which for money
is the same as false.

Run:  python scripts/verify_financial_identity.py
Exit: 0 if every case and every property holds, 1 otherwise.
"""

from __future__ import annotations

import random
import sys
from dataclasses import dataclass
from pathlib import Path

# Runnable as `python scripts/verify_financial_identity.py` from the repo root
# without an editable install, so the check is one command for a reviewer.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

# --------------------------------------------------------------- live records

# Captured from the deployed GCP sandbox on 2 August 2026, read back from
# GET /v1/vaults/{id} and the repayment records the API returned. These are
# observations, not fixtures: nothing here was computed by this script.


@dataclass(frozen=True)
class LiveRepayment:
    repayment_id: str
    scenario: str
    revenue_minor: int
    principal_outstanding_before_minor: int
    fee_due_before_minor: int
    reserve_drawn_before_minor: int
    # As reported by the API:
    principal_minor: int
    fee_minor: int
    reserve_minor: int
    owner_minor: int


@dataclass(frozen=True)
class LiveRecovery:
    repayment_id: str
    scenario: str
    amount_owed_minor: int
    unspent_vault_minor: int
    revenue_received_minor: int
    reserve_available_minor: int
    reserve_cap_minor: int
    # As reported by the API:
    swept_minor: int
    reserve_drawn_minor: int
    loss_minor: int


LIVE_REPAYMENTS = (
    LiveRepayment(
        repayment_id="rpy_9ffbdf6100ea44e991c9",
        scenario="A — successful task, full repayment",
        revenue_minor=180_000,
        principal_outstanding_before_minor=100_000,
        fee_due_before_minor=5_000,
        reserve_drawn_before_minor=0,
        principal_minor=100_000,
        fee_minor=5_000,
        reserve_minor=0,
        owner_minor=75_000,
    ),
)

LIVE_RECOVERIES = (
    LiveRecovery(
        repayment_id="rpy_6353c0a5966142f79385",
        scenario="F — task failure, bounded recovery",
        amount_owed_minor=100_000,
        unspent_vault_minor=40_000,
        revenue_received_minor=0,
        reserve_available_minor=25_000,
        reserve_cap_minor=25_000,
        swept_minor=40_000,
        reserve_drawn_minor=25_000,
        loss_minor=35_000,
    ),
)


# ------------------------------------------------- the second implementation


def repay(revenue: int, principal: int, fee: int, reserve_drawn: int) -> dict[str, int]:
    """Spec §5.4 repayment order: principal, then fee, then replenish any drawn
    reserve, then whatever survives goes to the owner."""
    for name, v in (
        ("revenue", revenue),
        ("principal", principal),
        ("fee", fee),
        ("reserve_drawn", reserve_drawn),
    ):
        if v < 0:
            raise ValueError(f"{name} must not be negative")

    left = revenue
    to_principal = principal if left >= principal else left
    left = left - to_principal
    to_fee = fee if left >= fee else left
    left = left - to_fee
    to_reserve = reserve_drawn if left >= reserve_drawn else left
    left = left - to_reserve
    return {
        "principal": to_principal,
        "fee": to_fee,
        "reserve": to_reserve,
        "owner": left,
        "principal_outstanding": principal - to_principal,
        "fee_outstanding": fee - to_fee,
    }


def recover(
    owed: int, unspent: int, revenue_received: int, reserve_available: int, reserve_cap: int
) -> dict[str, int]:
    """Spec §5.4 recovery order: sweep the unspent balance, apply revenue
    already collected, draw the reserve up to its signed cap, and record the
    remainder as an explicit loss."""
    for name, v in (
        ("owed", owed),
        ("unspent", unspent),
        ("revenue_received", revenue_received),
        ("reserve_available", reserve_available),
        ("reserve_cap", reserve_cap),
    ):
        if v < 0:
            raise ValueError(f"{name} must not be negative")

    swept = unspent if owed >= unspent else owed
    owed = owed - swept
    applied = revenue_received if owed >= revenue_received else owed
    owed = owed - applied
    ceiling = reserve_available if reserve_available <= reserve_cap else reserve_cap
    drawn = ceiling if owed >= ceiling else owed
    owed = owed - drawn
    return {
        "swept": swept,
        "revenue_applied": applied,
        "reserve_drawn": drawn,
        "loss": owed,
        "recovered": swept + applied + drawn,
    }


# ----------------------------------------------------------------- reporting

FAILURES: list[str] = []


def check(label: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"  [{status}] {label}{(' — ' + detail) if detail else ''}")
    if not condition:
        FAILURES.append(label)


# ---------------------------------------------------------------- live cases


def verify_live_repayments() -> None:
    print("\nLive repayment records — independent recomputation")
    for r in LIVE_REPAYMENTS:
        print(f"\n {r.repayment_id}  ({r.scenario})")
        mine = repay(
            r.revenue_minor,
            r.principal_outstanding_before_minor,
            r.fee_due_before_minor,
            r.reserve_drawn_before_minor,
        )
        check(
            "principal recovered agrees",
            mine["principal"] == r.principal_minor,
            f"recomputed {mine['principal']} vs reported {r.principal_minor}",
        )
        check(
            "credit fee agrees",
            mine["fee"] == r.fee_minor,
            f"recomputed {mine['fee']} vs reported {r.fee_minor}",
        )
        check(
            "reserve replenishment agrees",
            mine["reserve"] == r.reserve_minor,
            f"recomputed {mine['reserve']} vs reported {r.reserve_minor}",
        )
        check(
            "owner proceeds agree",
            mine["owner"] == r.owner_minor,
            f"recomputed {mine['owner']} vs reported {r.owner_minor}",
        )

        total = r.principal_minor + r.fee_minor + r.reserve_minor + r.owner_minor
        check(
            "conservation: revenue == principal + fee + reserve + owner",
            total == r.revenue_minor,
            f"{r.revenue_minor} == {r.principal_minor} + {r.fee_minor} + "
            f"{r.reserve_minor} + {r.owner_minor}",
        )


def verify_live_recoveries() -> None:
    print("\nLive recovery records — independent recomputation")
    for r in LIVE_RECOVERIES:
        print(f"\n {r.repayment_id}  ({r.scenario})")
        mine = recover(
            r.amount_owed_minor,
            r.unspent_vault_minor,
            r.revenue_received_minor,
            r.reserve_available_minor,
            r.reserve_cap_minor,
        )
        check(
            "swept unspent agrees",
            mine["swept"] == r.swept_minor,
            f"recomputed {mine['swept']} vs reported {r.swept_minor}",
        )
        check(
            "reserve draw agrees",
            mine["reserve_drawn"] == r.reserve_drawn_minor,
            f"recomputed {mine['reserve_drawn']} vs reported {r.reserve_drawn_minor}",
        )
        check(
            "simulated loss agrees",
            mine["loss"] == r.loss_minor,
            f"recomputed {mine['loss']} vs reported {r.loss_minor}",
        )

        total = r.swept_minor + r.reserve_drawn_minor + r.loss_minor
        check(
            "conservation: owed == swept + reserve drawn + loss",
            total == r.amount_owed_minor,
            f"{r.amount_owed_minor} == {r.swept_minor} + {r.reserve_drawn_minor} "
            f"+ {r.loss_minor}",
        )
        check(
            "loss is bounded by the amount owed",
            r.loss_minor <= r.amount_owed_minor,
        )


# ------------------------------------------------------------- cross-check


def cross_check_against_production(trials: int = 20_000, seed: int = 20260802) -> None:
    """The two implementations must agree on random inputs, including the
    boundaries where a bracket flips: revenue exactly equal to principal,
    reserve exactly at its cap, zero everywhere."""
    from credence.vault.waterfall import run_recovery_waterfall, run_repayment_waterfall

    print(f"\nCross-check against the production implementation ({trials:,} random cases)")
    rng = random.Random(seed)
    interesting = [0, 1, 5_000, 100_000, 180_000]

    repay_mismatch = 0
    for _ in range(trials):
        pick = lambda: (  # noqa: E731
            rng.choice(interesting) if rng.random() < 0.4 else rng.randrange(0, 500_000)
        )
        revenue, principal, fee, drawn = pick(), pick(), pick(), pick()
        mine = repay(revenue, principal, fee, drawn)
        theirs = run_repayment_waterfall(
            revenue_minor=revenue,
            principal_outstanding_minor=principal,
            fee_due_minor=fee,
            reserve_drawn_minor=drawn,
        )
        if (
            mine["principal"] != theirs.principal_repaid_minor
            or mine["fee"] != theirs.fee_paid_minor
            or mine["reserve"] != theirs.reserve_replenished_minor
            or mine["owner"] != theirs.owner_released_minor
            or mine["principal_outstanding"] != theirs.principal_outstanding_minor
            or mine["fee_outstanding"] != theirs.fee_outstanding_minor
        ):
            repay_mismatch += 1
        # Conservation must hold for arbitrary inputs, not just the live ones.
        if (
            theirs.principal_repaid_minor
            + theirs.fee_paid_minor
            + theirs.reserve_replenished_minor
            + theirs.owner_released_minor
            != revenue
        ):
            repay_mismatch += 1

    check("repayment: two implementations agree on every case", repay_mismatch == 0,
          f"{repay_mismatch} mismatches")

    recover_mismatch = 0
    for _ in range(trials):
        pick = lambda: (  # noqa: E731
            rng.choice(interesting) if rng.random() < 0.4 else rng.randrange(0, 500_000)
        )
        owed, unspent, revenue, avail, cap = pick(), pick(), pick(), pick(), pick()
        mine = recover(owed, unspent, revenue, avail, cap)
        theirs = run_recovery_waterfall(
            amount_owed_minor=owed,
            unspent_vault_minor=unspent,
            revenue_received_minor=revenue,
            reserve_available_minor=avail,
            reserve_cap_minor=cap,
        )
        if (
            mine["swept"] != theirs.swept_unspent_minor
            or mine["revenue_applied"] != theirs.revenue_applied_minor
            or mine["reserve_drawn"] != theirs.reserve_drawn_minor
            or mine["loss"] != theirs.simulated_loss_minor
        ):
            recover_mismatch += 1
        if theirs.recovered_total_minor + theirs.simulated_loss_minor != owed:
            recover_mismatch += 1
        # The cap is the whole point of the control: it must never be exceeded.
        if theirs.reserve_drawn_minor > cap:
            recover_mismatch += 1

    check("recovery: two implementations agree, and the cap is never exceeded",
          recover_mismatch == 0, f"{recover_mismatch} mismatches")


def main() -> int:
    print("Independent financial recomputation — integer minor units only")
    verify_live_repayments()
    verify_live_recoveries()
    cross_check_against_production()

    print()
    if FAILURES:
        print(f"{len(FAILURES)} check(s) FAILED:")
        for f in FAILURES:
            print(f"  - {f}")
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

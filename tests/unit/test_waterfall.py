import pytest
from hypothesis import given
from hypothesis import strategies as st

from credence.money import NegativeAmountError
from credence.vault import run_recovery_waterfall, run_repayment_waterfall

amounts = st.integers(min_value=0, max_value=10**12)


def test_scenario_a_happy_path():
    """₹1,800 revenue against ₹1,000 principal + ₹50 fee: owner gets remainder."""
    result = run_repayment_waterfall(
        revenue_minor=180000, principal_outstanding_minor=100000, fee_due_minor=5000
    )
    assert result.principal_repaid_minor == 100000
    assert result.fee_paid_minor == 5000
    assert result.owner_released_minor == 75000
    assert result.principal_outstanding_minor == 0
    assert result.total_allocated_minor == 180000
    assert [a.step for a in result.allocations] == [
        "REPAY_PRINCIPAL",
        "PAY_FEE",
        "RELEASE_TO_OWNER",
    ]


def test_partial_revenue_pays_principal_first():
    result = run_repayment_waterfall(
        revenue_minor=60000, principal_outstanding_minor=100000, fee_due_minor=5000
    )
    assert result.principal_repaid_minor == 60000
    assert result.fee_paid_minor == 0
    assert result.owner_released_minor == 0
    assert result.principal_outstanding_minor == 40000
    assert result.fee_outstanding_minor == 5000


def test_reserve_replenished_before_owner():
    result = run_repayment_waterfall(
        revenue_minor=120000,
        principal_outstanding_minor=100000,
        fee_due_minor=5000,
        reserve_drawn_minor=10000,
    )
    assert result.reserve_replenished_minor == 10000
    assert result.owner_released_minor == 5000


def test_negative_inputs_rejected():
    with pytest.raises(NegativeAmountError):
        run_repayment_waterfall(
            revenue_minor=-1, principal_outstanding_minor=0, fee_due_minor=0
        )


@given(revenue=amounts, principal=amounts, fee=amounts, reserve=amounts)
def test_property_revenue_conservation(revenue, principal, fee, reserve):
    """Every minor unit of revenue is allocated exactly once, owner is last."""
    result = run_repayment_waterfall(
        revenue_minor=revenue,
        principal_outstanding_minor=principal,
        fee_due_minor=fee,
        reserve_drawn_minor=reserve,
    )
    assert result.total_allocated_minor == revenue
    assert result.principal_repaid_minor <= principal
    assert result.fee_paid_minor <= fee
    assert result.reserve_replenished_minor <= reserve
    # Owner receives nothing until principal, fee, and reserve are fully covered.
    if result.owner_released_minor > 0:
        assert result.principal_outstanding_minor == 0
        assert result.fee_outstanding_minor == 0
        assert result.reserve_replenished_minor == reserve


def test_scenario_f_recovery_bounded():
    """Task fails owing ₹1,050; partial sweep + revenue + capped reserve; the
    rest is explicit simulated loss."""
    result = run_recovery_waterfall(
        amount_owed_minor=105000,
        unspent_vault_minor=30000,
        revenue_received_minor=20000,
        reserve_available_minor=100000,
        reserve_cap_minor=25000,
    )
    assert result.swept_unspent_minor == 30000
    assert result.revenue_applied_minor == 20000
    assert result.reserve_drawn_minor == 25000  # capped despite larger reserve
    assert result.simulated_loss_minor == 30000
    assert result.recovered_total_minor == 75000


def test_recovery_full_when_funds_sufficient():
    result = run_recovery_waterfall(
        amount_owed_minor=50000,
        unspent_vault_minor=60000,
        revenue_received_minor=0,
        reserve_available_minor=0,
        reserve_cap_minor=0,
    )
    assert result.swept_unspent_minor == 50000
    assert result.simulated_loss_minor == 0


@given(owed=amounts, unspent=amounts, revenue=amounts, reserve=amounts, cap=amounts)
def test_property_recovery_never_exceeds_authorization(owed, unspent, revenue, reserve, cap):
    result = run_recovery_waterfall(
        amount_owed_minor=owed,
        unspent_vault_minor=unspent,
        revenue_received_minor=revenue,
        reserve_available_minor=reserve,
        reserve_cap_minor=cap,
    )
    # The reserve draw never exceeds the signed cap or availability.
    assert result.reserve_drawn_minor <= min(reserve, cap)
    # Recovery + loss exactly covers what was owed.
    assert result.recovered_total_minor + result.simulated_loss_minor == owed

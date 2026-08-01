from datetime import UTC, datetime, timedelta

from credence.errors import ReasonCode
from credence.vault import RecentSpend, VaultLimits, evaluate_proposal
from credence.vault.rules import SpendProposal

NOW = datetime(2026, 8, 1, 12, 0, tzinfo=UTC)


def make_vault(**overrides) -> VaultLimits:
    kwargs = dict(
        vault_id="vlt_789",
        status="ACTIVE",
        agent_status="ACTIVE",
        currency="INR",
        total_limit_minor=100000,  # ₹1,000
        spent_minor=0,
        per_transaction_limit_minor=60000,  # ₹600
        daily_limit_minor=100000,
        spent_today_minor=0,
        allowed_vendor_ids=frozenset({"vendor_gcp_compute", "vendor_image_api"}),
        vendor_purposes={"vendor_gcp_compute": frozenset({"COMPUTE"})},
        expires_at=NOW + timedelta(days=1),
    )
    kwargs.update(overrides)
    return VaultLimits(**kwargs)


def make_proposal(**overrides) -> SpendProposal:
    kwargs = dict(
        vault_id="vlt_789",
        vendor_id="vendor_gcp_compute",
        amount_minor=43000,
        currency="INR",
        purpose_code="COMPUTE",
        idempotency_key="idem-1",
        at=NOW,
    )
    kwargs.update(overrides)
    return SpendProposal(**kwargs)


def test_valid_spend_allowed():
    decision = evaluate_proposal(make_vault(), make_proposal(), now=NOW)
    assert decision.allow, decision.reason_codes


def test_scenario_b_overspend_blocked():
    # ₹2,000 against a ₹1,000 limit
    decision = evaluate_proposal(make_vault(), make_proposal(amount_minor=200000), now=NOW)
    assert not decision.allow
    assert ReasonCode.TRANSACTION_LIMIT_EXCEEDED in decision.reasons
    assert ReasonCode.TASK_LIMIT_EXCEEDED in decision.reasons


def test_task_limit_counts_prior_spend():
    vault = make_vault(spent_minor=80000)
    decision = evaluate_proposal(vault, make_proposal(amount_minor=30000), now=NOW)
    assert not decision.allow
    assert ReasonCode.TASK_LIMIT_EXCEEDED in decision.reasons


def test_scenario_c_unapproved_vendor_blocked():
    decision = evaluate_proposal(
        make_vault(), make_proposal(vendor_id="personal_wallet_x"), now=NOW
    )
    assert not decision.allow
    assert ReasonCode.VENDOR_NOT_ALLOWED in decision.reasons


def test_approved_vendor_wrong_purpose_blocked():
    decision = evaluate_proposal(make_vault(), make_proposal(purpose_code="ENTERTAINMENT"), now=NOW)
    assert not decision.allow
    assert ReasonCode.PURPOSE_MISMATCH in decision.reasons


def test_scenario_d_split_payments_detected():
    # Five rapid ₹200 payments to dodge the ₹600 per-transaction cap after
    # two similar recent spends.
    recent = [
        RecentSpend("vendor_gcp_compute", 25000, NOW - timedelta(minutes=2)),
        RecentSpend("vendor_gcp_compute", 25000, NOW - timedelta(minutes=1)),
    ]
    decision = evaluate_proposal(
        make_vault(), make_proposal(amount_minor=25000), recent=recent, now=NOW
    )
    assert not decision.allow
    assert ReasonCode.SPLIT_PATTERN_DETECTED in decision.reasons


def test_velocity_limit():
    recent = [
        RecentSpend("vendor_image_api", 1000, NOW - timedelta(minutes=i)) for i in range(1, 6)
    ]
    decision = evaluate_proposal(
        make_vault(), make_proposal(amount_minor=1000), recent=recent, now=NOW
    )
    assert not decision.allow
    assert ReasonCode.VELOCITY_EXCEEDED in decision.reasons


def test_scenario_e_frozen_agent_blocked():
    decision = evaluate_proposal(make_vault(agent_status="FROZEN"), make_proposal(), now=NOW)
    assert not decision.allow
    assert ReasonCode.AGENT_FROZEN in decision.reasons


def test_revoked_agent_blocked():
    decision = evaluate_proposal(make_vault(agent_status="REVOKED"), make_proposal(), now=NOW)
    assert not decision.allow
    assert ReasonCode.PASSPORT_REVOKED in decision.reasons


def test_frozen_vault_blocked():
    decision = evaluate_proposal(make_vault(status="FROZEN"), make_proposal(), now=NOW)
    assert not decision.allow
    assert ReasonCode.VAULT_FROZEN in decision.reasons


def test_expired_vault_blocked():
    vault = make_vault(expires_at=NOW - timedelta(minutes=1))
    decision = evaluate_proposal(vault, make_proposal(), now=NOW)
    assert not decision.allow
    assert ReasonCode.VAULT_EXPIRED in decision.reasons


def test_currency_mismatch_blocked():
    decision = evaluate_proposal(make_vault(), make_proposal(currency="USD"), now=NOW)
    assert not decision.allow
    assert ReasonCode.CURRENCY_MISMATCH in decision.reasons


def test_missing_idempotency_key_blocked():
    decision = evaluate_proposal(make_vault(), make_proposal(idempotency_key=""), now=NOW)
    assert not decision.allow
    assert ReasonCode.IDEMPOTENCY_KEY_REQUIRED in decision.reasons


def test_daily_limit_blocked():
    vault = make_vault(daily_limit_minor=50000, spent_today_minor=40000)
    decision = evaluate_proposal(vault, make_proposal(amount_minor=20000), now=NOW)
    assert not decision.allow
    assert ReasonCode.DAILY_LIMIT_EXCEEDED in decision.reasons


def test_txn_count_limit_blocked():
    vault = make_vault(transaction_count=100, max_transactions=100)
    decision = evaluate_proposal(vault, make_proposal(), now=NOW)
    assert not decision.allow
    assert ReasonCode.TXN_COUNT_EXCEEDED in decision.reasons

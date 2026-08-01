"""Test vectors for the transaction policy. The same vectors back the Rego
tests (credit_test.rego) so the local evaluator and OPA stay in sync."""

from credence.policy import evaluate_transaction_policy

BASE_INPUT = {
    "identity": {"valid": True, "expires_at": 2000},
    "now": 1000,
    "agent": {"status": "ACTIVE"},
    "vault": {
        "status": "ACTIVE",
        "allowed_vendor_ids": ["vendor_gcp_compute"],
        "per_transaction_limit_minor": 60000,
        "spent_minor": 0,
        "total_limit_minor": 100000,
    },
    "vendor": {"id": "vendor_gcp_compute"},
    "transaction": {"amount_minor": 43000},
    "risk": {"policy_status": "PASS"},
}


def with_overrides(**paths):
    import copy

    doc = copy.deepcopy(BASE_INPUT)
    for path, value in paths.items():
        parts = path.split("__")
        cur = doc
        for p in parts[:-1]:
            cur = cur.setdefault(p, {})
        cur[parts[-1]] = value
    return doc


def test_valid_transaction_allowed():
    decision = evaluate_transaction_policy(BASE_INPUT)
    assert decision.allow, decision.deny


def test_empty_input_denies_everything():
    decision = evaluate_transaction_policy({})
    assert not decision.allow
    assert "identity_invalid" in decision.deny


def test_invalid_identity_denied():
    decision = evaluate_transaction_policy(with_overrides(identity__valid=False))
    assert not decision.allow
    assert "identity_invalid" in decision.deny


def test_expired_authorization_denied():
    decision = evaluate_transaction_policy(with_overrides(identity__expires_at=500))
    assert not decision.allow
    assert "authorization_expired" in decision.deny


def test_frozen_agent_denied():
    decision = evaluate_transaction_policy(with_overrides(agent__status="FROZEN"))
    assert not decision.allow
    assert "agent_not_active" in decision.deny


def test_vendor_not_allowed_denied():
    decision = evaluate_transaction_policy(with_overrides(vendor__id="evil_wallet"))
    assert not decision.allow
    assert "vendor_not_allowed" in decision.deny


def test_transaction_limit_denied():
    decision = evaluate_transaction_policy(with_overrides(transaction__amount_minor=200000))
    assert not decision.allow
    assert "transaction_limit" in decision.deny
    assert "task_limit" in decision.deny


def test_task_limit_with_prior_spend_denied():
    decision = evaluate_transaction_policy(with_overrides(vault__spent_minor=80000))
    assert not decision.allow
    assert "task_limit" in decision.deny


def test_risk_status_must_pass():
    decision = evaluate_transaction_policy(with_overrides(risk__policy_status="REVIEW"))
    assert not decision.allow
    assert "risk_status_not_pass" in decision.deny


def test_missing_amounts_fail_closed():
    doc = with_overrides()
    del doc["transaction"]
    decision = evaluate_transaction_policy(doc)
    assert not decision.allow
    assert "amounts_unknown" in decision.deny


def test_model_cannot_inject_policy_override():
    """A model-authored field like 'override' or extra approval flag is ignored."""
    doc = with_overrides(
        risk__policy_status="FAIL",
    )
    doc["llm_recommendation"] = {"approve": True, "override_policy": True}
    decision = evaluate_transaction_policy(doc)
    assert not decision.allow

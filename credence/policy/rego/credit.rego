package credence.credit

# Transaction spending policy. Semantics are mirrored 1:1 by
# credence/policy/engine.py (local fail-closed evaluator); keep both in sync
# and covered by the same test vectors (tests/unit/test_policy.py and
# credit_test.rego).

import rego.v1

default allow := false

deny contains "identity_invalid" if {
	input.identity.valid != true
}

deny contains "authorization_expired" if {
	input.identity.expires_at <= input.now
}

deny contains "agent_not_active" if {
	input.agent.status != "ACTIVE"
}

deny contains "vault_not_spendable" if {
	not input.vault.status in {"ACTIVE", "SPENDING"}
}

deny contains "vendor_not_allowed" if {
	not input.vendor.id in input.vault.allowed_vendor_ids
}

deny contains "transaction_limit" if {
	input.transaction.amount_minor > input.vault.per_transaction_limit_minor
}

deny contains "task_limit" if {
	input.vault.spent_minor + input.transaction.amount_minor > input.vault.total_limit_minor
}

deny contains "risk_status_not_pass" if {
	input.risk.policy_status != "PASS"
}

allow if {
	count(deny) == 0
}

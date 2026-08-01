package credence.credit

# Transaction spending policy. Semantics are mirrored 1:1 by
# credence/policy/engine.py (local fail-closed evaluator); keep both in sync
# and covered by the same test vectors (tests/unit/test_policy.py and
# credit_test.rego).
#
# Every deny rule is written in negated form (`not <field> == <expected>`)
# so that MISSING or malformed input fires the deny rule instead of silently
# skipping it. A plain `input.x != y` comparison is undefined when `input.x`
# is absent and the rule would not fire — that is fail-open and forbidden.

import rego.v1

default allow := false

deny contains "identity_invalid" if {
	not input.identity.valid == true
}

deny contains "authorization_expired" if {
	not input.identity.expires_at > input.now
}

deny contains "agent_not_active" if {
	not input.agent.status == "ACTIVE"
}

deny contains "vault_not_spendable" if {
	not vault_spendable
}

vault_spendable if input.vault.status in {"ACTIVE", "SPENDING"}

deny contains "vendor_not_allowed" if {
	not input.vendor.id in input.vault.allowed_vendor_ids
}

deny contains "amount_not_positive" if {
	not input.transaction.amount_minor > 0
}

deny contains "transaction_limit" if {
	not input.transaction.amount_minor <= input.vault.per_transaction_limit_minor
}

deny contains "task_limit" if {
	not within_task_limit
}

within_task_limit if {
	input.vault.spent_minor + input.transaction.amount_minor <= input.vault.total_limit_minor
}

deny contains "risk_status_not_pass" if {
	not input.risk.policy_status == "PASS"
}

allow if {
	count(deny) == 0
}

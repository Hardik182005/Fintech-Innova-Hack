package credence.credit_test

# Mirrors tests/unit/test_policy.py — keep the two vector sets identical.

import rego.v1

import data.credence.credit

base_input := {
	"identity": {"valid": true, "expires_at": 2000},
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

test_valid_transaction_allowed if {
	credit.allow with input as base_input
}

test_invalid_identity_denied if {
	not credit.allow with input as object.union(base_input, {"identity": {"valid": false, "expires_at": 2000}})
	"identity_invalid" in credit.deny with input as object.union(base_input, {"identity": {"valid": false, "expires_at": 2000}})
}

test_expired_authorization_denied if {
	not credit.allow with input as object.union(base_input, {"identity": {"valid": true, "expires_at": 500}})
}

test_frozen_agent_denied if {
	not credit.allow with input as object.union(base_input, {"agent": {"status": "FROZEN"}})
}

test_vendor_not_allowed_denied if {
	not credit.allow with input as object.union(base_input, {"vendor": {"id": "evil_wallet"}})
}

test_transaction_limit_denied if {
	not credit.allow with input as object.union(base_input, {"transaction": {"amount_minor": 200000}})
}

test_task_limit_denied if {
	not credit.allow with input as object.union(base_input, {"vault": object.union(base_input.vault, {"spent_minor": 80000})})
}

test_risk_status_must_pass if {
	not credit.allow with input as object.union(base_input, {"risk": {"policy_status": "REVIEW"}})
}

test_empty_input_denied if {
	not credit.allow with input as {}
}

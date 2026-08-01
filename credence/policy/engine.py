"""Deterministic policy evaluation.

The authoritative runtime path calls OPA over HTTP with the Rego bundle in
credence/policy/rego/. This module provides:

1. the exact input-document shape shared with OPA, and
2. a fail-closed local evaluator with identical semantics, used when the
   deployment runs the degraded/CPU profile and in unit tests.

If OPA is configured and unreachable, callers must NOT fall back to this
evaluator silently — they must deny with POLICY_ENGINE_UNAVAILABLE. The local
evaluator is selected only by explicit configuration (LOCAL_DEV mode).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

# Bumped whenever credit.rego and this mirror change semantics together, so a
# stored decision can always be traced back to the rules that produced it.
POLICY_VERSION = "credence.credit/v1"


@dataclass
class PolicyDecision:
    allow: bool
    deny: list[str] = field(default_factory=list)
    engine: str = "local"
    policy_version: str = POLICY_VERSION


def _get(doc: dict[str, Any], path: str) -> Any:
    cur: Any = doc
    for part in path.split("."):
        if not isinstance(cur, dict) or part not in cur:
            return None
        cur = cur[part]
    return cur


def evaluate_transaction_policy(input_doc: dict[str, Any]) -> PolicyDecision:
    """Mirror of credence/policy/rego/credit.rego. Missing or malformed input
    denies (fail closed) — never assume a permissive default."""
    deny: list[str] = []

    identity_valid = _get(input_doc, "identity.valid")
    if identity_valid is not True:
        deny.append("identity_invalid")

    expires_at = _get(input_doc, "identity.expires_at")
    now = _get(input_doc, "now")
    if not isinstance(expires_at, int | float) or not isinstance(now, int | float):
        deny.append("authorization_window_unknown")
    elif expires_at <= now:
        deny.append("authorization_expired")

    agent_status = _get(input_doc, "agent.status")
    if agent_status != "ACTIVE":
        deny.append("agent_not_active")

    vault_status = _get(input_doc, "vault.status")
    if vault_status not in ("ACTIVE", "SPENDING"):
        deny.append("vault_not_spendable")

    vendor_id = _get(input_doc, "vendor.id")
    allowed = _get(input_doc, "vault.allowed_vendor_ids")
    if not isinstance(vendor_id, str) or not isinstance(allowed, list) or vendor_id not in allowed:
        deny.append("vendor_not_allowed")

    amount = _get(input_doc, "transaction.amount_minor")
    per_txn = _get(input_doc, "vault.per_transaction_limit_minor")
    spent = _get(input_doc, "vault.spent_minor")
    total = _get(input_doc, "vault.total_limit_minor")
    if not all(isinstance(v, int) for v in (amount, per_txn, spent, total)) or amount <= 0:
        deny.append("amounts_unknown")
    else:
        if amount > per_txn:
            deny.append("transaction_limit")
        if spent + amount > total:
            deny.append("task_limit")

    risk_status = _get(input_doc, "risk.policy_status")
    if risk_status != "PASS":
        deny.append("risk_status_not_pass")

    return PolicyDecision(allow=not deny, deny=deny, engine="local")

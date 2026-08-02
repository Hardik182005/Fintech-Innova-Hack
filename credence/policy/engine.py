"""Deterministic policy evaluation.

**This is the evaluator that runs.** Every spend attempt in every deployment,
sandbox included, is authorised here: `vault_ops.propose_transaction` calls
`evaluate_transaction_policy` in-process, and the `PolicyDecision` it records
carries `engine="local"`.

The rules are the mirror of the Rego bundle in credence/policy/rego/, and the
input document has OPA's shape so the two can be diffed. An OPA sidecar
container is deployed beside the API in the GCP sandbox, but **no request path
makes an HTTP call to it** — it is health-probed for display and nothing more.
`ReasonCode.POLICY_ENGINE_UNAVAILABLE` exists and is never raised, because
there is no remote policy call that could time out.

This docstring previously said the authoritative path called OPA over HTTP and
that this module was a degraded-profile fallback. That was not true of any
deployment, and it made a security control look like it ran somewhere it did
not. If a real OPA call is ever added, that is the point at which
POLICY_ENGINE_UNAVAILABLE becomes reachable and callers must deny rather than
silently falling back here.
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

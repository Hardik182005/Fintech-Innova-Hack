"""Explicit state machines (spec §11). No endpoint may set state arbitrarily —
every change goes through `transition()`, which validates, persists, and is
audited by the caller."""

from __future__ import annotations

from credence.errors import CredenceError, ReasonCode


class InvalidTransitionError(CredenceError):
    def __init__(self, kind: str, current: str, target: str):
        super().__init__(ReasonCode.POLICY_DENIED, f"{kind}: {current} -> {target} not allowed")


APPLICATION_TRANSITIONS: dict[str, set[str]] = {
    "DRAFT": {"IDENTITY_VERIFIED", "REJECTED"},
    "IDENTITY_VERIFIED": {"EVIDENCE_READY", "REJECTED"},
    "EVIDENCE_READY": {"UNDERWRITING", "REJECTED"},
    "UNDERWRITING": {"POLICY_EVALUATED", "REJECTED"},
    "POLICY_EVALUATED": {"HUMAN_REVIEW_REQUIRED", "APPROVED", "REJECTED"},
    "HUMAN_REVIEW_REQUIRED": {"APPROVED", "REJECTED"},
    "APPROVED": {"VAULT_CREATED"},
    "VAULT_CREATED": {"DISBURSEMENT_ENABLED"},
    "DISBURSEMENT_ENABLED": set(),
    "REJECTED": set(),
}

VAULT_TRANSITIONS: dict[str, set[str]] = {
    "CREATED": {"ACTIVE", "FROZEN", "EXPIRED"},
    "ACTIVE": {"SPENDING", "TASK_COMPLETED", "TASK_FAILED", "FROZEN", "EXPIRED"},
    "SPENDING": {"SPENDING", "TASK_COMPLETED", "TASK_FAILED", "FROZEN", "EXPIRED"},
    "FROZEN": {"ACTIVE", "TASK_FAILED", "EXPIRED"},  # unfreeze is owner/policy-gated
    "EXPIRED": {"REVENUE_RECEIVED", "TASK_FAILED"},
    "TASK_COMPLETED": {"REVENUE_RECEIVED"},
    "TASK_FAILED": {"REVENUE_RECEIVED", "DEFAULTED", "PARTIALLY_REPAID", "REPAID"},
    "REVENUE_RECEIVED": {"REPAID", "PARTIALLY_REPAID", "DEFAULTED", "REVENUE_RECEIVED"},
    "REPAID": {"CLOSED"},
    "PARTIALLY_REPAID": {"REVENUE_RECEIVED", "DEFAULTED", "CLOSED"},
    "DEFAULTED": {"CLOSED"},
    "CLOSED": set(),
}


def transition(kind: str, table: dict[str, set[str]], current: str, target: str) -> str:
    allowed = table.get(current, set())
    if target not in allowed:
        raise InvalidTransitionError(kind, current, target)
    return target


def application_transition(current: str, target: str) -> str:
    return transition("credit_application", APPLICATION_TRANSITIONS, current, target)


def vault_transition(current: str, target: str) -> str:
    return transition("credit_vault", VAULT_TRANSITIONS, current, target)

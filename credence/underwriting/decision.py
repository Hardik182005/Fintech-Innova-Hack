"""Deterministic decision engine (spec §5.3 key calculations).

approved_limit = min(requested, available_exposure, revenue_advance_cap,
                     task_cost_cap, policy_cap)

expected_loss = PD × LGD × EAD — all integer arithmetic (ppm × minor units).
Every input to the min() appears in the decision receipt. The LLM plays no
part in any number here.
"""

from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field

from credence.underwriting.features import PPM, AgentHistoryFeatures
from credence.underwriting.scorecard import SCORECARD_VERSION, score_pd_ppm

# Policy parameters (versioned; a future OPA data document can override).
ADVANCE_RATE_PPM = 700_000  # advance up to 70% of verified expected revenue
LGD_PPM_DEFAULT = 550_000  # assume 55% loss given default before recoveries
AUTO_APPROVE_MAX_EL_RATIO_PPM = 60_000  # EL must be <= 6% of approved limit
AUTO_APPROVE_MAX_PD_PPM = 350_000  # PD above 35% can never auto-approve
FEE_RATE_PPM = 50_000  # 5% flat sandbox fee on approved principal
DECISION_VERSION = "decision-v1"


@dataclass
class DecisionInputs:
    requested_minor: int
    owner_exposure_cap_minor: int
    current_outstanding_minor: int
    verified_expected_revenue_minor: int
    verified_eligible_cost_minor: int
    passport_max_borrowing_minor: int
    features: AgentHistoryFeatures = None  # type: ignore[assignment]
    mandate_valid: bool = False
    ai_checks_available: bool = True
    ai_risk_flags: list[str] = field(default_factory=list)


@dataclass
class DecisionResult:
    decision: str  # APPROVED | HUMAN_REVIEW_REQUIRED | REJECTED
    approved_limit_minor: int
    pd_ppm: int
    lgd_ppm: int
    ead_minor: int
    expected_loss_minor: int
    fee_minor: int
    caps: dict[str, int]
    reason_codes: list[str]
    factor_codes: list[str]
    receipt: dict = field(default_factory=dict)
    receipt_hash: str = ""


def decide(inputs: DecisionInputs) -> DecisionResult:
    reasons: list[str] = []

    available_exposure = max(0, inputs.owner_exposure_cap_minor - inputs.current_outstanding_minor)
    revenue_advance_cap = (inputs.verified_expected_revenue_minor * ADVANCE_RATE_PPM) // PPM
    task_cost_cap = inputs.verified_eligible_cost_minor
    policy_cap = inputs.passport_max_borrowing_minor

    caps = {
        "requested_minor": inputs.requested_minor,
        "available_exposure_minor": available_exposure,
        "revenue_advance_cap_minor": revenue_advance_cap,
        "task_cost_cap_minor": task_cost_cap,
        "policy_cap_minor": policy_cap,
    }
    approved_limit = min(caps.values())

    revenue_coverage_ppm = (
        (inputs.verified_expected_revenue_minor * PPM) // inputs.requested_minor
        if inputs.requested_minor > 0
        else 0
    )
    pd_ppm, factor_codes = score_pd_ppm(inputs.features, revenue_coverage_ppm)
    lgd_ppm = LGD_PPM_DEFAULT
    ead_minor = approved_limit
    expected_loss = (pd_ppm * lgd_ppm * ead_minor) // (PPM * PPM)
    fee_minor = (approved_limit * FEE_RATE_PPM) // PPM

    # Hard rejections
    if approved_limit <= 0:
        reasons.append("NO_LENDABLE_AMOUNT")
        decision = "REJECTED"
    else:
        decision = "APPROVED"
        # Review triggers (spec §9.4) — fail toward review, not approval.
        if not inputs.mandate_valid:
            decision = "HUMAN_REVIEW_REQUIRED"
            reasons.append("REVENUE_MANDATE_MISSING_OR_INVALID")
        if not inputs.ai_checks_available:
            decision = "HUMAN_REVIEW_REQUIRED"
            reasons.append("AI_EVIDENCE_CHECKS_UNAVAILABLE")
        if "instruction_in_evidence" in inputs.ai_risk_flags:
            decision = "HUMAN_REVIEW_REQUIRED"
            reasons.append("PROMPT_INJECTION_SUSPECTED")
        if inputs.features.is_first_credit:
            decision = "HUMAN_REVIEW_REQUIRED"
            reasons.append("FIRST_CREDIT_FOR_AGENT")
        if pd_ppm > AUTO_APPROVE_MAX_PD_PPM:
            decision = "HUMAN_REVIEW_REQUIRED"
            reasons.append("PD_ABOVE_AUTO_APPROVE_THRESHOLD")
        if (
            approved_limit > 0
            and (expected_loss * PPM) // approved_limit > AUTO_APPROVE_MAX_EL_RATIO_PPM
        ):
            decision = "HUMAN_REVIEW_REQUIRED"
            reasons.append("EXPECTED_LOSS_ABOVE_THRESHOLD")

    receipt = {
        "version": DECISION_VERSION,
        "scorecard_version": SCORECARD_VERSION,
        "decision": decision,
        "approved_limit_minor": approved_limit if decision != "REJECTED" else 0,
        "caps": caps,
        "pd_ppm": pd_ppm,
        "lgd_ppm": lgd_ppm,
        "ead_minor": ead_minor,
        "expected_loss_minor": expected_loss,
        "fee_minor": fee_minor,
        "revenue_coverage_ppm": revenue_coverage_ppm,
        "factor_codes": factor_codes,
        "reason_codes": reasons,
        "features": inputs.features.as_dict(),
        "is_simulation": True,
    }
    receipt_hash = hashlib.sha256(
        json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()

    return DecisionResult(
        decision=decision,
        approved_limit_minor=approved_limit if decision != "REJECTED" else 0,
        pd_ppm=pd_ppm,
        lgd_ppm=lgd_ppm,
        ead_minor=ead_minor,
        expected_loss_minor=expected_loss,
        fee_minor=fee_minor,
        caps=caps,
        reason_codes=reasons,
        factor_codes=factor_codes,
        receipt=receipt,
        receipt_hash=receipt_hash,
    )

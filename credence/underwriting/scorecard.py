"""Layer B — transparent deterministic scorecard.

This is the FALLBACK scorecard required by spec §5.3B ("fallback
deterministic scorecard when the ML model is unavailable") and the primary
scorer in the sandbox. All outputs are integer ppm and labelled
is_simulation=True — these are simulation metrics on synthetic history, not
claims about real-world default prediction. The trained logistic/XGBoost
challenger plugs into the same interface in Phase 4.

Scoring is pure integer arithmetic (no floats): a base PD in ppm adjusted by
capped, documented deltas per feature.
"""

from __future__ import annotations

from credence.underwriting.features import PPM, AgentHistoryFeatures

SCORECARD_VERSION = "scorecard-v1"

# Baselines and deltas in ppm. Documented, reviewable, unit-tested.
BASE_PD_PPM = 120_000  # 12% baseline for an unknown agent
MIN_PD_PPM = 5_000  # floor 0.5%
MAX_PD_PPM = 950_000  # cap 95%


def score_pd_ppm(f: AgentHistoryFeatures, revenue_coverage_ppm: int) -> tuple[int, list[str]]:
    """Return (pd_ppm, factor_codes). revenue_coverage_ppm is
    expected_revenue / requested_principal in ppm, computed by the caller from
    verified values."""
    pd = BASE_PD_PPM
    factors: list[str] = []

    if f.is_first_credit:
        pd += 80_000
        factors.append("FIRST_CREDIT_NO_HISTORY")
    else:
        # Success track record: up to -60_000 ppm
        pd -= (60_000 * f.task_success_rate_ppm) // PPM
        if f.task_success_rate_ppm >= 800_000:
            factors.append("STRONG_TASK_SUCCESS")
        # Repayment track record: up to -50_000 ppm
        pd -= (50_000 * f.repayment_rate_ppm) // PPM
        if f.repayment_rate_ppm >= 800_000:
            factors.append("STRONG_REPAYMENT_HISTORY")

    if f.total_defaulted_minor > 0:
        pd += 150_000
        factors.append("PRIOR_DEFAULT_LOSS")

    pd += min(f.policy_violation_count, 5) * 30_000
    if f.policy_violation_count:
        factors.append("POLICY_VIOLATIONS")

    pd += min(f.blocked_spend_attempts, 5) * 20_000
    if f.blocked_spend_attempts:
        factors.append("BLOCKED_SPEND_ATTEMPTS")

    if f.identity_age_days < 7:
        pd += 40_000
        factors.append("NEW_IDENTITY")

    # Task economics: strong verified revenue coverage lowers risk.
    if revenue_coverage_ppm >= 1_500_000:  # revenue >= 1.5x principal
        pd -= 40_000
        factors.append("STRONG_REVENUE_COVERAGE")
    elif revenue_coverage_ppm < PPM:  # revenue < principal
        pd += 120_000
        factors.append("REVENUE_BELOW_PRINCIPAL")

    pd = max(MIN_PD_PPM, min(MAX_PD_PPM, pd))
    return pd, factors

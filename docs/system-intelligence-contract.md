# System Intelligence API contract

`GET /v1/system-intelligence?window=1h|24h|7d|30d` (default `24h`), tenant-scoped
(same auth as every other read endpoint). This document is the single source of
truth for the response shape; the backend implements it and the frontend types
against it. Change it here first or not at all.

## The metric envelope

Every rate, count, duration and money figure is wrapped, never bare:

```json
{
  "value": 987500,
  "unit": "ppm | minor | count | ms",
  "sample_size": 42,
  "status": "ok | not_evaluated | insufficient_sample | not_connected | unavailable"
}
```

Rules (spec §23, non-negotiable):
- `value` is `null` whenever `status != "ok"`. Never `0` as a stand-in.
- Rates are integer ppm (1_000_000 = 100%). Money is integer minor units. Durations are integer ms.
- `sample_size` is the honest denominator, `null` when there is none.
- A metric that cannot be computed from real records in the window MUST come back
  with the truthful non-ok status. Nothing is estimated, nothing hardcoded.

## Response shape

```json
{
  "generated_at": "ISO-8601",
  "window": "24h",
  "assurance": {
    "score": { "...envelope, unit count 0-100" },
    "components": {
      "identity_verification_accuracy": "envelope ppm",
      "underwriting_decision_agreement": "envelope ppm",
      "evidence_grounding_rate": "envelope ppm",
      "hallucination_containment_rate": "envelope ppm",
      "adversarial_policy_block_rate": "envelope ppm",
      "repayment_invariant_pass_rate": "envelope ppm"
    },
    "last_evaluation_run_at": "ISO-8601 | null"
  },
  "summary": {
    "requests_processed": "envelope count",
    "approvals": "envelope count",
    "controlled_rejections": "envelope count",
    "human_reviews": "envelope count — still AWAITING a human decision",
    "true_errors": "envelope count",
    "pipeline_success_rate": "envelope ppm",
    "prevented_exposure_minor": "envelope minor",
    "blocked_attempts": "envelope count"
  },
  "pipeline": [
    {
      "stage": "REQUEST_RECEIVED",
      "label": "Request received",
      "status": "healthy | degraded | waiting | reviewing | failed | unavailable",
      "processed": "envelope count",
      "succeeded": "envelope count",
      "controlled_rejections": "envelope count",
      "true_errors": "envelope count",
      "p50_ms": "envelope ms",
      "p95_ms": "envelope ms",
      "last_completed_at": "ISO-8601 | null"
    }
  ],
  "ai_quality": {
    "structured_output_validity": "envelope ppm",
    "verifier_disagreement_rate": "envelope ppm",
    "model_fallback_rate": "envelope ppm",
    "insufficient_evidence_responses": "envelope count"
  },
  "models": {
    "provider": "ollama",
    "analyst_model": "string | null",
    "critic_model": "string | null",
    "external_llm_api_calls": "envelope count (verified from config+telemetry, never hardcoded)"
  },
  "credit_engine": {
    "decision_version": "string",
    "scorecard_version": "string",
    "decisions": "envelope count",
    "auto_approved": "envelope count",
    "auto_rejected": "envelope count",
    "referred_to_human": "envelope count"
  },
  "financial_safety": {
    "policy_denials_by_code": [{ "code": "OVERSPEND", "count": 3 }],
    "frozen_vaults": "envelope count",
    "revoked_agents": "envelope count",
    "prevented_exposure_minor": "envelope minor"
  },
  "repayment": {
    "waterfall_runs": "envelope count",
    "invariant_checked": "envelope count",
    "invariant_passed": "envelope count",
    "ledger_balanced": true,
    "audit_chain_intact": true
  },
  "service_health": [
    { "component": "api|database|opa|model_runtime", "status": "healthy | degraded | down | idle | not_connected", "detail": "string | null", "checked_at": "ISO-8601" }
  ],
  "fail_closed_events": [
    { "at": "ISO-8601", "component": "string", "action": "string", "detail": "string" }
  ],
  "infrastructure": {
    "billing_connected": false,
    "note": "Billing data not connected"
  }
}
```

## Pipeline stages (order fixed, spec §7)

REQUEST_RECEIVED, SCHEMA_VALIDATION, PASSPORT_VERIFICATION, EVIDENCE_RETRIEVAL,
TASK_ANALYST, FEATURE_CALCULATION, UNDERWRITING_ANALYST, CREDIT_RISK_MODEL,
INDEPENDENT_RISK_CRITIC, POLICY_ENGINE, HUMAN_REVIEW, VAULT_CREATION,
SPEND_MONITORING, REVENUE_COLLECTION, REPAYMENT_WATERFALL, AUDIT_FINALIZATION.

A stage with no recorded telemetry in the window reports `status:
"unavailable"` and envelopes with `status: "not_connected"` — it does not
disappear and it does not claim zeros.

## Semantics reminders

- A policy rejection is a *success* of the pipeline (controlled rejection), never a `true_error`.
- An `INSUFFICIENT_EVIDENCE` model reply counts toward hallucination containment, not against it.
- `underwriting_decision_agreement` compares AI recommendation direction vs deterministic outcome on evaluated cases only; it is never a live approval rate relabelled "accuracy".
- The assurance score exists only when all six components are `ok`:
  20% identity + 20% agreement + 20% grounding + 15% containment + 15% adversarial block + 10% repayment invariant.
- No PII, tokens, prompts, or chain-of-thought anywhere in this response.

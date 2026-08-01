"""System-intelligence read model (docs/system-intelligence-contract.md).

One composed telemetry view over the tenant's own records inside a bounded
time window. Every rate, count, duration and money figure is wrapped in the
contract's metric envelope and computed only from stored rows; anything the
platform does not record yet comes back as a null value with the truthful
non-ok status — never a stand-in zero, never an estimated rate. Money is
integer minor units, rates are integer parts-per-million, and no float
participates in any financial figure.
"""

from __future__ import annotations

import re
from datetime import UTC, datetime, timedelta
from urllib.parse import urlparse

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from credence.api.deps import get_current_user, get_session
from credence.api.read_routes import _iso, _loads, _scoped
from credence.audit import verify_chain
from credence.config import get_settings
from credence.evaluation.runner import run_evaluation_suite
from credence.finance_models import (
    CreditApplication,
    CreditDecision,
    CreditVault,
    EvaluationResult,
    FreezeEvent,
    HumanReview,
    LlmAnalysisRun,
    PipelineStageEvent,
    PolicyDecisionRecord,
    Repayment,
    RevenueEvent,
    RiskEvent,
    RiskModelRun,
    TransactionProposal,
    UnderwritingFeatures,
    VaultTransaction,
)
from credence.ledger import reconcile
from credence.modelgw.gateway import build_gateway
from credence.models import Agent, AuditEvent, JournalTransaction, User
from credence.telemetry import current_request_id, percentile_ms
from credence.underwriting.decision import DECISION_VERSION
from credence.underwriting.scorecard import SCORECARD_VERSION

intelligence_router = APIRouter(prefix="/v1")

PPM = 1_000_000

WINDOWS: dict[str, timedelta] = {
    "1h": timedelta(hours=1),
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}

# Fixed stage order (contract §"Pipeline stages"). Every stage is always
# present in the response; absence of telemetry is a status, not a missing row.
PIPELINE_STAGES: list[tuple[str, str]] = [
    ("REQUEST_RECEIVED", "Request received"),
    ("SCHEMA_VALIDATION", "Schema validation"),
    ("PASSPORT_VERIFICATION", "Passport verification"),
    ("EVIDENCE_RETRIEVAL", "Evidence retrieval"),
    ("TASK_ANALYST", "Task analyst (AI, advisory)"),
    ("FEATURE_CALCULATION", "Feature calculation"),
    ("UNDERWRITING_ANALYST", "Underwriting analyst (AI, advisory)"),
    ("CREDIT_RISK_MODEL", "Credit risk model"),
    ("INDEPENDENT_RISK_CRITIC", "Independent risk critic (AI, advisory)"),
    ("POLICY_ENGINE", "Policy engine"),
    ("HUMAN_REVIEW", "Human review"),
    ("VAULT_CREATION", "Vault creation"),
    ("SPEND_MONITORING", "Spend monitoring"),
    ("REVENUE_COLLECTION", "Revenue collection"),
    ("REPAYMENT_WATERFALL", "Repayment waterfall"),
    ("AUDIT_FINALIZATION", "Audit finalization"),
]

# Decision reason codes that mean the application fell at the passport /
# identity gate rather than a later stage.
IDENTITY_REJECT_CODES = frozenset(
    {
        "AGENT_IDENTITY_INVALID",
        "AUTHORIZATION_EXPIRED",
        "PASSPORT_REVOKED",
        "PASSPORT_NOT_YET_VALID",
        "NONCE_REPLAYED",
        "AUDIENCE_MISMATCH",
        "ISSUER_UNKNOWN",
        "SCOPE_MISSING",
        "AGENT_NOT_ACTIVE",
        "AGENT_FROZEN",
    }
)

# Waterfall allocation steps -> the persisted Repayment column each must equal
# (credence/vault/waterfall.py). APPLY_REVENUE has no dedicated column; it
# participates only in the recovery conservation total.
STEP_FIELDS = {
    "REPAY_PRINCIPAL": "principal_minor",
    "SWEEP_UNSPENT": "principal_minor",
    "PAY_FEE": "fee_minor",
    "REPLENISH_RESERVE": "reserve_minor",
    "DRAW_RESERVE_CAPPED": "reserve_minor",
    "RELEASE_TO_OWNER": "owner_minor",
    "SIMULATED_LOSS": "loss_minor",
}

# Contract: 20% identity + 20% agreement + 20% grounding + 15% containment
# + 15% adversarial block + 10% repayment invariant.
ASSURANCE_WEIGHTS = {
    "identity_verification_accuracy": 20,
    "underwriting_decision_agreement": 20,
    "evidence_grounding_rate": 20,
    "hallucination_containment_rate": 15,
    "adversarial_policy_block_rate": 15,
    "repayment_invariant_pass_rate": 10,
}

EVAL_COMPONENT_METRICS = (
    "identity_verification_accuracy",
    "underwriting_decision_agreement",
    "evidence_grounding_rate",
    "hallucination_containment_rate",
)

# Hosts for which "inference never leaves this machine" is verifiable from
# configuration alone.
LOOPBACK_HOSTS = frozenset({"localhost", "127.0.0.1", "::1"})

PROBE_TIMEOUT_SECONDS = 2.0


# ---------------------------------------------------------------- envelopes --


def _ok(value: int, unit: str, sample_size: int | None = None) -> dict:
    return {"value": value, "unit": unit, "sample_size": sample_size, "status": "ok"}


def _no(unit: str, status: str, sample_size: int | None = None) -> dict:
    # Envelope rule (contract, non-negotiable): value is null whenever the
    # status is not "ok" — a missing figure is never smuggled in as 0.
    return {"value": None, "unit": unit, "sample_size": sample_size, "status": status}


def _rate(numerator: int, denominator: int) -> dict:
    if denominator == 0:
        return _no("ppm", "insufficient_sample", 0)
    return _ok(numerator * PPM // denominator, "ppm", denominator)


def _aware(dt: datetime) -> datetime:
    # SQLite returns naive datetimes for timezone-aware columns; all stored
    # timestamps are UTC by construction (models.utcnow).
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def _since(rows: list, cutoff: datetime, attr: str = "created_at") -> list:
    return [r for r in rows if _aware(getattr(r, attr)) >= cutoff]


def _last(rows: list, attr: str = "created_at") -> datetime | None:
    return max((_aware(getattr(r, attr)) for r in rows), default=None)


# ------------------------------------------------------ repayment invariant --


def _repayment_invariant_ok(
    rep: Repayment,
    journal_keys: dict[str, str],
    revenue_by_external: dict[str, int],
) -> bool:
    """Check the conservation invariant of one recorded waterfall run against
    credence/vault/waterfall.py semantics.

    WATERFALL: every minor unit of collected revenue is allocated exactly once
    across principal -> fee -> reserve -> owner (loss never participates), so
    the independent RevenueEvent amount must equal the sum of the four fields.
    RECOVERY: owed = swept unspent + revenue applied + capped reserve draw +
    explicit simulated loss; fee and owner never participate. Each allocation
    step must also reconcile with the column it was persisted into.
    """
    field_sums: dict[str, int] = {}
    revenue_applied = 0
    for allocation in _loads(rep.allocations_json, []):
        step = allocation.get("step")
        amount = int(allocation.get("amount_minor", 0))
        if step == "APPLY_REVENUE":
            revenue_applied += amount
        elif step in STEP_FIELDS:
            field = STEP_FIELDS[step]
            field_sums[field] = field_sums.get(field, 0) + amount
        else:
            return False  # unknown step: conservation cannot be certified
    for field in ("principal_minor", "fee_minor", "reserve_minor", "owner_minor", "loss_minor"):
        if getattr(rep, field) != field_sums.get(field, 0):
            return False

    if rep.kind == "WATERFALL":
        if rep.loss_minor != 0 or rep.journal_transaction_id is None:
            return False
        # Independent join back to the revenue that funded this run: the
        # waterfall journal's idempotency key embeds the external event id
        # (vault_ops.receive_revenue), which keys the RevenueEvent row.
        external_id = journal_keys.get(rep.journal_transaction_id, "").removeprefix("waterfall-")
        revenue_in = revenue_by_external.get(external_id)
        if revenue_in is None:
            return False
        return revenue_in == (
            rep.principal_minor + rep.fee_minor + rep.reserve_minor + rep.owner_minor
        )
    # RECOVERY: revenue_applied is bound into the allocation total above; the
    # remaining shortfall must be explicit loss, never a fee or owner release.
    return rep.fee_minor == 0 and rep.owner_minor == 0 and revenue_applied >= 0


# ------------------------------------------------------------ stage builders --


def _stage_active(
    code: str,
    label: str,
    *,
    processed: int,
    succeeded: int,
    controlled: int,
    errors_env: dict,
    status: str,
    last_at: datetime | None,
) -> dict:
    return {
        "stage": code,
        "label": label,
        "status": status,
        "processed": _ok(processed, "count"),
        "succeeded": _ok(succeeded, "count", processed),
        "controlled_rejections": _ok(controlled, "count", processed),
        "true_errors": errors_env,
        # Domain tables carry no timings; the caller overlays real p50/p95
        # from PipelineStageEvent where rows exist. Until then, not_connected
        # — never 0 ms.
        "p50_ms": _no("ms", "not_connected"),
        "p95_ms": _no("ms", "not_connected"),
        "last_completed_at": _iso(last_at),
    }


def _stage_idle(code: str, label: str, status: str = "unavailable") -> dict:
    # Contract: a stage with no recorded telemetry in the window keeps its
    # slot, reports "unavailable", and claims no zeros.
    return {
        "stage": code,
        "label": label,
        "status": status,
        "processed": _no("count", "not_connected"),
        "succeeded": _no("count", "not_connected"),
        "controlled_rejections": _no("count", "not_connected"),
        "true_errors": _no("count", "not_connected"),
        "p50_ms": _no("ms", "not_connected"),
        "p95_ms": _no("ms", "not_connected"),
        "last_completed_at": None,
    }


def _health_row(component: str, status: str, detail: str | None) -> dict:
    return {
        "component": component,
        "status": status,
        "detail": detail,
        "checked_at": _iso(datetime.now(UTC)),
    }


# ---------------------------------------------------------------- endpoint --


@intelligence_router.get("/system-intelligence", tags=["monitoring"])
def system_intelligence(
    window: str = Query(default="24h"),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    if window not in WINDOWS:
        raise HTTPException(status_code=400, detail=f"window must be one of {sorted(WINDOWS)}")
    now = datetime.now(UTC)
    cutoff = now - WINDOWS[window]
    settings = get_settings()

    # ---- tenant records (window-filtered in Python; timestamps normalized) --
    apps = _scoped(session, CreditApplication, user)
    app_ids = [a.id for a in apps] or [""]

    def _by_app(model) -> list:
        return _since(
            list(
                session.execute(select(model).where(model.application_id.in_(app_ids))).scalars()
            ),
            cutoff,
        )

    apps_window = _since(apps, cutoff)
    decisions = _by_app(CreditDecision)
    reviews = _by_app(HumanReview)
    llm_runs = _by_app(LlmAnalysisRun)
    risk_runs = _by_app(RiskModelRun)
    feature_rows = _by_app(UnderwritingFeatures)
    proposals = _since(_scoped(session, TransactionProposal, user), cutoff)
    policy_rows = _scoped(session, PolicyDecisionRecord, user)
    policy_window = _since(policy_rows, cutoff)
    executed_ids = {t.proposal_id for t in _scoped(session, VaultTransaction, user)}
    repayments = _since(_scoped(session, Repayment, user), cutoff)
    # record_stage() writes one row per timed stage execution. Where rows
    # exist they are the only real source of duration, and of the
    # success / controlled-rejection / error split.
    stage_events = _since(_scoped(session, PipelineStageEvent, user), cutoff)
    events_by_stage: dict[str, list[PipelineStageEvent]] = {}
    for row in stage_events:
        events_by_stage.setdefault(row.stage, []).append(row)
    revenue_events = _scoped(session, RevenueEvent, user)
    revenue_window = _since(revenue_events, cutoff)
    vaults = _scoped(session, CreditVault, user)
    agents = _scoped(session, Agent, user)
    audit_events = _since(_scoped(session, AuditEvent, user), cutoff)
    risk_events = _since(_scoped(session, RiskEvent, user), cutoff)
    freeze_events = _since(_scoped(session, FreezeEvent, user), cutoff, attr="enforced_at")

    # Global integrity checks, same helpers the dashboard and /v1/metrics/
    # evaluation already rely on.
    imbalance = reconcile(session)
    chain_intact, _first_broken = verify_chain(session)

    # ---- repayment invariant (checked per recorded run, never assumed) -----
    journal_ids = [r.journal_transaction_id for r in repayments if r.journal_transaction_id]
    journal_keys = (
        {
            j.id: j.idempotency_key
            for j in session.execute(
                select(JournalTransaction).where(JournalTransaction.id.in_(journal_ids))
            ).scalars()
        }
        if journal_ids
        else {}
    )
    revenue_by_external = {r.external_event_id: r.amount_minor for r in revenue_events}
    invariant_results = [
        _repayment_invariant_ok(r, journal_keys, revenue_by_external) for r in repayments
    ]
    invariant_passed = sum(1 for passed in invariant_results if passed)

    # ---- adversarial policy block rate -------------------------------------
    # An adversarial attempt is a proposal at least one policy engine refused;
    # it counts as blocked only if it terminally never executed. A refused
    # proposal that still executed would drop this below 100% — measuring
    # that possibility is the point of the metric.
    denied_by_policy = {
        p.subject_id for p in policy_rows if p.subject_type == "TRANSACTION" and not p.allow
    }
    attempts = [p for p in proposals if p.status == "DENIED" or p.id in denied_by_policy]
    blocked = [p for p in attempts if p.status == "DENIED" and p.id not in executed_ids]
    adversarial_env = _rate(len(blocked), len(attempts))

    # ---- evaluation-suite components ---------------------------------------
    # Evaluation tables are platform-level (no organization_id column yet); a
    # result attributes itself to a metric via detail_json["metric"]. The rows
    # come from credence.evaluation.runner (POST /v1/system-intelligence/
    # evaluate, or `python -m credence.evaluation`), which executes the
    # labelled corpus against the real passport service, decision engine and
    # model gateway. Until a suite has been run these report "not_evaluated";
    # they are never inferred from live traffic.
    eval_rows = list(session.execute(select(EvaluationResult)).scalars())
    eval_by_metric: dict[str, list] = {}
    for row in _since(eval_rows, cutoff):
        metric = _loads(row.detail_json, {}).get("metric")
        if metric:
            eval_by_metric.setdefault(metric, []).append(row)
    components: dict[str, dict] = {}
    for name in EVAL_COMPONENT_METRICS:
        rows = eval_by_metric.get(name, [])
        if rows:
            components[name] = _rate(sum(1 for r in rows if r.passed), len(rows))
        else:
            components[name] = _no("ppm", "not_evaluated")
    components["adversarial_policy_block_rate"] = adversarial_env
    components["repayment_invariant_pass_rate"] = _rate(invariant_passed, len(repayments))

    # The composite exists only when every component is measured (contract):
    # a score over partial components would silently re-weight them.
    if all(components[name]["status"] == "ok" for name in ASSURANCE_WEIGHTS):
        weighted_ppm = (
            sum(ASSURANCE_WEIGHTS[name] * components[name]["value"] for name in ASSURANCE_WEIGHTS)
            // 100
        )
        score_env = _ok(weighted_ppm // 10_000, "count")
    else:
        score_env = _no("count", "not_evaluated")

    # ---- summary ------------------------------------------------------------
    # Engine verdicts come from the immutable audit payloads, so a later human
    # override cannot rewrite what the deterministic engine itself concluded.
    decision_events = [e for e in audit_events if e.event_type == "CREDIT_DECISION"]
    verdicts = [_loads(e.payload_json, {}).get("decision") for e in decision_events]
    engine_approved = verdicts.count("APPROVED")
    engine_rejected = verdicts.count("REJECTED")
    referred_to_human = verdicts.count("HUMAN_REVIEW_REQUIRED")
    review_approved = sum(1 for r in reviews if r.action in ("APPROVE", "REDUCE"))
    review_rejected = sum(1 for r in reviews if r.action == "REJECT")
    denied = [p for p in proposals if p.status == "DENIED"]

    summary = {
        "requests_processed": _ok(len(apps_window), "count"),
        "approvals": _ok(engine_approved + review_approved, "count"),
        # A rejection via policy is a controlled outcome — a pipeline success,
        # never an error (contract semantics).
        "controlled_rejections": _ok(engine_rejected + review_rejected, "count"),
        "human_reviews": _ok(len(reviews), "count"),
        # Both figures come from stage telemetry, which records failures as
        # well as successes; without it a "success rate" over recorded
        # successes would be a tautology, so it stays not_connected instead.
        # A CONTROLLED_REJECTION counts as a pipeline success: the control
        # system did its job.
        "true_errors": (
            _ok(sum(1 for r in stage_events if r.status == "FAILED"), "count", len(stage_events))
            if stage_events
            else _no("count", "not_connected")
        ),
        "pipeline_success_rate": (
            _rate(sum(1 for r in stage_events if r.status != "FAILED"), len(stage_events))
            if stage_events
            else _no("ppm", "not_connected")
        ),
        "prevented_exposure_minor": _ok(
            sum(p.amount_minor for p in denied), "minor", len(denied)
        ),
        "blocked_attempts": _ok(len(denied), "count"),
    }

    # ---- pipeline -----------------------------------------------------------
    stages: list[dict] = []
    labels = dict(PIPELINE_STAGES)

    app_created_events = [e for e in audit_events if e.event_type == "CREDIT_APPLICATION_CREATED"]
    # A persisted application implies its request passed schema validation;
    # requests rejected at the schema layer never reach storage, so those
    # stages share a source and their true_errors stay not_connected.
    for code in ("REQUEST_RECEIVED", "SCHEMA_VALIDATION"):
        if app_created_events:
            stages.append(
                _stage_active(
                    code,
                    labels[code],
                    processed=len(app_created_events),
                    succeeded=len(app_created_events),
                    controlled=0,
                    errors_env=_no("count", "not_connected"),
                    status="healthy",
                    last_at=_last(app_created_events),
                )
            )
        else:
            stages.append(_stage_idle(code, labels[code]))

    dec_codes = [(d, set(_loads(d.reason_codes_json, []))) for d in decisions]
    identity_rejects = sum(
        1 for d, codes in dec_codes if d.decision == "REJECTED" and codes & IDENTITY_REJECT_CODES
    )
    if decisions:
        stages.append(
            _stage_active(
                "PASSPORT_VERIFICATION",
                labels["PASSPORT_VERIFICATION"],
                processed=len(decisions),
                succeeded=len(decisions) - identity_rejects,
                controlled=identity_rejects,
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(decisions),
            )
        )
    else:
        stages.append(_stage_idle("PASSPORT_VERIFICATION", labels["PASSPORT_VERIFICATION"]))

    evidence_pool = len(decisions) - identity_rejects
    evidence_rejects = sum(
        1
        for d, codes in dec_codes
        if d.decision == "REJECTED"
        and "INSUFFICIENT_EVIDENCE" in codes
        and not codes & IDENTITY_REJECT_CODES
    )
    if evidence_pool > 0:
        stages.append(
            _stage_active(
                "EVIDENCE_RETRIEVAL",
                labels["EVIDENCE_RETRIEVAL"],
                processed=evidence_pool,
                succeeded=evidence_pool - evidence_rejects,
                controlled=evidence_rejects,
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(decisions),
            )
        )
    else:
        stages.append(_stage_idle("EVIDENCE_RETRIEVAL", labels["EVIDENCE_RETRIEVAL"]))

    # Model-run stages: schema_valid=False runs ARE persisted, so these
    # stages' failures are instrumented (unlike the pipeline-wide true_errors).
    def _model_stage(code: str, role: str) -> dict:
        runs = [r for r in llm_runs if r.role == role]
        if not runs:
            return _stage_idle(code, labels[code])
        failures = sum(1 for r in runs if not r.schema_valid)
        return _stage_active(
            code,
            labels[code],
            processed=len(runs),
            succeeded=len(runs) - failures,
            controlled=0,
            errors_env=_ok(failures, "count", len(runs)),
            status="degraded" if failures else "healthy",
            last_at=_last(runs),
        )

    stages.append(_model_stage("TASK_ANALYST", "TASK_ANALYST"))

    if feature_rows:
        stages.append(
            _stage_active(
                "FEATURE_CALCULATION",
                labels["FEATURE_CALCULATION"],
                processed=len(feature_rows),
                succeeded=len(feature_rows),
                controlled=0,
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(feature_rows),
            )
        )
    else:
        stages.append(_stage_idle("FEATURE_CALCULATION", labels["FEATURE_CALCULATION"]))

    stages.append(_model_stage("UNDERWRITING_ANALYST", "UNDERWRITER"))

    if risk_runs:
        stages.append(
            _stage_active(
                "CREDIT_RISK_MODEL",
                labels["CREDIT_RISK_MODEL"],
                processed=len(risk_runs),
                succeeded=len(risk_runs),
                controlled=0,
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(risk_runs),
            )
        )
    else:
        stages.append(_stage_idle("CREDIT_RISK_MODEL", labels["CREDIT_RISK_MODEL"]))

    stages.append(_model_stage("INDEPENDENT_RISK_CRITIC", "CRITIC"))

    if policy_window:
        policy_denied = sum(1 for p in policy_window if not p.allow)
        stages.append(
            _stage_active(
                "POLICY_ENGINE",
                labels["POLICY_ENGINE"],
                processed=len(policy_window),
                succeeded=len(policy_window) - policy_denied,
                controlled=policy_denied,
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(policy_window),
            )
        )
    else:
        stages.append(_stage_idle("POLICY_ENGINE", labels["POLICY_ENGINE"]))

    pending_reviews = sum(1 for a in apps if a.status == "HUMAN_REVIEW_REQUIRED")
    if reviews:
        stages.append(
            _stage_active(
                "HUMAN_REVIEW",
                labels["HUMAN_REVIEW"],
                processed=len(reviews),
                succeeded=review_approved,
                controlled=review_rejected,
                errors_env=_no("count", "not_connected"),
                status="reviewing" if pending_reviews else "healthy",
                last_at=_last(reviews),
            )
        )
    else:
        stages.append(
            _stage_idle(
                "HUMAN_REVIEW",
                labels["HUMAN_REVIEW"],
                status="reviewing" if pending_reviews else "unavailable",
            )
        )

    vault_created_events = [e for e in audit_events if e.event_type == "VAULT_CREATED"]
    if vault_created_events:
        stages.append(
            _stage_active(
                "VAULT_CREATION",
                labels["VAULT_CREATION"],
                processed=len(vault_created_events),
                succeeded=len(vault_created_events),
                controlled=0,
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(vault_created_events),
            )
        )
    else:
        stages.append(_stage_idle("VAULT_CREATION", labels["VAULT_CREATION"]))

    if proposals:
        stages.append(
            _stage_active(
                "SPEND_MONITORING",
                labels["SPEND_MONITORING"],
                processed=len(proposals),
                succeeded=len(proposals) - len(denied),
                controlled=len(denied),
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(proposals),
            )
        )
    else:
        stages.append(_stage_idle("SPEND_MONITORING", labels["SPEND_MONITORING"]))

    if revenue_window:
        stages.append(
            _stage_active(
                "REVENUE_COLLECTION",
                labels["REVENUE_COLLECTION"],
                processed=len(revenue_window),
                succeeded=len(revenue_window),
                controlled=0,
                errors_env=_no("count", "not_connected"),
                status="healthy",
                last_at=_last(revenue_window),
            )
        )
    else:
        stages.append(_stage_idle("REVENUE_COLLECTION", labels["REVENUE_COLLECTION"]))

    if repayments:
        invariant_failures = len(repayments) - invariant_passed
        stages.append(
            _stage_active(
                "REPAYMENT_WATERFALL",
                labels["REPAYMENT_WATERFALL"],
                processed=len(repayments),
                succeeded=invariant_passed,
                controlled=0,
                errors_env=_ok(invariant_failures, "count", len(repayments)),
                status="degraded" if invariant_failures else "healthy",
                last_at=_last(repayments),
            )
        )
    else:
        stages.append(_stage_idle("REPAYMENT_WATERFALL", labels["REPAYMENT_WATERFALL"]))

    if audit_events:
        stages.append(
            {
                "stage": "AUDIT_FINALIZATION",
                "label": labels["AUDIT_FINALIZATION"],
                "status": "healthy" if chain_intact else "failed",
                "processed": _ok(len(audit_events), "count"),
                "succeeded": (
                    _ok(len(audit_events), "count", len(audit_events))
                    if chain_intact
                    else _no("count", "unavailable")
                ),
                "controlled_rejections": _ok(0, "count", len(audit_events)),
                "true_errors": (
                    _ok(0, "count", len(audit_events))
                    if chain_intact
                    else _no("count", "unavailable")
                ),
                "p50_ms": _no("ms", "not_connected"),
                "p95_ms": _no("ms", "not_connected"),
                "last_completed_at": _iso(_last(audit_events)),
            }
        )
    else:
        stages.append(_stage_idle("AUDIT_FINALIZATION", labels["AUDIT_FINALIZATION"]))

    # Overlay measured timings. The stage builders above derive counts from
    # domain tables (an application row proves its request was processed);
    # only record_stage knows how long the work took and whether it threw, so
    # that is layered on here. A stage with no rows keeps not_connected on
    # timing rather than reporting 0 ms — absent is never zero.
    for stage in stages:
        rows = events_by_stage.get(stage["stage"], [])
        if not rows:
            continue
        durations = sorted(r.duration_ms for r in rows)
        stage["p50_ms"] = _ok(percentile_ms(durations, 50), "ms", len(durations))
        stage["p95_ms"] = _ok(percentile_ms(durations, 95), "ms", len(durations))
        if stage["true_errors"]["status"] != "ok":
            failed = sum(1 for r in rows if r.status == "FAILED")
            stage["true_errors"] = _ok(failed, "count", len(rows))
            if failed and stage["status"] == "healthy":
                stage["status"] = "degraded"

    # ---- ai_quality ---------------------------------------------------------
    valid_runs = [r for r in llm_runs if r.schema_valid]
    if valid_runs:
        flagged = sum(1 for r in valid_runs if _loads(r.output_json, {}).get("missing_evidence"))
        insufficient_env = _ok(flagged, "count", len(valid_runs))
    else:
        insufficient_env = _no("count", "insufficient_sample", 0)
    ai_quality = {
        "structured_output_validity": _rate(len(valid_runs), len(llm_runs)),
        # The claim-vs-evidence verifier runs on demand in the underwriting
        # detail view; its verdicts are not persisted, so there is no stored
        # record to rate yet.
        "verifier_disagreement_rate": _no("ppm", "not_connected"),
        # Provider-level fallback (model failure -> degrade to human review)
        # is not recorded as a distinct signal; schema validity above is the
        # recorded fact and is reported separately rather than relabelled.
        "model_fallback_rate": _no("ppm", "not_connected"),
        "insufficient_evidence_responses": insufficient_env,
    }

    # ---- models -------------------------------------------------------------
    provider = settings.model_provider
    # external_llm_api_calls is verified from configuration, not asserted:
    # build_gateway() (credence/modelgw/gateway.py) can only construct
    # OllamaGateway — HTTP to the configured base URL — or the in-process
    # FixtureModelGateway; no external LLM client exists anywhere in the
    # codebase, and "disabled"/unknown providers construct no gateway at all.
    # Zero is therefore structural truth for fixture/disabled and for ollama
    # on a loopback host. Ollama pointed at a non-loopback host cannot be
    # verified as local from here, so it reports "unavailable" — never a
    # guessed count.
    if provider in ("fixture", "disabled"):
        external_calls_env = _ok(0, "count")
    elif provider == "ollama":
        host = urlparse(settings.ollama_base_url).hostname or ""
        external_calls_env = (
            _ok(0, "count") if host in LOOPBACK_HOSTS else _no("count", "unavailable")
        )
    else:
        external_calls_env = _no("count", "unavailable")
    models = {
        "provider": provider,
        "analyst_model": settings.ollama_analyst_model if provider == "ollama" else None,
        "critic_model": settings.ollama_critic_model if provider == "ollama" else None,
        "external_llm_api_calls": external_calls_env,
    }

    # ---- credit_engine ------------------------------------------------------
    credit_engine = {
        "decision_version": DECISION_VERSION,
        "scorecard_version": SCORECARD_VERSION,
        "decisions": _ok(len(decision_events), "count"),
        "auto_approved": _ok(engine_approved, "count"),
        "auto_rejected": _ok(engine_rejected, "count"),
        "referred_to_human": _ok(referred_to_human, "count"),
    }

    # ---- financial_safety ---------------------------------------------------
    denials_by_code: dict[str, int] = {}
    for p in denied:
        for code in _loads(p.reason_codes_json, []):
            denials_by_code[code] = denials_by_code.get(code, 0) + 1
    financial_safety = {
        "policy_denials_by_code": [
            {"code": code, "count": count}
            for code, count in sorted(denials_by_code.items(), key=lambda kv: (-kv[1], kv[0]))
        ],
        "frozen_vaults": _ok(
            sum(1 for v in vaults if v.status == "FROZEN"), "count", len(vaults)
        ),
        "revoked_agents": _ok(
            sum(1 for a in agents if a.status == "REVOKED"), "count", len(agents)
        ),
        "prevented_exposure_minor": summary["prevented_exposure_minor"],
    }

    # ---- repayment ----------------------------------------------------------
    repayment = {
        "waterfall_runs": _ok(len(repayments), "count"),
        "invariant_checked": _ok(len(repayments), "count"),
        "invariant_passed": _ok(invariant_passed, "count", len(repayments)),
        "ledger_balanced": imbalance == {},
        "audit_chain_intact": chain_intact,
    }

    # ---- service_health (every status backed by a real probe) --------------
    service_health = [_health_row("api", "healthy", "answering this request")]
    try:
        session.execute(text("SELECT 1"))
        service_health.append(_health_row("database", "healthy", None))
    except Exception as e:  # noqa: BLE001 — any DB failure must read as down
        service_health.append(_health_row("database", "down", type(e).__name__))

    opa_timeout = min(settings.opa_timeout_seconds, PROBE_TIMEOUT_SECONDS)
    try:
        opa_resp = httpx.get(f"{settings.opa_url.rstrip('/')}/health", timeout=opa_timeout)
        if opa_resp.status_code == 200:
            service_health.append(_health_row("opa", "healthy", None))
        else:
            service_health.append(_health_row("opa", "degraded", f"HTTP {opa_resp.status_code}"))
    except httpx.HTTPError as e:
        service_health.append(_health_row("opa", "down", type(e).__name__))

    if provider == "ollama":
        try:
            tags = httpx.get(
                f"{settings.ollama_base_url.rstrip('/')}/api/tags",
                timeout=PROBE_TIMEOUT_SECONDS,
            )
            if tags.status_code == 200:
                service_health.append(_health_row("model_runtime", "healthy", "ollama"))
            else:
                service_health.append(
                    _health_row("model_runtime", "degraded", f"HTTP {tags.status_code}")
                )
        except httpx.HTTPError as e:
            service_health.append(_health_row("model_runtime", "down", type(e).__name__))
    elif provider == "fixture":
        # The fixture gateway is in-process code, not a network runtime; being
        # able to construct it in this very process is the probe.
        service_health.append(
            _health_row("model_runtime", "healthy", "in-process fixture gateway")
        )
    else:
        service_health.append(_health_row("model_runtime", "not_connected", "provider disabled"))

    # ---- fail_closed_events (recorded enforcement moments only) ------------
    fail_closed: list[dict] = []
    for r in risk_events:
        detail = _loads(r.detail_json, {})
        if r.event_type == "SPEND_BLOCKED":
            fail_closed.append(
                {
                    "at": _iso(_aware(r.created_at)),
                    "component": "vault-policy",
                    "action": "SPEND_BLOCKED",
                    "detail": ",".join(detail.get("reasons", [])),
                }
            )
        elif r.event_type == "VAULT_FROZEN":
            fail_closed.append(
                {
                    "at": _iso(_aware(r.created_at)),
                    "component": "vault",
                    "action": "VAULT_FROZEN",
                    "detail": str(detail.get("reason", "")),
                }
            )
        elif r.event_type == "DEFAULT_LOSS":
            fail_closed.append(
                {
                    "at": _iso(_aware(r.created_at)),
                    "component": "recovery",
                    "action": "LOSS_RECOGNISED",
                    "detail": f"loss_minor={detail.get('loss_minor', 0)}",
                }
            )
    for f in freeze_events:
        if f.action in ("FREEZE", "REVOKE"):
            fail_closed.append(
                {
                    "at": _iso(_aware(f.enforced_at)),
                    "component": "identity",
                    "action": f"AGENT_{f.action}",
                    "detail": f.reason,
                }
            )
    fail_closed.sort(key=lambda e: e["at"], reverse=True)

    return {
        "generated_at": _iso(now),
        "window": window,
        "assurance": {
            "score": score_env,
            "components": components,
            "last_evaluation_run_at": _iso(_last(eval_rows)),
        },
        "summary": summary,
        "pipeline": stages,
        "ai_quality": ai_quality,
        "models": models,
        "credit_engine": credit_engine,
        "financial_safety": financial_safety,
        "repayment": repayment,
        "service_health": service_health,
        "fail_closed_events": fail_closed[:50],
        "infrastructure": {
            # No billing integration exists in the sandbox; saying so beats a
            # fabricated figure.
            "billing_connected": False,
            "note": "Billing data not connected",
        },
    }


# -------------------------------------------------------- evaluation trigger --


@intelligence_router.post("/system-intelligence/evaluate", tags=["monitoring"])
def run_evaluation(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    """Run the labelled evaluation corpus and persist one result per case.

    This is what turns the four model- and engine-backed Assurance Score
    components from "not_evaluated" into measured rates: every case executes
    against the real passport service, the real deterministic engine and the
    real model gateway, and writes an EvaluationResult carrying its metric.

    Scoping: authentication is required and the run's stage-telemetry row is
    attributed to the caller's organization, exactly as the sibling handlers
    scope their reads. The evaluation tables themselves are platform-level —
    they carry no organization_id column — so the corpus and its results are
    shared across tenants by construction, and this response says so rather
    than implying a per-tenant result set.

    A model that cannot answer degrades the run: the deterministic metrics
    still record, the two model-backed metrics come back in skipped_metrics
    and stay "not_evaluated" rather than being reported as 0%.
    """
    gateway = build_gateway(get_settings())
    run = run_evaluation_suite(
        session,
        gateway=gateway,
        organization_id=user.organization_id,
        request_id=current_request_id(),
    )
    summary = run.summary()
    summary["scope"] = "platform"
    summary["organization_id"] = user.organization_id
    return summary


# ------------------------------------------------------------ request trace --

_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._\-]{1,64}$")


@intelligence_router.get("/requests/{request_id}/trace", tags=["monitoring"])
def request_trace(
    request_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    """Everything one correlated request did, in order.

    The correlation id is minted (or accepted) by the middleware in
    credence.api.app and returned on every response as X-Request-Id, so a
    caller can always ask what their own request actually triggered.

    Scoped to the caller's organization: an id belonging to another tenant
    returns an empty trace rather than that tenant's activity. Audit payloads
    are deliberately omitted — a trace answers "what ran, in what order, how
    long, and did it fail", not "what were the financial details".
    """
    if not _REQUEST_ID_RE.fullmatch(request_id):
        raise HTTPException(status_code=400, detail="malformed request id")

    stage_rows = list(
        session.execute(
            select(PipelineStageEvent)
            .where(
                PipelineStageEvent.organization_id == user.organization_id,
                PipelineStageEvent.request_id == request_id,
            )
            .order_by(PipelineStageEvent.id)
        ).scalars()
    )
    audit_rows = list(
        session.execute(
            select(AuditEvent)
            .where(
                AuditEvent.organization_id == user.organization_id,
                AuditEvent.request_id == request_id,
            )
            .order_by(AuditEvent.seq)
        ).scalars()
    )

    return {
        "request_id": request_id,
        # A request that recorded nothing is reported as such; an empty trace
        # is not the same claim as a request that ran cleanly.
        "found": bool(stage_rows or audit_rows),
        "stages": [
            {
                "stage": r.stage,
                "status": r.status,
                "duration_ms": r.duration_ms,
                "error_code": r.error_code,
                "at": _iso(r.created_at),
            }
            for r in stage_rows
        ],
        "audit_events": [
            {
                "seq": r.seq,
                "event_type": r.event_type,
                "actor_type": r.actor_type,
                "actor_id": r.actor_id,
                "resource_id": r.resource_id,
                "event_hash": r.event_hash,
                "at": _iso(r.created_at),
            }
            for r in audit_rows
        ],
        "total_duration_ms": (
            sum(r.duration_ms for r in stage_rows) if stage_rows else None
        ),
    }

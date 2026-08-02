"""Task, evidence, mandate, and credit-application services.

`evaluate_application` is the bounded workflow (spec §6.5): a fixed node
sequence with no loops. The LLM (via the model gateway) only extracts facts
and flags; every number in the decision comes from the deterministic engine.
"""

from __future__ import annotations

import hashlib
import json
from collections.abc import Callable
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.audit import append_audit_event
from credence.errors import CredenceError, ReasonCode
from credence.finance_models import (
    CreditApplication,
    CreditDecision,
    HumanReview,
    LlmAnalysisRun,
    PolicyDecisionRecord,
    RevenueMandate,
    RiskModelRun,
    Task,
    TaskEvidence,
    UnderwritingFeatures,
)
from credence.modelgw import ModelGateway, ModelUnavailableError, RiskOpinion, TaskAnalysis
from credence.modelgw.gateway import evidence_contains_instruction
from credence.models import Agent, AgentStatus
from credence.services.identity import verify_stored_passport
from credence.state import application_transition
from credence.telemetry import current_request_id, record_stage
from credence.underwriting import (
    INJECTION_FLAG,
    UNCORROBORATED_INJECTION_FLAG,
    DecisionInputs,
    compute_features,
    decide,
)
from credence.underwriting.scorecard import SCORECARD_VERSION


def _corroborate_injection_flag(
    model_flags: list[str], evidence_texts: dict[str, str]
) -> list[str]:
    """Keep every flag the model raised, but do not let its unverified word
    alone be recorded as a detected prompt injection.

    The model is told to report instructions found inside <evidence> as
    `instruction_in_evidence`. Live, the 24B raised it on five of five
    applications whose evidence was ordinary invoices and contracts, and each
    one wrote PROMPT_INJECTION_SUSPECTED into an immutable decision receipt —
    an assertion about an attack that never happened.

    Every flag still routes the application to a human, so this cannot weaken
    the control. What changes is which of the two reason codes the receipt
    carries, and therefore whether the audit trail claims corroboration it
    does not have.
    """
    if INJECTION_FLAG not in model_flags:
        return list(model_flags)
    if evidence_contains_instruction(evidence_texts):
        return list(model_flags)
    return [
        UNCORROBORATED_INJECTION_FLAG if f == INJECTION_FLAG else f for f in model_flags
    ]


def create_task(
    session: Session,
    *,
    organization_id: str,
    agent_id: str,
    title: str,
    description: str,
    category: str,
    expected_revenue_minor: int,
    expected_cost_minor: int,
    currency: str = "INR",
) -> Task:
    task = Task(
        organization_id=organization_id,
        agent_id=agent_id,
        title=title,
        description=description,
        category=category,
        currency=currency,
        expected_revenue_minor=expected_revenue_minor,
        expected_cost_minor=expected_cost_minor,
    )
    session.add(task)
    session.flush()
    return task


def add_evidence(
    session: Session,
    *,
    organization_id: str,
    task_id: str,
    evidence_type: str,
    content_text: str,
    source: str = "upload",
) -> TaskEvidence:
    task = session.get(Task, task_id)
    if task is None or task.organization_id != organization_id:
        raise CredenceError(ReasonCode.CROSS_TENANT_EVIDENCE, "task not found in tenant")
    evidence = TaskEvidence(
        organization_id=organization_id,
        task_id=task_id,
        evidence_type=evidence_type,
        source=source,
        content_text=content_text,
        content_hash=hashlib.sha256(content_text.encode()).hexdigest(),
    )
    session.add(evidence)
    session.flush()
    return evidence


def create_mandate(
    session: Session,
    *,
    organization_id: str,
    task_id: str,
    authorized_by_user_id: str,
    reserve_cap_minor: int,
) -> RevenueMandate:
    mandate = RevenueMandate(
        organization_id=organization_id,
        task_id=task_id,
        authorized_by_user_id=authorized_by_user_id,
        reserve_cap_minor=reserve_cap_minor,
    )
    session.add(mandate)
    session.flush()
    append_audit_event(
        session,
        actor_type="USER",
        actor_id=authorized_by_user_id,
        event_type="REVENUE_MANDATE_CREATED",
        payload={"task_id": task_id, "reserve_cap_minor": reserve_cap_minor},
        organization_id=organization_id,
        resource_id=mandate.id,
    )
    return mandate


def create_application(
    session: Session,
    *,
    organization_id: str,
    agent_id: str,
    task_id: str,
    requested_minor: int,
    requested_duration_hours: int,
    expected_revenue_minor: int,
    expected_cost_minor: int,
    owner_exposure_cap_minor: int,
    proposed_vendor_ids: list[str],
    currency: str = "INR",
) -> CreditApplication:
    request_id = current_request_id()
    # Application intake: the request-level domain validation is the receive
    # step; a bad request here is a controlled rejection, not an error.
    with record_stage(session, organization_id, request_id, "REQUEST_RECEIVED"):
        if requested_minor <= 0:
            raise CredenceError(ReasonCode.POLICY_DENIED, "requested amount must be positive")
        app = CreditApplication(
            organization_id=organization_id,
            agent_id=agent_id,
            task_id=task_id,
            currency=currency,
            requested_minor=requested_minor,
            requested_duration_hours=requested_duration_hours,
            expected_revenue_minor=expected_revenue_minor,
            expected_cost_minor=expected_cost_minor,
            owner_exposure_cap_minor=owner_exposure_cap_minor,
            proposed_vendors_json=json.dumps(sorted(set(proposed_vendor_ids))),
        )
    # Persisting the row is where the schema is enforced for real: column
    # types, FKs and check constraints reject anything malformed at flush.
    with record_stage(session, organization_id, request_id, "SCHEMA_VALIDATION"):
        session.add(app)
        session.flush()
    append_audit_event(
        session,
        actor_type="AGENT",
        actor_id=agent_id,
        event_type="CREDIT_APPLICATION_CREATED",
        payload={"application_id": app.id, "requested_minor": requested_minor},
        organization_id=organization_id,
        resource_id=app.id,
    )
    return app


def evaluate_application(
    session: Session,
    application_id: str,
    gateway: ModelGateway | None,
    now: datetime | None = None,
) -> CreditDecision:
    """Fixed pipeline: identity → evidence → AI analysis (advisory) →
    features → score → deterministic decision → policy record → state."""
    now = now or datetime.now(UTC)
    app = session.get(CreditApplication, application_id)
    if app is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "application not found")
    if app.status != "DRAFT":
        existing = session.execute(
            select(CreditDecision).where(CreditDecision.application_id == app.id)
        ).scalar_one_or_none()
        if existing is not None:
            return existing  # idempotent re-evaluation
        raise CredenceError(ReasonCode.POLICY_DENIED, f"application in state {app.status}")

    request_id = current_request_id()
    org_id = app.organization_id

    # Node 1-2: passport + agent status (fail closed).
    with record_stage(session, org_id, request_id, "PASSPORT_VERIFICATION") as passport_stage:
        valid, reasons = verify_stored_passport(session, app.agent_id)
        agent = session.get(Agent, app.agent_id)
        if not valid or agent is None or agent.status != AgentStatus.ACTIVE:
            # The gate closed on purpose: a controlled rejection, not an error.
            codes = reasons or ["AGENT_NOT_ACTIVE"]
            passport_stage.reject(codes[0])
    if not valid or agent is None or agent.status != AgentStatus.ACTIVE:
        app.status = application_transition(app.status, "REJECTED")
        decision_row = _store_decision(
            session, app, "REJECTED", 0, {}, reasons or ["AGENT_NOT_ACTIVE"], {}
        )
        return decision_row
    app.status = application_transition(app.status, "IDENTITY_VERIFIED")

    # Node 3: evidence retrieval (tenant-scoped by construction).
    with record_stage(session, org_id, request_id, "EVIDENCE_RETRIEVAL") as evidence_stage:
        evidence_rows = list(
            session.execute(
                select(TaskEvidence).where(
                    TaskEvidence.task_id == app.task_id,
                    TaskEvidence.organization_id == app.organization_id,
                )
            ).scalars()
        )
        if not evidence_rows:
            evidence_stage.reject(ReasonCode.INSUFFICIENT_EVIDENCE.value)
    if not evidence_rows:
        app.status = application_transition(app.status, "REJECTED")
        return _store_decision(
            session, app, "REJECTED", 0, {}, [ReasonCode.INSUFFICIENT_EVIDENCE.value], {}
        )
    app.status = application_transition(app.status, "EVIDENCE_READY")

    # Node 4: bounded AI analysis (advisory only; failure degrades to review).
    ai_available = gateway is not None
    ai_risk_flags: list[str] = []
    analysis: TaskAnalysis | None = None
    evidence_texts = {e.id: e.content_text for e in evidence_rows}
    if gateway is not None:
        with record_stage(session, org_id, request_id, "TASK_ANALYST") as analyst_stage:
            try:
                analysis = gateway.analyze_task(
                    task_description=session.get(Task, app.task_id).description,
                    evidence=evidence_texts,
                )
                ai_risk_flags = _corroborate_injection_flag(
                    analysis.risk_flags, evidence_texts
                )
                session.add(
                    LlmAnalysisRun(
                        application_id=app.id,
                        role="TASK_ANALYST",
                        model_profile=gateway.profile,
                        schema_valid=True,
                        output_json=analysis.model_dump_json(),
                        evidence_ids_json=json.dumps(
                            sorted({i for c in analysis.claims for i in c.evidence_ids})
                        ),
                    )
                )
            except ModelUnavailableError as e:
                # Handled here (degrade to review), but the stage itself did
                # fail — record that truthfully.
                analyst_stage.fail(e.code.value)
                ai_available = False
                session.add(
                    LlmAnalysisRun(
                        application_id=app.id,
                        role="TASK_ANALYST",
                        model_profile=getattr(gateway, "profile", "unknown"),
                        schema_valid=False,
                        output_json=json.dumps({"error": str(e)}),
                    )
                )

    # Node 5-6: deterministic features + scoring + decision.
    app.status = application_transition(app.status, "UNDERWRITING")
    with record_stage(session, org_id, request_id, "FEATURE_CALCULATION"):
        features = compute_features(session, app.agent_id, now=now)
        session.add(
            UnderwritingFeatures(
                application_id=app.id, features_json=json.dumps(features.as_dict())
            )
        )

    # Node 5b: second reasoning pass over the same evidence (advisory).
    if gateway is not None and analysis is not None:
        _record_opinion(
            session,
            application_id=app.id,
            role="UNDERWRITER",
            org_id=org_id,
            request_id=request_id,
            stage="UNDERWRITING_ANALYST",
            gateway=gateway,
            produce=lambda: gateway.underwrite(
                task_description=session.get(Task, app.task_id).description,
                evidence=evidence_texts,
                analyst_summary=analysis.summary,
            ),
        )

    mandate = session.execute(
        select(RevenueMandate).where(
            RevenueMandate.task_id == app.task_id, RevenueMandate.status == "ACTIVE"
        )
    ).scalar_one_or_none()

    with record_stage(session, org_id, request_id, "CREDIT_RISK_MODEL"):
        result = decide(
            DecisionInputs(
                requested_minor=app.requested_minor,
                owner_exposure_cap_minor=app.owner_exposure_cap_minor,
                current_outstanding_minor=features.current_outstanding_minor,
                verified_expected_revenue_minor=app.expected_revenue_minor,
                verified_eligible_cost_minor=app.expected_cost_minor,
                passport_max_borrowing_minor=_passport_cap(session, app.agent_id),
                features=features,
                mandate_valid=mandate is not None,
                ai_checks_available=ai_available,
                ai_risk_flags=ai_risk_flags,
            )
        )
        session.add(
            RiskModelRun(
                application_id=app.id,
                model_name=SCORECARD_VERSION,
                model_version="1",
                pd_ppm=result.pd_ppm,
                lgd_ppm=result.lgd_ppm,
                ead_minor=result.ead_minor,
                expected_loss_minor=result.expected_loss_minor,
                is_simulation=True,
            )
        )

    # Node 6b: independent grounding check on the analyst's own claims
    # (advisory). This is what makes "evidence grounding" measurable.
    if gateway is not None and analysis is not None:
        _record_opinion(
            session,
            application_id=app.id,
            role="CRITIC",
            org_id=org_id,
            request_id=request_id,
            stage="INDEPENDENT_RISK_CRITIC",
            gateway=gateway,
            produce=lambda: gateway.critique(analysis=analysis, evidence=evidence_texts),
        )

    # Node 7: policy decision record (application-level).
    app.status = application_transition(app.status, "POLICY_EVALUATED")
    with record_stage(session, org_id, request_id, "POLICY_ENGINE") as policy_stage:
        allow = result.decision == "APPROVED"
        session.add(
            PolicyDecisionRecord(
                organization_id=app.organization_id,
                subject_type="APPLICATION",
                subject_id=app.id,
                allow=allow,
                deny_json=json.dumps(result.reason_codes),
                engine="local",
            )
        )
        if result.decision == "REJECTED":
            policy_stage.reject(result.reason_codes[0] if result.reason_codes else None)

    # Node 8: final state.
    app.status = application_transition(app.status, result.decision)
    return _store_decision(
        session,
        app,
        result.decision,
        result.approved_limit_minor,
        result.caps,
        result.reason_codes,
        result.receipt,
    )


def _record_opinion(
    session: Session,
    *,
    application_id: str,
    role: str,
    org_id: str,
    request_id: str | None,
    stage: str,
    gateway: ModelGateway,
    produce: Callable[[], RiskOpinion],
) -> None:
    """Run one advisory reasoning role and persist what it said.

    Advisory means advisory. The opinion is recorded for the audit trail and
    the System Intelligence view; it is deliberately NOT fed into decide().
    The deterministic engine's inputs are fixed by policy, and letting a model
    move them would break the one rule this system exists to demonstrate.
    Wiring critic concerns into the decision is a separate change that has to
    re-validate every policy test, not a side effect of adding telemetry.

    A model failure degrades this stage only, never the application.
    """
    with record_stage(session, org_id, request_id, stage) as opinion_stage:
        try:
            opinion = produce()
            session.add(
                LlmAnalysisRun(
                    application_id=application_id,
                    role=role,
                    model_profile=gateway.profile,
                    schema_valid=True,
                    output_json=opinion.model_dump_json(),
                    evidence_ids_json=json.dumps(sorted(opinion.evidence_ids)),
                )
            )
        except ModelUnavailableError as e:
            opinion_stage.fail(e.code.value)
            session.add(
                LlmAnalysisRun(
                    application_id=application_id,
                    role=role,
                    model_profile=getattr(gateway, "profile", "unknown"),
                    schema_valid=False,
                    output_json=json.dumps({"error": str(e)}),
                )
            )


def _passport_cap(session: Session, agent_id: str) -> int:
    from credence.models import AgentPassport

    row = session.execute(
        select(AgentPassport)
        .where(AgentPassport.agent_id == agent_id)
        .order_by(AgentPassport.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    if row is None:
        return 0
    return int(json.loads(row.payload_json).get("max_borrowing_authority_minor", 0))


def _store_decision(
    session: Session,
    app: CreditApplication,
    decision: str,
    approved_limit_minor: int,
    caps: dict,
    reason_codes: list[str],
    receipt: dict,
) -> CreditDecision:
    receipt_hash = hashlib.sha256(
        json.dumps(receipt, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    row = CreditDecision(
        application_id=app.id,
        decision=decision,
        approved_limit_minor=approved_limit_minor,
        caps_json=json.dumps(caps),
        reason_codes_json=json.dumps(reason_codes),
        receipt_hash=receipt_hash,
    )
    session.add(row)
    session.flush()
    append_audit_event(
        session,
        actor_type="SYSTEM",
        actor_id="decision-engine",
        event_type="CREDIT_DECISION",
        payload={
            "application_id": app.id,
            "decision": decision,
            "approved_limit_minor": approved_limit_minor,
            "reason_codes": reason_codes,
            "receipt_hash": receipt_hash,
        },
        organization_id=app.organization_id,
        resource_id=app.id,
    )
    return row


def review_application(
    session: Session,
    *,
    application_id: str,
    reviewer_user_id: str,
    action: str,  # APPROVE | REDUCE | REJECT
    amount_minor: int = 0,
    notes: str = "",
) -> CreditApplication:
    """Human review: may approve, reduce, or reject — never increase beyond
    the deterministic caps recorded in the decision."""
    app = session.get(CreditApplication, application_id)
    if app is None or app.status != "HUMAN_REVIEW_REQUIRED":
        raise CredenceError(ReasonCode.POLICY_DENIED, "application is not awaiting review")
    # What the review actually granted, as opposed to what the caller asked
    # for. An APPROVE carries no amount — it means "the full deterministic
    # cap" — so recording the request parameter stored 0 against an approval
    # that granted the whole limit. The review history rendered "Approve
    # ₹0.00" beside a ₹1,000 approved limit, and the audit event said the
    # same. A REJECT grants nothing, so 0 there is the truth.
    granted = 0
    with record_stage(
        session, app.organization_id, current_request_id(), "HUMAN_REVIEW"
    ) as review_stage:
        decision = session.execute(
            select(CreditDecision).where(CreditDecision.application_id == application_id)
        ).scalar_one()

        if action == "REJECT":
            app.status = application_transition(app.status, "REJECTED")
            # A person deliberately declining is the control system working,
            # not a stage failure.
            review_stage.reject("HUMAN_REJECTED")
        elif action in ("APPROVE", "REDUCE"):
            cap = decision.approved_limit_minor
            granted = cap if action == "APPROVE" else amount_minor
            if granted <= 0 or granted > cap:
                raise CredenceError(
                    ReasonCode.POLICY_DENIED,
                    f"review amount {granted} outside (0, {cap}] deterministic cap",
                )
            decision.approved_limit_minor = granted
            decision.decision = "APPROVED"
            app.status = application_transition(app.status, "APPROVED")
        else:
            raise CredenceError(ReasonCode.POLICY_DENIED, f"unknown review action {action}")

    session.add(
        HumanReview(
            application_id=application_id,
            reviewer_user_id=reviewer_user_id,
            action=action,
            amount_minor=granted,
            notes=notes,
        )
    )
    append_audit_event(
        session,
        actor_type="USER",
        actor_id=reviewer_user_id,
        event_type="HUMAN_REVIEW",
        payload={
            "application_id": application_id,
            "action": action,
            # The amount granted, not the amount requested — see `granted`.
            "amount_minor": granted,
            "requested_amount_minor": amount_minor,
        },
        organization_id=app.organization_id,
        resource_id=application_id,
    )
    return app

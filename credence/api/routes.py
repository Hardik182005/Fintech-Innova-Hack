"""REST API v1 (spec §10). Thin layer over the tested service modules; every
handler is tenant-scoped through the authenticated user's organization."""

from __future__ import annotations

import json

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.api.deps import get_current_user, get_engine, get_session, require_demo_token
from credence.audit import verify_chain
from credence.config import get_settings
from credence.errors import CredenceError
from credence.finance_models import (
    CreditApplication,
    CreditDecision,
    CreditVault,
    Repayment,
    RiskEvent,
    Task,
    TaskEvidence,
)
from credence.ledger import reconcile
from credence.modelgw import build_gateway
from credence.models import Agent, AuditEvent, User
from credence.services import credit, demo, identity, vault_ops

router = APIRouter(prefix="/v1")


def _tenant_or_404(obj, user: User, name: str):
    if obj is None or getattr(obj, "organization_id", None) != user.organization_id:
        raise HTTPException(status_code=404, detail=f"{name} not found")
    return obj


# ---------------------------------------------------------------- identity --


class CreateOrganization(BaseModel):
    name: str = Field(min_length=2, max_length=200)
    owner_email: str


@router.post("/organizations", status_code=201, tags=["identity"])
def create_organization(body: CreateOrganization, session: Session = Depends(get_session)):
    org, owner, token = identity.create_organization(session, body.name, body.owner_email)
    return {
        "organization_id": org.id,
        "owner_user_id": owner.id,
        "owner_api_token": token,  # sandbox bearer token; shown once
        "note": "sandbox tenant — test credits only",
    }


@router.get("/organizations/{organization_id}", tags=["identity"])
def get_organization(
    organization_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    if organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="organization not found")
    from credence.models import Organization

    org = session.get(Organization, organization_id)
    return {"organization_id": org.id, "name": org.name, "status": org.status}


class CreateAgent(BaseModel):
    name: str
    model_provider: str
    model_name: str
    model_version_hash: str


@router.post("/agents", status_code=201, tags=["identity"])
def create_agent(
    body: CreateAgent,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    agent = identity.create_agent(
        session,
        organization_id=user.organization_id,
        owner_user_id=user.id,
        name=body.name,
        model_provider=body.model_provider,
        model_name=body.model_name,
        model_version_hash=body.model_version_hash,
    )
    return {"agent_id": agent.id, "status": agent.status}


class IssuePassport(BaseModel):
    purpose: str
    permitted_task_categories: list[str]
    max_borrowing_authority_minor: int = Field(gt=0)
    max_transaction_value_minor: int = Field(gt=0)
    approved_vendor_ids: list[str] = []
    ttl_hours: int = Field(default=1, ge=1, le=24)


@router.post("/agents/{agent_id}/passport", status_code=201, tags=["identity"])
def issue_passport(
    agent_id: str,
    body: IssuePassport,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(Agent, agent_id), user, "agent")
    row, signed = identity.issue_passport(
        session,
        agent_id=agent_id,
        purpose=body.purpose,
        permitted_task_categories=body.permitted_task_categories,
        max_borrowing_authority_minor=body.max_borrowing_authority_minor,
        max_transaction_value_minor=body.max_transaction_value_minor,
        approved_vendor_ids=body.approved_vendor_ids,
        ttl_hours=body.ttl_hours,
    )
    return {
        "passport_id": row.id,
        "payload": signed.payload.model_dump(mode="json"),
        "signature_b64": signed.signature_b64,
    }


@router.get("/agents/{agent_id}/passport/verify", tags=["identity"])
def verify_passport(
    agent_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(Agent, agent_id), user, "agent")
    valid, reasons = identity.verify_stored_passport(session, agent_id)
    return {"agent_id": agent_id, "valid": valid, "reason_codes": reasons}


class KillSwitchBody(BaseModel):
    reason: str = Field(min_length=3, max_length=500)


def _kill(action: str):
    def handler(
        agent_id: str,
        body: KillSwitchBody,
        session: Session = Depends(get_session),
        user: User = Depends(get_current_user),
    ):
        _tenant_or_404(session.get(Agent, agent_id), user, "agent")
        event = identity.kill_switch(
            session, agent_id=agent_id, actor_id=user.id, action=action, reason=body.reason
        )
        return {
            "agent_id": agent_id,
            "action": action,
            "enforced_at": event.enforced_at.isoformat(),
            "latency_ms": event.latency_ms,
        }

    return handler


router.post("/agents/{agent_id}/revoke", tags=["identity"])(_kill("REVOKE"))
router.post("/agents/{agent_id}/freeze", tags=["identity"])(_kill("FREEZE"))
router.post("/agents/{agent_id}/unfreeze", tags=["identity"])(_kill("UNFREEZE"))


# ------------------------------------------------------------------- tasks --


class CreateTask(BaseModel):
    agent_id: str
    title: str
    description: str = ""
    category: str
    expected_revenue_minor: int = Field(ge=0)
    expected_cost_minor: int = Field(ge=0)
    currency: str = "INR"


@router.post("/tasks", status_code=201, tags=["tasks"])
def create_task(
    body: CreateTask,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(Agent, body.agent_id), user, "agent")
    task = credit.create_task(
        session,
        organization_id=user.organization_id,
        agent_id=body.agent_id,
        title=body.title,
        description=body.description,
        category=body.category,
        expected_revenue_minor=body.expected_revenue_minor,
        expected_cost_minor=body.expected_cost_minor,
        currency=body.currency,
    )
    return {"task_id": task.id, "status": task.status}


class AddEvidence(BaseModel):
    evidence_type: str
    content_text: str = Field(max_length=20_000)
    source: str = "upload"


@router.post("/tasks/{task_id}/evidence", status_code=201, tags=["tasks"])
def add_evidence(
    task_id: str,
    body: AddEvidence,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    evidence = credit.add_evidence(
        session,
        organization_id=user.organization_id,
        task_id=task_id,
        evidence_type=body.evidence_type,
        content_text=body.content_text,
        source=body.source,
    )
    return {"evidence_id": evidence.id, "content_hash": evidence.content_hash}


@router.get("/tasks/{task_id}", tags=["tasks"])
def get_task(
    task_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    task = _tenant_or_404(session.get(Task, task_id), user, "task")
    return {
        "task_id": task.id,
        "agent_id": task.agent_id,
        "title": task.title,
        "category": task.category,
        "status": task.status,
        "expected_revenue_minor": task.expected_revenue_minor,
        "expected_cost_minor": task.expected_cost_minor,
    }


@router.get("/tasks/{task_id}/evidence", tags=["tasks"])
def list_evidence(
    task_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(Task, task_id), user, "task")
    rows = session.execute(
        select(TaskEvidence).where(
            TaskEvidence.task_id == task_id,
            TaskEvidence.organization_id == user.organization_id,
        )
    ).scalars()
    return [
        {"evidence_id": e.id, "type": e.evidence_type, "hash": e.content_hash, "source": e.source}
        for e in rows
    ]


class CreateMandate(BaseModel):
    reserve_cap_minor: int = Field(ge=0)


@router.post("/tasks/{task_id}/revenue-mandate", status_code=201, tags=["tasks"])
def create_mandate(
    task_id: str,
    body: CreateMandate,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(Task, task_id), user, "task")
    mandate = credit.create_mandate(
        session,
        organization_id=user.organization_id,
        task_id=task_id,
        authorized_by_user_id=user.id,
        reserve_cap_minor=body.reserve_cap_minor,
    )
    return {"mandate_id": mandate.id, "status": mandate.status, "locked": mandate.locked}


# ------------------------------------------------------------------ credit --


class CreateApplication(BaseModel):
    agent_id: str
    task_id: str
    requested_minor: int = Field(gt=0)
    requested_duration_hours: int = Field(default=24, ge=1, le=720)
    expected_revenue_minor: int = Field(ge=0)
    expected_cost_minor: int = Field(ge=0)
    owner_exposure_cap_minor: int = Field(ge=0)
    proposed_vendor_ids: list[str]
    currency: str = "INR"


@router.post("/credit-applications", status_code=201, tags=["credit"])
def create_application(
    body: CreateApplication,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(Agent, body.agent_id), user, "agent")
    _tenant_or_404(session.get(Task, body.task_id), user, "task")
    app_row = credit.create_application(
        session,
        organization_id=user.organization_id,
        agent_id=body.agent_id,
        task_id=body.task_id,
        requested_minor=body.requested_minor,
        requested_duration_hours=body.requested_duration_hours,
        expected_revenue_minor=body.expected_revenue_minor,
        expected_cost_minor=body.expected_cost_minor,
        owner_exposure_cap_minor=body.owner_exposure_cap_minor,
        proposed_vendor_ids=body.proposed_vendor_ids,
        currency=body.currency,
    )
    return {"application_id": app_row.id, "status": app_row.status}


@router.post("/credit-applications/{application_id}/evaluate", tags=["credit"])
def evaluate_application(
    application_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    app_row = _tenant_or_404(session.get(CreditApplication, application_id), user, "application")
    decision = credit.evaluate_application(session, app_row.id, build_gateway(get_settings()))
    return {
        "application_id": app_row.id,
        "status": app_row.status,
        "decision": decision.decision,
        "approved_limit_minor": decision.approved_limit_minor,
        "reason_codes": json.loads(decision.reason_codes_json),
        "receipt_hash": decision.receipt_hash,
    }


@router.get("/credit-applications/{application_id}", tags=["credit"])
def get_application(
    application_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    app_row = _tenant_or_404(session.get(CreditApplication, application_id), user, "application")
    return {
        "application_id": app_row.id,
        "status": app_row.status,
        "agent_id": app_row.agent_id,
        "task_id": app_row.task_id,
        "requested_minor": app_row.requested_minor,
        "currency": app_row.currency,
    }


@router.get("/credit-applications/{application_id}/decision-receipt", tags=["credit"])
def decision_receipt(
    application_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditApplication, application_id), user, "application")
    decision = session.execute(
        select(CreditDecision).where(CreditDecision.application_id == application_id)
    ).scalar_one_or_none()
    if decision is None:
        raise HTTPException(status_code=404, detail="no decision yet")
    return {
        "application_id": application_id,
        "decision": decision.decision,
        "approved_limit_minor": decision.approved_limit_minor,
        "caps": json.loads(decision.caps_json),
        "reason_codes": json.loads(decision.reason_codes_json),
        "receipt_hash": decision.receipt_hash,
        "is_simulation": True,
    }


class ReviewBody(BaseModel):
    action: str = Field(pattern="^(APPROVE|REDUCE|REJECT)$")
    amount_minor: int = Field(default=0, ge=0)
    notes: str = ""


@router.post("/credit-applications/{application_id}/review", tags=["credit"])
def review_application(
    application_id: str,
    body: ReviewBody,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditApplication, application_id), user, "application")
    app_row = credit.review_application(
        session,
        application_id=application_id,
        reviewer_user_id=user.id,
        action=body.action,
        amount_minor=body.amount_minor,
        notes=body.notes,
    )
    return {"application_id": application_id, "status": app_row.status}


# ------------------------------------------------------------------ vaults --


class CreateVault(BaseModel):
    application_id: str
    per_transaction_limit_minor: int | None = Field(default=None, gt=0)


@router.post("/vaults", status_code=201, tags=["vault"])
def create_vault(
    body: CreateVault,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditApplication, body.application_id), user, "application")
    vault = vault_ops.create_vault(session, body.application_id, body.per_transaction_limit_minor)
    return {
        "vault_id": vault.id,
        "status": vault.status,
        "total_limit_minor": vault.total_limit_minor,
    }


@router.get("/vaults/{vault_id}", tags=["vault"])
def get_vault(
    vault_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    vault = _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    return {
        "vault_id": vault.id,
        "status": vault.status,
        "currency": vault.currency,
        "total_limit_minor": vault.total_limit_minor,
        "spent_minor": vault.spent_minor,
        "per_transaction_limit_minor": vault.per_transaction_limit_minor,
        "principal_outstanding_minor": vault.principal_outstanding_minor,
        "fee_due_minor": vault.fee_due_minor,
        "expires_at": vault.expires_at.isoformat(),
        "frozen_reason": vault.frozen_reason,
    }


class ProposeTransaction(BaseModel):
    vendor_id: str
    amount_minor: int = Field(gt=0)
    purpose_code: str
    idempotency_key: str = Field(min_length=8, max_length=128)
    currency: str = "INR"


@router.post("/vaults/{vault_id}/transactions/propose", status_code=201, tags=["vault"])
def propose_transaction(
    vault_id: str,
    body: ProposeTransaction,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    proposal = vault_ops.propose_transaction(
        session,
        vault_id=vault_id,
        vendor_id=body.vendor_id,
        amount_minor=body.amount_minor,
        purpose_code=body.purpose_code,
        idempotency_key=body.idempotency_key,
        currency=body.currency,
    )
    return {
        "proposal_id": proposal.id,
        "status": proposal.status,
        "reason_codes": json.loads(proposal.reason_codes_json),
    }


@router.post("/vaults/{vault_id}/transactions/{proposal_id}/execute", tags=["vault"])
def execute_transaction(
    vault_id: str,
    proposal_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    txn = vault_ops.execute_transaction(session, proposal_id)
    return {
        "transaction_id": txn.id,
        "vault_id": txn.vault_id,
        "vendor_id": txn.vendor_id,
        "amount_minor": txn.amount_minor,
        "journal_transaction_id": txn.journal_transaction_id,
    }


@router.post("/vaults/{vault_id}/freeze", tags=["vault"])
def freeze_vault(
    vault_id: str,
    body: KillSwitchBody,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    vault = vault_ops.freeze_vault(session, vault_id, user.id, body.reason)
    return {"vault_id": vault_id, "status": vault.status}


@router.post("/vaults/{vault_id}/close", tags=["vault"])
def close_vault(
    vault_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    vault = vault_ops.close_vault(session, vault_id, user.id)
    return {"vault_id": vault_id, "status": vault.status}


class RevenueBody(BaseModel):
    amount_minor: int = Field(gt=0)
    external_event_id: str = Field(min_length=8, max_length=128)
    currency: str = "INR"
    task_completed: bool = True


@router.post("/vaults/{vault_id}/revenue", tags=["repayment"])
def receive_revenue(
    vault_id: str,
    body: RevenueBody,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    repayment = vault_ops.receive_revenue(
        session,
        vault_id=vault_id,
        amount_minor=body.amount_minor,
        external_event_id=body.external_event_id,
        currency=body.currency,
        task_completed=body.task_completed,
    )
    return {
        "repayment_id": repayment.id,
        "principal_minor": repayment.principal_minor,
        "fee_minor": repayment.fee_minor,
        "owner_minor": repayment.owner_minor,
        "allocations": json.loads(repayment.allocations_json),
    }


@router.get("/vaults/{vault_id}/repayment-receipt", tags=["repayment"])
def repayment_receipt(
    vault_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    rows = list(
        session.execute(
            select(Repayment).where(Repayment.vault_id == vault_id).order_by(Repayment.created_at)
        ).scalars()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="no repayments yet")
    return [
        {
            "repayment_id": r.id,
            "kind": r.kind,
            "allocations": json.loads(r.allocations_json),
            "principal_minor": r.principal_minor,
            "fee_minor": r.fee_minor,
            "reserve_minor": r.reserve_minor,
            "owner_minor": r.owner_minor,
            "loss_minor": r.loss_minor,
            "journal_transaction_id": r.journal_transaction_id,
        }
        for r in rows
    ]


@router.post("/vaults/{vault_id}/simulate-failure", tags=["repayment"])
def simulate_failure(
    vault_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    _tenant_or_404(session.get(CreditVault, vault_id), user, "vault")
    recovery = vault_ops.simulate_failure(session, vault_id)
    return {
        "repayment_id": recovery.id,
        "kind": recovery.kind,
        "swept_minor": recovery.principal_minor,
        "reserve_drawn_minor": recovery.reserve_minor,
        "simulated_loss_minor": recovery.loss_minor,
        "allocations": json.loads(recovery.allocations_json),
    }


# -------------------------------------------------------- monitoring/audit --


@router.get("/risk/events", tags=["monitoring"])
def list_risk_events(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rows = session.execute(
        select(RiskEvent)
        .where(RiskEvent.organization_id == user.organization_id)
        .order_by(RiskEvent.created_at.desc())
        .limit(100)
    ).scalars()
    return [
        {
            "id": r.id,
            "event_type": r.event_type,
            "severity": r.severity,
            "subject_type": r.subject_type,
            "subject_id": r.subject_id,
            "detail": json.loads(r.detail_json),
            "created_at": r.created_at.isoformat(),
        }
        for r in rows
    ]


@router.get("/audit/events", tags=["audit"])
def list_audit_events(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    rows = session.execute(
        select(AuditEvent)
        .where(AuditEvent.organization_id == user.organization_id)
        .order_by(AuditEvent.seq.desc())
        .limit(200)
    ).scalars()
    return [
        {
            "id": e.id,
            "seq": e.seq,
            "actor_type": e.actor_type,
            "event_type": e.event_type,
            "resource_id": e.resource_id,
            "event_hash": e.event_hash,
            "prev_hash": e.prev_hash,
            "created_at": e.created_at.isoformat(),
        }
        for e in rows
    ]


@router.get("/audit/chain/verify", tags=["audit"])
def verify_audit_chain(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    intact, broken_seq = verify_chain(session)
    return {"intact": intact, "first_broken_seq": broken_seq}


@router.get("/metrics/evaluation", tags=["monitoring"])
def evaluation_metrics(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
):
    imbalance = reconcile(session)
    intact, _ = verify_chain(session)
    return {
        "ledger_balanced": imbalance == {},
        "ledger_imbalance": imbalance,
        "audit_chain_intact": intact,
        "environment": get_settings().environment.value,
        "run_mode": get_settings().run_mode.value,
        "test_credits_only": True,
    }


# ------------------------------------------------------------ localization --


@router.get("/localization/locales", tags=["localization"])
def list_locales():
    from credence.localization.catalogs import LOCALES, REVIEW_PENDING

    return [{"locale": locale, "review_pending": REVIEW_PENDING[locale]} for locale in LOCALES]


@router.get("/localization/catalog/{locale}", tags=["localization"])
def get_catalog(locale: str):
    from credence.localization.catalogs import CATALOGS, GLOSSARY, REVIEW_PENDING

    if locale not in CATALOGS:
        raise HTTPException(status_code=404, detail="unknown locale")
    return {
        "locale": locale,
        "review_pending": REVIEW_PENDING[locale],
        "catalog": CATALOGS[locale],
        "glossary": GLOSSARY.get(locale, {}),
        "note": "decision codes, amounts, and IDs are canonical and never translated",
    }


class TranslateExplanation(BaseModel):
    locale: str
    canonical_text: str = Field(max_length=4000)


@router.post("/localization/translate-explanation", tags=["localization"])
def translate_explanation(
    body: TranslateExplanation,
    user: User = Depends(get_current_user),
):
    """Translate an already-authorized, redacted explanation. In LOCAL_DEV /
    degraded profiles the canonical text is returned unchanged (fail closed);
    when the local model translates, numeric parity is verified and any
    mismatch falls back to canonical."""
    from credence.localization.catalogs import CATALOGS
    from credence.localization.service import verify_numeric_parity

    if body.locale not in CATALOGS:
        raise HTTPException(status_code=404, detail="unknown locale")
    translated = body.canonical_text  # model-backed translation lands in P4
    parity_ok, mismatches = verify_numeric_parity(body.canonical_text, translated)
    return {
        "locale": body.locale,
        "canonical_text": body.canonical_text,
        "translated_text": translated if parity_ok else body.canonical_text,
        "numeric_parity_verified": parity_ok,
        "mismatches": mismatches,
    }


# -------------------------------------------------------------------- demo --

demo_router = APIRouter(prefix="/v1/demo", dependencies=[Depends(require_demo_token)])


@demo_router.post("/reset", tags=["demo"])
def demo_reset():
    from credence.db import Base

    engine = get_engine()
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    return {"status": "reset", "environment": get_settings().environment.value}


@demo_router.post("/scenarios/{name}", tags=["demo"])
def run_scenario(
    name: str,
    session: Session = Depends(get_session),
    authorization: str = Header(default=""),
):
    """Run a judge scenario.

    Unauthenticated, the scenario builds its own throwaway organization.
    With a bearer token, it seeds into that caller's organization instead, so
    the run appears on their agents, vaults and audit pages. Only a holder of
    the organization's own token can reach that path.
    """
    runner = demo.SCENARIOS.get(name)
    if runner is None:
        raise HTTPException(status_code=404, detail=f"unknown scenario: {sorted(demo.SCENARIOS)}")

    into = None
    token = authorization.removeprefix("Bearer ").strip()
    if token:
        into = identity.authenticate(session, token)
        if into is None:
            raise HTTPException(status_code=401, detail="invalid bearer token")
    try:
        return runner(session, build_gateway(get_settings()), into=into)
    except CredenceError as e:
        raise HTTPException(
            status_code=422, detail={"code": e.code.value, "detail": e.detail}
        ) from e

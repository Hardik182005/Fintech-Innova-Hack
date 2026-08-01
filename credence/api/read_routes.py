"""Read-side API: directory listings, aggregates, and the composed detail
views the operator console renders.

Everything here is derived from records the write-side services already
produce — no endpoint in this module creates, changes, or authorizes any
financial state, and no number is sourced from model output. Every handler is
scoped to the caller's organization.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.api.deps import get_current_user, get_session
from credence.audit import verify_chain
from credence.finance_models import (
    CreditApplication,
    CreditDecision,
    CreditVault,
    HumanReview,
    LlmAnalysisRun,
    PolicyDecisionRecord,
    Repayment,
    RevenueEvent,
    RevenueMandate,
    RiskEvent,
    RiskModelRun,
    Task,
    TaskEvidence,
    TransactionProposal,
    UnderwritingFeatures,
    VaultTransaction,
    VaultVendorAllowlist,
)
from credence.ledger import reconcile
from credence.models import Agent, AgentPassport, AuditEvent, Organization, User, Vendor
from credence.underwriting import compute_features

read_router = APIRouter(prefix="/v1")

PPM = 1_000_000

# Vault states that still carry lender exposure.
LIVE_VAULT_STATUSES = ("CREATED", "ACTIVE", "SPENDING", "FROZEN", "PARTIALLY_REPAID")
TERMINAL_VAULT_STATUSES = ("CLOSED", "REPAID", "DEFAULTED", "EXPIRED")


def _iso(value: datetime | None) -> str | None:
    return value.isoformat() if value is not None else None


def _loads(raw: str | None, fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (TypeError, ValueError):
        return fallback


def _own(obj: Any, user: User, name: str) -> Any:
    if obj is None or getattr(obj, "organization_id", None) != user.organization_id:
        raise HTTPException(status_code=404, detail=f"{name} not found")
    return obj


def _scoped(session: Session, model: Any, user: User) -> list[Any]:
    return list(
        session.execute(
            select(model).where(model.organization_id == user.organization_id)
        ).scalars()
    )


# ------------------------------------------------------------------ scoring --


def trust_score(features: Any) -> int:
    """Deterministic 0–100 composite of an agent's recorded behaviour.

    Built from the same Layer-A features that feed the underwriting scorecard:
    task success and repayment rates, penalised by policy violations and
    blocked spend attempts. No model output participates. A brand-new agent
    scores a neutral 50 because absence of history is neither good nor bad.
    """
    if features.is_first_credit:
        return 50
    success = features.task_success_rate_ppm // 10_000  # ppm -> percent
    repayment = features.repayment_rate_ppm // 10_000
    penalty = min(40, features.policy_violation_count * 8 + features.blocked_spend_attempts * 4)
    return max(0, min(100, (success * 45 + repayment * 55) // 100 - penalty))


def risk_tier(score: int) -> str:
    """Bands over `trust_score`. Presentation only — credit limits come from
    the deterministic decision engine, never from this label."""
    if score >= 75:
        return "LOW"
    if score >= 50:
        return "MEDIUM"
    return "HIGH"


# ------------------------------------------------------------- organization --


# Deliberately not /v1/organizations/current: that path is captured by the
# existing /v1/organizations/{organization_id} route, which is registered first
# and would read "current" as an id. A literal segment under a collection that
# already has an id parameter is a standing trap, so this sits outside it.
@read_router.get("/me", tags=["identity"])
def current_organization(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    org = session.get(Organization, user.organization_id)
    if org is None:
        raise HTTPException(status_code=404, detail="organization not found")
    return {
        "organization_id": org.id,
        "name": org.name,
        "status": org.status,
        "created_at": _iso(org.created_at),
        "user": {"id": user.id, "email": user.email, "role": user.role},
    }


# ------------------------------------------------------------------- agents --


def _agent_row(session: Session, agent: Agent, owners: dict[str, str]) -> dict:
    features = compute_features(session, agent.id)
    score = trust_score(features)
    vaults = list(
        session.execute(select(CreditVault).where(CreditVault.agent_id == agent.id)).scalars()
    )
    exposure = sum(
        v.principal_outstanding_minor for v in vaults if v.status not in TERMINAL_VAULT_STATUSES
    )
    passport = session.execute(
        select(AgentPassport)
        .where(AgentPassport.agent_id == agent.id)
        .order_by(AgentPassport.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    last_task = session.execute(
        select(Task).where(Task.agent_id == agent.id).order_by(Task.created_at.desc()).limit(1)
    ).scalar_one_or_none()
    activity = [agent.created_at, last_task.created_at if last_task else None]
    activity += [v.updated_at for v in vaults]
    return {
        "agent_id": agent.id,
        "name": agent.name,
        "status": agent.status,
        "model_provider": agent.model_provider,
        "model_name": agent.model_name,
        "model_version_hash": agent.model_version_hash,
        "owner_user_id": agent.owner_user_id,
        "owner_email": owners.get(agent.owner_user_id, ""),
        "trust_score": score,
        "risk_tier": risk_tier(score),
        "task_success_rate_ppm": features.task_success_rate_ppm,
        "repayment_rate_ppm": features.repayment_rate_ppm,
        "tasks_total": features.tasks_total,
        "policy_violation_count": features.policy_violation_count,
        "blocked_spend_attempts": features.blocked_spend_attempts,
        "active_exposure_minor": exposure,
        "vault_count": len(vaults),
        "has_passport": passport is not None,
        "passport_expires_at": _iso(passport.expires_at) if passport else None,
        "created_at": _iso(agent.created_at),
        "last_activity_at": _iso(max([a for a in activity if a is not None], default=None)),
    }


@read_router.get("/agents", tags=["identity"])
def list_agents(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    agents = _scoped(session, Agent, user)
    owners = {u.id: u.email for u in _scoped(session, User, user)}
    rows = [_agent_row(session, a, owners) for a in agents]
    return sorted(rows, key=lambda r: r["created_at"] or "", reverse=True)


@read_router.get("/agents/{agent_id}/profile", tags=["identity"])
def agent_profile(
    agent_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    agent = _own(session.get(Agent, agent_id), user, "agent")
    owners = {u.id: u.email for u in _scoped(session, User, user)}
    summary = _agent_row(session, agent, owners)
    features = compute_features(session, agent.id)

    passport = session.execute(
        select(AgentPassport)
        .where(AgentPassport.agent_id == agent_id)
        .order_by(AgentPassport.created_at.desc())
        .limit(1)
    ).scalar_one_or_none()
    passport_view = None
    if passport is not None:
        payload = _loads(passport.payload_json, {})
        # The signature itself is deliberately not returned: it is a
        # credential, not display data. Verification status is.
        from credence.services.identity import verify_stored_passport

        valid, reasons = verify_stored_passport(session, agent_id)
        passport_view = {
            "passport_id": passport.id,
            "issuer": passport.issuer,
            "key_version": passport.key_version,
            "purpose": payload.get("purpose", ""),
            "permitted_task_categories": payload.get("permitted_task_categories", []),
            "max_borrowing_authority_minor": payload.get("max_borrowing_authority_minor", 0),
            "max_transaction_value_minor": payload.get("max_transaction_value_minor", 0),
            "approved_vendor_ids": payload.get("approved_vendor_ids", []),
            "audience": payload.get("audience", ""),
            "valid_from": _iso(passport.valid_from),
            "expires_at": _iso(passport.expires_at),
            "signature_verified": valid,
            "reason_codes": reasons,
        }

    tasks = [t for t in _scoped(session, Task, user) if t.agent_id == agent_id]
    apps = [a for a in _scoped(session, CreditApplication, user) if a.agent_id == agent_id]
    decisions = {
        d.application_id: d
        for d in session.execute(
            select(CreditDecision).where(
                CreditDecision.application_id.in_([a.id for a in apps] or [""])
            )
        ).scalars()
    }
    vaults = [v for v in _scoped(session, CreditVault, user) if v.agent_id == agent_id]
    vault_ids = [v.id for v in vaults] or [""]
    txns = list(
        session.execute(
            select(VaultTransaction).where(VaultTransaction.vault_id.in_(vault_ids))
        ).scalars()
    )
    proposals = list(
        session.execute(
            select(TransactionProposal).where(TransactionProposal.vault_id.in_(vault_ids))
        ).scalars()
    )
    repayments = list(
        session.execute(select(Repayment).where(Repayment.vault_id.in_(vault_ids))).scalars()
    )

    by_vendor: dict[str, dict[str, int]] = {}
    for t in txns:
        slot = by_vendor.setdefault(t.vendor_id, {"count": 0, "amount_minor": 0})
        slot["count"] += 1
        slot["amount_minor"] += t.amount_minor

    blocked = [p for p in proposals if p.status == "DENIED"]
    violations: dict[str, int] = {}
    for p in blocked:
        for code in _loads(p.reason_codes_json, []):
            violations[code] = violations.get(code, 0) + 1

    risk_events = [
        r
        for r in _scoped(session, RiskEvent, user)
        if r.subject_id == agent_id or r.subject_id in set(vault_ids)
    ]
    audit = [
        e
        for e in _scoped(session, AuditEvent, user)
        if e.resource_id == agent_id
        or e.resource_id in {a.id for a in apps} | set(vault_ids) | {t.id for t in tasks}
    ]

    return {
        **summary,
        "features": features.as_dict(),
        "passport": passport_view,
        "tasks": [
            {
                "task_id": t.id,
                "title": t.title,
                "category": t.category,
                "status": t.status,
                "expected_revenue_minor": t.expected_revenue_minor,
                "expected_cost_minor": t.expected_cost_minor,
                "expected_margin_minor": t.expected_revenue_minor - t.expected_cost_minor,
                "created_at": _iso(t.created_at),
            }
            for t in sorted(tasks, key=lambda t: t.created_at, reverse=True)
        ],
        "credit_history": [
            {
                "application_id": a.id,
                "task_id": a.task_id,
                "status": a.status,
                "requested_minor": a.requested_minor,
                "approved_limit_minor": (
                    decisions[a.id].approved_limit_minor if a.id in decisions else 0
                ),
                "decision": decisions[a.id].decision if a.id in decisions else None,
                "created_at": _iso(a.created_at),
            }
            for a in sorted(apps, key=lambda a: a.created_at, reverse=True)
        ],
        "vaults": [
            {
                "vault_id": v.id,
                "status": v.status,
                "total_limit_minor": v.total_limit_minor,
                "spent_minor": v.spent_minor,
                "principal_outstanding_minor": v.principal_outstanding_minor,
                "created_at": _iso(v.created_at),
            }
            for v in sorted(vaults, key=lambda v: v.created_at, reverse=True)
        ],
        "spending_behaviour": {
            "vendor_distribution": [
                {"vendor_id": k, **v}
                for k, v in sorted(
                    by_vendor.items(), key=lambda kv: kv[1]["amount_minor"], reverse=True
                )
            ],
            "executed_count": len(txns),
            "blocked_count": len(blocked),
            "policy_violations": [
                {"reason_code": k, "count": v}
                for k, v in sorted(violations.items(), key=lambda kv: kv[1], reverse=True)
            ],
        },
        "repayments": [
            {
                "repayment_id": r.id,
                "vault_id": r.vault_id,
                "kind": r.kind,
                "principal_minor": r.principal_minor,
                "fee_minor": r.fee_minor,
                "owner_minor": r.owner_minor,
                "loss_minor": r.loss_minor,
                "created_at": _iso(r.created_at),
            }
            for r in sorted(repayments, key=lambda r: r.created_at, reverse=True)
        ],
        "risk_events": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "severity": r.severity,
                "subject_type": r.subject_type,
                "subject_id": r.subject_id,
                "detail": _loads(r.detail_json, {}),
                "created_at": _iso(r.created_at),
            }
            for r in sorted(risk_events, key=lambda r: r.created_at, reverse=True)[:50]
        ],
        "audit_events": [
            {
                "seq": e.seq,
                "event_type": e.event_type,
                "actor_type": e.actor_type,
                "resource_id": e.resource_id,
                "created_at": _iso(e.created_at),
            }
            for e in sorted(audit, key=lambda e: e.seq, reverse=True)[:50]
        ],
    }


# -------------------------------------------------------------------- tasks --


@read_router.get("/tasks", tags=["tasks"])
def list_tasks(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    agents = {a.id: a.name for a in _scoped(session, Agent, user)}
    tasks = _scoped(session, Task, user)
    return [
        {
            "task_id": t.id,
            "agent_id": t.agent_id,
            "agent_name": agents.get(t.agent_id, ""),
            "title": t.title,
            "category": t.category,
            "status": t.status,
            "currency": t.currency,
            "expected_revenue_minor": t.expected_revenue_minor,
            "expected_cost_minor": t.expected_cost_minor,
            "expected_margin_minor": t.expected_revenue_minor - t.expected_cost_minor,
            "created_at": _iso(t.created_at),
        }
        for t in sorted(tasks, key=lambda t: t.created_at, reverse=True)
    ]


# ----------------------------------------------------- credit applications --


def _application_rows(session: Session, user: User) -> list[dict]:
    apps = _scoped(session, CreditApplication, user)
    agents = {a.id: a.name for a in _scoped(session, Agent, user)}
    tasks = {t.id: t for t in _scoped(session, Task, user)}
    app_ids = [a.id for a in apps] or [""]
    decisions = {
        d.application_id: d
        for d in session.execute(
            select(CreditDecision).where(CreditDecision.application_id.in_(app_ids))
        ).scalars()
    }
    reviews: dict[str, HumanReview] = {}
    for r in session.execute(
        select(HumanReview).where(HumanReview.application_id.in_(app_ids))
    ).scalars():
        reviews[r.application_id] = r
    risk_runs = {
        r.application_id: r
        for r in session.execute(
            select(RiskModelRun).where(RiskModelRun.application_id.in_(app_ids))
        ).scalars()
    }
    vaults = {v.application_id: v for v in _scoped(session, CreditVault, user)}

    rows = []
    for a in apps:
        decision = decisions.get(a.id)
        run = risk_runs.get(a.id)
        review = reviews.get(a.id)
        task = tasks.get(a.task_id)
        rows.append(
            {
                "application_id": a.id,
                "agent_id": a.agent_id,
                "agent_name": agents.get(a.agent_id, ""),
                "task_id": a.task_id,
                "task_title": task.title if task else "",
                "status": a.status,
                "currency": a.currency,
                "requested_minor": a.requested_minor,
                "approved_limit_minor": decision.approved_limit_minor if decision else 0,
                "decision": decision.decision if decision else None,
                "reason_codes": _loads(decision.reason_codes_json, []) if decision else [],
                "receipt_hash": decision.receipt_hash if decision else None,
                "expected_revenue_minor": a.expected_revenue_minor,
                "expected_cost_minor": a.expected_cost_minor,
                "expected_margin_minor": a.expected_revenue_minor - a.expected_cost_minor,
                "requested_duration_hours": a.requested_duration_hours,
                "pd_ppm": run.pd_ppm if run else None,
                "expected_loss_minor": run.expected_loss_minor if run else None,
                "human_review": (
                    {
                        "action": review.action,
                        "amount_minor": review.amount_minor,
                        "notes": review.notes,
                        "created_at": _iso(review.created_at),
                    }
                    if review
                    else None
                ),
                "vault_id": vaults[a.id].id if a.id in vaults else None,
                "created_at": _iso(a.created_at),
                "updated_at": _iso(a.updated_at),
            }
        )
    return sorted(rows, key=lambda r: r["created_at"] or "", reverse=True)


@read_router.get("/credit-applications", tags=["credit"])
def list_applications(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    return _application_rows(session, user)


@read_router.get("/credit-applications/{application_id}/underwriting", tags=["credit"])
def underwriting_detail(
    application_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    """The three-panel judge view: what the model suggested, what the
    deterministic engine computed, and what an independent check of the
    model's claims against stored evidence concludes."""
    app = _own(session.get(CreditApplication, application_id), user, "application")
    task = session.get(Task, app.task_id)
    agent = session.get(Agent, app.agent_id)
    decision = session.execute(
        select(CreditDecision).where(CreditDecision.application_id == application_id)
    ).scalar_one_or_none()
    features_row = session.execute(
        select(UnderwritingFeatures).where(UnderwritingFeatures.application_id == application_id)
    ).scalar_one_or_none()
    risk_run = session.execute(
        select(RiskModelRun).where(RiskModelRun.application_id == application_id)
    ).scalar_one_or_none()
    llm_runs = list(
        session.execute(
            select(LlmAnalysisRun).where(LlmAnalysisRun.application_id == application_id)
        ).scalars()
    )
    policy_rows = list(
        session.execute(
            select(PolicyDecisionRecord).where(
                PolicyDecisionRecord.subject_id == application_id,
                PolicyDecisionRecord.subject_type == "APPLICATION",
            )
        ).scalars()
    )
    reviews = list(
        session.execute(
            select(HumanReview).where(HumanReview.application_id == application_id)
        ).scalars()
    )
    evidence = list(
        session.execute(
            select(TaskEvidence).where(
                TaskEvidence.task_id == app.task_id,
                TaskEvidence.organization_id == user.organization_id,
            )
        ).scalars()
    )
    mandate = session.execute(
        select(RevenueMandate).where(RevenueMandate.task_id == app.task_id)
    ).scalar_one_or_none()

    # ---- AI recommendation panel (advisory; never a source of numbers) ----
    analyst = next((r for r in llm_runs if r.role == "TASK_ANALYST"), None)
    analysis = _loads(analyst.output_json, {}) if analyst else {}
    claims = analysis.get("claims", []) if isinstance(analysis, dict) else []

    # ---- Independent verifier: deterministic recheck of every claim ----
    valid_ids = {e.id for e in evidence}
    supported, unsupported = [], []
    for claim in claims:
        cited = list(claim.get("evidence_ids", []))
        unknown = [i for i in cited if i not in valid_ids]
        entry = {
            "claim_id": claim.get("claim_id"),
            "text": claim.get("text", ""),
            "evidence_ids": cited,
            "unknown_evidence_ids": unknown,
        }
        (unsupported if (unknown or not cited) else supported).append(entry)

    verifier = {
        "claims_total": len(claims),
        "claims_supported": len(supported),
        "claims_unsupported": len(unsupported),
        "supported": supported,
        "unsupported": unsupported,
        "risk_flags": analysis.get("risk_flags", []) if isinstance(analysis, dict) else [],
        "model_output_schema_valid": bool(analyst.schema_valid) if analyst else False,
        "model_influenced_amounts": False,
        "verdict": (
            "NO_MODEL_ANALYSIS"
            if analyst is None
            else "CONTRADICTIONS_FOUND"
            if unsupported
            else "CLAIMS_TRACE_TO_EVIDENCE"
        ),
        "note": (
            "Every amount in the decision comes from the deterministic engine. "
            "The model's role is limited to extracting claims that must cite "
            "stored evidence; unciteable claims are reported, never priced."
        ),
    }

    return {
        "application": {
            "application_id": app.id,
            "status": app.status,
            "currency": app.currency,
            "requested_minor": app.requested_minor,
            "requested_duration_hours": app.requested_duration_hours,
            "expected_revenue_minor": app.expected_revenue_minor,
            "expected_cost_minor": app.expected_cost_minor,
            "expected_margin_minor": app.expected_revenue_minor - app.expected_cost_minor,
            "owner_exposure_cap_minor": app.owner_exposure_cap_minor,
            "proposed_vendor_ids": _loads(app.proposed_vendors_json, []),
            "created_at": _iso(app.created_at),
        },
        "agent": (
            {
                "agent_id": agent.id,
                "name": agent.name,
                "status": agent.status,
                "model_name": agent.model_name,
            }
            if agent
            else None
        ),
        "task": (
            {
                "task_id": task.id,
                "title": task.title,
                "description": task.description,
                "category": task.category,
                "status": task.status,
            }
            if task
            else None
        ),
        "revenue_mandate": (
            {
                "mandate_id": mandate.id,
                "status": mandate.status,
                "locked": mandate.locked,
                "reserve_cap_minor": mandate.reserve_cap_minor,
                "destination_account_code": mandate.destination_account_code,
            }
            if mandate
            else None
        ),
        "evidence": [
            {
                "evidence_id": e.id,
                "evidence_type": e.evidence_type,
                "source": e.source,
                "content_hash": e.content_hash,
                "content_text": e.content_text,
                "created_at": _iso(e.created_at),
            }
            for e in evidence
        ],
        "ai_recommendation": (
            {
                "role": analyst.role,
                "model_profile": analyst.model_profile,
                "schema_valid": analyst.schema_valid,
                "summary": analysis.get("summary", "") if isinstance(analysis, dict) else "",
                "claims": claims,
                "risk_flags": analysis.get("risk_flags", []) if isinstance(analysis, dict) else [],
                "missing_evidence": (
                    analysis.get("missing_evidence", []) if isinstance(analysis, dict) else []
                ),
                "evidence_ids": _loads(analyst.evidence_ids_json, []),
                "created_at": _iso(analyst.created_at),
            }
            if analyst
            else None
        ),
        "deterministic_engine": (
            {
                "decision": decision.decision,
                "approved_limit_minor": decision.approved_limit_minor,
                "caps": _loads(decision.caps_json, {}),
                "reason_codes": _loads(decision.reason_codes_json, []),
                "receipt_hash": decision.receipt_hash,
                "created_at": _iso(decision.created_at),
                "pd_ppm": risk_run.pd_ppm if risk_run else None,
                "lgd_ppm": risk_run.lgd_ppm if risk_run else None,
                "ead_minor": risk_run.ead_minor if risk_run else None,
                "expected_loss_minor": risk_run.expected_loss_minor if risk_run else None,
                "model_name": risk_run.model_name if risk_run else None,
                "is_simulation": True,
                "features": _loads(features_row.features_json, {}) if features_row else {},
            }
            if decision
            else None
        ),
        "verifier": verifier,
        "policy_decisions": [
            {
                "engine": p.engine,
                "allow": p.allow,
                "deny": _loads(p.deny_json, []),
                "policy_version": p.policy_version,
                "created_at": _iso(p.created_at),
            }
            for p in policy_rows
        ],
        "human_reviews": [
            {
                "action": r.action,
                "amount_minor": r.amount_minor,
                "notes": r.notes,
                "reviewer_user_id": r.reviewer_user_id,
                "created_at": _iso(r.created_at),
            }
            for r in sorted(reviews, key=lambda r: r.created_at)
        ],
    }


@read_router.get("/underwriting/queue", tags=["credit"])
def underwriting_queue(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    rows = _application_rows(session, user)
    buckets: dict[str, list[dict]] = {
        "awaiting_ai_analysis": [],
        "awaiting_deterministic_decision": [],
        "awaiting_human_review": [],
        "recently_completed": [],
    }
    for row in rows:
        status = row["status"]
        if status == "DRAFT":
            buckets["awaiting_ai_analysis"].append(row)
        elif status in ("IDENTITY_VERIFIED", "EVIDENCE_READY", "UNDERWRITING", "POLICY_EVALUATED"):
            buckets["awaiting_deterministic_decision"].append(row)
        elif status == "HUMAN_REVIEW_REQUIRED":
            buckets["awaiting_human_review"].append(row)
        else:
            buckets["recently_completed"].append(row)
    buckets["recently_completed"] = buckets["recently_completed"][:20]
    return {
        "buckets": buckets,
        "counts": {k: len(v) for k, v in buckets.items()},
    }


# ------------------------------------------------------------------- vaults --


def _vault_row(v: CreditVault, agents: dict[str, str], tasks: dict[str, str]) -> dict:
    return {
        "vault_id": v.id,
        "agent_id": v.agent_id,
        "agent_name": agents.get(v.agent_id, ""),
        "task_id": v.task_id,
        "task_title": tasks.get(v.task_id, ""),
        "application_id": v.application_id,
        "status": v.status,
        "currency": v.currency,
        "total_limit_minor": v.total_limit_minor,
        "spent_minor": v.spent_minor,
        "remaining_minor": max(0, v.total_limit_minor - v.spent_minor),
        "per_transaction_limit_minor": v.per_transaction_limit_minor,
        "daily_limit_minor": v.daily_limit_minor,
        "principal_outstanding_minor": v.principal_outstanding_minor,
        "fee_due_minor": v.fee_due_minor,
        "reserve_drawn_minor": v.reserve_drawn_minor,
        "transaction_count": v.transaction_count,
        "max_transactions": v.max_transactions,
        "frozen_reason": v.frozen_reason,
        "expires_at": _iso(v.expires_at),
        "created_at": _iso(v.created_at),
        "updated_at": _iso(v.updated_at),
    }


@read_router.get("/vaults", tags=["vault"])
def list_vaults(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    agents = {a.id: a.name for a in _scoped(session, Agent, user)}
    tasks = {t.id: t.title for t in _scoped(session, Task, user)}
    vaults = _scoped(session, CreditVault, user)
    return sorted(
        (_vault_row(v, agents, tasks) for v in vaults),
        key=lambda r: r["created_at"] or "",
        reverse=True,
    )


@read_router.get("/vaults/{vault_id}/detail", tags=["vault"])
def vault_detail(
    vault_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    vault = _own(session.get(CreditVault, vault_id), user, "vault")
    agents = {a.id: a.name for a in _scoped(session, Agent, user)}
    tasks = {t.id: t.title for t in _scoped(session, Task, user)}
    agent = session.get(Agent, vault.agent_id)

    allow_rows = list(
        session.execute(
            select(VaultVendorAllowlist).where(VaultVendorAllowlist.vault_id == vault_id)
        ).scalars()
    )
    vendors = {v.id: v for v in session.execute(select(Vendor)).scalars()}
    proposals = list(
        session.execute(
            select(TransactionProposal).where(TransactionProposal.vault_id == vault_id)
        ).scalars()
    )
    txns = {
        t.proposal_id: t
        for t in session.execute(
            select(VaultTransaction).where(VaultTransaction.vault_id == vault_id)
        ).scalars()
    }
    repayments = list(
        session.execute(select(Repayment).where(Repayment.vault_id == vault_id)).scalars()
    )
    revenue = list(
        session.execute(select(RevenueEvent).where(RevenueEvent.vault_id == vault_id)).scalars()
    )
    mandate = session.execute(
        select(RevenueMandate).where(RevenueMandate.task_id == vault.task_id)
    ).scalar_one_or_none()
    subjects = (vault_id, vault.agent_id)
    risk_events = [r for r in _scoped(session, RiskEvent, user) if r.subject_id in subjects]
    resources = (vault_id, vault.task_id)
    audit = [e for e in _scoped(session, AuditEvent, user) if e.resource_id in resources]

    return {
        **_vault_row(vault, agents, tasks),
        "agent_status": agent.status if agent else None,
        "allowlist": [
            {
                "vendor_id": row.vendor_id,
                "vendor_name": (
                    vendors[row.vendor_id].name if row.vendor_id in vendors else row.vendor_id
                ),
                "category": vendors[row.vendor_id].category if row.vendor_id in vendors else "",
                "purpose_codes": _loads(row.purpose_codes_json, []),
                "per_vendor_cap_minor": row.per_vendor_cap_minor,
            }
            for row in allow_rows
        ],
        "transactions": [
            {
                "proposal_id": p.id,
                "vendor_id": p.vendor_id,
                "vendor_name": vendors[p.vendor_id].name if p.vendor_id in vendors else p.vendor_id,
                "amount_minor": p.amount_minor,
                "currency": p.currency,
                "purpose_code": p.purpose_code,
                "status": "EXECUTED" if p.id in txns else p.status,
                "reason_codes": _loads(p.reason_codes_json, []),
                "transaction_id": txns[p.id].id if p.id in txns else None,
                "journal_transaction_id": (
                    txns[p.id].journal_transaction_id if p.id in txns else None
                ),
                "created_at": _iso(p.created_at),
                "executed_at": _iso(txns[p.id].executed_at) if p.id in txns else None,
            }
            for p in sorted(proposals, key=lambda p: p.created_at, reverse=True)
        ],
        "revenue_events": [
            {
                "revenue_event_id": r.id,
                "amount_minor": r.amount_minor,
                "currency": r.currency,
                "journal_transaction_id": r.journal_transaction_id,
                "created_at": _iso(r.created_at),
            }
            for r in sorted(revenue, key=lambda r: r.created_at, reverse=True)
        ],
        "repayments": [
            {
                "repayment_id": r.id,
                "kind": r.kind,
                "allocations": _loads(r.allocations_json, []),
                "principal_minor": r.principal_minor,
                "fee_minor": r.fee_minor,
                "reserve_minor": r.reserve_minor,
                "owner_minor": r.owner_minor,
                "loss_minor": r.loss_minor,
                "journal_transaction_id": r.journal_transaction_id,
                "created_at": _iso(r.created_at),
            }
            for r in sorted(repayments, key=lambda r: r.created_at, reverse=True)
        ],
        "revenue_mandate": (
            {
                "mandate_id": mandate.id,
                "status": mandate.status,
                "locked": mandate.locked,
                "reserve_cap_minor": mandate.reserve_cap_minor,
                "destination_account_code": mandate.destination_account_code,
            }
            if mandate
            else None
        ),
        "risk_events": [
            {
                "id": r.id,
                "event_type": r.event_type,
                "severity": r.severity,
                "detail": _loads(r.detail_json, {}),
                "created_at": _iso(r.created_at),
            }
            for r in sorted(risk_events, key=lambda r: r.created_at, reverse=True)[:50]
        ],
        "audit_events": [
            {
                "seq": e.seq,
                "event_type": e.event_type,
                "actor_type": e.actor_type,
                "event_hash": e.event_hash,
                "created_at": _iso(e.created_at),
            }
            for e in sorted(audit, key=lambda e: e.seq, reverse=True)[:50]
        ],
    }


# ------------------------------------------------------------- transactions --


def _transaction_rows(session: Session, user: User) -> list[dict]:
    vaults = {v.id: v for v in _scoped(session, CreditVault, user)}
    agents = {a.id: a.name for a in _scoped(session, Agent, user)}
    vendors = {v.id: v for v in session.execute(select(Vendor)).scalars()}
    proposals = _scoped(session, TransactionProposal, user)
    txns = {t.proposal_id: t for t in _scoped(session, VaultTransaction, user)}
    rows = []
    for p in proposals:
        vault = vaults.get(p.vault_id)
        executed = txns.get(p.id)
        rows.append(
            {
                "proposal_id": p.id,
                "transaction_id": executed.id if executed else None,
                "vault_id": p.vault_id,
                "agent_id": vault.agent_id if vault else None,
                "agent_name": agents.get(vault.agent_id, "") if vault else "",
                "vendor_id": p.vendor_id,
                "vendor_name": vendors[p.vendor_id].name if p.vendor_id in vendors else p.vendor_id,
                "vendor_known": p.vendor_id in vendors,
                "amount_minor": p.amount_minor,
                "currency": p.currency,
                "purpose_code": p.purpose_code,
                "type": "VENDOR_PAYMENT",
                "policy_result": "ALLOW" if p.status != "DENIED" else "DENY",
                "status": "EXECUTED" if executed else p.status,
                "reason_codes": _loads(p.reason_codes_json, []),
                "journal_transaction_id": executed.journal_transaction_id if executed else None,
                "created_at": _iso(p.created_at),
                "decided_at": _iso(p.decided_at),
                "executed_at": _iso(executed.executed_at) if executed else None,
            }
        )
    return sorted(rows, key=lambda r: r["created_at"] or "", reverse=True)


@read_router.get("/transactions", tags=["vault"])
def list_transactions(
    status: str | None = Query(default=None),
    vault_id: str | None = Query(default=None),
    agent_id: str | None = Query(default=None),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    rows = _transaction_rows(session, user)
    if status:
        rows = [r for r in rows if r["status"] == status]
    if vault_id:
        rows = [r for r in rows if r["vault_id"] == vault_id]
    if agent_id:
        rows = [r for r in rows if r["agent_id"] == agent_id]
    return rows


@read_router.get("/transactions/{proposal_id}", tags=["vault"])
def transaction_detail(
    proposal_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    proposal = _own(session.get(TransactionProposal, proposal_id), user, "transaction")
    row = next(
        (r for r in _transaction_rows(session, user) if r["proposal_id"] == proposal_id), None
    )
    policy_rows = list(
        session.execute(
            select(PolicyDecisionRecord).where(
                PolicyDecisionRecord.subject_id == proposal_id,
                PolicyDecisionRecord.subject_type == "TRANSACTION",
            )
        ).scalars()
    )
    audit = [
        e
        for e in _scoped(session, AuditEvent, user)
        if e.resource_id in (proposal_id, row["transaction_id"] if row else None)
    ]
    return {
        **(row or {}),
        "idempotency_key_present": bool(proposal.idempotency_key),
        "policy_decisions": [
            {
                "engine": p.engine,
                "allow": p.allow,
                "deny": _loads(p.deny_json, []),
                "policy_version": p.policy_version,
                "created_at": _iso(p.created_at),
            }
            for p in policy_rows
        ],
        "audit_events": [
            {
                "seq": e.seq,
                "event_type": e.event_type,
                "actor_type": e.actor_type,
                "event_hash": e.event_hash,
                "prev_hash": e.prev_hash,
                "created_at": _iso(e.created_at),
            }
            for e in sorted(audit, key=lambda e: e.seq)
        ],
    }


# --------------------------------------------------------------- repayments --


@read_router.get("/repayments", tags=["repayment"])
def list_repayments(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    vaults = {v.id: v for v in _scoped(session, CreditVault, user)}
    agents = {a.id: a.name for a in _scoped(session, Agent, user)}
    tasks = {t.id: t.title for t in _scoped(session, Task, user)}
    revenue_by_vault: dict[str, int] = {}
    for r in _scoped(session, RevenueEvent, user):
        revenue_by_vault[r.vault_id] = revenue_by_vault.get(r.vault_id, 0) + r.amount_minor

    rows = []
    for r in _scoped(session, Repayment, user):
        vault = vaults.get(r.vault_id)
        rows.append(
            {
                "repayment_id": r.id,
                "vault_id": r.vault_id,
                "agent_id": vault.agent_id if vault else None,
                "agent_name": agents.get(vault.agent_id, "") if vault else "",
                "task_title": tasks.get(vault.task_id, "") if vault else "",
                "kind": r.kind,
                "allocations": _loads(r.allocations_json, []),
                "revenue_minor": revenue_by_vault.get(r.vault_id, 0),
                "principal_minor": r.principal_minor,
                "fee_minor": r.fee_minor,
                "reserve_minor": r.reserve_minor,
                "owner_minor": r.owner_minor,
                "loss_minor": r.loss_minor,
                "vault_status": vault.status if vault else None,
                "outstanding_minor": vault.principal_outstanding_minor if vault else 0,
                "journal_transaction_id": r.journal_transaction_id,
                "status": "RECOVERED"
                if r.kind == "RECOVERY"
                else (
                    "SETTLED" if (vault and vault.principal_outstanding_minor == 0) else "PARTIAL"
                ),
                "created_at": _iso(r.created_at),
            }
        )
    return sorted(rows, key=lambda r: r["created_at"] or "", reverse=True)


# --------------------------------------------------------------------- risk --


@read_router.get("/risk/summary", tags=["monitoring"])
def risk_summary(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    events = _scoped(session, RiskEvent, user)
    agents = _scoped(session, Agent, user)
    proposals = _scoped(session, TransactionProposal, user)
    denied = [p for p in proposals if p.status == "DENIED"]
    vaults = _scoped(session, CreditVault, user)
    by_type: dict[str, int] = {}
    for e in events:
        by_type[e.event_type] = by_type.get(e.event_type, 0) + 1
    return {
        "critical_events": sum(1 for e in events if e.severity == "CRITICAL"),
        "high_events": sum(1 for e in events if e.severity == "HIGH"),
        "total_events": len(events),
        "frozen_agents": sum(1 for a in agents if a.status in ("FROZEN", "REVOKED")),
        "frozen_vaults": sum(1 for v in vaults if v.status == "FROZEN"),
        "blocked_transactions": len(denied),
        "blocked_value_minor": sum(p.amount_minor for p in denied),
        "active_monitoring_rules": ACTIVE_CONTROL_COUNT,
        "events_by_type": [{"event_type": k, "count": v} for k, v in sorted(by_type.items())],
    }


# ----------------------------------------------------------------- vendors --


@read_router.get("/vendors", tags=["vault"])
def list_vendors(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    return [
        {"vendor_id": v.id, "name": v.name, "category": v.category, "status": v.status}
        for v in session.execute(select(Vendor)).scalars()
    ]


# --------------------------------------------------------------- dashboard --


@read_router.get("/dashboard/summary", tags=["monitoring"])
def dashboard_summary(
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    agents = _scoped(session, Agent, user)
    apps = _scoped(session, CreditApplication, user)
    vaults = _scoped(session, CreditVault, user)
    proposals = _scoped(session, TransactionProposal, user)
    txns = _scoped(session, VaultTransaction, user)
    repayments = _scoped(session, Repayment, user)
    events = _scoped(session, RiskEvent, user)

    decisions = {
        d.application_id: d
        for d in session.execute(
            select(CreditDecision).where(
                CreditDecision.application_id.in_([a.id for a in apps] or [""])
            )
        ).scalars()
    }

    approved = sum(v.total_limit_minor for v in vaults)
    utilized = sum(v.spent_minor for v in vaults)
    repaid = sum(r.principal_minor for r in repayments if r.kind == "WATERFALL")
    recovered = sum(r.principal_minor + r.reserve_minor for r in repayments if r.kind == "RECOVERY")
    outstanding = sum(
        v.principal_outstanding_minor for v in vaults if v.status not in TERMINAL_VAULT_STATUSES
    )
    at_risk = sum(
        v.principal_outstanding_minor
        for v in vaults
        if v.status in ("FROZEN", "DEFAULTED", "EXPIRED")
    )
    denied = [p for p in proposals if p.status == "DENIED"]
    settled = [v for v in vaults if v.status in ("CLOSED", "REPAID")]
    terminal = [v for v in vaults if v.status in TERMINAL_VAULT_STATUSES]

    imbalance = reconcile(session)
    intact, first_broken = verify_chain(session)

    return {
        "agents": {
            "total": len(agents),
            "active": sum(1 for a in agents if a.status == "ACTIVE"),
            "frozen": sum(1 for a in agents if a.status == "FROZEN"),
            "revoked": sum(1 for a in agents if a.status == "REVOKED"),
        },
        "credit": {
            "approved_minor": approved,
            "utilized_minor": utilized,
            "repaid_minor": repaid,
            "outstanding_minor": outstanding,
            "at_risk_minor": at_risk,
            "recovered_minor": recovered,
            "loss_minor": sum(r.loss_minor for r in repayments),
            "fees_minor": sum(r.fee_minor for r in repayments),
            "released_to_owner_minor": sum(r.owner_minor for r in repayments),
        },
        "vaults": {
            "total": len(vaults),
            "active": sum(1 for v in vaults if v.status in ("ACTIVE", "SPENDING", "CREATED")),
            "frozen": sum(1 for v in vaults if v.status == "FROZEN"),
            "closed": sum(1 for v in vaults if v.status in ("CLOSED", "REPAID")),
            "defaulted": sum(1 for v in vaults if v.status == "DEFAULTED"),
        },
        "applications": {
            "total": len(apps),
            "approved": sum(1 for a in apps if a.status == "APPROVED"),
            "human_review": sum(1 for a in apps if a.status == "HUMAN_REVIEW_REQUIRED"),
            "rejected": sum(1 for a in apps if a.status == "REJECTED"),
            "in_flight": sum(
                1 for a in apps if a.status not in ("APPROVED", "REJECTED", "HUMAN_REVIEW_REQUIRED")
            ),
            "requested_minor": sum(a.requested_minor for a in apps),
            "approved_limit_minor": sum(d.approved_limit_minor for d in decisions.values()),
        },
        "transactions": {
            "proposed": len(proposals),
            "executed": len(txns),
            "blocked": len(denied),
            "executed_value_minor": sum(t.amount_minor for t in txns),
            "blocked_value_minor": sum(p.amount_minor for p in denied),
        },
        "repayments": {
            "count": len(repayments),
            "settled_vaults": len(settled),
            "terminal_vaults": len(terminal),
            # Share of finished vaults that repaid in full rather than
            # defaulting. Undefined (null) until at least one vault finishes.
            "repayment_rate_ppm": ((len(settled) * PPM) // len(terminal) if terminal else None),
        },
        "risk": {
            "total_events": len(events),
            "critical": sum(1 for e in events if e.severity == "CRITICAL"),
            "high": sum(1 for e in events if e.severity == "HIGH"),
            "warn": sum(1 for e in events if e.severity == "WARN"),
        },
        "integrity": {
            "ledger_balanced": imbalance == {},
            "ledger_imbalance": imbalance,
            "audit_chain_intact": intact,
            "first_broken_seq": first_broken,
        },
        "generated_at": _iso(datetime.now(UTC)),
    }


@read_router.get("/dashboard/activity", tags=["monitoring"])
def dashboard_activity(
    limit: int = Query(default=12, ge=1, le=50),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Recent audit events with a human-readable label alongside the canonical
    event code. The code is authoritative; the label is presentation."""
    rows = list(
        session.execute(
            select(AuditEvent)
            .where(AuditEvent.organization_id == user.organization_id)
            .order_by(AuditEvent.seq.desc())
            .limit(limit)
        ).scalars()
    )
    return [
        {
            "seq": e.seq,
            "event_type": e.event_type,
            "label": AUDIT_LABELS.get(e.event_type, e.event_type.replace("_", " ").title()),
            "actor_type": e.actor_type,
            "actor_id": e.actor_id,
            "resource_id": e.resource_id,
            "payload": _loads(e.payload_json, {}),
            "created_at": _iso(e.created_at),
        }
        for e in rows
    ]


AUDIT_LABELS = {
    "ORGANIZATION_CREATED": "Organization registered",
    "AGENT_CREATED": "AI agent registered",
    "PASSPORT_ISSUED": "Agent passport issued",
    "REVENUE_MANDATE_CREATED": "Revenue mandate authorized by owner",
    "CREDIT_APPLICATION_CREATED": "Credit application submitted",
    "CREDIT_DECISION": "Underwriting decision recorded",
    "HUMAN_REVIEW": "Human reviewer decided",
    "VAULT_CREATED": "Credit vault created",
    "DISBURSEMENT": "Credit disbursed into vault",
    "TRANSACTION_PROPOSED": "Agent proposed a vendor payment",
    "TRANSACTION_EXECUTED": "Vendor payment executed",
    "VENDOR_PAYMENT": "Vendor paid from vault",
    "SPEND_BLOCKED": "Spend blocked by policy",
    "VAULT_FROZEN": "Credit vault frozen",
    "VAULT_CLOSED": "Credit vault closed",
    "REVENUE_RECEIVED": "Task revenue received",
    "REPAYMENT_WATERFALL": "Repayment waterfall executed",
    "RECOVERY_WATERFALL": "Recovery waterfall executed",
    "DEFAULT_LOSS": "Simulated loss recognised",
}

RISK_EVENT_LABELS = {
    "SPEND_BLOCKED": "Spend blocked before money moved",
    "VAULT_FROZEN": "Vault frozen automatically",
    "DEFAULT_LOSS": "Task failed — bounded loss recognised",
}


@read_router.get("/audit/labels", tags=["audit"])
def audit_labels() -> dict:
    """Canonical code → human-readable label map, so the UI never invents its
    own wording for an event."""
    return {"audit": AUDIT_LABELS, "risk": RISK_EVENT_LABELS}


# ------------------------------------------------------- policy parameters --

# Count of independent deterministic controls evaluated on every proposal
# (credence/vault/rules.py): idempotency, agent status, vault status, expiry,
# currency, per-transaction cap, task cap, daily cap, vendor allowlist,
# purpose binding, transaction-count cap, velocity window, anti-splitting.
ACTIVE_CONTROL_COUNT = 13


@read_router.get("/policy/parameters", tags=["monitoring"])
def policy_parameters(user: User = Depends(get_current_user)) -> dict:
    """The live constants the deterministic engines run on — read directly
    from the modules that enforce them, so this page cannot drift."""
    from credence.config import get_settings
    from credence.underwriting import decision as dec
    from credence.underwriting.scorecard import SCORECARD_VERSION
    from credence.vault.rules import SPENDABLE_STATUSES, VaultLimits

    defaults = VaultLimits(
        vault_id="",
        status="",
        agent_status="",
        currency="INR",
        total_limit_minor=0,
        spent_minor=0,
        per_transaction_limit_minor=0,
        daily_limit_minor=0,
        spent_today_minor=0,
        allowed_vendor_ids=frozenset(),
    )
    settings = get_settings()
    return {
        "credit_policy": {
            "advance_rate_ppm": dec.ADVANCE_RATE_PPM,
            "lgd_ppm_default": dec.LGD_PPM_DEFAULT,
            "auto_approve_max_pd_ppm": dec.AUTO_APPROVE_MAX_PD_PPM,
            "auto_approve_max_el_ratio_ppm": dec.AUTO_APPROVE_MAX_EL_RATIO_PPM,
            "fee_rate_ppm": dec.FEE_RATE_PPM,
            "decision_version": dec.DECISION_VERSION,
            "scorecard_version": SCORECARD_VERSION,
            "limit_formula": (
                "approved_limit = min(requested, available_exposure, "
                "revenue_advance_cap, task_cost_cap, policy_cap)"
            ),
        },
        "risk_policy": {
            "velocity_window_seconds": int(defaults.velocity_window.total_seconds()),
            "velocity_max_transactions": defaults.velocity_max_transactions,
            "max_transactions_default": defaults.max_transactions,
            "spendable_vault_statuses": sorted(SPENDABLE_STATUSES),
            "active_controls": ACTIVE_CONTROL_COUNT,
            "anti_splitting": (
                "Two or more sub-limit payments to one vendor inside the "
                "velocity window are aggregated and treated as a single "
                "payment against the per-transaction cap."
            ),
        },
        "environment": {
            "run_mode": settings.run_mode.value,
            "environment": settings.environment.value,
            "model_provider": settings.model_provider,
            "voice_provider": getattr(settings, "voice_provider", "disabled"),
            "test_credits_only": True,
        },
    }


# ------------------------------------------------------------ exposure trend --


@read_router.get("/dashboard/exposure-series", tags=["monitoring"])
def exposure_series(
    days: int = Query(default=14, ge=1, le=90),
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> list[dict]:
    """Daily approved / utilized / repaid totals, bucketed from the actual
    record timestamps. Days with no records are still returned so the series
    is continuous; nothing is interpolated."""
    vaults = _scoped(session, CreditVault, user)
    txns = _scoped(session, VaultTransaction, user)
    repayments = _scoped(session, Repayment, user)
    if not vaults and not txns and not repayments:
        return []

    today = datetime.now(UTC).date()
    buckets = {
        (today - timedelta(days=offset)).isoformat(): {
            "date": (today - timedelta(days=offset)).isoformat(),
            "approved_minor": 0,
            "utilized_minor": 0,
            "repaid_minor": 0,
        }
        for offset in range(days - 1, -1, -1)
    }

    def bump(when: datetime, key: str, amount: int) -> None:
        day = when.date().isoformat()
        if day in buckets:
            buckets[day][key] += amount

    for v in vaults:
        bump(v.created_at, "approved_minor", v.total_limit_minor)
    for t in txns:
        bump(t.executed_at, "utilized_minor", t.amount_minor)
    for r in repayments:
        bump(r.created_at, "repaid_minor", r.principal_minor + r.fee_minor)
    return list(buckets.values())

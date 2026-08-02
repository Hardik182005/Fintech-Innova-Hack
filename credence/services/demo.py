"""Deterministic demo scenarios A–F (spec §19). Sandbox only.

Each scenario returns a step-by-step narrative with real IDs, decisions,
ledger journal IDs, and reason codes — everything the judge demo needs, all
produced by the same code paths as the public API.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.audit import verify_chain
from credence.config import get_settings
from credence.errors import CredenceError
from credence.finance_models import CreditDecision
from credence.ledger import reconcile
from credence.modelgw import ModelGateway
from credence.models import User, Vendor
from credence.services import credit, identity, vault_ops

DEMO_VENDORS = [
    ("vendor_gcp_compute", "GCP Compute (sandbox)", "COMPUTE"),
    ("vendor_image_api", "Image Generation API (sandbox)", "IMAGE"),
]


def seed_demo_tenant(
    session: Session,
    *,
    into: User | None = None,
    agent_name: str = "CatalogAgent-01",
) -> dict:
    """Create the deterministic demo org, owner, agent, passport, vendors.

    With `into`, the scenario is seeded inside that authenticated user's own
    organization rather than a fresh one, so a run shows up on the caller's
    product pages. That is safe by construction: reaching this path requires
    already holding a valid token for the organization being seeded. A new
    agent is still created per run, so runs never mutate existing records.

    Without `into`, behaviour is unchanged: a brand-new isolated org per run.
    """
    for vendor_id, name, category in DEMO_VENDORS:
        if session.get(Vendor, vendor_id) is None:
            session.add(Vendor(id=vendor_id, name=name, category=category))
    session.flush()

    if into is not None:
        organization_id, owner_user_id, token = into.organization_id, into.id, None
    else:
        # Unique email per run so scenarios are re-runnable on a persistent DB.
        run_id = uuid.uuid4().hex[:8]
        org, owner, token = identity.create_organization(
            session,
            "Acme Autonomous Commerce Pvt Ltd (sandbox)",
            f"owner+{run_id}@demo.credence.local",
        )
        organization_id, owner_user_id = org.id, owner.id

    settings = get_settings()
    agent = identity.create_agent(
        session,
        organization_id=organization_id,
        owner_user_id=owner_user_id,
        name=agent_name,
        # The model this synthetic borrower agent runs on. It is read straight
        # from the deployment's own configuration rather than hard-coded: the
        # previous literal named qwen3:8b, which no deployment has ever pulled,
        # so every seeded agent advertised a model that was not there.
        model_provider=settings.model_provider,
        model_name=settings.ollama_analyst_model,
        model_version_hash="sha256:demo-pinned",
    )
    _, signed = identity.issue_passport(
        session,
        agent_id=agent.id,
        purpose="catalog enrichment for e-commerce task orders",
        permitted_task_categories=["COMPUTE", "IMAGE"],
        max_borrowing_authority_minor=500_000,  # ₹5,000
        max_transaction_value_minor=60_000,  # ₹600
        approved_vendor_ids=[v[0] for v in DEMO_VENDORS],
        ttl_hours=12,
    )
    return {
        "organization_id": organization_id,
        "owner_user_id": owner_user_id,
        # Only present when this run minted a brand-new organization. Seeding
        # into an existing tenant never re-issues or echoes back its token.
        "owner_api_token": token,
        "agent_id": agent.id,
        "agent_name": agent.name,
        "passport_nonce": signed.payload.nonce,
    }


def _setup_credit(
    session: Session,
    seed: dict,
    gateway: ModelGateway | None,
    *,
    requested_minor: int = 100_000,  # ₹1,000
    expected_revenue_minor: int = 180_000,  # ₹1,800
    reserve_cap_minor: int = 25_000,
) -> dict:
    """Shared steps 1-6 of scenario A: task → evidence → mandate →
    application → evaluation → review approval → vault."""
    task = credit.create_task(
        session,
        organization_id=seed["organization_id"],
        agent_id=seed["agent_id"],
        title="Enrich 500 product listings for customer order #CO-1041",
        description=(
            "Customer order CO-1041: enrich 500 product listings with images "
            "and descriptions. Compute and image-generation costs required "
            "before customer payment of ₹1,800 on delivery."
        ),
        category="COMPUTE",
        expected_revenue_minor=expected_revenue_minor,
        expected_cost_minor=requested_minor,
    )
    ev1 = credit.add_evidence(
        session,
        organization_id=seed["organization_id"],
        task_id=task.id,
        evidence_type="TASK_ORDER",
        content_text=(
            "Purchase order CO-1041 from verified customer RetailCo: payment of "
            "₹1800.00 due on delivery of 500 enriched listings."
        ),
    )
    ev2 = credit.add_evidence(
        session,
        organization_id=seed["organization_id"],
        task_id=task.id,
        evidence_type="COST_QUOTE",
        content_text=(
            "Cost estimate: compute ₹600.00 (vendor_gcp_compute), image "
            "generation ₹400.00 (vendor_image_api). Total ₹1000.00."
        ),
    )
    mandate = credit.create_mandate(
        session,
        organization_id=seed["organization_id"],
        task_id=task.id,
        authorized_by_user_id=seed["owner_user_id"],
        reserve_cap_minor=reserve_cap_minor,
    )
    app = credit.create_application(
        session,
        organization_id=seed["organization_id"],
        agent_id=seed["agent_id"],
        task_id=task.id,
        requested_minor=requested_minor,
        requested_duration_hours=24,
        expected_revenue_minor=expected_revenue_minor,
        expected_cost_minor=requested_minor,
        owner_exposure_cap_minor=300_000,
        proposed_vendor_ids=[v[0] for v in DEMO_VENDORS],
    )
    decision = credit.evaluate_application(session, app.id, gateway)

    # First credit for a fresh agent goes to human review by design; the
    # owner-reviewer approves within the deterministic cap.
    if decision.decision == "HUMAN_REVIEW_REQUIRED":
        credit.review_application(
            session,
            application_id=app.id,
            reviewer_user_id=seed["owner_user_id"],
            action="APPROVE",
            notes="Demo review: verified task order and mandate.",
        )
        decision = session.execute(
            select(CreditDecision).where(CreditDecision.application_id == app.id)
        ).scalar_one()

    vault = vault_ops.create_vault(session, app.id, per_transaction_limit_minor=60_000)
    return {
        "task_id": task.id,
        "evidence_ids": [ev1.id, ev2.id],
        "mandate_id": mandate.id,
        "application_id": app.id,
        "decision": decision.decision,
        "approved_limit_minor": decision.approved_limit_minor,
        "caps": json.loads(decision.caps_json),
        "receipt_hash": decision.receipt_hash,
        "vault_id": vault.id,
    }


def scenario_happy_path(
    session: Session, gateway: ModelGateway | None, *, into: User | None = None
) -> dict:
    seed = seed_demo_tenant(session, into=into, agent_name="CatalogAgent-01")
    setup = _setup_credit(session, seed, gateway)
    steps = [{"step": "SETUP", **setup}]

    for vendor_id, amount, key in [
        ("vendor_gcp_compute", 60_000, "hp-compute"),
        ("vendor_image_api", 40_000, "hp-image"),
    ]:
        proposal = vault_ops.propose_transaction(
            session,
            vault_id=setup["vault_id"],
            vendor_id=vendor_id,
            amount_minor=amount,
            purpose_code="COMPUTE" if "compute" in vendor_id else "IMAGE",
            idempotency_key=f"{key}-{setup['vault_id']}",
        )
        txn = vault_ops.execute_transaction(session, proposal.id)
        steps.append(
            {
                "step": "VENDOR_PAYMENT",
                "vendor_id": vendor_id,
                "amount_minor": amount,
                "proposal_status": proposal.status,
                "transaction_id": txn.id,
                "journal_transaction_id": txn.journal_transaction_id,
            }
        )

    repayment = vault_ops.receive_revenue(
        session,
        vault_id=setup["vault_id"],
        amount_minor=180_000,
        external_event_id=f"rev-co1041-{setup['vault_id']}",
    )
    steps.append(
        {
            "step": "REVENUE_AND_WATERFALL",
            "revenue_minor": 180_000,
            "principal_repaid_minor": repayment.principal_minor,
            "fee_paid_minor": repayment.fee_minor,
            "owner_released_minor": repayment.owner_minor,
            "allocations": json.loads(repayment.allocations_json),
        }
    )
    vault = vault_ops.close_vault(session, setup["vault_id"], seed["owner_user_id"])
    steps.append(
        {
            "step": "CLOSED",
            "vault_status": vault.status,
            "ledger_balanced": reconcile(session) == {},
            "audit_chain_intact": verify_chain(session)[0],
        }
    )
    return {"scenario": "A_HAPPY_PATH", "seed": seed, "steps": steps}


def scenario_overspend(
    session: Session, gateway: ModelGateway | None, *, into: User | None = None
) -> dict:
    seed = seed_demo_tenant(session, into=into, agent_name="ProcurementAgent-02")
    setup = _setup_credit(session, seed, gateway)
    proposal = vault_ops.propose_transaction(
        session,
        vault_id=setup["vault_id"],
        vendor_id="vendor_gcp_compute",
        amount_minor=200_000,  # ₹2,000 vs ₹1,000 limit
        purpose_code="COMPUTE",
        idempotency_key=f"overspend-{setup['vault_id']}",
    )
    return {
        "scenario": "B_OVERSPEND_BLOCKED",
        "seed": seed,
        "setup": setup,
        "proposal_status": proposal.status,
        "reasons": json.loads(proposal.reason_codes_json),
        "ledger_balanced": reconcile(session) == {},
    }


def scenario_unapproved_vendor(
    session: Session, gateway: ModelGateway | None, *, into: User | None = None
) -> dict:
    seed = seed_demo_tenant(session, into=into, agent_name="SourcingAgent-03")
    setup = _setup_credit(session, seed, gateway)
    proposal = vault_ops.propose_transaction(
        session,
        vault_id=setup["vault_id"],
        vendor_id="personal_wallet_0xdead",
        amount_minor=30_000,
        purpose_code="COMPUTE",
        idempotency_key=f"badvendor-{setup['vault_id']}",
    )
    return {
        "scenario": "C_UNAPPROVED_VENDOR_BLOCKED",
        "seed": seed,
        "setup": setup,
        "proposal_status": proposal.status,
        "reasons": json.loads(proposal.reason_codes_json),
    }


def scenario_split_payment(
    session: Session, gateway: ModelGateway | None, *, into: User | None = None
) -> dict:
    seed = seed_demo_tenant(session, into=into, agent_name="ProcurementAgent-04")
    setup = _setup_credit(session, seed, gateway)
    attempts = []
    for i in range(5):
        proposal = vault_ops.propose_transaction(
            session,
            vault_id=setup["vault_id"],
            vendor_id="vendor_gcp_compute",
            amount_minor=25_000,  # each under the ₹600 per-txn cap
            purpose_code="COMPUTE",
            idempotency_key=f"split-{i}-{setup['vault_id']}",
        )
        entry = {"attempt": i + 1, "status": proposal.status,
                 "reasons": json.loads(proposal.reason_codes_json)}
        if proposal.status == "APPROVED":
            try:
                txn = vault_ops.execute_transaction(session, proposal.id)
                entry["transaction_id"] = txn.id
            except CredenceError as e:
                entry["execution_blocked"] = str(e)
        attempts.append(entry)
    from credence.finance_models import CreditVault

    vault = session.get(CreditVault, setup["vault_id"])
    return {
        "scenario": "D_SPLIT_PAYMENT_DETECTED",
        "seed": seed,
        "setup": setup,
        "attempts": attempts,
        "vault_status": vault.status,
        "frozen_reason": vault.frozen_reason,
    }


def scenario_revoke_mid_task(
    session: Session, gateway: ModelGateway | None, *, into: User | None = None
) -> dict:
    seed = seed_demo_tenant(session, into=into, agent_name="LogisticsAgent-05")
    setup = _setup_credit(session, seed, gateway)
    proposal = vault_ops.propose_transaction(
        session,
        vault_id=setup["vault_id"],
        vendor_id="vendor_gcp_compute",
        amount_minor=30_000,
        purpose_code="COMPUTE",
        idempotency_key=f"pending-{setup['vault_id']}",
    )
    requested_at = datetime.now(UTC)
    freeze = identity.kill_switch(
        session,
        agent_id=seed["agent_id"],
        actor_id=seed["owner_user_id"],
        action="REVOKE",
        reason="owner kill switch during pending spend",
        requested_at=requested_at,
    )
    blocked = None
    try:
        vault_ops.execute_transaction(session, proposal.id)
    except CredenceError as e:
        blocked = {"code": e.code.value, "detail": e.detail}
    return {
        "scenario": "E_OWNER_KILL_SWITCH",
        "seed": seed,
        "setup": setup,
        "pending_proposal_id": proposal.id,
        "kill_switch_latency_ms": freeze.latency_ms,
        "post_revocation_execution": blocked or "ERROR: was not blocked",
    }


def scenario_task_failure(
    session: Session, gateway: ModelGateway | None, *, into: User | None = None
) -> dict:
    seed = seed_demo_tenant(session, into=into, agent_name="ResearchAgent-06")
    setup = _setup_credit(session, seed, gateway)
    proposal = vault_ops.propose_transaction(
        session,
        vault_id=setup["vault_id"],
        vendor_id="vendor_gcp_compute",
        amount_minor=60_000,
        purpose_code="COMPUTE",
        idempotency_key=f"fail-spend-{setup['vault_id']}",
    )
    vault_ops.execute_transaction(session, proposal.id)
    recovery = vault_ops.simulate_failure(session, setup["vault_id"])
    from credence.finance_models import CreditVault

    vault = session.get(CreditVault, setup["vault_id"])
    return {
        "scenario": "F_TASK_FAILURE_BOUNDED_RECOVERY",
        "seed": seed,
        "setup": setup,
        "spent_before_failure_minor": 60_000,
        "recovery": {
            "swept_unspent_minor": recovery.principal_minor,
            "reserve_drawn_minor": recovery.reserve_minor,
            "simulated_loss_minor": recovery.loss_minor,
            "allocations": json.loads(recovery.allocations_json),
        },
        "vault_status": vault.status,
        "lender_downside_bounded": recovery.loss_minor
        <= vault.total_limit_minor,
        "ledger_balanced": reconcile(session) == {},
    }


SCENARIOS = {
    "happy-path": scenario_happy_path,
    "overspend": scenario_overspend,
    "unapproved-vendor": scenario_unapproved_vendor,
    "split-payment": scenario_split_payment,
    "revoke-mid-task": scenario_revoke_mid_task,
    "task-failure": scenario_task_failure,
}

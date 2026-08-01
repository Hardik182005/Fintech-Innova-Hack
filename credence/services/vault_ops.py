"""Restricted task-credit vault operations (spec §5.5, §5.4).

Execution path per proposal: schema (API) → passport/agent check →
deterministic vault rules → OPA-shape policy → ledger posting → receipt.
The agent can only PROPOSE; execution is a separate privileged step.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.audit import append_audit_event
from credence.errors import CredenceError, ReasonCode
from credence.finance_models import (
    CreditApplication,
    CreditDecision,
    CreditVault,
    PolicyDecisionRecord,
    Repayment,
    RevenueEvent,
    RevenueMandate,
    RiskEvent,
    TransactionProposal,
    VaultTransaction,
    VaultVendorAllowlist,
)
from credence.ledger import EntrySpec, post_journal
from credence.models import Agent, EntryDirection, Vendor
from credence.policy import evaluate_transaction_policy
from credence.services.accounts import ensure_chart
from credence.state import application_transition, vault_transition
from credence.telemetry import current_request_id, record_stage
from credence.underwriting.decision import FEE_RATE_PPM
from credence.underwriting.features import PPM
from credence.vault import (
    RecentSpend,
    VaultLimits,
    evaluate_proposal,
    run_recovery_waterfall,
    run_repayment_waterfall,
)
from credence.vault.rules import SpendProposal


def create_vault(
    session: Session,
    application_id: str,
    per_transaction_limit_minor: int | None = None,
    now: datetime | None = None,
) -> CreditVault:
    """Create the vault for an APPROVED application and enable disbursement:
    DR PRINCIPAL_RECEIVABLE / CR VAULT_AVAILABLE. Locks the revenue mandate."""
    now = now or datetime.now(UTC)
    app = session.get(CreditApplication, application_id)
    if app is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "application is not APPROVED")
    stage = record_stage(session, app.organization_id, current_request_id(), "VAULT_CREATION")
    with stage:
        if app.status != "APPROVED":
            raise CredenceError(ReasonCode.POLICY_DENIED, "application is not APPROVED")
        decision = session.execute(
            select(CreditDecision).where(CreditDecision.application_id == application_id)
        ).scalar_one()
        limit = decision.approved_limit_minor
        if limit <= 0:
            raise CredenceError(ReasonCode.POLICY_DENIED, "no approved limit")

        vendors = json.loads(app.proposed_vendors_json)
        known = set(
            session.execute(select(Vendor.id).where(Vendor.id.in_(vendors or [""]))).scalars()
        )
        unknown = set(vendors) - known
        if unknown:
            raise CredenceError(
                ReasonCode.VENDOR_NOT_ALLOWED, f"unknown vendors {sorted(unknown)}"
            )

        vault = CreditVault(
            organization_id=app.organization_id,
            agent_id=app.agent_id,
            task_id=app.task_id,
            application_id=app.id,
            status="CREATED",
            currency=app.currency,
            total_limit_minor=limit,
            per_transaction_limit_minor=per_transaction_limit_minor or limit,
            daily_limit_minor=limit,
            principal_outstanding_minor=limit,
            fee_due_minor=(limit * FEE_RATE_PPM) // PPM,
            expires_at=now + timedelta(hours=app.requested_duration_hours),
        )
        session.add(vault)
        session.flush()
        for vendor_id in vendors:
            # Bind each allowlisted vendor to the purpose it exists to serve.
            # An empty list means "any purpose", so leaving it unset would make
            # the purpose-binding control inert: a compute vendor could be paid
            # under an unrelated purpose code and the rule would never fire.
            vendor = session.get(Vendor, vendor_id)
            purposes = [vendor.category] if vendor is not None and vendor.category else []
            session.add(
                VaultVendorAllowlist(
                    vault_id=vault.id,
                    vendor_id=vendor_id,
                    purpose_codes_json=json.dumps(purposes),
                )
            )

        accounts = ensure_chart(session)
        journal = post_journal(
            session,
            idempotency_key=f"disburse-{vault.id}",
            event_type="DISBURSEMENT",
            entries=[
                EntrySpec(
                    accounts["PRINCIPAL_RECEIVABLE"], EntryDirection.DEBIT, limit, app.currency
                ),
                EntrySpec(accounts["VAULT_AVAILABLE"], EntryDirection.CREDIT, limit, app.currency),
            ],
            reference_id=vault.id,
        )

        mandate = session.execute(
            select(RevenueMandate).where(RevenueMandate.task_id == app.task_id)
        ).scalar_one_or_none()
        if mandate is not None:
            mandate.locked = True  # immutable after disbursement (spec §5.4)

        app.status = application_transition(app.status, "VAULT_CREATED")
        app.status = application_transition(app.status, "DISBURSEMENT_ENABLED")
        vault.status = vault_transition(vault.status, "ACTIVE")

    append_audit_event(
        session,
        actor_type="SYSTEM",
        actor_id="vault-service",
        event_type="VAULT_CREATED",
        payload={
            "vault_id": vault.id,
            "application_id": app.id,
            "limit_minor": limit,
            "journal_transaction_id": journal.id,
        },
        organization_id=app.organization_id,
        resource_id=vault.id,
    )
    return vault


def _vault_limits(session: Session, vault: CreditVault, now: datetime) -> VaultLimits:
    agent = session.get(Agent, vault.agent_id)
    allow_rows = list(
        session.execute(
            select(VaultVendorAllowlist).where(VaultVendorAllowlist.vault_id == vault.id)
        ).scalars()
    )
    vendor_purposes = {}
    for row in allow_rows:
        purposes = json.loads(row.purpose_codes_json)
        if purposes:
            vendor_purposes[row.vendor_id] = frozenset(purposes)
    day_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    spent_today = sum(
        t.amount_minor
        for t in session.execute(
            select(VaultTransaction).where(
                VaultTransaction.vault_id == vault.id, VaultTransaction.executed_at >= day_start
            )
        ).scalars()
    )
    return VaultLimits(
        vault_id=vault.id,
        status=vault.status,
        agent_status=agent.status if agent else "REVOKED",
        currency=vault.currency,
        total_limit_minor=vault.total_limit_minor,
        spent_minor=vault.spent_minor,
        per_transaction_limit_minor=vault.per_transaction_limit_minor,
        daily_limit_minor=vault.daily_limit_minor,
        spent_today_minor=spent_today,
        allowed_vendor_ids=frozenset(r.vendor_id for r in allow_rows),
        vendor_purposes=vendor_purposes,
        expires_at=_aware(vault.expires_at),
        transaction_count=vault.transaction_count,
        max_transactions=vault.max_transactions,
    )


def _recent_spends(session: Session, vault_id: str, now: datetime) -> list[RecentSpend]:
    window_start = now - timedelta(minutes=10)
    rows = session.execute(
        select(VaultTransaction).where(
            VaultTransaction.vault_id == vault_id, VaultTransaction.executed_at >= window_start
        )
    ).scalars()
    return [RecentSpend(r.vendor_id, r.amount_minor, _aware(r.executed_at)) for r in rows]


def _aware(dt: datetime) -> datetime:
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=UTC)


def propose_transaction(
    session: Session,
    *,
    vault_id: str,
    vendor_id: str,
    amount_minor: int,
    purpose_code: str,
    idempotency_key: str,
    currency: str = "INR",
    now: datetime | None = None,
) -> TransactionProposal:
    """Agent-typed proposal → deterministic rules + policy. Never executes."""
    now = now or datetime.now(UTC)
    existing = session.execute(
        select(TransactionProposal).where(TransactionProposal.idempotency_key == idempotency_key)
    ).scalar_one_or_none()
    if existing is not None:
        return existing  # idempotent replay

    vault = session.get(CreditVault, vault_id)
    if vault is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "vault not found")

    request_id = current_request_id()
    org_id = vault.organization_id
    with record_stage(session, org_id, request_id, "SPEND_MONITORING") as spend_stage:
        limits = _vault_limits(session, vault, now)
        proposal_check = evaluate_proposal(
            limits,
            SpendProposal(
                vault_id=vault_id,
                vendor_id=vendor_id,
                amount_minor=amount_minor,
                currency=currency,
                purpose_code=purpose_code,
                idempotency_key=idempotency_key,
                at=now,
            ),
            recent=_recent_spends(session, vault_id, now),
            now=now,
        )

        # Second, independent control: OPA-shape policy document.
        passport_valid, _ = _agent_identity_ok(session, vault.agent_id)
        with record_stage(session, org_id, request_id, "POLICY_ENGINE") as policy_stage:
            policy = evaluate_transaction_policy(
                {
                    "identity": {
                        "valid": passport_valid,
                        "expires_at": int(_aware(vault.expires_at).timestamp()),
                    },
                    "now": int(now.timestamp()),
                    "agent": {"status": session.get(Agent, vault.agent_id).status},
                    "vault": {
                        "status": vault.status,
                        "allowed_vendor_ids": sorted(limits.allowed_vendor_ids),
                        "per_transaction_limit_minor": vault.per_transaction_limit_minor,
                        "spent_minor": vault.spent_minor,
                        "total_limit_minor": vault.total_limit_minor,
                    },
                    "vendor": {"id": vendor_id},
                    "transaction": {"amount_minor": amount_minor},
                    "risk": {"policy_status": "PASS" if proposal_check.allow else "FAIL"},
                }
            )
            if not policy.allow:
                policy_stage.reject(sorted(policy.deny)[0] if policy.deny else None)

        allowed = proposal_check.allow and policy.allow
        reasons = sorted(set(proposal_check.reason_codes) | set(policy.deny))
        proposal = TransactionProposal(
            organization_id=vault.organization_id,
            vault_id=vault_id,
            vendor_id=vendor_id,
            amount_minor=amount_minor,
            currency=currency,
            purpose_code=purpose_code,
            idempotency_key=idempotency_key,
            status="APPROVED" if allowed else "DENIED",
            reason_codes_json=json.dumps(reasons),
            decided_at=now,
        )
        session.add(proposal)
        session.flush()

        # Persist which engine reached which verdict. The proposal only
        # carries the merged reason codes; without this record a reviewer
        # cannot tell whether the deterministic rules, the policy bundle, or
        # both refused the spend.
        session.add(
            PolicyDecisionRecord(
                organization_id=vault.organization_id,
                subject_type="TRANSACTION",
                subject_id=proposal.id,
                allow=proposal_check.allow,
                deny_json=json.dumps(sorted(proposal_check.reason_codes)),
                engine="vault-rules",
            )
        )
        session.add(
            PolicyDecisionRecord(
                organization_id=vault.organization_id,
                subject_type="TRANSACTION",
                subject_id=proposal.id,
                allow=policy.allow,
                deny_json=json.dumps(sorted(policy.deny)),
                engine=policy.engine,
                policy_version=policy.policy_version,
            )
        )

        if not allowed:
            spend_stage.reject(reasons[0] if reasons else None)
            session.add(
                RiskEvent(
                    organization_id=vault.organization_id,
                    event_type="SPEND_BLOCKED",
                    severity="WARN",
                    subject_type="AGENT",
                    subject_id=vault.agent_id,
                    detail_json=json.dumps({"proposal_id": proposal.id, "reasons": reasons}),
                )
            )
            if ReasonCode.SPLIT_PATTERN_DETECTED.value in reasons and vault.status in (
                "ACTIVE",
                "SPENDING",
            ):
                vault.status = vault_transition(vault.status, "FROZEN")
                vault.frozen_reason = "split-payment pattern detected"
                session.add(
                    RiskEvent(
                        organization_id=vault.organization_id,
                        event_type="VAULT_FROZEN",
                        severity="HIGH",
                        subject_type="VAULT",
                        subject_id=vault.id,
                        detail_json=json.dumps({"reason": "split_pattern"}),
                    )
                )
    append_audit_event(
        session,
        actor_type="AGENT",
        actor_id=vault.agent_id,
        event_type="TRANSACTION_PROPOSED",
        payload={
            "proposal_id": proposal.id,
            "vault_id": vault_id,
            "vendor_id": vendor_id,
            "amount_minor": amount_minor,
            "status": proposal.status,
            "reasons": reasons,
        },
        organization_id=vault.organization_id,
        resource_id=proposal.id,
    )
    return proposal


def _agent_identity_ok(session: Session, agent_id: str) -> tuple[bool, list[str]]:
    from credence.services.identity import verify_stored_passport

    return verify_stored_passport(session, agent_id)


def execute_transaction(
    session: Session, proposal_id: str, now: datetime | None = None
) -> VaultTransaction:
    """Execute an APPROVED proposal. Re-checks every limit at execution time
    (state may have changed since approval — e.g. kill switch)."""
    now = now or datetime.now(UTC)
    proposal = session.get(TransactionProposal, proposal_id)
    if proposal is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "proposal not found")
    existing = session.execute(
        select(VaultTransaction).where(VaultTransaction.proposal_id == proposal_id)
    ).scalar_one_or_none()
    if existing is not None:
        return existing  # idempotent
    if proposal.status != "APPROVED":
        raise CredenceError(ReasonCode.POLICY_DENIED, f"proposal is {proposal.status}")

    vault = session.get(CreditVault, proposal.vault_id)
    exec_stage = record_stage(
        session, vault.organization_id, current_request_id(), "SPEND_MONITORING"
    )
    with exec_stage:
        limits = _vault_limits(session, vault, now)
        recheck = evaluate_proposal(
            limits,
            SpendProposal(
                vault_id=vault.id,
                vendor_id=proposal.vendor_id,
                amount_minor=proposal.amount_minor,
                currency=proposal.currency,
                purpose_code=proposal.purpose_code,
                idempotency_key=proposal.idempotency_key,
                at=now,
            ),
            recent=_recent_spends(session, vault.id, now),
            now=now,
        )
        if not recheck.allow:
            proposal.status = "DENIED"
            proposal.reason_codes_json = json.dumps(recheck.reason_codes)
            session.add(
                RiskEvent(
                    organization_id=vault.organization_id,
                    event_type="SPEND_BLOCKED",
                    severity="WARN",
                    subject_type="AGENT",
                    subject_id=vault.agent_id,
                    detail_json=json.dumps(
                        {
                            "proposal_id": proposal.id,
                            "phase": "execute",
                            "reasons": recheck.reason_codes,
                        }
                    ),
                )
            )
            # record_stage classifies this reason-coded denial as a
            # CONTROLLED_REJECTION on re-raise.
            raise CredenceError(
                ReasonCode.POLICY_DENIED, f"execution blocked: {recheck.reason_codes}"
            )

        accounts = ensure_chart(session)
        journal = post_journal(
            session,
            idempotency_key=f"spend-{proposal.id}",
            event_type="VENDOR_PAYMENT",
            entries=[
                EntrySpec(
                    accounts["VAULT_AVAILABLE"],
                    EntryDirection.DEBIT,
                    proposal.amount_minor,
                    proposal.currency,
                ),
                EntrySpec(
                    accounts["VENDOR_PAYABLE"],
                    EntryDirection.CREDIT,
                    proposal.amount_minor,
                    proposal.currency,
                ),
            ],
            reference_id=proposal.id,
        )
        vault.spent_minor += proposal.amount_minor
        vault.transaction_count += 1
        if vault.status == "ACTIVE":
            vault.status = vault_transition(vault.status, "SPENDING")
        proposal.status = "EXECUTED"
        txn = VaultTransaction(
            organization_id=vault.organization_id,
            vault_id=vault.id,
            proposal_id=proposal.id,
            vendor_id=proposal.vendor_id,
            amount_minor=proposal.amount_minor,
            currency=proposal.currency,
            journal_transaction_id=journal.id,
            executed_at=now,
        )
        session.add(txn)
        session.flush()
    append_audit_event(
        session,
        actor_type="SYSTEM",
        actor_id="vault-service",
        event_type="TRANSACTION_EXECUTED",
        payload={
            "transaction_id": txn.id,
            "vault_id": vault.id,
            "vendor_id": txn.vendor_id,
            "amount_minor": txn.amount_minor,
            "journal_transaction_id": journal.id,
        },
        organization_id=vault.organization_id,
        resource_id=txn.id,
    )
    return txn


def freeze_vault(session: Session, vault_id: str, actor_id: str, reason: str) -> CreditVault:
    vault = session.get(CreditVault, vault_id)
    if vault is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "vault not found")
    vault.status = vault_transition(vault.status, "FROZEN")
    vault.frozen_reason = reason
    append_audit_event(
        session,
        actor_type="USER",
        actor_id=actor_id,
        event_type="VAULT_FROZEN",
        payload={"vault_id": vault_id, "reason": reason},
        organization_id=vault.organization_id,
        resource_id=vault_id,
    )
    return vault


def receive_revenue(
    session: Session,
    *,
    vault_id: str,
    amount_minor: int,
    external_event_id: str,
    currency: str = "INR",
    task_completed: bool = True,
    now: datetime | None = None,
) -> Repayment:
    """Collect task revenue into escrow and IMMEDIATELY run the repayment
    waterfall (repayment is automatic, not agent-cooperative). Replays of the
    same external_event_id are idempotent."""
    now = now or datetime.now(UTC)
    replay = session.execute(
        select(RevenueEvent).where(RevenueEvent.external_event_id == external_event_id)
    ).scalar_one_or_none()
    if replay is not None:
        return session.execute(
            select(Repayment)
            .where(Repayment.vault_id == replay.vault_id)
            .order_by(Repayment.created_at.desc())
            .limit(1)
        ).scalar_one()

    vault = session.get(CreditVault, vault_id)
    if vault is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "vault not found")
    request_id = current_request_id()
    org_id = vault.organization_id

    with record_stage(session, org_id, request_id, "REVENUE_COLLECTION"):
        if amount_minor <= 0:
            raise CredenceError(ReasonCode.POLICY_DENIED, "revenue must be positive")

        if vault.status in ("ACTIVE", "SPENDING"):
            vault.status = vault_transition(
                vault.status, "TASK_COMPLETED" if task_completed else "TASK_FAILED"
            )
        vault.status = vault_transition(vault.status, "REVENUE_RECEIVED")

        accounts = ensure_chart(session)
        revenue_journal = post_journal(
            session,
            idempotency_key=f"revenue-{external_event_id}",
            event_type="REVENUE_RECEIVED",
            entries=[
                EntrySpec(accounts["SANDBOX_CASH"], EntryDirection.DEBIT, amount_minor, currency),
                EntrySpec(
                    accounts["REVENUE_ESCROW"], EntryDirection.CREDIT, amount_minor, currency
                ),
            ],
            reference_id=vault_id,
        )
        revenue_event = RevenueEvent(
            organization_id=vault.organization_id,
            vault_id=vault_id,
            external_event_id=external_event_id,
            amount_minor=amount_minor,
            currency=currency,
            journal_transaction_id=revenue_journal.id,
        )
        session.add(revenue_event)

    with record_stage(session, org_id, request_id, "REPAYMENT_WATERFALL"):
        result = run_repayment_waterfall(
            revenue_minor=amount_minor,
            principal_outstanding_minor=vault.principal_outstanding_minor,
            fee_due_minor=vault.fee_due_minor,
            reserve_drawn_minor=vault.reserve_drawn_minor,
        )
        entries = [
            EntrySpec(accounts["REVENUE_ESCROW"], EntryDirection.DEBIT, amount_minor, currency)
        ]
        if result.principal_repaid_minor:
            entries.append(
                EntrySpec(
                    accounts["PRINCIPAL_RECEIVABLE"],
                    EntryDirection.CREDIT,
                    result.principal_repaid_minor,
                    currency,
                )
            )
        if result.fee_paid_minor:
            entries.append(
                EntrySpec(
                    accounts["FEE_INCOME"], EntryDirection.CREDIT, result.fee_paid_minor, currency
                )
            )
        if result.reserve_replenished_minor:
            entries.append(
                EntrySpec(
                    accounts["RESERVE_POOL"],
                    EntryDirection.CREDIT,
                    result.reserve_replenished_minor,
                    currency,
                )
            )
        if result.owner_released_minor:
            entries.append(
                EntrySpec(
                    accounts["OWNER_PAYABLE"],
                    EntryDirection.CREDIT,
                    result.owner_released_minor,
                    currency,
                )
            )
        waterfall_journal = post_journal(
            session,
            idempotency_key=f"waterfall-{external_event_id}",
            event_type="REPAYMENT_WATERFALL",
            entries=entries,
            reference_id=vault_id,
        )

        vault.principal_outstanding_minor = result.principal_outstanding_minor
        vault.fee_due_minor = result.fee_outstanding_minor
        vault.reserve_drawn_minor -= result.reserve_replenished_minor
        vault.status = vault_transition(
            vault.status,
            "REPAID"
            if vault.principal_outstanding_minor == 0 and vault.fee_due_minor == 0
            else "PARTIALLY_REPAID",
        )

        repayment = Repayment(
            organization_id=vault.organization_id,
            vault_id=vault_id,
            kind="WATERFALL",
            allocations_json=json.dumps(
                [{"step": a.step, "amount_minor": a.amount_minor} for a in result.allocations]
            ),
            principal_minor=result.principal_repaid_minor,
            fee_minor=result.fee_paid_minor,
            reserve_minor=result.reserve_replenished_minor,
            owner_minor=result.owner_released_minor,
            journal_transaction_id=waterfall_journal.id,
        )
        session.add(repayment)
        session.flush()

    # Appending the hash-chained audit record closes the financial episode.
    with record_stage(session, org_id, request_id, "AUDIT_FINALIZATION"):
        append_audit_event(
            session,
            actor_type="SYSTEM",
            actor_id="repayment-service",
            event_type="REPAYMENT_WATERFALL",
            payload={
                "vault_id": vault_id,
                "revenue_minor": amount_minor,
                "principal_minor": result.principal_repaid_minor,
                "fee_minor": result.fee_paid_minor,
                "owner_minor": result.owner_released_minor,
                "journal_transaction_id": waterfall_journal.id,
            },
            organization_id=vault.organization_id,
            resource_id=repayment.id,
        )
    return repayment


def simulate_failure(session: Session, vault_id: str, now: datetime | None = None) -> Repayment:
    """Task fails before revenue: run the bounded recovery waterfall."""
    now = now or datetime.now(UTC)
    vault = session.get(CreditVault, vault_id)
    if vault is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "vault not found")
    request_id = current_request_id()
    org_id = vault.organization_id
    with record_stage(session, org_id, request_id, "REPAYMENT_WATERFALL"):
        if vault.status in ("ACTIVE", "SPENDING", "FROZEN", "EXPIRED"):
            vault.status = vault_transition(vault.status, "TASK_FAILED")
        else:
            raise CredenceError(ReasonCode.POLICY_DENIED, f"vault is {vault.status}")

        mandate = session.execute(
            select(RevenueMandate).where(RevenueMandate.task_id == vault.task_id)
        ).scalar_one_or_none()
        reserve_cap = mandate.reserve_cap_minor if mandate else 0

        unspent = vault.total_limit_minor - vault.spent_minor
        # Recovery targets outstanding principal; the unearned fee is written
        # off (it was never recognized in the ledger — fees post on collection
        # only).
        owed = vault.principal_outstanding_minor
        result = run_recovery_waterfall(
            amount_owed_minor=owed,
            unspent_vault_minor=unspent,
            revenue_received_minor=0,
            reserve_available_minor=reserve_cap,
            reserve_cap_minor=reserve_cap,
        )

        accounts = ensure_chart(session)
        currency = vault.currency
        entries: list[EntrySpec] = []
        if result.swept_unspent_minor:
            entries.append(
                EntrySpec(
                    accounts["VAULT_AVAILABLE"],
                    EntryDirection.DEBIT,
                    result.swept_unspent_minor,
                    currency,
                )
            )
        if result.reserve_drawn_minor:
            entries.append(
                EntrySpec(
                    accounts["RESERVE_POOL"],
                    EntryDirection.DEBIT,
                    result.reserve_drawn_minor,
                    currency,
                )
            )
        if result.simulated_loss_minor:
            entries.append(
                EntrySpec(
                    accounts["LOSS_DEFAULT"],
                    EntryDirection.DEBIT,
                    result.simulated_loss_minor,
                    currency,
                )
            )
        recovered_total = (
            result.swept_unspent_minor + result.reserve_drawn_minor + result.simulated_loss_minor
        )
        if recovered_total:
            entries.append(
                EntrySpec(
                    accounts["PRINCIPAL_RECEIVABLE"],
                    EntryDirection.CREDIT,
                    recovered_total,
                    currency,
                )
            )
            journal = post_journal(
                session,
                idempotency_key=f"recovery-{vault_id}",
                event_type="RECOVERY_WATERFALL",
                entries=entries,
                reference_id=vault_id,
            )
            journal_id = journal.id
        else:
            journal_id = None

        vault.principal_outstanding_minor = 0
        vault.fee_due_minor = 0
        vault.reserve_drawn_minor += result.reserve_drawn_minor
        vault.spent_minor = vault.total_limit_minor  # unspent swept
        vault.status = vault_transition(
            vault.status, "DEFAULTED" if result.simulated_loss_minor > 0 else "REPAID"
        )

        repayment = Repayment(
            organization_id=vault.organization_id,
            vault_id=vault_id,
            kind="RECOVERY",
            allocations_json=json.dumps(
                [{"step": s.step, "amount_minor": s.amount_minor} for s in result.steps]
            ),
            principal_minor=result.swept_unspent_minor,
            reserve_minor=result.reserve_drawn_minor,
            loss_minor=result.simulated_loss_minor,
            journal_transaction_id=journal_id,
        )
        session.add(repayment)
        if result.simulated_loss_minor:
            session.add(
                RiskEvent(
                    organization_id=vault.organization_id,
                    event_type="DEFAULT_LOSS",
                    severity="HIGH",
                    subject_type="AGENT",
                    subject_id=vault.agent_id,
                    detail_json=json.dumps(
                        {"vault_id": vault_id, "loss_minor": result.simulated_loss_minor}
                    ),
                )
            )
        session.flush()

    with record_stage(session, org_id, request_id, "AUDIT_FINALIZATION"):
        append_audit_event(
            session,
            actor_type="SYSTEM",
            actor_id="recovery-service",
            event_type="RECOVERY_WATERFALL",
            payload={
                "vault_id": vault_id,
                "swept_minor": result.swept_unspent_minor,
                "reserve_drawn_minor": result.reserve_drawn_minor,
                "loss_minor": result.simulated_loss_minor,
            },
            organization_id=vault.organization_id,
            resource_id=repayment.id,
        )
    return repayment


def close_vault(session: Session, vault_id: str, actor_id: str) -> CreditVault:
    vault = session.get(CreditVault, vault_id)
    if vault is None:
        raise CredenceError(ReasonCode.POLICY_DENIED, "vault not found")
    with record_stage(
        session, vault.organization_id, current_request_id(), "AUDIT_FINALIZATION"
    ):
        vault.status = vault_transition(vault.status, "CLOSED")
        append_audit_event(
            session,
            actor_type="USER",
            actor_id=actor_id,
            event_type="VAULT_CLOSED",
            payload={"vault_id": vault_id},
            organization_id=vault.organization_id,
            resource_id=vault_id,
        )
    return vault

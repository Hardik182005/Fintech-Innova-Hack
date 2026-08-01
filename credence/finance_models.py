"""Credit, task, vault, and operations tables (spec §12 continuation).

All tenant-owned tables carry organization_id. Financial state columns are
integer minor units (ADR-003). Probabilities (PD/LGD) are stored as integer
parts-per-million so model outputs are exact and comparable across runs.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from credence.db import Base
from credence.models import _id, utcnow


class OrganizationMember(Base):
    __tablename__ = "organization_members"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("mem"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    role: Mapped[str] = mapped_column(String(30), default="MEMBER")
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_member"),)


class Task(Base):
    __tablename__ = "tasks"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("tsk"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    title: Mapped[str] = mapped_column(String(300))
    description: Mapped[str] = mapped_column(Text, default="")
    category: Mapped[str] = mapped_column(String(50))
    status: Mapped[str] = mapped_column(String(30), default="OPEN")
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    expected_revenue_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    expected_cost_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    expected_completion_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class TaskEvidence(Base):
    __tablename__ = "task_evidence"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("evd"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    evidence_type: Mapped[str] = mapped_column(String(50))  # TASK_ORDER | COST_QUOTE | ...
    source: Mapped[str] = mapped_column(String(200), default="upload")
    content_text: Mapped[str] = mapped_column(Text, default="")  # treated as UNTRUSTED input
    content_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RevenueMandate(Base):
    __tablename__ = "revenue_mandates"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("mnd"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), unique=True)
    destination_account_code: Mapped[str] = mapped_column(String(60), default="REVENUE_ESCROW")
    authorized_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    reserve_cap_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE")  # ACTIVE | REVOKED
    locked: Mapped[bool] = mapped_column(default=False)  # True after disbursement: immutable
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CreditApplication(Base):
    __tablename__ = "credit_applications"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("app"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", index=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    requested_minor: Mapped[int] = mapped_column(BigInteger)
    requested_duration_hours: Mapped[int] = mapped_column(Integer, default=24)
    expected_revenue_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    owner_exposure_cap_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    expected_cost_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    proposed_vendors_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    __table_args__ = (CheckConstraint("requested_minor > 0", name="ck_app_requested_positive"),)


class UnderwritingFeatures(Base):
    __tablename__ = "underwriting_features"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("ftr"))
    application_id: Mapped[str] = mapped_column(ForeignKey("credit_applications.id"), index=True)
    features_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RiskModelRun(Base):
    __tablename__ = "risk_model_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("rsk"))
    application_id: Mapped[str] = mapped_column(ForeignKey("credit_applications.id"), index=True)
    model_name: Mapped[str] = mapped_column(String(100))
    model_version: Mapped[str] = mapped_column(String(40))
    pd_ppm: Mapped[int] = mapped_column(Integer)  # probability of default, parts-per-million
    lgd_ppm: Mapped[int] = mapped_column(Integer)
    ead_minor: Mapped[int] = mapped_column(BigInteger)
    expected_loss_minor: Mapped[int] = mapped_column(BigInteger)
    is_simulation: Mapped[bool] = mapped_column(default=True)  # honest labeling (spec §5.3B)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class LlmAnalysisRun(Base):
    __tablename__ = "llm_analysis_runs"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("llm"))
    application_id: Mapped[str] = mapped_column(ForeignKey("credit_applications.id"), index=True)
    role: Mapped[str] = mapped_column(String(30))  # TASK_ANALYST | UNDERWRITER | CRITIC | EXPLAINER
    model_profile: Mapped[str] = mapped_column(String(40))
    schema_valid: Mapped[bool] = mapped_column(default=False)
    output_json: Mapped[str] = mapped_column(Text)
    evidence_ids_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CreditDecision(Base):
    __tablename__ = "credit_decisions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("dcn"))
    application_id: Mapped[str] = mapped_column(ForeignKey("credit_applications.id"), unique=True)
    decision: Mapped[str] = mapped_column(String(30))  # APPROVED | REJECTED | HUMAN_REVIEW_REQUIRED
    approved_limit_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    caps_json: Mapped[str] = mapped_column(Text)  # every min() input, for the receipt
    reason_codes_json: Mapped[str] = mapped_column(Text, default="[]")
    receipt_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class HumanReview(Base):
    __tablename__ = "human_reviews"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("rvw"))
    application_id: Mapped[str] = mapped_column(ForeignKey("credit_applications.id"), index=True)
    reviewer_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"))
    action: Mapped[str] = mapped_column(String(20))  # APPROVE | REDUCE | REJECT
    amount_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    notes: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PolicyDecisionRecord(Base):
    __tablename__ = "policy_decisions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("pol"))
    organization_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    subject_type: Mapped[str] = mapped_column(String(30))  # APPLICATION | TRANSACTION
    subject_id: Mapped[str] = mapped_column(String(64), index=True)
    allow: Mapped[bool] = mapped_column()
    deny_json: Mapped[str] = mapped_column(Text, default="[]")
    engine: Mapped[str] = mapped_column(String(20))  # opa | local
    policy_version: Mapped[str] = mapped_column(String(40), default="v1")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CreditVault(Base):
    __tablename__ = "credit_vaults"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("vlt"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    agent_id: Mapped[str] = mapped_column(ForeignKey("agents.id"), index=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    application_id: Mapped[str] = mapped_column(ForeignKey("credit_applications.id"), unique=True)
    status: Mapped[str] = mapped_column(String(30), default="CREATED", index=True)
    currency: Mapped[str] = mapped_column(String(3), default="INR")
    total_limit_minor: Mapped[int] = mapped_column(BigInteger)
    spent_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    per_transaction_limit_minor: Mapped[int] = mapped_column(BigInteger)
    daily_limit_minor: Mapped[int] = mapped_column(BigInteger)
    principal_outstanding_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    fee_due_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    reserve_drawn_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    transaction_count: Mapped[int] = mapped_column(Integer, default=0)
    max_transactions: Mapped[int] = mapped_column(Integer, default=100)
    frozen_reason: Mapped[str] = mapped_column(String(300), default="")
    version: Mapped[int] = mapped_column(Integer, default=0)  # optimistic lock
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, onupdate=utcnow
    )
    __mapper_args__ = {"version_id_col": version}
    __table_args__ = (
        CheckConstraint("spent_minor >= 0", name="ck_vault_spent_nonneg"),
        CheckConstraint("spent_minor <= total_limit_minor", name="ck_vault_spent_le_limit"),
    )


class VaultVendorAllowlist(Base):
    __tablename__ = "vault_vendor_allowlist"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("val"))
    vault_id: Mapped[str] = mapped_column(ForeignKey("credit_vaults.id"), index=True)
    vendor_id: Mapped[str] = mapped_column(ForeignKey("vendors.id"))
    purpose_codes_json: Mapped[str] = mapped_column(Text, default="[]")  # [] = any purpose
    per_vendor_cap_minor: Mapped[int | None] = mapped_column(BigInteger, nullable=True)
    __table_args__ = (UniqueConstraint("vault_id", "vendor_id", name="uq_vault_vendor"),)


class TransactionProposal(Base):
    __tablename__ = "transaction_proposals"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("prp"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    vault_id: Mapped[str] = mapped_column(ForeignKey("credit_vaults.id"), index=True)
    vendor_id: Mapped[str] = mapped_column(String(64))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    purpose_code: Mapped[str] = mapped_column(String(40))
    idempotency_key: Mapped[str] = mapped_column(String(128), unique=True)
    status: Mapped[str] = mapped_column(String(20), default="PROPOSED", index=True)
    reason_codes_json: Mapped[str] = mapped_column(Text, default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class VaultTransaction(Base):
    __tablename__ = "transactions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("txn"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    vault_id: Mapped[str] = mapped_column(ForeignKey("credit_vaults.id"), index=True)
    proposal_id: Mapped[str] = mapped_column(ForeignKey("transaction_proposals.id"), unique=True)
    vendor_id: Mapped[str] = mapped_column(String(64))
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    journal_transaction_id: Mapped[str] = mapped_column(ForeignKey("journal_transactions.id"))
    executed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RevenueEvent(Base):
    __tablename__ = "revenue_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("rev"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    vault_id: Mapped[str] = mapped_column(ForeignKey("credit_vaults.id"), index=True)
    external_event_id: Mapped[str] = mapped_column(String(128), unique=True)  # replay guard
    amount_minor: Mapped[int] = mapped_column(BigInteger)
    currency: Mapped[str] = mapped_column(String(3))
    journal_transaction_id: Mapped[str] = mapped_column(ForeignKey("journal_transactions.id"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Repayment(Base):
    __tablename__ = "repayments"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("rpy"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    vault_id: Mapped[str] = mapped_column(ForeignKey("credit_vaults.id"), index=True)
    kind: Mapped[str] = mapped_column(String(20), default="WATERFALL")  # WATERFALL | RECOVERY
    allocations_json: Mapped[str] = mapped_column(Text)
    principal_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    fee_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    reserve_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    owner_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    loss_minor: Mapped[int] = mapped_column(BigInteger, default=0)
    journal_transaction_id: Mapped[str | None] = mapped_column(
        ForeignKey("journal_transactions.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class RiskEvent(Base):
    __tablename__ = "risk_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("rke"))
    organization_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    event_type: Mapped[str] = mapped_column(String(60), index=True)
    severity: Mapped[str] = mapped_column(String(10), default="INFO")  # INFO|WARN|HIGH|CRITICAL
    subject_type: Mapped[str] = mapped_column(String(30))
    subject_id: Mapped[str] = mapped_column(String(64), index=True)
    detail_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class FreezeEvent(Base):
    __tablename__ = "freeze_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("frz"))
    organization_id: Mapped[str] = mapped_column(ForeignKey("organizations.id"), index=True)
    subject_type: Mapped[str] = mapped_column(String(20))  # AGENT | VAULT
    subject_id: Mapped[str] = mapped_column(String(64), index=True)
    action: Mapped[str] = mapped_column(String(20))  # FREEZE | UNFREEZE | REVOKE
    reason: Mapped[str] = mapped_column(String(500))
    actor_id: Mapped[str] = mapped_column(String(64))
    requested_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    enforced_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)  # kill-switch latency, measured


class PipelineStageEvent(Base):
    """One timed execution of one pipeline stage (docs/system-intelligence-
    contract.md). Rows are written by credence.telemetry.record_stage at the
    service-layer call sites where the stage's work actually happens; the
    system-intelligence view derives p50/p95, true_errors, and the pipeline
    success rate from them. A policy denial is recorded as CONTROLLED_REJECTION
    — a successful outcome of the control system, never an error."""

    __tablename__ = "pipeline_stage_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    organization_id: Mapped[str] = mapped_column(String(32), index=True)
    request_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    stage: Mapped[str] = mapped_column(String(40), index=True)
    status: Mapped[str] = mapped_column(String(30))  # SUCCEEDED|CONTROLLED_REJECTION|FAILED
    duration_ms: Mapped[int] = mapped_column(Integer)
    error_code: Mapped[str | None] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, index=True
    )


class ModelRegistryEntry(Base):
    __tablename__ = "model_registry"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("mdl"))
    name: Mapped[str] = mapped_column(String(200))
    version: Mapped[str] = mapped_column(String(60))
    kind: Mapped[str] = mapped_column(String(30))  # LLM | RISK_MODEL | EMBEDDING | GUARD
    uri: Mapped[str] = mapped_column(String(500), default="")
    content_hash: Mapped[str] = mapped_column(String(128), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("name", "version", name="uq_model_version"),)


class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("pmt"))
    role: Mapped[str] = mapped_column(String(30))
    version: Mapped[str] = mapped_column(String(40))
    template_hash: Mapped[str] = mapped_column(String(64))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("role", "version", name="uq_prompt_version"),)


class EvaluationCase(Base):
    __tablename__ = "evaluation_cases"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("evc"))
    name: Mapped[str] = mapped_column(String(200), unique=True)
    kind: Mapped[str] = mapped_column(String(40))  # NORMAL|INCOMPLETE|CONTRADICTORY|MALICIOUS|I18N
    input_json: Mapped[str] = mapped_column(Text)
    expected_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class EvaluationResult(Base):
    __tablename__ = "evaluation_results"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("evr"))
    case_id: Mapped[str] = mapped_column(ForeignKey("evaluation_cases.id"), index=True)
    model_profile: Mapped[str] = mapped_column(String(40))
    passed: Mapped[bool] = mapped_column()
    detail_json: Mapped[str] = mapped_column(Text, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class OutboxEvent(Base):
    __tablename__ = "outbox_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    topic: Mapped[str] = mapped_column(String(60), index=True)
    payload_json: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="PENDING", index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class IdempotencyRecord(Base):
    __tablename__ = "idempotency_records"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=lambda: _id("idm"))
    scope: Mapped[str] = mapped_column(String(60))
    key: Mapped[str] = mapped_column(String(128))
    response_json: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    __table_args__ = (UniqueConstraint("scope", "key", name="uq_idem_scope_key"),)

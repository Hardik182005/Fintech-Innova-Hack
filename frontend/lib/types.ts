/**
 * Response types for the CredenceAI read API.
 *
 * Written against the live service, not invented: every field here was observed
 * on a real response from a seeded sandbox tenant. Fields typed `| null` are
 * ones the backend genuinely omits in some state — an unseeded tenant, a vault
 * that never spent, an application no model has looked at yet. That distinction
 * carries a rule: a null means *not available*, and the UI must say so rather
 * than render it as zero. Zero is a financial claim; absence is not.
 *
 * All money is integer minor units (paise). Nothing here is a float, and
 * nothing is formatted until it reaches the screen.
 */

export type Money = number;
/** Parts per million. 1_000_000 == 100%. */
export type Ppm = number;
/** ISO-8601 timestamp. */
export type Timestamp = string;

// ------------------------------------------------------------------ identity --

export type Me = {
  organization_id: string;
  name: string;
  status: string;
  created_at: Timestamp | null;
  user: { id: string; email: string; role: string };
};

export type AgentFeatures = {
  tasks_total: number;
  tasks_succeeded: number;
  task_success_rate_ppm: Ppm;
  repayments_total: number;
  repaid_in_full: number;
  repayment_rate_ppm: Ppm;
  total_defaulted_minor: Money;
  current_outstanding_minor: Money;
  policy_violation_count: number;
  blocked_spend_attempts: number;
  identity_age_days: number;
  is_first_credit: boolean;
};

export type RiskTier = "LOW" | "MEDIUM" | "HIGH";

export type AgentSummary = {
  agent_id: string;
  name: string;
  status: string;
  model_provider: string;
  model_name: string;
  model_version_hash: string;
  owner_user_id: string;
  owner_email: string;
  trust_score: number;
  risk_tier: RiskTier;
  task_success_rate_ppm: Ppm;
  repayment_rate_ppm: Ppm;
  tasks_total: number;
  policy_violation_count: number;
  blocked_spend_attempts: number;
  active_exposure_minor: Money;
  vault_count: number;
  has_passport: boolean;
  passport_expires_at: Timestamp | null;
  created_at: Timestamp | null;
  last_activity_at: Timestamp | null;
};

/** Capability token claims. Never carries the signature bytes or any key. */
export type PassportView = {
  passport_id: string;
  issuer: string;
  key_version: string;
  purpose: string;
  permitted_task_categories: string[];
  max_borrowing_authority_minor: Money;
  max_transaction_value_minor: Money;
  approved_vendor_ids: string[];
  audience: string;
  valid_from: Timestamp | null;
  expires_at: Timestamp | null;
  signature_verified: boolean;
  reason_codes: string[];
};

export type AgentProfile = AgentSummary & {
  features: AgentFeatures;
  passport: PassportView | null;
  tasks: TaskSummary[];
  credit_history: {
    application_id: string;
    task_id: string;
    status: string;
    requested_minor: Money;
    approved_limit_minor: Money | null;
    decision: string | null;
    created_at: Timestamp | null;
  }[];
  vaults: {
    vault_id: string;
    status: string;
    total_limit_minor: Money;
    spent_minor: Money;
    principal_outstanding_minor: Money;
    created_at: Timestamp | null;
  }[];
  spending_behaviour: {
    vendor_distribution: { vendor_id: string; count: number; amount_minor: Money }[];
    executed_count: number;
    blocked_count: number;
    policy_violations: { proposal_id: string; reason_codes: string[]; created_at: Timestamp | null }[];
  };
  repayments: {
    repayment_id: string;
    vault_id: string;
    kind: string;
    principal_minor: Money;
    fee_minor: Money;
    owner_minor: Money;
    loss_minor: Money;
    created_at: Timestamp | null;
  }[];
  risk_events: RiskEvent[];
  audit_events: AuditEventRef[];
};

// --------------------------------------------------------------------- tasks --

export type TaskSummary = {
  task_id: string;
  agent_id?: string;
  agent_name?: string;
  title: string;
  category: string;
  status: string;
  currency?: string;
  expected_revenue_minor: Money;
  expected_cost_minor: Money;
  expected_margin_minor: Money;
  created_at: Timestamp | null;
};

// -------------------------------------------------------- credit applications --

export type CreditApplicationSummary = {
  application_id: string;
  agent_id: string;
  agent_name: string;
  task_id: string;
  task_title: string;
  status: string;
  currency: string;
  requested_minor: Money;
  approved_limit_minor: Money | null;
  decision: string | null;
  reason_codes: string[];
  receipt_hash: string | null;
  expected_revenue_minor: Money;
  expected_cost_minor: Money;
  expected_margin_minor: Money;
  requested_duration_hours: number;
  pd_ppm: Ppm | null;
  expected_loss_minor: Money | null;
  human_review: {
    action: string;
    amount_minor: Money | null;
    notes: string | null;
    created_at: Timestamp | null;
  } | null;
  vault_id: string | null;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
};

export type EvidenceItem = {
  evidence_id: string;
  evidence_type: string;
  source: string;
  content_hash: string;
  content_text: string;
  created_at: Timestamp | null;
};

/**
 * One stored evidence record, as listed against its task.
 *
 * `content_text` is the copy the server kept, which is the redacted one — the
 * submitted string and the stored string differ whenever `redactions` came
 * back non-empty, and `content_hash` covers the stored copy.
 */
export type StoredEvidence = EvidenceItem & {
  organization_id: string;
  task_id: string;
};

/** What the API returns when a piece of evidence is accepted. */
export type EvidenceReceipt = StoredEvidence & {
  /** Identifier kinds stripped at the intake boundary; empty when none matched. */
  redactions: string[];
  /** The submitted text matched a known prompt-injection signature. Stored
   *  anyway — the defence is in the analyst prompt and the verifier. */
  injection_signature: boolean;
};

/** Result of re-running the passport checks. Recomputed on every call. */
export type PassportVerification = {
  agent_id: string;
  valid: boolean;
  reason_codes: string[];
};

/** Bounded model output. Advisory only — it never sets an amount. */
export type AiRecommendation = {
  role: string;
  model_profile: string;
  schema_valid: boolean;
  summary: string;
  claims: { claim_id: string; text: string; evidence_ids: string[] }[];
  risk_flags: string[];
  missing_evidence: string[];
  evidence_ids: string[];
  created_at: Timestamp | null;
};

/** The engine that actually decides. Every figure the product acts on is here. */
export type DeterministicEngine = {
  decision: string;
  approved_limit_minor: Money;
  caps: {
    requested_minor: Money;
    available_exposure_minor: Money;
    revenue_advance_cap_minor: Money;
    task_cost_cap_minor: Money;
    policy_cap_minor: Money;
  };
  reason_codes: string[];
  receipt_hash: string | null;
  created_at: Timestamp | null;
  pd_ppm: Ppm;
  lgd_ppm: Ppm;
  ead_minor: Money;
  expected_loss_minor: Money;
  model_name: string;
  is_simulation: boolean;
  features: AgentFeatures;
};

export type VerifiedClaim = {
  claim_id: string;
  text: string;
  evidence_ids: string[];
  unknown_evidence_ids: string[];
};

/** Re-checks each model claim against stored evidence. Independent of both. */
export type IndependentVerifier = {
  claims_total: number;
  claims_supported: number;
  claims_unsupported: number;
  supported: VerifiedClaim[];
  unsupported: VerifiedClaim[];
  /** The analyst's own flags, echoed here. NOT a verifier finding — the
   *  verifier checks evidence-ID citations, and a flag has none to check. */
  analyst_risk_flags_unverified: string[];
  model_output_schema_valid: boolean;
  model_influenced_amounts: boolean;
  verdict: "NO_MODEL_ANALYSIS" | "CONTRADICTIONS_FOUND" | "CLAIMS_TRACE_TO_EVIDENCE";
  note: string;
};

export type PolicyDecisionRecord = {
  engine: string;
  allow: boolean;
  deny: string[];
  policy_version: string | null;
  created_at: Timestamp | null;
};

export type RevenueMandate = {
  mandate_id: string;
  status: string;
  locked: boolean;
  reserve_cap_minor: Money;
  destination_account_code: string;
};

export type UnderwritingView = {
  application: {
    application_id: string;
    status: string;
    currency: string;
    requested_minor: Money;
    requested_duration_hours: number;
    expected_revenue_minor: Money;
    expected_cost_minor: Money;
    expected_margin_minor: Money;
    owner_exposure_cap_minor: Money;
    proposed_vendor_ids: string[];
    created_at: Timestamp | null;
  };
  agent: { agent_id: string; name: string; status: string; model_name: string };
  task: {
    task_id: string;
    title: string;
    description: string;
    category: string;
    status: string;
  };
  revenue_mandate: RevenueMandate | null;
  evidence: EvidenceItem[];
  ai_recommendation: AiRecommendation | null;
  deterministic_engine: DeterministicEngine | null;
  verifier: IndependentVerifier;
  policy_decisions: PolicyDecisionRecord[];
  human_reviews: {
    action: string;
    amount_minor: Money | null;
    notes: string | null;
    reviewer_user_id: string;
    created_at: Timestamp | null;
  }[];
};

export type UnderwritingQueueBucket =
  | "awaiting_ai_analysis"
  | "awaiting_deterministic_decision"
  | "awaiting_human_review"
  | "recently_completed";

export type UnderwritingQueue = {
  buckets: Record<UnderwritingQueueBucket, CreditApplicationSummary[]>;
  counts: Record<UnderwritingQueueBucket, number>;
};

// -------------------------------------------------------------------- vaults --

export type VaultSummary = {
  vault_id: string;
  agent_id: string;
  agent_name: string;
  task_id: string;
  task_title: string;
  application_id: string;
  status: string;
  currency: string;
  total_limit_minor: Money;
  spent_minor: Money;
  remaining_minor: Money;
  per_transaction_limit_minor: Money;
  daily_limit_minor: Money;
  principal_outstanding_minor: Money;
  fee_due_minor: Money;
  reserve_drawn_minor: Money;
  transaction_count: number;
  max_transactions: number;
  frozen_reason: string | null;
  expires_at: Timestamp | null;
  created_at: Timestamp | null;
  updated_at: Timestamp | null;
};

export type WaterfallAllocation = { step: string; amount_minor: Money };

export type RepaymentRecord = {
  repayment_id: string;
  kind: string;
  allocations: WaterfallAllocation[];
  principal_minor: Money;
  fee_minor: Money;
  reserve_minor: Money;
  owner_minor: Money;
  loss_minor: Money;
  journal_transaction_id: string | null;
  created_at: Timestamp | null;
};

export type VaultDetail = VaultSummary & {
  agent_status: string;
  allowlist: {
    vendor_id: string;
    vendor_name: string;
    category: string;
    purpose_codes: string[];
    per_vendor_cap_minor: Money | null;
  }[];
  transactions: {
    proposal_id: string;
    vendor_id: string;
    vendor_name: string;
    amount_minor: Money;
    currency: string;
    purpose_code: string;
    status: string;
    reason_codes: string[];
    transaction_id: string | null;
    journal_transaction_id: string | null;
    created_at: Timestamp | null;
    executed_at: Timestamp | null;
  }[];
  revenue_events: { amount_minor: Money; created_at: Timestamp | null }[];
  repayments: RepaymentRecord[];
  revenue_mandate: RevenueMandate | null;
  risk_events: RiskEvent[];
  audit_events: AuditEventRef[];
};

// -------------------------------------------------------------- transactions --

export type TransactionSummary = {
  proposal_id: string;
  transaction_id: string | null;
  vault_id: string;
  agent_id: string;
  agent_name: string;
  vendor_id: string;
  vendor_name: string;
  vendor_known: boolean;
  amount_minor: Money;
  currency: string;
  purpose_code: string;
  type: string;
  policy_result: string;
  status: string;
  reason_codes: string[];
  journal_transaction_id: string | null;
  created_at: Timestamp | null;
  decided_at: Timestamp | null;
  executed_at: Timestamp | null;
};

export type TransactionDetail = TransactionSummary & {
  idempotency_key_present: boolean;
  policy_decisions: PolicyDecisionRecord[];
  audit_events: AuditEventRef[];
};

// ---------------------------------------------------------------- repayments --

export type RepaymentRow = {
  repayment_id: string;
  vault_id: string;
  agent_id: string;
  agent_name: string;
  task_title: string;
  kind: string;
  allocations: WaterfallAllocation[];
  revenue_minor: Money;
  principal_minor: Money;
  fee_minor: Money;
  reserve_minor: Money;
  owner_minor: Money;
  loss_minor: Money;
  vault_status: string;
  outstanding_minor: Money;
  journal_transaction_id: string | null;
  status: string;
  created_at: Timestamp | null;
};

// ---------------------------------------------------------- risk and audit --

export type RiskEvent = {
  id: string;
  event_type: string;
  severity: string;
  subject_type?: string;
  subject_id?: string;
  detail: Record<string, unknown>;
  created_at: Timestamp | null;
};

export type AuditEventRef = {
  seq: number;
  event_type: string;
  actor_type: string;
  resource_id?: string | null;
  event_hash?: string;
  prev_hash?: string;
  created_at: Timestamp | null;
};

export type AuditEvent = {
  id: string;
  seq: number;
  actor_type: string;
  event_type: string;
  resource_id: string | null;
  event_hash: string;
  prev_hash: string;
  created_at: Timestamp;
};

export type RiskSummary = {
  critical_events: number;
  high_events: number;
  total_events: number;
  frozen_agents: number;
  frozen_vaults: number;
  blocked_transactions: number;
  blocked_value_minor: Money;
  active_monitoring_rules: number;
  events_by_type: { event_type: string; count: number }[];
};

export type ChainVerification = { intact: boolean; first_broken_seq: number | null };

export type LabelMaps = { audit: Record<string, string>; risk: Record<string, string> };

// ----------------------------------------------------------------- dashboard --

export type DashboardSummary = {
  agents: { total: number; active: number; frozen: number; revoked: number };
  credit: {
    approved_minor: Money;
    utilized_minor: Money;
    repaid_minor: Money;
    outstanding_minor: Money;
    at_risk_minor: Money;
    recovered_minor: Money;
    loss_minor: Money;
    fees_minor: Money;
    released_to_owner_minor: Money;
  };
  vaults: { total: number; active: number; frozen: number; closed: number; defaulted: number };
  applications: {
    total: number;
    approved: number;
    human_review: number;
    rejected: number;
    in_flight: number;
    requested_minor: Money;
    approved_limit_minor: Money;
  };
  transactions: {
    proposed: number;
    executed: number;
    blocked: number;
    executed_value_minor: Money;
    blocked_value_minor: Money;
  };
  repayments: {
    count: number;
    settled_vaults: number;
    terminal_vaults: number;
    /** null when no vault has reached a terminal state: a rate with no
     *  denominator is unavailable, not 0%. */
    repayment_rate_ppm: Ppm | null;
  };
  risk: { total_events: number; critical: number; high: number; warn: number };
  integrity: {
    ledger_balanced: boolean;
    ledger_imbalance: Record<string, number>;
    audit_chain_intact: boolean;
    first_broken_seq: number | null;
  };
  generated_at: Timestamp;
};

export type ActivityEvent = {
  seq: number;
  event_type: string;
  label: string;
  actor_type: string;
  actor_id: string | null;
  resource_id: string | null;
  payload: Record<string, unknown>;
  created_at: Timestamp | null;
};

export type ExposurePoint = {
  date: string;
  approved_minor: Money;
  utilized_minor: Money;
  repaid_minor: Money;
};

// ------------------------------------------------------------------- policy --

export type PolicyParameters = {
  credit_policy: {
    advance_rate_ppm: Ppm;
    lgd_ppm_default: Ppm;
    auto_approve_max_pd_ppm: Ppm;
    auto_approve_max_el_ratio_ppm: Ppm;
    fee_rate_ppm: Ppm;
    decision_version: string;
    scorecard_version: string;
    limit_formula: string;
  };
  risk_policy: {
    velocity_window_seconds: number;
    velocity_max_transactions: number;
    max_transactions_default: number;
    spendable_vault_statuses: string[];
    active_controls: number;
    anti_splitting: string;
  };
  environment: {
    run_mode: string;
    environment: string;
    model_provider: string;
    voice_provider: string;
    test_credits_only: boolean;
  };
};

export type Vendor = { vendor_id: string; name: string; category: string; status: string };

// ------------------------------------------------------------------- health --

export type Readiness = {
  status: string;
  version: string;
  run_mode: string;
  environment: string;
  model_provider: string;
  test_credits_only: boolean;
};

export type EvaluationMetrics = {
  ledger_balanced: boolean;
  ledger_imbalance: Record<string, number>;
  audit_chain_intact: boolean;
  environment: string;
  run_mode: string;
  test_credits_only: boolean;
};

// --------------------------------------------------------------------- demo --

export const SCENARIOS = [
  "happy-path",
  "overspend",
  "unapproved-vendor",
  "split-payment",
  "revoke-mid-task",
  "task-failure",
] as const;

export type ScenarioName = (typeof SCENARIOS)[number];

export type ScenarioResult = {
  scenario: string;
  seed: {
    organization_id: string;
    owner_user_id: string;
    agent_id: string;
    agent_name: string;
    /** Redacted by the proxy. The browser is never given a bearer token. */
    owner_api_token: string | null;
    passport_nonce: string;
  };
} & Record<string, unknown>;

// ------------------------------------------------------ system intelligence --
// Typed against docs/system-intelligence-contract.md, which is the single
// source of truth for this shape. Change it there first or not at all.

export type SystemIntelligenceWindow = "1h" | "24h" | "7d" | "30d";

export type MetricUnit = "ppm" | "minor" | "count" | "ms";

export type MetricStatus =
  | "ok"
  | "not_evaluated"
  | "insufficient_sample"
  | "not_connected"
  | "unavailable";

/**
 * Every rate, count, duration and money figure on the telemetry endpoint is
 * wrapped, never bare. `value` is null whenever `status != "ok"` — never 0 as
 * a stand-in — and `sample_size` is the honest denominator, null when there is
 * none. Nothing in an envelope is estimated or hardcoded.
 */
export type MetricEnvelope = {
  value: number | null;
  unit: MetricUnit;
  sample_size: number | null;
  status: MetricStatus;
};

/** The 16 pipeline stages, in the fixed order the contract prescribes. */
export const PIPELINE_STAGE_ORDER = [
  "REQUEST_RECEIVED",
  "SCHEMA_VALIDATION",
  "PASSPORT_VERIFICATION",
  "EVIDENCE_RETRIEVAL",
  "TASK_ANALYST",
  "FEATURE_CALCULATION",
  "UNDERWRITING_ANALYST",
  "CREDIT_RISK_MODEL",
  "INDEPENDENT_RISK_CRITIC",
  "POLICY_ENGINE",
  "HUMAN_REVIEW",
  "VAULT_CREATION",
  "SPEND_MONITORING",
  "REVENUE_COLLECTION",
  "REPAYMENT_WATERFALL",
  "AUDIT_FINALIZATION",
] as const;

export type PipelineStageName = (typeof PIPELINE_STAGE_ORDER)[number];

export type PipelineStageStatus =
  | "healthy"
  | "degraded"
  | "waiting"
  | "reviewing"
  | "failed"
  | "unavailable";

/**
 * A stage with no recorded telemetry in the window reports status
 * "unavailable" and envelopes with status "not_connected" — it does not
 * disappear and it does not claim zeros.
 */
export type PipelineStage = {
  stage: PipelineStageName;
  label: string;
  status: PipelineStageStatus;
  processed: MetricEnvelope;
  succeeded: MetricEnvelope;
  /** A policy rejection is a success of the pipeline, never a true_error. */
  controlled_rejections: MetricEnvelope;
  true_errors: MetricEnvelope;
  p50_ms: MetricEnvelope;
  p95_ms: MetricEnvelope;
  last_completed_at: Timestamp | null;
};

export type AssuranceComponents = {
  identity_verification_accuracy: MetricEnvelope;
  underwriting_decision_agreement: MetricEnvelope;
  evidence_grounding_rate: MetricEnvelope;
  hallucination_containment_rate: MetricEnvelope;
  adversarial_policy_block_rate: MetricEnvelope;
  repayment_invariant_pass_rate: MetricEnvelope;
};

export type ServiceHealthComponent = "api" | "database" | "opa" | "model_runtime";

export type ServiceHealthStatus = "healthy" | "degraded" | "down" | "idle" | "not_connected";

export type ServiceHealthEntry = {
  component: ServiceHealthComponent;
  status: ServiceHealthStatus;
  detail: string | null;
  checked_at: Timestamp;
};

export type FailClosedEvent = {
  at: Timestamp;
  component: string;
  action: string;
  detail: string;
};

export type PolicyDenialCount = { code: string; count: number };

export type SystemIntelligence = {
  generated_at: Timestamp;
  window: SystemIntelligenceWindow;
  assurance: {
    /** unit "count", 0-100. Exists only when all six components are ok. */
    score: MetricEnvelope;
    components: AssuranceComponents;
    last_evaluation_run_at: Timestamp | null;
  };
  summary: {
    requests_processed: MetricEnvelope;
    approvals: MetricEnvelope;
    controlled_rejections: MetricEnvelope;
    human_reviews: MetricEnvelope;
    true_errors: MetricEnvelope;
    pipeline_success_rate: MetricEnvelope;
    prevented_exposure_minor: MetricEnvelope;
    blocked_attempts: MetricEnvelope;
  };
  pipeline: PipelineStage[];
  ai_quality: {
    structured_output_validity: MetricEnvelope;
    verifier_disagreement_rate: MetricEnvelope;
    model_fallback_rate: MetricEnvelope;
    /** An INSUFFICIENT_EVIDENCE reply is successful containment, not failure. */
    insufficient_evidence_responses: MetricEnvelope;
  };
  models: {
    provider: string;
    analyst_model: string | null;
    critic_model: string | null;
    /** Verified from config + telemetry, never hardcoded. */
    external_llm_api_calls: MetricEnvelope;
  };
  credit_engine: {
    decision_version: string;
    scorecard_version: string;
    decisions: MetricEnvelope;
    auto_approved: MetricEnvelope;
    auto_rejected: MetricEnvelope;
    referred_to_human: MetricEnvelope;
  };
  financial_safety: {
    policy_denials_by_code: PolicyDenialCount[];
    frozen_vaults: MetricEnvelope;
    revoked_agents: MetricEnvelope;
    prevented_exposure_minor: MetricEnvelope;
  };
  repayment: {
    waterfall_runs: MetricEnvelope;
    invariant_checked: MetricEnvelope;
    invariant_passed: MetricEnvelope;
    ledger_balanced: boolean;
    audit_chain_intact: boolean;
  };
  service_health: ServiceHealthEntry[];
  fail_closed_events: FailClosedEvent[];
  infrastructure: {
    billing_connected: boolean;
    note: string;
  };
};

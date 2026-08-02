import type {
  ActivityEvent,
  AgentProfile,
  AgentSummary,
  AuditEvent,
  ChainVerification,
  CreditApplicationSummary,
  DashboardSummary,
  EvaluationMetrics,
  EvidenceReceipt,
  ExposurePoint,
  LabelMaps,
  Me,
  PassportVerification,
  PolicyParameters,
  Readiness,
  RepaymentRow,
  RiskEvent,
  RiskSummary,
  ScenarioName,
  ScenarioResult,
  StoredEvidence,
  SystemIntelligence,
  SystemIntelligenceWindow,
  TaskSummary,
  TransactionDetail,
  TransactionSummary,
  UnderwritingQueue,
  UnderwritingView,
  VaultDetail,
  VaultSummary,
  Vendor,
} from "./types";

/**
 * Browser client for the CredenceAI API.
 *
 * Every call is same-origin, to the proxy under /api/credence. That proxy holds
 * the tenant bearer and the sandbox demo token server-side, so this file — and
 * the bundle it ends up in — contains no credential of any kind. There is
 * nothing here to leak in a source map, a network trace, or an error report.
 */

const BASE = "/api/credence";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

type ErrorBody = { error?: { code?: unknown; detail?: unknown }; detail?: unknown };

/** Turn a failure into something a person can read. Backend error codes are
 *  kept for support, but the message shown is the human sentence. */
function toApiError(status: number, body: unknown): ApiError {
  const b = (body ?? {}) as ErrorBody;
  const code = typeof b.error?.code === "string" ? b.error.code : "REQUEST_FAILED";
  const detail =
    typeof b.error?.detail === "string"
      ? b.error.detail
      : typeof b.detail === "string"
        ? b.detail
        : status === 404
          ? "That record could not be found."
          : status === 401 || status === 403
            ? "This workspace is not authorised to view that."
            : "Something went wrong while loading this.";
  return new ApiError(status, code, detail);
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init.headers ?? {}) },
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "Could not reach CredenceAI. Check your connection.");
  }

  const text = await response.text();
  const body: unknown = text === "" ? null : ((): unknown => {
    try {
      return JSON.parse(text);
    } catch {
      return null;
    }
  })();

  if (!response.ok) throw toApiError(response.status, body);
  return body as T;
}

const post = <T>(path: string, json?: unknown): Promise<T> =>
  request<T>(path, {
    method: "POST",
    ...(json === undefined
      ? {}
      : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(json) }),
  });

const qs = (params: Record<string, string | number | undefined>): string => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") search.set(key, String(value));
  }
  const s = search.toString();
  return s === "" ? "" : `?${s}`;
};

// ------------------------------------------------------------------ identity --

export const getMe = () => request<Me>("/v1/me");
export const listAgents = () => request<AgentSummary[]>("/v1/agents");
export const getAgentProfile = (agentId: string) =>
  request<AgentProfile>(`/v1/agents/${encodeURIComponent(agentId)}/profile`);

/**
 * Re-run the passport checks against the agent's stored passport.
 *
 * This is a verification, not a lookup: the server re-derives the canonical
 * bytes and re-checks the signature, issuer, audience, validity window,
 * revocation and scope every time it is called. A passport that was valid an
 * hour ago and has since expired or been revoked comes back invalid here, which
 * is the whole reason the product asks rather than caching an answer.
 */
export const verifyPassport = (agentId: string) =>
  request<PassportVerification>(
    `/v1/agents/${encodeURIComponent(agentId)}/passport/verify`,
  );

// --------------------------------------------------------------------- work --

export const listTasks = () => request<TaskSummary[]>("/v1/tasks");
export const listEvidence = (taskId: string) =>
  request<StoredEvidence[]>(`/v1/tasks/${encodeURIComponent(taskId)}/evidence`);
export const listCreditApplications = () =>
  request<CreditApplicationSummary[]>("/v1/credit-applications");
export const getUnderwriting = (applicationId: string) =>
  request<UnderwritingView>(
    `/v1/credit-applications/${encodeURIComponent(applicationId)}/underwriting`,
  );
export const getUnderwritingQueue = () => request<UnderwritingQueue>("/v1/underwriting/queue");

/**
 * Owner decision on an application held for human review.
 *
 * Field names are the API's, exactly: this sent `approved_limit_minor`, which
 * the endpoint does not declare, so the reviewer's typed amount was dropped
 * and APPROVE granted the full engine cap regardless. The endpoint now
 * rejects unknown fields outright rather than defaulting past them.
 *
 * APPROVE grants the engine's cap and ignores any amount. Granting LESS is a
 * REDUCE and carries `amount_minor`.
 */
export const reviewApplication = (
  applicationId: string,
  body: {
    action: "APPROVE" | "REDUCE" | "REJECT";
    amount_minor?: number;
    notes?: string;
  },
) => post(`/v1/credit-applications/${encodeURIComponent(applicationId)}/review`, body);

// ------------------------------------------------------------- onboarding --

/**
 * The write path a person uses to put their own data into the system.
 *
 * Until these existed the browser could reach 5 of the API's 22 write
 * endpoints, and every agent, task, and application on the deployment came
 * from a demo scenario. A visitor could read the product but not use it.
 *
 * Every amount below is already integer minor units. Rupees are parsed exactly
 * once, at the form field, by `rupeeInputToMinor` — nothing between that
 * function and the wire does arithmetic on a rupee value.
 */

export const createAgent = (body: {
  name: string;
  model_provider: string;
  model_name: string;
  model_version_hash: string;
}) => post<{ agent_id: string; status: string }>("/v1/agents", body);

export const issuePassport = (
  agentId: string,
  body: {
    purpose: string;
    permitted_task_categories: string[];
    max_borrowing_authority_minor: number;
    max_transaction_value_minor: number;
    approved_vendor_ids?: string[];
    ttl_hours?: number;
  },
) =>
  post<{ passport_id: string; payload: unknown; signature_b64: string }>(
    `/v1/agents/${encodeURIComponent(agentId)}/passport`,
    body,
  );

export const createTask = (body: {
  agent_id: string;
  title: string;
  description?: string;
  category: string;
  expected_revenue_minor: number;
  expected_cost_minor: number;
  currency?: string;
}) => post<{ task_id: string; status: string }>("/v1/tasks", body);

/**
 * Submit one piece of evidence against a task.
 *
 * The receipt is worth reading rather than discarding. The server redacts
 * recognised identifiers before storing, so `redactions` says what it removed
 * and the stored text differs from what was typed; `injection_signature` says
 * the text matched a known prompt-injection pattern and was kept anyway. Both
 * are things the person who just typed the text needs told.
 */
export const addEvidence = (
  taskId: string,
  body: { evidence_type: string; content_text: string; source?: string },
) => post<EvidenceReceipt>(`/v1/tasks/${encodeURIComponent(taskId)}/evidence`, body);

export const createRevenueMandate = (taskId: string, body: { reserve_cap_minor: number }) =>
  post<{ mandate_id: string; status: string; locked: boolean }>(
    `/v1/tasks/${encodeURIComponent(taskId)}/revenue-mandate`,
    body,
  );

export const createApplication = (body: {
  agent_id: string;
  task_id: string;
  requested_minor: number;
  requested_duration_hours: number;
  expected_revenue_minor: number;
  expected_cost_minor: number;
  owner_exposure_cap_minor: number;
  proposed_vendor_ids: string[];
  currency?: string;
}) => post<{ application_id: string; status: string }>("/v1/credit-applications", body);

export const evaluateApplication = (applicationId: string) =>
  post<{
    application_id: string;
    status: string;
    decision: string;
    approved_limit_minor: number;
    reason_codes: string[];
    receipt_hash: string;
  }>(`/v1/credit-applications/${encodeURIComponent(applicationId)}/evaluate`);

export const createVault = (body: {
  application_id: string;
  per_transaction_limit_minor: number;
}) =>
  post<{ vault_id: string; status: string; total_limit_minor: number }>("/v1/vaults", body);

// ------------------------------------------------------------------- vaults --

export const listVaults = () => request<VaultSummary[]>("/v1/vaults");
export const getVaultDetail = (vaultId: string) =>
  request<VaultDetail>(`/v1/vaults/${encodeURIComponent(vaultId)}/detail`);
export const freezeVault = (vaultId: string, reason: string) =>
  post(`/v1/vaults/${encodeURIComponent(vaultId)}/freeze`, { reason });
export const closeVault = (vaultId: string) =>
  post(`/v1/vaults/${encodeURIComponent(vaultId)}/close`);

// -------------------------------------------------------------- transactions --

export const listTransactions = (filters: {
  status?: string;
  vault_id?: string;
  agent_id?: string;
} = {}) => request<TransactionSummary[]>(`/v1/transactions${qs(filters)}`);

export const getTransaction = (proposalId: string) =>
  request<TransactionDetail>(`/v1/transactions/${encodeURIComponent(proposalId)}`);

// ---------------------------------------------------------------- repayments --

export const listRepayments = () => request<RepaymentRow[]>("/v1/repayments");

/**
 * Record revenue against a vault and run the repayment waterfall.
 *
 * `task_completed` is what separates a partial repayment from a full one: the
 * backend settles the facility only when the task is declared complete, so the
 * sandbox control that says "final payment" must set it and the one that says
 * "partial" must not.
 *
 * `external_event_id` is the idempotency key. A double-submitted payment is a
 * duplicate credit event, not a second one, so the caller supplies a stable id
 * rather than letting the server invent one per request.
 */
export const receiveRevenue = (
  vaultId: string,
  body: {
    amount_minor: number;
    external_event_id: string;
    task_completed: boolean;
    currency?: string;
  },
) =>
  post<{
    repayment_id: string;
    principal_minor: number;
    fee_minor: number;
    owner_minor: number;
    allocations: Record<string, number>;
  }>(`/v1/vaults/${encodeURIComponent(vaultId)}/revenue`, body);

export const simulateFailure = (vaultId: string) =>
  post<{
    repayment_id: string;
    kind: string;
    swept_minor: number;
    reserve_drawn_minor: number;
    simulated_loss_minor: number;
    allocations: Record<string, number>;
  }>(`/v1/vaults/${encodeURIComponent(vaultId)}/simulate-failure`);

// ---------------------------------------------------------- risk and audit --

export const getRiskSummary = () => request<RiskSummary>("/v1/risk/summary");
export const listRiskEvents = () => request<RiskEvent[]>("/v1/risk/events");
export const listAuditEvents = () => request<AuditEvent[]>("/v1/audit/events");
export const verifyAuditChain = () => request<ChainVerification>("/v1/audit/chain/verify");
export const getLabels = () => request<LabelMaps>("/v1/audit/labels");

// ----------------------------------------------------------------- dashboard --

export const getDashboardSummary = () => request<DashboardSummary>("/v1/dashboard/summary");
export const getActivity = (limit = 20) =>
  request<ActivityEvent[]>(`/v1/dashboard/activity${qs({ limit })}`);
export const getExposureSeries = (days = 14) =>
  request<ExposurePoint[]>(`/v1/dashboard/exposure-series${qs({ days })}`);

// ------------------------------------------------------------------- system --

export const getPolicyParameters = () => request<PolicyParameters>("/v1/policy/parameters");
export const listVendors = () => request<Vendor[]>("/v1/vendors");
export const getReadiness = () => request<Readiness>("/v1/health/ready");
export const getEvaluationMetrics = () => request<EvaluationMetrics>("/v1/metrics/evaluation");

// --------------------------------------------------------------------- demo --

export const runScenario = (name: ScenarioName) =>
  post<ScenarioResult>(`/v1/demo/scenarios/${name}`);

// ------------------------------------------------------ system intelligence --

/**
 * Windowed telemetry for the System Intelligence page. The response shape is
 * docs/system-intelligence-contract.md; every figure arrives in a metric
 * envelope whose value is null whenever its status is not "ok".
 */
export const getSystemIntelligence = (window: SystemIntelligenceWindow = "24h") =>
  request<SystemIntelligence>(`/v1/system-intelligence${qs({ window })}`);

// -------------------------------------------------------------------- voice --

/**
 * Optional voice narration. The backend composes the script server-side from
 * the decision record alone and reports availability without ever exposing a
 * credential; when it answers 503 VOICE_UNAVAILABLE the UI simply stays text.
 */

export type VoiceStatus = { enabled: boolean; provider: string };
export type DecisionScript = { text: string };

export const getVoiceStatus = () => request<VoiceStatus>("/v1/voice/status");
export const getDecisionScript = (applicationId: string) =>
  request<DecisionScript>(`/v1/voice/decisions/${encodeURIComponent(applicationId)}/script`);

/** POST the narration request and return the audio bytes. Any failure —
 *  including 503 VOICE_UNAVAILABLE — surfaces as an ApiError the caller
 *  treats as "fall back to text". */
export const fetchDecisionNarration = async (applicationId: string): Promise<Blob> => {
  let response: Response;
  try {
    response = await fetch(`${BASE}/v1/voice/decisions/${encodeURIComponent(applicationId)}`, {
      method: "POST",
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "Could not reach CredenceAI. Check your connection.");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw toApiError(response.status, body);
  }
  return response.blob();
};

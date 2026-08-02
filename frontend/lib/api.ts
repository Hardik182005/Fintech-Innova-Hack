import type {
  ActivityEvent,
  AgentProfile,
  AgentSummary,
  AuditEvent,
  ChainVerification,
  CreditApplicationSummary,
  DashboardSummary,
  EvaluationMetrics,
  ExposurePoint,
  LabelMaps,
  Me,
  PolicyParameters,
  Readiness,
  RepaymentRow,
  RiskEvent,
  RiskSummary,
  ScenarioName,
  ScenarioResult,
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

// --------------------------------------------------------------------- work --

export const listTasks = () => request<TaskSummary[]>("/v1/tasks");
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

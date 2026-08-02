"use client";

import { useCallback } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import * as api from "@/lib/api";
import type { ScenarioName, SystemIntelligenceWindow } from "@/lib/types";

/**
 * Query keys and hooks.
 *
 * The keys are hierarchical so a mutation can invalidate a whole area in one
 * call: approving an application changes the application, the vault that gets
 * created, the audit chain and the dashboard totals, and every one of those has
 * to refetch or the screen starts lying about the workspace.
 */

export const keys = {
  me: ["me"] as const,

  agents: ["agents"] as const,
  agent: (agentId: string) => ["agents", agentId] as const,

  tasks: ["tasks"] as const,

  applications: ["credit-applications"] as const,
  underwriting: (applicationId: string) => ["credit-applications", applicationId, "underwriting"] as const,
  underwritingQueue: ["underwriting", "queue"] as const,

  vaults: ["vaults"] as const,
  vault: (vaultId: string) => ["vaults", vaultId] as const,

  transactions: (filters: TransactionFilters = {}) => ["transactions", filters] as const,
  transaction: (proposalId: string) => ["transactions", proposalId] as const,

  repayments: ["repayments"] as const,

  riskSummary: ["risk", "summary"] as const,
  riskEvents: ["risk", "events"] as const,

  auditEvents: ["audit", "events"] as const,
  auditChain: ["audit", "chain"] as const,
  labels: ["audit", "labels"] as const,

  dashboard: ["dashboard", "summary"] as const,
  activity: (limit: number) => ["dashboard", "activity", limit] as const,
  exposure: (days: number) => ["dashboard", "exposure", days] as const,

  policy: ["policy", "parameters"] as const,
  vendors: ["vendors"] as const,
  readiness: ["health", "ready"] as const,
  evaluation: ["metrics", "evaluation"] as const,
} as const;

export type TransactionFilters = { status?: string; vault_id?: string; agent_id?: string };

/** Options every hook accepts, so a caller can pause or poll one panel. */
type Opts<T> = Omit<UseQueryOptions<T, Error, T>, "queryKey" | "queryFn">;

// --------------------------------------------------------------- identity --

export const useMe = (opts?: Opts<Awaited<ReturnType<typeof api.getMe>>>) =>
  useQuery({ queryKey: keys.me, queryFn: api.getMe, staleTime: 5 * 60_000, ...opts });

export const useAgents = (opts?: Opts<Awaited<ReturnType<typeof api.listAgents>>>) =>
  useQuery({ queryKey: keys.agents, queryFn: api.listAgents, ...opts });

export const useAgent = (agentId: string, opts?: Opts<Awaited<ReturnType<typeof api.getAgentProfile>>>) =>
  useQuery({
    queryKey: keys.agent(agentId),
    queryFn: () => api.getAgentProfile(agentId),
    enabled: agentId !== "",
    ...opts,
  });

// ------------------------------------------------------------------- work --

export const useTasks = (opts?: Opts<Awaited<ReturnType<typeof api.listTasks>>>) =>
  useQuery({ queryKey: keys.tasks, queryFn: api.listTasks, ...opts });

export const useApplications = (opts?: Opts<Awaited<ReturnType<typeof api.listCreditApplications>>>) =>
  useQuery({ queryKey: keys.applications, queryFn: api.listCreditApplications, ...opts });

export const useUnderwriting = (
  applicationId: string,
  opts?: Opts<Awaited<ReturnType<typeof api.getUnderwriting>>>,
) =>
  useQuery({
    queryKey: keys.underwriting(applicationId),
    queryFn: () => api.getUnderwriting(applicationId),
    enabled: applicationId !== "",
    ...opts,
  });

export const useUnderwritingQueue = (
  opts?: Opts<Awaited<ReturnType<typeof api.getUnderwritingQueue>>>,
) => useQuery({ queryKey: keys.underwritingQueue, queryFn: api.getUnderwritingQueue, ...opts });

// ----------------------------------------------------------------- vaults --

export const useVaults = (opts?: Opts<Awaited<ReturnType<typeof api.listVaults>>>) =>
  useQuery({ queryKey: keys.vaults, queryFn: api.listVaults, ...opts });

export const useVault = (vaultId: string, opts?: Opts<Awaited<ReturnType<typeof api.getVaultDetail>>>) =>
  useQuery({
    queryKey: keys.vault(vaultId),
    queryFn: () => api.getVaultDetail(vaultId),
    enabled: vaultId !== "",
    ...opts,
  });

// ----------------------------------------------------------- transactions --

export const useTransactions = (
  filters: TransactionFilters = {},
  opts?: Opts<Awaited<ReturnType<typeof api.listTransactions>>>,
) =>
  useQuery({
    queryKey: keys.transactions(filters),
    queryFn: () => api.listTransactions(filters),
    ...opts,
  });

export const useTransaction = (
  proposalId: string,
  opts?: Opts<Awaited<ReturnType<typeof api.getTransaction>>>,
) =>
  useQuery({
    queryKey: keys.transaction(proposalId),
    queryFn: () => api.getTransaction(proposalId),
    enabled: proposalId !== "",
    ...opts,
  });

// ------------------------------------------------------------- repayments --

export const useRepayments = (opts?: Opts<Awaited<ReturnType<typeof api.listRepayments>>>) =>
  useQuery({ queryKey: keys.repayments, queryFn: api.listRepayments, ...opts });

// ---------------------------------------------------------- risk / audit --

export const useRiskSummary = (opts?: Opts<Awaited<ReturnType<typeof api.getRiskSummary>>>) =>
  useQuery({ queryKey: keys.riskSummary, queryFn: api.getRiskSummary, ...opts });

export const useRiskEvents = (opts?: Opts<Awaited<ReturnType<typeof api.listRiskEvents>>>) =>
  useQuery({ queryKey: keys.riskEvents, queryFn: api.listRiskEvents, ...opts });

export const useAuditEvents = (opts?: Opts<Awaited<ReturnType<typeof api.listAuditEvents>>>) =>
  useQuery({ queryKey: keys.auditEvents, queryFn: api.listAuditEvents, ...opts });

export const useAuditChain = (opts?: Opts<Awaited<ReturnType<typeof api.verifyAuditChain>>>) =>
  useQuery({ queryKey: keys.auditChain, queryFn: api.verifyAuditChain, ...opts });

export const useLabels = (opts?: Opts<Awaited<ReturnType<typeof api.getLabels>>>) =>
  useQuery({ queryKey: keys.labels, queryFn: api.getLabels, staleTime: Infinity, ...opts });

// -------------------------------------------------------------- dashboard --

export const useDashboard = (opts?: Opts<Awaited<ReturnType<typeof api.getDashboardSummary>>>) =>
  useQuery({ queryKey: keys.dashboard, queryFn: api.getDashboardSummary, ...opts });

export const useActivity = (limit = 20, opts?: Opts<Awaited<ReturnType<typeof api.getActivity>>>) =>
  useQuery({ queryKey: keys.activity(limit), queryFn: () => api.getActivity(limit), ...opts });

export const useExposureSeries = (
  days = 14,
  opts?: Opts<Awaited<ReturnType<typeof api.getExposureSeries>>>,
) => useQuery({ queryKey: keys.exposure(days), queryFn: () => api.getExposureSeries(days), ...opts });

// ----------------------------------------------------------------- system --

export const usePolicyParameters = (opts?: Opts<Awaited<ReturnType<typeof api.getPolicyParameters>>>) =>
  useQuery({
    queryKey: keys.policy,
    queryFn: api.getPolicyParameters,
    staleTime: 10 * 60_000,
    ...opts,
  });

export const useVendors = (opts?: Opts<Awaited<ReturnType<typeof api.listVendors>>>) =>
  useQuery({ queryKey: keys.vendors, queryFn: api.listVendors, staleTime: 10 * 60_000, ...opts });

export const useReadiness = (opts?: Opts<Awaited<ReturnType<typeof api.getReadiness>>>) =>
  useQuery({ queryKey: keys.readiness, queryFn: api.getReadiness, ...opts });

export const useEvaluationMetrics = (
  opts?: Opts<Awaited<ReturnType<typeof api.getEvaluationMetrics>>>,
) => useQuery({ queryKey: keys.evaluation, queryFn: api.getEvaluationMetrics, ...opts });

// -------------------------------------------------------------- mutations --

/**
 * Everything a write touches. A credit decision is not local to one record —
 * approving an application opens a vault, moves the ledger and extends the
 * audit chain — so writes invalidate the areas that genuinely changed rather
 * than patching one cache entry and leaving the rest stale.
 */
function useInvalidateAfterWrite() {
  const client = useQueryClient();
  return useCallback(
    (areas: readonly (readonly unknown[])[]) => {
      for (const key of areas) void client.invalidateQueries({ queryKey: key });
    },
    [client],
  );
}

export function useReviewApplication(applicationId: string) {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (body: {
      action: "APPROVE" | "REDUCE" | "REJECT";
      amount_minor?: number;
      notes?: string;
    }) => api.reviewApplication(applicationId, body),
    onSuccess: () =>
      invalidate([
        keys.applications,
        keys.underwriting(applicationId),
        keys.underwritingQueue,
        keys.vaults,
        keys.auditEvents,
        keys.auditChain,
        keys.dashboard,
        ["dashboard"],
        keys.riskSummary,
      ]),
  });
}

export function useFreezeVault(vaultId: string) {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: (reason: string) => api.freezeVault(vaultId, reason),
    onSuccess: () =>
      invalidate([
        keys.vault(vaultId),
        keys.vaults,
        keys.riskEvents,
        keys.riskSummary,
        keys.auditEvents,
        keys.auditChain,
        ["dashboard"],
      ]),
  });
}

export function useCloseVault(vaultId: string) {
  const invalidate = useInvalidateAfterWrite();
  return useMutation({
    mutationFn: () => api.closeVault(vaultId),
    onSuccess: () =>
      invalidate([
        keys.vault(vaultId),
        keys.vaults,
        keys.repayments,
        keys.auditEvents,
        keys.auditChain,
        ["dashboard"],
      ]),
  });
}

/**
 * Judge scenarios seed into the caller's own workspace, so a run changes almost
 * every screen. The whole cache is dropped rather than enumerated: listing the
 * areas here would be a list that goes stale the first time a page is added.
 */
export function useRunScenario() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (name: ScenarioName) => api.runScenario(name),
    onSuccess: () => client.invalidateQueries(),
  });
}

// ------------------------------------------------------ system intelligence --

export const systemIntelligenceKey = (window: SystemIntelligenceWindow) =>
  ["system-intelligence", window] as const;

/**
 * Windowed telemetry for the System Intelligence page. Keyed by window so
 * switching 1h → 24h is a separate cache entry, and a caller that wants a live
 * feed passes `refetchInterval` — the data refetches, the page never reloads.
 */
export const useSystemIntelligence = (
  window: SystemIntelligenceWindow,
  opts?: Opts<Awaited<ReturnType<typeof api.getSystemIntelligence>>>,
) =>
  useQuery({
    queryKey: systemIntelligenceKey(window),
    queryFn: () => api.getSystemIntelligence(window),
    ...opts,
  });

// -------------------------------------------------------------------- voice --

export const voiceKeys = {
  status: ["voice", "status"] as const,
  script: (applicationId: string) => ["voice", "script", applicationId] as const,
} as const;

/**
 * Voice availability. Off the critical path by construction: no retries, a
 * long stale time, and every consumer renders nothing when this is anything
 * other than a confirmed `enabled: true`.
 */
export const useVoiceStatus = (opts?: Opts<Awaited<ReturnType<typeof api.getVoiceStatus>>>) =>
  useQuery({
    queryKey: voiceKeys.status,
    queryFn: api.getVoiceStatus,
    staleTime: 10 * 60_000,
    retry: false,
    ...opts,
  });

/** The exact narration text the backend would speak for this decision. */
export const useDecisionScript = (
  applicationId: string,
  opts?: Opts<Awaited<ReturnType<typeof api.getDecisionScript>>>,
) =>
  useQuery({
    queryKey: voiceKeys.script(applicationId),
    queryFn: () => api.getDecisionScript(applicationId),
    enabled: applicationId !== "",
    retry: false,
    ...opts,
  });

"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Plus, Trash2 } from "lucide-react";

import { VendorPicker } from "@/components/onboarding/register-agent";
import { StepList } from "@/components/onboarding/steps";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Label, Select, Textarea } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import * as api from "@/lib/api";
import { money, rupeeInputToMinor } from "@/lib/format";
import {
  EVIDENCE_TEMPLATES,
  EVIDENCE_TYPES,
  TASK_CATEGORIES,
  runSteps,
  type StepState,
} from "@/lib/onboarding";
import { useAgents, useInvalidateWorkspace, useVendors } from "@/lib/queries";
import type { EvidenceReceipt } from "@/lib/types";

/**
 * Request task-backed working capital against a new task.
 *
 * This posts five times: task, then each piece of evidence, then the revenue
 * mandate, then the application itself. They are separate API calls because
 * they are separate records with separate lifetimes — evidence is content
 * hashed on arrival and the mandate outlives the application — so the form runs
 * them in order and reports each one.
 *
 * Rupees are read from these fields and converted exactly once, by
 * `rupeeInputToMinor`. Nothing downstream of that call sees a rupee value, and
 * nothing between here and the wire does arithmetic on one.
 */

const MAX_DURATION_HOURS = 720;
const MAX_EVIDENCE_CHARS = 20_000;

interface EvidenceDraft {
  key: string;
  evidence_type: string;
  content_text: string;
}

let evidenceKeySeq = 0;
const newDraft = (evidence_type = "TASK_ORDER"): EvidenceDraft => ({
  key: `e${(evidenceKeySeq += 1)}`,
  evidence_type,
  content_text: EVIDENCE_TEMPLATES[evidence_type] ?? "",
});

export function NewApplicationSheet({
  open,
  onClose,
  presetAgentId,
}: {
  open: boolean;
  onClose: () => void;
  /** Preselect an agent, e.g. the one just registered by the wizard. */
  presetAgentId?: string;
}) {
  const router = useRouter();
  const agents = useAgents();
  const vendors = useVendors();
  const invalidateWorkspace = useInvalidateWorkspace();

  const [chosenAgentId, setChosenAgentId] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [category, setCategory] = React.useState(TASK_CATEGORIES[0].value);
  const [requested, setRequested] = React.useState("2500");
  const [expectedCost, setExpectedCost] = React.useState("2400");
  const [expectedRevenue, setExpectedRevenue] = React.useState("4000");
  const [durationHoursText, setDurationHoursText] = React.useState("24");
  const [reserveCap, setReserveCap] = React.useState("500");
  const [ownerCap, setOwnerCap] = React.useState("10000");
  const [ownerAuthorised, setOwnerAuthorised] = React.useState(false);
  const [vendorIds, setVendorIds] = React.useState<string[]>([]);
  const [drafts, setDrafts] = React.useState<EvidenceDraft[]>([newDraft("TASK_ORDER")]);

  const [steps, setSteps] = React.useState<StepState[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [receipts, setReceipts] = React.useState<EvidenceReceipt[]>([]);
  const [applicationId, setApplicationId] = React.useState<string | null>(null);

  // Only the agents that can actually hold credit. An agent with no passport
  // would fail at evaluation, so it does not belong in the list.
  const eligible = React.useMemo(
    () => (agents.data ?? []).filter((a) => a.has_passport && a.status === "ACTIVE"),
    [agents.data],
  );

  // Derived rather than synced into state: the default follows whichever agent
  // was just registered, or the first eligible one, until the person picks.
  const agentId =
    chosenAgentId !== "" ? chosenAgentId : (presetAgentId ?? eligible[0]?.agent_id ?? "");

  const requestedMinor = rupeeInputToMinor(requested);
  const costMinor = rupeeInputToMinor(expectedCost);
  const revenueMinor = rupeeInputToMinor(expectedRevenue);
  const reserveMinor = rupeeInputToMinor(reserveCap);
  const ownerCapMinor = rupeeInputToMinor(ownerCap);
  const durationHours = Number.parseInt(durationHoursText, 10);

  const problems: Record<string, string> = {};
  if (agentId === "") problems.agentId = "Choose an agent holding a verified passport.";
  if (title.trim().length < 3) problems.title = "Give the task a title.";
  if (requestedMinor === null) problems.requested = "Enter the amount in rupees, above zero.";
  if (costMinor === null) problems.expectedCost = "Enter the expected cost in rupees.";
  if (revenueMinor === null) problems.expectedRevenue = "Enter the expected revenue in rupees.";
  if (reserveMinor === null) problems.reserveCap = "Enter the reserve cap in rupees.";
  if (ownerCapMinor === null) problems.ownerCap = "Enter the owner's exposure cap in rupees.";
  if (!Number.isInteger(durationHours) || durationHours < 1 || durationHours > MAX_DURATION_HOURS)
    problems.duration = `Between 1 and ${MAX_DURATION_HOURS} hours.`;
  if (!ownerAuthorised) problems.ownerAuthorised = "The owner must authorise this request.";
  if (drafts.length === 0) problems.evidence = "Attach at least one piece of evidence.";
  if (drafts.some((d) => d.content_text.trim() === ""))
    problems.evidence = "Every evidence entry needs text, or remove it.";
  if (drafts.some((d) => d.content_text.length > MAX_EVIDENCE_CHARS))
    problems.evidence = `Evidence is limited to ${MAX_EVIDENCE_CHARS.toLocaleString("en-IN")} characters each.`;
  const ready = Object.keys(problems).length === 0;

  const margin =
    revenueMinor !== null && costMinor !== null ? revenueMinor - costMinor : null;

  const submit = React.useCallback(async () => {
    if (
      !ready ||
      requestedMinor === null ||
      costMinor === null ||
      revenueMinor === null ||
      reserveMinor === null ||
      ownerCapMinor === null
    )
      return;

    setBusy(true);
    setReceipts([]);
    let taskId = "";
    let createdApplicationId = "";

    const outcome = await runSteps(
      [
        {
          label: "Create the task",
          run: async () => {
            const task = await api.createTask({
              agent_id: agentId,
              title: title.trim(),
              description: description.trim(),
              category,
              expected_revenue_minor: revenueMinor,
              expected_cost_minor: costMinor,
            });
            taskId = task.task_id;
            return task;
          },
        },
        {
          label: `Store evidence (${drafts.length})`,
          run: async () => {
            const stored: EvidenceReceipt[] = [];
            for (const draft of drafts) {
              stored.push(
                await api.addEvidence(taskId, {
                  evidence_type: draft.evidence_type,
                  content_text: draft.content_text.trim(),
                  source: "web-form",
                }),
              );
            }
            setReceipts(stored);
            return stored[stored.length - 1];
          },
        },
        {
          label: "Lock the revenue mandate",
          run: () => api.createRevenueMandate(taskId, { reserve_cap_minor: reserveMinor }),
        },
        {
          label: "Submit the credit application",
          run: async () => {
            const application = await api.createApplication({
              agent_id: agentId,
              task_id: taskId,
              requested_minor: requestedMinor,
              requested_duration_hours: durationHours,
              expected_revenue_minor: revenueMinor,
              expected_cost_minor: costMinor,
              owner_exposure_cap_minor: ownerCapMinor,
              proposed_vendor_ids: vendorIds,
            });
            createdApplicationId = application.application_id;
            return application;
          },
        },
      ],
      setSteps,
    );

    setBusy(false);
    if (outcome.ok) {
      setApplicationId(createdApplicationId);
      invalidateWorkspace();
    }
  }, [
    ready,
    requestedMinor,
    costMinor,
    revenueMinor,
    reserveMinor,
    ownerCapMinor,
    agentId,
    title,
    description,
    category,
    drafts,
    durationHours,
    vendorIds,
    invalidateWorkspace,
  ]);

  const submitted = applicationId !== null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width="xl"
      title="New credit application"
      subtitle="Task-backed working capital. Amounts are in rupees; the sandbox issues test credits only."
      footer={
        submitted ? (
          <>
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                router.push(`/credit-applications/${applicationId}`);
              }}
            >
              Open the application
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!ready || busy}>
              {busy ? "Submitting…" : "Submit application"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-6">
        {eligible.length === 0 && !agents.isPending && (
          <p className="rounded-lg border border-caution/30 bg-caution-wash p-3 text-xs leading-relaxed text-body">
            No agent in this workspace holds a verified passport. Register one first — credit is
            only ever extended to an agent that has one.
          </p>
        )}

        <fieldset disabled={busy || submitted} className="space-y-5">
          {/* ------------------------------------------------------ task -- */}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Agent" hint={problems.agentId} htmlFor="app-agent">
              <Select
                id="app-agent"
                value={agentId}
                onChange={(event) => setChosenAgentId(event.target.value)}
                aria-invalid={problems.agentId !== undefined}
              >
                <option value="">Select an agent…</option>
                {eligible.map((agent) => (
                  <option key={agent.agent_id} value={agent.agent_id}>
                    {agent.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              label="Task category"
              hint="Must sit inside the agent's permitted categories, or the passport scope check fails."
              htmlFor="app-category"
            >
              <Select
                id="app-category"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {TASK_CATEGORIES.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label="Task title" hint={problems.title} htmlFor="app-title">
            <Input
              id="app-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Enrich 800 product listings for order SYN-2044"
              aria-invalid={problems.title !== undefined}
            />
          </Field>

          <Field
            label="Task description"
            hint="Read by the analyst model as untrusted input. It is not a place to give instructions."
            htmlFor="app-description"
          >
            <Textarea
              id="app-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What the work is, what it costs to run, and when the customer pays."
            />
          </Field>

          {/* ----------------------------------------------------- money -- */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Field
              label="Requested credit (₹)"
              hint={problems.requested}
              htmlFor="app-requested"
            >
              <Input
                id="app-requested"
                inputMode="decimal"
                value={requested}
                onChange={(event) => setRequested(event.target.value)}
                aria-invalid={problems.requested !== undefined}
              />
            </Field>
            <Field label="Expected cost (₹)" hint={problems.expectedCost} htmlFor="app-cost">
              <Input
                id="app-cost"
                inputMode="decimal"
                value={expectedCost}
                onChange={(event) => setExpectedCost(event.target.value)}
                aria-invalid={problems.expectedCost !== undefined}
              />
            </Field>
            <Field
              label="Expected revenue (₹)"
              hint={problems.expectedRevenue}
              htmlFor="app-revenue"
            >
              <Input
                id="app-revenue"
                inputMode="decimal"
                value={expectedRevenue}
                onChange={(event) => setExpectedRevenue(event.target.value)}
                aria-invalid={problems.expectedRevenue !== undefined}
              />
            </Field>
          </div>

          {margin !== null && (
            <p className="text-xs text-muted">
              Expected margin {money(margin)}.{" "}
              {margin <= 0
                ? "A task that does not cover its own cost has nothing to repay from — expect this to be reduced or refused."
                : "The deterministic engine caps the advance against this, not against the amount requested."}
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Requested duration (hours)"
              hint={
                problems.duration ??
                "How long the credit is needed for. The task is expected to complete, and revenue to arrive, inside this window."
              }
              htmlFor="app-duration"
            >
              <Input
                id="app-duration"
                inputMode="numeric"
                value={durationHoursText}
                onChange={(event) => setDurationHoursText(event.target.value)}
                aria-invalid={problems.duration !== undefined}
              />
            </Field>
            <Field
              label="Repayment reserve cap (₹)"
              hint={problems.reserveCap ?? "How much task revenue is held back against failure."}
              htmlFor="app-reserve"
            >
              <Input
                id="app-reserve"
                inputMode="decimal"
                value={reserveCap}
                onChange={(event) => setReserveCap(event.target.value)}
                aria-invalid={problems.reserveCap !== undefined}
              />
            </Field>
          </div>

          <Field
            label="Repayment source"
            hint="Task revenue is contractually routed to the platform escrow account before anyone is paid. This is what makes the credit self-repaying, and it is the only repayment route the product supports."
          >
            <Input value="Revenue mandate — REVENUE_ESCROW" readOnly aria-readonly className="bg-surface-muted font-mono text-muted" />
          </Field>

          {/* ------------------------------------------------- vendors -- */}
          <Field
            label="Approved vendors for this task"
            hint="The vault will block a payment to anyone not named here."
          >
            {vendors.isPending ? (
              <p className="text-xs text-muted">Loading vendors…</p>
            ) : vendors.isError ? (
              <p className="text-xs text-critical">{vendors.error.message}</p>
            ) : (
              <VendorPicker
                vendors={vendors.data}
                selected={vendorIds}
                onToggle={(id) =>
                  setVendorIds((current) =>
                    current.includes(id) ? current.filter((v) => v !== id) : [...current, id],
                  )
                }
              />
            )}
          </Field>

          {/* ---------------------------------------------- evidence -- */}
          <div>
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <Label className="mb-0">Evidence</Label>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">
                  Every entry is stored with its own ID, type, source, timestamp, tenant and task,
                  and is content-hashed on arrival. Recognised identifiers — PAN, Aadhaar, IFSC,
                  card and account numbers, phone, e-mail — are stripped before storage. Use
                  synthetic material only.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => setDrafts((current) => [...current, newDraft("PRIOR_TASK_OUTCOME")])}
              >
                <Plus /> Add
              </Button>
            </div>

            {problems.evidence !== undefined && (
              <p className="mb-2 text-xs text-critical">{problems.evidence}</p>
            )}

            <div className="space-y-3">
              {drafts.map((draft, index) => (
                <div key={draft.key} className="rounded-lg border border-line bg-surface-sunken p-3">
                  <div className="flex items-center gap-2">
                    <Select
                      value={draft.evidence_type}
                      aria-label={`Evidence ${index + 1} type`}
                      onChange={(event) => {
                        const nextType = event.target.value;
                        setDrafts((current) =>
                          current.map((d) =>
                            d.key === draft.key
                              ? {
                                  ...d,
                                  evidence_type: nextType,
                                  // Only replace text the person has not edited
                                  // away from the template for the old type.
                                  content_text:
                                    d.content_text.trim() === "" ||
                                    d.content_text === EVIDENCE_TEMPLATES[d.evidence_type]
                                      ? (EVIDENCE_TEMPLATES[nextType] ?? "")
                                      : d.content_text,
                                }
                              : d,
                          ),
                        );
                      }}
                      className="w-56"
                    >
                      {EVIDENCE_TYPES.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                    <span className="min-w-0 flex-1 truncate text-xs text-muted">
                      {EVIDENCE_TYPES.find((t) => t.value === draft.evidence_type)?.hint}
                    </span>
                    {drafts.length > 1 && (
                      <Button
                        size="icon-sm"
                        variant="ghost"
                        aria-label={`Remove evidence ${index + 1}`}
                        onClick={() =>
                          setDrafts((current) => current.filter((d) => d.key !== draft.key))
                        }
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                  <Textarea
                    value={draft.content_text}
                    aria-label={`Evidence ${index + 1} content`}
                    maxLength={MAX_EVIDENCE_CHARS}
                    onChange={(event) =>
                      setDrafts((current) =>
                        current.map((d) =>
                          d.key === draft.key ? { ...d, content_text: event.target.value } : d,
                        ),
                      )
                    }
                    className="mt-2 bg-surface"
                  />
                  <p className="mt-1 text-right text-[0.6875rem] text-faint">
                    {draft.content_text.length.toLocaleString("en-IN")} /{" "}
                    {MAX_EVIDENCE_CHARS.toLocaleString("en-IN")}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------------------- authorisation -- */}
          <hr className="border-line-soft" />

          <Field
            label="Owner exposure cap (₹)"
            hint={
              problems.ownerCap ??
              "The most this owner allows across all their agents at once. The engine will not approve past it."
            }
            htmlFor="app-owner-cap"
          >
            <Input
              id="app-owner-cap"
              inputMode="decimal"
              value={ownerCap}
              onChange={(event) => setOwnerCap(event.target.value)}
              aria-invalid={problems.ownerCap !== undefined}
            />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 text-sm text-body">
            <input
              type="checkbox"
              checked={ownerAuthorised}
              onChange={(event) => setOwnerAuthorised(event.target.checked)}
              className="mt-0.5 size-4 shrink-0 rounded border-line"
            />
            <span>
              As owner, I authorise this agent to borrow against this task, up to the exposure cap
              above.
              {problems.ownerAuthorised !== undefined && (
                <span className="mt-0.5 block text-xs text-critical">
                  {problems.ownerAuthorised}
                </span>
              )}
            </span>
          </label>
        </fieldset>

        {/* ------------------------------------------------------ progress -- */}
        {steps.length > 0 && (
          <div className="rounded-lg border border-line bg-surface-sunken p-4">
            <StepList steps={steps} />
          </div>
        )}

        <IntakeNotices receipts={receipts} />

        {submitted && (
          <p className="text-xs leading-relaxed text-muted">
            The application is submitted and sits in the queue. Open it to run underwriting — the
            model advises, the deterministic engine sets the amount.
          </p>
        )}
      </div>
    </Sheet>
  );
}

/**
 * What the intake boundary did to the submitted text.
 *
 * Shown because the stored copy differs from what was typed whenever anything
 * was redacted, and because an injection signature is something the submitter
 * should know they triggered — not a silent server-side note.
 */
function IntakeNotices({ receipts }: { receipts: EvidenceReceipt[] }) {
  const redacted = receipts.filter((r) => r.redactions.length > 0);
  const flagged = receipts.filter((r) => r.injection_signature);
  if (redacted.length === 0 && flagged.length === 0) return null;

  return (
    <div className="space-y-2">
      {redacted.length > 0 && (
        <div className="rounded-lg border border-info/30 bg-info-wash p-3">
          <p className="text-sm font-medium text-ink">Identifiers were removed before storage</p>
          <ul className="mt-1.5 space-y-1">
            {redacted.map((r) => (
              <li key={r.evidence_id} className="flex flex-wrap items-center gap-1.5 text-xs">
                <span className="font-mono text-faint">{r.evidence_id}</span>
                {r.redactions.map((kind) => (
                  <Badge key={kind} tone="info" size="sm">
                    {kind}
                  </Badge>
                ))}
              </li>
            ))}
          </ul>
        </div>
      )}
      {flagged.length > 0 && (
        <div className="rounded-lg border border-caution/30 bg-caution-wash p-3">
          <p className="flex items-center gap-2 text-sm font-medium text-ink">
            <AlertTriangle className="size-4 text-caution" />
            Evidence matched a prompt-injection signature
          </p>
          <p className="mt-1 text-xs leading-relaxed text-body">
            It was stored anyway, and the analyst is instructed to treat instructions inside
            evidence as a concern rather than follow them. Every claim the model makes is
            re-checked against evidence IDs before any amount is set.
          </p>
          <p className="mt-1.5 font-mono text-[0.6875rem] text-faint">
            {flagged.map((r) => r.evidence_id).join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}

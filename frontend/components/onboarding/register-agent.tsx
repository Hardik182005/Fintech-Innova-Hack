"use client";

import * as React from "react";
import { ShieldCheck, ShieldX } from "lucide-react";

import { StepList } from "@/components/onboarding/steps";
import { Mono } from "@/components/data/value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Sheet } from "@/components/ui/sheet";
import * as api from "@/lib/api";
import { humanise, money, rupeeInputToMinor } from "@/lib/format";
import { MODEL_PROVIDERS, TASK_CATEGORIES, runSteps, type StepState } from "@/lib/onboarding";
import { useInvalidateWorkspace, useMe, useVendors } from "@/lib/queries";
import type { PassportVerification, Vendor } from "@/lib/types";

/**
 * Register an agent and give it a passport, in one pass.
 *
 * The two are separated in the API and joined here on purpose: an agent with no
 * passport can hold no credit, so registering one and stopping would produce a
 * row that looks registered and can do nothing. The form therefore always
 * issues the passport, then immediately re-verifies it and shows the result,
 * because a passport this product has not checked is not evidence of anything.
 *
 * Every field below writes to a column. Where the concept the operator has in
 * mind has no column — an external agent ID, a separate owner principal — the
 * form says what the system records instead rather than offering an input that
 * goes nowhere. `docs/FINAL_DATA_INPUT_MAP.md` lists those cases.
 */

const MAX_TTL_HOURS = 24;

export function RegisterAgentSheet({
  open,
  onClose,
  onRegistered,
}: {
  open: boolean;
  onClose: () => void;
  /** Called with the new agent id once the whole sequence succeeded. */
  onRegistered?: (agentId: string) => void;
}) {
  const me = useMe();
  const vendors = useVendors();
  const invalidateWorkspace = useInvalidateWorkspace();

  const [name, setName] = React.useState("");
  const [provider, setProvider] = React.useState(MODEL_PROVIDERS[0].value);
  const [modelName, setModelName] = React.useState("");
  const [versionHash, setVersionHash] = React.useState("");
  const [purpose, setPurpose] = React.useState("");
  const [categories, setCategories] = React.useState<string[]>(["COMPUTE"]);
  const [borrowingLimit, setBorrowingLimit] = React.useState("5000");
  const [perTransaction, setPerTransaction] = React.useState("600");
  const [vendorIds, setVendorIds] = React.useState<string[]>([]);
  const [ttlHours, setTtlHours] = React.useState("12");

  const [steps, setSteps] = React.useState<StepState[]>([]);
  const [busy, setBusy] = React.useState(false);
  const [verification, setVerification] = React.useState<PassportVerification | null>(null);
  const [agentId, setAgentId] = React.useState<string | null>(null);

  const borrowingMinor = rupeeInputToMinor(borrowingLimit);
  const perTransactionMinor = rupeeInputToMinor(perTransaction);
  const ttl = Number.parseInt(ttlHours, 10);

  // Every rule that would make the API reject this, checked before it is sent,
  // so the person sees the sentence next to the field rather than a 422.
  const problems: Record<string, string> = {};
  if (name.trim().length < 2) problems.name = "Give the agent a name of at least two characters.";
  if (modelName.trim() === "") problems.modelName = "Name the model this agent runs on.";
  if (versionHash.trim() === "")
    problems.versionHash = "Record the pinned version. This is what the passport binds to.";
  if (purpose.trim().length < 4) problems.purpose = "Say in one line what this agent is for.";
  if (categories.length === 0) problems.categories = "Pick at least one permitted category.";
  if (borrowingMinor === null) problems.borrowingLimit = "Enter an amount in rupees, above zero.";
  if (perTransactionMinor === null) problems.perTransaction = "Enter an amount in rupees, above zero.";
  if (borrowingMinor !== null && perTransactionMinor !== null && perTransactionMinor > borrowingMinor)
    problems.perTransaction = "A single payment cannot exceed the total borrowing authority.";
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_TTL_HOURS)
    problems.ttlHours = `Between 1 and ${MAX_TTL_HOURS} hours.`;
  const ready = Object.keys(problems).length === 0;


  const submit = React.useCallback(async () => {
    if (!ready || borrowingMinor === null || perTransactionMinor === null) return;
    setBusy(true);
    setVerification(null);

    let createdAgentId = "";
    const outcome = await runSteps(
      [
        {
          label: "Register the agent",
          run: async () => {
            const created = await api.createAgent({
              name: name.trim(),
              model_provider: provider,
              model_name: modelName.trim(),
              model_version_hash: versionHash.trim(),
            });
            createdAgentId = created.agent_id;
            return created;
          },
        },
        {
          label: "Issue the agent passport",
          run: () =>
            api.issuePassport(createdAgentId, {
              purpose: purpose.trim(),
              permitted_task_categories: categories,
              max_borrowing_authority_minor: borrowingMinor,
              max_transaction_value_minor: perTransactionMinor,
              approved_vendor_ids: vendorIds,
              ttl_hours: ttl,
            }),
        },
        {
          label: "Re-verify the passport (issuer, audience, window, revocation, scope, replay)",
          run: async () => {
            const result = await api.verifyPassport(createdAgentId);
            setVerification(result);
            // A passport that fails its own checks is a failed registration,
            // not a warning to scroll past.
            if (!result.valid)
              throw new Error(
                `The passport did not verify: ${result.reason_codes.map(humanise).join(", ")}`,
              );
            return result;
          },
        },
      ],
      setSteps,
    );

    setBusy(false);
    if (outcome.ok) {
      setAgentId(createdAgentId);
      invalidateWorkspace();
      onRegistered?.(createdAgentId);
    }
  }, [
    ready,
    borrowingMinor,
    perTransactionMinor,
    name,
    provider,
    modelName,
    versionHash,
    purpose,
    categories,
    vendorIds,
    ttl,
    invalidateWorkspace,
    onRegistered,
  ]);

  const done = agentId !== null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      width="lg"
      title="Register an AI agent"
      subtitle={
        me.data === undefined
          ? "Loading workspace…"
          : `Into ${me.data.name} · ${me.data.organization_id}`
      }
      footer={
        done ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button variant="primary" onClick={() => void submit()} disabled={!ready || busy}>
              {busy ? "Registering…" : "Register agent"}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-5">
        <p className="text-xs leading-relaxed text-muted">
          Registering creates the agent, issues its passport and then re-runs the six passport
          checks against what was stored. Sandbox workspace: test credits only.
        </p>

        {/* ------------------------------------------------------ identity -- */}
        <fieldset disabled={busy || done} className="space-y-4">
          <Field
            label="Organization"
            hint="Agents are created inside the workspace you are signed into. There is one tenant per workspace, so this is not a choice."
          >
            <Input
              value={me.data?.name ?? ""}
              readOnly
              aria-readonly
              className="bg-surface-muted text-muted"
            />
          </Field>

          <Field label="Agent name" hint={problems.name} htmlFor="agent-name">
            <Input
              id="agent-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="CatalogAgent-02"
              aria-invalid={problems.name !== undefined}
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Agent type"
              hint="Recorded as the agent's model provider — the field the profile page shows."
              htmlFor="agent-provider"
            >
              <Select
                id="agent-provider"
                value={provider}
                onChange={(event) => setProvider(event.target.value)}
              >
                {MODEL_PROVIDERS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Model" hint={problems.modelName} htmlFor="agent-model">
              <Input
                id="agent-model"
                value={modelName}
                onChange={(event) => setModelName(event.target.value)}
                placeholder="qwen3:1.7b"
                aria-invalid={problems.modelName !== undefined}
              />
            </Field>
          </div>

          <Field
            label="Pinned model version"
            hint={
              problems.versionHash ??
              "Doubles as the agent's external identifier: it is the string that ties this agent to a specific build, and it is what the passport is issued against."
            }
            htmlFor="agent-version"
          >
            <Input
              id="agent-version"
              value={versionHash}
              onChange={(event) => setVersionHash(event.target.value)}
              placeholder="sha256:…"
              className="font-mono"
              aria-invalid={problems.versionHash !== undefined}
            />
          </Field>

          <Field
            label="Owner"
            hint="The passport is issued to the signed-in owner. Credit is never extended to an agent without one."
          >
            <Input
              value={me.data?.user.email ?? ""}
              readOnly
              aria-readonly
              className="bg-surface-muted text-muted"
            />
          </Field>

          {/* --------------------------------------------------- passport -- */}
          <hr className="border-line-soft" />

          <Field label="Purpose" hint={problems.purpose} htmlFor="agent-purpose">
            <Input
              id="agent-purpose"
              value={purpose}
              onChange={(event) => setPurpose(event.target.value)}
              placeholder="catalogue enrichment for e-commerce task orders"
              aria-invalid={problems.purpose !== undefined}
            />
          </Field>

          <Field
            label="Permitted task categories"
            hint={
              problems.categories ??
              "A task outside these categories fails the passport scope check at underwriting."
            }
          >
            <ChoiceChips
              options={TASK_CATEGORIES.map((c) => ({ value: c.value, label: c.label }))}
              selected={categories}
              onToggle={(value) =>
                setCategories((current) =>
                  current.includes(value)
                    ? current.filter((v) => v !== value)
                    : [...current, value],
                )
              }
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Maximum task-credit limit (₹)"
              hint={problems.borrowingLimit ?? "The most this agent may borrow at once."}
              htmlFor="agent-borrowing"
            >
              <Input
                id="agent-borrowing"
                inputMode="decimal"
                value={borrowingLimit}
                onChange={(event) => setBorrowingLimit(event.target.value)}
                aria-invalid={problems.borrowingLimit !== undefined}
              />
            </Field>
            <Field
              label="Maximum single payment (₹)"
              hint={problems.perTransaction ?? "Ceiling on any one vendor payment."}
              htmlFor="agent-per-transaction"
            >
              <Input
                id="agent-per-transaction"
                inputMode="decimal"
                value={perTransaction}
                onChange={(event) => setPerTransaction(event.target.value)}
                aria-invalid={problems.perTransaction !== undefined}
              />
            </Field>
          </div>

          <Field
            label="Authorization window (hours)"
            hint={
              problems.ttlHours ??
              "Starts when the passport is issued. The server stamps the expiry; after it, the validity-window check fails closed until a new passport is issued."
            }
            htmlFor="agent-ttl"
          >
            <Input
              id="agent-ttl"
              inputMode="numeric"
              value={ttlHours}
              onChange={(event) => setTtlHours(event.target.value)}
              aria-invalid={problems.ttlHours !== undefined}
            />
          </Field>

          <Field
            label="Approved vendors"
            hint="Grouped by category. A payment to anyone not selected here is blocked by the vault, not merely flagged."
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
        </fieldset>

        {/* ------------------------------------------------------ progress -- */}
        {steps.length > 0 && (
          <div className="rounded-lg border border-line bg-surface-sunken p-4">
            <StepList steps={steps} />
          </div>
        )}

        {verification !== null && <PassportResult verification={verification} />}

        {done && borrowingMinor !== null && (
          <p className="text-xs leading-relaxed text-muted">
            {name.trim()} can now borrow up to {money(borrowingMinor)} against work in{" "}
            {categories.join(", ")}. Create a credit application to put that to use.
          </p>
        )}
      </div>
    </Sheet>
  );
}

function PassportResult({ verification }: { verification: PassportVerification }) {
  return (
    <div
      className={`rounded-lg border p-4 ${
        verification.valid ? "border-positive/30 bg-positive-wash" : "border-critical/30 bg-critical-wash"
      }`}
    >
      <p className="flex items-center gap-2 text-sm font-medium text-ink">
        {verification.valid ? (
          <ShieldCheck className="size-4 text-positive" />
        ) : (
          <ShieldX className="size-4 text-critical" />
        )}
        {verification.valid ? "Passport verified" : "Passport failed verification"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-body">
        Signature and trusted issuer, audience, validity window, revocation, permitted scope and
        replay nonce — all six re-checked against the stored passport just now.
      </p>
      {verification.reason_codes.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {verification.reason_codes.map((code) => (
            <Badge key={code} tone="critical" size="sm">
              {code}
            </Badge>
          ))}
        </div>
      )}
      <Mono className="mt-2 block text-faint">{verification.agent_id}</Mono>
    </div>
  );
}

/** Multi-select as chips. A native multiple-select is unusable on touch and
 *  invisible on desktop; these are buttons with an aria-pressed state. */
export function ChoiceChips({
  options,
  selected,
  onToggle,
}: {
  options: { value: string; label: string }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((option) => {
        const on = selected.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option.value)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
              on
                ? "border-ink bg-ink text-white"
                : "border-line bg-surface text-muted hover:border-faint hover:text-ink"
            }`}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

export function VendorPicker({
  vendors,
  selected,
  onToggle,
}: {
  vendors: Vendor[];
  selected: string[];
  onToggle: (vendorId: string) => void;
}) {
  const byCategory = React.useMemo(() => {
    const groups = new Map<string, Vendor[]>();
    for (const vendor of vendors) {
      const list = groups.get(vendor.category) ?? [];
      list.push(vendor);
      groups.set(vendor.category, list);
    }
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [vendors]);

  if (vendors.length === 0)
    return (
      <p className="text-xs text-muted">
        No vendors on the platform allowlist yet. An application can still be submitted; it will
        simply name no vendors.
      </p>
    );

  return (
    <div className="space-y-2.5">
      {byCategory.map(([category, list]) => (
        <div key={category}>
          <p className="mb-1 text-[0.6875rem] font-medium uppercase tracking-wide text-faint">
            {humanise(category)}
          </p>
          <ChoiceChips
            options={list.map((v) => ({ value: v.vendor_id, label: v.name }))}
            selected={selected}
            onToggle={onToggle}
          />
        </div>
      ))}
    </div>
  );
}

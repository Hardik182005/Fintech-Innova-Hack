import {
  Activity,
  ArrowLeftRight,
  Bot,
  Check,
  FileText,
  Gauge,
  LayoutDashboard,
  ScrollText,
  Scale,
  ShieldAlert,
  Vault,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/logo";

/**
 * A still of the control centre, drawn rather than screenshotted so it stays in
 * sync with the design system.
 *
 * It shows the shape of one credit decision — the advisory opinion, the
 * deterministic outcome, the policy verdict — and two spend attempts, one of
 * which is refused. The figures are illustrative sandbox records, marked as
 * such in the header, and no aggregate, rate or performance number appears
 * anywhere in it.
 */

function NavItem({
  icon: Icon,
  label,
  active = false,
}: {
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[0.82rem] ${
        active
          ? "bg-white font-medium text-ink shadow-sm ring-1 ring-black/5"
          : "text-neutral-500"
      }`}
    >
      <Icon
        className={`h-4 w-4 ${active ? "text-accent-strong" : "text-neutral-400"}`}
      />
      {label}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-4 text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-400">
      {children}
    </div>
  );
}

function Stage({
  kicker,
  title,
  detail,
  tone,
}: {
  kicker: string;
  title: string;
  detail: string;
  tone: "advisory" | "decision" | "policy";
}) {
  const styles = {
    advisory: "border-neutral-200 bg-white",
    decision: "border-accent-soft bg-accent-soft/50",
    policy: "border-emerald-100 bg-emerald-50/70",
  } as const;
  return (
    <div className={`rounded-2xl border p-4 ${styles[tone]}`}>
      <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-neutral-400">
        {kicker}
      </div>
      <div className="mt-1.5 text-sm font-medium text-ink">{title}</div>
      <div className="mt-1 font-mono text-[11px] text-neutral-500">{detail}</div>
    </div>
  );
}

function SpendRow({
  vendor,
  amount,
  allowed,
  code,
}: {
  vendor: string;
  amount: string;
  allowed: boolean;
  code: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-neutral-200/80 bg-white p-2.5 pr-4">
      <span
        className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white ${
          allowed ? "bg-emerald-600" : "bg-rose-500"
        }`}
      >
        {allowed ? <Check className="h-4 w-4" /> : <X className="h-4 w-4" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-ink">{vendor}</div>
        <div className="truncate font-mono text-[11px] text-neutral-500">
          {code}
        </div>
      </div>
      <span
        className={`shrink-0 font-mono text-xs tnum ${
          allowed ? "text-neutral-600" : "text-neutral-400 line-through"
        }`}
      >
        {amount}
      </span>
    </div>
  );
}

export function DashboardMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-black/10 bg-white shadow-[0_40px_100px_-35px_rgba(20,20,55,0.45)] ring-1 ring-black/5">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-neutral-100 bg-neutral-50/80 px-4 py-2.5">
        <span className="h-3 w-3 rounded-full bg-[#ff5f57]" />
        <span className="h-3 w-3 rounded-full bg-[#febc2e]" />
        <span className="h-3 w-3 rounded-full bg-[#28c840]" />
        <div className="ml-3 hidden items-center gap-2 rounded-md bg-white px-3 py-1 font-mono text-xs text-neutral-400 ring-1 ring-neutral-200 sm:flex">
          /credit-applications
        </div>
      </div>

      <div className="flex min-h-[420px] text-left">
        {/* sidebar */}
        <aside className="hidden w-52 shrink-0 flex-col border-r border-neutral-100 bg-neutral-50/60 p-3 md:flex">
          <div className="flex items-center gap-2 px-1.5 py-1.5">
            <LogoMark className="h-6 w-6" />
            <span className="text-sm font-semibold tracking-tight text-ink">
              CredenceAI
            </span>
          </div>

          <div className="mt-3 space-y-0.5">
            <NavItem icon={LayoutDashboard} label="Overview" />
          </div>

          <GroupLabel>Operations</GroupLabel>
          <div className="space-y-0.5">
            <NavItem icon={Bot} label="AI Agents" />
            <NavItem icon={FileText} label="Credit Applications" active />
            <NavItem icon={Scale} label="Underwriting" />
            <NavItem icon={Vault} label="Credit Vaults" />
            <NavItem icon={ArrowLeftRight} label="Transactions" />
            <NavItem icon={ScrollText} label="Repayments" />
          </div>

          <GroupLabel>Risk &amp; Compliance</GroupLabel>
          <div className="space-y-0.5">
            <NavItem icon={ShieldAlert} label="Risk Monitoring" />
            <NavItem icon={Activity} label="Audit Trail" />
            <NavItem icon={Gauge} label="System Intelligence" />
          </div>
        </aside>

        {/* main */}
        <main className="flex-1 p-5 sm:p-7">
          {/* top bar */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-display text-xl font-medium tracking-tight text-ink">
                Credit application
              </h3>
              <p className="font-mono text-xs text-neutral-500">
                app_7f2c · task_9d41 · agent verified
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-800 sm:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              Sandbox · test credits
            </span>
          </div>

          {/* the decision, in three parts */}
          <div className="mt-6 grid gap-3 sm:grid-cols-3">
            <Stage
              tone="advisory"
              kicker="AI · advisory"
              title="Stance: supportive"
              detail="cites 3 evidence items · no amounts"
            />
            <Stage
              tone="decision"
              kicker="Scorecard · authoritative"
              title="Approve — ₹2,500.00"
              detail="deterministic · receipt 0x9c4e…"
            />
            <Stage
              tone="policy"
              kicker="OPA · enforcing"
              title="Vault opened"
              detail="2 vendors · 48h window"
            />
          </div>

          {/* spend attempts */}
          <div className="mt-7 border-t border-neutral-100 pt-7">
            <div className="grid gap-6 lg:grid-cols-2 lg:items-center">
              <div>
                <h4 className="font-display text-2xl font-medium tracking-tight text-ink">
                  Then the vault holds the line
                </h4>
                <p className="mt-2 text-sm leading-relaxed text-neutral-500">
                  Each spend is authorized before it can settle. A counterparty
                  that was never approved does not become approved because the
                  agent asked twice.
                </p>
              </div>
              <div className="space-y-2.5">
                <SpendRow
                  vendor="Compute provider"
                  amount="₹1,840.00"
                  allowed
                  code="SETTLED · on allow-list"
                />
                <SpendRow
                  vendor="Unlisted counterparty"
                  amount="₹900.00"
                  allowed={false}
                  code="BLOCKED · VENDOR_NOT_ALLOWED"
                />
                <SpendRow
                  vendor="Compute provider"
                  amount="₹6,000.00"
                  allowed={false}
                  code="BLOCKED · TRANSACTION_LIMIT_EXCEEDED"
                />
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

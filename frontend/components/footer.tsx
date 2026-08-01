import Link from "next/link";
import { Logo } from "@/components/logo";

/**
 * Every entry below resolves: either to a section that exists on this page or
 * to a route that exists in this app. There are no social accounts, no company
 * pages and no legal pages, so none are linked — a link to nowhere is a dead
 * control dressed up as a live one.
 */

type Column = {
  heading: string;
  links: { label: string; href: string }[];
};

/** Anchors into this page. */
const ON_PAGE: Column = {
  heading: "On this page",
  links: [
    { label: "How it works", href: "#primitives" },
    { label: "The governing rule", href: "#governing-rule" },
    { label: "The API", href: "#api" },
    { label: "Architecture", href: "#architecture" },
    { label: "Safety posture", href: "#safety" },
  ],
};

/** Routes in the product. */
const ROUTES: Column[] = [
  {
    heading: "Operations",
    links: [
      { label: "Overview", href: "/dashboard" },
      { label: "AI Agents", href: "/agents" },
      { label: "Credit Applications", href: "/credit-applications" },
      { label: "Underwriting", href: "/underwriting" },
      { label: "Credit Vaults", href: "/vaults" },
    ],
  },
  {
    heading: "Money movement",
    links: [
      { label: "Transactions", href: "/transactions" },
      { label: "Repayments", href: "/repayments" },
      { label: "Settings", href: "/settings" },
    ],
  },
  {
    heading: "Assurance",
    links: [
      { label: "Risk Monitoring", href: "/risk" },
      { label: "Audit Trail", href: "/audit" },
      { label: "System Intelligence", href: "/system-intelligence" },
      { label: "Judge Demo", href: "/judge-demo" },
      { label: "Developer console", href: "/developer/console" },
    ],
  },
];

const linkClass =
  "text-sm text-white/55 transition-colors hover:text-white";

export function Footer() {
  return (
    <footer className="bg-ink text-white">
      <div className="mx-auto w-full max-w-7xl px-6 py-16 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.4fr_repeat(4,1fr)]">
          <div className="max-w-xs">
            <Logo tone="dark" />
            <p className="mt-4 text-sm leading-relaxed text-white/55">
              Task-backed credit infrastructure for autonomous agents. The AI
              recommends; deterministic systems decide; financial controls
              enforce.
            </p>
            <p className="mt-4 text-sm leading-relaxed text-white/40">
              Sandbox environment. Test credits only.
            </p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-white">
              {ON_PAGE.heading}
            </h3>
            <ul className="mt-4 space-y-3">
              {ON_PAGE.links.map((link) => (
                <li key={link.href}>
                  <a href={link.href} className={linkClass}>
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          {ROUTES.map((col) => (
            <div key={col.heading}>
              <h3 className="text-sm font-semibold text-white">
                {col.heading}
              </h3>
              <ul className="mt-4 space-y-3">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={link.href} className={linkClass}>
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/10 pt-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-white/50">
            © {new Date().getFullYear()} CredenceAI. A hackathon project.
          </p>
          <p className="text-sm text-white/50">
            Not a licensed lender. No real money moves.
          </p>
        </div>
      </div>
    </footer>
  );
}

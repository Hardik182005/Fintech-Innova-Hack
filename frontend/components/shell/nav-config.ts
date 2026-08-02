import {
  Activity,
  ArrowLeftRight,
  Bot,
  FileText,
  Gauge,
  LayoutDashboard,
  PlayCircle,
  Scale,
  ScrollText,
  Settings,
  ShieldAlert,
  Sparkles,
  Vault,
  type LucideIcon,
} from "lucide-react";

/**
 * The product's information architecture, in one place.
 *
 * The grouping follows how the work actually runs: an operator moves down
 * Operations in order — an agent applies, the application is underwritten, a
 * vault is opened, it spends, it repays. Risk & Compliance is where you go to
 * check the system rather than to run it. Demonstration is kept apart so the
 * judge scenarios are never mistaken for live activity.
 */

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  /** One line shown in the collapsed rail's tooltip and on the mobile drawer. */
  summary: string;
  /** Detail routes that should still light this item up in the sidebar. */
  match?: string[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Operations",
    items: [
      {
        href: "/start",
        label: "Start here",
        icon: Sparkles,
        summary: "Register an agent and request credit, step by step",
      },
      {
        href: "/dashboard",
        label: "Overview",
        icon: LayoutDashboard,
        summary: "Portfolio exposure, live vaults and recent decisions",
      },
      {
        href: "/agents",
        label: "AI Agents",
        icon: Bot,
        summary: "Registered agents, passports and trust scores",
      },
      {
        href: "/credit-applications",
        label: "Credit Applications",
        icon: FileText,
        summary: "Requests for task-backed working capital",
      },
      {
        href: "/underwriting",
        label: "Underwriting",
        icon: Scale,
        summary: "Decision comparison and the human review queue",
      },
      {
        href: "/vaults",
        label: "Credit Vaults",
        icon: Vault,
        summary: "Restricted spending facilities and their controls",
      },
      {
        href: "/transactions",
        label: "Transactions",
        icon: ArrowLeftRight,
        summary: "Every spend attempt, allowed or blocked",
      },
      {
        href: "/repayments",
        label: "Repayments",
        icon: ScrollText,
        summary: "Revenue collection and the repayment waterfall",
      },
    ],
  },
  {
    label: "Risk & Compliance",
    items: [
      {
        href: "/risk",
        label: "Risk Monitoring",
        icon: ShieldAlert,
        summary: "Control breaches, freezes and exposure concentration",
      },
      {
        href: "/audit",
        label: "Audit Trail",
        icon: Activity,
        summary: "Tamper-evident hash chain of every financial event",
      },
      {
        href: "/system-intelligence",
        label: "System Intelligence",
        icon: Gauge,
        summary: "Live pipeline health, model assurance and policy enforcement",
      },
    ],
  },
  {
    label: "Demonstration",
    items: [
      {
        href: "/judge-demo",
        label: "Judge Demo",
        icon: PlayCircle,
        summary: "Run the six evaluation scenarios end to end",
      },
    ],
  },
  {
    label: "Administration",
    items: [
      {
        href: "/settings",
        label: "Settings",
        icon: Settings,
        summary: "Policy parameters, vendors and workspace",
      },
    ],
  },
];

/** Flattened, for breadcrumb and document-title lookups. */
export const NAV_ITEMS: NavItem[] = NAV.flatMap((group) => group.items);

/**
 * Which nav item owns a pathname. Longest prefix wins so `/vaults/vlt_123`
 * highlights Credit Vaults rather than matching nothing.
 */
export function activeHref(pathname: string): string | null {
  let best: string | null = null;
  for (const item of NAV_ITEMS) {
    const candidates = [item.href, ...(item.match ?? [])];
    for (const candidate of candidates) {
      if (pathname === candidate || pathname.startsWith(`${candidate}/`)) {
        if (best === null || candidate.length > best.length) best = item.href;
      }
    }
  }
  return best;
}

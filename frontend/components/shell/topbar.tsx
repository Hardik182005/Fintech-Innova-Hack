"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, ChevronRight, Menu } from "lucide-react";

import { Unavailable } from "@/components/data/states";
import { NAV_ITEMS, activeHref } from "@/components/shell/nav-config";
import { Badge } from "@/components/ui/badge";
import { Tooltip } from "@/components/ui/tooltip";
import { useMe } from "@/lib/queries";
import { shortId } from "@/lib/format";

/**
 * The bar above the workspace. It answers three questions and no others: where
 * am I, whose data am I looking at, and is this real money.
 *
 * The environment badge is not decoration. Every figure on every screen behind
 * it is a test credit, and a reader who forgets that would misread the whole
 * product.
 */

function useCrumbs(pathname: string): { label: string; href?: string }[] {
  return React.useMemo(() => {
    const owner = activeHref(pathname);
    const item = NAV_ITEMS.find((entry) => entry.href === owner);
    if (item === undefined) {
      if (pathname.startsWith("/developer")) return [{ label: "Developer Lab" }];
      return [{ label: "CredenceAI" }];
    }
    // A detail route adds its record id: /vaults/vlt_abc123 -> Credit Vaults / vlt_abc…
    const rest = pathname.slice(item.href.length).replace(/^\//, "");
    if (rest === "") return [{ label: item.label }];
    const [recordId] = rest.split("/");
    return [
      { label: item.label, href: item.href },
      { label: shortId(decodeURIComponent(recordId), 12, 4) },
    ];
  }, [pathname]);
}

function WorkspaceChip() {
  const { data, isPending, isError } = useMe();

  if (isPending) {
    return <span className="h-4 w-28 animate-pulse rounded bg-surface-sunken" aria-hidden />;
  }
  if (isError || data === undefined) {
    return <Unavailable detail="The workspace could not be identified right now." />;
  }

  return (
    <Tooltip
      side="bottom"
      content={
        <span>
          {data.name} · {data.user.role.toLowerCase()} · {data.user.email}
        </span>
      }
    >
      <span className="flex items-center gap-1.5 text-xs text-muted">
        <Building2 className="size-3.5 shrink-0" />
        <span className="max-w-40 truncate">{data.name}</span>
      </span>
    </Tooltip>
  );
}

function Topbar({ onOpenNav }: { onOpenNav: () => void }) {
  const pathname = usePathname();
  const crumbs = useCrumbs(pathname);

  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur lg:px-6">
      <button
        type="button"
        onClick={onOpenNav}
        aria-label="Open navigation"
        className="-ml-1 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-ink lg:hidden"
      >
        <Menu className="size-4" />
      </button>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-sm">
        {crumbs.map((crumb, index) => (
          <React.Fragment key={`${crumb.label}-${index}`}>
            {index > 0 && <ChevronRight className="size-3.5 shrink-0 text-faint" aria-hidden />}
            {crumb.href === undefined ? (
              <span className="truncate font-medium text-ink">{crumb.label}</span>
            ) : (
              <Link href={crumb.href} className="truncate text-muted transition-colors hover:text-ink">
                {crumb.label}
              </Link>
            )}
          </React.Fragment>
        ))}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-3">
        <WorkspaceChip />
        <Tooltip
          side="bottom"
          content="Every amount in this product is a test credit issued in a sandbox. No real funds move, and nothing here is a regulated financial service."
        >
          <Badge tone="caution" className="cursor-help">
            Sandbox — Test Credits
          </Badge>
        </Tooltip>
      </div>
    </header>
  );
}

export { Topbar };

"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, PanelLeftOpen, Terminal, X } from "lucide-react";

import { LogoMark } from "@/components/logo";
import { NAV, activeHref } from "@/components/shell/nav-config";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";

/**
 * The navigation rail: always present, near-black, and the only chrome on the
 * screen. Everything to its right is the workspace.
 *
 * Collapsing keeps the icons and drops the words, which is the state an
 * operator watching a live pipeline wants — more room for figures, and the rail
 * still says where they are. The choice persists per browser because it is a
 * preference about screen space, not about the data.
 */

const STORAGE_KEY = "credence.sidebar.collapsed";

// The preference lives in localStorage, so it is treated as the external store
// it is: useSyncExternalStore reads it, the server snapshot is "expanded", and
// React reconciles once after hydration. A storage event from another tab
// updates this one too.
const collapseListeners = new Set<() => void>();

function readCollapsed(): boolean {
  return window.localStorage.getItem(STORAGE_KEY) === "true";
}

function subscribeCollapsed(callback: () => void): () => void {
  collapseListeners.add(callback);
  window.addEventListener("storage", callback);
  return () => {
    collapseListeners.delete(callback);
    window.removeEventListener("storage", callback);
  };
}

function useCollapsed(): [boolean, () => void] {
  const collapsed = React.useSyncExternalStore(subscribeCollapsed, readCollapsed, () => false);
  const toggle = React.useCallback(() => {
    window.localStorage.setItem(STORAGE_KEY, String(!readCollapsed()));
    for (const listener of collapseListeners) listener();
  }, []);
  return [collapsed, toggle];
}

function NavLinks({
  collapsed,
  pathname,
  onNavigate,
}: {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const active = activeHref(pathname);

  return (
    <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4" aria-label="Main">
      {NAV.map((group) => (
        <div key={group.label}>
          {collapsed ? (
            <div className="mx-2 mb-2 h-px bg-nav-border" aria-hidden />
          ) : (
            <p className="mb-1.5 px-2 text-[0.625rem] font-semibold tracking-[0.08em] text-nav-text/60 uppercase">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const isActive = active === item.href;
              const link = (
                <Link
                  href={item.href}
                  onClick={onNavigate}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2 py-2 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    isActive
                      ? "bg-nav-raised text-nav-text-strong"
                      : "text-nav-text hover:bg-nav-raised/60 hover:text-nav-text-strong",
                  )}
                >
                  <item.icon className="size-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                </Link>
              );

              return (
                <li key={item.href}>
                  {collapsed ? (
                    <Tooltip side="right" content={<span>{item.label}</span>} className="w-full">
                      {link}
                    </Tooltip>
                  ) : (
                    link
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function RailFooter({ collapsed, pathname }: { collapsed: boolean; pathname: string }) {
  const isActive = pathname.startsWith("/developer");
  return (
    <div className="border-t border-nav-border px-3 py-3">
      <Link
        href="/developer/console"
        className={cn(
          "flex items-center gap-2.5 rounded-lg px-2 py-2 text-xs transition-colors",
          collapsed && "justify-center px-0",
          isActive
            ? "bg-nav-raised text-nav-text-strong"
            : "text-nav-text/70 hover:bg-nav-raised/60 hover:text-nav-text",
        )}
        title="Developer Lab"
      >
        <Terminal className="size-4 shrink-0" />
        {!collapsed && <span className="truncate">Developer Lab</span>}
      </Link>
      {!collapsed && (
        <p className="mt-2 px-2 text-[0.625rem] leading-relaxed text-nav-text/50">
          Sandbox environment. Test credits only — no real money moves.
        </p>
      )}
    </div>
  );
}

/** Desktop rail. Hidden below `lg`, where `MobileNav` takes over. */
function Sidebar() {
  const pathname = usePathname();
  const [collapsed, toggle] = useCollapsed();

  return (
    <aside
      data-collapsed={collapsed}
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-nav-border bg-nav transition-[width] duration-200 lg:flex",
        collapsed ? "w-[68px]" : "w-60",
      )}
    >
      <div
        className={cn(
          "flex h-14 items-center gap-2.5 border-b border-nav-border px-4",
          collapsed && "justify-center px-0",
        )}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 overflow-hidden">
          <LogoMark className="size-7 shrink-0" />
          {!collapsed && (
            <span className="truncate text-[0.9375rem] font-semibold tracking-tight text-nav-text-strong">
              CredenceAI
            </span>
          )}
        </Link>
      </div>

      <NavLinks collapsed={collapsed} pathname={pathname} />
      <RailFooter collapsed={collapsed} pathname={pathname} />

      <button
        type="button"
        onClick={toggle}
        aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
        aria-expanded={!collapsed}
        className={cn(
          "flex items-center gap-2.5 border-t border-nav-border px-5 py-2.5 text-xs text-nav-text/70 transition-colors hover:bg-nav-raised/60 hover:text-nav-text",
          collapsed && "justify-center px-0",
        )}
      >
        {collapsed ? (
          <PanelLeftOpen className="size-4" />
        ) : (
          <>
            <PanelLeftClose className="size-4" />
            <span>Collapse</span>
          </>
        )}
      </button>
    </aside>
  );
}

/** The same navigation as a drawer, for viewports narrower than `lg`. */
function MobileNav({ open, onClose }: { open: boolean; onClose: () => void }) {
  const pathname = usePathname();

  React.useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      <button
        type="button"
        aria-label="Close navigation"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/40"
      />
      <div className="relative flex h-full w-64 flex-col bg-nav" role="dialog" aria-label="Navigation">
        <div className="flex h-14 items-center justify-between border-b border-nav-border px-4">
          <Link href="/dashboard" onClick={onClose} className="flex items-center gap-2.5">
            <LogoMark className="size-7" />
            <span className="text-[0.9375rem] font-semibold tracking-tight text-nav-text-strong">
              CredenceAI
            </span>
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-nav-text hover:bg-nav-raised hover:text-nav-text-strong"
          >
            <X className="size-4" />
          </button>
        </div>
        <NavLinks collapsed={false} pathname={pathname} onNavigate={onClose} />
        <RailFooter collapsed={false} pathname={pathname} />
      </div>
    </div>
  );
}

export { MobileNav, Sidebar };

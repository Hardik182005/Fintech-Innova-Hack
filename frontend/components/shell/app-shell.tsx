"use client";

import * as React from "react";

import { MobileNav, Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";

/**
 * The frame every product screen sits in: rail on the left, bar across the top,
 * one scrolling workspace. Only the mobile drawer's open state lives here, so
 * the shell re-renders for that and nothing else.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const [navOpen, setNavOpen] = React.useState(false);
  const closeNav = React.useCallback(() => setNavOpen(false), []);

  return (
    <div className="flex min-h-dvh bg-surface-muted">
      <Sidebar />
      <MobileNav open={navOpen} onClose={closeNav} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenNav={() => setNavOpen(true)} />
        <main className="min-w-0 flex-1 px-4 py-6 lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-[86rem]">{children}</div>
        </main>
      </div>
    </div>
  );
}

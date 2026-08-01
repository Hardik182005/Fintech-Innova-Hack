"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, X, ArrowRight } from "lucide-react";
import { Logo } from "@/components/logo";
import { Button } from "@/components/primitives";

/**
 * Client component only because the mobile menu holds open/closed state and
 * locks body scroll while it is open.
 *
 * Each nav item is an anchor to a section that exists on this page. The one
 * button goes to a route that exists. Nothing here points at a sales form or an
 * API-key flow, because neither exists.
 */
const NAV = [
  { label: "How it works", href: "#primitives" },
  { label: "Governing rule", href: "#governing-rule" },
  { label: "API", href: "#api" },
  { label: "Architecture", href: "#architecture" },
];

export function Navbar() {
  const [open, setOpen] = useState(false);

  // Lock body scroll when the mobile menu is open
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <header className="fixed inset-x-0 top-0 z-50">
      <div className="mx-auto w-full max-w-6xl px-4 pt-3 sm:pt-4">
        <nav className="relative flex h-14 items-center justify-between rounded-full border border-black/5 bg-white/85 pl-5 pr-2.5 shadow-[0_8px_30px_rgba(15,15,30,0.10)] backdrop-blur-md">
          <Link
            href="#top"
            aria-label="CredenceAI home"
            className="rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Logo />
          </Link>

          <ul className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-7 lg:flex">
            {NAV.map((item) => (
              <li key={item.href}>
                <a
                  href={item.href}
                  className="text-[0.78rem] font-medium uppercase tracking-wider text-neutral-600 transition-colors hover:text-ink"
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>

          <div className="hidden items-center gap-1 md:flex">
            <Link
              href="/judge-demo"
              className="rounded-full px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:text-ink"
            >
              Demo scenarios
            </Link>
            <Button href="/dashboard" size="sm">
              Open the control centre
            </Button>
          </div>

          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-10 w-10 items-center justify-center rounded-full text-ink transition-colors hover:bg-neutral-100 md:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>

        {/* Mobile menu */}
        {open ? (
          <div className="mt-2 overflow-hidden rounded-3xl border border-black/5 bg-white p-3 shadow-xl md:hidden">
            {NAV.map((item) => (
              <a
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="block rounded-2xl px-4 py-3 text-base font-medium text-neutral-700 transition-colors hover:bg-neutral-100 hover:text-ink"
              >
                {item.label}
              </a>
            ))}
            <div className="mt-2 flex flex-col gap-2 p-1">
              <Button href="/judge-demo" variant="secondary" className="w-full">
                Demo scenarios
              </Button>
              <Button href="/dashboard" className="w-full">
                Open the control centre
                <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        ) : null}
      </div>
    </header>
  );
}

"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Right-side detail drawer. Detail lives here rather than on a new route so a
 * reviewer never loses the list they were working through — they open a vault,
 * read its controls, and close back onto the same scroll position.
 *
 * Written against the DOM rather than pulled from Radix: the project carries no
 * Radix dependency, and the behaviour a drawer actually owes a keyboard user is
 * small and worth having in plain sight — escape closes, focus enters on open
 * and returns to the trigger on close, tab stays inside, the page behind does
 * not scroll.
 */

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

// Client detection without an effect: the server snapshot is false, the client
// snapshot is true, and React re-renders once after hydration. There is nothing
// to subscribe to — the value never changes again.
const noSubscription = () => () => {};
const useMounted = () => React.useSyncExternalStore(noSubscription, () => true, () => false);

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Sub-line under the title: an id, a status, a timestamp. */
  subtitle?: React.ReactNode;
  footer?: React.ReactNode;
  width?: "md" | "lg" | "xl";
  children: React.ReactNode;
}

const WIDTHS = {
  md: "max-w-md",
  lg: "max-w-xl",
  xl: "max-w-3xl",
} as const;

function Sheet({ open, onClose, title, subtitle, footer, width = "lg", children }: SheetProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  const restoreTo = React.useRef<HTMLElement | null>(null);
  const mounted = useMounted();

  React.useEffect(() => {
    if (!open) return;

    restoreTo.current = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    // Focus the panel itself rather than its first control, so a screen reader
    // announces the drawer's heading before its actions.
    panelRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const panel = panelRef.current;
      if (panel === null) return;
      const targets = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null,
      );
      if (targets.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }
      const first = targets[0];
      const last = targets[targets.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      document.body.style.overflow = overflow;
      restoreTo.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end" data-slot="sheet">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-[1px]"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex h-full w-full flex-col border-l border-line bg-surface shadow-xl outline-none",
          WIDTHS[width],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
            {subtitle !== undefined && (
              <div className="mt-1 truncate text-xs text-muted">{subtitle}</div>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-mr-1 rounded-md p-1.5 text-muted transition-colors hover:bg-surface-muted hover:text-ink"
          >
            <X className="size-4" />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        {footer !== undefined && (
          <footer className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
            {footer}
          </footer>
        )}
      </div>
    </div>,
    document.body,
  );
}

export { Sheet };

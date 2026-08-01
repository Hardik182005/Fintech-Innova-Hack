import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Page and section furniture. Kept here so every screen in the product opens
 * the same way — title, one line of plain-language purpose, actions on the
 * right — instead of each page inventing its own header.
 */

function PageHeader({
  title,
  description,
  actions,
  className,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-ink">{title}</h1>
        {description !== undefined && (
          <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">{description}</p>
        )}
      </div>
      {actions !== undefined && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

function Section({
  id,
  title,
  description,
  actions,
  className,
  children,
}: {
  id?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn("scroll-mt-20", className)}>
      {(title !== undefined || actions !== undefined) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title !== undefined && (
              <h2 className="text-sm font-semibold tracking-tight text-ink">{title}</h2>
            )}
            {description !== undefined && (
              <p className="mt-0.5 max-w-2xl text-xs leading-relaxed text-muted">{description}</p>
            )}
          </div>
          {actions !== undefined && (
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * The sentence the product is built around. It appears wherever an AI output
 * sits next to a decision, so no reader can mistake an analyst's opinion for
 * the thing that actually granted credit.
 */
function AuthorityNote({ className }: { className?: string }) {
  // A span, not a p: this note is routinely composed inside a PageHeader
  // description, which is already a paragraph, and <p> cannot nest.
  return (
    <span className={cn("block text-xs leading-relaxed text-muted", className)}>
      The AI recommends. Deterministic systems decide. Financial controls enforce.
    </span>
  );
}

export { AuthorityNote, PageHeader, Section };

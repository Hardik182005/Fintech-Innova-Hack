import * as React from "react";

import { cn } from "@/lib/cn";

/** Form controls. Native elements, styled — a select that is a real `<select>`
 *  keeps keyboard and mobile behaviour that a div rebuild would have to earn. */

const control =
  "h-9 w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink transition-colors placeholder:text-faint hover:border-faint disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-muted";

function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input data-slot="input" className={cn(control, className)} {...props} />;
}

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(control, "h-auto min-h-20 py-2 leading-relaxed", className)}
      {...props}
    />
  );
}

function Select({ className, children, ...props }: React.ComponentProps<"select">) {
  return (
    <select data-slot="select" className={cn(control, "pr-8", className)} {...props}>
      {children}
    </select>
  );
}

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      data-slot="label"
      className={cn("mb-1.5 block text-xs font-medium text-body", className)}
      {...props}
    />
  );
}

/** Label + control + optional hint, so forms line up without ad-hoc wrappers. */
function Field({
  label,
  hint,
  htmlFor,
  className,
  children,
}: {
  label: React.ReactNode;
  hint?: React.ReactNode;
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint !== undefined && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </div>
  );
}

export { Field, Input, Label, Select, Textarea };

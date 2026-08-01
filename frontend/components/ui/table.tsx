import * as React from "react";

import { cn } from "@/lib/cn";

/**
 * Dense financial table. Two conventions run through it:
 *
 * Numeric columns are right-aligned and set in tabular figures, so a reader
 * compares magnitudes by column position rather than by counting digits.
 *
 * The horizontal scroll lives on the wrapper, never on the page body — a table
 * that widens the document pushes the whole layout sideways on a laptop.
 */

function TableWrap({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="table-wrap"
      className={cn("w-full overflow-x-auto", className)}
      {...props}
    />
  );
}

function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom border-collapse text-sm", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("bg-surface-muted", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-t border-line-soft transition-colors data-[interactive=true]:cursor-pointer data-[interactive=true]:hover:bg-surface-muted",
        className,
      )}
      {...props}
    />
  );
}

function TableHead({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "px-4 py-2.5 text-left align-middle text-[0.6875rem] font-semibold tracking-[0.04em] whitespace-nowrap text-faint uppercase",
        numeric && "text-right",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({
  className,
  numeric = false,
  ...props
}: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "px-4 py-3 align-middle text-sm text-body",
        numeric && "tnum text-right",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-3 text-left text-xs text-muted", className)}
      {...props}
    />
  );
}

export { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableWrap };

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/cn";

/**
 * Buttons in this product commit money or change the state of a credit
 * facility, so the visual weight is deliberately graded: `primary` for the one
 * action a screen is asking for, `secondary` for everything else, `danger` only
 * where a control is being revoked. There is no unstyled "does nothing" button
 * anywhere in the product — every button here is wired to an action.
 */

export const buttonStyle = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg border font-medium transition-colors disabled:pointer-events-none disabled:opacity-45 [&_svg]:shrink-0 [&_svg]:pointer-events-none",
  {
    variants: {
      variant: {
        primary: "border-ink bg-ink text-white hover:bg-ink-soft",
        secondary: "border-line bg-surface text-ink hover:bg-surface-muted",
        subtle: "border-transparent bg-surface-muted text-body hover:bg-surface-sunken hover:text-ink",
        ghost: "border-transparent bg-transparent text-muted hover:bg-surface-muted hover:text-ink",
        danger: "border-critical bg-critical text-white hover:brightness-110",
        link: "h-auto border-transparent bg-transparent p-0 text-info underline-offset-4 hover:underline",
      },
      size: {
        sm: "h-8 px-2.5 text-xs [&_svg]:size-3.5",
        md: "h-9 px-3.5 text-sm [&_svg]:size-4",
        lg: "h-10 px-4 text-sm [&_svg]:size-4",
        icon: "size-9 [&_svg]:size-4",
        "icon-sm": "size-8 [&_svg]:size-3.5",
      },
    },
    defaultVariants: { variant: "secondary", size: "md" },
  },
);

export interface ButtonProps
  extends React.ComponentProps<"button">,
    VariantProps<typeof buttonStyle> {}

function Button({ className, variant, size, type = "button", ...props }: ButtonProps) {
  return (
    <button
      data-slot="button"
      type={type}
      className={cn(buttonStyle({ variant, size }), className)}
      {...props}
    />
  );
}

export { Button };

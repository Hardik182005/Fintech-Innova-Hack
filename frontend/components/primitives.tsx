import Link from "next/link";
import type { ReactNode } from "react";

export function Container({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`mx-auto w-full max-w-7xl px-6 lg:px-8 ${className}`}>
      {children}
    </div>
  );
}

export function Eyebrow({
  children,
  tone = "light",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
}) {
  return (
    <span
      className={`text-xs font-semibold uppercase tracking-[0.2em] ${
        tone === "dark" ? "text-white/60" : "text-accent-strong"
      }`}
    >
      {children}
    </span>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
  tone = "light",
  className = "",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <div
      className={`${
        align === "center" ? "mx-auto max-w-2xl text-center" : "max-w-2xl"
      } ${className}`}
    >
      {eyebrow ? <Eyebrow tone={tone}>{eyebrow}</Eyebrow> : null}
      <h2
        className={`mt-3 font-display text-3xl font-medium tracking-tight text-balance sm:text-4xl lg:text-[2.7rem] lg:leading-[1.1] ${
          tone === "dark" ? "text-white" : "text-ink"
        }`}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={`mt-4 text-lg leading-relaxed text-pretty ${
            tone === "dark" ? "text-white/65" : "text-neutral-600"
          }`}
        >
          {description}
        </p>
      ) : null}
    </div>
  );
}

type ButtonVariant =
  | "primary"
  | "accent"
  | "secondary"
  | "ghost"
  | "white"
  | "outline-dark";

export function Button({
  href,
  children,
  variant = "primary",
  size = "md",
  className = "",
}: {
  href: string;
  children: ReactNode;
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const base =
    "group inline-flex items-center justify-center gap-2 rounded-full font-medium transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2";
  const sizes = {
    sm: "h-9 px-4 text-sm",
    md: "h-11 px-5 text-sm",
    lg: "h-12 px-6 text-[0.95rem]",
  };
  const variants: Record<ButtonVariant, string> = {
    primary: "bg-ink text-white hover:bg-ink-soft focus-visible:ring-offset-white",
    accent:
      "bg-accent text-white hover:bg-accent-strong focus-visible:ring-offset-white",
    secondary:
      "border border-neutral-200 bg-white text-ink hover:bg-neutral-50 focus-visible:ring-offset-white",
    ghost: "text-ink hover:bg-neutral-100 focus-visible:ring-offset-white",
    white: "bg-white text-ink hover:bg-neutral-200 focus-visible:ring-offset-transparent",
    "outline-dark":
      "border border-white/20 text-white hover:bg-white/10 focus-visible:ring-offset-transparent",
  };
  return (
    <Link
      href={href}
      className={`${base} ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Pill({
  children,
  tone = "light",
  className = "",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium ${
        tone === "dark"
          ? "border-white/15 bg-white/5 text-white/80"
          : "border-neutral-200 bg-white text-neutral-700"
      } ${className}`}
    >
      {children}
    </span>
  );
}

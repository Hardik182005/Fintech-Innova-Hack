import type { ReactNode } from "react";

export function LogoMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <span
      className={`relative inline-flex items-center justify-center rounded-[10px] bg-[linear-gradient(140deg,_#7c6cff_0%,_#5a47ea_100%)] shadow-sm ${className}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="h-[58%] w-[58%]"
        aria-hidden="true"
      >
        <circle cx="12" cy="5" r="2.1" fill="white" />
        <circle cx="5" cy="18" r="2.1" fill="white" />
        <circle cx="19" cy="18" r="2.1" fill="white" />
        <path
          d="M12 5 L5 18 M12 5 L19 18 M5 18 L19 18"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.9"
        />
      </svg>
    </span>
  );
}

export function Logo({
  tone = "light",
  className = "",
}: {
  tone?: "light" | "dark";
  className?: string;
}): ReactNode {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <LogoMark />
      <span
        className={`font-sans text-lg font-semibold tracking-tight ${
          tone === "dark" ? "text-white" : "text-ink"
        }`}
      >
        CredenceAI
      </span>
    </span>
  );
}

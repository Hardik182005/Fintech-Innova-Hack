import { ArrowRight } from "lucide-react";
import { Button, Container } from "@/components/primitives";
import { DashboardMock } from "@/components/dashboard-mock";

function Ornament() {
  return (
    <svg
      width="78"
      height="16"
      viewBox="0 0 78 16"
      fill="none"
      aria-hidden="true"
      className="mx-auto text-accent-strong/70"
    >
      <path
        d="M39 8c-5 0-7-5-13-5-4 0-7 2.5-9 5M39 8c5 0 7-5 13-5 4 0 7 2.5 9 5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <path
        d="M17 8c-3 0-5 1.6-7 3M61 8c3 0 5 1.6 7 3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        opacity="0.6"
      />
      <circle cx="39" cy="8" r="1.7" fill="currentColor" />
    </svg>
  );
}

export function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      {/* warm aurora background */}
      <div aria-hidden className="absolute inset-0 -z-10 hero-warm" />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 grid-faint opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent_55%)]"
      />

      <Container className="pt-28 pb-0 sm:pt-32 lg:pt-36">
        <div className="mx-auto max-w-3xl text-center">
          <div className="animate-fade-up">
            <Ornament />
          </div>
          <p className="animate-fade-up delay-1 mt-5 text-xs font-semibold uppercase tracking-[0.22em] text-accent-strong">
            Task-Backed Credit Infrastructure for Autonomous Agents
          </p>
          <h1 className="animate-fade-up delay-1 mt-5 font-display text-[2.9rem] font-medium leading-[1.05] tracking-tight text-balance text-ink sm:text-6xl lg:text-[5rem]">
            Credit rails for autonomous agents
          </h1>
          <p className="animate-fade-up delay-2 mx-auto mt-6 max-w-xl text-lg leading-relaxed text-pretty text-neutral-600">
            Verified agent passports. Restricted spending vaults. Automatic
            repayment from task revenue. The LLM advises — deterministic
            policy code controls every rupee. Sandbox: test credits only.
          </p>
          <div className="animate-fade-up delay-3 mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button href="/dashboard" size="lg">
              Launch the sandbox
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Button>
            <Button href="#primitives" variant="secondary" size="lg">
              How it works
            </Button>
          </div>
        </div>

        {/* dashboard mockup */}
        <div className="animate-fade-up delay-4 relative mx-auto mt-16 max-w-6xl">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-x-6 -top-6 bottom-12 -z-10 rounded-[2.5rem] bg-white/40 blur-2xl"
          />
          <DashboardMock />
        </div>
      </Container>
    </section>
  );
}

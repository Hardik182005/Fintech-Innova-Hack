import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Container, Eyebrow } from "@/components/primitives";

/**
 * Four numbers, and every one of them is a property of the source tree rather
 * than a measurement. There is deliberately no latency, uptime, throughput or
 * accuracy figure here: those require evidence we would have to collect, and
 * the ones we do collect are published live on System Intelligence instead.
 */
const FACTS = [
  {
    value: "16",
    label: "Instrumented pipeline stages",
    note: "Request received through audit finalization, each one timed",
  },
  {
    value: "6",
    label: "Fail-closed passport checks",
    note: "Issuer, audience, window, revocation, scope, nonce",
  },
  {
    value: "3",
    label: "Advisory model roles",
    note: "None of them can name an amount or approve anything",
  },
  {
    value: "1",
    label: "Place where money becomes a decimal",
    note: "lib/format.ts. Every other line moves an integer count of paise",
  },
];

export function Stats() {
  return (
    <section id="facts" className="relative scroll-mt-24 overflow-hidden bg-ink py-20 sm:py-24">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 grid-faint-dark [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" />
        <div className="absolute left-1/2 top-0 h-72 w-[900px] -translate-x-1/2 bg-[radial-gradient(50%_60%_at_50%_0%,rgba(109,92,246,0.25),transparent_70%)]" />
      </div>

      <Container className="relative">
        <div className="mx-auto max-w-2xl text-center">
          <Eyebrow tone="dark">Properties of the build</Eyebrow>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white text-balance sm:text-4xl">
            Facts you can check by reading the code
          </h2>
          <p className="mt-4 text-lg text-white/65">
            Not benchmarks. These hold because of how the system is written, so
            they need no measurement to be true.
          </p>
        </div>

        <dl className="mt-14 grid grid-cols-2 gap-x-8 gap-y-10 lg:grid-cols-4">
          {FACTS.map((f) => (
            <div key={f.label} className="text-center">
              <dt className="font-display text-4xl font-semibold tracking-tight text-white tnum sm:text-5xl">
                {f.value}
              </dt>
              <dd className="mt-2 text-sm font-medium text-white/80">
                {f.label}
              </dd>
              <dd className="mt-1.5 text-xs leading-relaxed text-white/45">
                {f.note}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mx-auto mt-14 max-w-2xl text-center text-sm leading-relaxed text-white/55">
          Measured numbers — stage health, model assurance, policy enforcement —
          are computed from real runs and published inside the product. Where
          there is not yet enough data, that page says so rather than showing a
          reassuring zero.
        </p>
        <div className="mt-6 flex justify-center">
          <Link
            href="/system-intelligence"
            className="group inline-flex items-center gap-1.5 text-sm font-semibold text-white hover:text-white/80"
          >
            Open System Intelligence
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </Container>
    </section>
  );
}

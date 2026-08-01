import { ArrowRight } from "lucide-react";
import { Button, Container } from "@/components/primitives";

/**
 * Two destinations, both of them real routes in this app. There is no sales
 * team to contact and no key to request, so neither is offered.
 */
export function CTA() {
  return (
    <section id="get-started" className="scroll-mt-24 bg-white pb-20 sm:pb-28">
      <Container>
        <div className="relative overflow-hidden rounded-3xl bg-ink px-6 py-16 sm:px-16 sm:py-20">
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute inset-0 grid-faint-dark [mask-image:radial-gradient(80%_80%_at_50%_0%,black,transparent)]" />
            <div className="absolute left-1/2 top-[-30%] h-80 w-[820px] -translate-x-1/2 bg-[radial-gradient(50%_60%_at_50%_50%,rgba(109,92,246,0.35),transparent_70%)]" />
          </div>

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="font-display text-3xl font-semibold tracking-tight text-balance text-white sm:text-4xl lg:text-5xl">
              Watch it refuse something
            </h2>
            <p className="mx-auto mt-5 max-w-xl text-lg text-white/65">
              The demo runs the evaluation scenarios end to end — a passport
              that fails, a spend the vault blocks, a task whose revenue repays
              itself — and shows the reason codes behind each outcome.
            </p>
            <div className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <Button href="/judge-demo" variant="white" size="lg">
                Run the demo scenarios
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Button>
              <Button href="/dashboard" variant="outline-dark" size="lg">
                Open the control centre
              </Button>
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}

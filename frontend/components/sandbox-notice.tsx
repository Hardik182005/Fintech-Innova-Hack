import { FlaskConical } from "lucide-react";
import { Container } from "@/components/primitives";

/**
 * The disclosure, in the body of the page and at readable size. Putting it in
 * small grey type at the bottom of a footer would be a way of technically
 * having said it, which is not the same thing as saying it.
 */

const POINTS = [
  {
    term: "Test credits only",
    detail:
      "Balances, limits and repayments are denominated in test credits. Nothing on this system is redeemable.",
  },
  {
    term: "No real money moves",
    detail:
      "There is no payment rail behind the vault. A settled transaction is a ledger entry, not a transfer.",
  },
  {
    term: "Not a lender",
    detail:
      "CredenceAI is not a licensed lender, not a deposit-taking institution, and holds no financial-services authorisation.",
  },
  {
    term: "Not an offer",
    detail:
      "Nothing here is an offer of credit, a solicitation, or financial advice. It is a demonstration of a control architecture.",
  },
];

export function SandboxNotice() {
  return (
    <section id="sandbox" className="scroll-mt-24 bg-white pb-20 sm:pb-24">
      <Container>
        <div className="rounded-3xl border border-amber-200 bg-amber-50/60 p-8 sm:p-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700">
              <FlaskConical className="h-5 w-5" />
            </span>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-ink">
              This is a sandbox
            </h2>
          </div>

          <p className="mt-4 max-w-3xl text-[0.95rem] leading-relaxed text-neutral-700">
            CredenceAI is a hackathon project. It is a working implementation of
            a credit-control architecture, running end to end against its own
            database — and it is not a financial product.
          </p>

          <dl className="mt-7 grid gap-x-10 gap-y-5 sm:grid-cols-2">
            {POINTS.map((p) => (
              <div key={p.term}>
                <dt className="text-sm font-semibold text-ink">{p.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-neutral-600">
                  {p.detail}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </Container>
    </section>
  );
}

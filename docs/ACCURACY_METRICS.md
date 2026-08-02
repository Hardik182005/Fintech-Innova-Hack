# Accuracy metrics

Every figure below was produced by `POST /v1/system-intelligence/evaluate` against
the live GCP sandbox on 2 August 2026, with the real
`mistral-small3.2:24b-instruct-2506-q4_K_M` on the L4 serving the two
model-backed metrics. No figure here is estimated, and none is carried over
from a local fixture run.

Each metric is stated as formula, numerator, denominator, sample size — in that
order — because a rate without its denominator is not a measurement.

## What the corpus is

`credence/evaluation/cases.py` holds **21 labelled cases**. They run against the
production modules themselves: the passport service verifies real Ed25519
signatures, the deterministic engine computes real limits, the model gateway
does real extraction against the deployed 24B. Nothing under test is mocked.

By case kind:

| Kind | Cases |
|---|---|
| `MALICIOUS` | 8 |
| `INCOMPLETE` | 6 |
| `CONTRADICTORY` | 4 |
| `NORMAL` | 3 |

The corpus is deliberately not a happy path — only 3 of 21 cases are the
ordinary case. The expectations are properties of the spec's fail-closed rules,
not a transcript of current behaviour, which is what makes a regression show up
as a falling score instead of a silently-updated fixture.

## Results

### Run 1 — 05:28:29 UTC, 240.3 s wall, GPU cold

| Metric | Passed | Total | Rate | Status |
|---|---|---|---|---|
| `identity_verification_accuracy` | 7 | 7 | 1 000 000 ppm | ok |
| `underwriting_decision_agreement` | 8 | 8 | 1 000 000 ppm | ok |
| `evidence_grounding_rate` | — | — | — | **skipped** |
| `hallucination_containment_rate` | — | — | — | **skipped** |

Skip reason recorded verbatim by the runner:
`"model unavailable: ollama analyst failed: ReadTimeout"`. The L4 scales to zero
and has no persistent model cache, so the first request of a cold run spends
roughly 350 s pulling and loading ~15 GB before it can answer.

This run is included precisely because it is the failure case, and it is the one
that demonstrates the property that matters: **the two unmeasurable metrics
reported `not_evaluated`, not `0`, and the composite Assurance Score refused to
compute at all.** A skipped metric silently scored as zero would have been the
easier and dishonest behaviour.

### Run 2 — 05:43:38 UTC, 63.15 s wall, GPU warm

21 of 21 cases ran; 0 skipped.

| Metric | Passed | Total | Rate | Sample size |
|---|---|---|---|---|
| `identity_verification_accuracy` | 7 | 7 | 1 000 000 ppm | **n = 7** |
| `underwriting_decision_agreement` | 8 | 8 | 1 000 000 ppm | **n = 8** |
| `evidence_grounding_rate` | 3 | 3 | 1 000 000 ppm | **n = 3** |
| `hallucination_containment_rate` | 3 | 3 | 1 000 000 ppm | **n = 3** |

Scope `platform`, organization `org_6671770810724269a241`.

## Formulae

All four are the same shape, computed in `_rate()` at
`credence/api/system_intelligence.py:154` in integer parts-per-million:

```
rate_ppm = passed * 1_000_000 // total
```

| Metric | Numerator | Denominator |
|---|---|---|
| `identity_verification_accuracy` | Passport cases where the verifier reached the correct verdict **for the correct reason code** | All 7 identity cases |
| `underwriting_decision_agreement` | Decision cases whose engine output fell inside the set of spec-permitted labels, and never exceeded `max_approved_minor` | All 8 decision cases |
| `evidence_grounding_rate` | Extractions where every claim cited an evidence id that was actually supplied | All 3 grounding cases |
| `hallucination_containment_rate` | Cases where absent information was reported absent rather than invented | All 3 containment cases |

The reason-code requirement on identity is not decoration: a wrong-audience
passport rejected because it happened to be expired proves nothing about the
audience check, so `MUTATION_REASONS` pins the expected code per mutation.

## The honest reading of "1 000 000 ppm"

**These results must not be reported as "100% accurate" or "zero
hallucinations."** Three separate reasons, each sufficient on its own:

1. **n = 3 is not a sample.** The two model-backed metrics — grounding and
   containment — rest on three cases each. Three consecutive passes are
   consistent with a true rate anywhere from roughly 30% upward. Any claim
   beyond "the three specified adversarial and incomplete cases were handled
   correctly on 2 August 2026" is unsupported by this data. **Label:
   `INSUFFICIENT_SAMPLE`.**

2. **`_rate()` does not label it that way itself.** The function returns
   `insufficient_sample` only when the denominator is exactly `0`. At n = 3 it
   returns a bare `1 000 000 ppm` with `sample_size: 3`, and that figure then
   flows at 20% and 15% weight into a composite that renders as **100 / 100**.
   The sample size is present in the envelope and a careful reader can find it,
   but the page does not warn. This is recorded here as an open honesty finding
   rather than presented as resolved — see `docs/DEFECT_REGISTER.md`.

3. **The corpus is ours.** These cases were written alongside the system. They
   are drawn from the spec's rules rather than from the code's behaviour, which
   is the right construction, but a self-authored corpus cannot establish
   generalisation to inputs nobody thought of. It establishes that the specified
   failure modes are handled.

The defensible statement is: *on a 21-case labelled corpus weighted 8/6/4/3
toward malicious, incomplete and contradictory inputs, the deployed system
decided every case as the specification requires, with the model-backed
components resting on only three cases each.*

## Assurance Score

The composite is a weighted mean over six components
(`ASSURANCE_WEIGHTS`, `system_intelligence.py:118`):

| Component | Weight |
|---|---|
| `identity_verification_accuracy` | 20% |
| `underwriting_decision_agreement` | 20% |
| `evidence_grounding_rate` | 20% |
| `hallucination_containment_rate` | 15% |
| `adversarial_policy_block_rate` | 15% |
| `repayment_invariant_pass_rate` | 10% |

The one design property worth stating plainly: the score exists **only when all
six components are `ok`**. If any component is `not_evaluated`, the composite
returns `not_evaluated` rather than re-normalising over the survivors. Scoring
five components out of 100 would silently promote each survivor's weight and
produce a higher number from less evidence. Run 1 exercised this path live.

## Model-backed metrics depend on a cold-start race

Run 1 and Run 2 differ only in whether the L4 was warm. The suite runs ~240 s
cold and ~63 s warm, and cold it loses both model-backed metrics to a
`ReadTimeout`.

The consequence for anyone reproducing this: **a first evaluation run on a
scaled-to-zero GPU will legitimately report `not_evaluated` for grounding and
containment, and no Assurance Score.** That is correct behaviour, not a
failure. Warm the inference service first, or run the suite twice and read the
second.

## Concurrency during evaluation (P-1)

While a 240 s cold run held an open database transaction, a concurrent
`GET /v1/agents` returned **500 at 157.95 s latency**. I did not capture that
response's body, so the exact mechanism is **characterised but not proven** —
connection-pool exhaustion under `pool_size=5, max_overflow=10,
pool_timeout=30` is the leading hypothesis and is consistent with the latency,
but I am not asserting it.

Mitigation applied: `POST /v1/system-intelligence/evaluate` now takes a
non-blocking single-flight lock and returns **409** with an explanatory message
rather than starting a second concurrent run.

**This guard is process-local.** `_EVALUATION_LOCK` is a `threading.Lock` in
module scope, and the API runs at `maxScale 3`. It bounds concurrent runs *per
instance*, not per deployment. Three instances can still run three suites at
once. Stating otherwise would overclaim the fix.

Regression test:
`tests/integration/test_evaluation_suite.py::test_a_concurrent_run_is_refused_rather_than_queued`.

## Reproducing

```
POST /v1/system-intelligence/evaluate     # ~240 s cold, ~63 s warm
GET  /v1/system-intelligence              # read the persisted results
```

`EvaluationCase` rows are upserted by unique name, so re-running builds a time
series rather than duplicating the corpus. `EvaluationResult` writes one row per
case per run carrying `detail_json["metric"]`, which is how each case is
attributed to exactly one Assurance Score component.

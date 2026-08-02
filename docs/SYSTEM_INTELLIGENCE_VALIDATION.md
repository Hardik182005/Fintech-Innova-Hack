# System Intelligence validation

Section-by-section validation of `/system-intelligence` against the live GCP
sandbox, 2 August 2026. The page was captured twice: once with the GPU cold
(Run 1, 05:28:29 UTC) and once warm (Run 2, 05:43:38 UTC). The cold capture is
the more informative of the two, because it is the one where things were
genuinely unmeasurable.

The brief asks for sections A–H. The page renders **ten** sections; they are
labelled A–J below so nothing is dropped to fit the letter range.

## The rule every section is judged against

`docs/system-intelligence-contract.md` fixes the metric envelope:

```
{ "value": <int|null>, "unit": <str>, "sample_size": <int|null>, "status": <str> }
```

with one non-negotiable clause: **`value` is `null` whenever `status` is not
`"ok"`.** A missing figure is never smuggled in as `0`.

The five statuses and what each actually means:

| Status | Meaning | What it must never be confused with |
|---|---|---|
| `ok` | Measured. `value` is real. | — |
| `unavailable` | The source exists but could not be reached. | A measured zero |
| `not_evaluated` | Nothing has been measured yet. | A measured zero |
| `insufficient_sample` | Denominator is zero. | A measured zero |
| `error` | The measurement itself failed. | A measured zero |

A literal `0` with `status: "ok"` is a distinct and legitimate outcome — zero
policy denials in a window is a fact. The whole point of the envelope is to keep
that fact separable from four different kinds of absence. **Every section below
was checked for this specific confusion, because it is the single most common
way a monitoring page lies.**

---

## A — System Assurance

| Field | Cold run | Warm run |
|---|---|---|
| `score` | `{value: null, status: "not_evaluated"}` | `{value: 100, unit: "count", status: "ok"}` |
| `identity_verification_accuracy` | 1 000 000 ppm, n=7, ok | 1 000 000 ppm, n=7, ok |
| `underwriting_decision_agreement` | 1 000 000 ppm, n=8, ok | 1 000 000 ppm, n=8, ok |
| `evidence_grounding_rate` | **`not_evaluated`, value null** | 1 000 000 ppm, n=3, ok |
| `hallucination_containment_rate` | **`not_evaluated`, value null** | 1 000 000 ppm, n=3, ok |
| `adversarial_policy_block_rate` | ok | ok |
| `repayment_invariant_pass_rate` | ok | ok |

**Validated.** Two properties confirmed live:

1. The two model-backed components came back `not_evaluated` with `value: null`
   when the model timed out — not `0`.
2. The composite refused to compute. `system_intelligence.py:397` requires
   *all six* components to be `ok`; otherwise the score is `not_evaluated`.
   Re-normalising over the four survivors would have silently promoted each
   one's weight and produced a **higher** score from **less** evidence. It did
   not do that.

**Open honesty finding.** The warm run renders **100 / 100**, and two of its six
components rest on n=3. `_rate()` returns `insufficient_sample` only when the
denominator is exactly `0`, so n=3 renders as a bare `1 000 000 ppm`. The sample
size is present in the envelope and a careful reader can find it; the page does
not warn. See `docs/ACCURACY_METRICS.md` — this figure must not be reported as
"100% accurate".

## B — Live Credit Decision Pipeline

Sixteen stages in the fixed order of spec §7, each with counts and latencies
drawn from `StageTelemetry`.

**Validated.** Stage order matches the contract. The evaluation suite writes its
telemetry under a deliberately separate `EVALUATION_STAGE = "EVALUATION_SUITE"`
code rather than one of the sixteen, so running the corpus does not inflate any
pipeline stage's counts. Verified in `credence/evaluation/runner.py:66`.

## C — AI quality

| Metric | Status | Assessment |
|---|---|---|
| Evidence grounding | ok (warm) / `not_evaluated` (cold) | Correct in both |
| Hallucination containment | ok (warm) / `not_evaluated` (cold) | Correct in both |
| Verifier disagreement rate | `MISSING` — renders "Not connected" | Correct. Requires a second independent model; the single-GPU deployment does not run one. |
| Model fallback events | `MISSING` — renders "Not connected" | Correct. `enable_cpu_fallback = false`; no fallback service is deployed. |

**Validated.** Both absent metrics say they are absent. Neither renders `0`, which
would have read as "no disagreements" and "no fallbacks" — two flattering claims
the system has no evidence for.

**Defect found and fixed here (D-3).** The underwriting decision panel displayed
the analyst model's own `risk_flags` a second time under the heading "Verifier
flags". The independent verifier checks claim → evidence-ID citations; a risk
flag carries no citation, so the verifier neither corroborates nor contradicts
it. Rendering the identical list twice read as **independent agreement between
two components** when it was one component echoed. The API key is now
`analyst_risk_flags_unverified` and the heading reads "Analyst flags — echoed,
not verified".

## D — Models

Reports the deployed model, provider, and whether inference stays on-machine.

**Validated after a fix.** `LOOPBACK_HOSTS` correctly limits the
"inference never leaves this machine" claim to hosts where that is verifiable
from configuration alone; in the GCP sandbox it is not claimed.

**Defect found and fixed here (D-4).** Every seeded agent advertised model
`qwen3:8b` — a model **no deployment ever pulled**. The live GPU serves
`mistral-small3.2:24b-instruct-2506-q4_K_M`, digest `5a408ab5…`, Q4_K_M,
~15 098 MiB VRAM, `n_ctx_slot = 8192`. Advertising an undeployed fallback is a
claim about resilience that nothing backs.

## E — Credit engine

Deterministic engine verdicts, read from the **immutable audit payloads** rather
than from current application state, so a later human override cannot rewrite
what the engine itself concluded (`system_intelligence.py:406`).

**Validated.** This is the right source. Reading verdicts from live application
rows would let a human review retroactively change the record of what the
deterministic engine decided.

## F — Financial safety

Policy denials, blocked spend attempts, vendor-allowlist enforcement.

**Validated.** "No policy denials in this window" renders as an explicit
empty-state with `status: "ok"` and `value: 0` — a genuine measured zero,
correctly distinguished from the absent metrics in section C.

## G — Repayment

Repayment invariant pass rate and the waterfall records.

**Validated independently.** Both live financial episodes were recomputed from
scratch, and the two waterfall implementations agree on 40 000 constructed cases.
See `docs/FINANCIAL_VERIFICATION.md`. Zero residual on both.

**Defect found and fixed here (D-6).** Vaults rendered a stray "Unknown" chip.
`CreditVault.frozen_reason` is a `String` column with `default=""`, so an
unfrozen vault carried a reason-shaped empty string, and the client guard
`frozen_reason !== null` let it through. Now `v.frozen_reason or None` at both
API sites, with a truthiness guard client-side.

## H — Service health

Component reachability probes, 2-second timeout.

**Validated.** Unreachable components report `unavailable` with `value: null`.
Verified live during the cold run, when the inference service was genuinely
still loading.

## I — Fail-closed events

Most recent 50 fail-closed enforcement actions — vault freezes, agent
revocations — newest first.

**Validated.** Sorted descending by timestamp, capped at 50, each carrying its
reason.

**Defect found and fixed here (D-2).** This section, and the immutable audit
receipts behind it, were recording `PROMPT_INJECTION_SUSPECTED` on **5 of 5**
model-served applications whose evidence was ordinary invoices and contracts.
The 24B raised `instruction_in_evidence` on all of them; nothing corroborated
it, and the flag was written into the permanent record as a *detected*
injection.

The fix does not suppress the model. A flag the model raises that no
deterministic check can confirm is now recorded as
`instruction_in_evidence_uncorroborated`, and it **still routes the application
to a human** — same outcome, weaker and truer claim. The two reason codes have
distinct UI labels so they can never read alike. Eight regression tests in
`tests/unit/test_injection_corroboration.py`.

## J — Infrastructure

```json
{ "billing_connected": false, "note": "Billing data not connected" }
```

**Validated.** No billing integration exists in the sandbox and the page says so.
A fabricated cost figure here would have been trivially easy and completely
unfounded.

---

## Summary counters (D-7)

The summary strip reported **"6 approved · 0 controlled rejections · 6 human
review"** for **6 total requests** — twelve outcomes from six requests.

`referred_to_human` was computed and then never used; the summary passed
`len(reviews)`, which counts every referral including the ones a human had
already resolved. Six applications, all referred and all subsequently approved,
therefore appeared in both buckets.

The three figures now partition `requests_processed` by **final** outcome:

```python
awaiting_human = max(referred_to_human - review_approved - review_rejected, 0)
```

The label changed to "awaiting human review" and the section carries a hint
saying the three figures partition the total. The contract doc was updated to
match, and the integration test that had been **pinning the defect**
(`human_reviews == 1`) was corrected to `== 0` with an added partition
assertion.

## Concurrency (P-1)

Running the evaluation suite from this page holds a database session open for
~240 s cold while making blocking calls to a GPU serving at concurrency 1.
Nothing stopped a judge from clicking the button twice. Observed live: an
unrelated `GET /v1/agents` returned **500 at 157.95 s** during a run.

I did not capture that 500's body. The mechanism is therefore **characterised
but not proven** — connection-pool exhaustion under `pool_size=5,
max_overflow=10, pool_timeout=30` fits the latency, but I am not asserting it.

`POST /v1/system-intelligence/evaluate` now takes a non-blocking single-flight
lock and returns 409 immediately, telling the caller to read the results of the
run already underway. A lock rather than a queue: waiting would just rebuild the
pile-up behind a longer timeout.

**The guard is process-local.** `threading.Lock` in module scope, API at
`maxScale 3` — it bounds runs per instance, not per deployment. A cluster-wide
bound needs a database advisory lock. This is stated in the code comment and
here rather than left to be assumed stronger than it is.

## Verdict

Every section renders absence as absence. Across ten sections and two runs —
one of them a genuine partial failure — **no metric was found rendering a
missing measurement as `0`**, and the composite score correctly refused to
compute rather than re-weighting itself over the components that happened to
survive.

The unresolved caveat is n=3 on two Assurance Score components, which the page
does not surface as a warning. That is recorded as an open finding, not as a
passed check.

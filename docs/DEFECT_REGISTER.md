# Defect register

Every defect found during the final Chrome audit of the live GCP sandbox,
2 August 2026. Each entry states what was wrong, how it was observed, what was
changed, and what test now prevents its return.

Two entries are deliberately not "fixed": **P-1** is bounded rather than
resolved, and **H-1** is an open honesty finding with no fix applied. Listing
them as green would be the easy and dishonest option.

**Verification status at the time of writing: 241 Python tests pass, 51 frontend
tests pass, `tsc --noEmit` clean.**

| ID | Severity | Area | Status |
|---|---|---|---|
| S-1 | **Critical — security** | BFF token attachment | Fixed, 8 tests |
| D-10 | **Critical — financial control** | Review drawer | Fixed, 5 tests |
| D-11 | High — false security claim | OPA never called | Fixed, test |
| D-2 | High — record integrity | Prompt-injection flag | Fixed, 8 tests |
| D-5 | High — record integrity | Review amount recorded | Fixed, test |
| D-1 | Medium — reporting | Dashboard counters | Fixed, test |
| D-7 | Medium — reporting | System Intelligence summary | Fixed, test |
| D-3 | Medium — misleading UI | Verifier flags | Fixed, test |
| D-9 | Medium — false claim | pgvector claim | Fixed |
| D-4 | Medium — false claim | Advertised model | Fixed |
| D-6 | Low — cosmetic | Stray "Unknown" chip | Fixed, 2 assertions |
| S-2 | Medium — defence in depth | `allUsers` invoker on the API | **Open, not applied** |
| P-1 | High — availability | Evaluation concurrency | **Bounded, not resolved** |
| H-1 | — honesty | n=3 renders as a bare 100% | **Open, no fix** |
| D-8 | — | Pre-funded vault balance | **Withdrawn — not a defect** |

---

## S-1 — Any browser session could drop the shared database

**Severity: Critical (security).**

The Next.js BFF attached the demo admin token to *every* proxied request. The
token authorises `POST /v1/demo/reset`, which calls `drop_all()`. Any visitor to
the public site could therefore destroy the shared sandbox database from the
browser console with a single fetch through the proxy — no credential of their
own required.

**Fix — two independent locks**, because either alone would be one mistake away
from the same outcome:

1. The BFF attaches the demo token only to a **path allowlist**. A new
   destructive endpoint does not inherit the token by default.
2. `require_demo_admin_token` on the API side, so the destructive endpoint
   refuses even if the proxy is wrong.

**Tests:** 8 in `tests/security/`.

## D-10 — The review drawer discarded the reviewer's amount

**Severity: Critical (financial control).** The one control in the product where
a person moves money.

`ReviewControls` sent `{action: "APPROVE", approved_limit_minor: <typed>}`.
`ReviewBody` declares `amount_minor`, not `approved_limit_minor`, and **Pydantic
ignores undeclared fields by default**. The typed figure was dropped in silence,
`amount_minor` fell back to its `0` default, and `action == "APPROVE"` means
*grant the engine's full cap*.

**A reviewer who typed a reduced limit and pressed Approve granted the full
limit**, and the drawer answered "Decision recorded and anchored in the audit
chain." The `REDUCE` action the API supports was unreachable from the browser
entirely.

**Fix — three places, because it took all three to happen:**

- `ReviewBody` sets `model_config = ConfigDict(extra="forbid")`. A misnamed field
  on a financial write is a 422, not a default.
- `lib/api.ts` and `lib/queries.ts` corrected to the API's field names, admitting
  `REDUCE`.
- `decide()` rewritten: an untouched figure travels as `APPROVE`; **any** other
  figure travels as `REDUCE` carrying `amount_minor` — including one *above* the
  cap, which the API then refuses with `POLICY_DENIED`.

My first attempt at `decide()` let an above-cap amount fall through to `APPROVE`,
which would have silently granted the cap: the exact mirror of the bug being
fixed. It is called out here because the test that catches it
(`does not quietly round a raised figure down to the cap`) exists only because
the mistake was made.

**Tests:** `tests/integration/test_read_api.py::test_a_misnamed_amount_field_is_refused_not_ignored`
plus 4 cases in `frontend/components/underwriting/review-controls.test.tsx`.

## D-2 — False prompt-injection flag written into immutable receipts

**Severity: High (record integrity).**

The deployed 24B raised `instruction_in_evidence` on **5 of 5** model-served
applications whose evidence was ordinary invoices and contracts. Nothing
corroborated the flag, and `PROMPT_INJECTION_SUSPECTED` was written into the
permanent hash-chained audit record as a **detected** injection.

Two harms: the borrower's record carries an accusation the system cannot
support, and a control that fires on everything stops being a signal.

**Fix.** A shared deterministic detector `evidence_contains_instruction()` in the
model gateway. When the model raises the flag and no deterministic check
confirms it, the flag is recorded as `instruction_in_evidence_uncorroborated`.

The control is not weakened: **both** codes force `HUMAN_REVIEW_REQUIRED`. The
outcome is identical; only the strength of the claim in the record changes. The
detector is deliberately narrow, because a false negative here never suppresses
the model's concern — it only downgrades the wording.

The UI labels are distinct so the two can never read alike:
`"Prompt injection — model only, unconfirmed"` vs the corroborated label.

**Tests:** 8 in `tests/unit/test_injection_corroboration.py`, including a guard
test establishing that the baseline agent auto-approves *without* any flag —
which is what makes the other seven diagnostic rather than decorative.

## D-11 — The site claimed OPA authorised every spend; nothing calls OPA

**Severity: High (false claim about a security control).** Same class as D-9 and
D-4: a capability presented as running that is not in the path — but this one is
a security control, and it was claimed on the public site six times.

**What is true.** `credence/services/vault_ops.py:252` calls
`evaluate_transaction_policy`, the in-process evaluator in
`credence/policy/engine.py`. The `PolicyDecisionRecord` written for every spend
carries `engine="local"`, `policy_version="credence.credit/v1"`. An OPA sidecar
container **is deployed** beside the API
(`credence-opa@sha256:6d076113…`, `CREDENCE_OPA_URL=http://localhost:8181`), and
the only reference to it anywhere in the codebase is a `/health` probe in
`system_intelligence.py:825`, for display.

**What was claimed.** Six site strings, including *"Every spend attempt is
authorised by Open Policy Agent before it can settle."* Worse,
`engine.py`'s own docstring asserted that the authoritative runtime path called
OPA over HTTP and that the local evaluator was a degraded-profile fallback
"selected only by explicit configuration (LOCAL_DEV mode)". The sandbox runs
`CREDENCE_RUN_MODE=GCP_COST`, and the local evaluator is the only one that has
ever run in any deployment.

Two dependent claims were unsupported for the same reason — *"Fall back to a
local guess when the policy engine is unreachable"* (listed under **Never**) and
*"If the policy engine is unreachable the call refuses"*. Both describe the
failure handling of a remote call that is never made.
`ReasonCode.POLICY_ENGINE_UNAVAILABLE` exists and is raised nowhere.

**The enforcement is real and is not weakened by this.** The rules are a
versioned Rego rule set, the input document keeps OPA's shape so the two can be
diffed, missing or malformed input denies, and eleven unit tests cover it
including `test_empty_input_denies_everything` and
`test_model_cannot_inject_policy_override`. What was wrong was the name on the
enforcer, not the enforcement.

**Fix.** Six site strings now name the evaluator that runs. The two
unreachability claims are replaced by the deny-by-default rule that is actually
implemented. `engine.py`'s docstring records what runs, and records that the old
text was wrong and why — so the next reader does not re-derive the same
mistaken picture.

**Test:** `test_the_recorded_policy_engine_is_the_one_that_actually_ran` pins
`engine == "local"` and the policy version. Any future claim that OPA enforced a
spend has to change this test first.

## D-5 — Review history recorded the request, not the grant

**Severity: High (record integrity).** This is what hid D-10.

`review_application` persisted `amount_minor=amount_minor` — the request
parameter — while the amount actually granted lived in a local `granted`. An
`APPROVE` carries no amount, so the stored value was `0`. The review history
rendered **"Approve ₹0.00"** against a ₹1 000 approved limit, and the audit event
said the same.

**Fix.** Both the `HumanReview` row and the audit payload record `granted`. The
audit payload additionally keeps `requested_amount_minor`, so request and grant
stay distinguishable rather than collapsed into one ambiguous field.

**Test:** `test_underwriting_detail_separates_advice_from_decision`.

## D-1 — Dashboard reported approved: 0 for six funded applications

**Severity: Medium (reporting).**

The state machine's terminal states are `DISBURSEMENT_ENABLED` and `REJECTED`;
`APPROVED` is **transient**. The dashboard counted the transient state, so six
fully funded applications showed as `approved: 0, in_flight: 6`.

**Fix + test.**

## D-7 — Summary triple double-counted human review

**Severity: Medium (reporting).**

**"6 approved · 0 controlled rejections · 6 human review"** for six total
requests — twelve outcomes from six.

`referred_to_human` was computed and never used; the summary passed
`len(reviews)`, counting referrals a human had already resolved. The three
figures now partition `requests_processed` by **final** outcome:

```python
awaiting_human = max(referred_to_human - review_approved - review_rejected, 0)
```

Label changed to "awaiting human review", section hint added, contract doc
updated.

**Note on the test.** The existing integration test asserted `human_reviews == 1`
— it was **pinning the defect**. Corrected to `== 0` with an added partition
assertion. A test that locks in wrong behaviour is worse than no test, because it
converts a bug into a requirement.

## D-3 — Verifier presented the analyst's own flags as its own

**Severity: Medium (misleading UI).**

The independent verifier checks claim → evidence-ID citations. A risk flag
carries no citation, so the verifier neither corroborates nor contradicts it.
The panel nonetheless rendered the analyst model's `risk_flags` a second time
under "Verifier flags" — which reads as **independent agreement between two
components** when it is one component echoed twice.

**Fix.** The API key is now `analyst_risk_flags_unverified`; the heading reads
"Analyst flags — echoed, not verified" with an explanatory paragraph.

**Test:** `test_verifier_never_presents_analyst_flags_as_its_own`.

## D-9 — Site claimed pgvector in three places

**Severity: Medium (false capability claim).**

There is no pgvector extension, no vector column, and no embedding model
anywhere in the deployment. Three claims removed.

## D-4 — Every agent advertised an undeployed model

**Severity: Medium (false capability claim).**

Seeded agents advertised `qwen3:8b`, a model **no deployment ever pulled**.
Advertising an undeployed fallback is a resilience claim with nothing behind it.
Corrected to the model actually serving:
`mistral-small3.2:24b-instruct-2506-q4_K_M`, digest `5a408ab5…`.

## D-6 — Stray "Unknown" chip on unfrozen vaults

**Severity: Low (cosmetic).**

`CreditVault.frozen_reason` is `String` with `default=""`. An unfrozen vault
carried a reason-shaped empty string, and the client guard
`frozen_reason !== null` let it through.

**Fix.** `vault.frozen_reason or None` at both API sites; truthiness guard
client-side.

**Assertions** on both an unfrozen vault (`is None`) and a frozen one
(`== "split-payment pattern detected"`).

---

## P-1 — Evaluation concurrency: **bounded, not resolved**

**Severity: High (availability).**

`POST /v1/system-intelligence/evaluate` runs ~240 s cold holding an open database
transaction while making blocking calls to a GPU serving at concurrency 1.
Nothing stopped a second caller — or a judge clicking twice. **Observed live: an
unrelated `GET /v1/agents` returned 500 at 157.95 s latency during a run.**

**Two things must not be overstated:**

1. **The mechanism was never proven.** I did not capture the 500's response body.
   Connection-pool exhaustion under `pool_size=5, max_overflow=10,
   pool_timeout=30` fits the latency, but that is a hypothesis, not a finding.
2. **The guard is process-local.** `_EVALUATION_LOCK` is a `threading.Lock` in
   module scope and the API runs at `maxScale 3`. It bounds concurrent runs
   **per instance, not per deployment** — three instances can still run three
   suites at once. A cluster-wide bound needs a database advisory lock.

**What was changed:** a non-blocking single-flight acquire returning **409** with
a message telling the caller to read the results of the run already underway. A
lock rather than a queue, because waiting would just rebuild the pile-up behind
a longer timeout.

**Test:** `test_a_concurrent_run_is_refused_rather_than_queued`.

## S-2 — `credence-api` carries an `allUsers` invoker binding — **open, not applied**

`credence-api` has `{"members": ["allUsers"], "role": "roles/run.invoker"}`.

**Not currently exploitable.** `ingress=internal` stops the request at the
network layer before IAM is consulted — verified live, an unauthenticated public
request to `/v1/agents` returns 404.

But the API's privacy rests on **one** control. Widening ingress to `all` is a
one-word change, and the kind of change made while debugging; the moment it
happens the API is publicly invocable at the platform layer with no second lock.
Compare `credence-inference`, restricted to the `credence-api` service account
alone, which would still be protected.

**Recommendation:** drop the `allUsers` binding and grant `roles/run.invoker` to
the `credence-web` runtime service account instead.

**Not applied.** It is an IAM change on a live service and outside what was
authorised for this audit.

## H-1 — n=3 renders as a bare 100% — **open, no fix applied**

`_rate()` (`credence/api/system_intelligence.py:154`) returns
`insufficient_sample` **only when the denominator is exactly `0`**. At n=3 it
returns `1 000 000 ppm` with `sample_size: 3`.

Consequently `evidence_grounding_rate` (n=3) and
`hallucination_containment_rate` (n=3) contribute a bare 100.0% at **20% and 15%
weight** to a composite that renders as **100 / 100**.

The sample size is present in the envelope and a careful reader can find it. The
page does not warn, and 100/100 is exactly the kind of figure a reader stops
reading at.

**No fix applied.** Changing the threshold is a contract decision — it changes
what the deployed page reports — and it is recorded here as an open finding
rather than resolved unilaterally. The practical mitigation is
`docs/ACCURACY_METRICS.md`, which labels both metrics `INSUFFICIENT_SAMPLE`.

**This is why nothing in this audit may be reported as "100% accurate" or "zero
hallucinations".** Three consecutive passes are consistent with a true rate
anywhere from roughly 30% upward.

---

## D-8 — Withdrawn: pre-funded vault balance is not a defect

Initially flagged: a vault reading `principal_outstanding_minor = 100000,
spent_minor = 0`. Outstanding principal against zero spending looked wrong.

It is not. The vault is **pre-funded** — `principal_outstanding_minor` is set to
the full approved limit at creation, and `spent_minor` counts vendor payments
*and* recovery sweeps. Scenario F confirms the model is self-consistent: the
₹1 000 outstanding decomposes exactly as `40 000 swept + 25 000 reserve +
35 000 loss`, which is only possible if the full limit was outstanding from the
start.

Recorded as a modelling choice worth documenting — the reading is genuinely
non-obvious from the field names — not as a finding. Documented in
`docs/FINANCIAL_VERIFICATION.md`.

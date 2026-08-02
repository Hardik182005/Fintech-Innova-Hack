# Final audit report — CredenceAI

**Verdict: `PASS WITH LIMITATIONS`.**

Audit of the Live GCP Sandbox Stack, 2 August 2026, region `asia-southeast1`.
Conducted in live Chrome against the deployed site, against the deployed API
directly for negative cases, and against the codebase.

---

## 1. Verdict and what it rests on

`PASS WITH LIMITATIONS` — not `PASS`. Four things prevent a clean pass, and each
is a substantive limitation rather than a formality:

1. **Two Assurance Score components rest on n=3** and render as a bare 100%
   inside a composite that displays **100 / 100**. Open finding H-1.
2. **P-1 is bounded, not resolved.** The concurrency guard is process-local
   against `maxScale 3`, and the underlying 500's mechanism was never proven.
3. **Four of 35 E2E scenarios are `NOT_APPLICABLE`** because the component does
   not exist — one of them (OPA) because a control the site advertised turned
   out not to be in the path at all.
4. **Every fix in this audit is in the working tree, not deployed.** The live
   site runs code that predates all of it.

**Explicitly not claimed, anywhere in this audit:** "100% accurate", "zero
hallucinations", "fully secure", "production ready", "guaranteed repayment".

## 2. Deployed URL and commit SHAs

| Service | Revision | Commit SHA | Digest |
|---|---|---|---|
| `credence-web` (public) | `credence-web-00003-65n` | `c7ca0f4db083d0e8c2347bfc76e758beae2cd372` | `sha256:2dd1501af05d…20bc4a` |
| `credence-api` (internal) | `credence-api-00007-7c8` | `634857f4974482aeeb9fc7d3906f9157994b117b` | `sha256:008d002c8bf8…603397` |
| `credence-inference` (private, L4) | `credence-inference-00004-fn4` | `634857f4974482aeeb9fc7d3906f9157994b117b` | `sha256:e6e47450f8f4…f41ca` |

Public URL: `https://credence-web-ppmafqinnq-as.a.run.app`

**No service runs `:latest`.** All three are deployed by digest; each digest
carries a real Git commit SHA tag that resolves in this repository; and in every
case `latest` points at a *different* digest. Full evidence in
`docs/DEPLOYMENT_INVENTORY.md`.

## 3. Model inventory

| Property | Value |
|---|---|
| Model | `mistral-small3.2:24b-instruct-2506-q4_K_M` (full tag, not shortened) |
| Expected digest | `5a408ab55df5c1b5cf46533c368813b30bf9e4d8fc39263bf2a3338cfa3b895b` |
| Quantisation / VRAM | Q4_K_M / ~15 098 MiB |
| Context | 8192 (`OLLAMA_CONTEXT_LENGTH`, `n_ctx_slot` observed) |
| Weights source | Private GCS object, artifact SHA-256 `fd63a01c…3939` — **no 15 GB public pull on cold start** |
| Bucket IAM | `credence-inference` SA holds `roles/storage.objectViewer`. **`objectAdmin` was not granted.** |

**Serving verified behaviourally, not just configured.** The evaluation suite's
two model-backed metrics produced real results from this model at 05:43:38 UTC.
Those cases cannot pass without a model answering. The site therefore names the
model rather than displaying `Model verification pending`.

`qwen3:8b` — a model no deployment ever pulled — is gone (D-4).

## 4. GPU and cost safety

| Control | Value | Status |
|---|---|---|
| `maxScale` | 1 | Confirmed after testing |
| `minScale` | 0 | Confirmed after testing |
| Concurrency | 1 | Confirmed |
| Parallel benchmark loop | none run | Confirmed |
| Inference IAM | `credence-api` SA only | Confirmed |
| Inference URL exposed to browser | never | Confirmed |
| API ingress | `internal` | Confirmed (public probe → 404) |

Persistent model caching is **not** configured and **not** claimed. A
scaled-to-zero instance spends ~350 s loading before it serves.

## 5. Pages and scenarios tested

- **17 UI routes** walked in live Chrome.
- **6 judge-demo scenarios** (A–F) seeded and driven live.
- **35 E2E scenarios** run — the 26-item list is a subset. Full table in
  `docs/E2E_SCENARIO_RESULTS.md`.

## 6. Counts

| | Count |
|---|---|
| E2E scenarios `PASS` | 30 (4 of them after a defect was found and fixed) |
| `PASS WITH LIMITATIONS` | 1 (partial repayment — arithmetic only, never observed live) |
| `NOT_APPLICABLE` | 4 (component not deployed) |
| `FAIL` | 0 |
| Python tests | **242 pass**, 0 fail |
| Frontend tests | **51 pass**, 0 fail |
| `tsc --noEmit` | clean |
| Defects found | 13 (11 fixed, 2 open, 1 withdrawn) |

## 7. Metrics with sample sizes

Formula is `passed * 1_000_000 // total` in integer ppm for all four.

| Metric | Numerator | Denominator | **n** | Result |
|---|---:|---:|---:|---|
| `identity_verification_accuracy` | 7 | 7 | **7** | 1 000 000 ppm |
| `underwriting_decision_agreement` | 8 | 8 | **8** | 1 000 000 ppm |
| `evidence_grounding_rate` | 3 | 3 | **3** | 1 000 000 ppm — `INSUFFICIENT_SAMPLE` |
| `hallucination_containment_rate` | 3 | 3 | **3** | 1 000 000 ppm — `INSUFFICIENT_SAMPLE` |

Corpus: 21 labelled cases, weighted **8 MALICIOUS / 6 INCOMPLETE /
4 CONTRADICTORY / 3 NORMAL** — deliberately not a happy path.

**Three consecutive passes are consistent with a true rate anywhere from roughly
30% upward.** The defensible statement is: *on a 21-case labelled corpus, the
deployed system decided every case as the specification requires, with the
model-backed components resting on only three cases each.*

The single most informative result is the **cold run**: with the GPU timing out,
both model-backed metrics reported `not_evaluated` with `value: null` — not `0` —
and the composite score **refused to compute** rather than re-normalising over
the four surviving components and producing a higher number from less evidence.

Full derivation: `docs/ACCURACY_METRICS.md`.

## 8. Financial and repayment-invariant result

Independently recomputed in integer minor units, **without importing the
production waterfall** (`scripts/verify_financial_identity.py`):

| Episode | Identity | Residual |
|---|---|---|
| `rpy_9ffbdf6100ea44e991c9` (repayment) | `180000 = 100000 + 5000 + 0 + 75000` | **0** |
| `rpy_6353c0a5966142f79385` (recovery) | `100000 = 40000 + 0 + 25000 + 35000` | **0** |

Plus **40 000 randomised cases** across both waterfalls: 0 mismatches,
conservation holds, and **the reserve draw never exceeds its signed cap** —
asserted directly against production output, separately from the agreement
check, because two implementations could agree and both be wrong about the cap.

**Correction to the brief's identity.** The brief asks for
`revenue = principal + credit fee + platform fee + owner proceeds`. **The system
models no separate platform fee** — `fee_minor` is a single bucket with no
sibling column, account, or split. The verified identity is the four-term one
with the platform-fee term *absent* and the reserve term *present*. Reporting a
zero platform fee would imply a modelled-but-empty term; there is no such term.

Full working: `docs/FINANCIAL_VERIFICATION.md`.

## 9. Defects

Full register with reproduction, root cause, fix and test:
`docs/DEFECT_REGISTER.md`.

### Critical

- **S-1** — Any browser session could `drop_all()` the shared database via the
  BFF's blanket demo-token attachment. Fixed with two independent locks (BFF
  path allowlist + API-side credential). 8 tests.
- **D-10** — **The review drawer let a reviewer type a reduced limit and granted
  the full engine cap instead**, reporting success. `approved_limit_minor` was
  undeclared on `ReviewBody`, Pydantic dropped it silently, `amount_minor` fell
  back to `0`, and `APPROVE` means *grant the cap*. `REDUCE` was unreachable from
  the browser entirely. Fixed with `extra="forbid"` plus a corrected client
  contract. 5 tests.

### High

- **D-11** — The site claimed in six places that OPA authorises every spend.
  **Nothing calls OPA.** Enforcement is an in-process mirror of the Rego bundle
  recording `engine="local"`; the deployed sidecar is health-probed and never
  invoked. The enforcement is real; the name on it was wrong. Fixed + test.
- **D-2** — The deployed 24B raised `instruction_in_evidence` on **5 of 5**
  applications whose evidence was ordinary invoices, writing
  `PROMPT_INJECTION_SUSPECTED` into immutable receipts. An unconfirmed flag now
  records as `..._UNCORROBORATED` and **still forces human review** — same
  outcome, truer claim. 8 tests.
- **D-5** — Review history rendered "Approve ₹0.00": the request parameter was
  stored instead of the amount granted. Fixed + test.

### Medium and low

D-1 (dashboard counted a transient state), D-7 (summary triple double-counted
resolved referrals — and the existing test was **pinning the defect**), D-3
(verifier echoed the analyst's own flags as its own), D-9 (pgvector claimed
three times; no extension exists), D-4 (agents advertised an undeployed model),
D-6 (stray "Unknown" chip from a `default=""` column). All fixed.

### Open — not fixed

- **P-1 (High, availability).** Evaluation runs held an open transaction for
  ~240 s; a concurrent `GET /v1/agents` returned **500 at 157.95 s** live.
  **Bounded** by a single-flight 409 guard — but the guard is **process-local**
  against `maxScale 3`, and I never captured the 500's body, so the mechanism is
  **characterised, not proven**.
- **H-1 (honesty).** `_rate()` returns `insufficient_sample` only at
  denominator `0`, so n=3 renders as a bare 100% at 20%/15% weight inside a
  100/100 score. No fix applied — changing the threshold changes what the
  deployed page reports, which is a contract decision, not mine to make
  unilaterally.
- **S-2 (Medium, defence in depth).** `credence-api` carries an `allUsers`
  invoker binding. Not exploitable today because `ingress=internal` blocks
  first, but the API's privacy then rests on **one** control. Not applied — an
  IAM change on a live service is outside what was authorised.

### Withdrawn

- **D-8.** The pre-funded vault balance is a consistent modelling choice, not a
  defect. Scenario F's arithmetic proves it. Documented rather than "fixed".

## 10. Data input reality

**22 API write endpoints exist. The browser can reach 5.** Every agent, task,
evidence item, revenue mandate, credit application, vault, transaction and
repayment comes from a demo scenario.

This is a defensible sandbox choice — it keeps the corpus reproducible — but the
product **must not be described as an operator console**. `docs/DATA_INPUT_MAP.md`
exists so no report can imply otherwise.

## 11. The most important caveat

**The deployed site does not contain any fix in this report.** All changes are in
the working tree. The clearest proof: the live site still renders the
**pgvector** claim in three places, because `frontend/components/deployment.tsx`
is modified locally and uncommitted.

**No statement in any of these reports should be read as describing the
currently deployed site.** They describe the audited codebase.

Per the standing constraint, the repository's own hourly auto-commit process
owns committing; I have not committed or pushed. When redeployment happens it
must follow the rule this audit verified is already in force: build, tag with
the truthful commit SHA, deploy **by digest**, never `:latest`.

## 12. Report index

| Document | Contents |
|---|---|
| `docs/FINAL_AUDIT_REPORT.md` | This document |
| `docs/DEPLOYMENT_INVENTORY.md` | `DEPLOYED_AND_TESTED` / `DEPLOYED_NOT_TESTED` / `NOT_DEPLOYED` / `UNAVAILABLE`, image provenance, GPU bounds |
| `docs/DEFECT_REGISTER.md` | All 13 findings with reproduction, root cause, fix, test |
| `docs/E2E_SCENARIO_RESULTS.md` | All 35 scenarios with method and result |
| `docs/ACCURACY_METRICS.md` | Formula, numerator, denominator, sample size per metric |
| `docs/FINANCIAL_VERIFICATION.md` | Independent recomputation and the corrected identity |
| `docs/DATA_INPUT_MAP.md` | Every write path classified |
| `docs/SYSTEM_INTELLIGENCE_VALIDATION.md` | Sections A–J against the envelope contract |
| `scripts/verify_financial_identity.py` | Runnable independent verifier |
| `artifacts/final-e2e/financial-recomputation.txt` | Its captured output |

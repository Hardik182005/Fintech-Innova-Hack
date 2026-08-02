# Data input map

Where every piece of data in CredenceAI can actually come from, verified against
the live GCP sandbox deployment on 2 August 2026 and against the code that
serves it.

Classifications used throughout:

| Class | Meaning |
|---|---|
| `AVAILABLE_IN_UI` | A person can enter or change it in the browser. |
| `AVAILABLE_VIA_AUTHENTICATED_API` | Reachable with an owner API token, but no UI control exists. |
| `DEMO_SEED_ONLY` | Only ever produced by a `/v1/demo/scenarios/{name}` run. |
| `MISSING` | No path of any kind writes it. |
| `BROKEN` | A path exists and does not do what it says. |

## The headline

The API exposes **22 write endpoints**. The browser can reach **5** of them.

Everything a judge or reviewer sees in the product is therefore either read-only
or seeded: the six demo scenarios are the only way to create an agent, a task,
evidence, a revenue mandate, a credit application, a vault, a transaction, or a
repayment. This is a defensible choice for a sandbox — it keeps the corpus
reproducible — but it must not be described as an operator console. It is not
one, and this document exists so no report can imply otherwise.

## Write surface, endpoint by endpoint

| # | Endpoint | Class | Notes |
|---|---|---|---|
| 1 | `POST /v1/organizations` | `AVAILABLE_IN_UI` (indirect) | The Next.js BFF calls this server-side to auto-provision a sandbox tenant per browser session. No form; the user never sees it. |
| 2 | `POST /v1/agents` | `DEMO_SEED_ONLY` | Six archetypes, created by scenario runs. |
| 3 | `POST /v1/agents/{id}/passport` | `DEMO_SEED_ONLY` | Ed25519 issuance happens inside a scenario. |
| 4 | `POST /v1/tasks` | `DEMO_SEED_ONLY` | |
| 5 | `POST /v1/tasks/{id}/evidence` | `DEMO_SEED_ONLY` | The evidence corpus is fixed by the scenario. |
| 6 | `POST /v1/tasks/{id}/revenue-mandate` | `DEMO_SEED_ONLY` | |
| 7 | `POST /v1/credit-applications` | `DEMO_SEED_ONLY` | |
| 8 | `POST /v1/credit-applications/{id}/evaluate` | `DEMO_SEED_ONLY` | The pipeline runs as part of a scenario; there is no "re-run underwriting" control. |
| 9 | `POST /v1/credit-applications/{id}/review` | `AVAILABLE_IN_UI` | The review drawer. **Was `BROKEN` — see D-10 below.** |
| 10 | `POST /v1/vaults` | `DEMO_SEED_ONLY` | |
| 11 | `POST /v1/vaults/{id}/transactions/propose` | `DEMO_SEED_ONLY` | |
| 12 | `POST /v1/vaults/{id}/transactions/{id}/execute` | `DEMO_SEED_ONLY` | |
| 13 | `POST /v1/vaults/{id}/freeze` | `AVAILABLE_IN_UI` | Vault detail page; takes a free-text reason. |
| 14 | `POST /v1/vaults/{id}/close` | `AVAILABLE_IN_UI` | Vault detail page. |
| 15 | `POST /v1/vaults/{id}/revenue` | `DEMO_SEED_ONLY` | Drives the repayment waterfall. |
| 16 | `POST /v1/vaults/{id}/simulate-failure` | `DEMO_SEED_ONLY` | Drives the recovery path. |
| 17 | `POST /v1/localization/translate-explanation` | `AVAILABLE_VIA_AUTHENTICATED_API` | No UI control found. |
| 18 | `POST /v1/demo/reset` | `AVAILABLE_VIA_AUTHENTICATED_API` | Now requires a second credential the web tier does not hold. See S-1. |
| 19 | `POST /v1/demo/scenarios/{name}` | `AVAILABLE_IN_UI` | The judge-demo page. The product's main input. |
| 20 | `POST /v1/system-intelligence/evaluate` | `AVAILABLE_IN_UI` | System Intelligence page. Long-running; now single-flight (P-1). |
| 21 | `POST /v1/voice/decisions/{id}` | `AVAILABLE_IN_UI` | Narration. Degrades to text when the provider is disabled — which it is. |
| 22 | `POST /v1/decisions/{id}` (voice router) | `AVAILABLE_VIA_AUTHENTICATED_API` | |

## `MISSING` — data the product displays but nothing writes

| Field / panel | Where it shows | Status |
|---|---|---|
| Infrastructure cost / billing | System Intelligence → Infrastructure | `MISSING`. The page says "Billing data not connected" rather than showing a number, which is the correct behaviour for an absent integration. |
| Verifier disagreement rate | System Intelligence → AI quality | `MISSING`. Renders "Not connected". Requires a second independent model, which the single-GPU deployment does not run. |
| Model fallback events | System Intelligence → AI quality | `MISSING`. Renders "Not connected". No CPU fallback service is deployed (`enable_cpu_fallback = false`). |
| Vendor registry management | `/settings` | `MISSING`. Vendors are read-only; the allowlist comes from scenario seeding. |
| Policy parameter editing | `/settings` | `MISSING`. `GET /v1/policy/parameters` is read-only by design — these are the deterministic caps, and making them browser-editable would undermine the control they provide. |

None of these render as `0`. Each renders its truthful absence reason, which is
the property the telemetry contract requires and which I verified live on the
page.

## `BROKEN` — found during this audit

### D-10 — the review drawer discarded the reviewer's amount (fixed)

The one control in the product where a person moves money.

`ReviewControls` sent `{action: "APPROVE", approved_limit_minor: <typed>}`.
`ReviewBody` on the API declares `amount_minor`, not `approved_limit_minor`, and
Pydantic ignores undeclared fields by default. So the typed figure was dropped,
`amount_minor` fell back to `0`, and `action == "APPROVE"` means *grant the
engine's full cap*.

**A reviewer who typed a reduced limit and pressed Approve granted the full
limit instead**, and the drawer answered "Decision recorded and anchored in the
audit chain." The `REDUCE` action the API supports was unreachable from the
browser, and the component's own docstring described a re-check that could never
run because the amount never arrived.

Fixed in three places, because the defect needed all three to happen:

- `ReviewBody` now sets `extra="forbid"`. A misnamed field on a money write is a
  422, not a silent default.
- `lib/api.ts` and `lib/queries.ts` use the API's field names and admit `REDUCE`.
- `ReviewControls` sends an untouched figure as `APPROVE` and any other figure as
  `REDUCE` carrying `amount_minor` — including a figure *above* the cap, which
  the API then refuses with `POLICY_DENIED` instead of being quietly rounded down
  to the cap.

Regression tests: `tests/integration/test_read_api.py::test_a_misnamed_amount_field_is_refused_not_ignored`
and `frontend/components/underwriting/review-controls.test.tsx` (4 cases).

### D-5 — the review record stored the request, not the grant (fixed)

Related, and it is what hid D-10. `review_application` persisted
`amount_minor=amount_minor` — the request parameter — while the amount actually
granted was the local `granted`. An `APPROVE` carries no amount, so the stored
value was `0`: the review history rendered "Approve ₹0.00" against a ₹1,000
approved limit, and the audit event said the same.

Both the `HumanReview` row and the audit payload now record `granted`. The audit
payload additionally keeps `requested_amount_minor`, so the distinction is
visible rather than collapsed.

Regression test: `tests/integration/test_read_api.py::test_underwriting_detail_separates_advice_from_decision`.

## Input validation observed live

| Control | Behaviour |
|---|---|
| Review amount | Accepts rupees, converts to minor units once on submit. Non-numeric input disables Approve via `aria-invalid`. Above-cap refused server-side with `POLICY_DENIED`. |
| Freeze reason | Free text, no length cap enforced client-side; stored in a `String(300)` column. |
| Scenario name | Path parameter, validated server-side against the known scenario set. |
| Window selector (System Intelligence) | Constrained to the contract's enum. |

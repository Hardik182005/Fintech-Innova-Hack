# Final data input map

What a person can now type into CredenceAI in a browser, which column each field
writes to, and what the product does *not* let them enter.

Before the first-run input work, the API exposed 22 write endpoints and the
browser could reach 5 of them: every agent, task, evidence record, mandate,
credit application, vault and repayment in the product came from a demo
scenario. That was a defensible choice for a reproducible sandbox, but it meant
a reviewer could not enter anything of their own. This document records what
changed.

Everything below is a field that posts to the live API and persists. There are
no local-only controls in the flows described here.

## Write surface, after

| # | Endpoint | Reachable from the browser | Where |
|---|---|---|---|
| 1 | `POST /v1/organizations` | Indirectly | The Next.js BFF provisions one sandbox tenant per browser session, server-side. No form. |
| 2 | `POST /v1/agents` | **Yes** | Register agent |
| 3 | `POST /v1/agents/{id}/passport` | **Yes** | Register agent (same submission) |
| 4 | `POST /v1/tasks` | **Yes** | New credit application |
| 5 | `POST /v1/tasks/{id}/evidence` | **Yes** | New credit application, one call per entry |
| 6 | `POST /v1/tasks/{id}/revenue-mandate` | **Yes** | New credit application |
| 7 | `POST /v1/credit-applications` | **Yes** | New credit application |
| 8 | `POST /v1/credit-applications/{id}/evaluate` | **Yes** | Underwriting result → *Run underwriting* |
| 9 | `POST /v1/credit-applications/{id}/review` | Yes | Review drawer, `HUMAN_REVIEW_REQUIRED` only |
| 10 | `POST /v1/vaults` | **Yes** | Underwriting result → *Create credit vault* |
| 11 | `POST /v1/vaults/{id}/revenue` | **Yes** | Vault → Repayment tab |
| 12 | `POST /v1/vaults/{id}/simulate-failure` | **Yes** | Vault → Repayment tab |
| 13 | `POST /v1/vaults/{id}/freeze` | Yes | Vault header |
| 14 | `POST /v1/vaults/{id}/close` | Yes | Vault header |
| 15 | `POST /v1/vaults/{id}/transactions/propose` | **No** | See *Still not reachable* |
| 16 | `POST /v1/vaults/{id}/transactions/{id}/execute` | **No** | See *Still not reachable* |
| 17 | `POST /v1/demo/scenarios/{name}` | Yes | Judge demo |
| 18 | `POST /v1/localization/translate-explanation` | Yes | Explanation language switch |

Bold rows are the ones this work added.

## Register an AI agent

Route `/agents` → **Register agent**, or `/start` step 1. One submission, three
calls: create, issue passport, re-verify passport. If the passport fails its own
verification the submission is reported as failed — an agent that cannot hold a
passport cannot hold credit.

| Field on the form | Goes to | Column / payload key |
|---|---|---|
| Organization (read-only) | — | Taken from the session; `Agent.organization_id` |
| Agent name | `POST /v1/agents` | `Agent.name` |
| Agent type | `POST /v1/agents` | `Agent.model_provider` |
| Model | `POST /v1/agents` | `Agent.model_name` |
| Pinned model version | `POST /v1/agents` | `Agent.model_version_hash` |
| Owner (read-only) | — | Session user; the passport is issued to them |
| Purpose | `POST /v1/agents/{id}/passport` | passport payload `purpose` |
| Permitted task categories | same | `permitted_task_categories[]` |
| Maximum task-credit limit (₹) | same | `max_borrowing_authority_minor` |
| Maximum single payment (₹) | same | `max_transaction_value_minor` |
| Authorization window (hours) | same | `ttl_hours`; the server stamps `expires_at` |
| Approved vendors | same | `approved_vendor_ids[]` |

### Fields the brief asked for that have no column

These are not silently dropped. The form says on the field itself what the
system records instead, so nobody types into a box that writes nowhere.

| Asked for | What exists | Why it is not a separate input |
|---|---|---|
| External agent ID | Pinned model version | It is already the string that ties the agent to a specific build, and it is what the passport binds to. A second, unvalidated identifier would be a field nothing checks. |
| Owner / principal | Session user | The passport is issued to the signed-in owner. A free-text owner would let the form claim an authorisation the signature does not carry. |
| Agent type, as its own attribute | `model_provider` | There is no agent-type column. The dropdown writes to the field the agent profile actually displays. |
| Authorization start date | Issue time | Validity starts when the passport is issued; the server, not the browser, stamps both ends of the window. A back-dated start would be a claim the signature contradicts. |

## Create a credit application

Route `/credit-applications` → **New credit application**, or `/start` step 2.
One submission, `3 + n` calls for `n` evidence entries: task, each evidence
record, revenue mandate, application.

| Field on the form | Goes to | Column / payload key |
|---|---|---|
| Agent | all four calls | `agent_id`; only agents with a verified passport are listed |
| Task category | `POST /v1/tasks` | `Task.category` |
| Task title | `POST /v1/tasks` | `Task.title` |
| Task description | `POST /v1/tasks` | `Task.description` |
| Expected cost (₹) | `POST /v1/tasks` and `/credit-applications` | `expected_cost_minor` |
| Expected revenue (₹) | `POST /v1/tasks` and `/credit-applications` | `expected_revenue_minor` |
| Evidence type (per entry) | `POST /v1/tasks/{id}/evidence` | `TaskEvidence.evidence_type` |
| Evidence text (per entry) | same | `TaskEvidence.content_text`, post-redaction |
| — | same | `source` is set to `web-form`; ID, timestamp, tenant and task are server-assigned |
| Repayment reserve cap (₹) | `POST /v1/tasks/{id}/revenue-mandate` | `reserve_cap_minor` |
| Repayment source (read-only) | same | Revenue mandate to `REVENUE_ESCROW`; it is the only repayment route the product has |
| Requested credit (₹) | `POST /v1/credit-applications` | `requested_minor` |
| Requested duration (hours) | same | `requested_duration_hours` |
| Owner exposure cap (₹) | same | `owner_exposure_cap_minor` |
| Approved vendors for this task | same | `proposed_vendor_ids[]` |
| Owner authorisation checkbox | — | Gates submission in the browser. It is not a stored consent record, and the form does not present it as one. |

### Rupees to paise

Every `(₹)` field above is read as a rupee string and converted exactly once, by
`rupeeInputToMinor` in `frontend/lib/format.ts`, at the point of submission.
Nothing downstream of that call sees a rupee value and nothing between it and
the wire does arithmetic on one. `null` from that function is a validation
error, never a zero.

### Expected completion date

The form asks for a **duration in hours**, not a completion date. The
application stores `requested_duration_hours`; there is no completion-date
column, and deriving one in the browser would have meant showing a timestamp the
server never agreed to.

## Evidence intake

Enforced in `credence/api/routes.py` and `credence/services/redaction.py`, so it
holds for every caller and not only for the browser.

- **Type** must be one of ten values (`EVIDENCE_TYPES`); anything else is a 422.
- **Size** is capped at 20 000 characters per entry, and at least 1.
- **Redaction** runs before the row is written and is destructive. It strips
  card numbers, GSTIN, PAN, IFSC, labelled account numbers, Aadhaar, e-mail and
  Indian mobile numbers, replacing each with `[REDACTED:KIND]`. The content hash
  is taken over the redacted text, so it hashes what is actually stored. The
  response lists which kinds were stripped and the form shows them.
- **Prompt-injection signatures** are detected, reported and stored — not
  rejected. Evidence is untrusted input by design: the model gateway wraps it in
  `<evidence>` tags, the analyst is instructed to treat embedded instructions as
  a concern, and the verifier re-checks every claim against evidence IDs
  regardless. The form warns the submitter that their text matched.
- **Tenant scope** is checked server-side: evidence against a task in another
  organization fails with `CROSS_TENANT_EVIDENCE`.

Pattern matching is a floor, not a guarantee. It will not catch a name, an
address, or an identifier in an unanticipated form, which is why the form says
to use synthetic material and ships synthetic templates for all ten types.

**File upload is not offered.** The endpoint takes text. A file picker that
posted the same text field would be a control that implies parsing, virus
scanning and content-type enforcement the service does not perform.

## Underwriting result

Route `/credit-applications/{id}`. *Run underwriting* posts to
`POST /v1/credit-applications/{id}/evaluate`. The panel then reads back, one row
each: requested amount, evidence retrieved, retrieval method, embedding and
reranking, analyst model, deterministic maximum and the cap that bound it,
policy decision, final decision, reason codes, audit receipt.

Two rows say something the brief assumed otherwise:

- **Embedding and reranking** renders as *not applicable*, with the reason. This
  service embeds nothing and ranks nothing. Evidence for an application is every
  record stored against its task, scoped to the tenant. There is no vector index
  and no reranker to report a status for.
- **Policy decision** shows the engine name **read from the stored decision
  record**. Policy is evaluated in-process (`engine = "local"`,
  `policy_version = "credence.credit/v1"`). An OPA sidecar is deployed but
  nothing calls it, so labelling this row "OPA" would be a claim about where
  enforcement lives that the record contradicts.

The model does not set the amount. `approved_limit_minor` is the smallest of
five caps — requested, remaining owner exposure, revenue advance, task cost,
policy — and the panel names which one bound.

## Vault, completion and repayment

Route `/vaults/{id}` → Repayment tab.

| Control | Endpoint | Body |
|---|---|---|
| Record partial repayment | `POST /v1/vaults/{id}/revenue` | `amount_minor`, `task_completed: false`, `external_event_id` |
| Record task complete & full repayment | same | `amount_minor` = outstanding, `task_completed: true`, `external_event_id` |
| Simulate task failure | `POST /v1/vaults/{id}/simulate-failure` | — |

There is **no separate task-completion endpoint**. Completion is the
`task_completed` flag on the revenue call, and that flag is what separates a
partial repayment from a full one. The panel says so rather than rendering a
button that would have to invent a route.

`external_event_id` is derived from the vault ID, the event count and the
amount, not randomised, so a double-click is the same idempotency key and not a
second repayment.

## Still not reachable from the browser

- `POST /v1/vaults/{id}/transactions/propose` and `.../execute`. Vendor payments
  out of a vault can only be created by a demo scenario or an authenticated API
  call. The vault page shows the resulting transactions and the controls that
  govern them; it cannot originate one.
- Vendor allowlist management. Vendors are platform-level and read-only in the
  UI (`GET /v1/vendors`); there is no create/disable control.
- Organization creation as an explicit act. The BFF provisions one per session.
- Policy parameter changes. `GET /v1/policy/parameters` is read-only, and the
  values are code, not configuration.

# End-to-end scenario results

The two audit briefs list 26 and 35 scenarios. The 35-item list is a strict
superset of the 26-item one, so this document runs the 35 and notes the subset
mapping where it matters.

**Verification method is stated per scenario, and it is not uniform.** Some
scenarios were driven in live Chrome against the deployed sandbox; some were
driven against the API directly (the briefs require bypassing frontend
validation for negative cases); some are covered only by the automated suite;
and some **could not be run because the component does not exist**. Marking
those last ones green would be the easy lie, so they are marked
`NOT_APPLICABLE` with the reason.

**Totals: 242 Python tests pass** (99 integration + security, 143 unit),
**51 frontend tests pass**, `tsc --noEmit` clean.

Legend:

| Method | Meaning |
|---|---|
| `CHROME` | Driven in live Chrome against the deployed sandbox |
| `API` | Driven against the deployed API directly, bypassing frontend validation |
| `AUTO` | Covered by the automated suite against the same code |
| `NOT_RUN` | Not exercised — no evidence either way |

| Result | Meaning |
|---|---|
| `PASS` | Behaved as specified |
| `PASS WITH LIMITATIONS` | Behaved as specified, with a stated caveat |
| `FAIL` | Did not behave as specified |
| `NOT_APPLICABLE` | The component is not deployed; there is nothing to test |

---

## Setup and lifecycle (1–11)

| # | Scenario | Method | Result | Evidence |
|---|---|---|---|---|
| 1 | Create organization | `CHROME` | `PASS` | The BFF auto-provisions a sandbox tenant per browser session into httpOnly cookies. `test_scenario_seeds_into_authenticated_tenant`. |
| 2 | Create strong agent | `CHROME` | `PASS` | Seeded via judge-demo scenario A. Six archetypes created. |
| 3 | Create Agent Passport | `AUTO` | `PASS` | Real Ed25519 issuance and verification. `tests/unit/test_passport.py`; 7 identity cases in the evaluation corpus. |
| 4 | Create task-backed credit request | `CHROME` | `PASS` | Scenario A. |
| 5 | Upload evidence | `CHROME` | `PASS` | Evidence corpus fixed by the scenario — see the `DEMO_SEED_ONLY` note below. |
| 6 | Successful underwriting | `CHROME` | `PASS` | Scenario A end-to-end; `test_scenario_a_happy_path`. |
| 7 | Reduced limit | `API` | `PASS` **after fixing D-10** | The browser path was **broken**: `REDUCE` was unreachable and a typed reduction silently granted the full cap. Now `test_a_misnamed_amount_field_is_refused_not_ignored` + 4 frontend cases. |
| 8 | Rejection | `CHROME` | `PASS` | Review drawer; `REJECT` carries notes and never an amount. |
| 9 | Human review | `CHROME` | `PASS` **after fixing D-5, D-7** | Review history rendered "Approve ₹0.00" (D-5); the summary double-counted resolved referrals (D-7). |
| 10 | Restricted vault creation | `CHROME` | `PASS` | Vendor allow-list, purpose code, caps, window. `test_vault_detail_shows_the_spending_controls`. |
| 11 | Approved vendor payment | `CHROME` | `PASS` | `test_allowlisted_vendor_is_bound_to_its_purpose` — the vendor is bound to its purpose, not merely present on a list. |

## Spend controls (12–16)

| # | Scenario | Method | Result | Evidence |
|---|---|---|---|---|
| 12 | Overspend blocked | `CHROME` + `AUTO` | `PASS` | Scenario B. `test_scenario_b_overspend_blocked`, `test_transaction_limit_denied`, `test_task_limit_with_prior_spend_denied`. |
| 13 | Unknown vendor blocked | `CHROME` + `AUTO` | `PASS` | Scenario C. `test_scenario_c_unapproved_vendor_blocked`, `test_vendor_not_allowed_denied`. |
| 14 | Split-payment attempt blocked | `CHROME` + `AUTO` | `PASS` | Scenario D — the vault **freezes**, it does not merely refuse. `test_scenario_d_split_payment_freezes_vault`. |
| 15 | Replay blocked | `API` | `PASS` | `test_replayed_proposal_is_idempotent_not_duplicated` and `test_direct_execution_of_denied_proposal_blocked` — a denied proposal cannot be executed by calling `/execute` directly. |
| 16 | Owner kill switch | `CHROME` + `AUTO` | `PASS` | Scenario E. `test_scenario_e_kill_switch`, `test_frozen_agent_cannot_spend_via_api` — enforced at the API, not only in the UI. |

## Task outcome and repayment (17–22)

| # | Scenario | Method | Result | Evidence |
|---|---|---|---|---|
| 17 | Task failure | `CHROME` | `PASS` | Scenario F. Bounded recovery, loss explicit. Independently recomputed: `100000 = 40000 + 0 + 25000 + 35000`. |
| 18 | Task completion | `CHROME` | `PASS` | Scenario A. |
| 19 | Revenue received | `CHROME` | `PASS` | Scenario A. |
| 20 | Full repayment | `CHROME` | `PASS` | Independently recomputed: `180000 = 100000 + 5000 + 0 + 75000`, zero residual. `docs/FINANCIAL_VERIFICATION.md`. |
| 21 | Partial repayment | `AUTO` | `PASS WITH LIMITATIONS` | The waterfall handles it and the property check covers it across 20 000 constructed cases. **No demo scenario produces a partial repayment**, so this was not observed on live data. |
| 22 | Duplicate repayment blocked | `API` | `PASS` | `test_revenue_event_replay_no_double_repayment`. The journal is idempotent by `idempotency_key`: a replay returns the existing transaction with **no new financial effect**. |

## Identity and isolation (23–25)

| # | Scenario | Method | Result | Evidence |
|---|---|---|---|---|
| 23 | Expired passport | `AUTO` | `PASS` | Rejected **for the correct reason code** `AUTHORIZATION_EXPIRED`, not merely rejected. `MUTATION_REASONS` pins one code per mutation. |
| 24 | Revoked agent | `AUTO` | `PASS` | `PASSPORT_REVOKED`; also `test_frozen_agent_denied`. |
| 25 | Cross-tenant access blocked | `API` | `PASS` | `test_cross_tenant_task_reference_rejected`, `test_tenant_isolation`, `test_agent_profile_is_tenant_scoped`, `test_script_is_tenant_scoped`. Also `test_every_read_endpoint_requires_auth`. |

## Evidence handling and model safety (26–30)

| # | Scenario | Method | Result | Evidence |
|---|---|---|---|---|
| 26 | Missing evidence | `AUTO` (live model) | `PASS` | `containment.no_evidence_yields_no_claims` — reporting missing evidence is successful containment. Ran against the deployed 24B. |
| 27 | Contradictory evidence | `AUTO` (live model) | `PASS` | `grounding.contradictory_evidence_stays_grounded` — two disagreeing figures must not produce an invented third. |
| 28 | Prompt injection | `CHROME` + `AUTO` | `PASS WITH LIMITATIONS` — **D-2 found here** | Injection is treated as data, flagged, and routed to a human. **But the deployed 24B raised the flag on 5 of 5 applications whose evidence was ordinary invoices**, writing `PROMPT_INJECTION_SUSPECTED` into immutable receipts. Now corroborated against a deterministic detector; an unconfirmed flag records as `..._UNCORROBORATED` and **still forces human review**. 8 tests. |
| 29 | Model unavailable | `CHROME` (observed live) | `PASS` | Observed for real on the cold GPU run at 05:28:29: `ReadTimeout`. The two model-backed metrics reported `not_evaluated` with `value: null` — **not 0** — and the composite score refused to compute. `test_a_model_outage_degrades_the_run_instead_of_scoring_zero`. |
| 30 | Malformed model JSON | `AUTO` | `PASS` | `test_malformed_output_is_not_retried` — malformed output is **not** retried (retrying a deterministic parse failure just burns the GPU). `test_http_5xx_fails_closed`. No automatic approval on model failure. |

## Dependency-failure scenarios (31–35)

These are where the honest answer diverges most from the brief's assumptions.

| # | Scenario | Method | Result | Evidence |
|---|---|---|---|---|
| 31 | Embedding / reranker unavailable | — | `NOT_APPLICABLE` | **No embedding model and no reranker are deployed.** There is no pgvector extension and no vector column (D-9). There is no component to make unavailable. |
| 32 | Guard / PII redactor unavailable | — | `NOT_APPLICABLE` | No separate guard or PII-redaction service is deployed. Redaction is inline in the response builders (`voice.py`, `routes.py`, `passport/schemas.py`) and cannot fail independently. `test_agent_profile_never_returns_credential_material`, `test_detail_json_carries_no_credential_material`, `test_status_enabled_never_echoes_the_key`. |
| 33 | Risk model unavailable | — | `NOT_APPLICABLE` | There is no separate risk model. Risk is the deterministic scorecard, in-process. `test_risk_status_must_pass` covers the policy input. |
| 34 | OPA unavailable | `API` | **`NOT_APPLICABLE` — and this is finding D-11** | An OPA sidecar **is deployed** beside the API, but **no request path calls it.** Policy enforcement is an in-process mirror of the Rego bundle; `PolicyDecision.engine == "local"`. `POLICY_ENGINE_UNAVAILABLE` exists as a reason code and is never raised. OPA cannot become "unavailable" to a caller that never calls it. See below. |
| 35 | Audit-write failure | `AUTO` | `PASS` | The chain detects tampering by every route tried: ORM mutation, raw SQL, and deletion. `test_orm_mutation_rejected`, `test_raw_sql_tampering_detected`, `test_deletion_detected`. |

---

## D-11 (new) — the site claimed OPA authorised every spend; nothing calls OPA

**Severity: Medium–High. False claim about a security control.** Same class as
D-9 (pgvector) and D-4 (`qwen3:8b`): a capability presented as running that is
not in the path.

**What is true.** `credence/services/vault_ops.py:252` calls
`evaluate_transaction_policy` — the in-process evaluator in
`credence/policy/engine.py` — and the `PolicyDecisionRecord` it writes carries
`engine="local"`, `policy_version="credence.credit/v1"`. The only reference to
`opa_url` anywhere in the codebase is a `/health` probe in
`system_intelligence.py:825`, for display.

**What was claimed.** The public site said, in six places, that Open Policy
Agent authorises each spend — including *"Every spend attempt is authorised by
Open Policy Agent before it can settle."* `engine.py`'s own docstring said the
authoritative runtime path called OPA over HTTP and that the local evaluator was
a degraded-profile fallback selected only in `LOCAL_DEV`. The sandbox runs
`CREDENCE_RUN_MODE=GCP_COST` and the local evaluator is the only one that ever
runs.

Two further claims were unsupported for the same reason:
*"Fall back to a local guess when the policy engine is unreachable"* (listed
under **Never**) and *"If the policy engine is unreachable the call refuses"* —
both describe the failure handling of a remote call the system does not make.

**The enforcement itself is real and is not weakened by this.** The rules are a
versioned Rego rule set, the input document has OPA's shape, missing or
malformed input denies, and eleven policy unit tests cover it including
`test_empty_input_denies_everything` and `test_model_cannot_inject_policy_override`.
What was wrong was the name on the enforcer.

**Fix.** Six site strings now name the evaluator that runs; the two
unreachability claims are replaced with the deny-by-default rule that is
actually implemented and testable; `engine.py`'s docstring records what runs and
why the old text was wrong.

**Regression test:** `test_the_recorded_policy_engine_is_the_one_that_actually_ran`
pins `engine == "local"` and the policy version, so any future claim that OPA
enforced a spend has to change this test first.

---

## Coverage caveats

Stated plainly rather than buried:

- **Scenario 21 (partial repayment) was never observed on live data.** No demo
  scenario produces one. The arithmetic is covered by construction across
  20 000 randomised cases, which is not the same thing as having watched it
  happen.
- **Scenarios 31–33 are not testable because the components do not exist.**
  They are `NOT_APPLICABLE`, not `PASS`.
- **Scenario 34 is `NOT_APPLICABLE` for a worse reason** — a control that was
  advertised turned out not to be in the path at all.
- **The evidence corpus is `DEMO_SEED_ONLY`.** Only 5 of 22 API write endpoints
  are reachable from the browser; every agent, task, evidence item, application,
  vault and repayment comes from a demo scenario. See
  `docs/DATA_INPUT_MAP.md`.
- **The deployed site predates every fix listed here.** All fixes are in the
  working tree. See `docs/DEPLOYMENT_INVENTORY.md`.

## Overall verdict

**PASS WITH LIMITATIONS.**

Of 35 scenarios: **30 PASS** (4 of them after a defect was found and fixed),
**1 PASS WITH LIMITATIONS** on the arithmetic-only partial repayment,
**4 NOT_APPLICABLE** because the component is not deployed, **0 FAIL**.

Three defects were found by running these scenarios rather than by reading code
— D-10, D-2 and D-11 — and D-10 was a critical financial control that let a
reviewer grant more than they typed while the UI reported success.

Nothing here supports a claim of "100% accurate", "zero hallucinations", "fully
secure", "production ready", or "guaranteed repayment", and none is made.

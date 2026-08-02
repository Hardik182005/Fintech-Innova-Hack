# CREDENCEAI — FINAL CLAUDE CHROME TESTING, SYNTHETIC DATA, ACCURACY & EVIDENCE AUDIT

Antigravity has completed Stage 1 and Stage 2. You are now the final verification and defect-fixing agent.

Work against the **live deployed CredenceAI website** and the same repository. Use Chrome DevTools MCP or Playwright for browser evidence. You may fix verified defects and redeploy existing services, but do not create new infrastructure, add another GPU, or change the approved architecture without explicit approval.

Use only synthetic organizations, agents, tasks, evidence, vendors, transactions, and test credits.

## 1. Truth-first deployment inventory

Before testing, verify the live environment from Terraform state, Cloud Run configuration, `/version`, `/readyz`, logs, and model manifests.

Record what is actually deployed:

- primary GPU model and exact digest;
- whether Mistral Small 3.2 24B is genuinely loaded and serving;
- Gemma 4 12B, only if actually deployed;
- Qwen3 1.7B fallback, only if actually deployed;
- Qwen3-Embedding-0.6B;
- Qwen3-Reranker-0.6B;
- Qwen3Guard-Gen-0.6B;
- Microsoft Presidio;
- logistic-regression baseline;
- XGBoost or LightGBM challenger;
- PostgreSQL/pgvector;
- OPA;
- deterministic financial engine.

Do not infer or invent a model because it appeared in an old prompt. Mark each component as:

`DEPLOYED_AND_TESTED`, `DEPLOYED_NOT_TESTED`, `NOT_DEPLOYED`, or `UNAVAILABLE`.

Do not claim a model, accuracy score, endpoint, screenshot, cost, credit offset, or test result without direct evidence.

## 2. Create repeatable synthetic demo data

Create an idempotent seed/reset workflow for:

- one synthetic organization;
- strong agent;
- new agent;
- risky repayment agent;
- suspicious split-payment agent;
- expired agent;
- revoked agent;
- approved and blocked vendors;
- successful and failed tasks;
- complete, missing, contradictory, and malicious evidence;
- full, partial, duplicate, and failed repayments;
- audit and risk events.

Ensure repeated seeding does not duplicate data.

## 3. Verify the original architecture requirements

Test all of these, not only the GPU model:

- Agent Passport checks: issuer, audience, validity window, revocation, scope, nonce;
- task-backed credit request;
- evidence contract and evidence IDs;
- tenant/date/authorization SQL filtering before semantic retrieval;
- pgvector retrieval;
- embedding retrieval;
- reranking;
- evidence compression/minimum necessary context;
- prompt-injection and PII guard layer;
- local generative analysis;
- evidence-ID validation after generation;
- calibrated risk model and deterministic scorecard fallback;
- OPA policy decision;
- human-review path;
- restricted task vault;
- allowlisted vendors;
- transaction/task limits;
- split-payment and replay detection;
- owner kill switch;
- task-failure containment;
- exact repayment waterfall;
- tamper-evident audit chain;
- fail-closed behavior.

The LLM must never approve credit, calculate authoritative balances, release funds, change limits/policy/vendors, redirect repayment, or access financial credentials.

## 4. Test the full live website in Chrome

Visit and test every implemented route, including:

- Dashboard
- Agents and Agent Passport
- Credit Applications and details
- Underwriting
- Vaults and details
- Transactions
- Repayments
- Risk
- Audit
- System Intelligence
- Judge Demo
- Settings
- Developer Console

For every page verify:

- real API-backed data;
- loading, empty, success, validation, and error states;
- navigation, buttons, forms, filters, tables, modals, downloads;
- desktop, tablet, and mobile layouts;
- no dead controls;
- no browser console errors;
- no unexpected 4xx/5xx calls;
- no credentials, tokens, internal traces, or chain-of-thought;
- no fake/hardcoded production metrics;
- consistent typography, intended web font loading, readable fallbacks, icons, spacing, contrast, and no broken assets;
- multilingual rendering where implemented.

Do not mark a page passed from code inspection alone.

## 5. Run complete Chrome scenarios

Run and capture evidence for:

1. successful task-backed credit;
2. reduced limit;
3. rejection;
4. human review;
5. overspend blocked;
6. unknown vendor blocked;
7. split-payment attempt blocked;
8. replay blocked;
9. owner kill switch;
10. task failure;
11. full repayment;
12. partial repayment;
13. duplicate repayment;
14. expired passport;
15. revoked agent;
16. cross-tenant access;
17. missing evidence;
18. contradictory evidence;
19. prompt injection;
20. model unavailable;
21. malformed model JSON;
22. embedding/reranker unavailable;
23. guard/PII redactor unavailable;
24. risk model unavailable;
25. OPA unavailable;
26. audit-write failure.

Bypass frontend validation for negative API tests. Backend controls must still block the action.

## 6. Verify financial correctness independently

Recompute and compare:

- requested amount;
- AI recommendation;
- calibrated risk probability;
- deterministic maximum;
- policy maximum;
- final approved amount;
- utilized and remaining vault balance;
- principal;
- credit fee;
- platform fee;
- owner proceeds;
- prevented exposure.

Use integer minor units or `Decimal` only.

Verify double-entry balance and this exact invariant:

```text
Incoming task revenue
= principal recovered
+ credit fee
+ platform fee
+ owner proceeds
```

Any mismatch is a failure, not a rounding note.

## 7. Measure retrieval, model, risk, and safety accuracy

Use a versioned labeled synthetic evaluation dataset. Report formula, numerator, denominator, sample size, failed cases, model version, dataset version, and timestamp for:

- Agent Passport verification accuracy;
- Retrieval Recall@20;
- Reranker Precision@5;
- MRR@5 or nDCG@5;
- evidence citation precision and recall;
- supported-claim precision;
- evidence-grounding rate;
- hallucination-containment rate;
- structured-output validity;
- prompt-injection block rate;
- PII-redaction accuracy;
- cross-tenant evidence block rate;
- risk-model discrimination/calibration metrics appropriate to the synthetic dataset;
- deterministic/model decision agreement;
- adversarial policy block rate;
- repayment invariant pass rate;
- end-to-end pipeline success rate;
- human escalation rate;
- model fallback rate.

Label all risk-model results based on synthetic data as **simulation metrics**, not real-world default prediction.

Never claim “zero hallucinations,” “100% accurate,” “fully secure,” “production-ready,” or “guaranteed repayment” unless narrowly defined and directly proven. Prefer exact statements such as “passed 23/24 curated cases.”

## 8. Validate System Intelligence

Confirm it displays real, traceable values for:

- model names, versions, and digests;
- embedding, reranker, and guard versions;
- GPU availability and OOM count;
- cold start, model load, TTFT, tokens/sec, p50/p95 latency;
- retrieval and reranking latency;
- schema validity and grounding;
- unsupported claims and injection blocks;
- PII redactions;
- deterministic engine and OPA outcomes;
- policy blocks and prevented exposure;
- repayment integrity;
- audit health;
- external LLM, embedding, reranking, and voice API calls;
- estimated inference cost;
- last success/failure and fail-closed events.

Distinguish `0`, `UNAVAILABLE`, `NOT_EVALUATED`, `INSUFFICIENT_SAMPLE`, and `ERROR`.

## 9. Fix, retest, and collect evidence

For each defect:

1. assign ID and severity;
2. record Chrome/API reproduction steps;
3. identify root cause;
4. make the smallest safe fix;
5. add a regression test;
6. redeploy only the affected existing service;
7. retest the original and adjacent flows.

Do not weaken security, policy, money, tenant, or audit controls to pass tests.

Save redacted:

- screenshots of all major pages;
- happy-path and blocked-attack evidence;
- repayment waterfall;
- System Intelligence;
- browser console/network logs;
- Playwright traces;
- API test output.

## 10. GPU and cost safety

During tests:

- maximum GPU instances remains `1`;
- do not load two large models simultaneously;
- keep the active benchmark bounded;
- after testing, confirm minimum GPU instances is `0`;
- stop benchmark traffic;
- report active GPU duration and estimated cost;
- report promotional-credit application only if visible in billing evidence.

## 11. Final reports

Create:

```text
docs/FINAL_DEPLOYMENT_INVENTORY.md
docs/FINAL_CHROME_TEST_REPORT.md
docs/FINAL_AI_RETRIEVAL_ACCURACY_REPORT.md
docs/FINAL_RISK_MODEL_SIMULATION_REPORT.md
docs/FINAL_FINANCIAL_LOGIC_REPORT.md
docs/FINAL_SECURITY_REPORT.md
docs/FINAL_FEATURE_COVERAGE_MATRIX.md
docs/FINAL_JUDGE_DEMO_RUNBOOK.md
docs/FINAL_KNOWN_LIMITATIONS.md
artifacts/final-e2e/
```

## Final response

Return:

1. `PASS`, `PASS WITH LIMITATIONS`, or `FAIL`;
2. deployed URL and commit SHA;
3. actual deployed model/component inventory;
4. pages and Chrome scenarios tested;
5. passed/failed/skipped counts;
6. retrieval, grounding, hallucination-containment, safety, and simulation metrics with sample sizes;
7. financial and repayment-invariant result;
8. security result;
9. defects found/fixed;
10. remaining limitations;
11. report/evidence paths;
12. confirmation that only synthetic data/test credits were used;
13. confirmation GPU minimum instances is `0`.

Completion requires live Chrome evidence, API evidence, model/runtime evidence, financial recomputation, and honest reports. Code inspection or unit tests alone are insufficient.

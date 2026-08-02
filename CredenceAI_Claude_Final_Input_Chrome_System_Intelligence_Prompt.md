# CREDENCEAI — FINAL CLAUDE LIVE INPUT, CHROME TESTING, MODEL METRICS & SYSTEM INTELLIGENCE AUDIT

Antigravity has completed the GCP deployment. You are now the final product-verification and defect-fixing agent.

Use the live public application:

```text
https://credence-web-ppmafqinnq-as.a.run.app
```

Use the repository already connected to this deployment. Use Chrome DevTools MCP or Playwright for browser testing.

You may fix verified defects and redeploy existing services. Do not create new infrastructure, add another GPU, make private services public, or change the approved architecture without explicit approval.

Use synthetic data for testing. Do not use real personal, banking, card, health, or customer data.

---

# 1. First answer the most important product question: where does a user enter data?

The Overview dashboard is read-only. Verify and document the actual input path for:

1. creating an organization;
2. registering an autonomous agent;
3. creating or verifying an Agent Passport;
4. creating a task;
5. submitting a credit application;
6. uploading or entering evidence;
7. adding approved vendors;
8. recording transactions;
9. recording task completion and revenue;
10. recording repayments;
11. triggering underwriting;
12. placing a case into human review.

Inspect the live UI and determine whether these actions are available through:

- `AI Agents`;
- `Credit Applications`;
- `Underwriting`;
- `Developer Lab`;
- authenticated API;
- CSV/JSON import;
- seed/demo controls.

Do not assume an input workflow exists because the dashboard contains data.

For every required input, classify it as:

```text
AVAILABLE_IN_UI
AVAILABLE_VIA_AUTHENTICATED_API
DEMO_SEED_ONLY
MISSING
BROKEN
```

Create:

```text
docs/FINAL_DATA_INPUT_MAP.md
```

Include:

- page or endpoint;
- button/form name;
- required fields;
- validation;
- who is allowed to use it;
- resulting database records;
- downstream workflow triggered;
- screenshot/evidence path.

---

# 2. Build or repair the minimum complete input workflow

If any core input is missing, create the smallest safe production-style workflow needed for a judge or operator to use the system.

At minimum, the live UI should support:

## A. New Agent

Required fields:

- organization;
- agent name;
- agent type;
- owner/principal;
- purpose;
- permitted task scope;
- authorization start and expiry;
- permitted vendors or vendor category;
- maximum task amount;
- optional external agent ID.

Expected result:

- agent record created;
- Agent Passport generated or placed into pending verification;
- audit event created.

## B. New Credit Application

Required fields:

- agent;
- task title and description;
- requested amount in INR;
- expected revenue;
- expected completion date;
- vendor or vendor category;
- evidence;
- repayment source;
- owner authorization.

Expected result:

- application created;
- evidence stored;
- retrieval and underwriting pipeline triggered;
- deterministic and OPA result produced;
- final result shown as approve, reduce, reject, or human review.

## C. Evidence Entry

Support safe entry or upload for synthetic:

- task records;
- prior task outcomes;
- repayment history;
- authorization documents;
- vendor records;
- spending history;
- risk events.

Requirements:

- tenant-scoped;
- typed evidence;
- source and timestamp;
- evidence ID;
- validation;
- upload-size/type restrictions;
- PII redaction before inference;
- no executable files;
- no cross-tenant evidence.

## D. Approved Vendors

Support:

- vendor name;
- category;
- allowlist status;
- per-transaction cap;
- task restriction;
- active/disabled status.

## E. Task Completion and Repayment

Support synthetic:

- task-completed event;
- revenue-received amount;
- repayment event;
- partial repayment;
- duplicate-event prevention;
- final reconciliation.

Do not create fake buttons. Every action must call a real authenticated backend endpoint and persist correctly.

---

# 3. Define the real-data path without using real data now

Document how a future production customer would input real data.

Create:

```text
docs/REAL_DATA_ONBOARDING_DESIGN.md
```

The design must include:

- organization onboarding;
- user roles and permissions;
- agent registration;
- Agent Passport issuance;
- API keys or OAuth without downloadable GCP service-account keys;
- authenticated REST API;
- optional CSV/JSON batch import;
- webhook/event ingestion;
- evidence validation;
- tenant isolation;
- encryption;
- PII minimization and redaction;
- audit logging;
- approval and human-review process;
- idempotency;
- data-retention and deletion controls.

Do not connect real customer systems during this task.

Clearly separate:

```text
Demo/synthetic entry
Production customer onboarding
Production API integration
```

---

# 4. Verify the live deployment truthfully

Verify from live configuration, Terraform state, `/version`, `/readyz`, logs, and model manifests:

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
- PostgreSQL `pgvector`;
- OPA;
- deterministic financial engine.

Classify each component:

```text
DEPLOYED_AND_TESTED
DEPLOYED_NOT_TESTED
NOT_DEPLOYED
UNAVAILABLE
```

Do not infer a model from an old prompt. Do not invent a model digest, metric, service, or accuracy score.

Create:

```text
docs/FINAL_DEPLOYMENT_INVENTORY.md
```

---

# 5. Create repeatable synthetic examples

Create an idempotent seed/reset workflow with:

## Organization

```text
Synthetic Commerce Labs Pvt Ltd
```

## Agents

1. Strong agent — high task success and clean repayment
2. New agent — limited history
3. Risky agent — prior repayment failure
4. Suspicious agent — unknown vendor and split-payment behavior
5. Expired agent — authorization expired
6. Revoked agent — access revoked

## Additional synthetic data

- tasks;
- task outcomes;
- evidence;
- approved and blocked vendors;
- credit applications;
- risk events;
- transactions;
- full, partial, duplicate, and failed repayments;
- audit events.

Repeated seeding must not create duplicates.

Provide a safe reset mechanism that affects synthetic demo data only.

---

# 6. Test every live page in Chrome

Test all implemented routes and navigation items, including:

- Overview/Dashboard
- AI Agents
- Agent Passport
- Credit Applications
- Application Details
- Underwriting
- Credit Vaults
- Vault Details
- Transactions
- Repayments
- Risk Monitoring
- Audit Trail
- System Intelligence
- Judge Demo
- Settings
- Developer Lab/Developer Console

For every page verify:

- real API-backed content;
- loading state;
- empty state;
- validation state;
- success state;
- error state;
- desktop, tablet, and mobile layout;
- no dead buttons;
- no broken forms;
- no JavaScript errors;
- no unexpected 4xx/5xx calls;
- no exposed token, secret, cookie, internal prompt, or chain-of-thought;
- no hardcoded production metrics;
- correct INR formatting;
- intended web font loads;
- safe fallback font;
- icons and assets load;
- readable spacing, contrast, and alignment.

Do not pass a page based on code inspection alone.

---

# 7. Run complete end-to-end scenarios in Chrome

Run and capture evidence for:

1. create organization;
2. create strong agent;
3. create Agent Passport;
4. create task-backed credit request;
5. upload evidence;
6. successful underwriting;
7. reduced limit;
8. rejection;
9. human review;
10. restricted vault creation;
11. approved vendor payment;
12. overspend blocked;
13. unknown vendor blocked;
14. split-payment attempt blocked;
15. replay blocked;
16. owner kill switch;
17. task failure;
18. task completion;
19. revenue received;
20. full repayment;
21. partial repayment;
22. duplicate repayment blocked;
23. expired passport;
24. revoked agent;
25. cross-tenant access blocked;
26. missing evidence;
27. contradictory evidence;
28. prompt injection;
29. model unavailable;
30. malformed model JSON;
31. embedding/reranker unavailable;
32. guard or PII redactor unavailable;
33. risk model unavailable;
34. OPA unavailable;
35. audit-write failure.

For negative scenarios, bypass frontend validation and test the backend directly.

---

# 8. Verify financial correctness independently

Recalculate:

- requested amount;
- AI recommendation;
- calibrated risk probability;
- deterministic maximum;
- policy maximum;
- final approved amount;
- utilized amount;
- remaining vault balance;
- principal;
- credit fee;
- platform fee;
- owner proceeds;
- prevented exposure.

Use integer minor units or `Decimal` only.

Verify:

```text
Incoming task revenue
= principal recovered
+ credit fee
+ platform fee
+ owner proceeds
```

Also verify:

- double-entry ledger remains balanced;
- no negative balance;
- no duplicate settlement;
- no final approval above the lowest hard limit;
- no floating-point authoritative money.

Any mismatch is a failure.

---

# 9. Measure retrieval, model, risk, and safety quality

Use a versioned labeled synthetic evaluation set.

Report formula, numerator, denominator, sample size, failed cases, model version, dataset version, and timestamp for:

- Agent Passport verification accuracy;
- Retrieval Recall@20;
- Reranker Precision@5;
- MRR@5 or nDCG@5;
- evidence citation precision;
- evidence citation recall;
- supported-claim precision;
- evidence-grounding rate;
- hallucination-containment rate;
- structured-output validity;
- prompt-injection block rate;
- PII-redaction precision/recall where labels support it;
- cross-tenant evidence block rate;
- deterministic/model decision agreement;
- adversarial policy block rate;
- repayment invariant pass rate;
- end-to-end pipeline success rate;
- human-escalation rate;
- model fallback rate.

For the logistic/XGBoost/LightGBM model, report only simulation metrics based on synthetic data.

Do not claim real-world default-prediction accuracy from synthetic data.

Do not write:

```text
100% accurate
zero hallucinations
fully secure
production ready
guaranteed repayment
```

unless narrowly scoped and directly demonstrated.

---

# 10. System Intelligence must show the full model and control stack

The live System Intelligence page must clearly show all deployed components and real metrics.

## A. Model Inventory

Show:

- primary generative model;
- exact model tag;
- digest/checksum;
- quantization;
- serving runtime;
- GPU type;
- context limit;
- max output;
- fallback model;
- embedding model;
- reranker model;
- guard model;
- Presidio version;
- risk-model version;
- OPA policy-bundle version;
- deterministic-engine version;
- application commit SHA.

## B. GPU and Inference Metrics

Show:

- service health;
- GPU availability;
- minimum and maximum instances;
- cold starts;
- model-load time;
- readiness time;
- time to first token;
- tokens per second;
- p50 latency;
- p95 latency;
- input/output tokens;
- peak VRAM;
- OOM count;
- queue depth;
- retry rate;
- circuit-breaker state;
- last successful request;
- last failed request.

## C. Retrieval Metrics

Show:

- retrieval request count;
- embedding model/version;
- reranker model/version;
- average records considered;
- average records reranked;
- retrieval latency;
- reranking latency;
- Recall@20;
- Precision@5;
- MRR/nDCG;
- cross-tenant evidence blocks;
- retrieval failures.

## D. Grounding and Safety Metrics

Show:

- schema-validity rate;
- evidence-grounding rate;
- supported-claim precision;
- unsupported-claim count;
- hallucination-containment rate;
- prompt-injection blocks;
- PII detections;
- PII redactions;
- guard-model blocks;
- malformed-output count;
- fallback/human-review rate.

## E. Deterministic and Policy Metrics

Show:

- applications processed;
- approve/reduce/reject/review counts;
- deterministic/model disagreement;
- OPA allow/deny counts;
- policy blocks by reason;
- prevented exposure;
- split-payment blocks;
- replay blocks;
- kill-switch events;
- fail-closed events.

## F. Financial Metrics

Show:

- approved exposure;
- utilized exposure;
- outstanding principal;
- principal repaid;
- credit fees;
- platform fees;
- owner proceeds;
- repayment invariant result;
- ledger balance status;
- duplicate repayment blocks.

## G. Privacy and External Services

Show actual counts for:

- external LLM API calls;
- external embedding API calls;
- external reranking API calls;
- external voice API calls;
- records redacted before inference.

Do not hardcode zero.

## H. Cost and Deployment

Show:

- active model;
- active revision;
- estimated active GPU duration;
- estimated inference cost;
- promotional-credit status only when billing evidence exists;
- last deployment;
- commit SHA;
- region;
- Cloud Run service health;
- Cloud SQL health;
- OPA health;
- audit health.

For every metric distinguish:

```text
0
UNAVAILABLE
NOT_EVALUATED
INSUFFICIENT_SAMPLE
ERROR
```

Never display unavailable data as zero.

Every System Intelligence card must have a traceable backend source. No fabricated demo metrics.

---

# 11. Fix defects and retest

For each defect:

1. assign ID and severity;
2. document reproduction;
3. identify root cause;
4. make the smallest safe fix;
5. add a regression test;
6. redeploy only the affected existing service;
7. retest original and adjacent flows.

Do not weaken security, policy, money, tenant, or audit controls.

---

# 12. Capture evidence

Save redacted:

- screenshots of all major pages;
- data-entry forms;
- successful application;
- reduced/rejected/review decisions;
- blocked attacks;
- repayment waterfall;
- System Intelligence sections;
- browser console logs;
- network evidence;
- Playwright traces;
- API test results.

Do not capture or expose secrets, tokens, cookies, identity tokens, or private credentials.

---

# 13. GPU and cost safety

During final testing:

- maximum GPU instances remains `1`;
- do not load two large models simultaneously;
- keep benchmarks bounded;
- stop benchmark traffic afterward;
- confirm minimum GPU instances is `0`;
- report active GPU test duration and estimated cost;
- report credit offset only when visible in billing evidence.

---

# 14. Final reports

Create:

```text
docs/FINAL_DATA_INPUT_MAP.md
docs/REAL_DATA_ONBOARDING_DESIGN.md
docs/FINAL_DEPLOYMENT_INVENTORY.md
docs/FINAL_CHROME_TEST_REPORT.md
docs/FINAL_AI_RETRIEVAL_ACCURACY_REPORT.md
docs/FINAL_RISK_MODEL_SIMULATION_REPORT.md
docs/FINAL_FINANCIAL_LOGIC_REPORT.md
docs/FINAL_SYSTEM_INTELLIGENCE_AUDIT.md
docs/FINAL_SECURITY_REPORT.md
docs/FINAL_FEATURE_COVERAGE_MATRIX.md
docs/FINAL_JUDGE_DEMO_RUNBOOK.md
docs/FINAL_KNOWN_LIMITATIONS.md
artifacts/final-e2e/
```

---

# 15. Final response

Return:

1. `PASS`, `PASS WITH LIMITATIONS`, or `FAIL`;
2. deployed URL and commit SHA;
3. exact place where a user enters each type of data;
4. actual deployed model/component inventory;
5. pages and Chrome scenarios tested;
6. passed/failed/skipped counts;
7. retrieval, grounding, hallucination-containment, safety, and simulation metrics with sample sizes;
8. financial and repayment-invariant result;
9. System Intelligence completeness result;
10. security result;
11. defects found and fixed;
12. remaining limitations;
13. report and evidence paths;
14. confirmation only synthetic data/test credits were used;
15. confirmation GPU minimum instances is `0`.

Completion requires live Chrome evidence, API evidence, actual model/runtime evidence, financial recomputation, and honest metrics. Code inspection and unit tests alone are insufficient.

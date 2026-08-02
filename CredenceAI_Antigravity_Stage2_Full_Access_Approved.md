# CredenceAI — Antigravity Stage 2 Full-Access GPU Deployment Approval

## Authority

You are the primary GPU/MLOps, testing, Terraform, Git, security, and Google Cloud deployment agent for CredenceAI.

This message is direct user authorization for **Stage 2 private GPU inference deployment and integration**. This is not a read-only task.

You are authorized to:

- modify repository code and Terraform inside `E:\Innovahack\Fintech-Innova-Hack`;
- run terminal, Docker, Terraform, gcloud, tests, benchmarks, security scans, and browser automation;
- create and modify only the approved Stage 2 GCP resources;
- apply the reviewed Stage 2 Terraform plan;
- deploy one private Cloud Run NVIDIA L4 service;
- integrate the local model with the deployed API;
- run controlled synthetic GPU benchmarks and end-to-end tests;
- commit and push verified changes to `main`.

Do not ask for another routine approval before creating the approved Stage 2 resources.

Stop only for a repository/account/project mismatch, incomplete billing verification, failed Stage 1, unexpected destructive plan, critical security defect, unavailable GPU quota/capacity, promotional-credit concern, or a resource outside this scope.

## Hard boundary

```text
Repository: E:\Innovahack\Fintech-Innova-Hack
Project ID: innova-hack
Project number: 625136990338
Expected principal: rajeshinduja2015@gmail.com
Region: asia-southeast1
Environment: sandbox
Data: synthetic only
Money: synthetic test credits only
Maximum GPU count: 1
```

Never:

- touch another project;
- delete Stage 1 data or Terraform state;
- run `terraform destroy`;
- create more than one GPU;
- use Spot, GKE, Compute Engine GPU, A100, H100, or H200;
- expose inference publicly;
- create service-account key files;
- grant broad IAM;
- let the LLM approve, sign, or move money;
- leave GPU minimum instances above zero after testing;
- run an unbounded benchmark;
- alter files outside the repository.

---

# 1. Preconditions

Before any mutation verify:

1. Current directory is the intended repository.
2. Active branch is `main`.
3. Active gcloud account is `rajeshinduja2015@gmail.com`.
4. Active project is `innova-hack`.
5. Project number is `625136990338`.
6. Billing is linked/open and identity verification is complete.
7. Promotional credit remains visible.
8. Stage 1 deployment report exists.
9. `credence-web` is healthy.
10. `credence-api` is healthy.
11. Cloud SQL private connectivity works.
12. Migrations completed.
13. OPA tests pass.
14. Deterministic credit tests pass.
15. Repayment invariants pass.
16. Tenant isolation passes.
17. Audit-chain verification passes.
18. No critical/high security issue remains.
19. No existing unapproved GPU exists.
20. Stage 1 Terraform state is healthy.

If Stage 1 is not healthy, repair only necessary non-destructive Stage 1 defects or stop and report.

---

# 2. Primary model

Deploy the current default:

```text
Model: Gemma 4 12B instruction-tuned quantized model
Preferred tag: gemma4:12b-it-qat, or the exact verified supported tag
Role: task analysis, evidence comparison, underwriting recommendation,
      risk criticism, and multilingual redacted explanation
Serving: Ollama unless the repository has a verified safer serving stack
```

Pin and record:

- exact model tag;
- model digest/checksum;
- quantization;
- package size;
- license;
- runtime version;
- container image digest;
- application commit SHA.

Do not deploy mutable `latest`.

## Optional legacy comparison

`mistral-small3.2:24b-instruct-2506-q4_K_M` may be benchmarked only when:

- it is already integrated or easy to load safely;
- the comparison uses the same single L4;
- no extra GPU is created;
- the comparison is time-bounded;
- it does not delay deployment;
- it is clearly labeled legacy/deprecated.

Do not select a deprecated model solely because it has more parameters.

## CPU fallback

Qwen3 1.7B may remain an optional CPU helper for extraction or human-review assistance.

It must never:

- auto-approve;
- release funds;
- override deterministic limits;
- override OPA;
- redirect repayment.

On primary-model failure return:

```text
AI_ANALYSIS_UNAVAILABLE
or
HUMAN_REVIEW_REQUIRED
```

No automatic approval.

---

# 3. Cloud Run GPU configuration

Deploy exactly one private service:

```text
Service: credence-inference
Region: asia-southeast1
GPU: 1 × NVIDIA L4
CPU: 8 vCPU
Memory: 32 GiB
Minimum instances: 0 normally
Maximum instances: 1
Concurrency: 1 initially
Timeout: at most 600 seconds
Billing: instance-based
GPU zonal redundancy: disabled for sandbox cost control
Unauthenticated access: disabled
```

Do not create a scheduled minimum instance.

Only `credence-api-sa` may invoke this service.

Expected path:

```text
Browser
→ credence-web
→ private credence-api
→ IAM-authenticated private credence-inference
```

The browser must never invoke inference directly.

---

# 4. IAM and service identity

Create or use:

```text
credence-inference-sa
```

Grant only:

- read access to the private pinned model artifact when required;
- logging writer;
- metrics writer;
- minimum runtime/Artifact Registry access.

Do not grant:

- Cloud SQL/database access;
- billing admin;
- wallet/payment permissions;
- unrelated Secret Manager access;
- project Editor/Owner;
- service-account key creation.

Grant Cloud Run Invoker on inference only to `credence-api-sa` and required deployment/test principals.

Verify:

- unauthenticated request fails;
- frontend-direct request fails;
- unapproved identity fails;
- API service account succeeds.

---

# 5. Inference container and model artifact

Requirements:

- pinned inference runtime;
- NVIDIA GPU support verified;
- non-root runtime where practical;
- immutable image digest;
- vulnerability scan;
- no embedded secrets;
- no public Ollama port;
- wrapper is the only service listener;
- request size limits;
- strict Pydantic/JSON schema;
- bounded context/output;
- checksum verification;
- safe redacted logs.

Evaluate:

### Option A
Bake the pinned model into the image.

### Option B
Store it in private GCS and load during startup with checksum validation.

Choose from measured:

- deployment reliability;
- cold-start time;
- image constraints;
- startup network transfer;
- reproducibility;
- security;
- cost.

Do not pull an unpinned public model on every cold start.

---

# 6. Health and readiness

Implement:

```text
/healthz
/readyz
/version
```

`/readyz` succeeds only when:

1. GPU is visible.
2. Exact model digest is present.
3. Model is loaded.
4. Structured warm-up inference succeeds.
5. JSON schema validates.
6. No OOM occurred.
7. GPU execution is confirmed.
8. Latency is within the documented sandbox threshold.

Do not report ready merely because the process or Ollama port is open.

`/version` may expose only non-sensitive:

- app version;
- commit SHA;
- model;
- digest;
- quantization;
- container digest;
- schema version.

---

# 7. Initial inference controls

Use:

```text
Context: 8K
Maximum output: 1,024 tokens
Concurrency: 1
Temperature: low
Streaming: enabled only where safe
Structured output: mandatory
Reasoning/thinking: bounded
```

Increase context only after measuring VRAM and latency.

Do not advertise maximum context without testing.

Required structured output example:

```json
{
  "recommendation": "REDUCE_LIMIT",
  "suggested_limit_minor": 100000,
  "risk_tier": "MEDIUM",
  "evidence_ids": ["repayment_14", "task_31", "authorization_08"],
  "risk_factors": [
    {"code": "LIMITED_HISTORY", "severity": "MEDIUM"}
  ],
  "missing_evidence": [],
  "explanation": "Verified history supports a smaller task-specific limit."
}
```

Rules:

- amounts use integer minor units;
- material claims require valid evidence IDs;
- evidence must belong to the current tenant;
- unsupported claims fail validation;
- malformed JSON is rejected;
- hidden chain-of-thought is not requested or stored;
- concise structured rationale only.

---

# 8. Financial authority stays outside the model

The deterministic backend must calculate:

- owner-authorized maximum;
- available exposure;
- repayment probability;
- expected loss;
- safe credit limit;
- fees;
- outstanding principal;
- vault utilization;
- repayment waterfall;
- final decision ceiling.

OPA enforces:

- identity and tenant;
- expiry and revocation;
- vendor allowlist;
- transaction/task limits;
- velocity and split payment;
- replay protection;
- kill switch;
- fail-closed controls.

The model cannot call:

```text
approveLoan
releaseFunds
changeCreditLimit
addVendor
signTransaction
redirectRepayment
reactivateAgent
```

The model advises only.

---

# 9. Private inference adapter

Implement or verify an API-side adapter that:

- obtains Google OIDC identity tokens;
- uses the inference URL as audience;
- applies strict connect/read timeouts;
- performs at most one safe retry;
- uses a circuit breaker;
- validates JSON schema;
- validates evidence IDs and tenant;
- redacts PII before inference;
- sends no secrets;
- records latency, tokens, model version, and correlation ID;
- returns controlled failure states;
- never parses arbitrary free-form output.

No inference credential or endpoint secret may be exposed to the browser.

---

# 10. Privacy and external services

All underwriting inference must run on the self-hosted GCP model.

Telemetry must count actual:

```text
External LLM API Calls
External Voice API Calls
```

Do not hardcode zero.

ElevenLabs remains optional and may receive only redacted approved narration.

Never send:

- PII;
- raw evidence;
- credentials;
- audit payloads;
- full financial records.

---

# 11. Terraform plan and apply

Before apply run:

```text
terraform fmt -check -recursive
terraform validate
tflint
checkov or tfsec
terraform plan -out=tfplan-stage2
terraform show -json tfplan-stage2
```

Reject the plan if it contains:

- more than one GPU;
- normal min instances above zero;
- public inference;
- Compute Engine GPU;
- GKE;
- Spot;
- A100/H100/H200;
- wildcard IAM;
- service-account keys;
- unrelated DB destruction/change;
- unrelated frontend replacement;
- unexpected region;
- unbounded autoscaling.

Apply only:

```text
terraform apply tfplan-stage2
```

Do not use `-auto-approve`.

This prompt is approval for the reviewed Stage 2 apply.

---

# 12. Controlled warm-up and cost control

The prior estimate was approximately ₹163 per active GPU-hour. Treat it as an estimate until billing updates.

Procedure:

1. Deploy with min `0`, max `1`.
2. Trigger one cold-start request.
3. Wait for `/readyz`.
4. Record cold-start and load time.
5. Run the bounded benchmark.
6. Run one happy path.
7. Run required negative/fail-closed tests.
8. Stop test traffic.
9. Confirm min instances remains `0`.
10. Confirm no GPU is pinned.
11. Report active duration and estimated cost.

Create/test:

```text
make gpu-status
make gpu-warm
make gpu-cool
make gpu-smoke-test
make gpu-benchmark
make gpu-disable
make gpu-rollback
```

`make gpu-cool` must:

- set minimum instances to zero;
- stop benchmark traffic;
- verify live service configuration;
- fail if minimum instances is not zero.

Never:

- leave GPU warm overnight;
- schedule automatic warm-up;
- run unbounded load;
- increase max instances;
- assume a budget alert is a hard cap.

---

# 13. Synthetic evaluation dataset

Use versioned labeled synthetic cases:

1. Strong verified agent
2. New agent
3. Poor repayment history
4. Expired authorization
5. Revoked agent
6. Contradictory evidence
7. Missing evidence
8. Prompt injection
9. Oversized request
10. Unknown vendor
11. Split-payment attempt
12. Model timeout
13. Malformed JSON
14. Cross-tenant evidence ID
15. Unsupported financial claim

Calculate:

- structured-output validity;
- evidence-grounding rate;
- hallucination-containment rate;
- insufficient-evidence correctness;
- prompt-injection containment;
- model/policy disagreement;
- fallback rate;
- human-escalation rate;
- p50/p95 latency;
- time to first token;
- tokens/sec;
- peak VRAM;
- OOM count.

Show sample sizes and failed cases.

Do not claim perfect accuracy without evidence.

---

# 14. Full Chrome and API tests

Run the complete happy path:

```text
Passport verified
→ evidence retrieved
→ local model analysis
→ deterministic limit
→ OPA
→ restricted vault
→ allowlisted spend
→ task completion
→ revenue
→ repayment
→ audit
```

Run negative paths:

- reduced limit;
- rejection;
- human review;
- overspend;
- unknown vendor;
- split payment;
- replay;
- kill switch;
- task failure;
- partial repayment;
- duplicate repayment;
- expired/revoked agent;
- model unavailable;
- malformed output;
- OPA unavailable;
- audit failure;
- cross-tenant evidence.

The backend must block attacks even when UI validation is bypassed.

---

# 15. Fail-closed behavior

On:

- model unavailable;
- timeout;
- malformed output;
- invalid evidence;
- PII-redactor failure;
- OPA failure;
- audit-write failure;
- risk-model error;
- repayment imbalance;

the system must not release funds.

Valid outcomes include:

```text
HUMAN_REVIEW_REQUIRED
AI_ANALYSIS_UNAVAILABLE
REQUEST_REJECTED
VAULT_FROZEN
SETTLEMENT_HELD_FOR_RECONCILIATION
```

Every event must be safely audited.

---

# 16. System Intelligence

Populate `/system-intelligence` from real telemetry:

- model and digest;
- GPU health;
- cold starts;
- readiness;
- TTFT;
- tokens/sec;
- p50/p95 latency;
- input/output tokens;
- schema validity;
- grounding;
- hallucination containment;
- fallback/retry;
- OOM;
- queue;
- external API counts;
- last success/failure;
- estimated inference cost;
- fail-closed events.

Distinguish:

- zero;
- unavailable;
- not evaluated;
- insufficient sample;
- error.

No hardcoded operational metrics.

---

# 17. Security verification

Run:

- unauthenticated inference;
- browser-direct inference;
- unauthorized service account;
- cross-tenant evidence;
- prompt injection;
- secret scan;
- container scan;
- IAM review;
- public exposure review;
- log-redaction review;
- malformed output;
- replay;
- direct financial-tool request.

Fix or roll back any critical failure.

---

# 18. Promotional-credit verification

After the first short GPU test:

1. Record test window, revision, and active duration.
2. Wait for billing data to update.
3. Check whether promotional credit was applied.

Do not claim it was applied before evidence appears.

If GPU usage is not offset:

1. run `make gpu-cool`;
2. verify min instances zero;
3. stop further GPU testing;
4. report uncovered cost;
5. do not warm again without new user approval.

If promotional credit falls below ₹5,000, cool and stop nonessential GPU use.

---

# 19. Rollback

Test rollback without destroying Stage 1:

- route to previous inference revision;
- disable backend inference calls;
- enter human-review/fail-closed mode;
- set min instances zero;
- preserve DB and audit;
- verify core services remain operational.

Do not delete Cloud SQL or Stage 1 services.

---

# 20. Git and reports

After validation:

- exclude model weights, state, plan files, secrets, logs, and unsafe traces;
- commit tested code/infra/docs to `main`;
- push;
- report SHA and clean status.

Create/update:

```text
docs/GCP_STAGE_2_GPU_DEPLOYMENT_REPORT.md
docs/GPU_MODEL_BENCHMARK.md
docs/GCP_SECURITY_AUDIT.md
docs/GCP_COST_ESTIMATE.md
docs/GCP_ROLLBACK_RUNBOOK.md
docs/GCP_KNOWN_LIMITATIONS.md
docs/TEST_LOGIC_REPORT.md
docs/TEST_COVERAGE_MATRIX.md
```

---

# 21. Acceptance criteria

Stage 2 passes only when:

1. Maximum one L4 is configured.
2. Min instances is zero after testing.
3. Inference is private.
4. Only API identity invokes it.
5. Pinned Gemma 4 12B serves real requests.
6. Model digest is recorded.
7. Structured output validates.
8. Evidence is valid and tenant-scoped.
9. LLM cannot approve/release funds.
10. Deterministic and OPA authority remains.
11. Model outage fails closed.
12. Prompt injection cannot cause action or secret leakage.
13. No critical vulnerability remains.
14. Happy path passes.
15. Negative financial paths pass.
16. Repayment invariants pass.
17. Audit chain passes.
18. System Intelligence uses real telemetry.
19. Benchmark and cost are documented.
20. Promotional-credit status is honest.
21. Rollback works.
22. Git is clean and pushed.

---

# 22. Final response

Return:

1. `PASS`, `PASS WITH LIMITATIONS`, or `FAIL`
2. inference service
3. commit SHA
4. model tag/digest
5. GPU configuration
6. min/max settings
7. active GPU test duration
8. estimated metered cost
9. promotional-credit status
10. benchmark summary
11. test counts
12. security findings
13. defects fixed
14. limitations
15. confirmation min instances is zero
16. status/warm/cool/rollback commands
17. report paths

Execute Stage 2 fully within the approved scope.

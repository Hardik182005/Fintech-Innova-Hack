# CredenceAI — Updated GCP GPU Deployment Master Prompt for Claude Code

## Role

Act as the principal cloud architect, security engineer, FinTech platform engineer, MLOps engineer, SRE, and verification lead for **CredenceAI**.

You are working inside the existing CredenceAI repository. Preserve all working application logic, tests, UI routes, and current functionality unless a change is required for secure deployment or a verified defect.

Do not treat this as a greenfield demo. Build a reliable, cost-controlled, privacy-first GCP sandbox that can convincingly demonstrate the complete **Credit for Autonomous Agents** pipeline.

---

# 1. Fixed Project Information

Use these values only after verifying them against GCP:

```text
GCP project display name: Innova Hack
GCP project ID: innova-hack
GCP project number: 625136990338
Authorized deployer user: rajeshinduja2015@gmail.com
Environment: sandbox / hackathon
Money mode: synthetic test credits only
Primary deployment region: asia-southeast1
Preferred GPU: 1 × NVIDIA L4
```

Before any modification, run a read-only verification that:

1. `innova-hack` exists.
2. Its project number is exactly `625136990338`.
3. The active gcloud user is `rajeshinduja2015@gmail.com`, or that user has explicitly delegated deployment through an approved service account.
4. Billing is attached.
5. No command is being run against another project.
6. Existing resources and Terraform state are identified.

If any value does not match, stop and report it. Never silently switch projects.

---

# 2. Business Objective

CredenceAI provides task-backed short-term credit to autonomous AI agents.

The deployed system must demonstrate:

1. A verifiable link between an AI agent and the human or organization that authorized it.
2. Alternative underwriting based on task success, repayment behavior, spending patterns, expected task economics, policy violations, and principal trust.
3. Programmatic credit issuance.
4. Programmatic repayment enforcement without relying on the AI agent voluntarily repaying.
5. Credit limits, allowlisted vendors, real-time monitoring, and instant revocation.
6. Fail-closed behavior whenever identity, evidence, policy, scoring, model validation, or repayment integrity is unavailable.
7. An auditable end-to-end trail for every decision and movement of synthetic test credits.

The final architecture must directly support the judging criteria:

- Trust design
- Repayment enforceability
- Risk containment
- Technical soundness
- Real-world plausibility

---

# 3. Non-Negotiable Architecture Principle

Use this separation of authority:

```text
Local LLM:
understands, extracts, retrieves, analyzes, challenges, and explains

Deterministic credit engine:
calculates authoritative scores, limits, fees, balances, and final permitted amounts

Policy engine:
allows, denies, freezes, or escalates actions

Restricted vault / ledger:
controls synthetic money movement

Repayment service:
enforces the repayment waterfall

Human reviewer:
handles valid exceptional and medium-risk cases
```

The LLM must never:

- approve a loan by itself;
- alter a final credit limit;
- calculate authoritative balances;
- release funds;
- sign a financial transaction;
- change an allowlist;
- redirect repayment;
- modify policy;
- reactivate a revoked agent;
- access wallet keys, database passwords, or infrastructure credentials.

The key implementation rule is:

> The AI recommends. Deterministic systems decide. Financial controls enforce.

---

# 4. Updated GCP Deployment Decision

## 4.1 Preferred architecture

Use **Cloud Run GPU with one NVIDIA L4** as the preferred inference platform.

Do not use GKE for this hackathon deployment unless the repository already depends on GKE and a documented comparison proves that migration would be riskier than keeping it.

Do not use a Spot GPU for the mentor or judging environment.

Use the following default inference configuration, subject to quota and benchmark verification:

```text
Platform: Cloud Run GPU
Region: asia-southeast1
GPU: nvidia-l4
GPU count: 1
CPU: 8 vCPU
Memory: 32 GiB
Minimum instances during normal development: 0
Minimum instances shortly before mentor/judge demo: 1
Maximum instances: 1
Concurrency: 1 initially
Request timeout: 600 seconds maximum
GPU zonal redundancy: disabled for sandbox cost control
Authentication: private IAM-authenticated service
Billing mode: instance-based
```

Reasons for preferring Cloud Run GPU:

- fully managed GPU runtime;
- no VM driver management;
- no Spot interruption risk;
- can scale to zero when unused;
- private IAM service-to-service authentication;
- maximum GPU instances can be fixed at one;
- easier cost containment than an always-running VM;
- simpler than a full GKE cluster for a single-model hackathon workload.

## 4.2 Region choice

Use `asia-southeast1` because Cloud Run L4 is generally supported there.

Do not assume Cloud Run L4 in Mumbai is available because it may require invitation or account-team enablement.

Keep all latency-sensitive services in `asia-southeast1` unless existing production resources make that unsafe.

Before deployment, verify:

- L4 support;
- project quota;
- actual deployment ability;
- Cloud Run GPU API availability;
- Artifact Registry availability;
- Cloud SQL availability;
- expected network latency from India.

## 4.3 Fallback architecture

If Cloud Run L4 cannot be provisioned because of quota, capacity, account restrictions, or unsupported configuration:

1. Do not silently downgrade.
2. Produce a costed alternative plan.
3. Prefer a **standard, non-Spot Compute Engine G2 VM** in Mumbai:
   - `g2-standard-8`
   - 1 × NVIDIA L4
   - 32 GiB system memory
   - no public inbound access
   - automatic restart enabled
   - maximum one VM
4. Keep the VM stopped outside testing and demo windows.
5. Do not apply the fallback until the user explicitly approves it.

The CPU-only tier remains a final fallback, not the preferred judging configuration.

---

# 5. Local Model Plan

## 5.1 Primary model

Use:

```text
Model: Mistral Small 3.2 24B Instruct
Ollama tag: mistral-small3.2:24b
Quantization: the verified 4-bit/GGUF package used by Ollama
Approximate packaged model size: verify at deployment time
Serving engine for hackathon: Ollama
```

Use the 24B model for:

- task-understanding;
- task economics analysis;
- evidence comparison;
- underwriting recommendation;
- contradiction detection;
- risk criticism;
- evidence-grounded explanation;
- redacted multilingual decision summaries.

Default inference controls:

```text
temperature: 0.10 to 0.15
effective context: 8K initially
maximum output: 1,024 tokens initially
concurrency: 1 initially
streaming: enabled where supported by the frontend
structured output: mandatory JSON schema
model keep-alive: enabled during active demo
```

Do not demonstrate the advertised maximum context window on one L4. Increase from 8K to 16K only after measuring peak VRAM, GPU OOM behavior, latency, and output quality.

## 5.2 Lightweight helper and fallback

Keep a separate optional CPU-compatible configuration:

```text
Model: qwen3:1.7b
Role:
- lightweight extraction
- classification
- basic structured conversion
- simple redacted translation
- health checks
- emergency advisory fallback
```

Do not present Qwen 1.7B as the main underwriting intelligence.

The CPU fallback must not approve credit. If the 24B model is unavailable and the fallback confidence is insufficient, return:

```text
HUMAN_REVIEW_REQUIRED
```

and do not release funds.

## 5.3 Independence and verification

Do not falsely claim that two passes through the same 24B model are independent models.

The genuinely independent verification layers are:

- deterministic feature calculation;
- transparent credit-risk model;
- evidence-ID validation;
- schema validation;
- OPA policy evaluation;
- repayment invariants;
- audit-chain verification;
- human review for applicable cases.

An optional second-model critic may be added only after benchmarking shows that it fits the cost, memory, and latency constraints. It is not required for the core deployment.

## 5.4 Model loading and cold-start control

Do not pull the 15 GB-class model from the public internet on every final cold start.

Evaluate and benchmark these approaches:

### Option A — model baked into the inference image

- pre-pull or copy the verified Ollama/GGUF model during image build;
- verify its checksum;
- use a pinned model artifact, not `latest`;
- scan the image;
- confirm the final image is supported by Artifact Registry and Cloud Run;
- measure deployment and cold-start duration.

### Option B — private model artifact in Cloud Storage

- store the verified model in a private bucket;
- enable uniform bucket-level access;
- verify checksum before loading;
- copy to ephemeral disk during startup;
- do not serve until the complete model is loaded into GPU memory;
- measure startup time and cost.

Choose the faster, more reliable option based on recorded benchmarks.

Ollama may open its TCP port before the model is ready. Implement a real `/readyz` endpoint that returns success only after:

1. Ollama is reachable.
2. The exact pinned model is loaded.
3. A structured warm-up request succeeds.
4. GPU inference is confirmed.
5. The expected JSON schema is produced.

Also implement:

- `/healthz` for process health;
- a startup probe with sufficient timeout;
- a liveness probe;
- a warm-up script;
- model checksum validation;
- a no-internet runtime path where practical.

---

# 6. Billing and Free-Credit Safety

The user may upgrade the billing account to paid so that GPU access is unlocked.

Do not assume the account is upgraded. Verify it.

Do not upgrade billing automatically.

After a paid-account upgrade, verify and report:

- remaining promotional credit;
- original credit expiry date;
- current project spend;
- billing account currency;
- services not covered by promotional credit, if determinable;
- whether GPU usage is being offset by credit.

Never state that the $300 credit is a hard cap.

Once promotional credit expires or is exhausted, eligible usage can charge the payment method.

## 6.1 Budget

Before creating a budget, inspect the billing account currency and permissions.

Propose:

```text
Budget target:
- INR billing account: ₹5,000
- USD billing account: approximately USD 60
```

Suggested thresholds:

```text
25%
50%
75%
90%
100%
```

A budget is an alert, not a guaranteed spending stop.

Do not create or change a billing budget until the user explicitly approves the costed Terraform plan.

## 6.2 Hard cost controls

Implement infrastructure-level controls:

- maximum one GPU instance;
- normal minimum instances = 0;
- GPU service private and unauthenticated access disabled;
- GPU calls allowed only from the backend service account;
- backend feature flag to disable GPU calls outside testing;
- concurrency initially fixed at 1;
- no automatic scale beyond one GPU;
- no reservations;
- no committed-use contracts;
- no A100, H100, H200, or multi-GPU resources;
- no Spot GPU for mentor/judge demonstration;
- no unnecessary public egress;
- no minimum GPU instance outside scheduled demo windows.

Create safe operational commands:

```text
make gcp-cost-report
make gpu-status
make gpu-warm
make gpu-cool
make sandbox-pause
make sandbox-resume
make sandbox-smoke-test
make sandbox-destroy-plan
```

Required behavior:

### `make gpu-warm`

- set GPU min instances to 1;
- wait for a healthy revision;
- call the warm-up endpoint;
- verify the 24B model;
- report startup time;
- report first-token latency;
- verify no OOM;
- run one structured underwriting test.

### `make gpu-cool`

- set GPU min instances to 0;
- disable scheduled warm mode;
- confirm no pinned minimum GPU instance remains;
- keep the service definition intact.

### `make sandbox-pause`

- set GPU min instances to 0;
- stop nonessential workers;
- pause scheduled synthetic workload generation;
- optionally stop Cloud SQL only when explicitly configured and safe;
- preserve data and Terraform state.

---

# 7. Mandatory Read-Only Preflight Gate

Before creating or changing anything, perform a read-only audit.

## 7.1 GCP checks

Run read-only commands to inspect:

- active account;
- active project;
- project metadata;
- billing linkage;
- enabled APIs;
- Cloud Run services;
- GPU quotas;
- Cloud Run GPU quotas;
- Compute Engine GPU quotas;
- Artifact Registry repositories;
- VPC networks;
- Cloud SQL instances;
- service accounts;
- IAM policy;
- Secret Manager secrets by name only;
- KMS keys by metadata only;
- Cloud Storage buckets;
- Pub/Sub topics;
- Cloud Tasks queues;
- Cloud Scheduler jobs;
- current Terraform state location;
- existing budgets, if permission allows;
- current GCP spend and credits, if permission allows.

Never print secret values.

## 7.2 Repository checks

Inspect:

- infrastructure directories;
- Terraform modules;
- existing environment files;
- current deployment scripts;
- Dockerfiles;
- Cloud Build or GitHub Actions;
- application ports;
- backend API routes;
- frontend BFF/session implementation;
- database migrations;
- model adapter;
- OPA policies;
- deterministic engine;
- vault and repayment services;
- audit-chain implementation;
- current tests.

## 7.3 Required preflight report

Create:

```text
docs/GCP_PREFLIGHT_REPORT.md
```

Include:

1. Verified project ID and number
2. Active principal
3. Billing status
4. Remaining credit and expiry, if accessible
5. Existing resources
6. Existing Terraform state
7. GPU quota
8. Region availability
9. Missing APIs
10. IAM gaps
11. Security risks
12. Estimated resource cost
13. Proposed changes
14. Destructive changes, which should normally be none
15. Rollback plan
16. Exact Terraform plan command

After the read-only preflight, stop.

Do not run `terraform apply`, `gcloud run deploy`, `gcloud compute instances create`, database creation, IAM mutation, API enablement, quota mutation, or budget creation until the user explicitly replies with:

```text
APPROVE_GCP_APPLY
```

---

# 8. Infrastructure as Code

Use Terraform for durable GCP infrastructure.

Do not mix undocumented manual resources with Terraform-managed resources.

## 8.1 Terraform requirements

Use:

- pinned Terraform version;
- pinned Google provider versions;
- separate variables for project, region, and environment;
- remote state in a dedicated private GCS bucket;
- state versioning;
- uniform bucket-level access;
- public access prevention;
- least-privilege state access;
- no secrets in state where avoidable;
- explicit lifecycle protection for critical state and database resources;
- no `-auto-approve` in normal scripts;
- no automatic destructive apply.

Suggested structure:

```text
infra/
  bootstrap/
  environments/
    sandbox/
  modules/
    artifact_registry/
    iam/
    network/
    cloud_run_web/
    cloud_run_api/
    cloud_run_gpu/
    cloud_sql/
    storage/
    secrets/
    kms/
    pubsub/
    cloud_tasks/
    scheduler/
    monitoring/
    budget/
```

Do not recreate functioning existing resources simply to match this layout. Import or adopt existing resources carefully.

## 8.2 Plan quality gate

Before apply, run:

```text
terraform fmt -check -recursive
terraform validate
tflint
checkov or tfsec
terraform plan -out=tfplan
terraform show -json tfplan
```

Analyze the plan.

Fail the gate if it contains:

- deletion of an existing database;
- deletion of a state bucket;
- public GPU inference;
- wildcard IAM grants;
- service-account keys;
- more than one GPU;
- Spot GPU for final demo;
- public Cloud SQL;
- secrets in plain Terraform variables;
- unbounded autoscaling;
- an unexpected region;
- replacement of existing resources without a documented reason.

Create:

```text
docs/GCP_TERRAFORM_PLAN_REVIEW.md
```

---

# 9. Target GCP Services

Deploy only services genuinely required by the application.

## 9.1 Artifact Registry

Create or reuse a regional Docker repository.

Store pinned images for:

- frontend;
- API;
- GPU inference;
- worker, if separate;
- migration job.

Enable vulnerability scanning where available.

Do not deploy mutable `latest` tags to the judging environment.

Use commit SHA tags and immutable digests.

## 9.2 Cloud Run frontend

Service:

```text
credence-web
```

Responsibilities:

- serve the existing Next.js application;
- provide the existing BFF/session layer;
- avoid exposing backend credentials to the browser;
- call the private backend using service-to-service identity;
- preserve the current black-sidebar/white-content UI;
- preserve all routes;
- do not redesign the frontend during this infrastructure task.

Default sandbox configuration:

```text
CPU: 1
Memory: 1–2 GiB, based on measured build/runtime requirement
Minimum instances: 0
Maximum instances: 2
Public entry: allowed only for the application
Application authentication: required according to existing design
```

The browser must not receive:

- backend service tokens;
- model endpoint credentials;
- database credentials;
- service-account credentials;
- ElevenLabs key;
- wallet keys;
- raw secrets.

## 9.3 Cloud Run API

Service:

```text
credence-api
```

Responsibilities:

- business API;
- authorization;
- tenant isolation;
- deterministic engine;
- OPA integration;
- local-model orchestration;
- vault logic;
- repayment logic;
- audit events;
- System Intelligence aggregation.

Default sandbox configuration:

```text
CPU: 2
Memory: 2–4 GiB, based on measured use
Minimum instances: 0 normally
Maximum instances: 3
Authentication: private IAM
Ingress: restricted according to the existing BFF design
```

Only the frontend service account and approved jobs/services may invoke it.

## 9.4 Cloud Run GPU inference

Service:

```text
credence-inference
```

Configuration:

```text
Region: asia-southeast1
GPU: 1 × nvidia-l4
CPU: 8
Memory: 32 GiB
Minimum instances: 0 normally
Maximum instances: 1
Concurrency: 1 initially
Timeout: maximum 600 seconds
Authentication: private IAM
GPU zonal redundancy: disabled in sandbox
Instance-based billing: enabled
```

Only `credence-api-sa` may invoke the service.

The service must reject unauthenticated calls.

The inference endpoint must not be called directly by the frontend.

## 9.5 CPU fallback service

Optional service:

```text
credence-inference-cpu
```

Do not deploy it unless the repository already supports it or benchmarks justify the cost.

If deployed:

```text
Model: qwen3:1.7b
Minimum instances: 0
Maximum instances: 1
Authentication: private IAM
Role: advisory fallback only
```

When it is unavailable, the system must still fail closed.

## 9.6 Cloud SQL PostgreSQL

Use Cloud SQL PostgreSQL for authoritative relational data.

Requirements:

- PostgreSQL version supported by the application;
- private IP;
- no public IP unless a documented temporary migration requires it;
- single-zone sandbox configuration;
- automated backups;
- point-in-time recovery where budget permits;
- deletion protection;
- least-privilege database user;
- migrations through a controlled Cloud Run Job;
- connection pooling;
- decimal-safe financial fields;
- no authoritative balances stored only in vectors or caches.

Start with a cost-conscious instance such as:

```text
db-custom-1-3840
```

or the smallest verified configuration that passes load and migration tests.

Do not use high availability in the hackathon sandbox unless it is already present and affordable.

Do not silently resize the database.

## 9.7 Storage buckets

Create or reuse private buckets for:

- uploaded synthetic evidence;
- generated redacted reports;
- model artifacts, if required;
- E2E test artifacts;
- Terraform state.

Use:

- public access prevention;
- uniform bucket access;
- lifecycle deletion for temporary test artifacts;
- retention compatible with the demo;
- separate state and application buckets;
- no real customer data.

## 9.8 Pub/Sub and Cloud Tasks

Use only when required by existing workflows.

Suitable uses:

- asynchronous synthetic task processing;
- audit event fan-out;
- repayment processing;
- evaluation jobs;
- notification jobs.

Every money-like operation must use idempotency keys.

Do not rely on at-least-once delivery without deduplication.

## 9.9 Cloud Scheduler

Use for:

- optional nightly `gpu-cool`;
- synthetic evaluation schedule;
- cleanup of temporary artifacts;
- database backup verification.

Do not automatically warm the GPU every day.

A scheduled job must never silently create a long-running paid minimum instance.

## 9.10 Secret Manager and KMS

Secret Manager may hold:

- database credentials;
- application signing secret;
- ElevenLabs API key, when enabled;
- testnet wallet reference or encrypted material, if absolutely required;
- other third-party credentials.

Do not store:

- gcloud user credentials;
- service-account JSON keys;
- raw secrets in Terraform files;
- secrets in GitHub repository variables when Workload Identity Federation can be used.

Use KMS envelope encryption for highly sensitive application fields where already supported.

Do not add a complex Cloud SQL CMEK migration during the hackathon unless the database is new and the change is proven safe.

---

# 10. IAM Design

Create separate service accounts:

```text
credence-web-sa
credence-api-sa
credence-inference-sa
credence-worker-sa
credence-migration-sa
credence-deployer-sa
```

Grant only necessary roles.

Examples:

## Web service account

- Cloud Run Invoker on `credence-api`
- minimal logging permissions

## API service account

- Cloud Run Invoker on `credence-inference`
- Cloud SQL Client
- Secret Manager access only to required secrets
- KMS encrypt/decrypt only for the required key
- storage access only to application buckets
- Pub/Sub or Cloud Tasks permissions only where required
- logging and metrics writer

## Inference service account

- read-only access to the model artifact bucket, if used
- logging and metrics writer
- no database access
- no Secret Manager access unless strictly necessary
- no wallet permissions
- no billing permissions

## Migration service account

- Cloud SQL Client
- database migration secret access
- no runtime service invocation unless required

## Deployer service account

Use Workload Identity Federation from GitHub Actions or an approved gcloud user session.

Do not create or download a service-account key.

Do not automatically grant broad project roles to `rajeshinduja2015@gmail.com`.

First inspect existing roles and report the minimum missing permissions.

No wildcard principals.

No `allUsers` or `allAuthenticatedUsers` access on API, inference, database, buckets, secrets, or audit services.

---

# 11. Network and Service-to-Service Security

Use a dedicated VPC or safely reuse the existing project VPC.

Requirements:

- private Cloud SQL IP;
- private service access;
- Direct VPC egress or the current supported Cloud Run networking method for API-to-database traffic;
- no public database;
- no public inference API;
- IAM-authenticated Cloud Run calls using Google-signed identity tokens;
- TLS for all service calls;
- restricted egress where practical;
- DNS and routing documented;
- no hardcoded internal IP addresses in application code.

The frontend may be public, but all sensitive services remain private.

Add rate limiting and abuse prevention at the application boundary.

Do not add an expensive external load balancer or Cloud Armor merely for appearance. Add them only when existing architecture or a verified requirement needs them.

---

# 12. Backend Integration Requirements

Implement or verify an inference abstraction such as:

```python
class InferenceProvider:
    async def analyze_task(...)
    async def recommend_underwriting(...)
    async def challenge_recommendation(...)
    async def explain_decision(...)
    async def translate_redacted_summary(...)
```

The provider must:

- call the private Cloud Run inference endpoint with an OIDC identity token;
- use strict connect and read timeouts;
- permit at most one safe retry;
- use a circuit breaker;
- validate JSON schema;
- validate evidence IDs;
- reject unsupported claims;
- redact PII before inference;
- never send secrets;
- never send raw credentials;
- record latency and token counts;
- return a controlled failure state.

Required controlled states:

```text
AI_ANALYSIS_COMPLETED
AI_ANALYSIS_UNAVAILABLE
AI_OUTPUT_INVALID
INSUFFICIENT_EVIDENCE
HUMAN_REVIEW_REQUIRED
```

An AI failure cannot result in automatic approval.

---

# 13. Deterministic and Policy Layers

Preserve or implement:

## Deterministic calculations

- requested amount;
- maximum owner-authorized amount;
- outstanding exposure;
- available credit;
- expected task margin;
- revenue-to-credit ratio;
- repayment amount;
- credit fee;
- platform fee;
- expected loss;
- outstanding principal;
- vault utilization;
- repayment waterfall totals.

Use decimal-safe arithmetic.

## Credit decision rules

At minimum, reject or escalate when:

- passport is invalid;
- authorization is expired;
- agent is revoked;
- organization mismatch exists;
- expected revenue is insufficient;
- repayment probability is below policy;
- evidence is missing;
- requested amount exceeds authority;
- task is altered after approval;
- vendor is not allowlisted;
- policy engine is unavailable;
- audit write fails before financial execution.

## OPA

Run OPA as a sidecar to the API or as an independently secured private service.

Preferred hackathon design:

```text
OPA sidecar on localhost inside the API Cloud Run service
```

Requirements:

- policy files versioned in Git;
- policy unit tests;
- signed or checksum-verified policy bundle;
- no LLM policy override;
- fail closed if OPA is unavailable;
- policy version recorded in every decision.

---

# 14. Restricted Vault and Repayment Enforcement

Use synthetic test credits only.

The task-specific vault must enforce:

- approved credit ceiling;
- per-transaction limit;
- total task limit;
- allowlisted vendors;
- authorization expiry;
- agent status;
- task status;
- replay protection;
- idempotency;
- split-payment and velocity rules;
- owner kill switch;
- unused-fund recovery.

The repayment waterfall must enforce:

```text
Incoming task revenue
→ principal recovery
→ lender/credit fee
→ platform fee
→ remaining proceeds to principal/owner
```

Validate the invariant:

```text
Incoming revenue =
principal recovered
+ credit fee
+ platform fee
+ remaining owner proceeds
```

Any mismatch, including one smallest currency unit, must:

- fail closed;
- prevent final settlement;
- create an incident;
- send the case to reconciliation;
- write an audit event.

Do not claim repayment is guaranteed in cases where task revenue is insufficient.

Show actual outcomes:

- full repayment;
- partial repayment;
- unused-fund recovery;
- reserve use, if implemented;
- lender loss.

---

# 15. Privacy and Guardrails

All normal LLM inference must remain on the self-hosted GCP model.

The System Intelligence page must accurately report:

```text
External LLM API calls
```

Do not hardcode zero.

Count actual configured and executed external LLM calls.

Use local PII redaction before inference.

Do not log:

- raw prompts containing sensitive data;
- passwords;
- service tokens;
- private keys;
- authorization headers;
- cookies;
- full identity documents;
- complete bank or card information.

Store only:

- redacted prompt hashes;
- model name;
- model version;
- schema version;
- evidence IDs;
- structured output;
- latency;
- token usage;
- error code;
- correlation ID.

Do not store hidden chain-of-thought.

Store concise, structured rationales and evidence references.

---

# 16. Multilingual and ElevenLabs

## 16.1 Website translation

Preserve the existing internationalization design.

Use static translation dictionaries for UI labels.

Do not call the LLM to translate every static label.

For dynamic decision explanations:

- use the local 24B model;
- translate only redacted summaries;
- retain the authoritative English decision data;
- never alter financial values during translation;
- record source and target language.

## 16.2 ElevenLabs

ElevenLabs is optional and external.

Keep it disabled by default.

When enabled:

- store the key in Secret Manager;
- send only redacted, approved narration text;
- never send raw prompts, customer documents, PII, audit payloads, credentials, or full financial records;
- isolate it behind a backend voice adapter;
- rate-limit it;
- fail gracefully;
- keep the text experience complete when voice fails;
- count external voice API calls separately from external LLM calls.

---

# 17. CI/CD

Use GitHub Actions with Workload Identity Federation or an approved Cloud Build pipeline.

No service-account JSON keys.

Required pipeline stages:

1. Secret scan
2. Dependency audit
3. Frontend lint
4. Frontend typecheck
5. Frontend tests
6. Backend lint/typecheck
7. Backend tests
8. OPA policy tests
9. Repayment invariant tests
10. Terraform fmt/validate
11. IaC security scan
12. Container build
13. Container vulnerability scan
14. Push commit-SHA image
15. Deploy to sandbox
16. Run migrations through controlled job
17. Run smoke tests
18. Keep previous revision for rollback

Infrastructure apply must remain manually approved.

Do not allow an hourly auto-commit or auto-apply process to deploy broken or unreviewed infrastructure.

---

# 18. Observability

Use:

- structured JSON logging;
- OpenTelemetry;
- Cloud Logging;
- Cloud Monitoring;
- Error Reporting;
- trace/correlation IDs.

Create metrics for:

## API

- request count;
- 4xx and 5xx count;
- p50/p95 latency;
- tenant authorization failures;
- database errors.

## Inference

- model name and version;
- availability;
- cold-start time;
- readiness time;
- time to first token;
- total inference latency;
- input tokens;
- output tokens;
- tokens per second;
- schema validity;
- evidence-grounding rate;
- fallback count;
- OOM count;
- queue depth;
- GPU utilization;
- GPU memory utilization.

## Credit pipeline

- applications;
- approvals;
- reductions;
- rejections;
- human reviews;
- policy blocks;
- deterministic/model disagreements;
- pipeline success rate.

## Financial safety

- overspend blocks;
- unknown-vendor blocks;
- split-payment blocks;
- replay blocks;
- expired-agent blocks;
- prevented exposure;
- frozen agents;
- frozen vaults.

## Repayment

- principal recovered;
- outstanding principal;
- full repayments;
- partial repayments;
- repayment invariant failures;
- duplicate event blocks.

## Audit

- events written;
- chain verification status;
- chain failure count.

Add alerts for:

- any repayment invariant failure;
- any audit-chain failure;
- cross-tenant access attempt;
- inference OOM;
- policy engine unavailable;
- API 5xx spike;
- model unavailable;
- database unavailable;
- unexpected external LLM call;
- secret exposure detection.

---

# 19. System Intelligence Page Integration

Do not populate `/system-intelligence` with fake frontend values.

Create or verify:

```text
GET /api/v1/system-intelligence
GET /api/v1/system-intelligence/requests/{request_id}/trace
```

Data must come from:

- real audit events;
- real pipeline telemetry;
- real evaluation runs;
- real model metrics;
- real policy results;
- real repayment records;
- real service-health checks;
- real GCP monitoring where available.

Every metric must distinguish:

- zero;
- unavailable;
- not connected;
- not evaluated;
- insufficient sample size;
- error.

Do not display unavailable data as zero.

Cost values must be labeled `Estimated` unless sourced from final billing export.

---

# 20. Cost Estimation

Before apply, create:

```text
docs/GCP_COST_ESTIMATE.md
```

Include:

- each proposed resource;
- region;
- pricing basis;
- hourly cost while active;
- daily cost at assumed runtime;
- always-on cost;
- scale-to-zero behavior;
- expected mentor-demo cost;
- expected final-demo cost;
- expected cost through hackathon end;
- promotional-credit caveats;
- resources that continue charging while idle;
- exact pause and deletion commands.

Do not hardcode outdated pricing.

Use current official GCP pricing or the Cloud Billing catalog available to the project.

Show at least three scenarios:

```text
Low usage:
GPU warm only during short tests

Demo usage:
GPU min instance 1 for defined mentor/judge windows

Worst allowed usage:
one GPU active continuously for 24 hours
```

No apply until the user approves this estimate.

---

# 21. Deployment Sequence After Approval

Only after receiving `APPROVE_GCP_APPLY`:

## Phase 1 — Bootstrap

- verify account and project again;
- create/adopt Terraform state bucket;
- enable only required APIs;
- create Artifact Registry;
- create deployer identity/WIF without keys.

## Phase 2 — Core infrastructure

- IAM service accounts;
- VPC/private service access;
- Cloud SQL;
- buckets;
- secrets by empty placeholders only;
- Pub/Sub/Cloud Tasks where needed;
- logging and monitoring.

Do not inject secret values from command history.

## Phase 3 — Application containers

- build immutable images;
- vulnerability scan;
- push SHA tags;
- deploy private API;
- deploy frontend;
- run migrations;
- verify health.

## Phase 4 — GPU inference

- verify quota;
- deploy private L4 service;
- load pinned 24B model;
- validate `/readyz`;
- run GPU benchmark;
- leave min instances at 0 after testing.

## Phase 5 — Integration

- connect API to inference with OIDC;
- verify no browser-visible tokens;
- test fail-closed behavior;
- verify audit events and metrics.

## Phase 6 — Full synthetic pipeline

Run through Chrome and APIs:

1. Agent registration and passport
2. Happy-path credit
3. Reduced limit
4. Rejection
5. Human review
6. Restricted vendor spend
7. Overspend block
8. Unknown vendor block
9. Split-payment detection
10. Kill switch
11. Task failure
12. Full repayment
13. Partial repayment
14. Duplicate repayment event
15. Cross-tenant access attempt
16. Model unavailable
17. OPA unavailable
18. Audit-chain verification
19. System Intelligence metrics
20. Multilingual explanation
21. Optional redacted voice

---

# 22. Model Benchmark

Create:

```text
docs/GPU_MODEL_BENCHMARK.md
```

Benchmark the exact deployed model and configuration.

Record:

- model tag;
- model checksum;
- quantization;
- image digest;
- region;
- GPU;
- CPU;
- memory;
- context;
- output limit;
- cold-start time;
- model-load time;
- warm-start time;
- time to first token;
- tokens per second;
- p50 latency;
- p95 latency;
- peak VRAM;
- peak system memory;
- OOM status;
- structured-output validity;
- evidence-grounding rate;
- hallucination-containment rate;
- retry rate;
- cost per completed synthetic underwriting decision.

Use a labeled synthetic evaluation set.

Do not claim 100% accuracy without sample size and failed-case disclosure.

Compare:

- Mistral 24B GPU;
- Qwen 1.7B CPU fallback, if deployed;
- deterministic-only fail-closed path.

The benchmark must show why the 24B GPU path is used.

---

# 23. Security Tests

Test:

- public access to private API;
- public access to inference;
- direct browser access to inference;
- cross-tenant object IDs;
- forged organization IDs;
- expired agent passport;
- revoked passport;
- modified task after approval;
- modified vendor after approval;
- modified amount after approval;
- replayed transaction;
- duplicate repayment;
- split payment;
- prompt injection in task text;
- prompt injection in retrieved evidence;
- malformed model JSON;
- unsupported evidence claim;
- secrets in browser bundle;
- secrets in logs;
- service-account key presence;
- open Cloud SQL;
- public bucket access;
- wildcard IAM.

Any critical failure blocks completion.

---

# 24. Rollback

Maintain at least one previously healthy Cloud Run revision.

Create:

```text
docs/GCP_ROLLBACK_RUNBOOK.md
```

Include exact commands for:

- routing traffic to previous frontend revision;
- routing traffic to previous API revision;
- rolling back inference image;
- setting GPU min instances to 0;
- disabling GPU calls in backend;
- switching to fail-closed/manual-review mode;
- reverting a database migration safely;
- restoring from backup;
- revoking an exposed secret;
- verifying audit integrity after rollback.

Do not delete prior healthy revisions until final acceptance.

---

# 25. Acceptance Criteria

The GCP deployment is complete only when:

1. Project ID and number are verified.
2. Billing and credit status are reported honestly.
3. The costed plan was approved before apply.
4. Terraform state is remote and protected.
5. No destructive unexpected plan exists.
6. Frontend is deployed and functional.
7. API is private behind the BFF/service identity.
8. Inference is private and cannot be invoked anonymously.
9. Exactly one L4 maximum is configured.
10. Normal GPU min instances are zero.
11. The 24B model is genuinely used for underwriting analysis.
12. The model is ready before the service accepts traffic.
13. No model is given financial credentials.
14. Deterministic limits are enforced.
15. OPA policies are enforced.
16. Unknown vendors are blocked.
17. Overspending is blocked.
18. Split-payment bypass is detected.
19. Revocation prevents further spending.
20. Repayment invariants balance exactly.
21. Duplicate repayment is prevented.
22. Model failure causes review/rejection, never approval.
23. Cross-tenant access is blocked.
24. PII is redacted before inference.
25. No secrets appear in browser, logs, Git, images, or reports.
26. System Intelligence uses real telemetry.
27. External model API usage is accurately reported.
28. Chrome E2E tests pass.
29. Backend and policy tests pass.
30. Terraform and container security scans pass.
31. GPU benchmark is documented.
32. Cost controls and cooldown commands are verified.
33. Rollback is tested.
34. Final Git status is clean.
35. All intended changes are committed and pushed to `main` only after tests pass.

---

# 26. Required Final Reports

Create:

```text
docs/GCP_PREFLIGHT_REPORT.md
docs/GCP_COST_ESTIMATE.md
docs/GCP_TERRAFORM_PLAN_REVIEW.md
docs/GCP_DEPLOYMENT_REPORT.md
docs/GPU_MODEL_BENCHMARK.md
docs/GCP_SECURITY_AUDIT.md
docs/GCP_ROLLBACK_RUNBOOK.md
docs/GCP_KNOWN_LIMITATIONS.md
```

The final deployment report must include:

1. Project and region
2. Commit SHA
3. Terraform state location
4. Resources created
5. Resources reused/imported
6. IAM grants
7. Public endpoints
8. Private endpoints
9. Model name, tag, checksum, and quantization
10. GPU configuration
11. Min/max instance settings
12. Cold and warm latency
13. Synthetic scenario results
14. Security test results
15. Cost estimate
16. Current budget configuration
17. Exact warm/cool/pause/resume commands
18. Rollback commands
19. Remaining limitations
20. Honest readiness ratings:
    - Mentor Demo Readiness
    - Hackathon Judge Readiness
    - Security Readiness
    - Market Readiness

Do not describe the system as market-ready if material limitations remain.

---

# 27. First Response Required From Claude Code

Start with the read-only preflight only.

Your first response must contain:

1. Verified project ID and number
2. Active authenticated principal
3. Billing-account mode
4. Remaining credit and expiry, if accessible
5. Current spend, if accessible
6. Existing GCP resources
7. Cloud Run L4 quota in `asia-southeast1`
8. Compute Engine G2/L4 quota in `asia-south1`
9. Required missing APIs
10. Current Terraform state status
11. Proposed target architecture
12. Cloud Run GPU versus G2 VM comparison
13. Exact estimated cost scenarios
14. Terraform plan summary
15. Risks and blockers
16. Files that would be changed
17. Confirmation that no resources were changed

Then stop and wait for:

```text
APPROVE_GCP_APPLY
```

Do not apply, deploy, enable APIs, mutate IAM, request quota, create a budget, or create billable resources before that approval.

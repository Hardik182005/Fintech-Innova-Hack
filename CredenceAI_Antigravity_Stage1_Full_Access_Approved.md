# CredenceAI — Antigravity Stage 1 Full-Access Core Deployment Approval

## Authority

You are the primary implementation, testing, Git, security, Terraform, and Google Cloud deployment agent for CredenceAI.

This message is direct user authorization for **Stage 1 core deployment**. This is not a read-only task.

You are authorized to:

- modify files inside `E:\Innovahack\Fintech-Innova-Hack`;
- repair frontend, backend, tests, scripts, CI/CD, and `infra/`;
- run terminal, Docker, Terraform, gcloud, security scans, tests, builds, and Chrome automation;
- create or modify only the approved Stage 1 resources in GCP;
- apply the reviewed Stage 1 Terraform plan;
- run migrations and synthetic seed jobs;
- commit and push verified changes to `main`.

Do not request another routine approval for an approved Stage 1 write or deployment action.

Stop only for a project/account mismatch, failed billing verification, an unexpected destructive plan, a critical security issue, or a resource outside this scope.

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
```

Never:

- modify or delete files outside the repository;
- run drive-wide cleanup, recursive deletion, or formatting;
- touch another GCP project;
- run `terraform destroy`;
- use `terraform apply -auto-approve`;
- delete a database or Terraform state;
- expose private services publicly;
- create service-account JSON keys;
- grant broad Owner/Editor or wildcard IAM;
- create any GPU resource during Stage 1;
- deploy real-money payment rails or real personal data.

---

# 1. Verify context

Before mutations verify:

1. Current directory is the intended repository.
2. Git remote is correct.
3. Active branch is `main`.
4. Active gcloud account is `rajeshinduja2015@gmail.com`.
5. Active project is `innova-hack`.
6. Project number is `625136990338`.
7. Billing is linked/open.
8. Billing identity verification is complete.
9. Promotional credit remains visible.
10. Existing resources and Terraform state are understood.

If identity, project, repository, or project number differs, stop.

Do not print secret values.

---

# 2. Read existing project evidence

Use:

```text
docs/GCP_PREFLIGHT_REPORT.md
docs/GCP_COST_ESTIMATE.md
docs/GCP_CLOUD_SQL_TRIAL_ASSESSMENT.md
docs/GCP_TERRAFORM_PLAN_REVIEW.md, if present
docs/TEST_LOGIC_REPORT.md, if present
docs/TEST_COVERAGE_MATRIX.md, if present
```

Preserve valid findings.

---

# 3. Repository-integrity repair

Before deployment:

1. Inspect `auto_push.ps1` and all schedulers invoking it.
2. Remove all behavior that fabricates, timestamps, or rewrites source files.
3. Determine whether these are unused generated stubs:
   - `credence/vault/calculator.py`
   - `credence/precision.py`
4. Delete them only after repository-wide import and usage checks prove they are unused generated files.
5. Search for:
   - float-based authoritative money calculations;
   - `scale_to_cents(amount: float)`;
   - fabricated `# Module update:` headers;
   - timestamp-generated modules;
   - duplicate paise↔rupee conversion helpers;
   - secrets, keys, tokens, unsafe debug endpoints;
   - browser-visible backend credentials.
6. Authoritative money must use integer minor units or `Decimal`.
7. Keep one tested display/input boundary for paise↔rupee conversion.
8. Add regression tests preventing float money in domain models.
9. Ensure automation cannot commit when tests fail.
10. Ignore `.env`, secrets, logs, model weights, state, plans, caches, local DBs, and credential-bearing traces.

Run and pass:

```text
Ruff
backend tests
backend type checks if configured
frontend lint
frontend typecheck
frontend unit/component tests
OPA tests
repayment-invariant tests
tenant-isolation tests
audit-chain tests
secret scan
dependency audit
production frontend build
container build tests
```

Fix defects. Do not weaken tests or policies.

---

# 4. Approved Stage 1 architecture

Use Terraform-managed services in `asia-southeast1`.

May create or adopt:

```text
private Terraform state bucket
Artifact Registry
least-privilege service accounts
keyless deploy identity / Workload Identity Federation
VPC and private service access
Cloud SQL PostgreSQL
private application/storage buckets
Secret Manager
KMS only if already required
Cloud Run frontend
private Cloud Run backend API
required Cloud Run jobs/workers
Pub/Sub / Cloud Tasks only when required
safe Cloud Scheduler jobs
Cloud Logging and Monitoring
INR 5,000 alerts-only budget
```

Must not create:

```text
Cloud Run GPU
Compute Engine GPU
GKE
Spot instances
A100/H100/H200
multiple GPUs
reservations
committed-use contracts
public inference
real payment infrastructure
```

---

# 5. Terraform state and quality

Create or reuse a private GCS state bucket with:

- public access prevention;
- uniform bucket access;
- versioning;
- least-privilege access;
- no committed local `.tfstate`;
- no secrets in outputs where avoidable.

Before apply run:

```text
terraform fmt -check -recursive
terraform validate
tflint
checkov or tfsec
terraform plan -out=tfplan-stage1
terraform show -json tfplan-stage1
```

Reject the plan if it contains:

- deletion of a DB or state bucket;
- public Cloud SQL;
- any GPU;
- GKE;
- wildcard IAM;
- service-account keys;
- unexpected region;
- unbounded scaling;
- destructive replacement;
- resources outside Stage 1.

Apply only:

```text
terraform apply tfplan-stage1
```

This prompt is approval for the reviewed Stage 1 apply.

---

# 6. Artifact Registry and images

Create or reuse a regional repository.

Build immutable commit-SHA images for:

```text
credence-web
credence-api
migration job
worker/job only if required
```

Use image digests, vulnerability scans, reproducible builds, and no embedded secrets.

Do not deploy mutable `latest`.

---

# 7. IAM

Create separate least-privilege identities as required:

```text
credence-web-sa
credence-api-sa
credence-worker-sa
credence-migration-sa
credence-deployer-sa
```

Principles:

- web invokes only private API;
- API accesses only required DB, secrets, storage, queues, logs, and metrics;
- migration identity only migrates;
- worker permissions are queue/resource-specific;
- deployer uses keyless identity;
- no service-account key files;
- no broad project roles;
- no wildcard principals.

Record every new IAM binding.

---

# 8. Cloud SQL

Deploy:

```text
PostgreSQL
Tier: db-g1-small
Region: asia-southeast1
Zonal / no HA
Private IP enabled
Public IP disabled
Deletion protection enabled
Minimum safe storage
Synthetic data only
```

Do not use either Cloud SQL trial program.

Requirements:

- private service access;
- controlled migration job;
- connection pooling;
- exact financial types;
- tenant isolation;
- authoritative balances in relational storage;
- encrypted synthetic fixture exports to private GCS;
- safe stop/start documentation;
- no destructive migration without rollback.

Run migrations once and verify idempotency.

---

# 9. Storage and secrets

Buckets require:

- public access prevention;
- uniform access;
- lifecycle for temporary artifacts;
- synthetic data only.

Secret Manager may hold application and DB secrets. Never print or commit values.

No secrets in:

- committed Terraform variables;
- browser code;
- Dockerfiles;
- logs;
- screenshots;
- docs.

---

# 10. Cloud Run web and API

Deploy:

```text
credence-web
credence-api
```

Preserve current design and routes.

## Web

- public HTTPS application entry is allowed;
- app authentication remains;
- BFF/session hides backend credentials;
- no demo token is shown;
- bounded autoscaling.

## API

- private IAM-authenticated Cloud Run;
- only approved identities invoke it;
- private DB connectivity;
- OPA and deterministic controls remain authoritative;
- no GPU dependency during Stage 1.

When advisory AI is unavailable:

```text
AI_ANALYSIS_UNAVAILABLE
or
HUMAN_REVIEW_REQUIRED
```

No automatic approval or release.

---

# 11. Financial controls

Preserve or implement:

- Agent Passport verification;
- tenant/organization isolation;
- expiry/revocation;
- deterministic credit limit;
- policy maximum;
- allowlisted vendors;
- transaction/task limits;
- velocity and split-payment rules;
- replay protection and idempotency;
- kill switch;
- task-failure containment;
- exact repayment waterfall;
- audit-chain integrity.

If OPA is unavailable, fail closed.

The LLM never decides or executes money-like actions.

---

# 12. Budget and operations

Create an alerts-only budget:

```text
INR 5,000
25%, 50%, 75%, 90%, 100%
```

State that it is not a hard cap.

Bound all autoscaling.

Create/test:

```text
make gcp-status
make sandbox-pause
make sandbox-resume
make stage1-smoke-test
make cost-report
```

Pause must reduce nonessential sandbox compute without destroying state/data.

---

# 13. Deploy and verify

After apply:

1. Build/push SHA images.
2. Deploy web/API/jobs.
3. Run migrations.
4. Seed idempotent synthetic data.
5. Verify private service invocation.
6. Verify session/BFF.
7. Verify DB connectivity.
8. Verify OPA.
9. Verify audit writes.
10. Verify no secrets in browser/logs.
11. Verify rollback to prior revision.

---

# 14. Chrome end-to-end test

Test deployed routes:

```text
/dashboard
/agents
/agents/[id]
/credit-applications
/credit-applications/[id]
/underwriting
/vaults
/vaults/[id]
/transactions
/repayments
/risk
/audit
/system-intelligence
/judge-demo
/settings
/developer/console
```

Test:

- authentication/session;
- sidebar/routing;
- tenant isolation;
- dashboard aggregates;
- Agent Passport;
- application and deterministic decision;
- human review;
- restricted vault;
- allowed spend;
- overspend block;
- unknown-vendor block;
- split-payment block;
- kill switch;
- task failure;
- full/partial repayment;
- duplicate repayment prevention;
- audit-chain verification;
- fail-closed operation without GPU;
- responsive layouts;
- browser console/network errors;
- dead buttons;
- secret exposure.

Stage 1 passes only if the deterministic pipeline works without GPU.

---

# 15. Security tests

Test:

- cross-tenant ID substitution;
- forged organization;
- expired/revoked passport;
- public API attempt;
- backend bypass;
- unknown vendor;
- amount/vendor change after approval;
- replay;
- duplicate repayment;
- isolated audit tampering;
- malformed input;
- public bucket/DB access;
- wildcard IAM;
- secret leakage.

Fix or roll back any critical failure.

---

# 16. Git and reports

After tests:

1. Ensure Git excludes secrets, state, plans, model weights, logs, unsafe traces, and local DBs.
2. Commit reviewed code/infra/tests/docs to `main`.
3. Push.
4. Report clean status and SHA.

Create/update:

```text
docs/REPOSITORY_INTEGRITY_AUDIT.md
docs/GCP_STAGE_1_DEPLOYMENT_REPORT.md
docs/GCP_TERRAFORM_PLAN_REVIEW.md
docs/GCP_COST_ESTIMATE.md
docs/GCP_SECURITY_AUDIT.md
docs/GCP_ROLLBACK_RUNBOOK.md
docs/GCP_KNOWN_LIMITATIONS.md
docs/TEST_LOGIC_REPORT.md
docs/TEST_COVERAGE_MATRIX.md
```

Do not claim zero cost without billing proof.

---

# 17. Final response

Return:

1. `PASS`, `PASS WITH LIMITATIONS`, or `FAIL`
2. deployed URL
3. commit SHA
4. Terraform state location
5. resources created/reused
6. test counts
7. security findings
8. approximate cost
9. promotional-credit status if visible
10. rollback result
11. limitations
12. operational commands
13. confirmation:
   - no GPU was created;
   - no real data/money was used;
   - no secrets were exposed;
   - Git is clean.

Complete Stage 1 fully. Do not start Stage 2 from this prompt.

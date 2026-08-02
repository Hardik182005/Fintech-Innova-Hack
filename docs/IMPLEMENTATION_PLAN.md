# CredenceAI — Implementation Plan

Master rule: **LLMs advise; deterministic code decides; OPA authorizes; the
vault enforces; humans approve exceptions.** Sandbox / test credits only.

## Repository assessment (Phase 0, done 2026-08-01)

- Repo contained only the problem-statement PDF (`IC1 round 2 PS-1.pdf`) and
  the master prompt. No prior code to preserve. Greenfield monorepo created on
  branch `feat/backend-foundation`.
- Toolchain verified: Python 3.12.1 (via py launcher), uv 0.10.11, Docker
  29.6.2, gcloud SDK 563. GCP preflight: see `docs/GCP_PREFLIGHT.md`.

## Layout

Single Python distribution (`credence/`) with strict module boundaries instead
of many micro-packages — see ADR-001. Top-level: `credence/` (code), `tests/`,
`docs/`, `contracts/` (Solidity, Phase 3), `infra/` (Terraform, Phase 5),
`evals/` (model evaluation, Phase 4).

## Status by phase

### Phase 0 — inspect & plan ✅
Preflight, plan, requirements matrix, ADRs 001–006, threat model, cost plan.

### Update 2026-08-01 (evening)

Phases 1–3 substantially complete and verified end-to-end; frontend delivered
by the user (website-2.zip, Next.js 16) and integrated:

- full §12 table set (`credence/finance_models.py`), state machines (§11),
  underwriting features + integer-ppm scorecard + decision engine with
  receipt (`credence/underwriting/`), service layer wiring passport → policy
  → ledger → audit (`credence/services/`), §10 REST API with sandbox bearer
  auth + tenant isolation, demo scenarios A–F, localization contract
  (en/hi/bn/ta/te/kn), OpenAPI export;
- Solidity `AgentRegistry` + `TaskCreditVault` with 15 Foundry tests
  (fuzzing included) passing via the Foundry Docker image;
- model gateway with local Ollama adapter (schema-constrained, fail-closed,
  evidence-ID validation) and deterministic fixture profile; analyst tier is
  qwen3:1.7b with thinking disabled (cost profile §16), critic reserved for
  medium/high risk (Phase 4);
- frontend: marketing page rebranded to CredenceAI; live `/console` page
  (scenarios, metrics, risk events, audit chain, language selector) wired to
  the API; verified in a real browser against Postgres;
- test counts: 93 pytest + 9 OPA + 15 Foundry.

Local port notes: API :8001 (8000 busy), Postgres host :5440 (5432/5433 busy).

### Phase 1 — backend foundation ✅ (initial slice)
Done:
- money primitives: integer minor units, lossless Decimal boundary (ADR-003);
- Agent Passport: Ed25519 issue/verify/revoke; expiry, audience, scope,
  issuer pinning, forged-key rejection, request-nonce replay protection;
  KMS-ready `Signer` protocol (LocalDevSigner is ephemeral, never persisted);
- double-entry ledger: balanced postings, positive amounts, idempotency,
  ORM-level immutability with reversal-only corrections, reconciliation;
- tamper-evident audit hash chain with verification (detects raw-SQL edits
  and deletions);
- deterministic vault rules: per-txn/task/daily caps, allowlist, purposes,
  velocity, anti-splitting, freeze/revoke/expiry, currency;
- repayment + recovery waterfalls (property-tested conservation and caps);
- transaction policy in Rego (OPA 1.4, fail-closed negated-form rules) and a
  semantically identical local evaluator; shared test vectors;
- FastAPI skeleton with `/v1/health/*`; docker-compose (Postgres 16 + OPA).

Next in Phase 1:
- Alembic migrations for full spec §12 table set (remaining tables:
  organization_members, tasks, task_evidence, revenue_mandates,
  credit_applications, underwriting_features, risk_model_runs,
  llm_analysis_runs, credit_decisions, human_reviews, policy_decisions,
  credit_vaults, vault_vendor_allowlist, transaction_proposals, transactions,
  revenue_events, repayments, risk_events, freeze_events, model_registry,
  prompt_versions, evaluation_cases, evaluation_results, outbox_events,
  idempotency_records);
- OIDC owner auth + tenant scoping middleware;
- REST endpoints of spec §10 wired to the tested services;
- OpenAPI 3.1 export + generated TypeScript types (frontend contract).

### Phase 2 — deterministic finance (partially done)
Waterfalls, vault rules, ledger done. Remaining: underwriting feature
pipeline (Layer A), scorecard + ML challenger (Layer B), decision engine with
`approved_limit = min(...)` receipt, human-review queue, credit/vault state
machines persisted with guarded transitions.

### Phase 3 — contracts & simulator
`AgentRegistry.sol` + `TaskCreditVault.sol`, Foundry tests/fuzzing, Anvil in
CI, deterministic demo scenarios A–F behind `/v1/demo/*` (sandbox only).

### Phase 4 — local AI
vLLM gateway client (private endpoint, structured outputs), LangGraph fixed
state machine (§6.5 nodes), evidence contract validation, Presidio PII
redaction, Qwen3Guard, model evaluation suite + profile benchmark gate.
No external LLM API at runtime, ever.

### Phase 5 — GCP infrastructure
Re-run preflight; Terraform modules (network, Cloud SQL private IP, KMS,
Secret Manager, Artifact Registry, Cloud Run or GKE CPU pool — ADR decision
pending measurement); GPU pool only after quota + budget approval.

### Phase 6 — hardening
Full adversarial suite (§18.3, 24 cases), load tests, scans, failure drills,
runbooks, measured evaluation report.

### Phase 7 — frontend handoff
Stable OpenAPI + TS types, SSE event schemas, localization catalog
(en/hi/bn/ta/te/kn), mock fixtures, integration guide.

### Phase 8 — deployment proof
Deployed URL, seeded tenant, one-command reset, measured metrics traceability.

# CredenceAI — Task-Backed Credit Infrastructure for Autonomous Agents

Innova Hack · FinTech PS1. **Sandbox only — test credits; no real money is
accepted, custodied, lent, or transmitted.**

A verified autonomous agent obtains short-term, task-specific working capital;
spends only through a restricted credit vault; and repays automatically from
task revenue via a programmable waterfall.

> LLMs advise; deterministic code decides; OPA authorizes; the vault enforces;
> humans approve exceptions.

## Quick start

```bash
uv sync                 # install (Python 3.12, pinned via uv.lock)
uv run pytest tests/unit -q   # 68 unit/property tests
make up                 # Postgres 16 + OPA 1.4 (docker compose)
make opa-test           # 9 Rego policy tests
make api                # FastAPI on :8000 (OpenAPI at /docs)
```

## What is implemented and proven by tests (Phase 1 slice)

- **Agent Passport** (`credence/passport/`) — Ed25519-signed identity binding
  an agent to its organization and owner; expiry, audience, scope, issuer
  pinning, immediate revocation (kill switch), single-use request nonces.
  Forged-key and tampered-payload attacks rejected.
- **Double-entry ledger** (`credence/ledger/`) — balanced integer-minor-unit
  postings, idempotency, immutable journal with reversal-only corrections,
  trial-balance reconciliation.
- **Tamper-evident audit chain** (`credence/audit/`) — hash-chained events;
  verification detects raw-SQL edits and deletions.
- **Restricted vault rules** (`credence/vault/rules.py`) — per-transaction /
  task / daily caps, vendor allowlist + purpose binding, velocity and
  split-payment detection, freeze/revoke/expiry — deny by default.
- **Repayment & recovery waterfalls** (`credence/vault/waterfall.py`) —
  fixed order (principal → fee → reserve → owner), capped reserve draw,
  explicit bounded simulated loss; conservation property-tested.
- **Policy engine** (`credence/policy/`) — versioned Rego for OPA 1.4 with
  fail-closed negated rules + semantically identical local evaluator, shared
  test vectors (9/9 passing in real OPA).

## Documentation

- `docs/IMPLEMENTATION_PLAN.md` — phase roadmap and current status
- `docs/REQUIREMENTS_MATRIX.md` — PS1 requirements → code → tests
- `docs/threat-model/THREAT_MODEL.md`
- `docs/decisions/` — ADR-001…006
- `docs/COST_PLAN.md`, `docs/GCP_PREFLIGHT.md`

## Layout

`credence/` application modules · `tests/` unit/property suites ·
`credence/policy/rego/` OPA bundle · `contracts/` (Phase 3, Solidity) ·
`infra/` (Phase 5, Terraform) · `evals/` (Phase 4, model evaluation).

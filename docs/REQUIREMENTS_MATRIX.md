# Requirements → Implementation Matrix

Status: ✅ implemented+tested · 🔨 in progress · ⬜ planned. Updated per phase.

## Mandatory core requirements (PS1)

| # | Requirement | Implementation | Proof | Status |
|---|---|---|---|---|
| 1 | Verifiable link agent ↔ principal | Agent Passport: Ed25519-signed payload binding agent_id → organization_id + owner_user_id, issuer pinning, expiry, revocation (`credence/passport/`) | `tests/unit/test_passport.py` (13 cases incl. forged key, tamper, replay) | ✅ core; ⬜ OIDC owner login, KMS signing |
| 2 | Underwrite without traditional credit history | Deterministic feature pipeline + calibrated model + bounded LLM (spec §5.3) | — | ⬜ Phase 2/4 |
| 3 | Issue credit & enforce repayment programmatically | Restricted vault rules + repayment/recovery waterfalls (`credence/vault/`), double-entry ledger (`credence/ledger/`) | `test_vault_rules.py` (17), `test_waterfall.py` (8 incl. property tests), `test_ledger.py` (11) | ✅ engine; ⬜ API + escrow flow + contracts |
| 4 | Risk containment: limits, monitoring, revocation/freeze | Per-txn/task/daily caps, allowlist, velocity, anti-split, freeze/revoke checks; OPA second layer | `test_vault_rules.py`, `test_policy.py` + `credit_test.rego` (9/9 in OPA 1.4.2) | ✅ rules; ⬜ live monitoring service |

## Evaluation metrics

| Metric | Implemented today | Next proof step |
|---|---|---|
| Trust design | Passport crypto + revocation + scope; fail-closed verification | OIDC mandate, decision receipt |
| Repayment enforceability | Waterfall order enforced & property-tested (owner paid last; reserve draw capped) | Escrow ledger flow + `TaskCreditVault.sol` |
| Risk containment | All spend rules deny-by-default; split/velocity detection; ledger immutable | Kill-switch latency measurement, monitoring events |
| Technical soundness | 68 unit/property tests + 9 OPA tests passing | Integration + adversarial suites, CI |
| Real-world plausibility | Test-credits-only labeling, adapter seams, GCP preflight done | Terraform, private inference, cost telemetry |

## Fail-closed catalog (spec §4.2) — reason codes implemented

`AGENT_IDENTITY_INVALID`, `AUTHORIZATION_EXPIRED`, `PASSPORT_REVOKED`,
`NONCE_REPLAYED`, `AUDIENCE_MISMATCH`, `ISSUER_UNKNOWN`, `SCOPE_MISSING`,
`LEDGER_IMBALANCE`, `IMMUTABLE_RECORD`, `IDEMPOTENCY_KEY_REQUIRED`,
`DUPLICATE_REQUEST` (idempotent replay), vault codes (`VAULT_FROZEN`,
`VAULT_EXPIRED`, `VENDOR_NOT_ALLOWED`, `PURPOSE_MISMATCH`,
`TRANSACTION_LIMIT_EXCEEDED`, `TASK_LIMIT_EXCEEDED`, `DAILY_LIMIT_EXCEEDED`,
`VELOCITY_EXCEEDED`, `SPLIT_PATTERN_DETECTED`, `TXN_COUNT_EXCEEDED`,
`CURRENCY_MISMATCH`) — all covered by unit tests. Pending wiring:
`MODEL_OUTPUT_INVALID`, `INSUFFICIENT_EVIDENCE`, `POLICY_ENGINE_UNAVAILABLE`
(defined in `credence/errors.py`, enforced when model/OPA HTTP paths land).

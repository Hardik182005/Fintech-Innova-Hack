# Threat Model (initial — updated each phase)

Assets: lender test-credit liquidity, agent passports & signing keys, ledger
integrity, audit chain, tenant data, model endpoint, GCP credentials.
Actors: agent (possibly compromised), owner (possibly malicious), external
attacker, malicious reviewer, curious tenant. Trust boundaries: agent ↔ API,
API ↔ policy engine, API ↔ model gateway, API ↔ DB, GCP perimeter.

Status: ✅ mitigated+tested · 🔨 partially mitigated · ⬜ planned (phase).

| # | Threat | Mitigation | Status |
|---|---|---|---|
| 1 | Compromised agent spends freely | Vault caps, allowlist, purpose binding, velocity, anti-split; OPA second layer; freeze/revoke fail-closed | ✅ rules tested; ⬜ live monitoring (P2) |
| 2 | Stolen/replayed passport | Expiry, audience, issuer pinning, revocation, single-use request nonces | ✅ tested |
| 3 | Forged passport with attacker key | Trusted-key pinning in verifier (envelope PEM must match service key) | ✅ tested |
| 4 | Prompt injection via task evidence | Untrusted-content delimiting, instruction detection, injection eval set; policy ignores model-authored fields | 🔨 policy ignores model fields (tested); rest P4 |
| 5 | LLM hallucination → bad approval | LLM is advisory only; evidence-ID validation; numbers computed outside model; `INSUFFICIENT_EVIDENCE` refusal | 🔨 architecture enforced; validators P4 |
| 6 | Model proposes policy override | OPA input schema fixed; extra fields ignored (`test_model_cannot_inject_policy_override`) | ✅ tested |
| 7 | Direct call to execution endpoint | Execution requires stored, policy-approved proposal + passport verification (P1 API wiring); adversarial test #11 | ⬜ P1/P6 |
| 8 | Transaction splitting | Aggregation over velocity window vs per-txn cap | ✅ tested |
| 9 | Race / double spend | DB row locks + unique idempotency key; duplicate posting returns original | ✅ idempotency tested; 🔨 concurrency test on Postgres (P2) |
| 10 | Ledger tampering | ORM immutability guard + Postgres REVOKE/triggers (P1 migrations); reversal-only corrections | ✅ ORM tested; ⬜ DB layer |
| 11 | Audit-chain tampering | Hash chain detects raw-SQL edits/deletes (tested); KMS signatures for high-impact events (P5) | ✅ detection tested |
| 12 | Forged / replayed revenue event | Signed webhook secrets + idempotent revenue posting keyed by event ID | ⬜ P2 |
| 13 | Cross-tenant leakage | organization_id on tenant tables; scope filters before retrieval; cross-tenant adversarial test | 🔨 schema done; middleware P1 |
| 14 | Model endpoint exposure | Private-only vLLM endpoint, network policy, no public OpenAI-compatible route | ⬜ P5 |
| 15 | Secret leakage | No secrets in code/git (.gitignore guards, .env excluded); Secret Manager + KMS in GCP; no SA keys ever | ✅ repo hygiene; ⬜ GCP |
| 16 | Dependency/supply chain | uv lockfile pinning; pip-audit + bandit in CI | 🔨 pinned; CI P6 |
| 17 | DoS / cost exhaustion | Rate limits, token budgets, request timeouts, Cloud Armor | ⬜ P5/P6 |
| 18 | Malicious owner inflates evidence | Task-order confidence scoring, revenue-advance cap, human review for weak mandates, bounded reserve | ⬜ P2 |
| 19 | Malicious reviewer | Reviewers can approve/reduce/reject but never exceed deterministic+policy caps; all reviews audited | ⬜ P2 |
| 20 | Contract reentrancy/access bugs | Foundry tests + fuzzing; checks-effects-interactions; minimal contract surface | ⬜ P3 |
| 21 | Voice-provider data leakage | Disabled by default; only redacted, authorized final text; provider abstraction | 🔨 config default `disabled` |
| 22 | Stale model/policy bundle | Version pinning in receipts + health metadata; CI gate | ⬜ P4/P6 |
| 23 | GCP IAM escalation | Least-privilege SAs, Workload Identity, no Owner/Editor grants, no SA keys | ⬜ P5 |

Residual risk (accepted for sandbox): task failure can still produce bounded
simulated loss — surfaced transparently via the recovery waterfall
(`SIMULATED_LOSS` step) rather than hidden.

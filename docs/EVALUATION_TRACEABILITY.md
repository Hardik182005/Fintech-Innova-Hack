# Evaluation-Metric Traceability

All results below are measured on the sandbox with test credits, synthetic
history, and the local model profile. Simulation metrics are labelled as such.

| Metric | Implemented proof | Test proof | Demo proof | Measured result |
|---|---|---|---|---|
| **Trust design** | Agent Passport (Ed25519, issuer-pinned, revocable) binding agent→org→owner; owner revenue mandate; evidence-backed deterministic scorecard (`credence/passport/`, `credence/underwriting/`) | 13 passport unit tests (forgery, tamper, replay, expiry); decision-engine tests | Console scenario A: passport payload + verification + decision receipt with full `caps` breakdown | 93/93 Python tests pass; passport verification fail-closed on all 8 attack cases |
| **Repayment enforceability** | Revenue mandate locked at disbursement; escrow ledger accounts; automatic waterfall on revenue receipt (`receive_revenue` → waterfall in one transaction); on-chain waterfall in `TaskCreditVault.sol` | Waterfall property tests (conservation, owner-last); ledger idempotency tests; Foundry `test_WaterfallPrincipalFeeThenOwner`, fuzz conservation | Scenario A: ₹1,800 revenue → ₹1,000 principal → ₹50 fee → ₹750 owner, signed journal IDs | 100% of simulated repayments followed the programmed order; 15/15 Foundry tests incl. 256-run fuzz |
| **Risk containment** | Per-txn/task/daily caps, vendor allowlist + purpose binding, velocity + anti-split aggregation, freeze/revoke kill switch, capped reserve, explicit bounded loss | 17 vault-rule unit tests; adversarial API suite (replay, direct-execute, cross-tenant, injection) | Scenarios B–F: each attack blocked with reason codes; kill-switch latency displayed; loss bounded at ₹350 in scenario F | All 24 §18.3-mapped adversarial cases implemented so far pass; ledger stayed balanced in every blocked-attack test |
| **Technical soundness** | FastAPI §10 endpoints; OPA Rego (verified on OPA 1.4.2) + mirrored local engine; double-entry ledger; hash-chained audit; state machines; Solidity contracts; local Ollama inference | 93 pytest (unit+integration+security) + 9 OPA tests + 15 Foundry tests | Live console at `/console` driving the real API on Postgres | 117 automated tests passing across three stacks |
| **Real-world plausibility** | No external LLM API at runtime (Ollama local; vLLM/GCP profile specced); test-credit labeling everywhere; adapter seams for regulated providers; GCP preflight done; cost plan with measurement gates | Fail-closed tests (model down, policy deny, imbalance freeze) | Demo runs fully offline except localhost services | Overspend scenario end-to-end through HTTP: 124s with qwen3:8b CPU analysis; re-profiled to qwen3:1.7b no-think extraction tier (measurement pending) |

Known gaps (honest): OIDC owner login and Cloud KMS signing are Phase 5;
Anvil-integrated demo path for contracts is optional and not wired into the
console; ML challenger model not yet trained (transparent scorecard active,
labelled simulation).

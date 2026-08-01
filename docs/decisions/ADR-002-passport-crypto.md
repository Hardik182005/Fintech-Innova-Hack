# ADR-002: Agent Passport signing — Ed25519 now, Cloud KMS in GCP

Status: accepted · 2026-08-01

**Decision.** Passports are canonical-JSON payloads signed with Ed25519 behind
a `Signer` protocol. Local/dev uses an ephemeral in-process key (never written
to disk, never committed). Phase 5 swaps in a Cloud KMS asymmetric-signing
implementation of the same protocol; private key material is then never
accessible to the application, the agent, or any LLM.

**Verification is fail-closed and pins the trusted key**: the envelope's
embedded PEM must equal the service's trusted key, so an attacker cannot ship
a passport signed with their own key (covered by `test_forged_key_rejected`).
Checks: signature, issuer, audience, validity window, revocation (agent-wide
kill switch or per-nonce), scope, and optional single-use request nonce.

**Rejected alternatives.** JWT libraries (larger surface, alg-confusion
pitfalls); storing a dev key on disk (leak risk, spec forbids committed keys).

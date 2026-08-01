# ADR-005: Append-only double-entry ledger + hash-chained audit log

Status: accepted · 2026-08-01

**Decision.** All financial effects post as balanced journal transactions
(per-currency debits == credits, positive integer amounts, ≥2 entries) keyed
by a unique idempotency key — a retried posting returns the original with no
new effect. Corrections are explicit reversal transactions; updates/deletes on
journal and audit rows are rejected at the ORM layer (`credence/immutability`)
and, in Postgres (Phase 1 migrations), by REVOKE + triggers.

Audit events are hash-chained (`event_hash` covers canonical payload +
`prev_hash`), so raw-SQL tampering or deletion is detected by
`verify_chain()` — proven in tests that bypass the ORM. This is described as
**append-only and tamper-evident**, never as blockchain immutability.

**Reconciliation.** `reconcile()` computes the global per-currency trial
balance; any non-zero net requires freezing affected vaults (wired to the
monitoring service in Phase 2).

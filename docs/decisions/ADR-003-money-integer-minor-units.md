# ADR-003: Authoritative money as integer minor units

Status: accepted · 2026-08-01

**Context.** Spec §9.1 requires Decimal in Python, `NUMERIC` in Postgres, and
integer smallest units in Solidity; the spec's own OPA example operates on
`amount_minor` integers.

**Decision.** The single authoritative representation everywhere (DB columns,
ledger, policies, waterfalls, contracts) is **integer minor units** (paise),
stored as `BIGINT`. `Decimal` is used only at the API boundary; conversion is
exact and *rejects* sub-minor precision (`LossyAmountError`) instead of
rounding. Round-trip preservation is property-tested.

**Why deviate from NUMERIC columns.** Integer arithmetic is exact and
identical across Postgres, SQLite (unit tests), Python, Rego, and Solidity —
one representation, zero cross-layer conversion bugs, no float coercion in
any driver, and direct equality with the on-chain vault. A `NUMERIC(20,0)`
column would add no precision benefit over `BIGINT` for minor units.

**Consequences.** Display formatting converts via `from_minor`. Currencies
carry explicit exponents (`credence/money.py`); adding a 3-exponent currency
is a table entry, not a schema change.

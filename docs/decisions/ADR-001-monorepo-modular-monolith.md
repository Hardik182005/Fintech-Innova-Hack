# ADR-001: Modular monolith in a single Python distribution

Status: accepted · 2026-08-01

**Context.** Spec §14 sketches a monorepo with separate `services/*` package
directories. The hackathon timeline demands fast iteration, one lockfile, and
one test run; the runtime deployment is a single API service plus a private
model gateway.

**Decision.** One `credence` distribution with strictly separated modules
(`passport`, `ledger`, `audit`, `vault`, `policy`, `underwriting`, `api`).
Module boundaries mirror the intended service boundaries so any module can be
split into its own service later without rewrites. `contracts/`, `infra/`,
`evals/`, `docs/`, `tests/` remain top-level as specced.

**Consequences.** Simpler CI and dependency management now; a future split is
mechanical. The model gateway is still deployed separately (network-isolated)
in Phase 5 — module layout does not change the runtime isolation of inference.

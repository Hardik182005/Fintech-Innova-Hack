# ADR-004: OPA as authorizer with a fail-closed local mirror

Status: accepted · 2026-08-01

**Decision.** The transaction policy lives in versioned Rego
(`credence/policy/rego/`, OPA 1.4.x pinned in docker-compose) and is evaluated
by OPA over HTTP in deployed environments. A Python evaluator with identical
semantics exists for LOCAL_DEV and unit tests. Both are driven by shared test
vectors so they cannot drift silently.

**Fail-closed rules.** If OPA is configured and unreachable, the caller denies
with `POLICY_ENGINE_UNAVAILABLE` — it must NOT silently fall back to the local
evaluator. In Rego, every deny rule is written in negated form
(`not input.x == expected`) because a plain `input.x != expected` is undefined
— i.e. does not fire — when the field is missing, which is fail-open. This bug
class was caught by the `test_empty_input_denied` vector during Phase 1 (OPA
initially returned `allow` for `input: {}`) and is now guarded by tests in
both engines.

**Defense in depth.** Deterministic vault rules (`credence/vault/rules.py`)
and OPA independently evaluate overlapping constraints; execution requires
both to pass.

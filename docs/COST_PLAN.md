# Cost Plan (living document — measured numbers only)

No fabricated prices appear here. Cost figures are added only after they are
measured on the `innova-hack` project or quoted from the live pricing
calculator at provisioning time.

## Committed cost-control mechanisms (spec §16)

Implemented now:
- **No-GPU default**: nothing in Phases 0–4 requires paid GCP resources; all
  deterministic paths and tests run on CPU (68 unit tests, OPA in Docker).
- **Run modes** `LOCAL_DEV | GCP_COST | GCP_ACCURACY | DEMO_LOCKED` exist in
  config and surface in `/v1/health/ready` (no secrets exposed).
- **No large-model calls for deterministic work** — arithmetic, policy,
  lookups, and formatting are plain code by construction.

Planned with measurement gates (Phase 4/5):
1. Tiered routing (small model default, escalate ambiguous/high-risk only).
2. Quantization accepted only if the §6.3 benchmark stays above thresholds.
3. vLLM continuous batching + prefix caching for the stable policy preamble.
4. Context minimization: relational filters → retrieval → rerank → compress.
5. Strict per-role token budgets; oversized prompts rejected (cost-exhaustion
   adversarial test #23).
6. GPU autoscaling on queue depth; scale-to-zero (KEDA pattern) outside the
   judging window; scheduled warm-up before the demo, cool-down after.
7. Spot capacity for batch evals only — never the live demo path.
8. Single-model route for low-risk cases; verifier reserved for medium/high.
9. Budgets + labeled billing alerts on environment/service; cost-per-decision
   telemetry from GPU-seconds, tokens, retries, cache hits.

## Approval gates

- No GPU node pool before: accelerator quota confirmed AND user-approved
  budget recorded here with date and amount.
- Every nontrivial paid resource requires a Terraform plan + cost note in
  this file before apply.

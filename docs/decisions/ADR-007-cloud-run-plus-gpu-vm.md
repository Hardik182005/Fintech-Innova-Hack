# ADR-007: Cloud Run for services, one Compute Engine VM for model inference

Date: 2026-08-01 · Status: accepted (pending budget approval for the GPU tier)

## Context

Phase 5 deploys three workloads to project `innova-hack` (region `asia-south1`):

1. the FastAPI credit engine (stateless, Postgres-backed),
2. the Next.js BFF frontend (stateless),
3. local model inference — Ollama serving `qwen3:1.7b` (analyst) and
   `mistral-small3.2:24b` (critic). ADR-006 forbids external LLM APIs, so
   inference must run on infrastructure we control.

The choice is Cloud Run vs GKE for 1–2, and where inference lives.

## Decision

**Cloud Run for the API and the frontend.** Both are stateless HTTP services
with request-scoped work — exactly Cloud Run's shape. GKE would add cluster
administration, node billing while idle, and upgrade toil that a two-service
hackathon deployment cannot justify. Fail-closed behaviour is unaffected: OPA
runs embedded alongside the API container (same image or sidecar), and the
Python policy mirror already covers OPA unavailability.

**One Compute Engine VM for Ollama.** Cloud Run GPU is not offered in
`asia-south1`, and moving regions would put the database and services away
from the demo audience. Quota allows exactly one T4 or one L4 in-region.

- Approved-budget tier: `g2-standard-4` (1× L4, 24 GB VRAM) — runs both
  models comfortably. Spot pricing preferred; the VM is stateless (models
  re-pull on boot) so preemption is tolerable.
- Zero-GPU fallback: `e2-standard-4` runs `qwen3:1.7b` on CPU acceptably;
  the 24B critic is then disabled and the verifier honestly reports
  `NO_MODEL_ANALYSIS` — the deterministic engine never depended on it.

The VM gets no public IP; services reach it over the VPC connector on the
private network. Cloud SQL Postgres uses private IP only (ADR-005 data plane).

## Consequences

- Terraform in `infra/` describes: VPC + subnet + VPC-access connector,
  Cloud SQL (private IP), Artifact Registry, Secret Manager entries,
  KMS asymmetric signing key (replaces LocalDevSigner per ADR-002),
  the inference VM (variable-gated GPU vs CPU tier), and two Cloud Run
  services with least-privilege service accounts.
- Nothing is applied until the user approves the budget; the GPU tier is a
  `tfvars` flag so the approval maps to one reviewed line.
- If load ever outgrows one VM, the revisit point is GKE Autopilot with a GPU
  node pool — not more hand-managed VMs.

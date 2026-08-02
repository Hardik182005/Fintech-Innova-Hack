# GCP Deployment Stages — CredenceAI

**Date:** 2026-08-01
**Status:** Local plan only. **No GCP mutation has occurred.**

## The retired gate

`APPROVE_GCP_APPLY` is **retired**. It is too broad: a single token that
authorised core infrastructure and a billable GPU in one step. It must not be
accepted, and this repository will not act on it.

Two explicit gates replace it. They are independent — passing Stage 1 does not
imply Stage 2.

---

## Stage 1 — Core · gate `APPROVE_GCP_STAGE_1_CORE`

**No GPU. No warming. No pinning.** Enforced structurally: `var.enable_gpu`
defaults to `false` and the inference service is `count = var.enable_gpu ? 1 :
0`, so a Stage 1 plan cannot contain a GPU even by operator error.

`terraform plan -var="enable_gpu=false" -var="web_public=false"`
→ **`Plan: 36 to add, 0 to change, 0 to destroy.`**

### Exact resources (36)

| Group | n | Resources |
|---|---|---|
| Network | 4 | `compute_network.vpc`, `compute_subnetwork.main`, `compute_global_address.psa_range`, `service_networking_connection.psa` |
| Database | 5 | `sql_database_instance.pg`, `sql_database.credence`, `sql_user.credence`, `random_password.db`, `secret_manager_secret_version.db_password` |
| Keys / secrets | 5 | `kms_key_ring.credence`, `kms_crypto_key.passport_signing`, `secret_manager_secret.db_password`, `secret_manager_secret.runtime` ×3 |
| Service accounts | 3 | `api`, `web`, `inference` |
| IAM | 12 | KMS signer ×1, secret accessor ×5, `cloudsql.client` ×1, logWriter ×3, metricWriter ×3 — plus the invoker binding below |
| Cloud Run | 3 | `cloud_run_v2_service.api`, `.web`, `cloud_run_v2_service_iam_member.api_from_web` |
| Registry / cost | 2 | `artifact_registry_repository.images`, `billing_budget.credence` |

`google_service_account.inference` is created in Stage 1 deliberately. A service
account is free and creates no billable resource, and having it already exist
keeps Stage 2 down to the GPU service alone.

### Stage 1 exit criteria

All must pass before Stage 2 is even considered:

1. `/v1/health/ready` returns healthy on `credence-api`.
2. Migrations applied; `reconcile()` balances; audit `verify_chain()` returns
   `(True, None)`.
3. Frontend loads and reaches the API through the BFF.
4. **A deterministic credit decision completes end to end with no model
   reachable at all.** `CREDENCE_OLLAMA_BASE_URL` is empty in Stage 1, so the
   gateway fail-closes — and the decision must still be correct. This is the
   central claim of the architecture and Stage 1 is where it gets proved.
5. A policy rejection is recorded as `CONTROLLED_REJECTION`, not `FAILED`.
6. No secret is visible in any browser-reachable response.
7. **Promotional credit application confirmed against a real charge** — a
   non-zero `Credits` column on a real SKU in the billing report.

Criterion 7 is the one that gates Stage 2 financially. Until it is met, credit
coverage of GPU SKUs is **UNKNOWN**, and warming an L4 risks billing the card
directly at 163.09 INR/hour.

---

## Stage 2 — GPU · gate `APPROVE_GCP_STAGE_2_GPU`

Requires: Stage 1 exit criteria **all** passed, **and** credit application
confirmed.

`terraform plan -var="enable_gpu=true" -var="web_public=false"`
→ **`Plan: 38 to add, 0 to change, 0 to destroy.`**

### Exact resources — Stage 2 adds exactly 2

```
google_cloud_run_v2_service.inference[0]
google_cloud_run_v2_service_iam_member.inference_from_api[0]
```

Nothing else changes. Verified by diffing the two saved plans.

### GPU configuration, as it appears in the plan

| Requirement | Planned value | ✓ |
|---|---|---|
| Exactly one L4, max | `accelerator = "nvidia-l4"`, `"nvidia.com/gpu" = "1"`, `max_instance_count = 1` | ✓ |
| Minimum instances 0 | `min_instance_count = 0` | ✓ |
| 8 vCPU | `cpu = "8"` | ✓ |
| 32 GiB | `memory = "32Gi"` | ✓ |
| Concurrency 1 | `max_instance_request_concurrency = 1` | ✓ |
| Zonal redundancy disabled | `gpu_zonal_redundancy_disabled = true` | ✓ |
| No unauthenticated endpoint | `ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"` + invoker limited to the api service account | ✓ |
| Mistral Small 3.2 24B primary | `CREDENCE_PRIMARY_MODEL = "mistral-small3.2:24b"` | ✓ |
| Instance-based billing | `cpu_idle = false` | ✓ |
| Timeout ≤ 600s | `timeout = "600s"` | ✓ |

### Forbidden constructs — scanned, zero hits in both plans

`allUsers`, `allAuthenticatedUsers`, `google_compute_instance`,
`guest_accelerator`, `vpc_access_connector`, `SPOT`, `preemptible`, `a100`,
`h100`, `google_container_cluster` → **0 matches in stage1.tfplan and
stage2.tfplan.**

### Stage 2 procedure

1. Apply with `gpu_min_instances = 0`. Nothing bills until a request arrives.
2. Warm deliberately: `make gpu-warm` (min → 1). Billing starts here.
3. Readiness check, then the structured synthetic benchmark.
4. Fail-closed integration test: make the GPU unreachable and confirm the
   deterministic engine still decides, and that no model output can approve
   credit.
5. **`make gpu-cool` (min → 0) immediately after.** Not "later".

Step 5 is the whole cost-control story. Leaving min at 1 overnight costs
3,914 INR — 78% of the entire budget.

---

## Never, at either stage

- Compute Engine GPU (blocked anyway: `GPUS_ALL_REGIONS = 0`)
- GKE, in any form
- A100 or H100
- Spot or preemptible anything
- An unauthenticated inference endpoint
- A wildcard principal on the API or inference service
- A service-account key file
- Any external LLM API at runtime
- The GPU pinned above min 0 outside an active demo window

## Authority does not move to the GPU

Adding a model changes what the system can *explain*. It changes nothing about
what the system can *decide*. OPA and the deterministic engine remain
authoritative in Stage 2 exactly as in Stage 1, and the Stage 1 exit criteria
prove the decision path is already correct without any model at all.

**The AI recommends. Deterministic systems decide. Financial controls enforce.**

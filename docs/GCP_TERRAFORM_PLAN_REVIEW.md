# Terraform Plan Review — Stage 1 (Core)

**Date:** 2026-08-01
**Command:** `terraform plan -var="enable_gpu=false" -var="web_public=false"`
**Result:** `Plan: 36 to add, 0 to change, 0 to destroy.`
**Applied:** No. Plan saved to `infra/stage1.tfplan`, not executed.

Gate: `APPROVE_GCP_STAGE_1_CORE`. The earlier broad `APPROVE_GCP_APPLY` gate is
retired and will not be honoured.

---

## 1. What changed in the configuration, and why

The previous `infra/` predated the GPU deployment prompt and could not have
worked. Seven corrections:

| # | Was | Now | Reason |
|---|---|---|---|
| 1 | `region = asia-south1` | `asia-southeast1` | Cloud Run L4 in Mumbai may require invitation |
| 2 | `google_compute_instance` + `guest_accelerator` | Cloud Run GPU service | **`GPUS_ALL_REGIONS = 0`** — the VM path cannot be created in this project at all |
| 3 | `inference_spot = true` | no Spot anywhere | Spot is forbidden for a judged demo; Cloud Run has no Spot concept |
| 4 | `member = "allUsers"`, unconditional | `var.web_public`, default **false** | Deployment rules forbid wildcard principals |
| 5 | `google_vpc_access_connector` | Direct VPC egress | Connector runs 2× e2-micro continuously; direct egress has no standing cost |
| 6 | `db_tier = db-custom-1-3840` | `db-g1-small` | 9.04 INR/h = 6,598 INR/month, over the whole budget by itself |
| 7 | budget: 3 thresholds | 5 thresholds + forecast | Deployment rules require 25/50/75/90/100 |

### The one that matters most

`GPUS_ALL_REGIONS = 0` is a project-global ceiling above every regional limit.
Both candidate regions report `NVIDIA_L4_GPUS = 1`, and both are equally
blocked by the global zero. The old `inference.tf` would have failed on apply
regardless of region, Spot setting, or machine type.

## 2. Stage separation is enforced in code, not by discipline

`var.enable_gpu` defaults to `false`, and the entire inference service is
`count = var.enable_gpu ? 1 : 0`. While false, the GPU is not a resource
Terraform can plan, so a Stage 1 apply **cannot** create one even by operator
error. This is a structural guarantee rather than a procedural one.

Verified by scanning the saved plan for every dangerous pattern:

```
grep -iE "allUsers|allAuthenticatedUsers|nvidia|guest_accelerator|
          google_compute_instance|vpc_access_connector|SPOT|preemptible"
  -> no matches
```

Plan outputs confirm the same:

```
gpu_stage_active = false
web_is_public    = false
```

## 3. The 36 Stage 1 resources

**Network (4)** — `compute_network.vpc`, `compute_subnetwork.main`,
`compute_global_address.psa_range`, `service_networking_connection.psa`

**Data (5)** — `sql_database_instance.pg` (`db-g1-small`, ZONAL, private IP
only, `ipv4_enabled = false`), `sql_database.credence`, `sql_user.credence`,
`random_password.db`, `secret_manager_secret_version.db_password`

**Keys and secrets (5)** — `kms_key_ring.credence`,
`kms_crypto_key.passport_signing` (EC_SIGN_P256_SHA256, `prevent_destroy`),
`secret_manager_secret.db_password`, and three runtime secrets (demo token,
reset token, ElevenLabs key). **Secret values are never set by Terraform** and
appear in no state file; they are added out-of-band.

**Identity (3)** — service accounts `api`, `web`, `inference`. No keys are
created for any of them, ever.

**IAM (12)** — KMS signer for api; Secret accessor for api (4) and web (1);
`cloudsql.client` for api; logWriter and metricWriter for all three (6);
`run.invoker` on api restricted to the web service account (1).

No principal receives Owner, Editor, or any wildcard. The `inference` service
account is created in Stage 1 although nothing uses it yet — a service account
is free and creating it now keeps Stage 2 to the GPU service alone.

**Compute (3)** — `cloud_run_v2_service.api` (internal ingress, min 0, max 3),
`cloud_run_v2_service.web` (min 0, max 3), and the api-from-web invoker binding

**Registry and cost (2)** — `artifact_registry_repository.images`,
`billing_budget.credence` (5,000 INR, thresholds 25/50/75/90/100 + forecast)

## 4. Cost of Stage 1

No GPU is created, so the L4 rate of 163.09 INR/hour does not apply at all.

| Item | INR/day |
|---|---|
| Cloud SQL `db-g1-small`, 24h | 112.48 |
| Cloud SQL storage, 10 GiB | 7.49 |
| Cloud Run api + web (min 0, no traffic) | 0.00 |
| KMS, Secret Manager, Artifact Registry, logs | ~8 |
| **Stage 1 total** | **≈ 128 INR/day** |

Stopping the Cloud SQL instance between sessions takes this to roughly
16 INR/day. Cloud SQL is the only resource in Stage 1 that bills while idle.

## 4a. Stage 2 plan, for comparison

`terraform plan -var="enable_gpu=true" -var="web_public=false"`
→ **`Plan: 38 to add, 0 to change, 0 to destroy.`**

Diffing the two saved plans, Stage 2 adds **exactly two** resources:

```
google_cloud_run_v2_service.inference[0]
google_cloud_run_v2_service_iam_member.inference_from_api[0]
```

Confirmed from the plan itself: `accelerator = "nvidia-l4"`,
`"nvidia.com/gpu" = "1"`, `cpu = "8"`, `memory = "32Gi"`,
`min_instance_count = 0`, `max_instance_count = 1`,
`max_instance_request_concurrency = 1`, `gpu_zonal_redundancy_disabled = true`,
`ingress = "INGRESS_TRAFFIC_INTERNAL_ONLY"`, `cpu_idle = false`,
`timeout = "600s"`, `CREDENCE_PRIMARY_MODEL = "mistral-small3.2:24b"`.

An optional `credence-inference-cpu` service exists behind
`var.enable_cpu_fallback` (default false) running `qwen3:1.7b`. It is in
neither plan above. Its container carries
`CREDENCE_MODEL_MAY_APPROVE_CREDIT = "false"`, but that env var is a
convenience, not the control — the prohibition is enforced in the
deterministic engine and in OPA.

### Security scan of both plans

Searched for `allUsers`, `allAuthenticatedUsers`, `google_compute_instance`,
`guest_accelerator`, `vpc_access_connector`, `SPOT`, `preemptible`, `a100`,
`h100`, `google_container_cluster`:

```
stage1.tfplan  -> 0 matches
stage2.tfplan  -> 0 matches
```

No wildcard principal, no VM, no Spot, no GKE, no A100/H100, no paid connector,
in either stage.

## 4b. Credit coverage: UNKNOWN

Whether promotional credit offsets these SKUs — L4, Cloud Run, Cloud SQL,
storage, networking — **cannot be determined before usage exists.** Every
public API path returns 404 or 403 (see `GCP_PREFLIGHT_REPORT.md` §2–3).

**This status is UNKNOWN and must be treated as UNKNOWN until manually
verified in the Console billing report against a real charge.** It is a Stage 1
exit criterion precisely because the consequence is asymmetric: if GPU SKUs are
excluded from the grant, Stage 2 bills 163.09 INR/hour straight to the payment
method with no buffer.

## 5. Known issues in this plan

1. **ADC identity mismatch.** `terraform plan` initially failed on
   `data.google_project.this` with a permission error, because Terraform reads
   Application Default Credentials rather than the active `gcloud` account, and
   the ADC on this machine belongs to a different identity. Resolved by
   removing the data source entirely and using `var.project_number`, verified
   during preflight as `625136990338`. **This must still be fixed before
   apply** — see §6.

2. **`deletion_protection = true` on Cloud SQL.** Intentional. A teardown
   requires clearing it first, which is the desired friction for a ledger.

3. **Budget resource needs Billing Account Administrator.** If it fails on IAM
   during apply, set the budget in the Console instead. Do not widen IAM.

4. **Image tags are `:latest` placeholders.** Real deploys pin a digest. The
   first apply creates services referencing images that do not exist yet, so
   revisions will fail to start until images are pushed. This is expected and
   harmless — a failed revision is not billable.

## 6. Blocking prerequisite before apply

Terraform must authenticate as a principal that can actually administer this
project. Run this yourself — it opens a browser and I should not perform an
authentication flow on your behalf:

```
gcloud auth application-default login
gcloud auth application-default set-quota-project innova-hack
```

Then re-run the plan to confirm it completes without the permission error
before applying.

## 7. Confirmation

`terraform plan` performs no mutation. It reads configuration and refreshes
state; state here is empty, so there was nothing to refresh. **No GCP resource
was created, modified, enabled, deleted, or mutated in producing this plan.**
No `terraform apply` has been run.

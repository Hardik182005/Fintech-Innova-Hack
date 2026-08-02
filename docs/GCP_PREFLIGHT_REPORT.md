# GCP Preflight Report — CredenceAI

**Date:** 2026-08-01
**Mode:** Read-only. No resource was created, modified, enabled, or deleted.
**Gate:** Nothing proceeds until the user sends the literal string `APPROVE_GCP_APPLY`.

Every value below was read from a live API call. Where a value could not be
read, this report says so rather than supplying a plausible number.

---

## 1. Project identity — VERIFIED

| Field | Value | Source |
|---|---|---|
| Project ID | `innova-hack` | `gcloud projects describe` |
| Project number | `625136990338` | `gcloud projects describe` |
| Lifecycle state | `ACTIVE` | `gcloud projects describe` |
| Active principal | `rajeshinduja2015@gmail.com` | `gcloud auth list` |

Matches the identity the user specified. Confirmed.

## 2. Billing — PARTIALLY VERIFIED

| Field | Value | Status |
|---|---|---|
| Billing account | `billingAccounts/019880-229F92-B0CD51` | verified |
| Linked to project | yes | verified |
| `open` | `true` | verified |
| `currencyCode` | **INR** | verified |
| `masterBillingAccount` | empty (not a sub-account) | verified |
| Account mode | paid / upgraded, per the user | user-stated |
| **Remaining promotional credit** | **NOT READABLE** | see below |
| **Credit expiry date** | **NOT READABLE** | see below |
| **Current spend to date** | **NOT READABLE** | see below |

### Why the credit balance could not be read

Promotional credit balance and expiry are not exposed by any public Google
Cloud API. Four candidate endpoints were tried and all failed:

```
HTTP 404  cloudbilling.googleapis.com/v1beta/billingAccounts/{BA}/credits
HTTP 404  cloudbilling.googleapis.com/v1/billingAccounts/{BA}/promotions
HTTP 404  cloudbilling.googleapis.com/v1beta/billingAccounts/{BA}:getCredits
HTTP 403  cloudcommerceconsumerprocurement.googleapis.com/v1/billingAccounts/{BA}/orders
```

No BigQuery billing export is configured, which is the only mechanism that
would expose per-SKU credit line items programmatically.

**These three values must be read from the Console before apply:**

- Credit balance and expiry — https://console.cloud.google.com/billing/019880-229F92-B0CD51/credits
- Spend to date — https://console.cloud.google.com/billing/019880-229F92-B0CD51/reports

This report will not guess at them, and the apply gate should not be opened
until those two pages have been read.

## 3. Credit offset per service — UNVERIFIABLE IN ADVANCE

The user asked whether L4, Cloud Run, Cloud SQL, storage and networking usage
are offset by the promotional credit. This cannot be determined before usage
exists, for a structural reason: eligibility is a property of the specific
credit grant's terms, and the only authoritative evidence is the `Credits`
column of the billing report once a charge for that SKU has actually landed.

What can be said accurately:

- Google Cloud promotional credits apply automatically and are consumed
  **before** the payment method is charged. Nothing needs to be configured to
  "use trial credits first" — that ordering is automatic on a paid account.
- Some credit grants exclude specific SKU families. GPUs are the most commonly
  excluded family. Whether *this* grant covers L4 is stated in the credit's own
  terms on the Console credits page.
- The consequence of being wrong is asymmetric: if GPU SKUs turn out to be
  excluded, GPU usage bills straight to the card at the rates in
  `GCP_COST_ESTIMATE.md`, with no credit buffer at all.

**Recommended verification order, which costs almost nothing:**

1. Read the credit terms on the Console credits page.
2. After apply, deploy the CPU services and the database first, and let one
   small charge land.
3. Open the billing report grouped by SKU and confirm a non-zero `Credits`
   column against those SKUs.
4. Only then warm the GPU.

## 4. Enabled APIs — VERIFIED

37 services enabled, including every API the target architecture needs:
`run`, `sqladmin`, `secretmanager`, `cloudkms`, `artifactregistry`, `compute`,
`vpcaccess`, `servicenetworking`, `cloudbuild`, `pubsub`, `monitoring`,
`logging`, `storage`, `bigquery`.

**No API enablement is required.** Nothing on the apply path needs a service
turned on, which removes one class of mutation from the plan.

Not enabled and not needed: `billingbudgets.googleapis.com` is required only if
the budget is created via API rather than Console.

## 5. Existing resources — PROJECT IS EMPTY

| Resource type | Found |
|---|---|
| Cloud Run services | none |
| Cloud SQL instances | none |
| Artifact Registry repositories | none |
| Compute Engine instances | none |
| GCS buckets | none |
| Secret Manager secrets | none |
| KMS key rings | none |
| VPC networks | `default` only |
| Service accounts | `625136990338-compute@developer.gserviceaccount.com` only |

There is nothing to collide with and nothing to preserve. A rollback is
therefore a clean teardown rather than a restore.

## 6. GPU quota — THE DECIDING FINDING

### 6.1 Compute Engine GPU path is BLOCKED

| Scope | Metric | Limit |
|---|---|---|
| **Project, global** | **`GPUS_ALL_REGIONS`** | **0** |
| asia-south1 | `NVIDIA_L4_GPUS` | 1 |
| asia-south1 | `PREEMPTIBLE_NVIDIA_L4_GPUS` | 1 |
| asia-southeast1 | `NVIDIA_L4_GPUS` | 1 |
| asia-southeast1 | `PREEMPTIBLE_NVIDIA_L4_GPUS` | 1 |

`GPUS_ALL_REGIONS = 0` is a global ceiling that applies on top of every
regional limit. A regional limit of 1 is irrelevant while the global limit is
0. **No Compute Engine GPU VM can be created in this project today**, in any
region, on-demand or Spot.

This is not a cost judgement, it is an availability fact, and it removes the
G2 VM option from the plan unless a quota increase is requested and granted.

### 6.2 Cloud Run GPU path — plausible, limit not readable

Cloud Run GPU quota is a separate `run.googleapis.com` quota and is **not**
gated by `GPUS_ALL_REGIONS`.

| Quota ID | Region applicable | Effective limit |
|---|---|---|
| `NvidiaL4GpuAllocNoZonalRedundancyPerProjectRegion` | asia-southeast1 listed | **not returned by API** |
| `NvidiaL4GpuAllocPerProjectRegion` | asia-southeast1 listed | **not returned by API** |

Both quotas return `details: {}` and `defaultLimit: null` / `effectiveLimit:
null` from both the Cloud Quotas API and the Service Usage API. An empty
`details` means no project-level override has been set; it does not disclose
the underlying default.

Both report `quotaIncreaseEligibility.isEligible: true`, and `asia-southeast1`
appears in `applicableLocations` for both.

**Honest conclusion:** whether this project can allocate a Cloud Run L4 today
is not determinable by any read-only call. The first `gcloud run deploy` with
`--gpu 1` is itself the test. It will either succeed or fail immediately with a
quota error, and a failed deploy creates no billable GPU resource — so the test
is safe and cheap. This is the recommended way to resolve the unknown, and it
must happen after `APPROVE_GCP_APPLY`, not before.

## 7. Region decision

`asia-southeast1` (Singapore), per the master prompt, which warns that Cloud
Run L4 in Mumbai may require invitation.

Note that the preflight found **identical** Compute Engine L4 quota in
asia-south1 and asia-southeast1 — both 1, both equally blocked by the global 0.
So the Mumbai-versus-Singapore question is settled by Cloud Run GPU regional
availability, not by the Compute Engine numbers.

Cost of the region choice: ~40 ms additional round-trip latency from India.
Irrelevant next to multi-second model inference.

## 8. Terraform state — NOTHING APPLIED

No `.tfstate` file exists anywhere in the repository. Nothing has ever been
applied. Every resource in the plan would be a create.

## 9. Existing `infra/` is outdated and must be rewritten

The `infra/` directory predates the GPU master prompt and conflicts with it:

| `infra/` today | Master prompt requires |
|---|---|
| `region = asia-south1` | `asia-southeast1` |
| `google_compute_instance` for Ollama | Cloud Run service with `--gpu 1` |
| `g2-standard-4` VM | Cloud Run, 8 vCPU / 32 GiB |
| `inference_spot = true` | Spot explicitly forbidden for judging |
| `db_tier = db-custom-1-3840` | over budget — see cost report |

The Compute Engine approach in `infra/inference.tf` cannot work at all given
`GPUS_ALL_REGIONS = 0`. Rewriting Terraform is a local file change and needs no
GCP approval, but it has not been done yet.

## 10. Risks and blockers

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | GPU idle burn at `min-instances=1` — ₹3,914/day | **critical** | keep min 0; `make gpu-warm` only before demo; `make gpu-cool` straight after |
| 2 | Credit may not cover GPU SKUs | **high** | verify `Credits` column on a small charge before warming GPU |
| 3 | Cloud Run L4 quota unknown | **high** | resolved by first deploy attempt; fails safe |
| 4 | Cold start with a 24B model at min 0 | **high** | bake model into image; warm before demo |
| 5 | Budget alerts lag actual spend by hours | medium | a budget is an alert, never a cap |
| 6 | `db-custom-1-3840` alone exceeds ₹5,000/mo | medium | use `db-g1-small`; stop instance when idle |
| 7 | Compute Engine fallback unavailable | medium | Cloud Run CPU fallback with `qwen3:1.7b`, which must not approve credit |

## 11. Confirmation

**No GCP resource was created, modified, enabled, deleted, or otherwise
mutated during this preflight.** Every command was `describe`, `list`, or an
HTTP `GET`. No IAM binding was changed, no API was enabled, no quota increase
was requested, no budget was created, and no `terraform apply` was run.

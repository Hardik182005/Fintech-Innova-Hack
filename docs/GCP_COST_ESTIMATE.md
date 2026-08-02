# GCP Cost Estimate — CredenceAI

**Date:** 2026-08-01
**Region:** `asia-southeast1` (Singapore)
**Currency:** INR — the billing account's own currency, so no FX conversion is
applied anywhere in this document.

## Source of every price

All unit prices were pulled live from the Cloud Billing Catalog API with
`currencyCode=INR`, filtered to `serviceRegions` containing `asia-southeast1`.
**No price in this document was recalled from memory, converted from USD, or
copied from a pricing page.** Re-runnable via:

```
GET https://cloudbilling.googleapis.com/v1/services/{serviceId}/skus?currencyCode=INR
```

| Service | Catalog service ID |
|---|---|
| Cloud Run | `152E-C115-5142` |
| Compute Engine | `6F81-5844-456A` |
| Cloud SQL | `9662-B51E-5089` |
| Cloud Storage | `95FF-2EF5-5EA1` |
| Artifact Registry | `149C-F9EC-3994` |

---

## 1. Unit prices as read

### Cloud Run, asia-southeast1

| SKU | INR per unit | Unit |
|---|---|---|
| NVIDIA L4 GPU, **no zonal redundancy** | 0.02142858 | second |
| NVIDIA L4 GPU, with zonal redundancy | 0.03338819 | second |
| Services CPU (instance-based billing) | 0.00206596 | vCPU-second |
| Services Memory (instance-based billing) | 0.00022955 | GiB-second |
| Services CPU Tier 2 (request-based) | 0.00321371 | vCPU-second |
| Services Memory Tier 2 (request-based) | 0.00033476 | GiB-second |

Zonal redundancy disabled saves **35.8%** on the GPU SKU (0.02142858 vs
0.03338819). The master prompt requires it disabled; the price confirms that is
also the right call financially.

### Cloud SQL for PostgreSQL, Singapore

| SKU | INR/hour |
|---|---|
| Zonal — Micro instance (`db-f1-micro`) | 1.40599987 |
| Zonal — Small instance (`db-g1-small`) | 4.68666625 |
| Zonal — vCPU | 5.52835325 |
| Zonal — RAM | 0.93733325 per GiB |
| Zonal — Standard storage | 22.76380750 per GiB-**month** |
| Zonal — IP address reservation | 1.33904750 |

### Compute Engine G2, Singapore (comparison only)

| SKU | INR/hour |
|---|---|
| G2 Instance Core | 2.94857877 |
| G2 Instance RAM | 0.34543533 per GiB |
| NVIDIA L4 GPU | 66.08406008 |
| Spot G2 Core / RAM / L4 | 1.76945562 / 0.20726542 / 39.65493525 |

---

## 2. The single most important number

`credence-inference` as specified — 1× L4, 8 vCPU, 32 GiB, instance-based
billing, zonal redundancy off:

| Component | INR/second | INR/hour |
|---|---|---|
| L4 GPU (no ZR) | 0.02142858 | 77.14 |
| CPU × 8 | 0.01652768 | 59.50 |
| Memory × 32 GiB | 0.00734560 | 26.44 |
| **Total while an instance is alive** | **0.04530186** | **₹163.09** |

> ### ₹163.09 per hour. ₹3,914 per day.
>
> Under instance-based billing this accrues for the **entire lifetime of the
> instance**, not just while a request is in flight. One GPU instance left
> running for 24 hours consumes **₹3,914 — roughly 78% of the entire ₹5,000
> budget in a single day.**

This is the whole reason `min-instances` must stay at 0.

### GPU warm-up cost by duration

At 0.04530186 INR/second for the whole instance (GPU + 8 vCPU + 32 GiB):

| Warm window | Seconds | Cost |
|---|---|---|
| 10 minutes | 600 | **₹27.18** |
| 15 minutes | 900 | **₹40.77** |
| 30 minutes | 1,800 | **₹81.54** |
| 120 minutes | 7,200 | **₹326.17** |
| 24 hours (never do this) | 86,400 | **₹3,914.08** |

A demo warmed for 30 minutes costs about ₹82. The budget absorbs roughly sixty
such windows. The risk was never the warming — it is forgetting to cool.

`make gpu-cool` is therefore not an optimisation. It is the control.

### Idle cost, by what is left running

| State | INR/day | INR/month |
|---|---|---|
| Everything deployed, GPU min 0, Cloud SQL running | ≈ 128 | ≈ 3,840 |
| Same, but Cloud SQL **stopped** | ≈ 16 | ≈ 480 |
| Stage 1 only (no GPU service exists), Cloud SQL running | ≈ 128 | ≈ 3,840 |
| GPU pinned at min 1 | ≈ 4,049 | — budget gone in ~1.2 days |

Cloud Run at `min-instances = 0` contributes **exactly zero** when idle — that
is the property being bought by accepting cold starts. **Cloud SQL is the only
resource in this design that bills while doing nothing.**

---

## 3. Scenarios

### A — Parked (default state: GPU at min 0, no demo running)

| Item | INR/day |
|---|---|
| GPU service, min 0, no traffic | 0.00 |
| web + api, min 0, no traffic | 0.00 |
| Cloud SQL `db-g1-small`, 24h | 112.48 |
| Cloud SQL storage, 10 GiB | 7.49 |
| Artifact Registry, Secret Manager, KMS, logs | ~8 (approx.) |
| **Total** | **≈ ₹128/day → ≈ ₹3,840/month** |

At `db-g1-small` the *idle* system alone consumes 77% of a ₹5,000 monthly
budget while doing nothing. Two ways to fix that:

| Variant | INR/day | INR/month |
|---|---|---|
| A with `db-f1-micro` instead | ≈ 49 | ≈ 1,470 |
| A with Cloud SQL **stopped** between sessions | ≈ 16 | ≈ 480 |

Stopping the Cloud SQL instance halts compute billing while storage continues.
This is what `make sandbox-pause` should do, and it is the difference between
₹3,840 and ₹480 a month.

### B — Demo day (GPU warmed 2h, DB up all day, light traffic)

| Item | INR/day |
|---|---|
| GPU service, 2h × ₹163.09 | 326.17 |
| Cloud SQL `db-g1-small`, 24h | 112.48 |
| web + api request-based, light | ~6 |
| storage, registry, secrets, logs | ~16 |
| **Total** | **≈ ₹461/day** |

A full demo day costs under ₹500. The budget comfortably supports roughly ten
such days.

### C — Worst allowed 24 hours (GPU pinned at min-instances=1)

| Item | INR/day |
|---|---|
| GPU service, 24h × ₹163.09 | 3,914.08 |
| Cloud SQL `db-g1-small`, 24h | 112.48 |
| everything else | ~22 |
| **Total** | **≈ ₹4,049 in one day** |

**Two consecutive days in this state exceeds the ₹5,000 budget outright.**

Worse, budget alerts are evaluated against usage that itself lags by hours. A
24-hour GPU burn can substantially complete *before* the 90% alert is
delivered. This is the concrete meaning of the rule below.

---

## 4. Cloud Run GPU versus G2 VM

| | Cloud Run GPU | `g2-standard-8` VM |
|---|---|---|
| Cost per hour while serving | ₹163.09 | ₹100.73 |
| Cost per hour while idle | **₹0.00** | ₹100.73 |
| Cost per 24h, demo pattern (~2h use) | ₹326 | ₹2,417 |
| Cost per 30 days, demo pattern | ~₹9,785 → but only on demo days | ₹72,523 |
| Scales to zero | yes | no |
| Spot interruption risk | none | yes, and Spot is forbidden for judging |
| **Available in this project today** | unknown, quota not readable | **NO — `GPUS_ALL_REGIONS = 0`** |

**Break-even: 14.8 GPU-serving hours per day.** Below that, Cloud Run is
cheaper. A demo workload uses one to three hours, so Cloud Run wins by roughly
an order of magnitude.

The comparison is in any case academic: the G2 VM path is blocked outright by
the global GPU quota of 0. Cloud Run is both the cheaper option and the only
available one.

### A correction to earlier advice

Earlier in this project I recommended CPU inference over GPU, and the main
argument was Spot preemption risk — a Spot VM being reclaimed mid-demo. That
argument does not apply to Cloud Run GPU, which has no Spot mechanism and no
preemption. That reasoning should not carry any weight in this decision.

The remaining honest arguments for keeping a CPU fallback are cold-start time
and the possibility that credits exclude GPU SKUs — not preemption.

---

## 5. Cost controls that follow from these numbers

1. `min-instances = 0` on `credence-inference`, always, except in the minutes
   before a demo. This is the single control that matters.
2. `make gpu-warm` / `make gpu-cool` to flip min-instances 1/0, so warming is
   explicit, deliberate, and short.
3. Zonal redundancy **disabled** — 35.8% cheaper on the dominant SKU.
4. `max-instances = 1` and `concurrency = 1`, so the GPU cost cannot multiply.
5. Request timeout ≤ 600s, bounding a single runaway request to ₹27.18.
6. Cloud SQL `db-g1-small`, not `db-custom-1-3840` (₹6,598/month, over budget
   on its own).
7. `make sandbox-pause` stops Cloud SQL between sessions: ₹3,840 → ₹480/month.
8. Private IAM on every service — no `allUsers`. An exposed GPU endpoint is a
   financial exposure, not only a security one.
9. Budget ₹5,000 with alerts at 25/50/75/90/100%.

## 6. Rules restated

> **A budget is an alert, not a spending cap.** Google Cloud does not stop
> resources when a budget threshold is crossed. Spend continues until a human
> acts. Alerts also lag real usage by hours.

> **The promotional credit is not a hard cap either.** On a paid account,
> credits are consumed first and then charges continue to the payment method
> automatically, with no interruption and no confirmation prompt.

Neither mechanism will stop a GPU left running. Only `min-instances = 0` will.

## 7. Accuracy notes

- Unit prices: read live from the Catalog API. Exact.
- Resource shapes: exactly as specified in the master prompt.
- Traffic-dependent lines (request-based CPU/memory, egress, logging) are
  marked approximate and are small relative to GPU and Cloud SQL.
- Artifact Registry storage depends on final image sizes, which do not exist
  yet; if the 24B model is baked into the image, expect roughly 15–20 GiB.
- **Whether any of this is offset by promotional credit is unverified.** See
  `GCP_PREFLIGHT_REPORT.md` §3. If GPU SKUs are excluded from the grant, every
  GPU figure above bills directly to the payment method.

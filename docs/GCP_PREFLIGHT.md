# GCP Preflight Record — 2026-08-01

Read-only checks executed before any resource changes (spec §2).

| Check | Result |
|---|---|
| `gcloud auth list` active account | `rajeshinduja2015@gmail.com` ✔ matches expected deploying account |
| Other credentialed accounts | avinashgehi3@gmail.com, hardikhinduja399@gmail.com, hinduja.sneha7@gmail.com (inactive) |
| `gcloud config get-value project` | `ma-dataroom-503911` — **not** innova-hack; global config intentionally left untouched |
| `gcloud projects describe innova-hack` | ACTIVE, name "Innova Hack", project number `625136990338` ✔ matches spec |
| Billing | `billingEnabled: true` (account `019880-229F92-B0CD51`) |

Decisions:

- The user's global gcloud project config points at an unrelated project. To
  avoid disrupting other work, **all CredenceAI gcloud/terraform invocations
  pass `--project innova-hack` explicitly** (or use a dedicated named gcloud
  configuration) instead of mutating the global default.
- No resources have been created or modified. Resource inventory and quota
  checks will be re-run at the start of Phase 5 (infrastructure), immediately
  before the first Terraform plan.
- No GPU or paid accelerator will be provisioned before quota verification and
  explicit user budget approval (spec §2.9).

## Update — 2026-08-01 (evening): preflight completed

| Check | Result |
|---|---|
| IAM on `innova-hack` | `rajeshinduja2015@gmail.com` = `roles/owner` (the active account). No role for other accounts. |
| APIs enabled today | run, sqladmin, secretmanager, cloudkms, artifactregistry, compute, vpcaccess, servicenetworking, cloudbuild (operation finished successfully; API enablement is free) |
| Cloud Run in `asia-south1` | Available ✔ |
| CPU quota (asia-south1) | CPUS 100, E2_CPUS 400, N2_CPUS 400 — ample for CPU inference and services |
| GPU quota (asia-south1) | **NVIDIA_T4_GPUS = 1, NVIDIA_L4_GPUS = 1** — one single-GPU VM is possible without a quota request |
| Resources created | **None.** API enablement only. |

Gate before Phase 5 apply: user budget approval for any billable resource,
GPU VM included (spec §2.9). Terraform will be authored and planned, not
applied, until that approval is recorded here.

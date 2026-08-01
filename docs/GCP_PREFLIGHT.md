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

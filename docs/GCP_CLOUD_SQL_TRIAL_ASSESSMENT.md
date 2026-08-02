# GCP Cloud SQL Free-Trial Eligibility Assessment — `innova-hack`

**Date:** 2026-08-01
**Mode:** Read-only. No GCP resource was created, modified, enabled, or deleted
while producing this report. Every command below is `describe`, `list`, or an
HTTP `GET`. No `gcloud sql instances create`, no API enablement, no
`terraform apply`.

**Bottom line up front:** a genuine Cloud SQL free trial exists, but it turns
out to be **two unrelated programs**, and neither one is a safe fit for this
project's requirements. **Recommendation: use `db-g1-small` (paid), not the
free trial.** Details and evidence below.

---

## 0. What "FDC Trial" actually is — the key discovery

The preflight's billing-catalog pull surfaced SKUs literally named `FDC Trial
in Cloud SQL for PostgreSQL: Zonal - vCPU in Singapore`. The natural reading —
"this is the Cloud SQL free-trial SKU" — is only half right. **`FDC` stands
for Firebase Data Connect** (the product has since been renamed "SQL
Connect"). The SKU family belongs to a **separate, smaller trial program**
than the one described on the main Cloud SQL marketing/docs pages. There are
two distinct offers:

| | **A. Cloud SQL 30-day free trial instance** | **B. Firebase Data Connect (FDC) no-cost trial** |
|---|---|---|
| Where it's created | Cloud SQL Console → "Get Started" page | Firebase Data Connect / SQL Connect setup flow |
| Hardware | Enterprise Plus, N2, **8 vCPU / 64 GB RAM**, 100 GB storage, 375 GB optional data cache | **db-f1-micro equivalent**, 1 vCPU / ~628 MB RAM, 10 GB SSD |
| PostgreSQL version | Not documented explicitly; Enterprise Plus is the default edition for PG16+ | Fixed at **PostgreSQL 17** |
| Duration | 30 days, then 90-day stopped grace period | Spark: 90 days/project lifetime. Blaze: 3 months, up to 5 trials/billing account |
| Billing-catalog SKU family | Not separately named — appears to ride on the standard "Enterprise Plus" SKUs with a trial credit applied | **This is the `FDC Trial …` SKU family** |
| Private IP | Not documented (see §5) | **Explicitly breaks the trial** — see §5 |

This matters because the architecture in this repo (PostgreSQL 16, private-IP
only, `db-g1-small`-class sizing) does not match either program cleanly, and
the SKU evidence the preflight found (program B) is **not** the "big" 30-day
trial most people mean when they say "Cloud SQL free trial."

---

## 1. Does the trial exist, and what does it include? — VERIFIED (with caveats)

### 1a. Program A — Cloud SQL 30-day free trial instance

Source: [Free trial instance overview — Cloud SQL for PostgreSQL](https://docs.cloud.google.com/sql/docs/postgres/free-trial-instance), [Create a free trial instance](https://docs.cloud.google.com/sql/docs/postgres/create-free-trial-instance), [Launching a new Cloud SQL 30-day free trial instance (blog)](https://cloud.google.com/blog/products/databases/launching-a-new-cloud-sql-30-day-free-trial-instance/), [announcement thread](https://discuss.google.dev/t/announcing-cloud-sql-free-trial-instances-experience-the-power-of-a-fully-managed-database/296268).

- **Edition:** Cloud SQL Enterprise Plus, N2 machine series
- **Compute:** 8 vCPU, 64 GB memory
- **Storage:** 100 GB (375 GB optional local-SSD data cache)
- **HA:** optional, available during trial
- **Duration:** up to 30 days from creation
- **Per-project limit:** "One free trial instance allowed per project
  lifecycle"
- **SLA:** explicitly **none** — "SLAs don't apply to a free trial instance"
- **Backups:** explicitly **unsupported** — "Free trial instances don't
  support backups or restore" (an optional final backup is taken on deletion,
  retained 30–365 days)
- **Regions:** all regions that support Cloud SQL Enterprise Plus edition
  (confirmed to include `asia-southeast1` — see §4)
- **Post-trial:** instance auto-stops after 30 days, is retained at no cost
  for a further 90 days in a stopped state (one-click upgrade to paid
  available any time in that 120-day window), then is scheduled for deletion
- **Trial clock:** runs continuously from creation regardless of whether the
  instance is stopped — "30 days have elapsed since you first created your
  free trial instance" is the only stated end condition besides manual
  deletion. **Stopping the instance does not pause or extend the trial.**
- **Creation UI fields:** Database Engine, Instance ID, Password, Region only
  — no network/VPC/IP configuration step is described anywhere in the
  creation walkthrough.

### 1b. Program B — Firebase Data Connect (FDC) no-cost trial

Source: [Introducing no-cost trials for Data Connect (Firebase blog)](https://firebase.blog/posts/2026/03/fdc-ift/).

- **Hardware:** PostgreSQL 17 instance equivalent to `db-f1-micro` — 1 vCPU,
  10 GB SSD, ~628 MB memory
- **Spark plan:** 90-day trial per project, one trial database per project
  lifetime, no credit card required; ~8,000 daily operations / 330 MiB
  egress quota; 30-day grace period after expiry, then deletion unless
  upgraded to Blaze
- **Blaze plan:** 3-month complimentary trial, up to 5 free trials per
  billing account, one trial instance per project (can coexist with paid
  instances); automatically transitions to standard paid billing at
  expiry
- **Critical restriction, quoted verbatim from the source:** *"Blaze users
  can change configuration settings—like adding compute resources, setting
  up a private IP, or creating read replicas. However, if you make any
  changes to your database instance configuration, you will exit the trial
  and be billed according to Cloud SQL pricing."*

---

## 2. Is `innova-hack` eligible? — INFERRED, not conclusively provable read-only

### What was verified about the project itself

```
$ gcloud sql instances list --project=innova-hack --format=json
[]
```
**VERIFIED** — zero Cloud SQL instances have ever existed in this project, so
it satisfies "new Cloud SQL project" language used for program A's
eligibility, and the "one trial per project lifecycle" constraint for both
programs is untouched.

```
$ gcloud beta billing accounts describe 019880-229F92-B0CD51 --format=json
{
  "currencyCode": "INR",
  "displayName": "My Billing Account",
  "masterBillingAccount": "",
  "name": "billingAccounts/019880-229F92-B0CD51",
  "open": true,
  "parent": ""
}
```
**VERIFIED** (re-confirms preflight) — this is a standalone, open, paid/
upgraded billing account in INR.

### The reasoning on paid-account eligibility

Google's own docs for program A explicitly target *"both new and existing
Google Cloud customers"* and describe it as complementary to, not
conditional on, the $300 signup credit. No fetched page states that a
paid/upgraded billing account disqualifies a project from the per-project
Cloud SQL trial. **INFERRED (moderate confidence):** the billing account's
own "trial vs. paid" state is very likely irrelevant — eligibility is scoped
to the *project* (never had a Cloud SQL instance / never used a trial
before), not the *billing account's payment status*. This is inference from
absence of a contrary statement across five official pages, not a positive
confirmation.

### The billing-catalog SKU evidence, and what it does and doesn't prove

The task brief suggested that a trial SKU priced at ¥0 vs. priced normally
would be meaningful evidence. It is — and the result is informative in a way
that complicates the picture. A full, paginated, INR-currency pull of the
live Cloud Billing Catalog for the `Cloud SQL` service (`services/9662-B51E-
5089`, 19,430 SKUs total) was performed and searched for every `FDC Trial …
Singapore` SKU. **None of them are priced at zero:**

| SKU (Singapore) | List price (INR/hour) |
|---|---|
| `FDC Trial in Cloud SQL for PostgreSQL: Zonal - Micro instance in Singapore` | 1.405999874 |
| `FDC Trial in Cloud SQL for PostgreSQL: Regional - Micro instance in Singapore` | 2.811999749 |
| `FDC Trial in Cloud SQL for PostgreSQL: Zonal - vCPU in Singapore` | 5.528353249 |
| `FDC Trial in Cloud SQL for PostgreSQL: Regional - vCPU in Singapore` | 11.056706499 |

**VERIFIED via live `cloudbilling.googleapis.com/v1/services/9662-B51E-5089/skus`
pull, `effectiveTime: 2026-08-01T07:00:00Z`.** These are standard "rack rate"
prices, not zero. This means the no-cost experience for the FDC trial is
implemented as a **credit/discount applied at billing time against normal
metered SKUs**, not as a distinct zero-priced SKU. Consequently: **the
Catalog API cannot settle per-project trial eligibility either way** — the
catalog only shows what the SKU would cost a non-trial user; whether *this
project* gets the entitlement credit is an internal Firebase/billing
determination invisible to any read-only API. This is genuinely a dead end
for read-only verification.

### What would actually settle eligibility

Read-only signal that would help but wasn't obtainable via API:
- Opening the Cloud SQL Console "Get Started — Experience Cloud SQL at no
  cost for 30 days" page for `innova-hack` and confirming the free-trial
  option is offered (not grayed out) — this is a page view, not a mutation,
  so the user can safely check it before deciding.
- Opening Firebase Data Connect setup for a Firebase-linked view of
  `innova-hack` (if the project is/becomes a Firebase project) to see if the
  no-cost trial offer appears.
- No `gcloud`/API call can answer this; the entitlement check appears to
  happen only inside the Console/Firebase Console UI at creation time.

**Conclusion for §2: UNKNOWN, definitively — cannot be proven read-only.**
The project *looks* eligible on every criterion that is documented (never
had an instance, billing account open), but Google does not expose an
eligibility-check endpoint, and the one piece of hard evidence available
(SKU pricing) is neutral rather than confirmatory.

---

## 3. Can Terraform create a free-trial instance? — VERIFIED: NO

Three independent checks, all converging on the same answer:

1. **`gcloud sql instances create --help`** (read-only) shows an
   `--edition=EDITION` flag but no `--trial`, `--free-trial`, or similar flag
   anywhere in its help text.
2. **Terraform `google` provider, `google_sql_database_instance` resource**
   (fetched from the canonical source markdown at
   `github.com/hashicorp/terraform-provider-google-beta`): the `edition`
   argument under `settings` accepts exactly two values — **`ENTERPRISE`**
   and **`ENTERPRISE_PLUS`**. A full-text scan of the entire resource page
   for "trial", "free trial", and "no-cost" returned **zero matches**.
3. **Program A's own creation documentation** walks through Console-only
   steps (Database Engine → Instance ID → Password → Region → "Create free
   instance") with no CLI, API, or Terraform alternative mentioned anywhere.

**Conclusion:** there is no API-level "give me a trial instance" parameter.
A free-trial Cloud SQL instance can only be originated through the Console
"Get Started" wizard (program A) or the Firebase Data Connect setup flow
(program B). Once it exists, it is a normal `sqladmin`-API-visible instance,
so it *could* subsequently be brought under Terraform with `terraform
import google_sql_database_instance.x projects/innova-hack/instances/<name>`
— but this is operationally hazardous, not merely inconvenient:

- For program B, the trial's own terms say **any configuration change exits
  the trial** — and a `terraform apply` against an imported resource will
  frequently want to "correct" drift (disk autoresize flags, backup
  configuration defaults, flag ordering) even when no field was
  intentionally changed. A single reconciling apply could silently flip the
  instance to paid billing.
- For program A, the instance is described as having a "preset
  configuration" that can only be changed by "upgrading to paid" — the same
  drift risk applies, and it is undocumented whether Terraform-driven
  changes are even accepted while trial status is active, or whether they
  trigger an implicit upgrade.

Either way: **import-then-manage-with-Terraform is technically possible but
not safe for an environment you intend to keep declarative and reproducible
under time pressure during a hackathon.**

---

## 4. Region availability: `asia-southeast1` — VERIFIED: SUPPORTED

Three independent, read-only, live signals all confirm Singapore support:

```
$ gcloud sql tiers list --project=innova-hack --format=json
```
`asia-southeast1` appears in the region list for `db-f1-micro`, `db-g1-small`,
and — critically — **`db-perf-optimized-N-8`** (137 GB RAM ceiling tier,
the tier family matching the trial's 8 vCPU Enterprise Plus spec). **VERIFIED.**

The live Cloud Billing Catalog pull returned full sets of standard
`Cloud SQL for PostgreSQL: {Zonal,Regional} - Enterprise Plus …` SKUs
explicitly labeled "in Singapore" (vCPU, RAM, storage, data cache, C4A
performance-optimized variants — all present). **VERIFIED.**

The `FDC Trial …` SKUs found in §2 explicitly carry `"serviceRegions":
["asia-southeast1"]` in their category metadata. **VERIFIED.**

**Conclusion: `asia-southeast1` supports both the Enterprise Plus edition
(program A's hardware) and the FDC trial infrastructure (program B).**
Region is not a blocker for either program.

---

## 5. Private-IP-only compatibility — the hard requirement — MIXED, ONE CONFIRMED FAILURE

This is the single most important finding for the architecture in this repo.

### Program B (FDC trial): DISQUALIFIED — VERIFIED

Quoted directly from Google's own announcement (see §1b): enabling a private
IP on an FDC trial instance is explicitly listed as one of the actions that
**"exit[s] the trial and [gets] billed according to Cloud SQL pricing."**
This is unambiguous: **you cannot have both "free" and "private IP" on this
program simultaneously.** If private IP is enabled, it becomes an ordinary
billed `db-f1-micro`-equivalent instance — at that point there is no reason
to use it over deliberately creating a normal paid instance, and it is
additionally locked to PostgreSQL 17, not the PostgreSQL 16 this project
requires.

### Program A (30-day trial): UNKNOWN — not documented either way

Every fetched page for program A (overview, creation walkthrough,
announcement blog, forum thread) was searched specifically for "IP", "private",
"VPC", "network", "ipv4_enabled", and "peering". **None of them mention
networking configuration at all.** The creation wizard's documented fields
(Database Engine, Instance ID, Password, Region) contain no network/IP step,
which is suggestive — a wizard with no exposed network option typically means
it defaults to whatever the platform default is (public IP with authorized
networks) — but this is an **inference from the absence of a UI field**, not
a documented restriction, and it is not safe to treat as proof either way.

**This is the one item in this assessment that genuinely cannot be resolved
without either (a) creating the instance, which the read-only constraint on
this task forbids, or (b) a human opening the Console "Get Started" wizard
far enough to see whether a network/private-IP section appears, without
clicking the final "Create free instance" button.** That second option is
safe (page views don't mutate anything) and is the recommended next step if
program A is still under consideration after reading §7.

**If it turns out program A forces public IP with no private option, that
alone disqualifies it per this project's hard requirement — flag loudly:
this is a real, live risk, not a hypothetical one, given the documentation
gap.**

---

## 6. Operational limitations — VERIFIED (program A)

| Property | Value | Status |
|---|---|---|
| SLA | None — "SLAs don't apply to a free trial instance" | VERIFIED |
| Backups/restore | Not supported during trial; one optional final backup on deletion (30–365 day retention) | VERIFIED |
| HA | Optional, available (PostgreSQL only) | VERIFIED |
| Maintenance | Enterprise Plus "near-zero downtime" maintenance listed as a testable feature | VERIFIED |
| Stop/start | Can be stopped, but the 30-day clock is wall-clock from creation and does **not** pause on stop | VERIFIED |
| Storage cap | 100 GB fixed; "to increase storage and compute, upgrade to paid" | VERIFIED |
| Day-30 outcome | Auto-stop → 90-day no-cost stopped grace period → scheduled deletion at day 120 if not upgraded; one-click upgrade to paid available any time in that window | VERIFIED |
| Manual delete | Immediate purge, no retained backup unless a final backup was explicitly taken first | VERIFIED |
| PostgreSQL version | Not documented for the trial specifically; PG16+ defaults to Enterprise Plus edition per release notes, so PG16 is plausible but not confirmed selectable in the trial wizard | INFERRED / UNKNOWN |

The relevant hackathon-specific risk: **the 30-day clock starts the moment
you click "Create" and cannot be paused.** If the trial were started early
during a multi-day hackathon (e.g. to "save it for later" or test it ahead of
time) and the event's judging window slipped, the instance could silently
enter its auto-stopped state mid-demo with no advance warning mechanism
described anywhere in the docs fetched.

---

## 7. Recommendation

**Use `db-g1-small` (paid Cloud SQL Enterprise edition). Do not use the free
trial.**

Reasoning, weighing the hackathon context specifically:

1. **Terraform-manageability is a hard architectural requirement here, and
   neither trial program supports it natively (§3).** Console-create +
   import is possible but fragile — exactly the kind of thing that breaks
   silently under time pressure the night before a demo.
2. **Private IP is a hard requirement, and one trial program explicitly
   fails it (§5, program B) while the other is an unresolved unknown (§5,
   program A).** Betting the architecture on an undocumented behavior is not
   a good trade for a judged demo.
3. **No SLA and no backups (§1a, §6) on a live judged demo is a real risk.**
   If the trial instance has any transient issue during judging, there is no
   automated backup to restore from — only a full re-seed from scratch,
   under time pressure, in front of judges.
4. **The 30-day clock cannot be paused (§6)**, which is a second, independent
   way this could go wrong at exactly the wrong moment if the instance is
   provisioned even slightly ahead of the actual demo slot.
5. **Eligibility for the "big" 30-day trial (program A) cannot be confirmed
   read-only (§2)** — there's a real chance of spending setup time on
   program A only to discover mid-hackathon that the project doesn't
   actually qualify, or that private IP isn't offered, with no fallback time
   left.
6. **The cost delta is small enough that the risk isn't worth taking.**
   Live catalog price for `db-g1-small` zonal in `asia-southeast1`:
   **INR 4.686666249/hour** (VERIFIED — matches the preflight's
   4.68666625 figure almost exactly, confirmed independently in this
   assessment). Over a typical hackathon window:
   - 24 hours running continuously ≈ **INR 112.5**
   - 72 hours (a 3-day event) ≈ **INR 337**
   - A full 30-day month, if left running the whole time ≈ **INR 3,374**
     (roughly $40 at current INR/USD rates)

   This is trivial against an open, paid billing account with promotional
   credit that applies automatically to standard on-demand SKUs before any
   card is charged (per the existing `GCP_PREFLIGHT_REPORT.md` §3 finding).
   The "savings" from a successful trial (~INR 3,374/month avoided) is not
   worth trading away Terraform-native management, guaranteed private-IP
   support, backups, and a clock that doesn't run out mid-demo.

**If someone still wants to try the trial anyway** (e.g. to save the
~INR 100–350 for the event), the safe path is: open the Console "Get
Started" wizard for `innova-hack` *without clicking Create* and check
whether a network/private-IP section appears before the final button. If it
does and it supports `ipv4_enabled = false`, program A becomes viable as a
manually-created-then-imported resource, accepted with the drift risk noted
in §3. If it doesn't, or if there's any doubt under time pressure, fall
back to `db-g1-small` immediately rather than debug it live.

---

## 8. Mitigation design: encrypted synthetic fixture exports (proposal only — not applied)

Whichever instance type is used, it lacks the durability guarantees you'd
want for a judged demo (no SLA either way is realistic for a single-zone
`db-g1-small`, and no automated backups at all for a trial instance). This
section proposes a **private, encrypted GCS bucket + scheduled export**
mechanism as a safety net. **This HCL is a proposal for `infra/` to adopt —
it has deliberately not been added to `infra/` in this task, since that
directory belongs to another worker.**

### 8.1 Design

- A private GCS bucket, uniform bucket-level access, public access
  prevention enforced, versioning on, lifecycle rule to expire old exports
  automatically (cost control).
- Encryption: Google-managed encryption by default (free, zero operational
  overhead); an optional CMEK path is included for anyone who wants an
  audit-visible key with rotation control.
- A dedicated, least-privilege service account that can only write to this
  one bucket (export path) and a separate principal for restore/read access.
- Export mechanism: a scheduled job (Cloud Scheduler → Pub/Sub → Cloud Run
  Job, consistent with the Cloud Run-centric architecture already planned
  for this project per `GCP_PREFLIGHT_REPORT.md`) that connects to the
  Cloud SQL instance over its private IP (via the Cloud SQL Auth Proxy or a
  VPC-connected Cloud Run job), runs `pg_dump`, compresses, and uploads a
  timestamped object. For the hackathon specifically, even a manual
  `pg_dump | gsutil cp` run once before judging begins is a meaningful
  safety net if the scheduled job is more than the remaining time budget
  allows.

### 8.2 Example Terraform (for review — do not apply from this task)

```hcl
# --- Optional CMEK key ring, if Google-managed encryption isn't preferred ---
resource "google_kms_key_ring" "fixtures" {
  name     = "innova-hack-fixtures-kr"
  location = "asia-southeast1"
  project  = "innova-hack"
}

resource "google_kms_crypto_key" "fixtures" {
  name     = "sql-fixtures-key"
  key_ring = google_kms_key_ring.fixtures.id

  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

# Allow the GCS service agent to use the CMEK key
resource "google_kms_crypto_key_iam_member" "gcs_encrypt_decrypt" {
  crypto_key_id = google_kms_crypto_key.fixtures.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-625136990338@gs-project-accounts.iam.gserviceaccount.com"
}

# --- Private bucket for encrypted synthetic fixture exports ---
resource "google_storage_bucket" "sql_fixtures" {
  name     = "innova-hack-sql-fixtures"
  project  = "innova-hack"
  location = "ASIA-SOUTHEAST1"

  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  public_access_prevention = "enforced"

  versioning {
    enabled = true
  }

  # Google-managed encryption is the default if this block is omitted.
  # Uncomment to use the CMEK key defined above instead:
  # encryption {
  #   default_kms_key_name = google_kms_crypto_key.fixtures.id
  # }

  lifecycle_rule {
    condition {
      age = 14 # days
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }
}

# --- Least-privilege export identity ---
resource "google_service_account" "sql_fixture_exporter" {
  project      = "innova-hack"
  account_id   = "sql-fixture-exporter"
  display_name = "Cloud SQL fixture export job"
}

resource "google_storage_bucket_iam_member" "exporter_write" {
  bucket = google_storage_bucket.sql_fixtures.name
  role   = "roles/storage.objectCreator"
  member = "serviceAccount:${google_service_account.sql_fixture_exporter.email}"
}

# --- Separate, read-only identity for restore/inspection during judging ---
resource "google_service_account" "sql_fixture_reader" {
  project      = "innova-hack"
  account_id   = "sql-fixture-reader"
  display_name = "Cloud SQL fixture restore/read"
}

resource "google_storage_bucket_iam_member" "reader_read" {
  bucket = google_storage_bucket.sql_fixtures.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.sql_fixture_reader.email}"
}

# --- Scheduled export trigger ---
resource "google_cloud_scheduler_job" "sql_export_trigger" {
  name      = "sql-fixture-export-trigger"
  project   = "innova-hack"
  region    = "asia-southeast1"
  schedule  = "0 */4 * * *" # every 4 hours during the event window
  time_zone = "Etc/UTC"

  pubsub_target {
    topic_name = google_pubsub_topic.sql_export.id
    data       = base64encode("{\"action\":\"export\"}")
  }
}

resource "google_pubsub_topic" "sql_export" {
  name    = "sql-fixture-export"
  project = "innova-hack"
}

# The Cloud Run Job itself (image containing pg_dump + gsutil/gcs client,
# connecting via the private IP / VPC connector already used by the rest of
# this project's Cloud Run services) is intentionally left out of this
# sketch — it should reuse whatever VPC connector and Cloud SQL connection
# pattern infra/ already standardizes on, rather than introducing a second
# networking path.
```

### 8.3 Notes for whoever implements this in `infra/`

- `public_access_prevention = "enforced"` plus
  `uniform_bucket_level_access = true` together make it structurally
  impossible for any object in this bucket to become public, even by
  accident via a future IAM binding — this is the important property for
  fixtures that may contain synthetic-but-realistic financial data.
- The 14-day lifecycle rule and 3-version cap are hackathon-appropriate
  defaults (cheap, short-lived); tune upward if fixtures need to survive
  past the event.
- If CMEK is adopted, the `google_kms_crypto_key_iam_member` grant to the
  GCS service agent is required or every write to the bucket will fail with
  a permission error — this is a common CMEK+GCS setup mistake worth calling
  out explicitly.
- This bucket protects against **both** choices in §7 — it is not an
  argument for either the trial or `db-g1-small`, it is a mitigation that
  should exist regardless, given neither option has a strong SLA.

---

## Summary of verification status

| # | Question | Status |
|---|---|---|
| 1 | Does a Cloud SQL free trial exist? | **VERIFIED** — two separate programs (§1) |
| 2 | Is `innova-hack` eligible? | **UNKNOWN**, provably so — no read-only signal settles it (§2) |
| 3 | Terraform-manageable at creation? | **VERIFIED: NO** — Console/Firebase-only creation, no trial parameter anywhere in the API or Terraform schema (§3) |
| 4 | `asia-southeast1` supported? | **VERIFIED: YES** — three independent live sources (§4) |
| 5 | Private-IP-only compatible? | **Program B: VERIFIED NO** (breaks trial). **Program A: UNKNOWN**, undocumented (§5) |
| 6 | Operational limits (SLA/backup/HA/expiry) | **VERIFIED** — no SLA, no backups, 30-day non-pausable clock (§6) |
| 7 | Recommendation | **Use `db-g1-small` (paid)**, ~INR 4.6867/hour, ~INR 337 for a 3-day hackathon (§7) |
| 8 | Fixture-export mitigation | Proposed HCL only, not applied, not added to `infra/` (§8) |

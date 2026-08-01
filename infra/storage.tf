# Buckets. Both are private in the strong sense: public access prevention is
# enforced at the bucket level, so no IAM mistake elsewhere can make an object
# world-readable, and uniform bucket-level access removes per-object ACLs as a
# way to get there by accident.

# ---------------------------------------------------------------------------
# Terraform state.
#
# Chicken-and-egg: this bucket is declared in the configuration whose state it
# will hold. The first Stage 1 apply therefore runs on LOCAL state and creates
# it; state is migrated afterwards with `terraform init -migrate-state` (see
# infra/README.md). Do not add a backend block before the bucket exists.
#
# Versioning is on because Terraform state is the only record of which real
# resources this configuration owns. Losing it does not delete infrastructure,
# but it does orphan it — the next apply tries to recreate a Cloud SQL instance
# that already exists, and fails on name conflict with no clean way back.
#
# The state file legitimately contains secret material — random_password.db
# is in it by construction (see data.tf). That is the reason for enforced
# public access prevention and a hard prevent_destroy, not a nicety.
# ---------------------------------------------------------------------------
resource "google_storage_bucket" "tfstate" {
  name     = "credence-tfstate-${var.project_number}"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  # Keep a bounded version history rather than an unbounded one: enough to
  # recover from a bad apply, not enough to accumulate cost.
  lifecycle_rule {
    condition {
      num_newer_versions = 20
    }
    action {
      type = "Delete"
    }
  }

  # A non-empty bucket cannot be deleted unless force_destroy is true. Leaving
  # it false means `terraform destroy` refuses rather than silently discarding
  # the state history.
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.required]
}

# ---------------------------------------------------------------------------
# Encrypted fixture / evidence exports.
#
# Synthetic data only. Objects are encrypted at rest with the CMEK below rather
# than Google-managed keys, so an export can be rendered permanently unreadable
# by destroying one key version — which is the only honest way to promise
# deletion of something already written to object storage.
# ---------------------------------------------------------------------------
resource "google_kms_crypto_key" "storage" {
  name            = "evidence-storage"
  key_ring        = google_kms_key_ring.credence.id
  purpose         = "ENCRYPT_DECRYPT"
  rotation_period = "7776000s" # 90 days

  lifecycle {
    prevent_destroy = true
  }
}

# The Cloud Storage service agent must be able to use the key, or every write
# to the bucket fails. This grant is to Google's own per-project storage
# service agent, not to any workload.
resource "google_kms_crypto_key_iam_member" "storage_agent" {
  crypto_key_id = google_kms_crypto_key.storage.id
  role          = "roles/cloudkms.cryptoKeyEncrypterDecrypter"
  member        = "serviceAccount:service-${var.project_number}@gs-project-accounts.iam.gserviceaccount.com"
}

resource "google_storage_bucket" "evidence" {
  name     = "credence-evidence-${var.project_number}"
  location = var.region

  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"

  versioning {
    enabled = true
  }

  encryption {
    default_kms_key_name = google_kms_crypto_key.storage.id
  }

  # Sandbox fixtures are not archival. Expiring them bounds both cost and how
  # long any synthetic record lingers.
  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type = "Delete"
    }
  }

  force_destroy = false

  depends_on = [google_kms_crypto_key_iam_member.storage_agent]
}

# The API writes exports; it does not administer the bucket and cannot change
# its IAM. objectAdmin, scoped to this one bucket — not a project-level role.
resource "google_storage_bucket_iam_member" "api_evidence" {
  bucket = google_storage_bucket.evidence.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

output "tfstate_bucket" {
  value       = google_storage_bucket.tfstate.name
  description = "Migrate local state here with `terraform init -migrate-state` after the first apply."
}

output "evidence_bucket" {
  value       = google_storage_bucket.evidence.name
  description = "Private, CMEK-encrypted. Synthetic fixture exports only."
}

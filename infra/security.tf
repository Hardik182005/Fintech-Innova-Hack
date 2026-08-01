# KMS asymmetric signing key for Agent Passports (ADR-002, replaces
# LocalDevSigner). The private key is generated inside KMS and is not
# exportable; the API signs by calling the KMS API, so a compromised container
# can request signatures but can never steal the key.

resource "google_kms_key_ring" "credence" {
  name     = "credence"
  location = var.region
}

resource "google_kms_crypto_key" "passport_signing" {
  name     = "passport-signing"
  key_ring = google_kms_key_ring.credence.id
  purpose  = "ASYMMETRIC_SIGN"

  version_template {
    # Ed25519 is not offered by Cloud KMS; EC_SIGN_ED25519 exists only in
    # preview HSM tiers in some regions. P-256 ECDSA is the supported
    # equivalent; credence/passport verifies by key_version, so the dev
    # Ed25519 keys and prod ECDSA keys coexist under different versions.
    algorithm        = "EC_SIGN_P256_SHA256"
    protection_level = "SOFTWARE"
  }

  lifecycle {
    prevent_destroy = true
  }
}

# Runtime secrets. Values are set out-of-band (`gcloud secrets versions add`),
# never through Terraform, so they exist in no state file.
resource "google_secret_manager_secret" "runtime" {
  for_each = toset([
    "credence-demo-token",
    "credence-demo-reset-token",
    "elevenlabs-api-key",
  ])

  secret_id = each.key
  replication {
    auto {}
  }
}

# The demo bearer token needs a real version at apply time: Cloud Run refuses
# to start a revision that mounts a secret with no versions, and both services
# mount this one. Generating it here means no human ever chooses it, it is
# never typed into a shell, and it differs per deployment.
#
# credence-demo-reset-token and elevenlabs-api-key are intentionally left
# version-less — nothing mounts them. They exist so that enabling those paths
# is a matter of adding a version, not of editing infrastructure under time
# pressure.
resource "random_password" "demo_token" {
  length  = 40
  special = false
}

resource "google_secret_manager_secret_version" "demo_token" {
  secret      = google_secret_manager_secret.runtime["credence-demo-token"].id
  secret_data = random_password.demo_token.result
}

# --- Service accounts: one per workload, least privilege, no keys ever. ---

resource "google_service_account" "api" {
  account_id   = "credence-api"
  display_name = "CredenceAI API (Cloud Run)"
}

resource "google_service_account" "web" {
  account_id   = "credence-web"
  display_name = "CredenceAI frontend BFF (Cloud Run)"
}

resource "google_service_account" "inference" {
  account_id   = "credence-inference"
  display_name = "CredenceAI inference (Cloud Run GPU)"
}

# API: sign passports, read its secrets, connect to Cloud SQL.
resource "google_kms_crypto_key_iam_member" "api_signs" {
  crypto_key_id = google_kms_crypto_key.passport_signing.id
  role          = "roles/cloudkms.signerVerifier"
  member        = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_db_password" {
  secret_id = google_secret_manager_secret.db_password.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_runtime" {
  for_each = {
    demo  = google_secret_manager_secret.runtime["credence-demo-token"].secret_id
    reset = google_secret_manager_secret.runtime["credence-demo-reset-token"].secret_id
    xi    = google_secret_manager_secret.runtime["elevenlabs-api-key"].secret_id
  }

  secret_id = each.value
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_project_iam_member" "api_sql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

# Frontend BFF: only the demo token; it holds no other credential.
resource "google_secret_manager_secret_iam_member" "web_demo_token" {
  secret_id = google_secret_manager_secret.runtime["credence-demo-token"].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.web.email}"
}

# Everyone writes logs and metrics; nobody holds Editor, Owner, or a wildcard.
resource "google_project_iam_member" "logging" {
  for_each = {
    api       = google_service_account.api.email
    web       = google_service_account.web.email
    inference = google_service_account.inference.email
  }

  project = var.project_id
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${each.value}"
}

resource "google_project_iam_member" "metrics" {
  for_each = {
    api       = google_service_account.api.email
    web       = google_service_account.web.email
    inference = google_service_account.inference.email
  }

  project = var.project_id
  role    = "roles/monitoring.metricWriter"
  member  = "serviceAccount:${each.value}"
}

# Artifact Registry for the two container images.
resource "google_artifact_registry_repository" "images" {
  repository_id = "credence"
  location      = var.region
  format        = "DOCKER"
}

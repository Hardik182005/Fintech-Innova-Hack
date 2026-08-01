# CredenceAI infrastructure — project innova-hack (625136990338),
# region asia-southeast1.
#
# Applied in two gated stages, never in one step:
#
#   Stage 1, core   — enable_gpu = false. VPC, Cloud SQL, KMS, Secret Manager,
#                     Artifact Registry, api + web on Cloud Run. No GPU exists
#                     as a plannable resource. Gate: APPROVE_GCP_STAGE_1_CORE.
#
#   Stage 2, GPU    — enable_gpu = true. Adds credence-inference on Cloud Run
#                     with one L4, min instances 0. Applied only after Stage 1
#                     passes AND promotional-credit application is confirmed
#                     against a real charge. Gate: APPROVE_GCP_STAGE_2_GPU.
#
# The earlier single broad gate is retired and must not be honoured.
# See docs/GCP_PREFLIGHT_REPORT.md and docs/GCP_COST_ESTIMATE.md.

terraform {
  required_version = ">= 1.7"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # Remote state deliberately not configured yet: the bucket itself is a
  # billable resource. First apply bootstraps local state; migrate to GCS
  # afterwards with `terraform init -migrate-state`.
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}


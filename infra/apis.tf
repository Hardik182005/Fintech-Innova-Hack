# Service enablement.
#
# Every API this configuration depends on, declared so the deployment is
# reproducible into an empty project rather than only into this one, which
# happens to have most of them switched on already from earlier console work.
#
# Verified against `gcloud services list --enabled --project=innova-hack`
# during preflight: all of the below were already enabled EXCEPT
# billingbudgets.googleapis.com. That one is not optional — budget.tf creates a
# google_billing_budget, and without the API the Stage 1 apply fails partway
# through, after billable resources exist. Enabling it here orders it before
# the budget.
#
# disable_on_destroy is false throughout. Tearing down this stack must not
# switch off APIs that other things in the project may be using; disabling a
# service is a project-wide action and is not ours to take implicitly.

locals {
  required_services = [
    "artifactregistry.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudkms.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "iam.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "storage.googleapis.com",
  ]
}

resource "google_project_service" "required" {
  for_each = toset(local.required_services)

  project = var.project_id
  service = each.key

  disable_on_destroy         = false
  disable_dependent_services = false
}

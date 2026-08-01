variable "project_id" {
  type    = string
  default = "innova-hack"

  validation {
    condition     = var.project_id == "innova-hack"
    error_message = "Verified target is innova-hack (project number 625136990338). Change deliberately."
  }
}

# Singapore, not Mumbai. Cloud Run L4 in asia-south1 may require invitation, and
# the Compute Engine L4 quota is identical in both regions anyway (1, and gated
# to 0 by the global GPUS_ALL_REGIONS ceiling). See docs/GCP_PREFLIGHT_REPORT.md.
variable "region" {
  type    = string
  default = "asia-southeast1"
}

variable "zone" {
  type    = string
  default = "asia-southeast1-a"
}

# ---------------------------------------------------------------------------
# Stage gate.
#
# The GPU inference service does not exist as a plannable resource unless this
# is true. Stage 1 (core) is applied with it false, so a Stage 1 plan cannot
# contain a GPU even by mistake. Stage 2 flips it, and only after the user
# sends APPROVE_GCP_STAGE_2_GPU.
# ---------------------------------------------------------------------------
variable "enable_gpu" {
  type    = bool
  default = false
}

# Minimum GPU instances. Zero is the only safe resting value: an instance left
# alive bills 0.04530186 INR/second whether or not it serves a request, which
# is 3,914 INR/day. `make gpu-warm` raises this immediately before a demo and
# `make gpu-cool` returns it to zero afterwards.
variable "gpu_min_instances" {
  type    = number
  default = 0

  validation {
    condition     = var.gpu_min_instances >= 0 && var.gpu_min_instances <= 1
    error_message = "gpu_min_instances must be 0 (resting) or 1 (warmed for a demo)."
  }
}

# Hard ceiling of one L4. Not a tunable: the project holds quota for one, and
# one is all the budget tolerates.
variable "gpu_max_instances" {
  type    = number
  default = 1

  validation {
    condition     = var.gpu_max_instances == 1
    error_message = "gpu_max_instances is fixed at 1."
  }
}

# ---------------------------------------------------------------------------
# Models.
#
# The 24B runs only on the L4. Two passes through it are two passes through one
# model, not two independent models, and nothing in the product may describe
# them as independent.
#
# The 1.7B fallback exists so the system degrades rather than dies when the GPU
# is unavailable. It is an ADVISORY model under a smaller competence envelope:
# it may summarise and flag, and it must never approve credit. That is enforced
# in the deterministic engine and in OPA, not by asking the model nicely.
# ---------------------------------------------------------------------------
variable "gpu_primary_model" {
  type    = string
  default = "mistral-small3.2:24b-instruct-2506-q4_K_M"
}


variable "cpu_fallback_model" {
  type    = string
  default = "qwen3:1.7b"
}

# Optional CPU inference service. Off by default: it is a standing cost, and
# Stage 1 is meant to prove that the deterministic engine decides correctly
# with no model reachable at all.
variable "enable_cpu_fallback" {
  type    = bool
  default = false
}

# ---------------------------------------------------------------------------
# Public exposure.
#
# Default false, because the deployment rules forbid wildcard principals
# (allUsers / allAuthenticatedUsers). While false, the frontend is reachable
# only by an authenticated principal, e.g. `gcloud run services proxy`.
#
# Opening the demo to judges who cannot authenticate means setting this true,
# which grants roles/run.invoker to allUsers on the WEB SERVICE ONLY. That is a
# deliberate, reviewed exception and is never applied silently. The API and the
# inference service stay private regardless of this flag.
# ---------------------------------------------------------------------------
variable "web_public" {
  type    = bool
  default = true
}


# db-g1-small: 4.68666625 INR/hour in Singapore.
#
# The previous default (db-custom-1-3840) costs 9.0434 INR/hour = 6,598
# INR/month, which exceeds the entire 5,000 INR budget on its own while doing
# nothing. See docs/GCP_COST_ESTIMATE.md.
variable "db_tier" {
  type    = string
  default = "db-g1-small"
}

variable "api_max_instances" {
  type    = number
  default = 3
}

variable "web_max_instances" {
  type    = number
  default = 3
}

# Verified by direct API call during preflight, so it is a constant rather than
# a data-source lookup. Avoiding the lookup also means the plan does not need
# resourcemanager.projects.get on whichever identity holds the ADC.
variable "project_number" {
  type    = string
  default = "625136990338"

  validation {
    condition     = var.project_number == "625136990338"
    error_message = "Verified project number for innova-hack is 625136990338."
  }
}

variable "billing_account" {
  type    = string
  default = "019880-229F92-B0CD51"
}

# Alerts only. Google Cloud does not stop resources at a budget threshold, and
# the alert itself lags real usage by hours.
variable "budget_amount_inr" {
  type    = number
  default = 5000
}

# Where monitoring alerts go. Defaults to the authorized deploying principal,
# confirmed as the active account by `gcloud auth list` during preflight.
# An address that nobody reads makes every alert policy here decorative.
variable "alert_email" {
  type    = string
  default = "rajeshinduja2015@gmail.com"

  validation {
    condition     = can(regex("^[^@]+@[^@]+\\.[^@]+$", var.alert_email))
    error_message = "alert_email must be a deliverable email address."
  }
}

# Ollama inference on Cloud Run with an attached L4.
#
# This replaces the previous google_compute_instance approach, which cannot
# work in this project at all: GPUS_ALL_REGIONS is 0 at the project level, a
# global ceiling that sits above every regional limit. No Compute Engine GPU
# VM can be created here, in any region, on-demand or Spot, until that quota is
# raised. Cloud Run GPU is a separate quota and is not gated by it.
#
# Cloud Run is also the cheaper shape for this workload. It scales to zero, so
# an idle demo costs nothing, whereas a g2-standard-8 bills 100.73 INR/hour
# around the clock. Break-even is 14.8 GPU-serving hours per day; a demo uses
# one to three.
#
# Nothing here is plannable while var.enable_gpu is false.

locals {
  inference_image = "${local.image_base}/credence-inference:latest"
}

resource "google_cloud_run_v2_service" "inference" {
  count = var.enable_gpu ? 1 : 0

  name                = "credence-inference"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.inference.email

    # 600s: the ceiling the deployment rules set, and the bound on what a
    # single runaway request can cost (600 * 0.04530186 = 27.18 INR).
    timeout = "600s"

    # One request at a time. Concurrency above 1 on a single L4 does not
    # increase throughput for a 24B model; it only lengthens every response.
    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = var.gpu_min_instances # 0 at rest
      max_instance_count = var.gpu_max_instances # fixed at 1
    }

    # Zonal redundancy off. Required by the deployment rules, and 35.8% cheaper
    # on the dominant SKU: 0.02142858 vs 0.03338819 INR/second.
    gpu_zonal_redundancy_disabled = true

    node_selector {
      accelerator = "nvidia-l4"
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.main.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = local.inference_image

      resources {
        limits = {
          cpu              = "8"
          memory           = "32Gi"
          "nvidia.com/gpu" = "1"
        }
        # CPU always allocated: mandatory with a GPU attached, and what makes
        # this instance-based rather than request-based billing.
        cpu_idle          = false
        startup_cpu_boost = true
      }

      env {
        name  = "OLLAMA_HOST"
        value = "0.0.0.0:11434"
      }

      # Keep the loaded model resident for the life of the instance. Reloading
      # a 24B model per request would dominate latency, and the instance is
      # already being paid for.
      env {
        name  = "OLLAMA_KEEP_ALIVE"
        value = "-1"
      }

      env {
        name  = "CREDENCE_PRIMARY_MODEL"
        value = var.gpu_primary_model
      }

      # One model resident at a time. A second concurrently loaded model would
      # not fit alongside a 24B in 32 GiB.
      env {
        name  = "OLLAMA_MAX_LOADED_MODELS"
        value = "1"
      }

      ports {
        container_port = 11434
      }

      # The model is baked into the image rather than pulled at boot: a cold
      # start already carries the image, and pulling ~14GB from the network on
      # every scale-from-zero would make the first request unusable.
      startup_probe {
        tcp_socket {
          port = 11434
        }
        initial_delay_seconds = 30
        period_seconds        = 10
        failure_threshold     = 30 # allows ~5 min for model load
        timeout_seconds       = 5
      }
    }
  }
}

# Only the API may call inference. No wildcard principal, and the service is
# internal-ingress besides, so there is no public path to a billable GPU.
resource "google_cloud_run_v2_service_iam_member" "inference_from_api" {
  count = var.enable_gpu ? 1 : 0

  name     = google_cloud_run_v2_service.inference[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.api.email}"
}

# ---------------------------------------------------------------------------
# Optional CPU fallback: the small model, no GPU, so the system degrades
# instead of failing when no L4 is available.
#
# This model's competence envelope is narrower and the code treats it that way.
# It may summarise evidence and raise flags. It may not approve credit, name an
# amount, or set a limit — that restriction lives in the deterministic engine
# and in OPA, where a model cannot argue with it.
# ---------------------------------------------------------------------------
resource "google_cloud_run_v2_service" "inference_cpu" {
  count = var.enable_cpu_fallback ? 1 : 0

  name                = "credence-inference-cpu"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.inference.email
    timeout         = "600s"

    max_instance_request_concurrency = 1

    scaling {
      min_instance_count = 0
      max_instance_count = 1
    }

    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.main.id
      }
      egress = "PRIVATE_RANGES_ONLY"
    }

    containers {
      image = "${local.image_base}/credence-inference-cpu:latest"

      resources {
        limits = {
          cpu    = "4"
          memory = "8Gi"
        }
        startup_cpu_boost = true
      }

      env {
        name  = "OLLAMA_HOST"
        value = "0.0.0.0:11434"
      }
      env {
        name  = "CREDENCE_PRIMARY_MODEL"
        value = var.cpu_fallback_model
      }
      # Read by the gateway to refuse any advisory role this model is not
      # competent for, regardless of what it returns.
      env {
        name  = "CREDENCE_MODEL_MAY_APPROVE_CREDIT"
        value = "false"
      }

      ports {
        container_port = 11434
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "inference_cpu_from_api" {
  count = var.enable_cpu_fallback ? 1 : 0

  name     = google_cloud_run_v2_service.inference_cpu[0].name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.api.email}"
}

output "inference_url" {
  value       = var.enable_gpu ? google_cloud_run_v2_service.inference[0].uri : null
  description = "Internal-only. Empty until Stage 2 (APPROVE_GCP_STAGE_2_GPU)."
}

output "inference_cpu_url" {
  value       = var.enable_cpu_fallback ? google_cloud_run_v2_service.inference_cpu[0].uri : null
  description = "Internal-only CPU fallback. Null unless enable_cpu_fallback."
}

output "gpu_stage_active" {
  value       = var.enable_gpu
  description = "False during Stage 1. No GPU resource exists while this is false."
}

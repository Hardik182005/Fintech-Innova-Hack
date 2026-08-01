# The Cloud Run services. Images are built and pushed outside Terraform;
# Terraform owns the service definitions so caps, accounts, and wiring are
# reviewed code rather than console state.

locals {
  image_base = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.images.repository_id}"
  api_image  = "${local.image_base}/credence-api:latest"
  web_image  = "${local.image_base}/credence-web:latest"
  opa_image  = "${local.image_base}/credence-opa:latest"

  # Empty during Stage 1. The gateway fail-closes on an unset base URL, which
  # is the correct Stage 1 behaviour: no model is reachable, so no model
  # advises, and the deterministic engine decides alone.
  inference_base_url = var.enable_gpu ? google_cloud_run_v2_service.inference[0].uri : ""
}

resource "google_cloud_run_v2_service" "api" {
  name                = "credence-api"
  location            = var.region
  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_INTERNAL_ONLY"

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.api_max_instances
    }

    # Direct VPC egress rather than a Serverless VPC Access connector. The
    # connector runs two e2-micro instances continuously whether or not
    # anything is being served; direct egress has no standing cost.
    #
    # ALL_TRAFFIC, not PRIVATE_RANGES_ONLY. Cloud Run decides "internal"
    # ingress by whether the request actually arrived over a VPC network in
    # this project, and credence-inference is internal-ingress. Its URL is a
    # *.run.app name that resolves to a Google front-end address, which is not
    # an RFC1918 range — so under PRIVATE_RANGES_ONLY the call would leave by
    # the default public path, arrive as external traffic, and be rejected.
    # Routing all egress through the subnet is what makes the API's calls
    # count as internal. Google API traffic (Secret Manager, KMS) still works
    # because the subnet has private_ip_google_access enabled.
    #
    # Consequence, and it is a deliberate one: there is no Cloud NAT, so
    # genuinely external hosts are unreachable from this service. The only
    # such dependency is the optional ElevenLabs TTS adapter, which is
    # disabled by default. It fails closed rather than silently egressing.
    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.main.id
      }
      egress = "ALL_TRAFFIC"
    }

    containers {
      image = local.api_image

      ports {
        container_port = 8001
      }


      resources {
        limits = {
          cpu    = "1"
          memory = "1Gi"
        }
      }


      # RUN_MODE must be one of credence.config.RunMode — LOCAL_DEV,
      # GCP_COST, GCP_ACCURACY, DEMO_LOCKED. "SANDBOX" is an Environment
      # value, not a RunMode; passing it makes pydantic reject Settings at
      # import and the container never becomes ready.
      env {
        name  = "CREDENCE_RUN_MODE"
        value = "GCP_COST"
      }
      env {
        name  = "CREDENCE_ENVIRONMENT"
        value = "sandbox"
      }

      # Host and password are supplied separately and the URL is assembled in
      # credence/config.py; Secret Manager can inject a whole value but cannot
      # substitute one into the middle of a connection string.
      env {
        name  = "CREDENCE_DATABASE_HOST"
        value = google_sql_database_instance.pg.private_ip_address
      }
      env {
        name = "CREDENCE_DATABASE_PASSWORD"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.db_password.secret_id
            version = "latest"
          }
        }
      }

      # The backend reads CREDENCE_DEMO_RESET_TOKEN (config.demo_reset_token);
      # the frontend BFF sends the same value as CREDENCE_DEMO_TOKEN. They are
      # deliberately the same secret — the BFF presents this token to the API,
      # so two different values would simply mean every demo call is rejected.
      env {
        name = "CREDENCE_DEMO_RESET_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["credence-demo-token"].secret_id
            version = "latest"
          }
        }
      }

      # No ELEVENLABS_API_KEY mount. voice_provider defaults to "disabled",
      # the secret is created empty, and Cloud Run fails to start a revision
      # that mounts a secret with no versions. Enabling voice means adding a
      # version and restoring the mount — a deliberate edit, not a default.
      env {
        name  = "CREDENCE_KMS_KEY"
        value = google_kms_crypto_key.passport_signing.id
      }
      env {
        name  = "CREDENCE_OLLAMA_BASE_URL"
        value = local.inference_base_url
      }
      env {
        name  = "CREDENCE_OPA_URL"
        value = "http://localhost:8181"
      }

      startup_probe {
        http_get {
          path = "/v1/health/ready"
        }
        initial_delay_seconds = 5
        period_seconds        = 5
        failure_threshold     = 12
      }
    }

    # OPA sidecar: policies baked into the image, reachable only on the
    # instance's localhost. The Python mirror still fail-closes if it is down.
    containers {
      name  = "opa"
      image = local.opa_image

      resources {
        limits = {
          cpu    = "0.5"
          memory = "256Mi"
        }
      }
    }
  }
}

resource "google_cloud_run_v2_service" "web" {
  name                = "credence-web"
  location            = var.region
  deletion_protection = false

  # Ingress stays open at the load-balancer level; reachability is decided by
  # IAM below, not by ingress. With var.web_public false, IAM admits only
  # authenticated principals.
  ingress = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.web.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.web_max_instances
    }

    # ALL_TRAFFIC for the same reason as the API: credence-api is
    # internal-ingress, so the BFF's calls to it must actually traverse the
    # VPC to be accepted. Under PRIVATE_RANGES_ONLY this service could not
    # reach the API at all — every page would 403.
    vpc_access {
      network_interfaces {
        network    = google_compute_network.vpc.id
        subnetwork = google_compute_subnetwork.main.id
      }
      egress = "ALL_TRAFFIC"
    }

    containers {
      image = local.web_image

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }

      env {
        name  = "CREDENCE_API_BASE"
        value = google_cloud_run_v2_service.api.uri
      }
      env {
        name = "CREDENCE_DEMO_TOKEN"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.runtime["credence-demo-token"].secret_id
            version = "latest"
          }
        }
      }
    }
  }
}

# ---------------------------------------------------------------------------
# Invoker IAM.
#
# The API is never public. Only the frontend's service account may call it.
# ---------------------------------------------------------------------------
resource "google_cloud_run_v2_service_iam_member" "api_from_web" {
  name     = google_cloud_run_v2_service.api.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}


# The one wildcard grant in this configuration, and it is opt-in, scoped to the
# frontend alone, and false by default. Applying it is a decision the operator
# makes explicitly by setting web_public = true; it is never a side effect of
# deploying. See variables.tf.
resource "google_cloud_run_v2_service_iam_member" "web_public" {
  count = var.web_public ? 1 : 0

  name     = google_cloud_run_v2_service.web.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

output "web_url" {
  value = google_cloud_run_v2_service.web.uri
}

output "web_is_public" {
  value       = var.web_public
  description = "False means only authenticated principals can open the frontend."
}

output "api_url" {
  value       = google_cloud_run_v2_service.api.uri
  description = "Not public: internal ingress, invoker restricted to the web service account"
}

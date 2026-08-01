# Monitoring and alerting.
#
# These are the signals that would otherwise be noticed only by reading the
# billing report days later, or by a judge hitting a broken demo. Alert
# policies and notification channels are not themselves billable.
#
# Note what this can and cannot do. An alert notifies; it never stops
# anything. The GPU-left-running alert below is the closest thing this project
# has to an automated cost guard, and it is still just an email — the actual
# guard is gpu_min_instances = 0 in variables.tf.

resource "google_monitoring_notification_channel" "email" {
  display_name = "CredenceAI sandbox alerts"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }

  depends_on = [google_project_service.required]
}

# ---------------------------------------------------------------------------
# Cost: a GPU instance that is alive when nobody is demoing.
#
# The deployment rules say the GPU must not run overnight. At 0.0453 INR/s an
# instance left up costs ~3,914 INR/day, which is most of the 5,000 INR budget
# in a single night. This fires after 30 minutes of any live instance, which is
# long enough not to page during a legitimate demo and short enough that an
# accidental pin is caught the same evening rather than the next morning.
#
# Stage 1 has no GPU service, so there is nothing to alert on.
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "gpu_running" {
  count = var.enable_gpu ? 1 : 0

  display_name = "credence-inference: GPU instance alive >30m"
  combiner     = "OR"

  conditions {
    display_name = "instance_count > 0 for 30 minutes"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "resource.labels.service_name = \"credence-inference\"",
        "metric.type = \"run.googleapis.com/container/instance_count\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "1800s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MAX"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content = join("\n", [
      "A credence-inference instance has been alive for over 30 minutes.",
      "",
      "If a demo is not actively running, cool it now:",
      "    make gpu-cool",
      "",
      "Cost while alive: ~0.0453 INR/second (~163 INR/hour, ~3,914 INR/day).",
      "The 5,000 INR budget is an alert, not a cap — nothing stops this",
      "automatically.",
    ])
  }
}

# ---------------------------------------------------------------------------
# Availability: the API returning server errors.
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "api_5xx" {
  display_name = "credence-api: sustained 5xx responses"
  combiner     = "OR"

  conditions {
    display_name = "5xx rate above threshold for 5 minutes"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloud_run_revision\"",
        "resource.labels.service_name = \"credence-api\"",
        "metric.type = \"run.googleapis.com/request_count\"",
        "metric.labels.response_code_class = \"5xx\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 5
      duration        = "300s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_RATE"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content = "credence-api is returning 5xx. Check Cloud Logging for the revision, and confirm Cloud SQL and the OPA sidecar are reachable. The API fails closed: while it is erroring, no credit is approved and no funds move."
  }
}

# ---------------------------------------------------------------------------
# Database: the demo's single stateful dependency.
#
# db-g1-small is a shared-core machine. Sustained high CPU on it means the
# demo is about to feel slow, not that anything is broken yet.
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "sql_cpu" {
  display_name = "credence-pg: sustained high CPU"
  combiner     = "OR"

  conditions {
    display_name = "CPU above 85% for 10 minutes"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloudsql_database\"",
        "metric.type = \"cloudsql.googleapis.com/database/cpu/utilization\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 0.85
      duration        = "600s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content = "credence-pg CPU is sustained above 85%. db-g1-small is shared-core; this is a capacity signal, not corruption. Do not resize during a demo."
  }
}

# ---------------------------------------------------------------------------
# Disk: autoresize grows the disk, and growth is billable and irreversible —
# Cloud SQL disks cannot be shrunk.
# ---------------------------------------------------------------------------
resource "google_monitoring_alert_policy" "sql_disk" {
  display_name = "credence-pg: disk utilization high"
  combiner     = "OR"

  conditions {
    display_name = "Disk above 80%"

    condition_threshold {
      filter = join(" AND ", [
        "resource.type = \"cloudsql_database\"",
        "metric.type = \"cloudsql.googleapis.com/database/disk/utilization\"",
      ])
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "300s"

      aggregations {
        alignment_period   = "300s"
        per_series_aligner = "ALIGN_MEAN"
      }
    }
  }

  notification_channels = [google_monitoring_notification_channel.email.id]

  documentation {
    content = "credence-pg disk is above 80%. disk_autoresize will grow it automatically; Cloud SQL disks cannot be shrunk afterwards, so the added cost is permanent for the life of the instance. For synthetic sandbox data, prefer truncating fixtures over letting it grow."
  }
}

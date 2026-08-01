# Cost controls that exist as code, not as intentions.
#
# Read this before trusting it: a budget is an ALERT, not a spending cap.
# Google Cloud does not stop, throttle, or delete anything when a threshold is
# crossed. Spend continues until a human acts. The alert is also evaluated
# against usage that itself lags by hours, so a GPU left at min-instances=1
# can burn most of a day (3,914 INR) before the 90% notification arrives.
#
# The controls that actually bound spend are elsewhere and are structural:
#   - gpu_min_instances = 0            (variables.tf)
#   - gpu_max_instances = 1            (variables.tf, fixed)
#   - concurrency 1, timeout 600s      (inference.tf)
#   - max_instance_count on api/web    (services.tf)
#   - no VPC connector, no idle VM     (network.tf)
#
# Requires billingbudgets.googleapis.com and Billing Account Administrator on
# the deploying principal. If this resource fails on IAM, set the alert in the
# Console instead — do not widen IAM to accommodate it.

resource "google_billing_budget" "credence" {
  billing_account = var.billing_account
  display_name    = "credence-sandbox"

  budget_filter {
    projects = ["projects/${var.project_number}"]
  }

  amount {
    specified_amount {
      currency_code = "INR"
      units         = tostring(var.budget_amount_inr)
    }
  }

  # Five thresholds, per the deployment rules. The early ones matter most: by
  # the time 90% fires on a GPU burn, the money is already spent.
  threshold_rules {
    threshold_percent = 0.25
  }
  threshold_rules {
    threshold_percent = 0.5
  }
  threshold_rules {
    threshold_percent = 0.75
  }
  threshold_rules {
    threshold_percent = 0.9
  }
  threshold_rules {
    threshold_percent = 1.0
  }

  # Forecast alerting catches a runaway before it lands rather than after.
  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "FORECASTED_SPEND"
  }
}

# Cloud SQL Postgres — private IP only. There is no public address to
# firewall, leak, or brute-force; the only path in is the VPC.

resource "google_sql_database_instance" "pg" {
  name             = "credence-pg"
  database_version = "POSTGRES_16"
  region           = var.region

  depends_on = [google_service_networking_connection.psa]

  settings {
    tier = var.db_tier
    # Explicit: db-g1-small is a shared-core tier and exists only under
    # ENTERPRISE. ENTERPRISE_PLUS rejects it, and relying on the provider's
    # default edition makes the apply depend on a default that has changed
    # between provider versions.
    edition           = "ENTERPRISE"
    availability_type = "ZONAL" # sandbox: no HA premium
    disk_size         = 10      # Postgres minimum; disk_autoresize grows it if needed
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.vpc.id
    }

    backup_configuration {
      enabled    = true
      start_time = "21:00" # 02:30 IST, off demo hours
    }

    database_flags {
      name  = "max_connections"
      value = "100"
    }
  }

  # A hackathon teardown should be possible without console surgery, but an
  # accidental `terraform destroy` should not take the ledger with it silently.
  deletion_protection = true
}

resource "google_sql_database" "credence" {
  name     = "credence"
  instance = google_sql_database_instance.pg.name
}

resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "credence" {
  name     = "credence"
  instance = google_sql_database_instance.pg.name
  password = random_password.db.result
}

# The generated password goes into Secret Manager, and the application only
# ever reads it from there — it is in no image, no env file, and no terraform
# output.
#
# It IS in the Terraform state file, unavoidably: random_password stores its
# result in state, and so does any secret version whose value Terraform
# manages. There is no way to declare this resource and not have the value in
# state. Treat state as a secret-bearing artifact accordingly — that is why
# storage.tf gives the state bucket enforced public-access prevention and
# prevent_destroy, and why local state must be migrated into it rather than
# left on a laptop. Rotating the password out of band (`gcloud secrets
# versions add`) and removing this resource is the cleaner end state once the
# sandbox is past first bring-up.
resource "google_secret_manager_secret" "db_password" {
  secret_id = "credence-db-password"
  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "db_password" {
  secret      = google_secret_manager_secret.db_password.id
  secret_data = random_password.db.result
}

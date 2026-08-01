# Private VPC. The database has no public address at all; the Cloud Run
# services reach it over direct VPC egress, and Google fronts their ingress.

resource "google_compute_network" "vpc" {
  name                    = "credence-vpc"
  auto_create_subnetworks = false
}

# Direct VPC egress draws instance addresses from this subnet, so it is sized
# for the services rather than for a single connector range. /24 is ample for
# a max of 3 + 3 + 1 instances.
resource "google_compute_subnetwork" "main" {
  name                     = "credence-subnet"
  network                  = google_compute_network.vpc.id
  region                   = var.region
  ip_cidr_range            = "10.10.0.0/24"
  private_ip_google_access = true
}

# Reserved range + peering for Cloud SQL private services access.
resource "google_compute_global_address" "psa_range" {
  name          = "credence-psa-range"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.vpc.id
}

resource "google_service_networking_connection" "psa" {
  network                 = google_compute_network.vpc.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.psa_range.name]
}

# No google_vpc_access_connector: the previous configuration ran one, which
# bills two e2-micro instances continuously whether or not anything is served.
# Direct VPC egress on each service replaces it at no standing cost.
#
# No firewall rules for an inference VM either. There is no VM; inference runs
# on Cloud Run with internal-only ingress, where reachability is decided by IAM
# rather than by source ranges.

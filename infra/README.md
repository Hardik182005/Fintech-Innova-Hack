# CredenceAI infrastructure

Terraform for project `innova-hack` (asia-south1), per ADR-007. **Not applied
yet** — the gate is the budget approval recorded in `docs/GCP_PREFLIGHT.md`.

## Layout

| File | Contents |
|---|---|
| `network.tf` | Private VPC, subnet, serverless VPC connector, PSA peering, firewalls (no `0.0.0.0/0`) |
| `data.tf` | Cloud SQL Postgres 16, **private IP only**, generated password straight into Secret Manager |
| `security.tf` | KMS asymmetric signing key (non-exportable, replaces LocalDevSigner), runtime secrets, three least-privilege service accounts, Artifact Registry |
| `inference.tf` | Ollama VM — `inference_tier` selects `gpu-l4` / `cpu` / `none`; Spot by default; no public IP |
| `services.tf` | Two Cloud Run services; web is public, API invokable only by the web service account; max-instance caps |
| `budget.tf` | ₹5,000 billing alert at 50/90/100% |

## Order of operations

```powershell
cd infra
terraform init
terraform plan -var inference_tier=cpu     # review — creates nothing
# after budget approval (and gpu-l4 approval if desired):
terraform apply -var inference_tier=cpu
# then set secret values out-of-band (values never touch tf state):
#   echo <token> | gcloud secrets versions add credence-demo-token --data-file=- --project innova-hack
#   (same for credence-demo-reset-token, elevenlabs-api-key)
# then build & push images and roll the services (scripts/deploy_gcp.ps1).
```

## Deliberate choices

- **No service-account keys anywhere.** Cloud Run and the VM use attached
  identities; a laptop deploys with the owner's own `gcloud` auth.
- **KMS key is `EC_SIGN_P256_SHA256`**, not Ed25519 — Cloud KMS does not
  offer Ed25519 for asymmetric signing. Passport verification is
  key-version-aware, so dev (Ed25519) and cloud (ECDSA P-256) keys coexist.
- **State is local until first apply**, then migrated to a GCS bucket —
  creating the bucket first would itself be an un-approved billable resource.
- **`deletion_protection = true` on Cloud SQL** and `prevent_destroy` on the
  KMS key: a stray destroy cannot silently take the ledger or the signing key.

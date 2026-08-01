# CredenceAI — build, push, and roll both Cloud Run services.
#
# Prereqs (one-time, after `terraform apply` in infra/):
#   gcloud auth configure-docker asia-south1-docker.pkg.dev
#   secret VALUES added out-of-band (see infra/README.md)
#
# This script never touches secrets: images carry no credentials, and the
# services read theirs from Secret Manager references defined in Terraform.

$ErrorActionPreference = "Stop"

$Project = "innova-hack"
$Region  = "asia-south1"
$Repo    = "$Region-docker.pkg.dev/$Project/credence"
$Tag     = Get-Date -Format "yyyyMMdd-HHmmss"

$RepoRoot = Split-Path -Parent $PSScriptRoot

Write-Host "== Building API image ($Tag)" -ForegroundColor Cyan
docker build -t "$Repo/credence-api:$Tag" -t "$Repo/credence-api:latest" $RepoRoot
if ($LASTEXITCODE -ne 0) { throw "API image build failed" }

Write-Host "== Building web image ($Tag)" -ForegroundColor Cyan
docker build -t "$Repo/credence-web:$Tag" -t "$Repo/credence-web:latest" "$RepoRoot\frontend"
if ($LASTEXITCODE -ne 0) { throw "Web image build failed" }

Write-Host "== Building OPA sidecar image ($Tag)" -ForegroundColor Cyan
docker build -f "$RepoRoot\opa.Dockerfile" -t "$Repo/credence-opa:$Tag" -t "$Repo/credence-opa:latest" $RepoRoot
if ($LASTEXITCODE -ne 0) { throw "OPA image build failed" }

Write-Host "== Pushing" -ForegroundColor Cyan
docker push "$Repo/credence-api:$Tag"
docker push "$Repo/credence-api:latest"
docker push "$Repo/credence-web:$Tag"
docker push "$Repo/credence-web:latest"
docker push "$Repo/credence-opa:$Tag"
docker push "$Repo/credence-opa:latest"

Write-Host "== Rolling Cloud Run revisions" -ForegroundColor Cyan
gcloud run services update credence-api --project $Project --region $Region --image "$Repo/credence-api:$Tag"
if ($LASTEXITCODE -ne 0) { throw "API deploy failed" }
gcloud run services update credence-web --project $Project --region $Region --image "$Repo/credence-web:$Tag"
if ($LASTEXITCODE -ne 0) { throw "Web deploy failed" }

$WebUrl = gcloud run services describe credence-web --project $Project --region $Region --format "value(status.url)"
Write-Host "== Deployed. Public URL: $WebUrl" -ForegroundColor Green
Write-Host "Post-deploy: run the six judge scenarios against $WebUrl and record results per docs."

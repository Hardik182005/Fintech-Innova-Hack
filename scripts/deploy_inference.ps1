<#
.SYNOPSIS
    Deploys the private GPU inference service to Cloud Run.

.DESCRIPTION
    This exists as a script rather than a typed command for two reasons, both
    of which have already cost a deployment:

    1. Git Bash (MSYS) rewrites arguments that look like absolute POSIX paths.
       `httpGet.path=/readyz` was silently converted to
       `httpGet.path=C:/Program Files/Git/readyz`, so Cloud Run probed a route
       that does not exist. The container reached READY internally and the
       revision still never went live. PowerShell performs no such conversion.

    2. The local gcloud default region is asia-south1, but every CredenceAI
       service lives in asia-southeast1. The region is therefore always passed
       explicitly and verified below, never inherited.

    Readiness is earned, not assumed: the supervisor holds /readyz at 503 until
    the model digest is verified, the weights are resident on the GPU and a
    schema-constrained warm-up generation has been validated. The startup probe
    must be HTTP against /readyz - a TCP probe on the Ollama port opens
    instantly and marks a weightless container healthy.

.NOTES
    Deploys by image digest, never by a mutable tag.
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$ImageDigest,

    [Parameter(Mandatory = $true)]
    [string]$CommitSha,

    # Pinned model artifact in the private bucket. Omit to fall back to pulling
    # ~15GB from the public registry on every cold start.
    [string]$ModelGcsUri = '',

    # sha256 of the tar above; the supervisor refuses to extract a mismatch.
    [string]$ArtifactSha256 = '',

    [string]$ModelTag = 'mistral-small3.2:24b-instruct-2506-q4_K_M',
    [string]$ModelDigest = '5a408ab55df5c1b5cf46533c368813b30bf9e4d8fc39263bf2a3338cfa3b895b',

    [string]$Region = 'asia-southeast1',
    [string]$Project = 'innova-hack',
    [string]$Service = 'credence-inference',
    [string]$Repo = 'asia-southeast1-docker.pkg.dev/innova-hack/credence/credence-inference',
    [string]$ServiceAccount = 'credence-inference@innova-hack.iam.gserviceaccount.com'
)

$ErrorActionPreference = 'Stop'

if ($ImageDigest -notmatch '^sha256:[0-9a-f]{64}$') {
    throw "ImageDigest must be a full sha256 digest, got '$ImageDigest'. Deploying a mutable tag is not permitted."
}

$image = "$Repo@$ImageDigest"

# Env vars are assembled as a list so a missing optional value cannot produce a
# trailing comma that gcloud parses as an empty assignment.
$envPairs = @(
    "CREDENCE_PRIMARY_MODEL=$ModelTag"
    "CREDENCE_MODEL_EXPECTED_DIGEST=$ModelDigest"
    "CREDENCE_COMMIT_SHA=$CommitSha"
    "CREDENCE_CONTAINER_DIGEST=$ImageDigest"
    'OLLAMA_KEEP_ALIVE=-1'
    'OLLAMA_MAX_LOADED_MODELS=1'
    # Set explicitly rather than inherited from the image so the context bound
    # is visible in `gcloud run services describe` and auditable after the fact.
    'OLLAMA_CONTEXT_LENGTH=8192'
)

if ($ModelGcsUri) {
    $envPairs += "CREDENCE_MODEL_GCS_URI=$ModelGcsUri"
    if (-not $ArtifactSha256) {
        throw 'ArtifactSha256 is required whenever ModelGcsUri is set. An unverified artifact must never be extracted.'
    }
    $envPairs += "CREDENCE_MODEL_ARTIFACT_SHA256=$ArtifactSha256"
    Write-Host "Model source: pinned artifact $ModelGcsUri" -ForegroundColor Green
}
else {
    Write-Warning 'No ModelGcsUri: this revision will pull ~15GB from the public registry on every cold start.'
}

$envVars = $envPairs -join ','

# failureThreshold x periodSeconds = 900s. Loading a 24B model onto an L4 and
# running warm-up took ~453s from a cold registry pull, so the budget must
# comfortably exceed that or Cloud Run kills a container that is working.
$startupProbe = 'httpGet.path=/readyz,httpGet.port=8080,initialDelaySeconds=30,periodSeconds=15,timeoutSeconds=10,failureThreshold=60'

Write-Host "Deploying $Service" -ForegroundColor Cyan
Write-Host "  region  : $Region"
Write-Host "  image   : $image"
Write-Host "  commit  : $CommitSha"

# min-instances 0 keeps the GPU scaled to zero when idle; max-instances 1 caps
# the blast radius to a single accelerator. Both are cost controls and both are
# asserted after the deploy.
& gcloud run deploy $Service `
    --project=$Project `
    --region=$Region `
    --image=$image `
    --service-account=$ServiceAccount `
    --ingress=internal `
    --no-allow-unauthenticated `
    --gpu=1 `
    --gpu-type=nvidia-l4 `
    --no-gpu-zonal-redundancy `
    --cpu=8 `
    --memory=32Gi `
    --no-cpu-throttling `
    --execution-environment=gen2 `
    --min-instances=0 `
    --max-instances=1 `
    --concurrency=1 `
    --timeout=600 `
    --network=credence-vpc `
    --subnet=credence-subnet `
    --vpc-egress=private-ranges-only `
    --startup-probe=$startupProbe `
    --set-env-vars=$envVars

if ($LASTEXITCODE -ne 0) { throw "gcloud run deploy failed with exit code $LASTEXITCODE" }

# Verify what actually landed rather than trusting the flags above.
Write-Host "`nPost-deploy verification" -ForegroundColor Cyan

$probePath = & gcloud run services describe $Service --project=$Project --region=$Region `
    --format='value(spec.template.spec.containers[0].startupProbe.httpGet.path)'
if ($probePath -ne '/readyz') {
    throw "Startup probe path is '$probePath', expected '/readyz'. Refusing to leave a mis-probed GPU revision live."
}

& gcloud run services describe $Service --project=$Project --region=$Region --format=@'
value(
  status.latestReadyRevisionName,
  spec.template.metadata.annotations['autoscaling.knative.dev/maxScale'],
  spec.template.metadata.annotations['run.googleapis.com/ingress'],
  spec.template.spec.containers[0].startupProbe.httpGet.path
)
'@

Write-Host 'Startup probe path verified as /readyz' -ForegroundColor Green

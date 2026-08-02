# Deployment inventory

Truth-first inventory of the **Live GCP Sandbox Stack**, read directly from the
GCP control plane on 2 August 2026. Every value below was obtained by querying
the deployment, not by reading the deployment scripts.

**Region: `asia-southeast1`.** Set and verified before every command. The local
`asia-south1` default is misleading and was not used.

Classification:

| Class | Meaning |
|---|---|
| `DEPLOYED_AND_TESTED` | Running in the sandbox and exercised end-to-end during this audit. |
| `DEPLOYED_NOT_TESTED` | Running, but not exercised — no evidence either way. |
| `NOT_DEPLOYED` | Exists in code or plans; not running. |
| `UNAVAILABLE` | Should be reachable and was not. |

## Image provenance — no service runs `:latest`

All three services are deployed **by digest**, and every deployed digest carries
a **real Git commit SHA tag** that resolves in this repository. In each case the
`latest` tag points at a *different* digest, which is the proof that the
deployment is not following a mutable tag.

| Service | Revision | Commit SHA tag | Deployed digest | `latest` points to |
|---|---|---|---|---|
| `credence-web` | `credence-web-00003-65n` | `c7ca0f4db083d0e8c2347bfc76e758beae2cd372` | `sha256:2dd1501af05d…20bc4a` | `sha256:31fc8f28…` (different) |
| `credence-api` | `credence-api-00007-7c8` | `634857f4974482aeeb9fc7d3906f9157994b117b` | `sha256:008d002c8bf8…603397` | `sha256:fff87fa2…` (different) |
| `credence-inference` | `credence-inference-00004-fn4` | `634857f4974482aeeb9fc7d3906f9157994b117b` | `sha256:e6e47450f8f4…f41ca` | `sha256:99abd95d…` (different) |

Both SHAs resolve to real commits:

```
c7ca0f4  docs(web): state what the inference service actually serves, and drop the KMS claim
634857f  fix(inference): request the context window explicitly instead of trusting the env var
```

The inference container additionally carries its own provenance as environment
variables, so a running instance can state what it is without anyone consulting
the registry:

```
CREDENCE_COMMIT_SHA       = 634857f4974482aeeb9fc7d3906f9157994b117b
CREDENCE_CONTAINER_DIGEST = sha256:e6e47450f8f498bd11bfccf2ff99625b0b1f73195f022df2eb7a0a35f9ef41ca
```

**Verdict: the pre-flight requirement is met.** No service depends on the
mutable `latest` tag.

## Services

### `credence-web` — `DEPLOYED_AND_TESTED`

| Property | Value |
|---|---|
| URL | `https://credence-web-ppmafqinnq-as.a.run.app` |
| Ingress | `all` — public, as intended for the public site |
| IAM invoker | `allUsers` — correct for a public site |
| Max scale | 10 |

Tested: all 17 routes walked in live Chrome. The Next.js BFF at
`/api/credence/v1` auto-provisions a sandbox tenant per browser session into
httpOnly cookies, injects `X-Demo-Token` server-side, and redacts secrets.

### `credence-api` — `DEPLOYED_AND_TESTED`

| Property | Value |
|---|---|
| URL | `https://credence-api-ppmafqinnq-as.a.run.app` |
| **Ingress** | **`internal`** |
| Max scale / min scale | 3 / 0 (revision-level) |
| Network | `credence-vpc` / `credence-subnet`, egress `all-traffic` |
| Model provider | `ollama` — **not fixture** |
| Inference auth | `CREDENCE_INFERENCE_USE_OIDC = true` |
| Environment | `sandbox` |

Verified live: an unauthenticated request from the public internet to
`/v1/agents` returns **404** — Cloud Run's response for a request that never
reaches the container.

Secrets are Secret Manager references, never literal values:

```
CREDENCE_DATABASE_PASSWORD    -> secret credence-db-password
CREDENCE_DEMO_RESET_TOKEN     -> secret credence-demo-token
CREDENCE_PASSPORT_SIGNING_KEY_PEM -> secret credence-passport-signing-key
```

The Ed25519 passport signing key lives in Secret Manager with the `credence-api`
service account holding `roles/secretmanager.secretAccessor` on that one secret.

**The inference URL is never exposed to the browser.** It is an API-side
environment variable; the browser talks only to the BFF.

### `credence-inference` — `DEPLOYED_AND_TESTED`

| Property | Value |
|---|---|
| URL | `https://credence-inference-ppmafqinnq-as.a.run.app` |
| IAM invoker | **`serviceAccount:credence-api@innova-hack.iam.gserviceaccount.com` only** |
| GPU | `nvidia.com/gpu = 1` (NVIDIA L4) |
| CPU / memory | 8 vCPU / 32 GiB |
| **Max scale** | **1** |
| **Min scale** | **0** |
| **Concurrency** | **1** |
| Request timeout | 600 s |
| Zonal redundancy | disabled |
| Network | `credence-vpc` / `credence-subnet`, egress `private-ranges-only` |

**GPU cost bounds confirmed after testing: max = 1, min = 0, concurrency = 1.**
The service scales to zero when idle. No parallel benchmark loop was run at any
point during this audit.

## Model — `DEPLOYED_AND_TESTED`

| Property | Value |
|---|---|
| `CREDENCE_PRIMARY_MODEL` | `mistral-small3.2:24b-instruct-2506-q4_K_M` |
| `CREDENCE_MODEL_EXPECTED_DIGEST` | `5a408ab55df5c1b5cf46533c368813b30bf9e4d8fc39263bf2a3338cfa3b895b` |
| Quantisation | Q4_K_M |
| VRAM observed | ~15 098 MiB |
| `OLLAMA_CONTEXT_LENGTH` | 8192 |
| `n_ctx_slot` observed | 8192 |
| `OLLAMA_KEEP_ALIVE` | `-1` (stay resident while the instance lives) |
| `OLLAMA_MAX_LOADED_MODELS` | 1 |

The full tag is written out, not shortened. The digest is pinned as an
**expected** value the container checks, not merely recorded.

**No 15 GB public pull on cold start.** The weights come from a private GCS
object with its own content hash:

```
CREDENCE_MODEL_GCS_URI          = gs://credence-models-625136990338/
                                  mistral-small3.2-24b-instruct-2506-q4_K_M/
                                  5a408ab5…b895b/models.tar
CREDENCE_MODEL_ARTIFACT_SHA256  = fd63a01c7a8779e43da063fe503d2abd26ff95afed7cb11534687f3e2b703939
```

The `credence-inference` service account holds `roles/storage.objectViewer` on
that bucket — **read-only**. `roles/storage.objectAdmin` was **not** granted.

**Serving verified, not merely configured.** The evaluation suite's two
model-backed metrics — `evidence_grounding_rate` and
`hallucination_containment_rate` — produced real results from this model at
05:43:38 UTC (3/3 and 3/3). Those cases cannot pass without a model answering,
so this is behavioural evidence of serving, not a configuration reading.

The site therefore names the model rather than showing `Model verification
pending`. Had verification failed, the placeholder was the required display.

**`qwen3:8b` is gone (D-4).** Seeded agents previously advertised it; no
deployment ever pulled it. Advertising an undeployed fallback is a resilience
claim with nothing behind it.

**Cold start.** No persistent disk is attached, so a scaled-to-zero instance
spends ~350 s fetching and loading before it serves. Persistent caching is
**not** configured and is not claimed.

## `NOT_DEPLOYED`

| Component | Note |
|---|---|
| Fixture model gateway | Correct. It exists for local and unit tests only. The sandbox runs `CREDENCE_MODEL_PROVIDER = ollama`. |
| CPU fallback inference | `enable_cpu_fallback = false`. The System Intelligence page reports "Not connected" rather than zero fallback events. |
| Second independent verifier model | Single-GPU deployment. Verifier disagreement rate reports "Not connected". |
| pgvector / embedding model / reranker | No extension, no vector column, no embedding model (D-9). |
| Billing integration | `billing_connected: false`, "Billing data not connected". |
| Voice provider | Disabled; narration degrades to text. |

## `UNAVAILABLE` (transient, explained)

| Occurrence | Explanation |
|---|---|
| Grounding and containment metrics, Run 1 (05:28:29) | `ReadTimeout` on a cold GPU. Reported `not_evaluated` with `value: null` — never `0`. Both measured normally on the warm run 15 minutes later. |

## Findings

### S-2 (new) — `credence-api` carries an `allUsers` invoker binding

`credence-api` has this IAM binding:

```json
{"members": ["allUsers"], "role": "roles/run.invoker"}
```

It is **not currently exploitable**: `ingress=internal` stops the request at the
network layer before IAM is consulted, which is why the live probe returned 404.

But the API's privacy rests on **one** control. If ingress is ever widened to
`all` — a one-word change, and the kind of change made while debugging — the API
becomes publicly invocable at the platform layer with no second lock behind it.
Compare `credence-inference`, which is correctly restricted to the
`credence-api` service account alone and would still be protected.

**Recommendation:** remove the `allUsers` binding from `credence-api` and grant
`roles/run.invoker` to the `credence-web` runtime service account instead. Not
applied here — it is an IAM change on a live service and is outside what was
authorised.

### The deployed code predates this audit's fixes

Every fix in `docs/DEFECT_REGISTER.md` — S-1, D-1 through D-7, D-9, D-10, P-1 —
is **in the working tree only**. The running revisions are built from commits
that precede them.

Directly observable: the live site still renders the **pgvector** claim in three
places (D-9), because `frontend/components/deployment.tsx` is modified locally
and uncommitted.

**No claim in any audit report should be read as describing the currently
deployed site.** The reports describe the audited codebase. Redeploying requires
a commit first, and per the standing constraint the repository's own hourly
auto-commit process owns that step — I have not committed or pushed.

When that deployment happens it must follow the same rule this inventory just
verified: build, tag with the truthful commit SHA, deploy **by digest**, and
never deploy `:latest`.

## Language check on the live site

Verified by fetching the deployed page and counting occurrences:

| String | Count | Required |
|---|---|---|
| "Live Production Cloud Stack" / "Live Production" | **0** | must be absent |
| "Production Infrastructure" | **0** | must be absent |
| "GCP Sandbox" | **6** | replacement in place |
| "production-ready" / "production ready" | **0** | must be absent |
| `qwen3` | **0** | must be absent |
| `mistral` | 5 | correct — verified model |
| `pgvector` | **8** | **must be absent — fix is uncommitted, see above** |

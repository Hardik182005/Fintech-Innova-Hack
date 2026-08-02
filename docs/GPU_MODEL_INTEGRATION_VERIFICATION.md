# Real GPU Model Integration — Live Verification Report

**Date:** 2026-08-02 (all timestamps UTC, taken from Cloud Logging, which is
treated as authoritative for sequencing)
**Project:** `innova-hack` · **Region:** `asia-southeast1`
**Environment:** GCP sandbox. Synthetic data and test credits only. No real
money moves.

Everything below was observed on the deployed services. Where a claim could not
be verified live it is marked as such rather than asserted.

---

## 1. What is deployed

| Service | Image (immutable digest) | Commit | Revision | Ingress | Scale | Concurrency |
|---|---|---|---|---|---|---|
| `credence-web` | `credence-web@sha256:2dd1501a…20bc4a` | `c7ca0f4db083d0e8c2347bfc76e758beae2cd372` | `credence-web-00003-65n` | all (public) | max 3 / min 0 | 80 |
| `credence-api` | `credence-api@sha256:008d002c…603397` | `634857f4974482aeeb9fc7d3906f9157994b117b` | `credence-api-00007-7c8` | internal | max 3 / min 0 | 80 |
| `credence-inference` | `credence-inference@sha256:e6e47450…f41ca` | `634857f4974482aeeb9fc7d3906f9157994b117b` | `credence-inference-00004-fn4` | internal | max 1 / min unset (= 0) | 1 |

No service runs from the mutable `:latest` tag. All three are pinned by digest.
`credence-web` was moved off `:latest` as part of this work; the image was
built, tagged with the real commit SHA `c7ca0f4db083d0e8c2347bfc76e758beae2cd372`,
and deployed by digest.

**Invoker IAM**

- `credence-inference` — exactly one member: `serviceAccount:credence-api@innova-hack.iam.gserviceaccount.com`.
- `credence-api` — `allUsers`, but ingress is `internal`, so it is unreachable
  from the internet. See finding F-4 below: the IAM binding is more permissive
  than the network control that is actually protecting it.
- `credence-web` — `allUsers`, intended (it is the public site).

---

## 2. Model verification

Verified by the inference container itself, before it will report ready:

```
2026-08-02 04:36:06,215 INFO READY
  model=mistral-small3.2:24b-instruct-2506-q4_K_M
  digest=5a408ab55df5c1b5cf46533c368813b30bf9e4d8fc39263bf2a3338cfa3b895b
  quant=Q4_K_M vram=15098MiB load=263.21s warmup=76.7s
```

The digest is compared against `CREDENCE_MODEL_EXPECTED_DIGEST` and a mismatch
raises before readiness. The tag was not shortened or invented — it is the tag
the runtime reports through Ollama's own `/api/ps`.

**GPU execution, not CPU fallback** — from the same startup:

```
load_tensors: offloaded 41/41 layers to GPU
load_tensors:        CUDA0 model buffer size = 13299.79 MiB
llama_kv_cache:      CUDA0 KV buffer size =  1280.00 MiB
llama_context: n_ctx = 8192   n_ctx_seq = 8192
starting llama-server … -c 8192 -np 1 --flash-attn auto
```

All 41 of 41 layers on the accelerator, model weights and KV cache both in CUDA
buffers. No OOM in any log line on any revision. Peak VRAM 15,098 MiB of the
L4's 22 GiB (≈68%).

**Model artifact provenance** — the model is not pulled from the public registry
at cold start. It is restored from a pinned artifact in GCS:

```
restoring pinned model artifact from
gs://credence-models-625136990338/mistral-small3.2-24b-instruct-2506-q4_K_M/
  5a408ab55df5c1b5cf46533c368813b30bf9e4d8fc39263bf2a3338cfa3b895b/models.tar
```

with `CREDENCE_MODEL_ARTIFACT_SHA256=fd63a01c7a8779e43da063fe503d2abd26ff95afed7cb11534687f3e2b703939`
checked on restore. The inference service account holds
`roles/storage.objectViewer` on that bucket — read-only, as authorised.
`roles/storage.objectAdmin` was **not** granted.

**Readiness is earned, not assumed.** `/readyz` returned 503 continuously from
04:30:53 to 04:35:53 while the artifact restored and the model loaded, and only
went to 200 after the digest check, the schema-constrained warm-up and the GPU
confirmation all passed. The startup probe is an HTTP probe on `/readyz`; there
is no bare TCP probe anywhere in the configuration.

**No fallback model is claimed.** There is no `qwen3:8b` configuration on the
deployed inference service. `CREDENCE_OLLAMA_EMBEDDING_MODEL` names
`qwen3-embedding:0.6b` in application settings, but that model is **not
downloaded and not served** — see finding F-3.

---

## 3. The complete live trace (the gate for everything downstream)

One full application, created and evaluated entirely through the public site's
BFF, on the final configuration:

`credence-web` → `credence-api` → `credence-inference` → Mistral Small 3.2 24B →
deterministic engine → OPA → controlled result.

| | |
|---|---|
| Application | `app_8824b1dcd8b94e6e8838` |
| Start / end | 04:36:27.093 → 04:37:20.918 |
| End-to-end latency | **53.67 s** (warm GPU) |
| HTTP | 200 |
| Decision | `HUMAN_REVIEW_REQUIRED` |
| `approved_limit_minor` | 11 000 000 (₹110,000.00) |
| Reason codes | `PROMPT_INJECTION_SUSPECTED`, `FIRST_CREDIT_FOR_AGENT`, `EXPECTED_LOSS_ABOVE_THRESHOLD` |
| `receipt_hash` | `fe200ae470daca97fad5f92d31ced93d1d4dd732a1bfb766b187c6f398f61506` |

Three model calls served it, all at the full context window:

| Role | Prompt tokens | Generated | Prompt eval | Decode | Wall |
|---|---|---|---|---|---|
| Analyst | 644 | 424 | 744 ms (862 tok/s) | 26.01 s (16.30 tok/s) | 26.76 s |
| Underwriter | 709 | 110 | 820 ms (858 tok/s) | 6.67 s (16.48 tok/s) | 7.49 s |
| Critic | 814 | 266 | 905 ms (895 tok/s) | 16.28 s (16.34 tok/s) | 17.18 s |

`n_ctx_slot = 8192` on all three, `truncated = 0`. Time to first token is
bounded by prompt eval: **≈0.74–0.91 s**. Total model time 51.4 s of the 53.7 s
end-to-end, so the deterministic engine, OPA and persistence account for ~2.3 s.

**Determinism.** Three separate applications built from identical inputs
(`app_ca7722a5e8e74ea58017`, `app_88dd891b016442bb82bf`,
`app_8824b1dcd8b94e6e8838`) produced byte-identical decisions and the same
`receipt_hash` `fe200ae4…`, across two different inference revisions and two API
revisions. Temperature is 0 and the receipt hashes decision content, so this is
expected — but it had not been demonstrated live before.

**OPA participated.** The deployed telemetry reports `POLICY_ENGINE`
processed 7, succeeded 0, controlled rejections 7 — every evaluation reached the
policy engine and none produced an auto-approval. `service_health` reports the
OPA sidecar healthy.

**The model influenced the outcome.** `PROMPT_INJECTION_SUSPECTED` is only
emitted when the analyst returns the risk flag `instruction_in_evidence`
(`credence/underwriting/decision.py:100-102`). It appears in the trace, so the
model's structured output was parsed, validated and consumed by the
deterministic engine. It is also almost certainly a **false positive** — see
finding F-1.

---

## 4. FixtureModelGateway is not instantiated

Four independent lines of evidence:

1. **Configuration** — deployed revision `credence-api-00007-7c8` has
   `CREDENCE_MODEL_PROVIDER=ollama`.
2. **Startup guard** — `Settings._forbid_fixture_gateway_on_gcp`
   (`credence/config.py:128-138`) raises if `model_provider == "fixture"` under
   `run_mode=GCP_COST`. The service started, so the provider is not `fixture`.
3. **Runtime self-report** — `GET /v1/system-intelligence` on the live API
   returns `models.provider: "ollama"`,
   `analyst_model: "mistral-small3.2:24b-instruct-2506-q4_K_M"`.
4. **Observable GPU work** — each evaluation is matched one-for-one by
   `POST /api/chat` on the private inference service with GPU decode logs. The
   fixture gateway is in-process and makes no HTTP call at all.

---

## 5. Fail-closed behaviour when the model is unavailable

Observed live, not simulated. Two evaluations arrived while the GPU was cold:

| Time | Application | Client wall | Result |
|---|---|---|---|
| 04:18 | `app_3afcae361b9c4f3caffb` | 141.76 s | `HUMAN_REVIEW_REQUIRED` + `AI_EVIDENCE_CHECKS_UNAVAILABLE` |
| earlier | (warm-up attempt) | 240 s | `HUMAN_REVIEW_REQUIRED` + `AI_EVIDENCE_CHECKS_UNAVAILABLE` |

Both returned `HUMAN_REVIEW_REQUIRED`. Neither approved anything. No decision
in any observed run was auto-approved on model failure. Cloud Run also returned
429 (`no available instance`) on three occasions; the gateway treated that as an
`HTTPStatusError`, retried exactly once, and the retry succeeded — visible in
the API log as `inference analyst attempt 1 failed (HTTPStatusError); retrying
once` at 04:25:10.

Caveat: these are genuine outages caused by cold start and concurrency limits,
not deliberate fault injection. A synthetic fault-injection test (unreachable
URL, malformed response) is covered by unit tests
(`tests/unit/test_model_gateway_resilience.py`) but has not been run against
the deployed service.

---

## 6. Defects found and fixed during this work

Each was a live defect on the deployed system, each has a regression test, and
each is fixed in a committed change deployed by digest.

### F-A · Length bounds in the decoding grammar broke every model call
**Commit `ed820323f5305e7fce98965ee22d1cb5ce7f5d0c`**

`TaskAnalysis.summary` and `RiskOpinion.rationale` carry
`Field(max_length=2000)`. Pydantic emitted `maxLength: 2000` into the JSON
schema sent to Ollama as `format`, llama.cpp expanded it into 2000 repeated
character rules, refused to build the grammar, and answered **400**. Every
analyst call failed, surfaced as `ModelUnavailableError` →
`AI_EVIDENCE_CHECKS_UNAVAILABLE`, and was indistinguishable from a GPU outage.
Unit tests never caught it because the fixture gateway compiles no grammar.

Fixed by `grammar_schema()`, which strips length keywords from the schema sent
to the decoder while `model_validate` still enforces them on the response — so
an over-long summary still fails closed, just at validation instead of silently
disabling inference. Verified live: `/api/chat` 200 OK.

### F-B · Passports were signed with a key that died with the process
**Commit `c6e9f2661e2740c60273376234917009a863aaf0`**

`get_signer()` returned `LocalDevSigner`, which generates a fresh Ed25519 key
per process. Issuance and verification both succeeded inside one instance, so it
looked healthy — but every redeploy invalidated every previously issued passport,
and a second instance could not verify the first's. It showed up as live
applications rejected with `AGENT_IDENTITY_INVALID` immediately after a revision
rollout.

Fixed with `StaticEd25519Signer` reading a PEM from Secret Manager
(`credence-passport-signing-key`, injected as `CREDENCE_PASSPORT_SIGNING_KEY_PEM`),
plus a startup validator that refuses to boot a GCP run mode without one. The
key was generated in-process and piped straight to `gcloud`; it was never
written to disk. Exactly one IAM binding was added:
`credence-api@innova-hack.iam.gserviceaccount.com` →
`roles/secretmanager.secretAccessor`, scoped to that single secret.

Verified live: an issued passport reports `key_version: ed25519-2247f73644d06ee0`
(a `dev-…` prefix would mean the ephemeral signer) and `verify` returns
`valid: true`.

### F-C · A KMS guarantee that did not exist
Same commit. `CREDENCE_KMS_KEY` was set on the deployed API service. **No KMS
code exists anywhere in this repository** and `Settings` has no `kms` field, so
the variable was silently ignored while implying an HSM-backed signing key. The
public site repeated the claim ("Cloud KMS asymmetric key rings for passport
signing and evidence encryption"). The existing KMS key `passport-signing` is
`EC_SIGN_P256_SHA256` at `SOFTWARE` protection level — not HSM — and nothing
uses it.

The env var was removed from the deployment and the public wording now says what
is actually deployed: an Ed25519 key held in Secret Manager
(commit `c7ca0f4db083d0e8c2347bfc76e758beae2cd372`).

### F-D · The context window was half what was configured
**Commit `634857f4974482aeeb9fc7d3906f9157994b117b`**

`OLLAMA_CONTEXT_LENGTH=8192` was set on the inference container and Ollama
overrode it: `msg="vram-based default context" total_vram="22.0 GiB"
default_num_ctx=4096`, and llama.cpp then loaded at `n_ctx = 4096`. Evidence
bundles were being truncated to half the intended window with no error anywhere.

Fixed by sending `options.num_ctx` per request from the API gateway (the option
that actually decides), requesting the same window in the supervisor's warm-up,
reporting the served context in `/readyz`, and failing readiness if the served
context is short. Verified live: `llama_context: n_ctx = 8192` and
`n_ctx_slot = 8192` on every call in the final trace.

---

## 7. Open findings (not fixed)

### F-1 · The injection detector fires on benign evidence — likely false positive
**Severity: material for any accuracy claim.**

All three traces flagged `PROMPT_INJECTION_SUSPECTED`. The evidence is an
ordinary purchase order and vendor quotation containing no instruction directed
at a model. The analyst returned `instruction_in_evidence` anyway.

This is the safe direction to fail — it forces human review rather than
approving — but a detector that fires on clean procurement documents has a false
positive rate that has not been measured, and it currently makes the difference
between a clean auto-approve path and universal human review. **No accuracy
claim about injection detection should be made until this is quantified** with a
labelled sample. This is scheduled for the accuracy phase of the audit.

### F-2 · Cold start (≈350–440 s) exceeds the client's own timeout budget (240 s)
**Severity: user-visible.**

Measured cold starts on the pinned-artifact path: model load 263.21 s and
275.44 s, warm-up 76.7 s and 77.29 s — ≈340–355 s before the first request can
be served, and up to 424 s observed end-to-end for a request that arrived cold.
The API allows `model_timeout_seconds=120` × 2 attempts = 240 s maximum.

Consequence: **any request that arrives while the GPU is scaled to zero fails
closed into human review**, no matter how healthy the system is. That is safe,
but it means the model is effectively unavailable to the first user after any
idle period. There is no persistent disk on the Cloud Run GPU service, so
scale-to-zero destroys the restored model every time. Mitigations (min-instances
1, a pre-warm ping, or a longer client budget) all cost either money or latency
and none has been applied — min-instances 1 would burn the budget in ~1.2 days
per `docs/GCP_COST_ESTIMATE.md`.

### F-3 · A configured embedding model that is not deployed
`CREDENCE_OLLAMA_EMBEDDING_MODEL=qwen3-embedding:0.6b` is in application
settings. The inference container pulls and verifies exactly one model
(`OLLAMA_MAX_LOADED_MODELS=1`, the Mistral tag). The embedding model is not
present. Any code path that calls it would 404. This has not caused an observed
failure, which suggests the path is unused — but the configuration claims a
capability that is not deployed and should either be removed or actually
provisioned.

### F-4 · `credence-api` grants `roles/run.invoker` to `allUsers`
The service is protected by `ingress: internal`, which is what is actually
keeping it private, and it is not reachable from the internet. But the IAM
binding is broader than needed, so the privacy of the API rests on a single
network control rather than two independent ones. Tightening it means removing
`allUsers` and granting the binding to the `credence-web` service account
instead. **This was not changed** — it is an IAM change outside the scope
authorised for this work, and getting it wrong takes the public site down.

### F-5 · Throughput ceiling: API max 3 vs inference max 1 × concurrency 1
**This is the documented limitation requested as step 10.**

`credence-api` scales to 3 instances at 80 concurrent requests each.
`credence-inference` is capped at **one** instance serving **one** request at a
time — deliberately, because there is one L4 and a second concurrent generation
would either thrash VRAM or halve throughput for both.

The consequence is observable and was observed three times:

```
2026-08-01T21:52:35Z  429  The request was aborted because there was no available instance
2026-08-02T04:20:23Z  429  The request was aborted because there was no available instance
2026-08-02T04:24:50Z  429  The request was aborted because there was no available instance
```

The gateway retries once and, if the second attempt also fails, returns
`ModelUnavailableError` → `HUMAN_REVIEW_REQUIRED` with
`AI_EVIDENCE_CHECKS_UNAVAILABLE`. **So concurrent evaluations do not corrupt
anything and do not over-approve — they degrade into human review.** With a
warm GPU each evaluation occupies the single slot for ~51 s of model time, so
sustained throughput is roughly **one evaluation per minute**; a second
simultaneous applicant will usually be referred to a human rather than served.

This was not changed. Raising API `maxScale` or inference concurrency was
explicitly out of scope unless the live test proved it necessary, and it did
not — the failure mode is the safe one.

---

## 8. GPU and cost safety

| | |
|---|---|
| Inference max instances | **1** (`autoscaling.knative.dev/maxScale: '1'`) |
| Inference min instances | **0** (annotation unset; Cloud Run's default is 0) |
| Concurrency | **1** |
| Zonal redundancy | disabled (35.8% cheaper on the GPU SKU) |
| Residual traffic after testing | **none** — no `/api/chat` request after 04:37:20 |
| Benchmark loops | none were run; no parallel load generator was used at any point |

**Measured GPU instance time** across the whole model-integration effort
(2026-08-01 20:41 → 2026-08-02 04:37), from Cloud Logging instance IDs:

| Instances | Logged active time |
|---|---|
| 9 GPU instances | **116.6 min** |

Adding the final instance's remaining idle window before Cloud Run shuts it
down (~15 min) gives an expected billed total of **≈2.2 GPU-hours**.

At the instance rate already catalogued in `docs/GCP_COST_ESTIMATE.md`
(0.04530186 INR/second for GPU + 8 vCPU + 32 GiB, ≈₹163.09/hour, pulled from
the Cloud Billing Catalog API in INR), that is **≈₹360**.

This is an estimate from measured duration × a catalogued unit price. It has
**not** been reconciled against an invoice — billing export is not connected,
and the deployed telemetry reports this honestly as
`infrastructure.billing_connected: false`.

---

## 9. Public site wording

Verified by fetching the live page at
`https://credence-web-ppmafqinnq-as.a.run.app/`:

| Required | Live |
|---|---|
| "Live GCP Sandbox Stack" (not "Live Production Cloud Stack") | ✅ present |
| "Deployed GCP Sandbox Infrastructure" (not "Live Production Infrastructure") | ✅ present |
| No unverified model claim | ✅ "Model verification pending" removed only after §3 passed; now names the model, quantization and context |
| No false KMS claim | ✅ removed |
| No private URL or secret exposed | ✅ the inference URL appears only in the API's environment; it is never sent to the browser |

The phrase "production ready" does not appear. Sandbox, synthetic-data and
test-credit disclaimers are retained.

---

## 10. What this report does not claim

- Not "100% accurate". Structured-output validity over the deployed window is
  54.5% (11 samples) and that number is dominated by the grammar defect F-A;
  it has not been re-measured on a clean sample.
- Not "zero hallucinations". Evidence-ID citation is validated and uncited
  claims are rejected, but hallucination containment is reported by the system
  itself as `not_evaluated`.
- Not "fully secure". F-4 is open, and no penetration test was performed.
- Not "production ready". This is a sandbox with synthetic data and test
  credits.
- Not "guaranteed repayment". No repayment waterfall has run on this deployment
  (`repayment.waterfall_runs: 0`).

"""Supervisor for the private Cloud Run GPU inference service.

Ollama alone cannot answer the only question that matters operationally —
"is the intended model actually loaded on the GPU and producing valid
structured output?" Its HTTP port opens the instant the daemon starts, long
before any weights exist. The previous deployment relied on a bare TCP probe
against that port, so Cloud Run marked the revision Ready roughly five minutes
before the 15GB model finished downloading, and a failed pull was swallowed by
`|| echo` in the entrypoint. Both failure modes are invisible from outside:
the service reports healthy and the website claims a model that is not there.

This process fixes that by owning startup and readiness itself:

  Cloud Run port (8080) -> this supervisor -> ollama (127.0.0.1:11434)

/healthz  liveness only: the daemon answers.
/readyz   ready only after every check in _startup() passed. Cloud Run's
          startup probe points here, so a revision that cannot serve the
          intended model never receives traffic.
/version  the evidence surface: resolved tag, digest, quantization, runtime
          version, commit SHA, container digest.

Readiness is deliberately expensive and computed once at startup rather than
per-request: it includes one real schema-constrained warm-up generation, which
is the only proof that weights are resident and the GPU path works.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import subprocess
import tempfile
import threading
import time
import urllib.parse
from typing import Any

import httpx
from fastapi import FastAPI, Request, Response
from fastapi.responses import JSONResponse

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger("inference-supervisor")

OLLAMA = "http://127.0.0.1:11434"
MODEL = os.environ.get("CREDENCE_PRIMARY_MODEL", "").strip()
COMMIT_SHA = os.environ.get("CREDENCE_COMMIT_SHA", "unknown")
CONTAINER_DIGEST = os.environ.get("CREDENCE_CONTAINER_DIGEST", "unknown")
# Pinned artifact source (see docs). Empty means pull from the public registry.
MODEL_GCS_URI = os.environ.get("CREDENCE_MODEL_GCS_URI", "").strip()
# Digest of the model manifest as the Ollama runtime reports it. Identifies
# *which model* is loaded.
EXPECTED_DIGEST = os.environ.get("CREDENCE_MODEL_EXPECTED_DIGEST", "").strip()
# sha256 of the artifact tar in the bucket. Identifies *which download*. These
# are deliberately separate: they are different bytes and a single variable
# compared against both can never satisfy more than one of them.
ARTIFACT_SHA256 = os.environ.get("CREDENCE_MODEL_ARTIFACT_SHA256", "").strip()

# Populated by _startup(); read by /readyz and /version.
STATE: dict[str, Any] = {
    "ready": False,
    "failure": None,
    "model_tag": MODEL or None,
    "model_digest": None,
    "quantization": None,
    "runtime_version": None,
    "gpu_name": None,
    "gpu_confirmed": False,
    "model_load_seconds": None,
    "warmup_seconds": None,
    "warmup_schema_valid": False,
    "peak_vram_mib": None,
    "oom_detected": False,
    "started_at": None,
    "ready_at": None,
}

app = FastAPI(title="credence-inference supervisor", docs_url=None, redoc_url=None)


def _nvidia_smi(query: str) -> str | None:
    """One nvidia-smi field, or None when the tool or GPU is absent."""
    try:
        out = subprocess.run(
            ["nvidia-smi", f"--query-gpu={query}", "--format=csv,noheader,nounits"],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if out.returncode != 0:
            return None
        return out.stdout.strip().splitlines()[0].strip()
    except (OSError, subprocess.SubprocessError, IndexError):
        return None


def _wait_for_daemon(timeout: float = 180.0) -> None:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        try:
            r = httpx.get(f"{OLLAMA}/api/version", timeout=5)
            if r.status_code == 200:
                STATE["runtime_version"] = r.json().get("version")
                return
        except httpx.HTTPError:
            pass
        time.sleep(2)
    raise RuntimeError("ollama daemon did not become reachable")


def _model_present() -> dict | None:
    r = httpx.get(f"{OLLAMA}/api/tags", timeout=30)
    r.raise_for_status()
    for m in r.json().get("models", []):
        if m.get("name") == MODEL:
            return m
    return None


def _pull_model() -> None:
    """Pull the model, failing hard on any error.

    The old entrypoint ended this with `|| echo "Warning..."`, which turned a
    failed 15GB pull into a healthy-looking container with no weights. A pull
    that does not succeed must stop the revision from ever going Ready.
    """
    if MODEL_GCS_URI:
        _pull_from_gcs()
        return

    logger.info("pulling %s from registry", MODEL)
    with httpx.stream(
        "POST", f"{OLLAMA}/api/pull", json={"model": MODEL, "stream": True}, timeout=None
    ) as r:
        r.raise_for_status()
        for line in r.iter_lines():
            if not line:
                continue
            event = json.loads(line)
            if "error" in event:
                raise RuntimeError(f"model pull failed: {event['error']}")
    if _model_present() is None:
        raise RuntimeError(f"model {MODEL} absent after pull reported success")


def _metadata_access_token() -> str:
    """OAuth token for the runtime service account, from the metadata server.

    The image deliberately does not ship the gcloud SDK, so the download below
    speaks to the JSON API directly. The service account holds only
    roles/storage.objectViewer on the bucket: this path can read the pinned
    artifact and cannot modify or replace it.
    """
    r = httpx.get(
        "http://metadata.google.internal/computeMetadata/v1"
        "/instance/service-accounts/default/token",
        headers={"Metadata-Flavor": "Google"},
        timeout=15,
    )
    r.raise_for_status()
    return r.json()["access_token"]


def _pull_from_gcs() -> None:
    """Restore the pinned model artifact from the private bucket, verifying its
    checksum, so a cold start does not depend on a mutable public registry tag
    remaining reachable and unchanged.

    The tar is hashed while streaming to disk rather than in a second pass;
    at ~15GB the re-read is pure cold-start latency on a metered GPU.
    """
    if not MODEL_GCS_URI.startswith("gs://"):
        raise RuntimeError(f"CREDENCE_MODEL_GCS_URI must be a gs:// URI, got {MODEL_GCS_URI!r}")

    bucket, _, obj = MODEL_GCS_URI[len("gs://") :].partition("/")
    if not bucket or not obj:
        raise RuntimeError(f"could not parse bucket/object from {MODEL_GCS_URI!r}")

    url = (
        f"https://storage.googleapis.com/storage/v1/b/{bucket}"
        f"/o/{urllib.parse.quote(obj, safe='')}?alt=media"
    )
    logger.info("restoring pinned model artifact from %s", MODEL_GCS_URI)

    tmp = os.path.join(tempfile.gettempdir(), "model-artifact.tar")
    started = time.monotonic()
    digest = hashlib.sha256()
    written = 0
    try:
        with httpx.stream(
            "GET",
            url,
            headers={"Authorization": f"Bearer {_metadata_access_token()}"},
            timeout=httpx.Timeout(60.0, read=1800.0),
            follow_redirects=True,
        ) as r:
            r.raise_for_status()
            with open(tmp, "wb") as fh:
                for chunk in r.iter_bytes(1 << 20):
                    digest.update(chunk)
                    fh.write(chunk)
                    written += len(chunk)
    except httpx.HTTPError as e:
        raise RuntimeError(f"pinned artifact download failed: {e}") from e

    logger.info(
        "downloaded %.2f GiB in %.1fs", written / (1 << 30), time.monotonic() - started
    )

    # An unverified artifact is never extracted: a wrong or truncated tar would
    # otherwise become a silently different model behind a verified-looking tag.
    if ARTIFACT_SHA256:
        actual = digest.hexdigest()
        if actual != ARTIFACT_SHA256:
            os.remove(tmp)
            raise RuntimeError(
                f"pinned artifact checksum mismatch: expected {ARTIFACT_SHA256}, got {actual}"
            )
        logger.info("pinned artifact checksum verified")
    else:
        logger.warning("CREDENCE_MODEL_ARTIFACT_SHA256 unset — artifact extracted unverified")

    os.makedirs("/root/.ollama", exist_ok=True)
    proc = subprocess.run(
        ["tar", "-xf", tmp, "-C", "/root/.ollama"],
        capture_output=True,
        text=True,
        timeout=1800,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"pinned artifact extract failed: {proc.stderr[:400]}")
    os.remove(tmp)


def _warmup() -> None:
    """One schema-constrained generation. This is the load-bearing check: it
    proves weights are resident and the constrained-decoding path works. A
    daemon that answers /api/tags can still fail here."""
    schema = {
        "type": "object",
        "properties": {"ok": {"type": "boolean"}, "n": {"type": "integer"}},
        "required": ["ok", "n"],
        "additionalProperties": False,
    }
    started = time.monotonic()
    r = httpx.post(
        f"{OLLAMA}/api/chat",
        json={
            "model": MODEL,
            "stream": False,
            "think": False,
            "format": schema,
            "options": {"num_predict": 64, "temperature": 0},
            "messages": [
                {"role": "system", "content": "Reply with JSON only."},
                {"role": "user", "content": 'Return exactly {"ok": true, "n": 1}.'},
            ],
        },
        timeout=600,
    )
    r.raise_for_status()
    STATE["warmup_seconds"] = round(time.monotonic() - started, 2)

    parsed = json.loads(r.json()["message"]["content"])
    if not isinstance(parsed.get("ok"), bool) or not isinstance(parsed.get("n"), int):
        raise RuntimeError(f"warm-up output failed schema validation: {parsed!r}")
    STATE["warmup_schema_valid"] = True


def _confirm_gpu_execution() -> None:
    """Confirm the model is resident in VRAM, not silently running on CPU.

    /api/ps reports size_vram for each loaded model. A CPU-only fallback keeps
    the model loaded with size_vram == 0 and still answers requests, just
    slowly — exactly the silent degradation this deployment must not ship.
    """
    r = httpx.get(f"{OLLAMA}/api/ps", timeout=30)
    r.raise_for_status()
    loaded = [m for m in r.json().get("models", []) if m.get("name") == MODEL]
    if not loaded:
        raise RuntimeError("model not resident after warm-up")

    size_vram = loaded[0].get("size_vram", 0)
    if not size_vram:
        raise RuntimeError("model loaded with size_vram=0 — CPU-only fallback detected")

    STATE["gpu_confirmed"] = True
    STATE["peak_vram_mib"] = round(size_vram / (1024 * 1024))
    STATE["gpu_name"] = _nvidia_smi("name")


def _startup() -> None:
    """Full readiness sequence. Any failure leaves ready=False with a reason."""
    STATE["started_at"] = time.time()
    began = time.monotonic()
    try:
        if not MODEL:
            raise RuntimeError("CREDENCE_PRIMARY_MODEL is not set")

        if _nvidia_smi("name") is None:
            raise RuntimeError("no NVIDIA GPU visible to the container")

        _wait_for_daemon()

        if _model_present() is None:
            _pull_model()

        info = _model_present()
        if info is None:
            raise RuntimeError(f"model {MODEL} not present")

        # Resolve the real digest from the runtime rather than trusting the
        # tag string. This is what /version reports as evidence.
        STATE["model_digest"] = info.get("digest")
        STATE["quantization"] = (info.get("details") or {}).get("quantization_level")

        if EXPECTED_DIGEST and STATE["model_digest"] != EXPECTED_DIGEST:
            raise RuntimeError(
                f"model digest mismatch: expected {EXPECTED_DIGEST}, "
                f"runtime reports {STATE['model_digest']}"
            )

        STATE["model_load_seconds"] = round(time.monotonic() - began, 2)
        _warmup()
        _confirm_gpu_execution()

        STATE["ready"] = True
        STATE["ready_at"] = time.time()
        logger.info(
            "READY model=%s digest=%s quant=%s vram=%sMiB load=%ss warmup=%ss",
            MODEL,
            STATE["model_digest"],
            STATE["quantization"],
            STATE["peak_vram_mib"],
            STATE["model_load_seconds"],
            STATE["warmup_seconds"],
        )
    except Exception as e:
        STATE["failure"] = f"{type(e).__name__}: {e}"
        if "out of memory" in str(e).lower() or "oom" in str(e).lower():
            STATE["oom_detected"] = True
        logger.error("startup verification failed: %s", STATE["failure"])


@app.on_event("startup")
def _launch() -> None:
    threading.Thread(target=_startup, daemon=True).start()


@app.get("/healthz")
def healthz() -> Response:
    """Liveness: the daemon process answers. Deliberately does not consider
    model state — a live-but-not-ready container should be waited on, not
    killed and restarted into another 15GB download."""
    try:
        r = httpx.get(f"{OLLAMA}/api/version", timeout=5)
        if r.status_code == 200:
            return JSONResponse({"status": "ok"})
    except httpx.HTTPError:
        pass
    return JSONResponse({"status": "down"}, status_code=503)


@app.get("/readyz")
def readyz() -> Response:
    """Ready only when the GPU is visible, the exact model digest is present
    and loaded, one structured warm-up succeeded and validated, no OOM
    occurred, and GPU execution was confirmed."""
    body = {
        "ready": STATE["ready"],
        "model_tag": STATE["model_tag"],
        "model_digest": STATE["model_digest"],
        "gpu_confirmed": STATE["gpu_confirmed"],
        "warmup_schema_valid": STATE["warmup_schema_valid"],
        "oom_detected": STATE["oom_detected"],
        "model_load_seconds": STATE["model_load_seconds"],
        "warmup_seconds": STATE["warmup_seconds"],
        "peak_vram_mib": STATE["peak_vram_mib"],
        "failure": STATE["failure"],
    }
    return JSONResponse(body, status_code=200 if STATE["ready"] else 503)


@app.get("/version")
def version() -> Response:
    return JSONResponse(
        {
            "model_tag": STATE["model_tag"],
            "model_digest": STATE["model_digest"],
            "quantization": STATE["quantization"],
            "runtime": "ollama",
            "runtime_version": STATE["runtime_version"],
            "gpu": STATE["gpu_name"],
            "commit_sha": COMMIT_SHA,
            "container_digest": CONTAINER_DIGEST,
            "ready": STATE["ready"],
        }
    )


@app.api_route("/api/{path:path}", methods=["GET", "POST"])
async def proxy(path: str, request: Request) -> Response:
    """Pass inference calls through to Ollama.

    Gated on readiness: serving generations before verification has passed
    would reintroduce exactly the silent-degradation failure this supervisor
    exists to prevent.
    """
    if not STATE["ready"]:
        return JSONResponse(
            {"error": "AI_ANALYSIS_UNAVAILABLE", "detail": STATE["failure"] or "warming up"},
            status_code=503,
        )
    body = await request.body()
    async with httpx.AsyncClient(timeout=600) as client:
        upstream = await client.request(
            request.method,
            f"{OLLAMA}/api/{path}",
            content=body,
            headers={"content-type": request.headers.get("content-type", "application/json")},
        )
    return Response(
        content=upstream.content,
        status_code=upstream.status_code,
        media_type=upstream.headers.get("content-type"),
    )

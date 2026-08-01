# Private GPU inference service (Cloud Run, 1x NVIDIA L4).
#
# Ollama serves the model on loopback; a small FastAPI supervisor owns the
# Cloud Run port and provides /healthz, /readyz and /version. Readiness is
# earned (digest verified, model loaded, warm-up generation validated, GPU
# residency confirmed) rather than inferred from an open TCP socket.
FROM ollama/ollama:latest

# Pin the tag the supervisor must verify at startup. A mismatch between this
# and what the runtime reports fails readiness rather than serving quietly.
ENV CREDENCE_PRIMARY_MODEL=mistral-small3.2:24b-instruct-2506-q4_K_M
ENV OLLAMA_HOST=127.0.0.1:11434
ENV OLLAMA_KEEP_ALIVE=-1
ENV OLLAMA_MAX_LOADED_MODELS=1
# 8K context. Ollama defaults to 4096, which silently truncates longer evidence
# bundles rather than erroring - the analyst would score a task on a prompt it
# never fully saw. Raising this costs KV-cache VRAM, which is why it is bounded
# here and not left unset.
ENV OLLAMA_CONTEXT_LENGTH=8192
ENV PYTHONUNBUFFERED=1

# Build-time provenance, surfaced by /version so a running revision can be
# traced back to the exact commit and image that produced it.
ARG COMMIT_SHA=unknown
ENV CREDENCE_COMMIT_SHA=${COMMIT_SHA}

# The base image ships an `ollama` entrypoint; installing python here keeps a
# single container (one GPU, one process group) rather than adding a sidecar
# that would contend for the same accelerator.
RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 python3-pip curl tar \
    && pip3 install --no-cache-dir --break-system-packages \
        "fastapi>=0.115,<0.120" \
        "uvicorn[standard]>=0.32,<0.40" \
        "httpx>=0.27,<1.0" \
    && apt-get purge -y --auto-remove \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY inference_server.py /app/inference_server.py
COPY entrypoint_inference.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Cloud Run injects PORT; the supervisor binds it, Ollama stays on loopback
# and is never directly reachable from outside the container.
EXPOSE 8080

ENTRYPOINT ["/entrypoint.sh"]

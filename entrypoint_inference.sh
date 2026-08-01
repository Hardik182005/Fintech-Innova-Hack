#!/bin/bash
# Starts the Ollama daemon on loopback and the supervisor on the Cloud Run port.
#
# The model pull is NOT done here any more. It was previously ended with
# `|| echo "Warning: model pull failed"`, which defeated `set -e` and let a
# container with no weights report itself healthy. Model acquisition,
# digest verification, warm-up and GPU confirmation now belong to
# inference_server.py, which refuses to report ready if any of them fail.
set -euo pipefail

echo "Starting Ollama daemon on 127.0.0.1:11434..."
OLLAMA_HOST=127.0.0.1:11434 ollama serve &
OLLAMA_PID=$!

# If the daemon dies, the container must die with it rather than serve 503s
# behind a supervisor that looks alive.
trap 'kill -TERM "$OLLAMA_PID" 2>/dev/null || true' EXIT

echo "Starting inference supervisor on 0.0.0.0:${PORT:-8080}..."
exec uvicorn inference_server:app \
    --host 0.0.0.0 \
    --port "${PORT:-8080}" \
    --workers 1 \
    --timeout-keep-alive 600

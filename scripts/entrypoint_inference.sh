#!/bin/bash
set -e

echo "Starting Ollama server..."
ollama serve &
PID=$!

echo "Waiting for Ollama daemon to initialize..."
until ollama list >/dev/null 2>&1; do
    sleep 2
done

MODEL_NAME="${CREDENCE_PRIMARY_MODEL:-mistral-small3.2:24b-instruct-2506-q4_K_M}"
echo "Checking model presence: ${MODEL_NAME}"

if ! ollama list | grep -q "${MODEL_NAME}"; then
    echo "Pulling ${MODEL_NAME}..."
    ollama pull "${MODEL_NAME}" || echo "Warning: model pull failed or offline pre-load required"
fi

echo "Inference engine operational."
wait $PID

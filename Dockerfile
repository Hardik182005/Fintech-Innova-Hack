# CredenceAI API. Two stages: uv resolves the environment, the runtime image
# carries only the virtualenv and the source — no compilers, no uv, no lock
# machinery, and never any secret (all credentials arrive from Secret Manager
# as env at deploy time).

FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS build

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Dependency layer first so source edits don't re-resolve the world.
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-install-project --no-dev

COPY credence ./credence
RUN uv sync --frozen --no-dev

FROM python:3.12-slim-bookworm

WORKDIR /app

# Non-root: the process owns nothing on disk it needs to write.
RUN groupadd -r app && useradd -r -g app app

COPY --from=build /app/.venv /app/.venv
COPY --from=build /app/credence /app/credence

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1

USER app

# Cloud Run injects PORT; default matches local convention.
#
# The app consumes one CREDENCE_DATABASE_URL. In cloud the host comes from
# Terraform and the password from Secret Manager as separate env vars, so the
# URL is composed here at start-up — which keeps the full credential out of
# Terraform state and out of any image layer.
EXPOSE 8001
CMD ["sh", "-c", "\
  if [ -n \"${CREDENCE_DATABASE_HOST:-}\" ] && [ -n \"${CREDENCE_DATABASE_PASSWORD:-}\" ]; then \
    export CREDENCE_DATABASE_URL=\"postgresql+psycopg://credence:${CREDENCE_DATABASE_PASSWORD}@${CREDENCE_DATABASE_HOST}:5432/credence\"; \
  fi; \
  exec uvicorn credence.api.app:app --host 0.0.0.0 --port ${PORT:-8001}"]

"""FastAPI application. Minimal surface for Phase 1: health + OpenAPI.

Business endpoints land per docs/IMPLEMENTATION_PLAN.md as their underlying
services gain test coverage. No permanent frontend is served from here — the
frontend contract is OpenAPI + generated types (spec §3).
"""

from __future__ import annotations

from fastapi import FastAPI

from credence import __version__
from credence.config import get_settings

app = FastAPI(
    title="CredenceAI API",
    version=__version__,
    description=(
        "Task-backed credit infrastructure for autonomous agents. "
        "Sandbox environment — test credits only; no real money."
    ),
)


@app.get("/v1/health/live", tags=["health"])
def health_live() -> dict:
    return {"status": "ok", "version": __version__}


@app.get("/v1/health/ready", tags=["health"])
def health_ready() -> dict:
    settings = get_settings()
    return {
        "status": "ok",
        "version": __version__,
        "run_mode": settings.run_mode.value,
        "environment": settings.environment.value,
        "test_credits_only": True,
    }

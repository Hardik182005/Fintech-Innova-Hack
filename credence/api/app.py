"""FastAPI application assembly. The frontend contract is OpenAPI + generated
types (spec §3); no permanent UI is served from here."""

from __future__ import annotations

import re
import secrets

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from credence import __version__
from credence.config import get_settings
from credence.errors import CredenceError
from credence.state import InvalidTransitionError
from credence.telemetry import bind_request_id, reset_request_id

app = FastAPI(
    title="CredenceAI API",
    version=__version__,
    description=(
        "Task-backed credit infrastructure for autonomous agents. "
        "Sandbox environment — test credits only; no real money. "
        "LLMs advise; deterministic code decides; policy authorizes; "
        "the vault enforces; humans approve exceptions."
    ),
)


# CORS restricted to the configured frontend origins (spec §15).
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Demo-Token", "X-Request-Id"],
    expose_headers=["X-Request-Id"],
)

# Correlation ids: honour a well-formed inbound X-Request-Id, otherwise mint
# one. The id is exposed on request.state and the response header, and bound
# to a ContextVar so append_audit_event and record_stage pick it up at the
# service layer without signature threading.
_REQUEST_ID_RE = re.compile(r"^[A-Za-z0-9._\-]{1,64}$")


@app.middleware("http")
async def correlation_id_middleware(request: Request, call_next):
    inbound = request.headers.get("X-Request-Id", "")
    request_id = inbound if _REQUEST_ID_RE.fullmatch(inbound) else f"req_{secrets.token_hex(8)}"
    request.state.request_id = request_id
    token = bind_request_id(request_id)
    try:
        response = await call_next(request)
    finally:
        reset_request_id(token)
    response.headers["X-Request-Id"] = request_id
    return response


@app.exception_handler(CredenceError)
def credence_error_handler(_request: Request, exc: CredenceError) -> JSONResponse:
    status = 409 if isinstance(exc, InvalidTransitionError) else 422
    return JSONResponse(
        status_code=status,
        content={"error": {"code": exc.code.value, "detail": exc.detail}},
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
        "model_provider": settings.model_provider,
        "test_credits_only": True,
    }


from credence.api.read_routes import read_router  # noqa: E402
from credence.api.routes import demo_router, router  # noqa: E402
from credence.api.system_intelligence import intelligence_router  # noqa: E402
from credence.api.voice import voice_router  # noqa: E402

app.include_router(router)
app.include_router(read_router)
app.include_router(intelligence_router)
app.include_router(demo_router)
app.include_router(voice_router)

"""Optional voice narration of credit decisions (spec §28 rules).

Boundaries, in order of importance:

- The ElevenLabs API key lives only in server configuration. It is read at
  call time, travels in one request header to ElevenLabs, and never appears
  in a response body, a log line, or anything the browser can reach.
- The only text that ever leaves for ElevenLabs is the narration produced by
  `compose_decision_narration` — a pure function over the enumerated fields
  of the stored decision record. Raw prompts, customer documents, PII,
  detailed financial records, agent identifiers, credentials, and audit
  payloads cannot reach the provider because the composer's signature cannot
  carry them.
- Voice is optional and off the critical path. Disabled configuration or any
  provider failure degrades to 503 VOICE_UNAVAILABLE and the caller falls
  back to text; no screen depends on this module to function.
"""

from __future__ import annotations

import json

import httpx
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.api.deps import get_current_user, get_session
from credence.config import Settings, get_settings
from credence.finance_models import CreditApplication, CreditDecision
from credence.models import User

voice_router = APIRouter(prefix="/v1/voice", tags=["voice"])

ELEVENLABS_TTS_URL = "https://api.elevenlabs.io/v1/text-to-speech/{voice_id}"
ELEVENLABS_MODEL = "eleven_multilingual_v2"
ELEVENLABS_TIMEOUT_SECONDS = 30.0

# The same sentence the UI prints beside every AI output (AuthorityNote).
CLOSING_LINE = "The AI recommends. Deterministic systems decide. Financial controls enforce."

# At most this many reason codes are spoken; the rest stay on screen.
MAX_SPOKEN_REASONS = 3

OUTCOME_PHRASES = {
    "APPROVED": "approved",
    "REJECTED": "rejected",
    "HUMAN_REVIEW_REQUIRED": "referred to a human reviewer",
}

REASON_PHRASES = {
    "NO_LENDABLE_AMOUNT": "no lendable amount remained after applying the caps",
    "REVENUE_MANDATE_MISSING_OR_INVALID": "the revenue mandate is missing or invalid",
    "AI_EVIDENCE_CHECKS_UNAVAILABLE": "AI evidence checks were unavailable",
    "PROMPT_INJECTION_SUSPECTED": "a prompt injection attempt was suspected in the evidence",
    "FIRST_CREDIT_FOR_AGENT": "this is the agent's first credit",
    "PD_ABOVE_AUTO_APPROVE_THRESHOLD": (
        "the estimated default probability is above the auto-approval threshold"
    ),
    "EXPECTED_LOSS_ABOVE_THRESHOLD": "the expected loss is above the auto-approval threshold",
}


# ------------------------------------------------------------- composition --


def _spoken_amount(amount_minor: int, currency: str) -> str:
    """Spoken form of an integer minor-unit amount (test credits only)."""
    major, minor = divmod(amount_minor, 100)
    if currency != "INR":
        return f"{major:,}.{minor:02d} {currency}"
    if minor == 0:
        return f"{major:,} rupees"
    return f"{major:,} rupees and {minor} paise"


def _reason_phrase(code: str) -> str:
    return REASON_PHRASES.get(code, code.replace("_", " ").lower())


def compose_decision_narration(
    *,
    decision: str,
    approved_limit_minor: int,
    currency: str,
    reason_codes: list[str],
) -> str:
    """Compose the full narration script. Pure and deliberately narrow: only
    the outcome, the limit, and human-readable reason phrases participate. No
    identifier, email, hash, evidence text, or model output can appear here,
    because none of them is an input."""
    parts = [f"This credit application was {OUTCOME_PHRASES.get(decision, 'recorded')}."]
    if approved_limit_minor > 0:
        amount = _spoken_amount(approved_limit_minor, currency)
        if decision == "APPROVED":
            parts.append(f"The approved limit is {amount} in test credits.")
        elif decision == "HUMAN_REVIEW_REQUIRED":
            parts.append(
                f"The deterministic engine computed a limit of {amount} "
                "in test credits, pending human approval."
            )
    spoken = [_reason_phrase(code) for code in reason_codes[:MAX_SPOKEN_REASONS]]
    if spoken:
        parts.append(f"Key factors: {'; '.join(spoken)}.")
    parts.append(CLOSING_LINE)
    return " ".join(parts)


# -------------------------------------------------------------- data access --


def _owned_decision(
    session: Session, user: User, application_id: str
) -> tuple[CreditApplication, CreditDecision]:
    """Tenant-scoped fetch: a foreign or unknown application id is a plain 404,
    indistinguishable from a record that does not exist."""
    app = session.get(CreditApplication, application_id)
    if app is None or app.organization_id != user.organization_id:
        raise HTTPException(status_code=404, detail="application not found")
    decision = session.execute(
        select(CreditDecision).where(CreditDecision.application_id == application_id)
    ).scalar_one_or_none()
    if decision is None:
        raise HTTPException(status_code=404, detail="no decision recorded for this application")
    return app, decision


def _reason_codes(decision: CreditDecision) -> list[str]:
    try:
        codes = json.loads(decision.reason_codes_json or "[]")
    except ValueError:
        return []
    return [c for c in codes if isinstance(c, str)]


def _script_for(session: Session, user: User, application_id: str) -> str:
    app, decision = _owned_decision(session, user, application_id)
    return compose_decision_narration(
        decision=decision.decision,
        approved_limit_minor=decision.approved_limit_minor,
        currency=app.currency,
        reason_codes=_reason_codes(decision),
    )


# ---------------------------------------------------------------- provider --


def _enabled(settings: Settings) -> bool:
    return settings.voice_provider == "elevenlabs" and settings.elevenlabs_api_key != ""


def _unavailable() -> JSONResponse:
    return JSONResponse(
        status_code=503,
        content={
            "error": {
                "code": "VOICE_UNAVAILABLE",
                "detail": "Voice narration is not available right now.",
            }
        },
    )


def _synthesize(text: str, settings: Settings) -> bytes:
    """Text-to-speech via ElevenLabs. Exactly `text` — the composed, redacted
    narration — is sent; the key travels in a request header and is never
    logged or included in any error surfaced to the caller."""
    response = httpx.post(
        ELEVENLABS_TTS_URL.format(voice_id=settings.elevenlabs_voice_id),
        headers={"xi-api-key": settings.elevenlabs_api_key, "Accept": "audio/mpeg"},
        json={"text": text, "model_id": ELEVENLABS_MODEL},
        timeout=ELEVENLABS_TIMEOUT_SECONDS,
    )
    response.raise_for_status()
    return response.content


# --------------------------------------------------------------- endpoints --


@voice_router.get("/status")
def voice_status() -> dict:
    """Whether narration is available. Exposes a boolean and the provider
    label only — never the key, whose presence is folded into `enabled`."""
    settings = get_settings()
    return {"enabled": _enabled(settings), "provider": settings.voice_provider}


@voice_router.get("/decisions/{application_id}/script")
def decision_script(
    application_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> dict:
    """The exact text a narration would speak, so the UI can show it and tests
    can pin redaction without ever calling the provider."""
    return {"text": _script_for(session, user, application_id)}


@voice_router.post("/decisions/{application_id}")
def narrate_decision(
    application_id: str,
    session: Session = Depends(get_session),
    user: User = Depends(get_current_user),
) -> Response:
    """Narrate a decision as audio/mpeg. Any failure — disabled provider,
    network fault, provider error — is a 503 the caller treats as "fall back
    to text"; this endpoint can never block a decision from being shown."""
    text = _script_for(session, user, application_id)  # tenancy first: 404 wins
    settings = get_settings()
    if not _enabled(settings):
        return _unavailable()
    try:
        audio = _synthesize(text, settings)
    except httpx.HTTPError:
        # Deliberately not logged with detail: provider errors can echo
        # request context, and nothing about this path may leak the key.
        return _unavailable()
    return Response(
        content=audio,
        media_type="audio/mpeg",
        headers={"Cache-Control": "no-store, private"},
    )

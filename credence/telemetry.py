"""Pipeline stage telemetry and request correlation.

`record_stage` times a block of real pipeline work and persists one
PipelineStageEvent row classifying the outcome:

- SUCCEEDED             — the block completed;
- CONTROLLED_REJECTION  — the block raised CredenceError (the domain's
  reason-coded denial type) or the caller marked a non-raising denial via the
  yielded handle. A policy denial is a success of the control system, never a
  failure;
- FAILED                — an unexpected exception (re-raised), or the caller
  marked a handled infrastructure failure via the handle.

Telemetry must never break the financial operation it observes: the row is
written inside a nested try, and any telemetry error is logged and swallowed.

The request correlation id is carried in a ContextVar set by the HTTP
middleware in credence.api.app, so service-layer code (and
append_audit_event) can attach it without threading it through every
signature.
"""

from __future__ import annotations

import logging
import time
from contextlib import contextmanager
from contextvars import ContextVar, Token
from typing import TYPE_CHECKING

from credence.errors import CredenceError

if TYPE_CHECKING:  # pragma: no cover
    from collections.abc import Iterator

    from sqlalchemy.orm import Session

logger = logging.getLogger(__name__)

_request_id: ContextVar[str | None] = ContextVar("credence_request_id", default=None)


def current_request_id() -> str | None:
    """The correlation id of the request being served, if any."""
    return _request_id.get()


def bind_request_id(request_id: str) -> Token:
    return _request_id.set(request_id)


def reset_request_id(token: Token) -> None:
    _request_id.reset(token)


class StageOutcome:
    """Handle yielded by record_stage for outcomes that do not raise.

    Services in this codebase mostly express denials as returned state
    (e.g. a DENIED proposal) rather than exceptions; `reject()` lets the call
    site record that controlled outcome. `fail()` records an infrastructure
    failure the domain code caught and degraded from (e.g. model unavailable
    -> human review) — the stage failed even though the pipeline continued.
    """

    def __init__(self) -> None:
        self.status: str | None = None
        self.error_code: str | None = None

    def reject(self, error_code: str | None = None) -> None:
        self.status = "CONTROLLED_REJECTION"
        self.error_code = error_code

    def fail(self, error_code: str | None = None) -> None:
        self.status = "FAILED"
        self.error_code = error_code


def _persist(
    session: Session,
    organization_id: str,
    request_id: str | None,
    stage: str,
    status: str,
    started_ns: int,
    error_code: str | None,
) -> None:
    # Nested try: a telemetry write must never take down the operation it
    # observes. Log and continue on any failure.
    try:
        from credence.finance_models import PipelineStageEvent

        session.add(
            PipelineStageEvent(
                organization_id=organization_id,
                request_id=request_id,
                stage=stage,
                status=status,
                duration_ms=(time.perf_counter_ns() - started_ns) // 1_000_000,
                error_code=error_code,
            )
        )
    except Exception:  # noqa: BLE001 — telemetry is strictly best-effort
        logger.warning("stage telemetry write failed for %s", stage, exc_info=True)


@contextmanager
def record_stage(
    session: Session,
    organization_id: str,
    request_id: str | None,
    stage: str,
) -> Iterator[StageOutcome]:
    outcome = StageOutcome()
    started_ns = time.perf_counter_ns()
    try:
        yield outcome
    except CredenceError as e:
        # Reason-coded domain denial: the pipeline stopped this on purpose.
        _persist(
            session,
            organization_id,
            request_id,
            stage,
            "CONTROLLED_REJECTION",
            started_ns,
            e.code.value,
        )
        raise
    except Exception as e:
        _persist(
            session, organization_id, request_id, stage, "FAILED", started_ns, type(e).__name__
        )
        raise
    else:
        _persist(
            session,
            organization_id,
            request_id,
            stage,
            outcome.status or "SUCCEEDED",
            started_ns,
            outcome.error_code,
        )


def percentile_ms(sorted_durations: list[int], pct: int) -> int:
    """Nearest-rank percentile over pre-sorted integer millisecond durations.

    Pure integer arithmetic: index = ceil(pct/100 * n) - 1, floored at 0.
    """
    if not sorted_durations:
        raise ValueError("percentile of empty sample")
    n = len(sorted_durations)
    return sorted_durations[max(0, (pct * n + 99) // 100 - 1)]

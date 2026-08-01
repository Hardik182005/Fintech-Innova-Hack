"""Circuit breaker and fail-closed behaviour for the private inference gateway.

The gateway is advisory: nothing it returns may approve credit. What matters
under failure is therefore not that it recovers, but that it degrades in the
one safe direction — raising ModelUnavailableError so callers escalate to
human review. These tests pin that, plus the breaker that stops a sick GPU
from holding API workers open on 120-second timeouts.
"""

from __future__ import annotations

import json

import httpx
import pytest

from credence.config import Settings
from credence.modelgw.gateway import (
    ModelUnavailableError,
    OllamaGateway,
    _CircuitBreaker,
)


def _settings(**kw) -> Settings:
    base = {
        "run_mode": "LOCAL_DEV",
        "model_provider": "ollama",
        "inference_use_oidc": False,  # no OIDC minting in unit tests
        "ollama_base_url": "http://inference.invalid",
    }
    base.update(kw)
    return Settings(**base)


# --- circuit breaker -------------------------------------------------------


def test_breaker_opens_after_threshold_consecutive_failures():
    b = _CircuitBreaker(fail_threshold=3, reset_seconds=60)
    assert b.state == "closed"

    b.record_failure()
    b.record_failure()
    assert b.state == "closed", "must not trip before the threshold"

    b.record_failure()
    assert b.state == "open"


def test_open_breaker_rejects_calls_without_hitting_the_gpu():
    b = _CircuitBreaker(fail_threshold=1, reset_seconds=60)
    b.record_failure()
    with pytest.raises(ModelUnavailableError, match="circuit open"):
        b.before_call()


def test_success_resets_the_failure_run():
    """Consecutive, not cumulative: an intermittent failure must not
    eventually trip the breaker on an otherwise healthy service."""
    b = _CircuitBreaker(fail_threshold=3, reset_seconds=60)
    b.record_failure()
    b.record_failure()
    b.record_success()
    b.record_failure()
    b.record_failure()
    assert b.state == "closed"


def test_breaker_half_opens_after_cooldown():
    b = _CircuitBreaker(fail_threshold=1, reset_seconds=0)
    b.record_failure()
    assert b.state == "half_open"
    b.before_call()  # allowed through to probe recovery


# --- fail-closed transport behaviour ---------------------------------------


def test_transport_error_is_retried_once_then_fails_closed(monkeypatch):
    calls = {"n": 0}

    def boom(*a, **kw):
        calls["n"] += 1
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", boom)
    gw = OllamaGateway(_settings(model_max_retries=1))

    with pytest.raises(ModelUnavailableError):
        gw.analyze_task("t", {"ev_1": "text"})

    assert calls["n"] == 2, "one initial attempt plus exactly one retry"


def test_malformed_output_is_not_retried(monkeypatch):
    """Invalid JSON at temperature 0 is deterministic. Retrying only burns
    GPU time on a single shared accelerator."""
    calls = {"n": 0}

    def bad_json(*a, **kw):
        calls["n"] += 1
        return httpx.Response(
            200,
            json={"message": {"content": "not json at all"}},
            request=httpx.Request("POST", "http://inference.invalid/api/chat"),
        )

    monkeypatch.setattr(httpx, "post", bad_json)
    gw = OllamaGateway(_settings(model_max_retries=1))

    with pytest.raises(ModelUnavailableError, match="malformed"):
        gw.analyze_task("t", {"ev_1": "text"})

    assert calls["n"] == 1


def test_repeated_failures_open_the_breaker_and_short_circuit(monkeypatch):
    """After the threshold, further calls must fail fast rather than each
    waiting out the full model timeout."""
    calls = {"n": 0}

    def boom(*a, **kw):
        calls["n"] += 1
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(httpx, "post", boom)
    gw = OllamaGateway(
        _settings(model_max_retries=0, model_circuit_fail_threshold=2, model_circuit_reset_seconds=60)
    )

    for _ in range(2):
        with pytest.raises(ModelUnavailableError):
            gw.analyze_task("t", {"ev_1": "text"})
    assert calls["n"] == 2

    with pytest.raises(ModelUnavailableError, match="circuit open"):
        gw.analyze_task("t", {"ev_1": "text"})
    assert calls["n"] == 2, "open circuit must not reach the GPU"


def test_http_5xx_fails_closed(monkeypatch):
    def unavailable(*a, **kw):
        return httpx.Response(
            503,
            json={"error": "AI_ANALYSIS_UNAVAILABLE"},
            request=httpx.Request("POST", "http://inference.invalid/api/chat"),
        )

    monkeypatch.setattr(httpx, "post", unavailable)
    gw = OllamaGateway(_settings())

    with pytest.raises(ModelUnavailableError):
        gw.analyze_task("t", {"ev_1": "text"})


def test_oidc_minting_failure_never_downgrades_to_anonymous(monkeypatch):
    """A token that cannot be minted must abort the call. Falling through
    unauthenticated is how a private service starts taking anonymous traffic."""
    sent = {"called": False}

    def should_not_be_called(*a, **kw):
        sent["called"] = True
        return httpx.Response(200, json={"message": {"content": "{}"}})

    monkeypatch.setattr(httpx, "post", should_not_be_called)
    gw = OllamaGateway(_settings(inference_use_oidc=True))

    with pytest.raises(ModelUnavailableError, match="OIDC"):
        gw.analyze_task("t", {"ev_1": "text"})
    assert not sent["called"]

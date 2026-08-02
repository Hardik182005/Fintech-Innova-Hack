"""Circuit breaker and fail-closed behaviour for the private inference gateway.

The gateway is advisory: nothing it returns may approve credit. What matters
under failure is therefore not that it recovers, but that it degrades in the
one safe direction — raising ModelUnavailableError so callers escalate to
human review. These tests pin that, plus the breaker that stops a sick GPU
from holding API workers open on 120-second timeouts.
"""

from __future__ import annotations

import builtins
import json

import httpx
import pytest
from pydantic import ValidationError

from credence.config import Settings
from credence.modelgw.gateway import (
    ModelUnavailableError,
    OllamaGateway,
    RiskOpinion,
    TaskAnalysis,
    _CircuitBreaker,
    grammar_schema,
    mint_identity_token,
)

# Minimal schema-valid TaskAnalysis, so a test about auth headers fails on the
# headers rather than on output validation.
_ANALYSIS = {"summary": "s", "claims": [], "missing_evidence": [], "risk_flags": []}


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
        _settings(
            model_max_retries=0,
            model_circuit_fail_threshold=2,
            model_circuit_reset_seconds=60,
        )
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


# --- OIDC minting ----------------------------------------------------------
#
# The test above only ever asserted that a *failed* mint fails closed, and a
# mint always fails on a developer machine because there is no metadata
# server. So it passed identically whether the minting code worked or raised
# ModuleNotFoundError on an undeclared import — which is exactly what it did in
# Cloud Run, turning every deployed inference call into a silent human-review
# escalation with no outbound request to show for it. These pin the success
# path and the dependency.


def _metadata_ok(token: str = "header.payload.signature"):
    def _get(url, *a, **kw):
        assert "metadata" in url, f"identity token must come from the metadata server, got {url}"
        assert kw["headers"]["Metadata-Flavor"] == "Google"
        return httpx.Response(200, text=token, request=httpx.Request("GET", url))

    return _get


def test_minted_token_is_attached_to_the_inference_call(monkeypatch):
    captured: dict = {}

    def _post(url, *a, **kw):
        captured["headers"] = kw.get("headers") or {}
        return httpx.Response(
            200,
            json={"message": {"content": json.dumps(_ANALYSIS)}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "get", _metadata_ok())
    monkeypatch.setattr(httpx, "post", _post)

    OllamaGateway(_settings(inference_use_oidc=True)).analyze_task("t", {"ev_1": "text"})

    assert captured["headers"]["Authorization"] == "Bearer header.payload.signature"


def test_minting_does_not_depend_on_the_requests_package(monkeypatch):
    """`requests` is not a declared runtime dependency — every HTTP call in
    this project uses httpx. It resolves on a developer machine only through
    the dev group, so an import of it here is invisible until the container
    runs. Blocking it reproduces the runtime image."""
    real_import = builtins.__import__

    def blocked(name, *args, **kwargs):
        if name == "requests" or name.startswith("requests."):
            raise ModuleNotFoundError("No module named 'requests'")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", blocked)
    monkeypatch.setattr(httpx, "get", _metadata_ok())

    assert mint_identity_token("https://inference.invalid") == "header.payload.signature"


# --- constrained-decoding schema -------------------------------------------
#
# Ollama turns the schema we send into a GBNF grammar. A `maxLength: 2000`
# expands to 2000 repeated character rules; llama.cpp rejects the grammar and
# answers 400, so every analyst call failed closed to human review while
# looking like a model outage. Nothing caught it locally because the fixture
# gateway never compiles a grammar.


@pytest.mark.parametrize("model", [TaskAnalysis, RiskOpinion])
def test_no_length_bounds_reach_the_grammar(model):
    def walk(node):
        if isinstance(node, dict):
            for k, v in node.items():
                assert k not in ("maxLength", "minLength"), f"{k} would blow up the GBNF grammar"
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk(grammar_schema(model))


@pytest.mark.parametrize("model", [TaskAnalysis, RiskOpinion])
def test_structure_survives_the_strip(model):
    """Only the length keywords go. The field set, required list and enum
    patterns are what actually constrain the decode."""
    schema = grammar_schema(model)
    assert set(schema["properties"]) == set(model.model_json_schema()["properties"])
    assert schema.get("required") == model.model_json_schema().get("required")


def test_request_carries_the_configured_context_window(monkeypatch):
    """Setting OLLAMA_CONTEXT_LENGTH=8192 on the inference container was not
    enough: Ollama overrode it with a VRAM-derived default of 4096 and served
    half the intended window, truncating evidence with no error anywhere. The
    per-request option is the one that actually decides."""
    captured: dict = {}

    def _post(url, *a, **kw):
        captured["payload"] = kw["json"]
        return httpx.Response(
            200,
            json={"message": {"content": json.dumps(_ANALYSIS)}},
            request=httpx.Request("POST", url),
        )

    monkeypatch.setattr(httpx, "post", _post)
    OllamaGateway(_settings(model_context_tokens=8192)).analyze_task("t", {"ev_1": "text"})

    assert captured["payload"]["options"]["num_ctx"] == 8192


def test_length_is_still_enforced_on_the_response():
    """Stripping the bound from the grammar must not weaken validation: the
    application, not the decoder, is what keeps an over-long summary out."""
    with pytest.raises(ValidationError):
        TaskAnalysis.model_validate({**_ANALYSIS, "summary": "x" * 2001})


def test_empty_token_is_not_treated_as_a_credential(monkeypatch):
    """A blank 200 would otherwise produce `Authorization: Bearer `, which
    Cloud Run rejects — the same fail-closed outcome, but reported as a model
    fault rather than an auth fault."""
    monkeypatch.setattr(httpx, "get", _metadata_ok(token="   "))

    with pytest.raises(RuntimeError, match="empty identity token"):
        mint_identity_token("https://inference.invalid")

"""Voice narration endpoints: config gating, redaction, tenancy, fallback.

No test here ever reaches the real ElevenLabs API — the provider call is
stubbed at the httpx boundary. What is asserted instead is the contract that
matters: the key gates availability without ever being echoed, only the
composed script leaves the building, foreign tenants see 404, and every
failure mode is a 503 the UI can fall back from.
"""

import httpx
import pytest

import credence.api.voice as voice
from credence.config import get_settings


@pytest.fixture
def seeded(client, demo_headers):
    """A tenant with its own bearer, seeded by the happy-path scenario. Its
    records contain an owner email, agent ids, and receipt hashes — exactly
    the material the narration must never speak."""
    org = client.post(
        "/v1/organizations",
        json={"name": "Voice Test Org", "owner_email": "voice-owner@test.local"},
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    r = client.post("/v1/demo/scenarios/happy-path", headers={**demo_headers, **auth})
    assert r.status_code == 200, r.text
    return {"auth": auth, "organization_id": org["organization_id"], "run": r.json()}


def _voice_env(monkeypatch, provider: str, key: str) -> None:
    """Point the cached settings at an explicit voice configuration. Both
    variables are always set so values in a developer's .env cannot leak in."""
    monkeypatch.setenv("CREDENCE_VOICE_PROVIDER", provider)
    monkeypatch.setenv("ELEVENLABS_API_KEY", key)
    get_settings.cache_clear()


# ------------------------------------------------------------------ status --


def test_status_disabled_without_provider(client, monkeypatch):
    _voice_env(monkeypatch, "disabled", "")
    body = client.get("/v1/voice/status").json()
    assert body == {"enabled": False, "provider": "disabled"}


def test_status_disabled_when_key_missing(client, monkeypatch):
    """Provider selected but no key present: fail closed, and never hint at
    what a key would look like."""
    _voice_env(monkeypatch, "elevenlabs", "")
    body = client.get("/v1/voice/status").json()
    assert body == {"enabled": False, "provider": "elevenlabs"}


def test_status_enabled_never_echoes_the_key(client, monkeypatch):
    _voice_env(monkeypatch, "elevenlabs", "test-key-not-real")
    r = client.get("/v1/voice/status")
    assert r.json() == {"enabled": True, "provider": "elevenlabs"}
    assert "test-key-not-real" not in r.text


# ------------------------------------------------------------------ script --


def test_script_speaks_outcome_but_no_identifiers(client, seeded):
    setup = seeded["run"]["steps"][0]
    app_id = setup["application_id"]
    r = client.get(f"/v1/voice/decisions/{app_id}/script", headers=seeded["auth"])
    assert r.status_code == 200
    text = r.json()["text"]

    # The outcome and the fixed authority line are spoken.
    assert "approved" in text.lower()
    assert "1,000 rupees" in text  # happy path approves ₹1,000
    assert voice.CLOSING_LINE in text

    # Linked records hold an email, ids, and a hash. None may be spoken.
    assert "voice-owner@test.local" not in text
    assert "@" not in text
    assert seeded["run"]["seed"]["agent_id"] not in text
    assert app_id not in text
    assert setup["receipt_hash"] not in text
    assert setup["vault_id"] not in text


def test_script_is_tenant_scoped(client, seeded):
    other = client.post(
        "/v1/organizations",
        json={"name": "Other Voice Org", "owner_email": "other-voice@test.local"},
    ).json()
    other_auth = {"Authorization": f"Bearer {other['owner_api_token']}"}
    app_id = seeded["run"]["steps"][0]["application_id"]
    assert (
        client.get(f"/v1/voice/decisions/{app_id}/script", headers=other_auth).status_code == 404
    )
    assert (
        client.get("/v1/voice/decisions/app_does_not_exist/script", headers=seeded["auth"])
        .status_code
        == 404
    )


# --------------------------------------------------------------- narration --


def test_narrate_disabled_returns_voice_unavailable(client, seeded, monkeypatch):
    _voice_env(monkeypatch, "disabled", "")
    app_id = seeded["run"]["steps"][0]["application_id"]
    r = client.post(f"/v1/voice/decisions/{app_id}", headers=seeded["auth"])
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "VOICE_UNAVAILABLE"


def test_narrate_is_tenant_scoped_even_when_disabled(client, seeded, monkeypatch):
    """A foreign id is a 404, not a 503 — existence is decided before
    availability, so the error never confirms a foreign record exists."""
    _voice_env(monkeypatch, "disabled", "")
    other = client.post(
        "/v1/organizations",
        json={"name": "Other Voice Org 2", "owner_email": "other-voice2@test.local"},
    ).json()
    other_auth = {"Authorization": f"Bearer {other['owner_api_token']}"}
    app_id = seeded["run"]["steps"][0]["application_id"]
    assert client.post(f"/v1/voice/decisions/{app_id}", headers=other_auth).status_code == 404


def test_narrate_streams_audio_and_sends_only_the_script(client, seeded, monkeypatch):
    _voice_env(monkeypatch, "elevenlabs", "test-key-not-real")
    app_id = seeded["run"]["steps"][0]["application_id"]
    script = client.get(f"/v1/voice/decisions/{app_id}/script", headers=seeded["auth"]).json()[
        "text"
    ]

    captured = {}

    class FakeResponse:
        content = b"ID3-fake-mpeg-bytes"

        def raise_for_status(self):
            return None

    def fake_post(url, headers=None, json=None, timeout=None):
        captured.update(url=url, headers=headers, json=json, timeout=timeout)
        return FakeResponse()

    monkeypatch.setattr(voice.httpx, "post", fake_post)

    r = client.post(f"/v1/voice/decisions/{app_id}", headers=seeded["auth"])
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("audio/mpeg")
    assert r.headers["cache-control"] == "no-store, private"
    assert r.content == b"ID3-fake-mpeg-bytes"

    # Exactly the composed script went out — nothing more, nothing else.
    assert captured["json"]["text"] == script
    assert captured["json"]["model_id"] == "eleven_multilingual_v2"
    assert captured["timeout"] == 30.0
    # The key rides in a header to the provider and appears nowhere in the
    # response returned to the caller.
    assert captured["headers"]["xi-api-key"] == "test-key-not-real"
    assert b"test-key-not-real" not in r.content


def test_narrate_provider_failure_degrades_to_503(client, seeded, monkeypatch):
    _voice_env(monkeypatch, "elevenlabs", "test-key-not-real")
    app_id = seeded["run"]["steps"][0]["application_id"]

    def failing_post(url, **kwargs):
        raise httpx.ConnectError("provider unreachable")

    monkeypatch.setattr(voice.httpx, "post", failing_post)

    r = client.post(f"/v1/voice/decisions/{app_id}", headers=seeded["auth"])
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "VOICE_UNAVAILABLE"
    assert "test-key-not-real" not in r.text

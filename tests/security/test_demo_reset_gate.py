"""The destructive demo reset must not be reachable with the demo token alone.

Regression for a live incident: the web proxy attaches the demo token to every
`/v1/demo/*` path on the browser's behalf, so a single same-origin fetch from a
product page reached `/v1/demo/reset`, which runs `drop_all()` + `create_all()`
with no tenant scoping. Every workspace on the deployment was destroyed
(observed live: HTTP 200 in 213s). Two locks now stand between a browser and
that route — this file covers the server-side one, and
frontend/app/api/credence/__tests__ covers the proxy one.
"""

import pytest


@pytest.fixture
def admin_client(monkeypatch):
    """API client whose deployment *does* configure an admin reset token."""
    monkeypatch.setenv("CREDENCE_MODEL_PROVIDER", "fixture")
    monkeypatch.setenv("CREDENCE_DEMO_RESET_TOKEN", "test-demo-token")
    monkeypatch.setenv("CREDENCE_DEMO_ADMIN_TOKEN", "test-admin-token")
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool

    import credence.api.deps as deps
    from credence.config import get_settings

    get_settings.cache_clear()
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
        future=True,
    )
    deps.init_engine(engine)
    from credence.api.app import app

    with TestClient(app) as c:
        yield c
    get_settings.cache_clear()


def test_reset_refused_with_demo_token_only(client, demo_headers, tenant):
    """The exact call the browser made. It must not drop the database."""
    r = client.post("/v1/demo/reset", headers=demo_headers)
    assert r.status_code == 403, r.text

    # And the tenant seeded before the attempt is still there.
    auth = {"Authorization": f"Bearer {tenant['seed']['owner_api_token']}"}
    agents = client.get("/v1/agents", headers=auth)
    assert agents.status_code == 200
    assert len(agents.json()) >= 1


def test_reset_refused_when_no_admin_token_is_configured(client, demo_headers):
    """Absent config closes the route outright rather than defaulting open."""
    r = client.post(
        "/v1/demo/reset",
        headers={**demo_headers, "X-Demo-Admin-Token": "guessed"},
    )
    assert r.status_code == 403
    assert "disabled" in r.json()["detail"]


def test_reset_refused_with_wrong_admin_token(admin_client, demo_headers):
    r = admin_client.post(
        "/v1/demo/reset",
        headers={**demo_headers, "X-Demo-Admin-Token": "wrong"},
    )
    assert r.status_code == 403
    assert r.json()["detail"] == "invalid admin token"


def test_reset_still_works_for_an_operator_holding_both_credentials(
    admin_client, demo_headers
):
    """The gate is authorization, not removal: the operator path still works."""
    seeded = admin_client.post("/v1/demo/scenarios/happy-path", headers=demo_headers)
    assert seeded.status_code == 200
    auth = {"Authorization": f"Bearer {seeded.json()['seed']['owner_api_token']}"}

    r = admin_client.post(
        "/v1/demo/reset",
        headers={**demo_headers, "X-Demo-Admin-Token": "test-admin-token"},
    )
    assert r.status_code == 200
    assert r.json()["status"] == "reset"

    # The reset really did drop the data it was asked to drop.
    assert admin_client.get("/v1/agents", headers=auth).status_code == 401

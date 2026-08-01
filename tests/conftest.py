"""Shared API fixtures for integration and security suites."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool

import credence.api.deps as deps


@pytest.fixture
def client(monkeypatch):
    """API client on a fresh in-memory SQLite DB with the fixture model."""
    monkeypatch.setenv("CREDENCE_MODEL_PROVIDER", "fixture")
    monkeypatch.setenv("CREDENCE_DEMO_RESET_TOKEN", "test-demo-token")
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


@pytest.fixture
def demo_headers():
    return {"X-Demo-Token": "test-demo-token"}


@pytest.fixture
def tenant(client, demo_headers):
    """Runs the happy-path scenario once; returns its full narrative."""
    r = client.post("/v1/demo/scenarios/happy-path", headers=demo_headers)
    assert r.status_code == 200, r.text
    return r.json()

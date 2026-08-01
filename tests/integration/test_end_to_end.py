"""End-to-end API flows: the six judge scenarios plus API-level lifecycle."""


def scenario(client, demo_headers, name):
    r = client.post(f"/v1/demo/scenarios/{name}", headers=demo_headers)
    assert r.status_code == 200, r.text
    return r.json()


def test_scenario_a_happy_path(client, demo_headers):
    data = scenario(client, demo_headers, "happy-path")
    steps = {s["step"]: s for s in data["steps"]}

    setup = steps["SETUP"]
    assert setup["decision"] == "APPROVED"
    assert setup["approved_limit_minor"] == 100_000  # ₹1,000
    assert set(setup["caps"]) == {
        "requested_minor",
        "available_exposure_minor",
        "revenue_advance_cap_minor",
        "task_cost_cap_minor",
        "policy_cap_minor",
    }

    waterfall = steps["REVENUE_AND_WATERFALL"]
    assert waterfall["principal_repaid_minor"] == 100_000
    assert waterfall["fee_paid_minor"] == 5_000  # 5% sandbox fee
    assert waterfall["owner_released_minor"] == 75_000
    assert [a["step"] for a in waterfall["allocations"]] == [
        "REPAY_PRINCIPAL",
        "PAY_FEE",
        "RELEASE_TO_OWNER",
    ]

    closed = steps["CLOSED"]
    assert closed["vault_status"] == "CLOSED"
    assert closed["ledger_balanced"] is True
    assert closed["audit_chain_intact"] is True


def test_scenario_b_overspend_blocked(client, demo_headers):
    data = scenario(client, demo_headers, "overspend")
    assert data["proposal_status"] == "DENIED"
    assert "TRANSACTION_LIMIT_EXCEEDED" in data["reasons"]
    assert "TASK_LIMIT_EXCEEDED" in data["reasons"]
    assert data["ledger_balanced"] is True  # nothing moved


def test_scenario_c_unapproved_vendor_blocked(client, demo_headers):
    data = scenario(client, demo_headers, "unapproved-vendor")
    assert data["proposal_status"] == "DENIED"
    assert "VENDOR_NOT_ALLOWED" in data["reasons"]


def test_scenario_d_split_payment_freezes_vault(client, demo_headers):
    data = scenario(client, demo_headers, "split-payment")
    assert data["vault_status"] == "FROZEN"
    denied = [a for a in data["attempts"] if a["status"] == "DENIED"]
    assert any("SPLIT_PATTERN_DETECTED" in a["reasons"] for a in denied)


def test_scenario_e_kill_switch(client, demo_headers):
    data = scenario(client, demo_headers, "revoke-mid-task")
    assert isinstance(data["kill_switch_latency_ms"], int)
    blocked = data["post_revocation_execution"]
    assert blocked != "ERROR: was not blocked"
    assert blocked["code"] == "POLICY_DENIED"


def test_scenario_f_task_failure_bounded(client, demo_headers):
    data = scenario(client, demo_headers, "task-failure")
    recovery = data["recovery"]
    # Spent ₹600 of ₹1,000; sweep ₹400 unspent + ₹250 reserve; loss bounded.
    assert recovery["swept_unspent_minor"] == 40_000
    assert recovery["reserve_drawn_minor"] == 25_000
    assert recovery["simulated_loss_minor"] == 35_000
    assert data["vault_status"] == "DEFAULTED"
    assert data["lender_downside_bounded"] is True
    assert data["ledger_balanced"] is True


def test_demo_requires_token(client):
    r = client.post("/v1/demo/scenarios/happy-path")
    assert r.status_code == 403


def test_health_endpoints(client):
    assert client.get("/v1/health/live").status_code == 200
    ready = client.get("/v1/health/ready").json()
    assert ready["test_credits_only"] is True
    assert ready["environment"] == "sandbox"


def test_api_lifecycle_with_auth(client, demo_headers):
    """Manual flow through public endpoints with bearer auth."""
    org = client.post(
        "/v1/organizations", json={"name": "TestCo", "owner_email": "o@t.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}

    agent = client.post(
        "/v1/agents",
        json={
            "name": "TestAgent",
            "model_provider": "qwen",
            "model_name": "qwen3:8b",
            "model_version_hash": "sha256:x",
        },
        headers=auth,
    ).json()

    passport = client.post(
        f"/v1/agents/{agent['agent_id']}/passport",
        json={
            "purpose": "test",
            "permitted_task_categories": ["COMPUTE"],
            "max_borrowing_authority_minor": 100_000,
            "max_transaction_value_minor": 50_000,
            "approved_vendor_ids": ["vendor_gcp_compute"],
        },
        headers=auth,
    )
    assert passport.status_code == 201, passport.text

    verify = client.get(f"/v1/agents/{agent['agent_id']}/passport/verify", headers=auth).json()
    assert verify["valid"] is True

    # Kill switch via API, then verification fails closed.
    freeze = client.post(
        f"/v1/agents/{agent['agent_id']}/revoke",
        json={"reason": "owner emergency stop"},
        headers=auth,
    ).json()
    assert freeze["latency_ms"] >= 0
    verify2 = client.get(f"/v1/agents/{agent['agent_id']}/passport/verify", headers=auth).json()
    assert verify2["valid"] is False
    assert "PASSPORT_REVOKED" in verify2["reason_codes"]


def test_tenant_isolation(client, demo_headers):
    """Org B cannot see org A's resources."""
    a = client.post("/v1/organizations", json={"name": "OrgA", "owner_email": "a@t.local"}).json()
    b = client.post("/v1/organizations", json={"name": "OrgB", "owner_email": "b@t.local"}).json()
    auth_a = {"Authorization": f"Bearer {a['owner_api_token']}"}
    auth_b = {"Authorization": f"Bearer {b['owner_api_token']}"}

    agent = client.post(
        "/v1/agents",
        json={
            "name": "AgentA",
            "model_provider": "qwen",
            "model_name": "qwen3:8b",
            "model_version_hash": "sha256:x",
        },
        headers=auth_a,
    ).json()

    r = client.get(f"/v1/agents/{agent['agent_id']}/passport/verify", headers=auth_b)
    assert r.status_code == 404  # not found in tenant B, existence not leaked

    r = client.get(f"/v1/organizations/{a['organization_id']}", headers=auth_b)
    assert r.status_code == 404


def test_unauthenticated_rejected(client):
    assert (
        client.post(
            "/v1/agents",
            json={
                "name": "x",
                "model_provider": "p",
                "model_name": "m",
                "model_version_hash": "h",
            },
        ).status_code
        == 401
    )


def test_metrics_endpoint(client, demo_headers, tenant):
    r = client.post("/v1/organizations", json={"name": "MetricsCo", "owner_email": "m@t.local"})
    assert r.status_code == 201, r.text
    auth = {"Authorization": f"Bearer {r.json()['owner_api_token']}"}
    metrics = client.get("/v1/metrics/evaluation", headers=auth).json()
    assert metrics["ledger_balanced"] is True
    assert metrics["audit_chain_intact"] is True
    assert metrics["test_credits_only"] is True

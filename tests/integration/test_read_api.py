"""Read-side API: directory listings, aggregates and composed detail views.

Every assertion here is anchored to figures the write-side scenarios actually
produce, so a drift in the financial engine breaks these tests rather than
silently changing what the console displays.
"""

import pytest


@pytest.fixture
def seeded(client, demo_headers):
    """A tenant with its own bearer token, seeded by the happy-path scenario.

    The scenario is run twice: once unauthenticated to mint the organization,
    then again authenticated so the second run lands inside that same tenant.
    """
    org = client.post(
        "/v1/organizations",
        json={"name": "Read API Test Org", "owner_email": "read-api@test.local"},
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    r = client.post("/v1/demo/scenarios/happy-path", headers={**demo_headers, **auth})
    assert r.status_code == 200, r.text
    return {"auth": auth, "organization_id": org["organization_id"], "run": r.json()}


# ------------------------------------------------------------- tenant seeding --


def test_scenario_seeds_into_authenticated_tenant(client, demo_headers, seeded):
    """The whole point: a judge run must show up on the caller's own pages."""
    run = seeded["run"]
    assert run["seed"]["organization_id"] == seeded["organization_id"]
    # No token is minted or echoed when seeding into an existing tenant.
    assert run["seed"]["owner_api_token"] is None

    agents = client.get("/v1/agents", headers=seeded["auth"]).json()
    assert [a["agent_id"] for a in agents] == [run["seed"]["agent_id"]]


def test_scenario_without_auth_still_isolates(client, demo_headers):
    """Unauthenticated runs keep the original behaviour: a throwaway org."""
    a = client.post("/v1/demo/scenarios/happy-path", headers=demo_headers).json()
    b = client.post("/v1/demo/scenarios/overspend", headers=demo_headers).json()
    assert a["seed"]["organization_id"] != b["seed"]["organization_id"]
    assert a["seed"]["owner_api_token"]  # a fresh org does return its token


def test_scenario_rejects_bad_bearer(client, demo_headers):
    r = client.post(
        "/v1/demo/scenarios/happy-path",
        headers={**demo_headers, "Authorization": "Bearer not-a-real-token"},
    )
    assert r.status_code == 401


# -------------------------------------------------------------------- agents --


def test_list_agents_reports_real_history(client, seeded):
    agent = client.get("/v1/agents", headers=seeded["auth"]).json()[0]
    assert agent["name"] == "CatalogAgent-01"
    assert agent["status"] == "ACTIVE"
    assert agent["has_passport"] is True
    assert agent["tasks_total"] == 1
    assert agent["vault_count"] == 1
    # Vault closed after full repayment, so no exposure remains.
    assert agent["active_exposure_minor"] == 0
    assert 0 <= agent["trust_score"] <= 100
    assert agent["risk_tier"] in ("LOW", "MEDIUM", "HIGH")


def test_agent_profile_never_returns_credential_material(client, seeded):
    agent_id = seeded["run"]["seed"]["agent_id"]
    body = client.get(f"/v1/agents/{agent_id}/profile", headers=seeded["auth"])
    assert body.status_code == 200
    profile = body.json()

    passport = profile["passport"]
    assert passport["signature_verified"] is True
    assert passport["max_borrowing_authority_minor"] == 500_000
    # The signature and any private key material must never be serialized.
    raw = body.text
    for forbidden in ("signature_b64", "private_key", "api_token", "secret"):
        assert forbidden not in raw

    assert len(profile["tasks"]) == 1
    assert len(profile["credit_history"]) == 1
    assert profile["credit_history"][0]["approved_limit_minor"] == 100_000
    assert profile["spending_behaviour"]["executed_count"] == 2
    assert profile["spending_behaviour"]["blocked_count"] == 0


def test_agent_profile_is_tenant_scoped(client, seeded, demo_headers):
    other = client.post(
        "/v1/organizations", json={"name": "Other", "owner_email": "other@test.local"}
    ).json()
    other_auth = {"Authorization": f"Bearer {other['owner_api_token']}"}
    agent_id = seeded["run"]["seed"]["agent_id"]
    assert client.get(f"/v1/agents/{agent_id}/profile", headers=other_auth).status_code == 404
    assert client.get("/v1/agents", headers=other_auth).json() == []


# --------------------------------------------------------- credit decisioning --


def test_underwriting_detail_separates_advice_from_decision(client, seeded):
    app_id = seeded["run"]["steps"][0]["application_id"]
    detail = client.get(
        f"/v1/credit-applications/{app_id}/underwriting", headers=seeded["auth"]
    ).json()

    engine = detail["deterministic_engine"]
    assert engine["approved_limit_minor"] == 100_000
    assert engine["approved_limit_minor"] == min(engine["caps"].values())
    assert engine["receipt_hash"]
    assert engine["expected_loss_minor"] is not None

    # Whatever the model said, it never sets an amount.
    assert detail["verifier"]["model_influenced_amounts"] is False
    assert detail["verifier"]["verdict"] in (
        "NO_MODEL_ANALYSIS",
        "CLAIMS_TRACE_TO_EVIDENCE",
        "CONTRADICTIONS_FOUND",
    )

    # Every claim the verifier accepted must cite evidence that really exists.
    evidence_ids = {e["evidence_id"] for e in detail["evidence"]}
    assert evidence_ids
    for claim in detail["verifier"]["supported"]:
        assert set(claim["evidence_ids"]) <= evidence_ids

    assert detail["revenue_mandate"]["locked"] is True

    # Regression: an APPROVE carries no amount in the request — it means "the
    # full deterministic cap" — and the review row stored that absent
    # parameter, so the history read "Approve ₹0.00" against a ₹1,000 limit.
    review = detail["human_reviews"][0]
    assert review["action"] == "APPROVE"
    assert review["amount_minor"] == engine["approved_limit_minor"] == 100_000


def test_verifier_never_presents_analyst_flags_as_its_own(client, seeded):
    """Regression: the verifier payload carried the analyst's `risk_flags`
    under a bare `risk_flags` key, and the UI rendered that identical list a
    second time under the heading "Verifier flags" — the same opinion shown
    twice, reading as independent corroboration. The verifier checks claim ->
    evidence-ID citations; a flag cites nothing, so it has nothing to check.
    """
    app_id = seeded["run"]["steps"][0]["application_id"]
    detail = client.get(
        f"/v1/credit-applications/{app_id}/underwriting", headers=seeded["auth"]
    ).json()
    verifier = detail["verifier"]

    assert "risk_flags" not in verifier, "an unqualified key here implies a verifier finding"
    echoed = verifier["analyst_risk_flags_unverified"]
    # It is genuinely the analyst's list, not a recomputation.
    assert echoed == (detail["ai_recommendation"] or {}).get("risk_flags", [])


def test_underwriting_queue_buckets_by_state(client, seeded):
    queue = client.get("/v1/underwriting/queue", headers=seeded["auth"]).json()
    assert sum(queue["counts"].values()) == 1
    assert queue["counts"]["recently_completed"] == 1
    assert queue["counts"]["awaiting_human_review"] == 0


def test_human_review_cannot_exceed_deterministic_cap(client, seeded):
    """The review drawer offers Reduce, never Raise — enforced server-side."""
    app_id = seeded["run"]["steps"][0]["application_id"]
    r = client.post(
        f"/v1/credit-applications/{app_id}/review",
        json={"action": "REDUCE", "amount_minor": 999_999_999, "notes": "attempt to raise"},
        headers=seeded["auth"],
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "POLICY_DENIED"


def test_a_misnamed_amount_field_is_refused_not_ignored(client, demo_headers):
    """Regression: the web client sent the reviewer's typed limit as
    `approved_limit_minor`, which this endpoint does not declare. Pydantic
    ignored it, amount_minor defaulted to 0, and action=APPROVE granted the
    full engine cap — so a reviewer who typed a REDUCED limit granted the
    whole thing, and the UI showed a success message. On the one endpoint
    where a person moves an amount, an unknown field is an error.
    """
    org = client.post(
        "/v1/organizations", json={"name": "Review Co", "owner_email": "rev@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    run = client.post(
        "/v1/demo/scenarios/happy-path", headers={**demo_headers, **auth}
    ).json()
    app_id = run["steps"][0]["application_id"]

    r = client.post(
        f"/v1/credit-applications/{app_id}/review",
        json={"action": "APPROVE", "approved_limit_minor": 1, "notes": "typo'd field"},
        headers=auth,
    )
    assert r.status_code == 422, "an unknown field on a money write must not be defaulted past"


# -------------------------------------------------------------------- vaults --


def test_vault_detail_shows_the_spending_controls(client, seeded):
    vault_id = seeded["run"]["steps"][0]["vault_id"]
    detail = client.get(f"/v1/vaults/{vault_id}/detail", headers=seeded["auth"]).json()

    assert detail["status"] == "CLOSED"
    assert detail["total_limit_minor"] == 100_000
    assert detail["spent_minor"] == 100_000
    assert detail["per_transaction_limit_minor"] == 60_000
    assert detail["principal_outstanding_minor"] == 0

    # Regression: the column defaults to "" and was serialised verbatim, so a
    # never-frozen vault carried a reason-shaped empty string. Clients testing
    # for null rendered a chip for it — a DEFAULTED vault displayed "Defaulted"
    # beside a second badge reading "Unknown".
    assert detail["frozen_reason"] is None

    # The agent may only pay pre-approved vendors, for bound purposes.
    allow = {row["vendor_id"]: row for row in detail["allowlist"]}
    assert set(allow) == {"vendor_gcp_compute", "vendor_image_api"}
    assert all(row["purpose_codes"] for row in detail["allowlist"])

    executed = [t for t in detail["transactions"] if t["status"] == "EXECUTED"]
    assert len(executed) == 2
    assert all(t["journal_transaction_id"] for t in executed)
    assert sum(t["amount_minor"] for t in executed) == 100_000

    assert detail["revenue_events"][0]["amount_minor"] == 180_000
    assert detail["repayments"][0]["principal_minor"] == 100_000


def test_allowlisted_vendor_is_bound_to_its_purpose(client, demo_headers):
    """Being on the allowlist is not enough: the spend must also match the
    purpose the vendor was approved for."""
    org = client.post(
        "/v1/organizations", json={"name": "Purpose Co", "owner_email": "purpose@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    run = client.post("/v1/demo/scenarios/overspend", headers={**demo_headers, **auth}).json()
    vault_id = run["setup"]["vault_id"]

    ok = client.post(
        f"/v1/vaults/{vault_id}/transactions/propose",
        json={
            "vendor_id": "vendor_gcp_compute",
            "amount_minor": 10_000,
            "purpose_code": "COMPUTE",
            "idempotency_key": f"purpose-ok-{vault_id}",
        },
        headers=auth,
    ).json()
    assert ok["status"] == "APPROVED"

    wrong = client.post(
        f"/v1/vaults/{vault_id}/transactions/propose",
        json={
            "vendor_id": "vendor_gcp_compute",
            "amount_minor": 10_000,
            "purpose_code": "ENTERTAINMENT",
            "idempotency_key": f"purpose-bad-{vault_id}",
        },
        headers=auth,
    ).json()
    assert wrong["status"] == "DENIED"
    assert "PURPOSE_MISMATCH" in wrong["reason_codes"]


def test_policy_decisions_record_which_engine_refused(client, demo_headers):
    """A blocked spend must say whether the rules engine, the policy bundle,
    or both refused it — the merged reason codes alone cannot show that."""
    org = client.post(
        "/v1/organizations", json={"name": "Engine Co", "owner_email": "engine@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    client.post("/v1/demo/scenarios/overspend", headers={**demo_headers, **auth})

    blocked = client.get("/v1/transactions?status=DENIED", headers=auth).json()[0]
    detail = client.get(f"/v1/transactions/{blocked['proposal_id']}", headers=auth).json()

    engines = {p["engine"]: p for p in detail["policy_decisions"]}
    assert "vault-rules" in engines
    assert engines["vault-rules"]["allow"] is False
    assert "TRANSACTION_LIMIT_EXCEEDED" in engines["vault-rules"]["deny"]
    # The independent policy bundle is recorded separately, with its version.
    other = [p for p in detail["policy_decisions"] if p["engine"] != "vault-rules"]
    assert other and all(p["policy_version"] for p in other)


def test_the_recorded_policy_engine_is_the_one_that_actually_ran(client, demo_headers):
    """The second control is an in-process mirror of the Rego bundle, and the
    record must say so.

    An OPA sidecar is deployed beside the API in the GCP sandbox and the site
    used to say it authorised every spend. Nothing calls it: propose_transaction
    invokes evaluate_transaction_policy directly, so the decision that gets
    written carries engine="local". Pinning the recorded name here means a
    future claim that OPA enforced a spend has to change this test first.
    """
    org = client.post(
        "/v1/organizations", json={"name": "Engine Truth Co", "owner_email": "et@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    client.post("/v1/demo/scenarios/overspend", headers={**demo_headers, **auth})

    blocked = client.get("/v1/transactions?status=DENIED", headers=auth).json()[0]
    detail = client.get(f"/v1/transactions/{blocked['proposal_id']}", headers=auth).json()

    bundle = [p for p in detail["policy_decisions"] if p["engine"] != "vault-rules"]
    assert [p["engine"] for p in bundle] == ["local"]
    assert all(p["policy_version"] == "credence.credit/v1" for p in bundle)


def test_frozen_vault_surfaces_its_reason(client, demo_headers):
    org = client.post(
        "/v1/organizations", json={"name": "Split Co", "owner_email": "split@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    run = client.post(
        "/v1/demo/scenarios/split-payment", headers={**demo_headers, **auth}
    ).json()

    vaults = client.get("/v1/vaults", headers=auth).json()
    assert vaults[0]["status"] == "FROZEN"

    detail = client.get(f"/v1/vaults/{run['setup']['vault_id']}/detail", headers=auth).json()
    frozen = [e for e in detail["risk_events"] if e["event_type"] == "VAULT_FROZEN"]
    assert frozen and frozen[0]["severity"] == "HIGH"

    # The other half of the empty-string fix: when there IS a reason, it must
    # still arrive intact rather than being flattened away.
    assert detail["frozen_reason"] == "split-payment pattern detected"

    blocked = [t for t in detail["transactions"] if t["status"] == "DENIED"]
    assert any("SPLIT_PATTERN_DETECTED" in t["reason_codes"] for t in blocked)


# --------------------------------------------------------------- transactions --


def test_transaction_list_and_filters(client, demo_headers):
    org = client.post(
        "/v1/organizations", json={"name": "Txn Co", "owner_email": "txn@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    client.post("/v1/demo/scenarios/happy-path", headers={**demo_headers, **auth})
    client.post("/v1/demo/scenarios/overspend", headers={**demo_headers, **auth})

    rows = client.get("/v1/transactions", headers=auth).json()
    assert len(rows) == 3  # two executed, one blocked

    blocked = client.get("/v1/transactions?status=DENIED", headers=auth).json()
    assert len(blocked) == 1
    assert blocked[0]["amount_minor"] == 200_000
    assert blocked[0]["policy_result"] == "DENY"
    assert "TRANSACTION_LIMIT_EXCEEDED" in blocked[0]["reason_codes"]
    # Nothing was posted to the ledger for a blocked attempt.
    assert blocked[0]["journal_transaction_id"] is None

    detail = client.get(f"/v1/transactions/{blocked[0]['proposal_id']}", headers=auth).json()
    assert detail["idempotency_key_present"] is True
    assert detail["policy_decisions"]
    assert any(p["allow"] is False for p in detail["policy_decisions"])


# ---------------------------------------------------------------- repayments --


def test_repayment_waterfall_is_reported_in_order(client, seeded):
    rows = client.get("/v1/repayments", headers=seeded["auth"]).json()
    assert len(rows) == 1
    row = rows[0]
    assert row["kind"] == "WATERFALL"
    assert row["status"] == "SETTLED"
    assert row["revenue_minor"] == 180_000
    assert [a["step"] for a in row["allocations"]] == [
        "REPAY_PRINCIPAL",
        "PAY_FEE",
        "RELEASE_TO_OWNER",
    ]
    # Conservation: revenue in equals everything allocated out.
    assert row["revenue_minor"] == sum(a["amount_minor"] for a in row["allocations"])
    assert row["principal_minor"] == 100_000
    assert row["fee_minor"] == 5_000
    assert row["owner_minor"] == 75_000


def test_recovery_waterfall_bounds_the_loss(client, demo_headers):
    org = client.post(
        "/v1/organizations", json={"name": "Fail Co", "owner_email": "fail@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    client.post("/v1/demo/scenarios/task-failure", headers={**demo_headers, **auth})

    row = client.get("/v1/repayments", headers=auth).json()[0]
    assert row["kind"] == "RECOVERY"
    assert row["loss_minor"] > 0
    assert row["vault_status"] == "DEFAULTED"

    summary = client.get("/v1/dashboard/summary", headers=auth).json()
    assert summary["credit"]["loss_minor"] == row["loss_minor"]
    assert summary["vaults"]["defaulted"] == 1


# ----------------------------------------------------------------- dashboard --


def test_dashboard_summary_matches_the_underlying_records(client, seeded):
    s = client.get("/v1/dashboard/summary", headers=seeded["auth"]).json()

    assert s["agents"] == {"total": 1, "active": 1, "frozen": 0, "revoked": 0}
    assert s["credit"]["approved_minor"] == 100_000
    assert s["credit"]["utilized_minor"] == 100_000
    assert s["credit"]["repaid_minor"] == 100_000
    assert s["credit"]["outstanding_minor"] == 0
    assert s["credit"]["fees_minor"] == 5_000
    assert s["transactions"] == {
        "proposed": 2,
        "executed": 2,
        "blocked": 0,
        "executed_value_minor": 100_000,
        "blocked_value_minor": 0,
    }
    assert s["repayments"]["repayment_rate_ppm"] == 1_000_000  # 1 of 1 settled
    assert s["integrity"]["ledger_balanced"] is True
    assert s["integrity"]["audit_chain_intact"] is True


def test_dashboard_counts_a_funded_application_as_approved(client, seeded):
    """Regression: the dashboard reported `approved: 0, in_flight: 1` for a
    funded book while simultaneously showing its approved limit in rupees.

    APPROVED is transient — funding advances the application straight through
    VAULT_CREATED to DISBURSEMENT_ENABLED — so matching the literal string put
    every settled approval in the in-flight bucket.
    """
    app_status = client.get("/v1/credit-applications", headers=seeded["auth"]).json()[0]
    assert app_status["status"] == "DISBURSEMENT_ENABLED"  # not the literal "APPROVED"

    apps = client.get("/v1/dashboard/summary", headers=seeded["auth"]).json()["applications"]
    assert apps["approved"] == 1
    assert apps["in_flight"] == 0
    assert apps["approved"] + apps["human_review"] + apps["rejected"] + apps["in_flight"] == (
        apps["total"]
    )
    assert apps["approved_limit_minor"] > 0


def test_dashboard_distinguishes_empty_from_zero(client):
    """A fresh tenant has no finished vaults, so the rate is undefined, not 0%."""
    org = client.post(
        "/v1/organizations", json={"name": "Fresh", "owner_email": "fresh@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}

    s = client.get("/v1/dashboard/summary", headers=auth).json()
    assert s["repayments"]["repayment_rate_ppm"] is None
    assert s["credit"]["approved_minor"] == 0
    assert client.get("/v1/agents", headers=auth).json() == []
    assert client.get("/v1/dashboard/exposure-series", headers=auth).json() == []


def test_dashboard_activity_is_human_readable(client, seeded):
    rows = client.get("/v1/dashboard/activity?limit=50", headers=seeded["auth"]).json()
    assert rows
    by_type = {r["event_type"]: r for r in rows}
    assert by_type["VAULT_CREATED"]["label"] == "Credit vault created"
    assert by_type["REPAYMENT_WATERFALL"]["label"] == "Repayment waterfall executed"
    # Newest first, and the canonical code always travels with the label.
    assert [r["seq"] for r in rows] == sorted((r["seq"] for r in rows), reverse=True)
    assert all(r["event_type"] and r["label"] for r in rows)


def test_exposure_series_is_continuous_and_not_interpolated(client, seeded):
    series = client.get("/v1/dashboard/exposure-series?days=7", headers=seeded["auth"]).json()
    assert len(series) == 7
    assert [s["date"] for s in series] == sorted(s["date"] for s in series)
    # Today carries the whole run; earlier days are genuinely empty.
    assert series[-1]["approved_minor"] == 100_000
    assert all(s["approved_minor"] == 0 for s in series[:-1])


# ---------------------------------------------------------------------- risk --


def test_risk_summary_counts_prevented_spend(client, demo_headers):
    org = client.post(
        "/v1/organizations", json={"name": "Risk Co", "owner_email": "risk@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    client.post("/v1/demo/scenarios/overspend", headers={**demo_headers, **auth})
    client.post("/v1/demo/scenarios/unapproved-vendor", headers={**demo_headers, **auth})

    s = client.get("/v1/risk/summary", headers=auth).json()
    assert s["blocked_transactions"] == 2
    assert s["blocked_value_minor"] == 230_000  # ₹2,000 + ₹300
    assert s["active_monitoring_rules"] > 0
    assert dict(
        (e["event_type"], e["count"]) for e in s["events_by_type"]
    )["SPEND_BLOCKED"] == 2


# ------------------------------------------------------------------- policy --


def test_policy_parameters_come_from_the_enforcing_modules(client, seeded):
    from credence.underwriting import decision as dec
    from credence.vault.rules import VaultLimits

    p = client.get("/v1/policy/parameters", headers=seeded["auth"]).json()
    assert p["credit_policy"]["advance_rate_ppm"] == dec.ADVANCE_RATE_PPM
    assert p["credit_policy"]["fee_rate_ppm"] == dec.FEE_RATE_PPM
    assert p["credit_policy"]["decision_version"] == dec.DECISION_VERSION

    defaults = VaultLimits(
        vault_id="",
        status="",
        agent_status="",
        currency="INR",
        total_limit_minor=0,
        spent_minor=0,
        per_transaction_limit_minor=0,
        daily_limit_minor=0,
        spent_today_minor=0,
        allowed_vendor_ids=frozenset(),
    )
    assert p["risk_policy"]["velocity_max_transactions"] == defaults.velocity_max_transactions
    assert p["risk_policy"]["velocity_window_seconds"] == int(
        defaults.velocity_window.total_seconds()
    )
    assert p["environment"]["test_credits_only"] is True


# --------------------------------------------------------------------- auth --


@pytest.mark.parametrize(
    "path",
    [
        "/v1/dashboard/summary",
        "/v1/dashboard/activity",
        "/v1/agents",
        "/v1/credit-applications",
        "/v1/underwriting/queue",
        "/v1/vaults",
        "/v1/transactions",
        "/v1/repayments",
        "/v1/risk/summary",
        "/v1/vendors",
        "/v1/policy/parameters",
        "/v1/me",
    ],
)
def test_every_read_endpoint_requires_auth(client, path):
    assert client.get(path).status_code == 401


def test_me_is_not_shadowed_by_the_organization_id_route(client, seeded):
    """/v1/organizations/{organization_id} is registered before the read router,
    so a literal segment under that collection would be swallowed as an id and
    404. This pins the endpoint at a path where that cannot happen."""
    body = client.get("/v1/me", headers=seeded["auth"]).json()
    assert body["organization_id"] == seeded["organization_id"]
    assert body["user"]["role"] == "OWNER"

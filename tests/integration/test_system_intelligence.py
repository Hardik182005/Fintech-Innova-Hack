"""GET /v1/system-intelligence — the contract in docs/system-intelligence-
contract.md, checked against records the scenarios actually produce.

The envelope discipline is the point of these tests: a figure that exists is
asserted at its exact recorded value, and a figure the platform does not
record yet must be null with a truthful non-ok status — never a zero.
"""

import pytest

WINDOWS = ("1h", "24h", "7d", "30d")

STAGE_ORDER = [
    "REQUEST_RECEIVED",
    "SCHEMA_VALIDATION",
    "PASSPORT_VERIFICATION",
    "EVIDENCE_RETRIEVAL",
    "TASK_ANALYST",
    "FEATURE_CALCULATION",
    "UNDERWRITING_ANALYST",
    "CREDIT_RISK_MODEL",
    "INDEPENDENT_RISK_CRITIC",
    "POLICY_ENGINE",
    "HUMAN_REVIEW",
    "VAULT_CREATION",
    "SPEND_MONITORING",
    "REVENUE_COLLECTION",
    "REPAYMENT_WATERFALL",
    "AUDIT_FINALIZATION",
]

TOP_LEVEL_SECTIONS = {
    "generated_at",
    "window",
    "assurance",
    "summary",
    "pipeline",
    "ai_quality",
    "models",
    "credit_engine",
    "financial_safety",
    "repayment",
    "service_health",
    "fail_closed_events",
    "infrastructure",
}


@pytest.fixture
def seeded(client, demo_headers):
    """A tenant with its own bearer token, seeded by the happy-path scenario."""
    org = client.post(
        "/v1/organizations",
        json={"name": "Intelligence Test Org", "owner_email": "intelligence@test.local"},
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    r = client.post("/v1/demo/scenarios/happy-path", headers={**demo_headers, **auth})
    assert r.status_code == 200, r.text
    return {"auth": auth, "organization_id": org["organization_id"], "run": r.json()}


def _get(client, auth, window="24h"):
    r = client.get(f"/v1/system-intelligence?window={window}", headers=auth)
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------------------- auth --


def test_requires_auth(client):
    assert client.get("/v1/system-intelligence").status_code == 401


# -------------------------------------------------------------------- window --


def test_rejects_invalid_window(client, seeded):
    r = client.get("/v1/system-intelligence?window=2h", headers=seeded["auth"])
    assert r.status_code == 400


def test_accepts_every_documented_window(client, seeded):
    for window in WINDOWS:
        body = _get(client, seeded["auth"], window)
        assert body["window"] == window


# --------------------------------------------------------------------- shape --


def test_response_has_all_sections(client, seeded):
    body = _get(client, seeded["auth"])
    assert TOP_LEVEL_SECTIONS <= set(body)
    assert body["infrastructure"] == {
        "billing_connected": False,
        "note": "Billing data not connected",
    }


# ----------------------------------------------------------------- repayment --


def test_happy_path_repayment_invariant_is_checked_for_real(client, seeded):
    body = _get(client, seeded["auth"])
    rep = body["repayment"]
    assert rep["waterfall_runs"]["value"] == 1
    assert rep["invariant_checked"]["value"] == 1
    assert rep["invariant_passed"] == {
        "value": 1,
        "unit": "count",
        "sample_size": 1,
        "status": "ok",
    }
    assert rep["ledger_balanced"] is True
    assert rep["audit_chain_intact"] is True

    component = body["assurance"]["components"]["repayment_invariant_pass_rate"]
    assert component == {"value": 1_000_000, "unit": "ppm", "sample_size": 1, "status": "ok"}


# --------------------------------------------------------- envelope discipline --


def test_missing_telemetry_is_null_not_zero(client, seeded):
    body = _get(client, seeded["auth"])

    # Evaluation-suite components have no EvaluationResult rows: not zero.
    for name in (
        "identity_verification_accuracy",
        "underwriting_decision_agreement",
        "evidence_grounding_rate",
        "hallucination_containment_rate",
    ):
        env = body["assurance"]["components"][name]
        assert env["value"] is None
        assert env["status"] == "not_evaluated"

    # The composite score exists only when all six components are ok.
    assert body["assurance"]["score"]["value"] is None
    assert body["assurance"]["score"]["status"] == "not_evaluated"
    assert body["assurance"]["last_evaluation_run_at"] is None

    # Stage telemetry records failures as well as successes, so this zero is
    # measured over a real sample — the one kind of zero the contract allows.
    true_errors = body["summary"]["true_errors"]
    assert true_errors["value"] == 0
    assert true_errors["status"] == "ok"
    assert true_errors["sample_size"] > 0
    # Nothing failed, and a controlled rejection is not a failure.
    assert body["summary"]["pipeline_success_rate"]["value"] == 1_000_000
    assert body["summary"]["pipeline_success_rate"]["status"] == "ok"
    assert body["ai_quality"]["verifier_disagreement_rate"]["status"] == "not_connected"
    assert body["ai_quality"]["model_fallback_rate"]["status"] == "not_connected"

    # Instrumented stages report measured durations; a duration may legitimately
    # be 0 ms, so what is asserted is that it is measured, not that it is big.
    request_stage = body["pipeline"][0]
    assert request_stage["stage"] == "REQUEST_RECEIVED"
    assert request_stage["processed"]["value"] == 1
    assert request_stage["p50_ms"]["status"] == "ok"
    assert request_stage["p50_ms"]["value"] >= 0
    assert request_stage["p95_ms"]["value"] >= request_stage["p50_ms"]["value"]


    # Happy path has no adversarial attempts: undefined, not a fake 100%.
    adversarial = body["assurance"]["components"]["adversarial_policy_block_rate"]
    assert adversarial["value"] is None
    assert adversarial["status"] == "insufficient_sample"

    # The fixture gateway produced three schema-valid runs — analyst,
    # underwriter, critic — so the rate is real and complete.
    assert body["ai_quality"]["structured_output_validity"] == {
        "value": 1_000_000,
        "unit": "ppm",
        "sample_size": 3,
        "status": "ok",
    }


# --------------------------------------------------------------- adversarial --


def test_adversarial_block_rate_reflects_blocked_scenarios(client, demo_headers):
    org = client.post(
        "/v1/organizations",
        json={"name": "Adversarial Co", "owner_email": "adversarial@test.local"},
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}
    client.post("/v1/demo/scenarios/overspend", headers={**demo_headers, **auth})
    client.post("/v1/demo/scenarios/unapproved-vendor", headers={**demo_headers, **auth})

    body = _get(client, auth)
    assert body["assurance"]["components"]["adversarial_policy_block_rate"] == {
        "value": 1_000_000,
        "unit": "ppm",
        "sample_size": 2,
        "status": "ok",
    }
    assert body["summary"]["blocked_attempts"]["value"] == 2
    # ₹2,000 overspend + ₹300 unapproved vendor, both stopped before money moved.
    assert body["summary"]["prevented_exposure_minor"]["value"] == 230_000

    codes = {row["code"] for row in body["financial_safety"]["policy_denials_by_code"]}
    assert "TRANSACTION_LIMIT_EXCEEDED" in codes
    assert "VENDOR_NOT_ALLOWED" in codes
    assert body["fail_closed_events"]
    assert any(e["action"] == "SPEND_BLOCKED" for e in body["fail_closed_events"])


# ------------------------------------------------------------------ pipeline --


def test_pipeline_keeps_all_sixteen_stages_in_fixed_order(client, seeded):
    body = _get(client, seeded["auth"])
    assert [s["stage"] for s in body["pipeline"]] == STAGE_ORDER

    by_stage = {s["stage"]: s for s in body["pipeline"]}
    # The happy path drives every stage, so instrumentation covering all
    # sixteen is exactly what this asserts: any stage left uninstrumented
    # shows up here as unavailable.
    for code in STAGE_ORDER:
        stage = by_stage[code]
        assert stage["status"] != "unavailable", f"{code} recorded no telemetry"
        assert stage["p50_ms"]["status"] == "ok", f"{code} recorded no duration"
        assert stage["last_completed_at"] is not None

    # The two advisory reasoning roles run alongside the analyst, once each.
    for advisory in ("UNDERWRITING_ANALYST", "INDEPENDENT_RISK_CRITIC"):
        assert by_stage[advisory]["processed"]["value"] == 1
        assert by_stage[advisory]["true_errors"]["value"] == 0

    # Stages the happy path exercised carry the recorded counts.
    assert by_stage["TASK_ANALYST"]["processed"]["value"] == 1
    assert by_stage["TASK_ANALYST"]["true_errors"]["value"] == 0
    assert by_stage["SPEND_MONITORING"]["processed"]["value"] == 2
    assert by_stage["SPEND_MONITORING"]["controlled_rejections"]["value"] == 0
    assert by_stage["REPAYMENT_WATERFALL"]["succeeded"]["value"] == 1
    assert by_stage["AUDIT_FINALIZATION"]["status"] == "healthy"


def test_untouched_tenant_reports_every_stage_as_absent_not_zero(client):
    """A workspace that has done nothing must not look like a workspace that
    did everything perfectly. Every stage keeps its slot and reports null."""
    org = client.post(
        "/v1/organizations",
        json={"name": "Idle Co", "owner_email": "idle@test.local"},
    ).json()
    body = _get(client, {"Authorization": f"Bearer {org['owner_api_token']}"})

    assert [s["stage"] for s in body["pipeline"]] == STAGE_ORDER
    for stage in body["pipeline"]:
        # Creating the tenant is itself an audited event, so the audit stage
        # has genuinely done work; every other stage has not.
        if stage["stage"] == "AUDIT_FINALIZATION":
            continue
        assert stage["status"] == "unavailable", stage["stage"]
        assert stage["last_completed_at"] is None
        for metric in ("processed", "succeeded", "controlled_rejections", "true_errors"):
            assert stage[metric]["value"] is None, f"{stage['stage']}.{metric} claimed a value"
            assert stage[metric]["status"] == "not_connected"
        for metric in ("p50_ms", "p95_ms"):
            assert stage[metric]["value"] is None
            assert stage[metric]["status"] == "not_connected"

    assert body["summary"]["true_errors"]["value"] is None
    assert body["summary"]["pipeline_success_rate"]["value"] is None


# ------------------------------------------------------------- service health --


def test_service_health_has_four_probed_components(client, seeded):
    body = _get(client, seeded["auth"])
    by_component = {row["component"]: row for row in body["service_health"]}
    assert set(by_component) == {"api", "database", "opa", "model_runtime"}
    for row in by_component.values():
        assert row["status"] in ("healthy", "degraded", "down", "not_connected")
        assert row["checked_at"]
    # The API is answering and the database served this very request.
    assert by_component["api"]["status"] == "healthy"
    assert by_component["database"]["status"] == "healthy"
    # OPA status comes from a live probe; without a listener it must not
    # claim health.
    assert by_component["opa"]["status"] in ("healthy", "degraded", "down")


# ----------------------------------------------------------- engine + summary --


def test_credit_engine_and_summary_match_the_seeded_run(client, seeded):
    body = _get(client, seeded["auth"])

    # First credit for a fresh agent goes to human review by design; the
    # audit payload preserves the engine's own verdict after the override.
    engine = body["credit_engine"]
    assert engine["decision_version"] == "decision-v1"
    assert engine["scorecard_version"] == "scorecard-v1"
    assert engine["decisions"]["value"] == 1
    assert engine["auto_approved"]["value"] == 0
    assert engine["auto_rejected"]["value"] == 0
    assert engine["referred_to_human"]["value"] == 1

    summary = body["summary"]
    assert summary["requests_processed"]["value"] == 1
    assert summary["approvals"]["value"] == 1
    assert summary["controlled_rejections"]["value"] == 0
    # The seeded application was referred to a human AND then approved by the
    # owner, so nothing is still awaiting review. It used to report 1 here —
    # counting the same application under both approvals and human_reviews.
    assert summary["human_reviews"]["value"] == 0
    # Regression: the three outcomes partition the total. Live, six referred
    # and owner-approved applications displayed as "6 approved · 0 controlled
    # rejections · 6 human review", i.e. twelve outcomes from six requests.
    assert (
        summary["approvals"]["value"]
        + summary["controlled_rejections"]["value"]
        + summary["human_reviews"]["value"]
        == summary["requests_processed"]["value"]
    )

    assert body["models"]["provider"] == "fixture"
    # Verified from config: only local gateways exist, so zero is structural.
    assert body["models"]["external_llm_api_calls"] == {
        "value": 0,
        "unit": "count",
        "sample_size": None,
        "status": "ok",
    }


# ----------------------------------------------------------------- isolation --


def test_fresh_tenant_reports_empty_counts_and_undefined_rates(client, seeded):
    org = client.post(
        "/v1/organizations", json={"name": "Fresh Intel", "owner_email": "fresh-intel@test.local"}
    ).json()
    auth = {"Authorization": f"Bearer {org['owner_api_token']}"}

    body = _get(client, auth)
    # Counting over real (empty) records is an honest zero…
    assert body["summary"]["requests_processed"]["value"] == 0
    assert body["summary"]["blocked_attempts"]["value"] == 0
    # …but every rate without a denominator is undefined, never 0 or 100%.
    for name, env in body["assurance"]["components"].items():
        assert env["value"] is None, name
        assert env["status"] in ("not_evaluated", "insufficient_sample"), name
    assert body["ai_quality"]["structured_output_validity"]["status"] == "insufficient_sample"
    # The seeded tenant's records never bleed into this one. The only audit
    # event a fresh org owns is its own ORGANIZATION_CREATED, so every stage
    # except audit finalization is honestly unavailable.
    assert body["repayment"]["waterfall_runs"]["value"] == 0
    for stage in body["pipeline"]:
        if stage["stage"] == "AUDIT_FINALIZATION":
            assert stage["processed"]["value"] == 1
        else:
            assert stage["status"] == "unavailable", stage["stage"]

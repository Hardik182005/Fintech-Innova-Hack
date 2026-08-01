"""Narration composition: outcome and amounts in, identifiers never out.

`compose_decision_narration` is the single source of every character sent to
the voice provider, so these tests are the redaction boundary in miniature:
whatever they pin here is the most that can ever leave for ElevenLabs.
"""

from credence.api.voice import CLOSING_LINE, MAX_SPOKEN_REASONS, compose_decision_narration


def test_approved_narration_speaks_outcome_amount_and_closing_line():
    text = compose_decision_narration(
        decision="APPROVED",
        approved_limit_minor=100_000,  # ₹1,000 in paise
        currency="INR",
        reason_codes=["FIRST_CREDIT_FOR_AGENT"],
    )
    assert "This credit application was approved." in text
    assert "1,000 rupees" in text
    assert "test credits" in text
    assert "this is the agent's first credit" in text
    assert text.endswith(CLOSING_LINE)


def test_rejected_narration_has_no_amount():
    text = compose_decision_narration(
        decision="REJECTED",
        approved_limit_minor=0,
        currency="INR",
        reason_codes=["NO_LENDABLE_AMOUNT"],
    )
    assert "rejected" in text
    assert "rupees" not in text
    assert "no lendable amount" in text
    assert text.endswith(CLOSING_LINE)


def test_review_narration_marks_limit_as_pending():
    text = compose_decision_narration(
        decision="HUMAN_REVIEW_REQUIRED",
        approved_limit_minor=250_050,
        currency="INR",
        reason_codes=["PD_ABOVE_AUTO_APPROVE_THRESHOLD"],
    )
    assert "referred to a human reviewer" in text
    assert "2,500 rupees and 50 paise" in text
    assert "pending human approval" in text


def test_narration_contains_no_identifiers_from_linked_records():
    """The decision this narrates belongs to an application whose linked
    records carry an owner email, an agent id, and a receipt hash. None of
    them can appear: the composer's signature cannot accept them, and this
    pins that the output stays clean of anything shaped like them."""
    linked_owner_email = "owner+9f3c2b1a@demo.credence.local"
    linked_agent_id = "agt_9f3c2b1ad4e5f607a8b9c0d1e2f30415"
    linked_application_id = "app_5d6e7f8a9b0c1d2e3f405162738495a6"
    linked_receipt_hash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    text = compose_decision_narration(
        decision="APPROVED",
        approved_limit_minor=100_000,
        currency="INR",
        reason_codes=["FIRST_CREDIT_FOR_AGENT", "PD_ABOVE_AUTO_APPROVE_THRESHOLD"],
    )
    for forbidden in (
        linked_owner_email,
        linked_agent_id,
        linked_application_id,
        linked_receipt_hash,
        "@",  # no email of any form
        "agt_",  # no id prefixes of any form
        "app_",
        "sha256",
    ):
        assert forbidden not in text
    # Raw machine codes are translated, never spoken verbatim.
    assert "FIRST_CREDIT_FOR_AGENT" not in text


def test_reason_codes_are_capped_and_unknown_codes_degrade_to_words():
    codes = ["UNKNOWN_FUTURE_CODE", "ANOTHER_ONE", "THIRD_CODE", "FOURTH_NEVER_SPOKEN"]
    text = compose_decision_narration(
        decision="APPROVED",
        approved_limit_minor=50_000,
        currency="INR",
        reason_codes=codes,
    )
    assert "unknown future code" in text
    assert len(codes) > MAX_SPOKEN_REASONS
    assert "fourth never spoken" not in text
    assert "_" not in text

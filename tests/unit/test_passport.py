from datetime import UTC, datetime, timedelta

import pytest

from credence.errors import ReasonCode
from credence.passport import LocalDevSigner, PassportService
from credence.passport.service import InMemoryNonceStore, InMemoryRevocationStore


@pytest.fixture
def service() -> PassportService:
    return PassportService(
        signer=LocalDevSigner(issuer="credence-sandbox"),
        revocations=InMemoryRevocationStore(),
        expected_audience="credence-api",
    )


def issue(service: PassportService, **overrides):
    kwargs = dict(
        agent_id="agt_123",
        organization_id="org_1",
        owner_user_id="usr_1",
        model_provider="qwen",
        model_name="Qwen3-14B",
        model_version_hash="abc123",
        purpose="catalog enrichment",
        permitted_task_categories=["COMPUTE", "IMAGE"],
        max_borrowing_authority_minor=100000,
        max_transaction_value_minor=60000,
        ttl=timedelta(hours=1),
    )
    kwargs.update(overrides)
    return service.issue(**kwargs)


def test_valid_passport_verifies(service):
    passport = issue(service)
    result = service.verify(passport)
    assert result.valid
    assert result.reasons == []


def test_tampered_payload_rejected(service):
    passport = issue(service)
    tampered = passport.model_copy(deep=True)
    tampered.payload.max_borrowing_authority_minor = 10_000_000
    result = service.verify(tampered)
    assert not result.valid
    assert ReasonCode.AGENT_IDENTITY_INVALID in result.reasons


def test_forged_key_rejected(service):
    """Attacker signs with their own key and embeds their own PEM."""
    attacker = PassportService(
        signer=LocalDevSigner(issuer="credence-sandbox"),
        revocations=InMemoryRevocationStore(),
    )
    forged = issue(attacker, max_borrowing_authority_minor=10_000_000)
    result = service.verify(forged)
    assert not result.valid
    assert ReasonCode.AGENT_IDENTITY_INVALID in result.reasons


def test_expired_passport_rejected(service):
    passport = issue(service)
    later = datetime.now(UTC) + timedelta(hours=2)
    result = service.verify(passport, now=later)
    assert not result.valid
    assert ReasonCode.AUTHORIZATION_EXPIRED in result.reasons


def test_not_yet_valid_rejected(service):
    future = datetime.now(UTC) + timedelta(hours=1)
    passport = issue(service, now=future)
    result = service.verify(passport)
    assert not result.valid
    assert ReasonCode.PASSPORT_NOT_YET_VALID in result.reasons


def test_revoked_passport_rejected(service):
    passport = issue(service)
    service.revoke("agt_123", reason="owner kill switch")
    result = service.verify(passport)
    assert not result.valid
    assert ReasonCode.PASSPORT_REVOKED in result.reasons


def test_revocation_is_immediate_for_all_passports(service):
    p1 = issue(service)
    p2 = issue(service)
    assert service.verify(p1).valid and service.verify(p2).valid
    service.revoke("agt_123", reason="compromise suspected")
    assert not service.verify(p1).valid
    assert not service.verify(p2).valid


def test_wrong_audience_rejected(service):
    other = PassportService(
        signer=service._signer,  # same trusted key, different audience
        revocations=InMemoryRevocationStore(),
        expected_audience="another-service",
    )
    passport = issue(service)
    result = other.verify(passport)
    assert not result.valid
    assert ReasonCode.AUDIENCE_MISMATCH in result.reasons


def test_missing_scope_rejected(service):
    passport = issue(service, permitted_task_categories=["COMPUTE"])
    result = service.verify(passport, required_scope="TRADING")
    assert not result.valid
    assert ReasonCode.SCOPE_MISSING in result.reasons


def test_request_nonce_replay_rejected(service):
    passport = issue(service)
    nonces = InMemoryNonceStore()
    first = service.verify(passport, request_nonce_store=nonces, request_nonce="n-1")
    assert first.valid
    replay = service.verify(passport, request_nonce_store=nonces, request_nonce="n-1")
    assert not replay.valid
    assert ReasonCode.NONCE_REPLAYED in replay.reasons


def test_missing_request_nonce_rejected(service):
    passport = issue(service)
    result = service.verify(passport, request_nonce_store=InMemoryNonceStore(), request_nonce="")
    assert not result.valid
    assert ReasonCode.NONCE_REPLAYED in result.reasons


def test_ttl_above_maximum_rejected(service):
    with pytest.raises(ValueError):
        issue(service, ttl=timedelta(days=30))

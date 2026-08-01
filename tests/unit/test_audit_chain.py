import pytest
from sqlalchemy import text

from credence.audit import append_audit_event, verify_chain
from credence.immutability import ImmutableRecordError
from credence.models import AuditEvent


def add_events(session, n=5):
    for i in range(n):
        append_audit_event(
            session,
            actor_type="SYSTEM",
            actor_id="test",
            event_type=f"EVENT_{i}",
            payload={"i": i, "detail": f"event number {i}"},
            organization_id="org_1",
        )
    session.commit()


def test_empty_chain_is_intact(session):
    assert verify_chain(session) == (True, None)


def test_chain_links_and_verifies(session):
    add_events(session)
    intact, broken = verify_chain(session)
    assert intact and broken is None
    events = session.query(AuditEvent).order_by(AuditEvent.seq).all()
    for prev, cur in zip(events, events[1:]):
        assert cur.prev_hash == prev.event_hash


def test_orm_mutation_rejected(session):
    add_events(session, 2)
    event = session.query(AuditEvent).first()
    event.payload_json = '{"i": 999}'
    with pytest.raises(ImmutableRecordError):
        session.flush()
    session.rollback()


def test_raw_sql_tampering_detected(session):
    """Even bypassing the ORM, tampering breaks hash verification."""
    add_events(session, 4)
    session.execute(
        text("UPDATE audit_events SET payload_json = :p WHERE seq = 2"),
        {"p": '{"i": 1, "detail": "FORGED"}'},
    )
    session.commit()
    intact, broken = verify_chain(session)
    assert not intact
    assert broken == 2


def test_deletion_detected(session):
    add_events(session, 4)
    session.execute(text("DELETE FROM audit_events WHERE seq = 2"))
    session.commit()
    intact, broken = verify_chain(session)
    assert not intact
    assert broken == 3  # successor no longer links to seq 1

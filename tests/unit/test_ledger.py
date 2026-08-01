import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from credence.errors import ReasonCode
from credence.immutability import ImmutableRecordError
from credence.ledger import EntrySpec, LedgerError, account_balance, post_journal, reconcile
from credence.models import AccountType, EntryDirection, JournalEntry, LedgerAccount


@pytest.fixture
def accounts(session):
    specs = [
        ("liquidity", "LENDER_LIQUIDITY", "Lender liquidity", AccountType.ASSET),
        ("vault", "VAULT_AVAILABLE", "Task vault available", AccountType.LIABILITY),
        ("receivable", "PRINCIPAL_RECEIVABLE", "Principal receivable", AccountType.ASSET),
        ("escrow", "REVENUE_ESCROW", "Task revenue escrow", AccountType.LIABILITY),
    ]
    accs = {
        key: LedgerAccount(code=code, name=name, type=acc_type)
        for key, code, name, acc_type in specs
    }
    session.add_all(accs.values())
    session.flush()
    return {k: a.id for k, a in accs.items()}


def disburse(session, accounts, key="disb-1", amount=100000):
    return post_journal(
        session,
        idempotency_key=key,
        event_type="DISBURSEMENT",
        entries=[
            EntrySpec(accounts["receivable"], EntryDirection.DEBIT, amount),
            EntrySpec(accounts["vault"], EntryDirection.CREDIT, amount),
        ],
    )


def test_balanced_posting_succeeds(session, accounts):
    txn = disburse(session, accounts)
    assert len(txn.entries) == 2
    assert account_balance(session, accounts["receivable"]) == 100000
    assert account_balance(session, accounts["vault"]) == 100000  # credit-natural
    assert reconcile(session) == {}


def test_unbalanced_posting_rejected(session, accounts):
    with pytest.raises(LedgerError) as e:
        post_journal(
            session,
            idempotency_key="bad-1",
            event_type="DISBURSEMENT",
            entries=[
                EntrySpec(accounts["receivable"], EntryDirection.DEBIT, 100000),
                EntrySpec(accounts["vault"], EntryDirection.CREDIT, 99999),
            ],
        )
    assert e.value.code == ReasonCode.LEDGER_IMBALANCE


def test_single_entry_rejected(session, accounts):
    with pytest.raises(LedgerError):
        post_journal(
            session,
            idempotency_key="bad-2",
            event_type="X",
            entries=[EntrySpec(accounts["receivable"], EntryDirection.DEBIT, 5)],
        )


def test_zero_and_negative_amounts_rejected(session, accounts):
    for amount in (0, -100):
        with pytest.raises(Exception):
            post_journal(
                session,
                idempotency_key=f"bad-amt-{amount}",
                event_type="X",
                entries=[
                    EntrySpec(accounts["receivable"], EntryDirection.DEBIT, amount),
                    EntrySpec(accounts["vault"], EntryDirection.CREDIT, amount),
                ],
            )


def test_missing_idempotency_key_rejected(session, accounts):
    with pytest.raises(LedgerError) as e:
        post_journal(session, idempotency_key="", event_type="X", entries=[])
    assert e.value.code == ReasonCode.IDEMPOTENCY_KEY_REQUIRED


def test_duplicate_idempotency_key_is_noop(session, accounts):
    t1 = disburse(session, accounts, key="dup-1")
    t2 = disburse(session, accounts, key="dup-1", amount=999999)  # retry with junk amount
    assert t1.id == t2.id
    assert account_balance(session, accounts["receivable"]) == 100000  # unchanged
    assert reconcile(session) == {}


def test_unknown_account_rejected(session, accounts):
    with pytest.raises(LedgerError):
        post_journal(
            session,
            idempotency_key="bad-acc",
            event_type="X",
            entries=[
                EntrySpec("acc_nonexistent", EntryDirection.DEBIT, 100),
                EntrySpec(accounts["vault"], EntryDirection.CREDIT, 100),
            ],
        )


def test_mixed_currency_must_balance_per_currency(session, accounts):
    with pytest.raises(LedgerError):
        post_journal(
            session,
            idempotency_key="ccy-1",
            event_type="X",
            entries=[
                EntrySpec(accounts["receivable"], EntryDirection.DEBIT, 100, "INR"),
                EntrySpec(accounts["vault"], EntryDirection.CREDIT, 100, "USD"),
            ],
        )


def test_journal_rows_are_immutable(session, accounts):
    disburse(session, accounts, key="imm-1")
    session.commit()
    entry = session.query(JournalEntry).first()
    entry.amount_minor = 1  # tampering attempt
    with pytest.raises(ImmutableRecordError):
        session.flush()
    session.rollback()
    entry = session.query(JournalEntry).first()
    session.delete(entry)
    with pytest.raises(ImmutableRecordError):
        session.flush()
    session.rollback()


def test_reversal_corrects_without_mutation(session, accounts):
    disburse(session, accounts, key="rev-1", amount=50000)
    post_journal(
        session,
        idempotency_key="rev-1-reversal",
        event_type="REVERSAL",
        entries=[
            EntrySpec(accounts["vault"], EntryDirection.DEBIT, 50000),
            EntrySpec(accounts["receivable"], EntryDirection.CREDIT, 50000),
        ],
        reference_id="rev-1",
    )
    assert account_balance(session, accounts["receivable"]) == 0
    assert account_balance(session, accounts["vault"]) == 0
    assert reconcile(session) == {}


# Unlike the other property tests in this suite, this one builds a fresh
# in-memory SQLite database and creates the whole schema on every example, which
# takes ~150-300ms depending on machine load. Hypothesis's 200ms default
# deadline measures that setup cost, not the invariant under test, and fails
# intermittently because of it. The invariant here is arithmetic — the trial
# balance sums to zero — and is unaffected by how long the setup took.
@settings(deadline=None)
@given(
    amounts=st.lists(st.integers(min_value=1, max_value=10**9), min_size=1, max_size=8),
)
def test_property_ledger_always_balances(amounts):
    """Any sequence of balanced postings keeps the global trial balance at zero."""
    from credence.db import Base, make_engine, make_session_factory

    engine = make_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = make_session_factory(engine)()
    a = LedgerAccount(code="A", name="A", type=AccountType.ASSET)
    b = LedgerAccount(code="B", name="B", type=AccountType.LIABILITY)
    session.add_all([a, b])
    session.flush()
    for i, amount in enumerate(amounts):
        post_journal(
            session,
            idempotency_key=f"k-{i}",
            event_type="T",
            entries=[
                EntrySpec(a.id, EntryDirection.DEBIT, amount),
                EntrySpec(b.id, EntryDirection.CREDIT, amount),
            ],
        )
    assert reconcile(session) == {}
    session.close()
    engine.dispose()

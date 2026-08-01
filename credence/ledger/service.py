"""Double-entry ledger service.

Invariants enforced here and tested in tests/unit/test_ledger.py:
- every journal transaction balances (sum of debits == sum of credits, per
  currency) or the whole posting is rejected;
- every entry amount is a positive integer of minor units;
- an idempotency key posts at most once — a retry returns the original
  transaction with no new financial effect;
- journal rows are immutable (see credence.immutability); corrections are
  posted as explicit reversals;
- reconcile() detects any global imbalance so vaults can be frozen.
"""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from credence.errors import CredenceError, ReasonCode
from credence.models import (
    AccountType,
    EntryDirection,
    JournalEntry,
    JournalTransaction,
    LedgerAccount,
)
from credence.money import require_positive


class LedgerError(CredenceError):
    pass


@dataclass(frozen=True)
class EntrySpec:
    account_id: str
    direction: EntryDirection
    amount_minor: int
    currency: str = "INR"


def post_journal(
    session: Session,
    *,
    idempotency_key: str,
    event_type: str,
    entries: list[EntrySpec],
    description: str = "",
    reference_id: str | None = None,
) -> JournalTransaction:
    """Atomically post a balanced journal transaction. Idempotent."""
    if not idempotency_key:
        raise LedgerError(ReasonCode.IDEMPOTENCY_KEY_REQUIRED, "idempotency key required")

    existing = session.execute(
        select(JournalTransaction).where(JournalTransaction.idempotency_key == idempotency_key)
    ).scalar_one_or_none()
    if existing is not None:
        return existing  # idempotent replay: no new financial effect

    if len(entries) < 2:
        raise LedgerError(ReasonCode.LEDGER_IMBALANCE, "a journal needs at least two entries")

    totals: dict[str, int] = {}
    for e in entries:
        require_positive(e.amount_minor, "journal entry amount")
        sign = 1 if e.direction == EntryDirection.DEBIT else -1
        totals[e.currency] = totals.get(e.currency, 0) + sign * e.amount_minor
    imbalanced = {ccy: net for ccy, net in totals.items() if net != 0}
    if imbalanced:
        raise LedgerError(ReasonCode.LEDGER_IMBALANCE, f"unbalanced journal: {imbalanced}")

    account_ids = {e.account_id for e in entries}
    found = set(
        session.execute(
            select(LedgerAccount.id).where(LedgerAccount.id.in_(account_ids))
        ).scalars()
    )
    missing = account_ids - found
    if missing:
        raise LedgerError(ReasonCode.LEDGER_IMBALANCE, f"unknown accounts: {sorted(missing)}")

    txn = JournalTransaction(
        idempotency_key=idempotency_key,
        event_type=event_type,
        description=description,
        reference_id=reference_id,
    )
    session.add(txn)
    session.flush()  # obtain txn.id; unique constraint guards concurrent duplicates
    for e in entries:
        session.add(
            JournalEntry(
                journal_transaction_id=txn.id,
                account_id=e.account_id,
                direction=e.direction.value,
                amount_minor=e.amount_minor,
                currency=e.currency,
            )
        )
    session.flush()
    return txn


def account_balance(session: Session, account_id: str) -> int:
    """Signed balance in minor units, positive in the account's natural side.

    ASSET/EXPENSE accounts are debit-natural; LIABILITY/INCOME are
    credit-natural.
    """
    account = session.get(LedgerAccount, account_id)
    if account is None:
        raise LedgerError(ReasonCode.LEDGER_IMBALANCE, f"unknown account: {account_id}")
    debit_sum, credit_sum = _sums(session, account_id)
    raw = debit_sum - credit_sum
    if account.type in (AccountType.ASSET, AccountType.EXPENSE):
        return raw
    return -raw


def _sums(session: Session, account_id: str) -> tuple[int, int]:
    rows = session.execute(
        select(JournalEntry.direction, func.coalesce(func.sum(JournalEntry.amount_minor), 0))
        .where(JournalEntry.account_id == account_id)
        .group_by(JournalEntry.direction)
    ).all()
    sums = {direction: total for direction, total in rows}
    return sums.get("DEBIT", 0), sums.get("CREDIT", 0)


def reconcile(session: Session) -> dict[str, int]:
    """Global trial balance. Returns per-currency net (must be all zeros).

    A non-zero net means the ledger is inconsistent; callers must freeze the
    affected vaults and raise an alert (fail closed).
    """
    rows = session.execute(
        select(
            JournalEntry.currency,
            JournalEntry.direction,
            func.coalesce(func.sum(JournalEntry.amount_minor), 0),
        ).group_by(JournalEntry.currency, JournalEntry.direction)
    ).all()
    net: dict[str, int] = {}
    for currency, direction, total in rows:
        sign = 1 if direction == "DEBIT" else -1
        net[currency] = net.get(currency, 0) + sign * int(total)
    return {ccy: value for ccy, value in net.items() if value != 0}

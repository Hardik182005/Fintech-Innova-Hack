"""Chart of accounts (spec §9.2) and posting recipes.

All postings go through ledger.post_journal, which enforces balance,
positivity, and idempotency. Account semantics:

  SANDBOX_CASH         ASSET      test credits entering/leaving the sandbox
  LENDER_LIQUIDITY     ASSET      lender's undeployed test credits
  PRINCIPAL_RECEIVABLE ASSET      credit owed back by tasks
  VAULT_AVAILABLE      LIABILITY  spendable balance held for task vaults
  VENDOR_PAYABLE       LIABILITY  owed to vendors for executed spends
  REVENUE_ESCROW       LIABILITY  task revenue captured under mandate
  OWNER_PAYABLE        LIABILITY  surplus owed to the owner after waterfall
  RESERVE_POOL         LIABILITY  first-loss/sponsor reserve
  FEE_INCOME           INCOME     lender/protocol fee earned
  LOSS_DEFAULT         EXPENSE    bounded simulated losses
"""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from credence.models import AccountType, LedgerAccount

CHART = [
    ("SANDBOX_CASH", "Sandbox cash (test credits)", AccountType.ASSET),
    ("LENDER_LIQUIDITY", "Lender liquidity", AccountType.ASSET),
    ("PRINCIPAL_RECEIVABLE", "Principal receivable", AccountType.ASSET),
    ("VAULT_AVAILABLE", "Task vault available", AccountType.LIABILITY),
    ("VENDOR_PAYABLE", "Vendor payable", AccountType.LIABILITY),
    ("REVENUE_ESCROW", "Task revenue escrow", AccountType.LIABILITY),
    ("OWNER_PAYABLE", "Owner payable", AccountType.LIABILITY),
    ("RESERVE_POOL", "First-loss reserve pool", AccountType.LIABILITY),
    ("FEE_INCOME", "Fee income", AccountType.INCOME),
    ("LOSS_DEFAULT", "Simulated loss / default", AccountType.EXPENSE),
]


def ensure_chart(session: Session) -> dict[str, str]:
    """Create platform accounts if missing; return code -> account_id."""
    existing = {
        a.code: a.id
        for a in session.execute(
            select(LedgerAccount).where(LedgerAccount.organization_id.is_(None))
        ).scalars()
    }
    for code, name, acc_type in CHART:
        if code not in existing:
            account = LedgerAccount(code=code, name=name, type=acc_type, organization_id=None)
            session.add(account)
            session.flush()
            existing[code] = account.id
    return existing

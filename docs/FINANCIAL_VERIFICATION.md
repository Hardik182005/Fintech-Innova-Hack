# Financial verification

Independent recomputation of every money movement observed in the live GCP
sandbox on 2 August 2026.

**Arithmetic discipline.** Integer minor units only. No `float` appears in the
verifier or in the production waterfall — a float would make the conservation
identity approximately true, which for money is the same as false. `Decimal`
was not needed because nothing here divides.

**Independence.** `scripts/verify_financial_identity.py` does **not** import
`credence.vault.waterfall`. The allocation order is written a second time from
the spec's §5.4 text, so agreement between the two is evidence. Importing the
implementation and comparing it to itself would prove nothing, and that is the
usual way this check is done badly.

Reproduce with:

```
python scripts/verify_financial_identity.py
```

Output captured at `artifacts/final-e2e/financial-recomputation.txt`. All
checks pass.

## The identity, corrected

The audit brief asks for:

```
Incoming task revenue = principal recovered + credit fee + platform fee + owner proceeds
```

**The system models no separate platform fee.** `Repayment.fee_minor` is a
single bucket, written from `WaterfallResult.fee_paid_minor`, and the
`PAY_FEE` allocation step has no sibling. There is no `platform_fee_minor`
column, no second fee account in the chart of accounts, and no split anywhere
in `run_repayment_waterfall`.

So the identity as verified is the four-term one with the platform-fee term
absent, and the reserve term — which the brief omits — present:

```
revenue = principal recovered + fee + reserve replenished + owner proceeds
```

This is not a discrepancy in the arithmetic; it is a difference between the
brief's assumed model and the implemented one. Stating it as a four-term
identity with a zero platform fee would imply a modelled-but-empty term. There
is no such term.

## Repayment waterfall

Order is fixed by spec §5.4 and enforced by construction — each step takes
`min(remaining, due)` and decrements, so no step can overtake another:

1. outstanding principal
2. lender/protocol fee
3. replenish any first-loss/sponsor reserve that was drawn
4. remainder released to the owner

### Live record `rpy_9ffbdf6100ea44e991c9` — scenario A, successful task

| Term | Minor units | ₹ |
|---|---:|---:|
| Incoming task revenue | 180 000 | 1 800.00 |
| − principal recovered | 100 000 | 1 000.00 |
| − credit fee | 5 000 | 50.00 |
| − reserve replenished | 0 | 0.00 |
| − owner proceeds | 75 000 | 750.00 |
| **Residual** | **0** | **0.00** |

`180000 = 100000 + 5000 + 0 + 75000`. Every term recomputed independently
matched the API's reported value exactly.

## Recovery waterfall

1. sweep the unspent vault balance
2. apply revenue received so far
3. draw the sponsor/owner reserve, **capped at the signed authorisation**
4. remaining shortfall recorded as explicit simulated loss

### Live record `rpy_6353c0a5966142f79385` — scenario F, task failure

| Term | Minor units | ₹ |
|---|---:|---:|
| Amount owed | 100 000 | 1 000.00 |
| − swept unspent balance | 40 000 | 400.00 |
| − revenue applied | 0 | 0.00 |
| − reserve drawn (capped) | 25 000 | 250.00 |
| − simulated loss | 35 000 | 350.00 |
| **Residual** | **0** | **0.00** |

`100000 = 40000 + 0 + 25000 + 35000`. The reserve draw stopped exactly at its
₹250.00 cap and the remaining ₹350.00 became a **visible** loss rather than a
silent write-off. That is the control working: the downside is bounded and
stated, not hidden.

## Property cross-check — 40 000 random cases

Live records alone only prove the arithmetic on the paths the demo took. The
verifier additionally runs both waterfalls over 20 000 random inputs each,
with 40% of values drawn from the boundary set `{0, 1, 5 000, 100 000,
180 000}` so the brackets flip — revenue exactly equal to principal, reserve
exactly at cap, zero everywhere.

| Property | Result |
|---|---|
| Repayment: independent implementation agrees with production on every case | 0 mismatches / 20 000 |
| Repayment conservation `principal + fee + reserve + owner == revenue` for arbitrary inputs | holds |
| Recovery: independent implementation agrees with production on every case | 0 mismatches / 20 000 |
| Recovery conservation `recovered + loss == owed` | holds |
| **Reserve draw never exceeds the signed cap** | holds on every case |

The cap property is checked separately from the agreement property on purpose:
two implementations could agree and both be wrong about the cap. This asserts
the bound directly against the production output.

## Double-entry ledger

Every waterfall run posts a balanced `JournalTransaction` alongside the
`Repayment` row, keyed `waterfall-{external_event_id}`.

Structural guarantees enforced in `credence/ledger/service.py:44`, verified by
reading the code and by the existing ledger test suite:

- **Balance.** Debits and credits are netted per currency; any non-zero net
  raises `LEDGER_IMBALANCE` and the post is refused. An imbalanced journal
  cannot be written.
- **Minimum two entries.** A one-sided post is refused.
- **Positive amounts.** `require_positive` on every entry; a zero or negative
  entry cannot be smuggled in to force a balance.
- **Known accounts only.** Every `account_id` must already exist; unknown
  accounts raise rather than being created on demand.
- **Idempotent.** A replayed `idempotency_key` returns the existing
  transaction with no new financial effect. This is what makes a retried
  request safe.

Each `Repayment` carries `journal_transaction_id`, so a reported allocation
can be traced to the exact balanced journal that recorded it. The repayment
allocations are also written into the hash-chained audit log as a
`REPAYMENT_WATERFALL` event carrying the same `journal_transaction_id`.

## Pre-funded vault balance (previously flagged, withdrawn)

Early in the audit I flagged a vault reading
`principal_outstanding_minor = 100000, spent_minor = 0` as a possible defect —
outstanding principal against zero spending looked wrong.

It is not a defect. The vault is **pre-funded**: `principal_outstanding_minor`
is set to the full approved limit at creation, and `spent_minor` counts vendor
payments *and* recovery sweeps. Scenario F's arithmetic confirms the model is
self-consistent — the ₹1 000 outstanding decomposes exactly as
`40 000 swept + 25 000 reserve + 35 000 loss`, which is only possible if the
full limit was outstanding from the start.

Recorded here as a modelling choice worth documenting, not a finding. It is
worth documenting because the reading is genuinely non-obvious from the field
names alone.

## Scope

Two live financial episodes were available to recompute: one full repayment
and one bounded recovery. That is what the six demo scenarios produce. The
property cross-check is what extends the result beyond those two paths, and
the honest statement of coverage is: **the two live episodes reconcile to zero
residual, and the two waterfall implementations agree on 40 000 constructed
cases including the boundaries.** No claim is made about paths the demo does
not exercise — partial repayment across multiple revenue events, multi-currency
vaults, or fee outstanding carried forward.

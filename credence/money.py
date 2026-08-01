"""Authoritative money handling.

Authoritative amounts are stored and computed as integer minor units
(e.g. paise for INR). `Decimal` is used only at the boundary for parsing and
display. Binary floating point is never used for money.

See ADR-003 for why integer minor units (matches the Solidity contracts and
the OPA policy input shape, and is exact on every database backend).
"""

from __future__ import annotations

from decimal import ROUND_HALF_EVEN, Decimal, InvalidOperation

# Currency -> number of decimal places in its minor unit.
CURRENCY_EXPONENTS: dict[str, int] = {
    "INR": 2,
    "USD": 2,
}


class MoneyError(ValueError):
    """Base class for money conversion errors."""


class UnknownCurrencyError(MoneyError):
    pass


class LossyAmountError(MoneyError):
    """Raised when a conversion would silently gain or lose value."""


class NegativeAmountError(MoneyError):
    pass


def _exponent(currency: str) -> int:
    try:
        return CURRENCY_EXPONENTS[currency]
    except KeyError:
        raise UnknownCurrencyError(f"unknown currency: {currency!r}") from None


def to_minor(amount: Decimal | str, currency: str) -> int:
    """Convert a major-unit decimal amount to exact integer minor units.

    Raises LossyAmountError if the amount has more precision than the
    currency's minor unit (never round authoritative inputs silently).
    """
    exp = _exponent(currency)
    try:
        dec = Decimal(amount)
    except InvalidOperation as e:
        raise MoneyError(f"unparseable amount: {amount!r}") from e
    if not dec.is_finite():
        raise MoneyError(f"non-finite amount: {amount!r}")
    scaled = dec.scaleb(exp)
    if scaled != scaled.to_integral_value():
        raise LossyAmountError(f"{amount} has sub-minor-unit precision for {currency}")
    return int(scaled)


def from_minor(amount_minor: int, currency: str) -> Decimal:
    """Convert integer minor units back to an exact major-unit Decimal."""
    exp = _exponent(currency)
    return (Decimal(amount_minor) / (Decimal(10) ** exp)).quantize(
        Decimal(1).scaleb(-exp), rounding=ROUND_HALF_EVEN
    )


def require_positive(amount_minor: int, what: str = "amount") -> int:
    if not isinstance(amount_minor, int) or isinstance(amount_minor, bool):
        raise MoneyError(f"{what} must be an int of minor units, got {type(amount_minor)}")
    if amount_minor <= 0:
        raise NegativeAmountError(f"{what} must be positive, got {amount_minor}")
    return amount_minor


def require_non_negative(amount_minor: int, what: str = "amount") -> int:
    if not isinstance(amount_minor, int) or isinstance(amount_minor, bool):
        raise MoneyError(f"{what} must be an int of minor units, got {type(amount_minor)}")
    if amount_minor < 0:
        raise NegativeAmountError(f"{what} must be >= 0, got {amount_minor}")
    return amount_minor

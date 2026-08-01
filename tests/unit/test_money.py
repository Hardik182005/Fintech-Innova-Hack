from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st

from credence.money import (
    LossyAmountError,
    NegativeAmountError,
    UnknownCurrencyError,
    from_minor,
    require_positive,
    to_minor,
)


def test_inr_conversion():
    assert to_minor(Decimal("430.00"), "INR") == 43000
    assert to_minor("1000", "INR") == 100000
    assert from_minor(43000, "INR") == Decimal("430.00")


def test_sub_minor_precision_rejected():
    with pytest.raises(LossyAmountError):
        to_minor(Decimal("430.001"), "INR")


def test_unknown_currency_rejected():
    with pytest.raises(UnknownCurrencyError):
        to_minor("1", "XYZ")


def test_non_finite_rejected():
    with pytest.raises(Exception):
        to_minor("NaN", "INR")


def test_positive_guard():
    with pytest.raises(NegativeAmountError):
        require_positive(0)
    with pytest.raises(NegativeAmountError):
        require_positive(-5)
    assert require_positive(1) == 1


@given(st.integers(min_value=0, max_value=10**15))
def test_roundtrip_preserves_value(amount_minor: int):
    assert to_minor(from_minor(amount_minor, "INR"), "INR") == amount_minor

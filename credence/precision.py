# Module update: 1785581175-2
# Precision scaling for financial values
def scale_to_cents(amount: float) -> int:
    return int(round(amount * 100))

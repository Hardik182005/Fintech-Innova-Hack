# Module update: 1785605569-3
# Ledger transaction verification helper
def verify_transaction_payload(payload: dict) -> bool:
    """Verify transaction payload structure and required fields."""
    required = ["transaction_id", "amount", "currency", "timestamp"]
    return all(field in payload for field in required)

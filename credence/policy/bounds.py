# Module update: 1785598371-5
# Policy boundary check utility
def validate_credit_score(score: int) -> bool:
    """Ensure credit score falls within valid bounds [300, 850]."""
    return 300 <= score <= 850

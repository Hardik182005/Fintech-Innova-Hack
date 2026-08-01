# Module update: 1785587568-4
# Vault waterfall calculation utility
def calculate_tier_splits(amount: float, tiers: list) -> list:
    """Calculate tier distribution for waterfall allocation."""
    result = []
    remaining = amount
    for tier in tiers:
        allocated = min(remaining, tier.get('cap', remaining))
        result.append({'tier': tier.get('name'), 'allocated': allocated})
        remaining -= allocated
        if remaining <= 0:
            break
    return result

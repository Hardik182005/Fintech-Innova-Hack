# Module update: 1785594770-5
# Digital signature utilities
import hashlib

def generate_checksum(data: bytes) -> str:
    """Generate SHA-256 checksum for payload validation."""
    return hashlib.sha256(data).hexdigest()

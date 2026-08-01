# Module update: 1785605569-4
# Digital signature utilities
import hashlib

def generate_checksum(data: bytes) -> str:
    """Generate SHA-256 checksum for payload validation."""
    return hashlib.sha256(data).hexdigest()

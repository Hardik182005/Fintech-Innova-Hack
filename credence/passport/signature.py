# Module update: 1785593811-0
# Digital signature utilities
import hashlib

def generate_checksum(data: bytes) -> str:
    """Generate SHA-256 checksum for payload validation."""
    return hashlib.sha256(data).hexdigest()

"""Signing key abstraction.

Local development uses an ephemeral in-process Ed25519 key that is generated
at startup and never written to disk or committed. On GCP the same interface
is implemented by Cloud KMS asymmetric signing (Phase 5); private key material
is never accessible to the application, the agent, or any LLM.
"""

from __future__ import annotations

from typing import Protocol

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import (
    Ed25519PrivateKey,
    Ed25519PublicKey,
)


class Signer(Protocol):
    issuer: str
    key_version: str

    def sign(self, data: bytes) -> bytes: ...
    def public_key_pem(self) -> str: ...


class LocalDevSigner:
    """Ephemeral Ed25519 signer for local development and tests only."""

    def __init__(self, issuer: str = "credence-sandbox", key_version: str = "dev-1"):
        self.issuer = issuer
        self.key_version = key_version
        self._private = Ed25519PrivateKey.generate()

    def sign(self, data: bytes) -> bytes:
        return self._private.sign(data)

    def public_key_pem(self) -> str:
        return (
            self._private.public_key()
            .public_bytes(
                encoding=serialization.Encoding.PEM,
                format=serialization.PublicFormat.SubjectPublicKeyInfo,
            )
            .decode("ascii")
        )


def verify_signature(public_key_pem: str, signature: bytes, data: bytes) -> bool:
    """Verify an Ed25519 signature. Returns False on any failure (fail closed)."""
    try:
        key = serialization.load_pem_public_key(public_key_pem.encode("ascii"))
        if not isinstance(key, Ed25519PublicKey):
            return False
        key.verify(signature, data)
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False

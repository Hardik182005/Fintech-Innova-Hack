"""Signing key abstraction.

Two implementations, both Ed25519 and both producing identical passports:

- StaticEd25519Signer wraps a key held outside the process. On GCP that key
  comes from Secret Manager, injected as an environment variable. This is what
  a deployed service must use.
- LocalDevSigner generates a throwaway key at import time. It is for local
  development and tests, where a passport that dies with the process is fine.

The distinction is load-bearing rather than cosmetic. A per-process key is not
just "less durable": passports signed by one replica cannot be verified by
another, and every redeploy invalidates every passport ever issued. Settings
refuses to start a deployed service without a static key for that reason.

Private key material is never written to disk by this module, never logged,
and never leaves the process. Cloud KMS signing is not implemented; nothing
here should be described as HSM-backed.
"""

from __future__ import annotations

import hashlib
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


class _Ed25519Signer:
    """Shared signing behaviour. Subclasses only decide where the key is from."""

    issuer: str
    key_version: str
    _private: Ed25519PrivateKey

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

    def _fingerprint(self) -> str:
        """First 16 hex of SHA-256 over the public key DER.

        Used as the key_version stamped into every passport, so a passport
        records which key signed it. Derived rather than configured: a hand-set
        version can drift from the key it names, and the drift is only
        discovered when verification starts failing.
        """
        der = self._private.public_key().public_bytes(
            encoding=serialization.Encoding.DER,
            format=serialization.PublicFormat.SubjectPublicKeyInfo,
        )
        return hashlib.sha256(der).hexdigest()[:16]


class StaticEd25519Signer(_Ed25519Signer):
    """Signer backed by a PEM supplied by the deployment (Secret Manager)."""

    def __init__(self, private_key_pem: str, issuer: str = "credence-sandbox"):
        key = serialization.load_pem_private_key(
            private_key_pem.strip().encode("ascii"), password=None
        )
        if not isinstance(key, Ed25519PrivateKey):
            # Passports are Ed25519 by contract; a differently-typed key would
            # otherwise fail later, at signing time, on a live request.
            raise ValueError(
                f"passport signing key must be Ed25519, got {type(key).__name__}"
            )
        self._private = key
        self.issuer = issuer
        self.key_version = f"ed25519-{self._fingerprint()}"


class LocalDevSigner(_Ed25519Signer):
    """Ephemeral Ed25519 signer for local development and tests only.

    Not usable on a deployed service: see the module docstring and
    Settings._require_stable_signing_key_on_gcp.
    """

    def __init__(self, issuer: str = "credence-sandbox", key_version: str | None = None):
        self._private = Ed25519PrivateKey.generate()
        self.issuer = issuer
        self.key_version = key_version or f"dev-{self._fingerprint()}"


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

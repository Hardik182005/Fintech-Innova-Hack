"""Explanation translation with numeric-preservation checks (spec §8.1).

Canonical financial numbers, currency amounts, IDs, decision codes, and
evidence IDs must survive translation byte-for-byte. `verify_numeric_parity`
extracts and compares them; a mismatch rejects the translation (fail closed —
the canonical English text is served instead).
"""

from __future__ import annotations

import re

_NUMERIC = re.compile(r"₹?\d[\d,]*(?:\.\d+)?")
_IDS = re.compile(r"\b(?:agt|org|usr|tsk|vlt|app|dcn|evd|txn|prp|rpy)_[0-9a-f]+\b")
_CODES = re.compile(r"\b[A-Z][A-Z_]{3,}\b")


def extract_invariants(text: str) -> dict[str, list[str]]:
    return {
        "numbers": sorted(_NUMERIC.findall(text)),
        "ids": sorted(_IDS.findall(text)),
        "codes": sorted(_CODES.findall(text)),
    }


def verify_numeric_parity(source: str, translated: str) -> tuple[bool, dict]:
    src, dst = extract_invariants(source), extract_invariants(translated)
    mismatches = {
        key: {"source": src[key], "translated": dst[key]}
        for key in src
        if src[key] != dst[key]
    }
    return not mismatches, mismatches

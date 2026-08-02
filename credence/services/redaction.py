"""Deterministic redaction of personal identifiers in submitted evidence.

Evidence is the one place a person types free text that later reaches a model
and is stored for the life of the credit facility. Two things follow from that.

The first is that identifiers do not belong in it. A task order needs to say
what was ordered and what it is worth; it does not need the customer's Aadhaar
number, and once such a number is stored it is stored in the audit record, the
model prompt and every export taken afterwards. Redaction runs before the row
is written, so the unredacted string exists only for the length of one request
and is never hashed, chained or sent to a model.

The second is that redaction here is pattern matching, not comprehension. It
catches identifiers that have a fixed, checkable shape — PAN, Aadhaar, IFSC,
GSTIN, card numbers, phone numbers, e-mail addresses, labelled account numbers.
It will not catch a name, an address, or an identifier written in a form nobody
anticipated. This module is a floor under what gets stored, and the operator
guidance that evidence should be synthetic is the actual control. Saying
otherwise would be claiming a guarantee the regexes below cannot make.

Patterns are ordered longest-first where two could overlap: a spaced sixteen
digit card number also contains a twelve digit run that matches the Aadhaar
shape, so the card pattern must consume it first.
"""

from __future__ import annotations

import re
from typing import NamedTuple

__all__ = ["RedactionResult", "redact"]


class _Rule(NamedTuple):
    kind: str
    pattern: re.Pattern[str]
    #: When set, only this capture group is replaced — the surrounding label is
    #: kept so a reader can still see that an account number was given.
    group: int | None = None


_RULES: tuple[_Rule, ...] = (
    # Sixteen digits, optionally grouped. Runs first: see the module note.
    _Rule("CARD", re.compile(r"\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?\d{4}\b")),
    # GSTIN is checkable by shape: state code, PAN, entity digit, Z, checksum.
    _Rule("GSTIN", re.compile(r"\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b")),
    _Rule("PAN", re.compile(r"\b[A-Z]{5}\d{4}[A-Z]\b")),
    _Rule("IFSC", re.compile(r"\b[A-Z]{4}0[A-Z0-9]{6}\b")),
    # An account number has no intrinsic shape, so it is only redacted where the
    # writer labelled it as one. An unlabelled nine-to-eighteen digit run is far
    # more likely to be an invoice or order reference than an account. The label
    # is also what settles the ambiguity with Aadhaar, which is why this rule
    # runs first: a twelve-digit number introduced as an account is an account.
    _Rule(
        "ACCOUNT",
        re.compile(
            r"\b(?:a/c|acct|account)\s*(?:no\.?|number|#)?\s*[:\-]?\s*(\d{9,18})\b",
            re.IGNORECASE,
        ),
        group=1,
    ),
    _Rule("AADHAAR", re.compile(r"\b\d{4}\s?\d{4}\s?\d{4}\b")),
    _Rule("EMAIL", re.compile(r"\b[\w.+-]+@[\w-]+\.[\w.-]{2,}\b")),
    # Indian mobile numbers start 6-9 and run ten digits, commonly written as
    # five and five, with an optional +91 in front.
    _Rule("PHONE", re.compile(r"(?:\+91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b")),
)


class RedactionResult(NamedTuple):
    text: str
    #: Identifier kinds that were found, sorted. Empty when nothing matched.
    kinds: list[str]


def redact(text: str) -> RedactionResult:
    """Replace recognised identifiers with a labelled placeholder.

    The placeholder names the kind rather than blanking the span, because an
    underwriter reading the evidence later needs to know that a bank account
    was supplied and withheld — not to be left wondering whether the sentence
    was always incomplete.
    """
    found: set[str] = set()
    out = text
    for rule in _RULES:
        marker = f"[REDACTED:{rule.kind}]"

        def replace(match: re.Match[str], rule: _Rule = rule, marker: str = marker) -> str:
            found.add(rule.kind)
            if rule.group is None:
                return marker
            # Keep everything the pattern matched except the captured span, so
            # "account no: 1234…" becomes "account no: [REDACTED:ACCOUNT]".
            start, end = match.span(rule.group)
            return match.group(0)[: start - match.start()] + marker + match.group(0)[end - match.start() :]

        out = rule.pattern.sub(replace, out)

    return RedactionResult(out, sorted(found))

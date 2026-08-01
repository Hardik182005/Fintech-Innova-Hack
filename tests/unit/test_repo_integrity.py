"""Regression guard against reintroducing fabricated source into `credence/`.

Context (full evidence in docs/REPOSITORY_INTEGRITY_AUDIT.md): a scheduled
automation, auto_push.ps1, was overwriting real paths under credence/ every
hour with synthetic placeholder content stamped with a
`# Module update: <unix-ts>-<n>` header and a UTF-8 BOM. One of the
fabricated files defined `calculate_tier_splits(amount: float, tiers: list)`
and another defined `scale_to_cents(amount: float) -> int` -- both violate
this repo's integer-minor-units invariant (credence/money.py: money is
always `int` minor units or `Decimal` at the parse/display boundary, never
binary `float`). auto_push.ps1's generation behaviour has been disabled and
the fabricated files removed, but nothing stops it (or something like it)
from reintroducing either pattern. This test scans the real credence/
package source -- not tests/ or docs/, which are not the invariant's scope
-- and fails loudly if either pattern reappears.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

CREDENCE_ROOT = Path(__file__).resolve().parents[2] / "credence"

# Fingerprint of the auto_push.ps1-style fabricated file header, e.g.
# "# Module update: 1785605569-3".
GENERATED_HEADER_RE = re.compile(r"#\s*Module update:\s*\d+-\d+")
UTF8_BOM = b"\xef\xbb\xbf"

# Underscore/camelCase segments that denote a monetary amount. Deliberately
# narrow: it must name money specifically, not any numeric quantity. This
# must NOT match legitimate non-money float use elsewhere in the codebase --
# timeouts (opa_timeout_seconds), confidence scores (modelgw confidence),
# latency (latency_ms), or ppm-based percentiles/rates (telemetry.py) all
# stay untouched by this list on purpose.
MONEY_WORDS = {
    "amount",
    "amt",
    "price",
    "balance",
    "payout",
    "principal",
    "payment",
    "fee",
    "fees",
    "premium",
    "cost",
    "charge",
    "salary",
    "income",
    "debt",
    "loan",
    "allocation",
    "allocated",
    "cent",
    "cents",
    "paise",
    "minor",
}

_SEGMENT_RE = re.compile(r"[A-Za-z]+")


def _is_money_name(identifier: str) -> bool:
    """True if any word segment of `identifier` is a recognized money word."""
    segments = _SEGMENT_RE.findall(identifier)
    return any(
        seg.lower().rstrip("s") in MONEY_WORDS or seg.lower() in MONEY_WORDS for seg in segments
    )


def _is_float_annotation(node: ast.expr | None) -> bool:
    """True if the annotation node is (or contains) a bare `float`."""
    if node is None:
        return False
    if isinstance(node, ast.Name):
        return node.id == "float"
    if isinstance(node, ast.Attribute):
        return node.attr == "float"
    if isinstance(node, ast.Constant) and node.value == "float":
        return True  # string-quoted annotation: 'float'
    if isinstance(node, ast.Subscript):  # Optional[float], list[float], ...
        return _is_float_annotation(node.value) or _is_float_annotation(node.slice)
    if isinstance(node, ast.BinOp):  # float | None (PEP 604)
        return _is_float_annotation(node.left) or _is_float_annotation(node.right)
    if isinstance(node, ast.Tuple):
        return any(_is_float_annotation(elt) for elt in node.elts)
    return False


def _iter_python_files() -> list[Path]:
    assert CREDENCE_ROOT.is_dir(), f"expected credence/ package at {CREDENCE_ROOT}"
    return sorted(p for p in CREDENCE_ROOT.rglob("*.py") if "__pycache__" not in p.parts)


def test_no_generated_stub_headers_in_credence_source():
    """No file under credence/ carries the auto_push.ps1 fabrication
    fingerprint: a `# Module update: <unix-ts>-<n>` header, or a stray
    UTF-8 BOM (PowerShell's `Out-File -Encoding UTF8` signature; real source
    in this repo is plain UTF-8, no BOM)."""
    offenders = []
    for path in _iter_python_files():
        raw = path.read_bytes()
        has_bom = raw.startswith(UTF8_BOM)
        text = raw.decode("utf-8-sig", errors="replace")
        first_line = text.splitlines()[0] if text else ""
        if GENERATED_HEADER_RE.search(first_line):
            offenders.append(f"{path}: generated header {first_line!r}")
        elif has_bom:
            offenders.append(f"{path}: unexpected UTF-8 BOM")
    assert not offenders, (
        "Fabricated/generated source detected under credence/ "
        "(see docs/REPOSITORY_INTEGRITY_AUDIT.md):\n" + "\n".join(offenders)
    )


def test_no_float_typed_money_signatures_in_credence():
    """No function/method under credence/ declares a money-named parameter
    or return value annotated as `float`. Authoritative money handling is
    integer minor units or `Decimal` only -- see credence/money.py."""
    offenders = []
    for path in _iter_python_files():
        source = path.read_bytes().decode("utf-8-sig")
        tree = ast.parse(source, filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.FunctionDef | ast.AsyncFunctionDef):
                continue
            params = [
                *node.args.posonlyargs,
                *node.args.args,
                *node.args.kwonlyargs,
            ]
            if node.args.vararg:
                params.append(node.args.vararg)
            if node.args.kwarg:
                params.append(node.args.kwarg)
            for param in params:
                if _is_money_name(param.arg) and _is_float_annotation(param.annotation):
                    offenders.append(f"{path}:{node.lineno}: {node.name}({param.arg}: float)")
            if _is_money_name(node.name) and _is_float_annotation(node.returns):
                offenders.append(f"{path}:{node.lineno}: def {node.name}(...) -> float")
    assert not offenders, (
        "Float-typed money signature(s) detected under credence/ -- money must be "
        "int minor units or Decimal (see credence/money.py):\n" + "\n".join(offenders)
    )

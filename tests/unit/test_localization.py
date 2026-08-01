from credence.localization.catalogs import CATALOGS, LOCALES
from credence.localization.service import verify_numeric_parity


def test_all_locales_have_full_catalogs():
    keys = set(CATALOGS["en"])
    for locale in LOCALES:
        assert set(CATALOGS[locale]) == keys, f"{locale} catalog keys diverge"


def test_numeric_parity_pass():
    src = "Approved limit ₹1,000.00 for vault vlt_abc123 with code APPROVED."
    ok, mismatches = verify_numeric_parity(src, src.replace("Approved limit", "स्वीकृत सीमा"))
    assert ok, mismatches


def test_numeric_parity_detects_changed_amount():
    src = "Repay ₹600.00 to vault vlt_abc123."
    bad = "Repay ₹6,000.00 to vault vlt_abc123."
    ok, mismatches = verify_numeric_parity(src, bad)
    assert not ok
    assert "numbers" in mismatches


def test_numeric_parity_detects_dropped_id():
    src = "Decision dcn_deadbeef01 code REJECTED."
    bad = "Decision code REJECTED."
    ok, mismatches = verify_numeric_parity(src, bad)
    assert not ok
    assert "ids" in mismatches

"""Settings assembly, specifically the Cloud Run database wiring.

On Cloud Run the database password arrives from Secret Manager as its own
environment variable, so `database_url` is assembled at startup rather than
supplied whole. A mistake here does not raise — it produces a syntactically
valid URL pointing at the wrong host, or one that silently drops the password
and falls back to the local default. Both fail closed at connect time, but far
from the cause. These tests pin the assembly.
"""

from __future__ import annotations

import pytest

from credence.config import Settings


def test_local_default_url_is_used_when_no_host_supplied():
    """With no host/password (local dev), database_url passes through verbatim."""
    s = Settings(database_url="postgresql+psycopg://u:p@localhost:5432/db")
    assert s.database_url == "postgresql+psycopg://u:p@localhost:5432/db"


def test_url_is_assembled_from_host_and_password():
    s = Settings(database_host="10.10.0.3", database_password="s3cret")
    assert s.database_url == "postgresql+psycopg://credence:s3cret@10.10.0.3:5432/credence"


def test_assembly_requires_both_host_and_password():
    """A half-configured deployment must not silently build a passwordless URL."""
    default = Settings().database_url

    assert Settings(database_host="10.10.0.3").database_url == default
    assert Settings(database_password="s3cret").database_url == default


@pytest.mark.parametrize(
    ("raw", "encoded"),
    [
        ("p@ss", "p%40ss"),  # @ would otherwise terminate the userinfo section
        ("a/b", "a%2Fb"),  # / would otherwise start the path
        ("a:b", "a%3Ab"),  # : would otherwise split user from password
        ("a?b", "a%3Fb"),  # ? would otherwise start the query string
    ],
)
def test_password_url_special_characters_are_escaped(raw: str, encoded: str):
    """A generated password containing URL-structural characters must not
    re-point the connection. Unescaped, `p@ss` turns the host into `ss@...`."""
    s = Settings(database_host="10.10.0.3", database_password=raw)
    assert f":{encoded}@10.10.0.3:" in s.database_url


def test_non_default_user_port_and_name_are_honoured():
    s = Settings(
        database_host="db.internal",
        database_password="pw",
        database_user="other",
        database_name="ledger",
        database_port=6543,
    )
    assert s.database_url == "postgresql+psycopg://other:pw@db.internal:6543/ledger"

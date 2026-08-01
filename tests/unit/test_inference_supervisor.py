"""Pinned-artifact restore in the GPU inference supervisor.

The supervisor decides whether a GPU revision is allowed to serve. Two defects
found during deployment are pinned here because neither is visible from
outside: both leave a container that looks healthy while serving the wrong
thing, or nothing at all.

Note these exercise inference_server.py, which lives at the repo root because
it ships inside the inference image rather than the API package.
"""

from __future__ import annotations

import hashlib
import importlib
import sys
from pathlib import Path

import httpx
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))


def _load(monkeypatch, **env):
    """Import inference_server with a given environment.

    Module-level constants are read at import time, so the environment has to
    be in place before reload rather than patched afterwards.
    """
    for key in (
        "CREDENCE_MODEL_GCS_URI",
        "CREDENCE_MODEL_EXPECTED_DIGEST",
        "CREDENCE_MODEL_ARTIFACT_SHA256",
        "CREDENCE_PRIMARY_MODEL",
    ):
        monkeypatch.delenv(key, raising=False)
    for key, value in env.items():
        monkeypatch.setenv(key, value)

    import inference_server

    return importlib.reload(inference_server)


# --- digest variable separation --------------------------------------------
#
# CREDENCE_MODEL_EXPECTED_DIGEST was originally compared against two unrelated
# values: the sha256 of the artifact tar, and the model manifest digest the
# Ollama runtime reports. Those are different bytes, so with a pinned artifact
# configured one comparison always failed and no artifact-backed cold start
# could ever reach ready.


def test_artifact_checksum_and_model_digest_are_distinct_inputs(monkeypatch):
    mod = _load(
        monkeypatch,
        CREDENCE_MODEL_EXPECTED_DIGEST="a" * 64,
        CREDENCE_MODEL_ARTIFACT_SHA256="b" * 64,
    )
    assert mod.EXPECTED_DIGEST == "a" * 64
    assert mod.ARTIFACT_SHA256 == "b" * 64
    assert mod.EXPECTED_DIGEST != mod.ARTIFACT_SHA256


# --- artifact restore ------------------------------------------------------


def _fake_stream(payload: bytes):
    """Stand in for httpx.stream returning the artifact bytes."""

    class _Resp:
        def __enter__(self):
            return self

        def __exit__(self, *a):
            return False

        def raise_for_status(self):
            return None

        def iter_bytes(self, _size=None):
            yield payload

    return lambda *a, **kw: _Resp()


def test_artifact_is_not_extracted_when_checksum_mismatches(monkeypatch, tmp_path):
    """A truncated or swapped tar must never reach the model store. Extracting
    it would produce a working service serving an unverified model."""
    mod = _load(
        monkeypatch,
        CREDENCE_MODEL_GCS_URI="gs://bucket/path/models.tar",
        CREDENCE_MODEL_ARTIFACT_SHA256="c" * 64,  # deliberately wrong
    )
    monkeypatch.setattr(mod, "_metadata_access_token", lambda: "token")
    monkeypatch.setattr(mod.httpx, "stream", _fake_stream(b"payload bytes"))
    monkeypatch.setattr(mod.tempfile, "gettempdir", lambda: str(tmp_path))

    extracted = {"called": False}

    def _no_extract(*a, **kw):
        extracted["called"] = True
        raise AssertionError("tar must not run on a checksum mismatch")

    monkeypatch.setattr(mod.subprocess, "run", _no_extract)

    with pytest.raises(RuntimeError, match="checksum mismatch"):
        mod._pull_from_gcs()

    assert not extracted["called"]
    assert not (tmp_path / "model-artifact.tar").exists(), "bad artifact must be removed"


def test_matching_checksum_proceeds_to_extract(monkeypatch, tmp_path):
    payload = b"a plausible tar"
    mod = _load(
        monkeypatch,
        CREDENCE_MODEL_GCS_URI="gs://bucket/path/models.tar",
        CREDENCE_MODEL_ARTIFACT_SHA256=hashlib.sha256(payload).hexdigest(),
    )
    monkeypatch.setattr(mod, "_metadata_access_token", lambda: "token")
    monkeypatch.setattr(mod.httpx, "stream", _fake_stream(payload))
    monkeypatch.setattr(mod.tempfile, "gettempdir", lambda: str(tmp_path))
    monkeypatch.setattr(mod.os, "makedirs", lambda *a, **kw: None)

    seen = {}

    class _Ok:
        returncode = 0
        stderr = ""

    def _record(cmd, **kw):
        seen["cmd"] = cmd
        return _Ok()

    monkeypatch.setattr(mod.subprocess, "run", _record)

    mod._pull_from_gcs()

    assert seen["cmd"][0] == "tar"
    assert "/root/.ollama" in seen["cmd"]


def test_download_uses_no_gcloud_binary(monkeypatch, tmp_path):
    """The inference image ships python and tar but not the gcloud SDK. The
    original implementation shelled out to `gcloud storage cp`, which raises
    FileNotFoundError at runtime and fails every artifact-backed start."""
    payload = b"x"
    mod = _load(
        monkeypatch,
        CREDENCE_MODEL_GCS_URI="gs://bucket/path/models.tar",
        CREDENCE_MODEL_ARTIFACT_SHA256=hashlib.sha256(payload).hexdigest(),
    )
    monkeypatch.setattr(mod, "_metadata_access_token", lambda: "token")
    monkeypatch.setattr(mod.httpx, "stream", _fake_stream(payload))
    monkeypatch.setattr(mod.tempfile, "gettempdir", lambda: str(tmp_path))
    monkeypatch.setattr(mod.os, "makedirs", lambda *a, **kw: None)

    invoked: list[str] = []

    class _Ok:
        returncode = 0
        stderr = ""

    def _record(cmd, **kw):
        invoked.append(cmd[0])
        return _Ok()

    monkeypatch.setattr(mod.subprocess, "run", _record)
    mod._pull_from_gcs()

    assert "gcloud" not in invoked


@pytest.mark.parametrize("uri", ["https://example.com/models.tar", "bucket/models.tar", "gs://bucket"])
def test_malformed_artifact_uri_is_rejected(monkeypatch, uri: str):
    mod = _load(monkeypatch, CREDENCE_MODEL_GCS_URI=uri)
    with pytest.raises(RuntimeError):
        mod._pull_from_gcs()

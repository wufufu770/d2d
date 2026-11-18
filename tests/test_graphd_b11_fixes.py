#!/usr/bin/env python3
"""B11 批2 修复回归 — O_TRUNC token 覆写 + V-11 锁超时顶层 503 兜底(只测行为不测实现)。"""
import contextlib
import json
from unittest import mock

import pytest


def test_write_token_file_truncates_previous_longer_token(tmp_path, monkeypatch):
    """B11: 新 token 比旧短时须完整覆写(O_TRUNC) — 残留尾字节会让 reader 读到坏 token。"""
    import graphd.app as app

    token_path = tmp_path / "host-token"
    monkeypatch.setattr(app, "_safe_token_path", lambda p: str(token_path))

    app._write_token_file(str(token_path), "very-long-previous-token-1234567890")
    app._write_token_file(str(token_path), "short-tok")

    assert token_path.read_text() == "short-tok", "短 token 覆写后不得残留旧尾字节"


def test_write_token_file_keeps_long_token_roundtrip(tmp_path, monkeypatch):
    """常规覆写往返(等长/变长)不受 O_TRUNC 影响。"""
    import graphd.app as app

    token_path = tmp_path / "worker-token"
    monkeypatch.setattr(app, "_safe_token_path", lambda p: str(token_path))

    app._write_token_file(str(token_path), "tok-a")
    app._write_token_file(str(token_path), "tok-much-longer-b")
    assert token_path.read_text() == "tok-much-longer-b"


def test_query_returns_503_when_locked_times_out(monkeypatch):
    """B11: 锁等待 TimeoutError 顶层统一兜 503(V-11 语义) —
    原形态 TimeoutError 从 with _locked() 逃逸成 500(内层 except 接不到, try 尚未进入)。"""
    import graphd.app as app

    sent = {}
    handler = mock.MagicMock()
    handler._send = lambda code, body: sent.update({"code": code, "body": body})
    # wrapper 契约: _do_post_impl 内 with _locked().__enter__ 抛 TimeoutError → wrapper 转 503
    handler._do_post_impl = mock.MagicMock(side_effect=TimeoutError("lock wait exceeded 5.0s"))

    app.Handler.do_POST(handler)
    assert sent.get("code") == 503, f"锁等待超时应 503, 实际 {sent.get('code')}"
    assert "V-11 lock deadline" in sent.get("body", {}).get("error", "")


def test_get_returns_503_when_locked_times_out(monkeypatch):
    """同款兜底覆盖 do_GET(/authorized 等锁位点)。"""
    import graphd.app as app

    sent = {}
    handler = mock.MagicMock()
    handler._send = lambda code, body: sent.update({"code": code, "body": body})
    handler._do_get_impl = mock.MagicMock(side_effect=TimeoutError("lock wait exceeded 5.0s"))

    app.Handler.do_GET(handler)
    assert sent.get("code") == 503

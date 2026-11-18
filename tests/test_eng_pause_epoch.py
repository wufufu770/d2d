#!/usr/bin/env python3
"""E40-B4(#104) 回归 — per-eng 暂停的 owner/epoch 核验(_eng_pause_block_reason):
失租自停写的旧暂停文件在新持有者/新纪元下核验为 STALE 放行, 不再阻塞接管者;
旧形态(无 by)保持全拦; 图读失败保守按同持有者(退回全拦语义)。"""
import json

import pytest

import graphd.app as app


class FakeRow:
    def __init__(self, vals):
        self._v = vals
        self._has = vals is not None

    def has_next(self):
        return self._has

    def get_next(self):
        self._has = False
        return self._v


class FakeConn:
    def __init__(self, vals=None, raise_exc=False):
        self._vals = vals
        self._raise = raise_exc

    def execute(self, q, params):
        if self._raise:
            raise RuntimeError("graph down")
        return FakeRow(self._vals)


@pytest.fixture()
def pause_dir(tmp_path, monkeypatch):
    d = tmp_path / "config"
    d.mkdir()
    monkeypatch.setattr(app, "_D2D_PAUSE_DIR", str(d))
    return d


def _write_pause(d, eng, body):
    (d / f"paused-{eng}.json").write_text(json.dumps(body))


def test_no_file_passes(pause_dir):
    assert app._eng_pause_block_reason("e1", FakeConn(["A", 3])) == ""


def test_not_paused_passes(pause_dir):
    _write_pause(pause_dir, "e1", {"paused": False})
    assert app._eng_pause_block_reason("e1", FakeConn(["A", 3])) == ""


def test_legacy_file_blocks_everyone(pause_dir):
    _write_pause(pause_dir, "e1", {"paused": True, "eng": "e1"})
    why = app._eng_pause_block_reason("e1", FakeConn(["A", 3]))
    assert "legacy" in why


def test_stale_owner_pause_passes_for_new_holder(pause_dir):
    """#104 主洞: A 失租自停写的暂停文件 — B 接管(leased_by=B)后不再被阻塞。"""
    _write_pause(pause_dir, "e1", {"paused": True, "eng": "e1", "by": "sched-A", "epoch": 3})
    assert app._eng_pause_block_reason("e1", FakeConn(["sched-B", 4])) == ""


def test_same_owner_same_epoch_blocks(pause_dir):
    _write_pause(pause_dir, "e1", {"paused": True, "eng": "e1", "by": "sched-A", "epoch": 3})
    why = app._eng_pause_block_reason("e1", FakeConn(["sched-A", 3]))
    assert "d2d-paused" in why


def test_same_owner_older_epoch_passes(pause_dir):
    """同持有者重挂载: 图内纪元已前进(file 2 < graph 5)→ 旧纪元暂停作废。"""
    _write_pause(pause_dir, "e1", {"paused": True, "eng": "e1", "by": "sched-A", "epoch": 2})
    assert app._eng_pause_block_reason("e1", FakeConn(["sched-A", 5])) == ""


def test_file_epoch_ahead_keeps_blocking(pause_dir):
    """文件纪元超前图内(极端时钟/写序)→ 保守仍拦。"""
    _write_pause(pause_dir, "e1", {"paused": True, "eng": "e1", "by": "sched-A", "epoch": 9})
    assert app._eng_pause_block_reason("e1", FakeConn(["sched-A", 5])) != ""


def test_graph_read_failure_falls_back_to_block(pause_dir):
    """图读失败 → 保守按同持有者(退回全拦语义), 不放行。"""
    _write_pause(pause_dir, "e1", {"paused": True, "eng": "e1", "by": "sched-A", "epoch": 3})
    assert app._eng_pause_block_reason("e1", FakeConn(raise_exc=True)) != ""


def test_hint_in_reason(pause_dir):
    _write_pause(pause_dir, "e1", {"paused": True, "eng": "e1"})
    why = app._eng_pause_block_reason("e1", FakeConn(["A", 3]), hint="任务立即收尾退出")
    assert "任务立即收尾退出" in why


def test_path_traversal_ignored(pause_dir):
    assert app._eng_pause_block_reason("../evil", FakeConn(["A", 3])) == ""

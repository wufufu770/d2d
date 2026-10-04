#!/usr/bin/env python3
"""T1-4-2 gate_anchor 门禁结构化锚回归集 — schema 三处同步 + /write/signal 校验。

两块(与 test_repairability.py 同款分工):
① schema 层(直连 gd.schema): 迁移幂等(重复 boot 不炸)/旧库(15 列形态)ALTER 补列/
   三处同步闭环(CREATE/ALTER/_CRITICAL_COLUMNS)。
② HTTP 层(临时 DB + 随机端口起真实例走全链路): 合法锚写入/回读、非法 JSON 400、
   超长 400、缺 gate_d1/gate_v 键 400、无 gate_anchor 旧写入零变化。
schema 权威定义: docs/gate-anchor-schema.md。
"""
import json
import os
import tempfile
import threading
import urllib.error
import urllib.request

import pytest

# 环境先钉: 本模块可能是 graphd.app 的首个导入者 —— DB/pause 路径指到仓库外临时目录,
# 不触碰仓内 graphd/kuzu_db 与真实 ~/.d2d-data, 也不脏工作树。(若他测试模块先导入
# graphd.app, 下方 server fixture 会对模块全局再 monkeypatch 一次 —— 双保险。)
os.environ.setdefault("P2P_GRAPH", os.path.join(tempfile.gettempdir(), "gate-anchor-pytest", "kuzu_db"))
os.environ.setdefault("D2D_DATA_DIR", os.path.join(tempfile.gettempdir(), "gate-anchor-pytest"))

from graphd.app import kuzu  # noqa: E402 — LBD-1b 探路: 引擎单一化(在上方环境钉定之后导入 graphd.app)

from graphd.gd.schema import (  # noqa: E402 — 环境先钉后导入
    SCHEMA, _CRITICAL_COLUMNS, _verify_critical_columns, init_schema,
)

# ── ① schema 层 ──────────────────────────────────────────────────────────


def _table_columns(conn, table):
    r = conn.execute("CALL table_info('" + table + "') RETURN *")
    cols = set()
    while r.has_next():
        cols.add(str(r.get_next()[1]))
    return cols


def test_migration_idempotent_repeated_boot(tmp_path):
    """迁移幂等: 同一库连续两次 boot(新库 CREATE 直建 + ALTER 抛错被吞)不炸, 列在位"""
    conn = kuzu.Connection(kuzu.Database(str(tmp_path / "db")))
    init_schema(conn)  # 第一次 boot
    init_schema(conn)  # 第二次 boot: 列已存在, ALTER 抛错被吞 — 不抛出即过
    assert "gate_anchor" in _table_columns(conn, "Signal_")
    missing = _verify_critical_columns(conn)
    assert "Signal_.gate_anchor" not in missing
    # 新库行: 缺省即 ''(DEFAULT 同语义)
    conn.execute("CREATE (s:Signal_ {id:'s-new', evidence:'x'})")
    assert conn.execute("MATCH (s:Signal_ {id:'s-new'}) RETURN s.gate_anchor").get_next()[0] == ""


def test_gate_anchor_migration_on_old_db(tmp_path):
    """旧库(T1-4-2 之前 15 列形态)→ init_schema ALTER 幂等补列, 存量行默认 ''(迁移不阻塞)"""
    conn = kuzu.Connection(kuzu.Database(str(tmp_path / "db")))
    conn.execute(
        "CREATE NODE TABLE IF NOT EXISTS Signal_(id STRING, type STRING, weight DOUBLE DEFAULT 1.0, "
        "status STRING DEFAULT 'open', evidence STRING, ts STRING, ring STRING, eng STRING DEFAULT '', "
        "verify_tries INT64 DEFAULT 0, surface STRING DEFAULT '', boundary STRING DEFAULT '', "
        "content_hash STRING DEFAULT '', source_hash STRING DEFAULT '', evidence_ref STRING DEFAULT '', "
        "PRIMARY KEY(id))")
    conn.execute("CREATE (s:Signal_ {id:'s-old', evidence:'存量散文五标记 WAF=none'})")
    init_schema(conn)  # ALTER 补列
    assert "gate_anchor" in _table_columns(conn, "Signal_")
    assert conn.execute("MATCH (s:Signal_ {id:'s-old'}) RETURN s.gate_anchor").get_next()[0] == ""
    init_schema(conn)  # 旧库上二次 boot: 列已存在, ALTER 抛错被吞(幂等)
    assert conn.execute("MATCH (s:Signal_ {id:'s-old'}) RETURN s.gate_anchor").get_next()[0] == ""


def test_three_place_sync_gate_anchor():
    """三处同步闭环: gate_anchor 同时在 SCHEMA CREATE 与 _CRITICAL_COLUMNS(第三处 ALTER
    由上面两个迁移测试在真库上实证, 此处锁静态清单防复刻漏检)"""
    creates = [q for q in SCHEMA if "Signal_(" in q and q.startswith("CREATE NODE TABLE")]
    assert len(creates) == 1
    assert "gate_anchor STRING DEFAULT ''" in creates[0]
    assert "gate_anchor" in _CRITICAL_COLUMNS["Signal_"]


# ── ② HTTP 层(真实例全链路) ───────────────────────────────────────────────


@pytest.fixture()
def server(tmp_path, monkeypatch):
    from graphd import app as gapp
    monkeypatch.setenv("P2P_TOKEN", "")  # legacy token 门关闭(gd/auth 判定不消费该值)
    # worker 级门(gd/auth.auth_check)无开放回退(fail-closed) — 测试以配 token 的 worker 客户端姿态走全链路
    monkeypatch.setenv("P2P_WORKER_TOKEN", "test-worker-token")
    monkeypatch.delenv("P2P_TOKEN_REQUIRED", raising=False)
    monkeypatch.setattr(gapp, "DB_PATH", str(tmp_path / "kuzu_db"), raising=False)
    monkeypatch.setattr(gapp, "_db", None, raising=False)  # 强制下个请求按测试 DB 重建
    monkeypatch.setattr(gapp, "_D2D_PAUSE_FILE", str(tmp_path / "paused.json"), raising=False)
    monkeypatch.setattr(gapp, "_D2D_PAUSE_DIR", str(tmp_path), raising=False)
    srv = gapp.GraphdHTTPServer(("127.0.0.1", 0), gapp.Handler)
    th = threading.Thread(target=srv.serve_forever, daemon=True)
    th.start()
    yield f"http://127.0.0.1:{srv.server_address[1]}"
    srv.shutdown()


def _post(base, path, payload):
    req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json",
                                          "X-Auth": "test-worker-token"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return r.status, json.loads(r.read())
    except urllib.error.HTTPError as e:
        return e.code, json.loads(e.read())


def _read_signal(base, sid):
    """/query 读侧零改动 — 列随行返回(点查带 {id:..} 锚, 过 worker 只读门)"""
    code, body = _post(base, "/query", {
        "cypher": "MATCH (s:Signal_ {id:$sid}) RETURN s.type AS type, s.evidence AS evidence, "
                  "s.surface AS surface, s.boundary AS boundary, s.gate_anchor AS gate_anchor",
        "params": {"sid": sid}})
    assert code == 200, body
    assert body["count"] == 1, body
    return body["rows"][0]


D1_ANCHOR = json.dumps({"gate_d1": {
    "baseline_req_id": "req-b01", "baseline_diff_req_id": "req-d01",
    "rate_budget": "30 req/min 无429", "waf_marker": "none",
    "noise_marker": "无蜜罐", "evidence": ["baseline#1"], "open_questions": []}}, ensure_ascii=False)

V_ANCHOR = json.dumps({"gate_v": {
    "category_anchor": "ssrf", "baseline_req_id": "req-b02", "diff_req_id": "req-d02",
    "marker_hit": "collab-hit", "evidence": ["finding:f-123"]}}, ensure_ascii=False)


def test_write_valid_d1_anchor_roundtrip(server):
    """/write/signal 接受合法 gate_d1 锚(200)→ /query 原文回读; 散文 evidence 并存不丢"""
    payload = {"id": "s-ga-d1", "type": "protection-profile", "eng": "",
               "evidence": "WAF=无; 速率=30 req/min 无429; 噪声=无蜜罐; 证据=baseline#1; 开放问题=无",
               "gate_anchor": D1_ANCHOR}
    code, body = _post(server, "/write/signal", payload)
    assert code == 200 and body.get("ok") is True, body
    row = _read_signal(server, "s-ga-d1")
    assert row["gate_anchor"] == D1_ANCHOR  # 透传入库, 服务端不改写
    assert row["type"] == "protection-profile"
    assert row["evidence"].startswith("WAF=无")  # 兼容语义①: 散文并存, 回退面保留


def test_write_valid_v_anchor_roundtrip(server):
    """合法 gate_v 锚(verify-result 信号)→ 200 → 回读(同列复用, 消费靠 type 分派)"""
    payload = {"id": "s-ga-v1", "type": "verify-result",
               "evidence": "finding:f-123 verdict:confirmed 依据:响应含 marker",
               "gate_anchor": V_ANCHOR}
    code, body = _post(server, "/write/signal", payload)
    assert code == 200 and body.get("ok") is True, body
    row = _read_signal(server, "s-ga-v1")
    assert row["gate_anchor"] == V_ANCHOR
    assert row["type"] == "verify-result"


def test_invalid_json_anchor_400(server):
    """非空但非法 JSON → 400(防规避, 不软降级), 错误码沿现有惯例"""
    code, body = _post(server, "/write/signal",
                       {"id": "s-bad-1", "gate_anchor": '{"gate_d1": truncated'})
    assert code == 400
    assert "invalid gate_anchor" in body["error"]


def test_too_long_anchor_400(server):
    """超长(>8192 字符)→ 400, 且在 JSON 解析前钳掉"""
    long_anchor = '{"gate_d1":{}, "pad":"' + "a" * 8200 + '"}'
    assert len(long_anchor) > 8192
    code, body = _post(server, "/write/signal",
                       {"id": "s-bad-2", "gate_anchor": long_anchor})
    assert code == 400
    assert "too long" in body["error"]


def test_missing_gate_key_anchor_400(server):
    """合法 JSON object 但缺 gate_d1/gate_v 键 → 400"""
    code, body = _post(server, "/write/signal",
                       {"id": "s-bad-3", "gate_anchor": '{"foo": "bar"}'})
    assert code == 400
    assert "gate_d1 or gate_v" in body["error"]


def test_empty_anchor_treated_as_absent(server):
    """空串锚 = 无锚占位 → 200 且列落 ''(DEFAULT 同语义)"""
    code, body = _post(server, "/write/signal",
                       {"id": "s-empty", "gate_anchor": "  "})
    assert code == 200 and body.get("ok") is True, body
    assert _read_signal(server, "s-empty")["gate_anchor"] == ""


def test_write_without_anchor_legacy_unchanged(server):
    """无 gate_anchor 的旧形态写入零变化: 200, 新列 ''(不随行派生), 既有列逐字段原样"""
    payload = {"id": "s-legacy", "type": "recon", "weight": 2.0, "status": "open",
               "evidence": "旧式散文证据", "ring": "discovery",
               "surface": "request", "boundary": "outer"}
    code, body = _post(server, "/write/signal", payload)
    assert code == 200 and body.get("ok") is True, body
    row = _read_signal(server, "s-legacy")
    assert row["gate_anchor"] == ""
    assert row["type"] == "recon"
    assert row["evidence"] == "旧式散文证据"
    assert row["surface"] == "request"
    assert row["boundary"] == "outer"

#!/usr/bin/env python3
"""8-1: 转态旁路日志 — graphd/gd/transition_log.py 单元 + app.py 三转态入口成功路径接线
+ /write/transition-log 追加通道端到端。

①追加成功/纯追加(写两次首行不变) ②字段完整(恒 8 键) ③transition_id=uuid4 唯一 + UTC ISO
④写失败静默计数不抛(audit.py :52-60 同款语义) ⑤目录自建 0700/文件 0600 ⑥P2P_TRANSITION_LOG
env 调用时实读(缺省 ~/.d2d-data/logs/transition-log.jsonl, audit.py:24-28 逐字镜像)
⑦O_NOFOLLOW ⑧超长截断收敛模块单点 ⑨无 SQL 无出网(Mimosa 约束: 源面锁定)
⑩三入口(/write/transition、/write/experience-transition、/write/frontier-transition)成功路径
经真 HTTP harness(3E/3542/361 同款形态)各触发一行 log; 非法迁移不触发(仅成功路径)
⑪log 写失败降级: 三入口 200 照旧 + 旁路计数(端点语义零影响)
⑫/write/transition-log: host-only 403 / 必填 400 / 追加成功回 transition_id / 写失败如实 500。
既有测试零改动; 本文件为 8-1 新建(按域独立文件, test_injection_sampling.py 同款惯例)。
"""
import json
import os
import stat as _stat
import threading
import uuid
import urllib.request
from datetime import datetime
from pathlib import Path

import kuzu

import graphd.app as graphd_app
from graphd.app import SCHEMA, init_schema
from graphd.gd import transition_log as tlog


# ────────────── 单元: 追加/纯追加/字段/权限/uuid/env/静默/NOFOLLOW ──────────────

def _81_lines(p):
    return [json.loads(l) for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]


_FIELDS = {"transition_id", "node_id", "from_status", "to_status",
           "actor", "reason", "source_batch", "timestamp"}


def test_81_append_success_pure_append_fields_and_modes(tmp_path, monkeypatch):
    """追加成功 + 纯追加(写两次首行字节不变) + 字段完整(恒 8 键, 值与入参同源) +
    目录自建 0700 / 文件 0600(与 audit.log 同级权限红线 — /write/transition 的 reason
    受 denylist 豁免, 文件可能含红线资产字符串)。"""
    log = tmp_path / "logs" / "transition-log.jsonl"   # 父目录不存在 → 模块自建(目录自建)
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(log))
    first = {"node_id": "f-81a", "from_status": "candidate", "to_status": "triaged",
             "actor": "host", "reason": "8-1 probe one", "source_batch": "batch-a"}
    assert tlog.log_transition(first) is True
    raw_after_first = log.read_text(encoding="utf-8")
    assert tlog.log_transition(dict(first, node_id="f-81b", reason="8-1 probe two")) is True
    lines = log.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    assert lines[0] + "\n" == raw_after_first, "纯追加: 第二次写不得改动首行(append-only)"
    r1, r2 = _81_lines(log)
    assert set(r1) == _FIELDS and set(r2) == _FIELDS, "字段完整: 恒 8 键"
    assert (r1["node_id"], r1["from_status"], r1["to_status"]) == ("f-81a", "candidate", "triaged")
    assert (r1["actor"], r1["reason"], r1["source_batch"]) == ("host", "8-1 probe one", "batch-a")
    assert r2["node_id"] == "f-81b" and r2["reason"] == "8-1 probe two"
    # 0600 文件 / 0700 目录(audit73 测试同款断言, tests/test_graphd_gates.py:629-630 先例)
    assert _stat.S_IMODE(os.stat(log).st_mode) == 0o600
    assert _stat.S_IMODE(os.stat(log.parent).st_mode) == 0o700


def test_81_uuid_unique_and_utc_iso_and_passthrough(tmp_path, monkeypatch):
    """transition_id 缺省 uuid4(stdlib)且逐条唯一; timestamp 缺省 UTC ISO; 显式传值原样透传。"""
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(tmp_path / "t.jsonl"))
    assert tlog.log_transition({"node_id": "n1", "from_status": "a", "to_status": "b",
                                "actor": "x", "reason": "r"}) is True
    assert tlog.log_transition({"node_id": "n2", "from_status": "a", "to_status": "b",
                                "actor": "x", "reason": "r"}) is True
    r1, r2 = _81_lines(tmp_path / "t.jsonl")
    u1, u2 = uuid.UUID(r1["transition_id"]), uuid.UUID(r2["transition_id"])  # 非法格式即抛
    assert u1 != u2, "uuid 唯一"
    for r in (r1, r2):
        ts = datetime.fromisoformat(r["timestamp"])  # ISO 可解析
        assert ts.utcoffset() is not None and ts.utcoffset().total_seconds() == 0, "UTC"
    assert tlog.log_transition({"transition_id": "caller-set-id", "timestamp": "2000-01-01T00:00:00+00:00",
                                "node_id": "n3", "from_status": "a", "to_status": "b",
                                "actor": "x", "reason": "r"}) is True
    r3 = _81_lines(tmp_path / "t.jsonl")[2]
    assert r3["transition_id"] == "caller-set-id" and r3["timestamp"] == "2000-01-01T00:00:00+00:00"


def test_81_path_follows_env_read_at_call_time_default_mirrors_audit(tmp_path, monkeypatch):
    """P2P_TRANSITION_LOG env 调用时实读(不 import 时缓存, pytest monkeypatch 逐用例重定向);
    缺省 ~/.d2d-data/logs/transition-log.jsonl(audit.py:24-28 _audit_path 逐字镜像)。"""
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(tmp_path / "x" / "t.jsonl"))
    assert tlog._transition_log_path() == str(tmp_path / "x" / "t.jsonl")
    monkeypatch.delenv("P2P_TRANSITION_LOG", raising=False)
    assert tlog._transition_log_path() == os.path.join(
        os.path.expanduser("~"), ".d2d-data", "logs", "transition-log.jsonl")


def test_81_silent_failure_counts_not_raises(tmp_path, monkeypatch, capsys):
    """写失败静默计数返回 False 恒不抛(audit73 同款: 父路径被既有文件占用 → makedirs 失败);
    stderr 仅一次提示, 后续失败只累计。"""
    blocker = tmp_path / "blocker"
    blocker.write_text("x")
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(blocker / "sub" / "t.jsonl"))
    monkeypatch.setattr(tlog, "_warned", False)  # 测试隔离: 首失败 stderr 提示可见(测试后还原)
    before = tlog._fail_count
    entry = {"node_id": "n", "from_status": "a", "to_status": "b", "actor": "x", "reason": "r"}
    assert tlog.log_transition(entry) is False
    assert tlog.log_transition(entry) is False
    assert tlog._fail_count == before + 2, "静默计数"
    assert not os.path.exists(blocker / "sub")
    err = capsys.readouterr().err
    assert "[transition-log]" in err and "silent" in err, "stderr 仅提示一次"


def test_81_no_follow_symlink(tmp_path, monkeypatch):
    """O_NOFOLLOW: 日志路径被符号链接替换时写失败(静默), 不跟随链接写(audit73 同款)。"""
    real = tmp_path / "victim.txt"
    real.write_text("victim")
    link = tmp_path / "t.jsonl"
    os.symlink(real, link)
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(link))
    before = tlog._fail_count
    assert tlog.log_transition({"node_id": "n", "from_status": "a", "to_status": "b",
                                "actor": "x", "reason": "r"}) is False
    assert tlog._fail_count == before + 1
    assert real.read_text() == "victim", "链接目标未被写入"


def test_81_overlong_truncated_at_module_single_point(tmp_path, monkeypatch):
    """超长截断收敛在模块单点(_MAX): 端点只做必填校验, 截断不走 400(现有端点对可选长值的
    截断惯例 — replay_matrix[:2000]/report_status[:200]/reviewer[:80] 同款)。"""
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(tmp_path / "t.jsonl"))
    assert tlog.log_transition({"node_id": "n" * 500, "from_status": "a" * 99,
                                "to_status": "b" * 99, "actor": "x" * 500,
                                "reason": "r" * 5000, "source_batch": "s" * 999}) is True
    r = _81_lines(tmp_path / "t.jsonl")[0]
    assert (len(r["node_id"]), len(r["from_status"]), len(r["to_status"]),
            len(r["actor"]), len(r["reason"]), len(r["source_batch"])) == (200, 64, 64, 80, 2000, 200)


def test_81_module_no_sql_no_network():
    """Mimosa 约束锁定: transition_log 为纯本地 JSONL 追加 — import 面仅 stdlib 本地四件
    (json/os/sys/threading/uuid/datetime), 无 SQL 客户端(kuzu)、无出网(socket/urllib/requests/
    http.client/subprocess), 亦无任何 .execute( 调用面。"""
    src = Path(tlog.__file__).read_text(encoding="utf-8")
    for banned in ("import kuzu", "import socket", "import urllib", "import requests",
                   "import http", "import httpx", "import subprocess",
                   ".execute(", "conn.execute", "urlopen"):
        assert banned not in src, f"transition_log 源面不得出现: {banned}"
    _imported = {n.split(".")[0] for n in
                 (m.strip().split()[1] for m in src.splitlines()
                  if m.startswith("import ") or m.startswith("from "))}
    assert _imported <= {"json", "os", "sys", "threading", "uuid", "datetime"}, _imported


# ────────────── 端点级: 三转态入口成功路径接线(真 HTTP harness, 3E/3542/361 同款) ──────────────

def _81_spawn_server(tmp_path, monkeypatch):
    """8-1 端点专用 harness: GraphdHTTPServer 随机端口 + 全新 tmp kuzu 库(SCHEMA+init_schema,
    与真实启动路径同款), host+worker 双 token, 预置 candidate Finding / quarantined Experience /
    proposed Frontier 各一枚(三转态入口共用)。P2P_TRANSITION_LOG 与 P2P_AUDIT_LOG 均重定向
    tmp(旁路日志不落真实用户目录)。返回 (base_url, conn, srv, tlog_path)。"""
    for var in ("P2P_TOKEN", "P2P_TOKEN_REQUIRED", "P2P_OPEN_RANGE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("P2P_HOST_TOKEN", "t-81-host")
    monkeypatch.setenv("P2P_WORKER_TOKEN", "t-81-worker")
    tlog_path = tmp_path / "logs" / "transition-log.jsonl"
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(tlog_path))
    monkeypatch.setenv("P2P_AUDIT_LOG", str(tmp_path / "logs" / "audit.log"))
    monkeypatch.setattr(graphd_app, "_D2D_PAUSE_FILE", str(tmp_path / "paused.json"))
    dbp = tmp_path / "kuzu_db"
    db = kuzu.Database(str(dbp))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    init_schema(conn)
    conn.execute("CREATE (f:Finding {id:'f-81', title:'8-1 transition probe', severity:'low', ts:'t'})")
    conn.execute("CREATE (x:Experience {id:'exp-81', eng_id:'eng-81', title:'t', content:'c', "
                 "status:'quarantined', provenance_hash:'ph'})")
    conn.execute("CREATE (x:Frontier {id:'fr-81', eng_id:'eng-81', direction:'d', evidence:'ev', "
                 "proposed_by:'w-81', status:'proposed'})")
    monkeypatch.setattr(graphd_app, "DB_PATH", str(dbp))
    monkeypatch.setattr(graphd_app, "_db", db)
    srv = graphd_app.GraphdHTTPServer(("127.0.0.1", 0), graphd_app.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{srv.server_address[1]}", conn, srv, tlog_path


def _81_post(base_url, path, payload, token="t-81-host"):
    """POST JSON; token 缺省 host(三转态端点均 host-only); 4xx/5xx 经 HTTPError 取回 (code, body)。"""
    headers = {"Content-Type": "application/json"}
    if token:
        headers["X-Auth"] = token
    req = urllib.request.Request(base_url + path, data=json.dumps(payload).encode(), headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.load(resp)
    except urllib.request.HTTPError as e:
        return e.code, json.load(e)


def test_81_write_transition_success_wires_log(tmp_path, monkeypatch):
    """入口① /write/transition: 成功转态 200(响应键零改动) + 旁路日志恰一行(8 字段齐,
    from/to/actor/reason/source_batch 与请求同源); 非法迁移 400 不产生行(仅成功路径接线)。"""
    base_url, conn, srv, tlog_path = _81_spawn_server(tmp_path, monkeypatch)
    try:
        status, out = _81_post(base_url, "/write/transition",
                               {"id": "f-81", "to": "triaged", "actor": "host-81",
                                "reason": "8-1 wire probe", "source_batch": "batch-81"})
        assert status == 200 and out["ok"] is True, out
        assert set(out) == {"ok", "from", "to", "last_transition"}, "响应键零改动"
        # 非法迁移: 拒绝且不留行(接线仅在成功路径)
        status, out = _81_post(base_url, "/write/transition",
                               {"id": "f-81", "to": "bogus", "actor": "host-81", "reason": "illegal"})
        assert status == 400 and out["ok"] is False, out
    finally:
        srv.shutdown()
        srv.server_close()
    lines = _81_lines(tlog_path)
    assert len(lines) == 1, "恰一行: 非法迁移不留行"
    r = lines[0]
    assert set(r) == _FIELDS
    assert (r["node_id"], r["from_status"], r["to_status"]) == ("f-81", "candidate", "triaged")
    assert (r["actor"], r["reason"], r["source_batch"]) == ("host-81", "8-1 wire probe", "batch-81")
    uuid.UUID(r["transition_id"]) and r["timestamp"]  # uuid 可解析 + ts 在场(格式已由单元锁)


def test_81_experience_transition_success_wires_log(tmp_path, monkeypatch):
    """入口② /write/experience-transition: quarantined→active 200 + status 落图 + 旁路日志恰一行
    (actor=reviewer, reason=reviewer_note, source_batch 透传)。"""
    base_url, conn, srv, tlog_path = _81_spawn_server(tmp_path, monkeypatch)
    try:
        status, out = _81_post(base_url, "/write/experience-transition",
                               {"experience_id": "exp-81", "target_status": "active",
                                "reviewer": "rev-81", "reviewer_note": "8-1 auto-review",
                                "source_batch": "batch-exp"})
        assert status == 200 and out["ok"] is True, out
        assert str(conn.execute("MATCH (x:Experience {id:'exp-81'}) RETURN x.status")
                   .get_next()[0]) == "active", "转态本体照常落图"
    finally:
        srv.shutdown()
        srv.server_close()
    lines = _81_lines(tlog_path)
    assert len(lines) == 1
    r = lines[0]
    assert set(r) == _FIELDS
    assert (r["node_id"], r["from_status"], r["to_status"]) == ("exp-81", "quarantined", "active")
    assert (r["actor"], r["reason"], r["source_batch"]) == ("rev-81", "8-1 auto-review", "batch-exp")


def test_81_frontier_transition_success_wires_log(tmp_path, monkeypatch):
    """入口③ /write/frontier-transition: proposed→accepted 200 + status 落图 + 旁路日志恰一行
    (actor=reviewer, reason=review_note)。"""
    base_url, conn, srv, tlog_path = _81_spawn_server(tmp_path, monkeypatch)
    try:
        status, out = _81_post(base_url, "/write/frontier-transition",
                               {"frontier_id": "fr-81", "target_status": "accepted",
                                "reviewer": "rev-81", "review_note": "8-1 review pass",
                                "source_batch": "batch-fr"})
        assert status == 200 and out["ok"] is True, out
        assert str(conn.execute("MATCH (x:Frontier {id:'fr-81'}) RETURN x.status")
                   .get_next()[0]) == "accepted", "转态本体照常落图"
    finally:
        srv.shutdown()
        srv.server_close()
    lines = _81_lines(tlog_path)
    assert len(lines) == 1
    r = lines[0]
    assert set(r) == _FIELDS
    assert (r["node_id"], r["from_status"], r["to_status"]) == ("fr-81", "proposed", "accepted")
    assert (r["actor"], r["reason"], r["source_batch"]) == ("rev-81", "8-1 review pass", "batch-fr")


def test_81_log_write_failure_degrades_all_three_entries_still_200(tmp_path, monkeypatch):
    """拍板语义: log 写失败绝不影响转态成功响应 — 三入口在日志路径不可写(父路径被文件占用)
    时仍 200 且转态本体落图; 旁路静默计数累计, 日志文件不存在。"""
    blocker = tmp_path / "blocker"
    blocker.write_text("x")
    base_url, conn, srv, _ = _81_spawn_server(tmp_path, monkeypatch)
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(blocker / "sub" / "t.jsonl"))  # spawn 后改指不可写路径
    before = tlog._fail_count
    try:
        s1, o1 = _81_post(base_url, "/write/transition",
                          {"id": "f-81", "to": "triaged", "actor": "host-81", "reason": "degrade ①"})
        s2, o2 = _81_post(base_url, "/write/experience-transition",
                          {"experience_id": "exp-81", "target_status": "active",
                           "reviewer": "rev-81", "reviewer_note": "degrade ②"})
        s3, o3 = _81_post(base_url, "/write/frontier-transition",
                          {"frontier_id": "fr-81", "target_status": "accepted",
                           "reviewer": "rev-81", "review_note": "degrade ③"})
        assert (s1, s2, s3) == (200, 200, 200), (o1, o2, o3)
        assert str(conn.execute("MATCH (f:Finding {id:'f-81'}) RETURN f.gate_status")
                   .get_next()[0]) == "triaged"
        assert str(conn.execute("MATCH (x:Experience {id:'exp-81'}) RETURN x.status")
                   .get_next()[0]) == "active"
        assert str(conn.execute("MATCH (x:Frontier {id:'fr-81'}) RETURN x.status")
                   .get_next()[0]) == "accepted"
    finally:
        srv.shutdown()
        srv.server_close()
    assert tlog._fail_count == before + 3, "三次失败均静默计数"
    assert not (blocker / "sub").exists()


# ────────────── 端点级: /write/transition-log 追加通道 ──────────────

def test_81_transition_log_endpoint_host_only_required_fields(tmp_path, monkeypatch):
    """/write/transition-log: host-only(worker token 403); node_id/from_status/to_status/actor/
    reason 必填(缺失 400, 现有端点 400 惯例); 写成功 200 回 transition_id。"""
    base_url, conn, srv, tlog_path = _81_spawn_server(tmp_path, monkeypatch)
    try:
        status, out = _81_post(base_url, "/write/transition-log",
                               {"node_id": "n", "from_status": "a", "to_status": "b",
                                "actor": "x", "reason": "r"}, token="t-81-worker")
        assert status == 403 and out["ok"] is False, out
        base = {"node_id": "n", "from_status": "a", "to_status": "b", "actor": "x", "reason": "r"}
        for drop in ("node_id", "from_status", "to_status", "actor", "reason"):
            payload = {k: v for k, v in base.items() if k != drop}
            status, out = _81_post(base_url, "/write/transition-log", payload)
            assert status == 400 and out["ok"] is False and drop in out["error"], (drop, out)
        status, out = _81_post(base_url, "/write/transition-log", dict(base, source_batch="sb-9"))
        assert status == 200 and out["ok"] is True, out
        uuid.UUID(str(out["transition_id"]))
    finally:
        srv.shutdown()
        srv.server_close()
    lines = _81_lines(tlog_path)
    assert len(lines) == 1, "失败请求不留行, 仅成功 POST 落一行"
    r = lines[0]
    assert set(r) == _FIELDS and r["source_batch"] == "sb-9"
    assert r["transition_id"] == str(out["transition_id"]), "响应回显即落盘 transition_id"


def test_81_transition_log_endpoint_append_only_and_write_failure_500(tmp_path, monkeypatch):
    """/write/transition-log: 连续 POST 纯追加(首行不变); 日志路径不可写时如实 500
    (本端点业务即落盘, 不假成功), 不抛不挂。"""
    base_url, conn, srv, tlog_path = _81_spawn_server(tmp_path, monkeypatch)
    try:
        p1 = {"node_id": "n-1", "from_status": "a", "to_status": "b", "actor": "x", "reason": "one"}
        s1, o1 = _81_post(base_url, "/write/transition-log", p1)
        raw_after_first = tlog_path.read_text(encoding="utf-8")
        s2, o2 = _81_post(base_url, "/write/transition-log", dict(p1, node_id="n-2", reason="two"))
        assert (s1, s2) == (200, 200)
        lines = tlog_path.read_text(encoding="utf-8").splitlines()
        assert len(lines) == 2 and lines[0] + "\n" == raw_after_first, "纯追加: 首行不变"
        assert o1["transition_id"] != o2["transition_id"]
        # 写失败 → 500 如实上报(降级导入缺失同款: _transition_log_fn=None 亦 500, 不假成功)
        blocker = tmp_path / "blocker2"
        blocker.write_text("x")
        monkeypatch.setenv("P2P_TRANSITION_LOG", str(blocker / "sub" / "t.jsonl"))
        s3, o3 = _81_post(base_url, "/write/transition-log", dict(p1, node_id="n-3"))
        assert s3 == 500 and o3["ok"] is False and "transition-log" in o3["error"], o3
    finally:
        srv.shutdown()
        srv.server_close()

#!/usr/bin/env python3
"""8-2: 审计降级告警 — audit fail-silent → 显式告警 + /health 回显。

①status() 纯读访问器(available/write_failures/first_error 三键, 零副作用恒不抛)
②写失败计数与首错摘要入 status; stderr 仅一次语义零回归(audit.py :52-60 既有 except 语义)
③audit 正常时 /health 无 audit_degraded 字段(健康面零噪音)
④写失败计数>0 时 /health 回显 audit_degraded(经真实 auth-fail 触发)
⑤audit 模块损坏(导入失败模拟: _audit_mod=None)时 /health 回显导入级原因
⑥真实导入失败路径(子进程: 双 fallback 全断)stderr 告警一次含异常摘要 + 业务不崩
⑦业务调用不受降级影响: _audit_mod=None 时 403/200 照旧, _audit_event 纯 no-op。
既有测试零改动; 本文件为 8-2 新建(按域独立文件惯例)。
"""
import json
import os
import subprocess
import sys
import threading
import urllib.request
from pathlib import Path

import kuzu

import graphd.app as graphd_app
import graphd.audit as gaudit
from graphd.app import SCHEMA, init_schema

HERE = Path(__file__).resolve().parent
REPO = HERE.parent


def _82_lines(p):
    return [json.loads(l) for l in Path(p).read_text(encoding="utf-8").splitlines() if l.strip()]


# ────────────── 单元: status() 访问器 + 写路径语义零回归 ──────────────

def test_82_status_accessor_pure_read_three_keys():
    """status() 恒返回三键 dict: available=True(能被调用即证明模块已导入)/write_failures int/
    first_error str; 纯读 —— 连续两次调用不改变状态。"""
    st1 = gaudit.status()
    assert set(st1) == {"available", "write_failures", "first_error"}, st1
    assert st1["available"] is True
    assert isinstance(st1["write_failures"], int)
    assert isinstance(st1["first_error"], str)
    st2 = gaudit.status()
    assert st1 == st2, "纯读: status() 不得有副作用"


def test_82_status_tracks_failures_and_stderr_once_semantics(tmp_path, monkeypatch, capsys):
    """写失败 → status 计数 +1 且 first_error 记录首错摘要; 既有语义零回归:
    audit_event 恒不抛返回 False、stderr 仅一次、后续失败只累计不覆盖首错。"""
    blocker = tmp_path / "blocker"
    blocker.write_text("x")  # 父路径被文件占用 → makedirs 必失败
    monkeypatch.setenv("P2P_AUDIT_LOG", str(blocker / "sub" / "audit.log"))
    monkeypatch.setattr(gaudit, "_warned", False)      # 测试隔离(stderr 首次提示可见)
    monkeypatch.setattr(gaudit, "_first_error", "")    # 测试隔离(首错断言确定化)
    before = gaudit.status()["write_failures"]
    assert gaudit.audit_event("transition-illegal", {"cur": "candidate"}) is False  # 恒不抛
    assert gaudit.audit_event("auth-fail", {"path": "/x"}) is False
    st = gaudit.status()
    assert st["write_failures"] == before + 2, "静默计数累计"
    assert st["first_error"] and "Exception" in st["first_error"] or "Error" in st["first_error"], \
        "首错摘要须含异常类型名"
    err = capsys.readouterr().err
    assert err.count("[audit]") == 1, "stderr 仅一次(既有语义零回归)"
    assert not os.path.exists(blocker / "sub")


def test_82_success_write_returns_true_and_status_clean(tmp_path, monkeypatch):
    """成功写 → True + JSONL 落行; status available 恒 True, 计数不变(成功不计失败)。"""
    log = tmp_path / "logs" / "audit.log"
    monkeypatch.setenv("P2P_AUDIT_LOG", str(log))
    before = gaudit.status()["write_failures"]
    assert gaudit.audit_event("denylist-hit", {"asset": "probe.example.com"}) is True
    assert len(_82_lines(log)) == 1
    st = gaudit.status()
    assert st["available"] is True and st["write_failures"] == before


# ────────────── 端点级: /health 回显(真 HTTP harness) ──────────────

def _82_spawn_server(tmp_path, monkeypatch):
    """8-2 端点 harness(3C/3E/8-1 同款形态): host+worker 双 token(P2P_TOKEN 恒不设 ——
    保证错误 token 能穿过 legacy 门抵达 _auth 触发 auth-fail 审计), 全新 tmp kuzu 库,
    预置 candidate Finding; P2P_AUDIT_LOG/P2P_TRANSITION_LOG 重定向 tmp。"""
    for var in ("P2P_TOKEN", "P2P_TOKEN_REQUIRED", "P2P_OPEN_RANGE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("P2P_HOST_TOKEN", "t-82-host")
    monkeypatch.setenv("P2P_WORKER_TOKEN", "t-82-worker")
    monkeypatch.setenv("P2P_AUDIT_LOG", str(tmp_path / "logs" / "audit.log"))
    monkeypatch.setenv("P2P_TRANSITION_LOG", str(tmp_path / "logs" / "transition-log.jsonl"))
    monkeypatch.setattr(graphd_app, "_D2D_PAUSE_FILE", str(tmp_path / "paused.json"))
    dbp = tmp_path / "kuzu_db"
    db = kuzu.Database(str(dbp))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    init_schema(conn)
    conn.execute("CREATE (f:Finding {id:'f-82', title:'8-2 health probe', severity:'low', ts:'t'})")
    monkeypatch.setattr(graphd_app, "DB_PATH", str(dbp))
    monkeypatch.setattr(graphd_app, "_db", db)
    srv = graphd_app.GraphdHTTPServer(("127.0.0.1", 0), graphd_app.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    return f"http://127.0.0.1:{srv.server_address[1]}", conn, srv


def _82_get_health(base_url):
    with urllib.request.urlopen(base_url + "/health", timeout=10) as resp:
        return resp.status, json.load(resp)


def _82_post(base_url, path, payload, token):
    req = urllib.request.Request(base_url + path, data=json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json", "X-Auth": token})
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return resp.status, json.load(resp)
    except urllib.request.HTTPError as e:
        return e.code, json.load(e)


def test_82_health_clean_when_audit_healthy(tmp_path, monkeypatch):
    """audit 正常(模块已导入且写失败计数为 0)时 /health 不含 audit_degraded 字段(健康面
    零噪音); 基础键(ok/version/pid/started_at)与 schema_degraded 既有形态零改动。
    (_fail_count 是进程级累计全局 —— 隔离清零, 测试后由 monkeypatch 还原真值。)"""
    monkeypatch.setattr(gaudit, "_fail_count", 0)
    monkeypatch.setattr(gaudit, "_first_error", "")
    monkeypatch.setattr(graphd_app, "_audit_import_error", "")  # 导入级健康(隔离同进程早前测试)
    base_url, conn, srv = _82_spawn_server(tmp_path, monkeypatch)
    try:
        status, out = _82_get_health(base_url)
        assert status == 200 and out["ok"] is True, out
        for k in ("version", "pid", "started_at"):
            assert k in out, out
        assert "audit_degraded" not in out, "健康时不得新增字段"
        assert "schema_degraded" not in out, "既有条件键形态零改动(健康 schema 不回显)"
    finally:
        srv.shutdown()
        srv.server_close()


def test_82_health_echoes_write_failures_after_real_auth_fail(tmp_path, monkeypatch):
    """写级降级回显: 日志路径不可写时, 真实 auth-fail(worker token 打 host-only 端点 →
    _auth('host') 失败审计)写失败计数 +1 → /health 出现 audit_degraded{import:'',
    write_failures=+1, first_error 非空}; 端点响应本身仍 403(审计降级不影响业务)。"""
    base_url, conn, srv = _82_spawn_server(tmp_path, monkeypatch)
    blocker = tmp_path / "blocker"
    blocker.write_text("x")
    monkeypatch.setenv("P2P_AUDIT_LOG", str(blocker / "sub" / "audit.log"))  # spawn 后指向不可写路径
    before = gaudit.status()["write_failures"]
    try:
        status, out = _82_post(base_url, "/write/transition",
                               {"id": "f-82", "to": "triaged", "actor": "x", "reason": "r"},
                               token="t-82-worker")
        assert status == 403 and out["ok"] is False, out  # 鉴权语义不受审计故障影响
        status, out = _82_get_health(base_url)
        assert status == 200, out
        assert "audit_degraded" in out, "写失败计数>0 必须回显"
        deg = out["audit_degraded"]
        assert set(deg) == {"import", "write_failures", "first_error"}, deg
        assert deg["import"] == "", "导入级健康 → import 键空串"
        assert deg["write_failures"] == before + 1, deg
        assert deg["first_error"], "首错摘要必须在场"
    finally:
        srv.shutdown()
        srv.server_close()


def test_82_health_echoes_import_degradation_when_module_none(tmp_path, monkeypatch):
    """导入级降级回显(损坏模拟): _audit_mod=None + 降级原因 → /health 回显
    audit_degraded{import:<原因>, write_failures:0, first_error:''}。"""
    monkeypatch.setattr(graphd_app, "_audit_mod", None)
    monkeypatch.setattr(graphd_app, "_audit_import_error", "simulated: audit module corrupted")
    base_url, conn, srv = _82_spawn_server(tmp_path, monkeypatch)
    try:
        status, out = _82_get_health(base_url)
        assert status == 200 and out["ok"] is True, out
        assert "audit_degraded" in out, out
        deg = out["audit_degraded"]
        assert deg["import"] == "simulated: audit module corrupted", deg
        assert deg["write_failures"] == 0 and deg["first_error"] == "", deg
    finally:
        srv.shutdown()
        srv.server_close()


def test_82_import_failure_real_path_alerts_once_and_survives(tmp_path):
    """真实导入失败路径(子进程端到端): 双 fallback 全断(包内形态 sys.modules 投毒 + 扁平
    形态 cwd 内损坏 audit.py)→ import graphd.app 不崩(业务不崩), _audit_mod is None,
    stderr 告警一次且含两路异常摘要。"""
    broken = tmp_path / "audit.py"
    broken.write_text("raise RuntimeError('boom-82 flat audit corrupted')\n")
    code = (
        "import sys;"
        "sys.modules['graphd.audit'] = None;"  # 断形态①: 包内 from graphd import audit
        "import graphd.app as a;"              # 形态②: cwd 损坏 audit.py(PYTHONPATH 提供包)
        "assert a._audit_mod is None, 'expected degraded import';"
        "assert a._audit_import_error, 'reason must be recorded';"
        "print('MARK82_DEGRADED_IMPORT_OK')"
    )
    env = dict(os.environ, PYTHONPATH=str(REPO))
    r = subprocess.run([sys.executable, "-c", code], cwd=tmp_path, env=env,
                       capture_output=True, text=True, timeout=120)
    assert r.returncode == 0, f"业务不得崩: {r.stderr[-800:]}"
    assert "MARK82_DEGRADED_IMPORT_OK" in r.stdout, r.stdout
    assert "[audit]" in r.stderr and "degraded" in r.stderr, r.stderr[-800:]
    assert "boom-82 flat audit corrupted" in r.stderr, "告警须含扁平形态异常摘要"
    assert "graphd.audit" in r.stderr or "graphd/audit" in r.stderr, "告警须含包内形态摘要"


def test_82_business_unaffected_when_audit_degraded(tmp_path, monkeypatch):
    """止损线: _audit_mod=None(纯 no-op)时业务路径照常 —— 错误 token 仍 403、合法 host
    转态仍 200 且落图; _audit_event 不抛不拖; 审计日志文件零写入。"""
    base_url, conn, srv = _82_spawn_server(tmp_path, monkeypatch)
    audit_log = tmp_path / "logs" / "audit.log"
    monkeypatch.setattr(graphd_app, "_audit_mod", None)  # 损坏模拟: 降级为纯 no-op
    try:
        status, out = _82_post(base_url, "/write/transition",
                               {"id": "f-82", "to": "triaged", "actor": "x", "reason": "r"},
                               token="t-82-worker")
        assert status == 403, "鉴权判定不受降级影响"
        status, out = _82_post(base_url, "/write/transition",
                               {"id": "f-82", "to": "triaged", "actor": "host-82",
                                "reason": "8-2 business probe"}, token="t-82-host")
        assert status == 200 and out["ok"] is True, out
        assert str(conn.execute("MATCH (f:Finding {id:'f-82'}) RETURN f.gate_status")
                   .get_next()[0]) == "triaged", "转态本体照常落图"
    finally:
        srv.shutdown()
        srv.server_close()
    graphd_app._audit_event("auth-fail", {"path": "/probe"})  # 直接调用: no-op 恒不抛
    assert not audit_log.exists(), "降级态零审计写入(no-op)"

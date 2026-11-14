"""E38(1.7.0 P2) 双图锚点——写端点+锚点边锁回归。新文件零改存量。
锚: reArtex 双图语义移植(探索面 Finding/Task ↔ 资产面 Asset 互查);
写面= /write/anchors (host-only 幂等, 双端引用缺一 404 fail-closed);
fixture= test_graphd_gates_m1.py 存量同款形态重写(存量文件零改动)。"""
import json
import threading
import urllib.request

import pytest

from graphd.app import kuzu  # noqa: E402 — E39-B1-3 kuzu 退役: 引擎单一化(from graphd.app 同源, LBD-1b 先例; importorskip("kuzu") 随 kuzu 退役移除)

from graphd import app as graphd_app  # noqa: E402
from graphd.gd.schema import SCHEMA, NODE_TABLES  # noqa: E402


@pytest.fixture()
def anchor_server(tmp_path, monkeypatch):
    for var in ("P2P_TOKEN", "P2P_HOST_TOKEN", "P2P_TOKEN_REQUIRED", "P2P_OPEN_RANGE"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("P2P_HOST_TOKEN", "t-anchor-host")
    monkeypatch.setenv("P2P_WORKER_TOKEN", "t-anchor-host")  # 双 token 同值=生产形态近似(同 M1 fixture 口径)
    monkeypatch.setattr(graphd_app, "_D2D_PAUSE_FILE", str(tmp_path / "paused.json"))
    dbp = tmp_path / "kuzu_db"
    db = kuzu.Database(str(dbp))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    init = None
    from graphd.gd.schema import init_schema as _init
    _init(conn)
    conn.execute("CREATE (e:Engagement {name:'e-anchor', target:'t', scope:'probe.example.com', "
                 "auth:'a', status:'active', created_at:'c'})")
    conn.execute("CREATE (ep:Endpoint {id:'ep-anchor', url:'https://probe.example.com/', param:'', "
                 "method:'GET', tech:'', business_chain:'', eng:'e-anchor'})")
    conn.execute("CREATE (f:Finding {id:'f-anchor', title:'anchor finding', severity:'medium', "
                 "gate_status:'verified', ts:'t', eng:'e-anchor'})")
    conn.execute("CREATE (tk:Task {id:'tk-anchor', eng:'e-anchor', kind:'probe', payload:'{}', "
                 "priority:1.0, created_at:'c'})")
    conn.execute("CREATE (a:Asset {id:'a-anchor', kind:'target', identifier:'https://probe.example.com'})")
    monkeypatch.setattr(graphd_app, "DB_PATH", str(dbp))
    monkeypatch.setattr(graphd_app, "_db", db)
    srv = graphd_app.GraphdHTTPServer(("127.0.0.1", 0), graphd_app.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"

    def post(path, payload, token="t-anchor-host"):
        req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json", "X-Auth": token})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.load(resp)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)

    yield base, conn, post
    srv.shutdown()


# ── schema 加性面 ────────────────────────────────────────────────────────────────

def test_anchor_edges_in_schema_and_node_tables_untouched():
    ddl = " | ".join(SCHEMA)
    assert "CREATE REL TABLE IF NOT EXISTS FINDING_ON(FROM Finding TO Asset)" in ddl
    assert "CREATE REL TABLE IF NOT EXISTS TOUCHED(FROM Task TO Asset)" in ddl
    # 纯加性护栏: 锚点边只增不改——既有节点表清单(12 表)与边集合原样保留
    assert "Asset" in NODE_TABLES and "Finding" in NODE_TABLES and "Task" in NODE_TABLES
    assert "Verification" in NODE_TABLES


# ── /write/anchors 集成 ─────────────────────────────────────────────────────────

def test_write_anchor_finding_on_and_reverse_query(anchor_server):
    _base, conn, post = anchor_server
    st, out = post("/write/anchors", {"anchor": "finding", "from_ref": "f-anchor", "asset_id": "a-anchor"})
    assert st == 200 and out["ok"] and out["created"] is True and out["edge"] == "FINDING_ON", out
    # 反查: 资产反查被哪些发现测过(双图锚点的核心查询形态)
    n = conn.execute("MATCH (f:Finding)-[:FINDING_ON]->(a:Asset {id:'a-anchor'}) "
                     "RETURN f.id, f.severity")
    fid, sev = n.get_next()
    assert (fid, sev) == ("f-anchor", "medium")


def test_write_anchor_touched_and_reverse_query(anchor_server):
    _base, conn, post = anchor_server
    st, out = post("/write/anchors", {"anchor": "task", "from_ref": "tk-anchor", "asset_id": "a-anchor"})
    assert st == 200 and out["ok"] and out["edge"] == "TOUCHED", out
    n = conn.execute("MATCH (t:Task)-[:TOUCHED]->(a:Asset {id:'a-anchor'}) RETURN count(t)")
    assert n.get_next()[0] == 1


def test_write_anchor_idempotent_repost_no_new_edge(anchor_server):
    _base, conn, post = anchor_server
    payload = {"anchor": "finding", "from_ref": "f-anchor", "asset_id": "a-anchor"}
    post("/write/anchors", payload)
    st2, out2 = post("/write/anchors", payload)
    assert st2 == 200 and out2["created"] is False, "重放幂等(既有边零新建)"
    cnt = conn.execute("MATCH (:Finding {id:'f-anchor'})-[:FINDING_ON]->(:Asset) RETURN count(*)").get_next()[0]
    assert cnt == 1


def test_write_anchor_missing_endpoints_failclosed(anchor_server):
    _base, _conn, post = anchor_server
    st, out = post("/write/anchors", {"anchor": "finding", "from_ref": "f-ghost", "asset_id": "a-anchor"})
    assert st == 404 and "不存在" in out["error"], "发现端缺失=拒(fail-closed)"
    st2, out2 = post("/write/anchors", {"anchor": "finding", "from_ref": "f-anchor", "asset_id": "a-ghost"})
    assert st2 == 404 and "不存在" in out2["error"], "资产端缺失=拒(fail-closed)"


def test_write_anchor_invalid_kind_and_missing_refs(anchor_server):
    _base, _conn, post = anchor_server
    st, _ = post("/write/anchors", {"anchor": "hypothesis", "from_ref": "x", "asset_id": "a-anchor"})
    assert st == 400, "非法锚点类型拒"
    st2, _ = post("/write/anchors", {"anchor": "finding", "from_ref": "", "asset_id": "a-anchor"})
    assert st2 == 400, "双端引用缺一拒"


def test_write_anchor_requires_host_token(anchor_server, monkeypatch):
    _base, _conn, post = anchor_server
    monkeypatch.setenv("P2P_WORKER_TOKEN", "t-worker-only")
    st, _out = post("/write/anchors", {"anchor": "finding", "from_ref": "f-anchor", "asset_id": "a-anchor"},
                    token="t-worker-only")
    assert st == 403, "worker token 必须被拒(host-only 契约——锚点写面归裁决层)"

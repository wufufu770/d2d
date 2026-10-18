"""E28(R-25 M1) 资产图三写端点+事件去重门锁回归——新文件零改存量。
锚: 设计 docs/asset-graph-design-r25.md §四/§五 M1 验收线("test_graphd_gates.py 429+新增
全绿; 防线零绕过审计"); 去重门=graphd/gd/gates.py verification_duplicate_reject(唯一新纯
函数); fixture=存量 _3c_spawn_server 同款形态重写(存量文件零改动)。"""
import json
import threading
import urllib.request

import pytest

kuzu = pytest.importorskip("kuzu")

from graphd import app as graphd_app  # noqa: E402
from graphd.gd.gates import verification_duplicate_reject  # noqa: E402
from graphd.gd.schema import SCHEMA, init_schema  # noqa: E402


# ── 去重门纯函数（gates.py 族同款锁回归形态）─────────────────────────────────

def test_dedup_gate_rejects_same_run_kind_ref():
    assert verification_duplicate_reject("r1", "repro", "f-1", "", ["r1|repro|f-1"]) is True


def test_dedup_gate_allows_different_ref_or_run():
    assert verification_duplicate_reject("r1", "repro", "f-1", "", ["r1|repro|f-2"]) is False
    assert verification_duplicate_reject("r2", "repro", "f-1", "", ["r1|repro|f-1"]) is False
    assert verification_duplicate_reject("r1", "race", "f-1", "", ["r1|repro|f-1"]) is False


def test_dedup_gate_hypothesis_ref_and_missing_key_failclosed():
    assert verification_duplicate_reject("r1", "advisor-verdict", "", "h-1", ["r1|advisor-verdict|h-1"]) is True
    # run/kind 缺失=键不可构造 → fail-closed 拒重
    assert verification_duplicate_reject("", "repro", "f-1", "", []) is True
    assert verification_duplicate_reject("r1", "", "f-1", "", []) is True


# ── 三写端点集成（真实 Handler + tmp 库, 存量 fixture 同款形态）────────────────

@pytest.fixture()
def m1_server(tmp_path, monkeypatch):
    for var in ("P2P_TOKEN", "P2P_HOST_TOKEN", "P2P_TOKEN_REQUIRED", "P2P_OPEN_RANGE"):
        monkeypatch.delenv(var, raising=False)
    # 双 token 同值=真实生产形态近似: WRAP-3 gap 12 前置块对非白名单 /write/* 先做
    # worker 级"有凭据"判定(auth_check worker 级覆盖 host/worker 双 token), 路由内再
    # _auth("host") 判角色——X-Auth 单头须同时过两道, 生产 host token 双配置同源。
    monkeypatch.setenv("P2P_HOST_TOKEN", "t-m1-host")
    monkeypatch.setenv("P2P_WORKER_TOKEN", "t-m1-host")
    monkeypatch.setattr(graphd_app, "_D2D_PAUSE_FILE", str(tmp_path / "paused.json"))
    dbp = tmp_path / "kuzu_db"
    db = kuzu.Database(str(dbp))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    init_schema(conn)
    conn.execute("CREATE (e:Engagement {name:'e-m1', target:'t', scope:'probe.example.com', "
                 "auth:'a', status:'active', created_at:'c'})")
    conn.execute("CREATE (ep:Endpoint {id:'ep-m1', url:'https://probe.example.com/', param:'', "
                 "method:'GET', tech:'', business_chain:'', eng:'e-m1'})")
    conn.execute("CREATE (f:Finding {id:'f-m1', title:'M1 anchor finding', severity:'medium', "
                 "gate_status:'verified', ts:'t', eng:'e-m1'})")
    monkeypatch.setattr(graphd_app, "DB_PATH", str(dbp))
    monkeypatch.setattr(graphd_app, "_db", db)
    srv = graphd_app.GraphdHTTPServer(("127.0.0.1", 0), graphd_app.Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_address[1]}"

    def post(path, payload, token="t-m1-host"):
        req = urllib.request.Request(base + path, data=json.dumps(payload).encode(),
                                     headers={"Content-Type": "application/json", "X-Auth": token})
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                return resp.status, json.load(resp)
        except urllib.error.HTTPError as e:
            return e.code, json.load(e)
        finally:
            pass

    yield base, conn, post
    srv.shutdown()


def test_write_asset_upsert_and_hosts_edge(m1_server):
    _base, conn, post = m1_server
    st, out = post("/write/asset", {"id": "a-m1", "kind": "target",
                                    "identifier": "https://probe.example.com",
                                    "endpoint_url": "https://probe.example.com/"})
    assert st == 200 and out["ok"] and out["created"] is True and out["hosts_edge"] == 1, out
    n = conn.execute("MATCH (a:Asset)-[:HOSTS]->(e:Endpoint {id:'ep-m1'}) RETURN count(a)")
    assert n.get_next()[0] == 1
    # 幂等 upsert: 同 id 再写=更新非新建（first_seen 保持, last_seen 刷新）
    st2, out2 = post("/write/asset", {"id": "a-m1", "kind": "target", "status": "tarpit",
                                      "identifier": "https://probe.example.com"})
    assert st2 == 200 and out2["created"] is False
    cnt = conn.execute("MATCH (a:Asset {id:'a-m1'}) RETURN count(a)").get_next()[0]
    assert cnt == 1
    stt = conn.execute("MATCH (a:Asset {id:'a-m1'}) RETURN a.status").get_next()[0]
    assert stt == "tarpit"


def test_write_env_snapshot_dual_level_and_snapshot_edge(m1_server):
    _base, conn, post = m1_server
    post("/write/asset", {"id": "a-m1", "identifier": "https://probe.example.com"})
    payload = {"asset_id": "a-m1", "ecc_level_raw": "likely", "ecc_level_cal": "suspicious",
               "signals": json.dumps([{"kind": "homogeneous-response", "confidence": "low"}]),
               "fingerprint": json.dumps([{"path": "/", "status": 200, "hash": "ee4500"}])}
    st, out = post("/write/env-snapshot", payload)
    assert st == 200 and out["ok"], out
    n = conn.execute("MATCH (:Asset {id:'a-m1'})-[:SNAPSHOT]->(s:EnvSnapshot) "
                     "RETURN s.ecc_level_raw, s.ecc_level_cal")
    raw, cal = n.get_next()
    assert (raw, cal) == ("likely", "suspicious"), "双判级字段必须与对账表双记一一对应"
    # 非法判级拒
    st_bad, _ = post("/write/env-snapshot", {"asset_id": "a-m1", "ecc_level_raw": "high"})
    assert st_bad == 400
    # asset_id 必填
    st_miss, _ = post("/write/env-snapshot", {"checked_at": "t"})
    assert st_miss == 400


def test_write_verification_append_only_and_dedup(m1_server):
    _base, conn, post = m1_server
    payload = {"kind": "repro", "verdict": "pass", "run_id": "run-m1", "finding_ref": "f-m1",
               "latency_ms": 1234}
    st, out = post("/write/verification", payload)
    assert st == 200 and out["ok"] and out["duplicate"] is False, out
    n = conn.execute("MATCH (:Finding {id:'f-m1'})-[:VERIFIED_BY]->(v:Verification {run_id:'run-m1'}) "
                     "RETURN v.verdict, v.latency_ms")
    verdict, lat = n.get_next()
    assert verdict == "pass" and lat == 1234
    # 去重门: 同 run+kind+引用重放 → 200 duplicate=true, 零新行（append-only 幂等）
    st2, out2 = post("/write/verification", payload)
    assert st2 == 200 and out2["duplicate"] is True, out2
    cnt = conn.execute("MATCH (v:Verification {run_id:'run-m1'}) RETURN count(v)").get_next()[0]
    assert cnt == 1, "重放必须零新行"
    # 假设引用形态（hypothesis_ref 单独成事件——键不同不拒）
    st3, out3 = post("/write/verification", {"kind": "advisor-verdict", "verdict": "held-unreviewed",
                                             "run_id": "run-m1", "hypothesis_ref": "h-m1"})
    assert st3 == 200 and out3["duplicate"] is False
    m = conn.execute("MATCH (:Hypothesis)-[:JUDGED_BY]->(:Verification) RETURN count(*)")
    assert m.get_next()[0] == 0  # 无 Hypothesis 节点时边不建, 事件点仍落（引用容错）


def test_write_verification_requires_host_token(m1_server, monkeypatch):
    _base, _conn, post = m1_server
    # 双 token 值临时分离: worker 级前置过(worker 值匹配) → 路由内 host 级角色判定 403
    # (已认证者的授权失败不构成 oracle——WRAP-3 gap 12 语义)。
    monkeypatch.setenv("P2P_WORKER_TOKEN", "t-worker-only")
    st, _out = post("/write/verification", {"kind": "repro", "verdict": "pass", "run_id": "r",
                                            "finding_ref": "f-m1"}, token="t-worker-only")
    assert st == 403, "worker token 必须被拒（host-only 契约——worker 零写权维持）"

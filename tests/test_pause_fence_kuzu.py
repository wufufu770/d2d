"""临时 Kuzu 0.11.3 执行生产 Cypher 字面量，不启动 graphd/目标服务。"""
import importlib.util
import json
from pathlib import Path
import re
import pytest
import kuzu

ROOT = Path(__file__).resolve().parents[1]
_spec = importlib.util.spec_from_file_location("pause_fence_kuzu", ROOT / "graphd/gd/pause_fence.py")
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
pause_applies = _module.pause_applies


def production_query(file, *parts):
    queries = re.findall(r"`([^`]+)`", (ROOT / file).read_text(encoding="utf-8"))
    found = [q for q in queries if all(part in q for part in parts)]
    assert len(found) == 1, (file, parts, len(found))
    return found[0]


def rows(conn, cypher, **params):
    result = conn.execute(cypher, parameters=params)
    out = []
    while result.has_next():
        out.append(list(result.get_next()))
    return out


@pytest.fixture
def conn(tmp_path):
    database = kuzu.Database(str(tmp_path / "db"), buffer_pool_size=32 * 1024 * 1024)
    connection = kuzu.Connection(database)
    for ddl in [
        "CREATE NODE TABLE Engagement(name STRING, status STRING, cancel STRING, leased_by STRING, lease_at INT64, PRIMARY KEY(name))",
        "CREATE NODE TABLE Task(id STRING, eng STRING, status STRING, claimed_by STRING, PRIMARY KEY(id))",
        "CREATE NODE TABLE AgentIdentity(worker_id STRING, eng STRING, lease_id STRING, status STRING, checkpoint STRING, todo STRING, updated_at STRING, exit_class STRING, PRIMARY KEY(worker_id))",
    ]:
        connection.execute(ddl)
    connection.execute("CREATE (:Engagement {name:'eng-test',status:'active',cancel:'false',leased_by:'A',lease_at:10})")
    connection.execute("CREATE (:Task {id:'task-A',eng:'eng-test',status:'claimed',claimed_by:'worker-A'})")
    connection.execute("CREATE (:AgentIdentity {worker_id:'worker-A',eng:'eng-test',lease_id:'turn-A',status:'running'})")
    yield connection
    connection.close()
    database.close()


def snapshot(conn):
    return rows(conn, "MATCH (e:Engagement {name:'eng-test'}) RETURN e.status,e.cancel,e.leased_by,e.lease_at")[0]


LIFECYCLE = "plugin/pentest-dsh/scheduler/lifecycle-ops.mjs"
SCHEDULER = "plugin/pentest-dsh/scheduler.js"


def test_real_freeze_cas_and_late_pause_generation(conn):
    query = production_query(LIFECYCLE, "SET e.status='frozen'", "e.lease_at=$pauseAt")
    assert rows(conn, query, n="eng-test", self="B", pauseAt=100) == []
    assert snapshot(conn) == ["active", "false", "A", 10]
    assert rows(conn, query, n="eng-test", self="A", pauseAt=100) == [["eng-test", 100]]
    pause = {"v": 2, "paused": True, "by": "A", "lease_at": 100}
    assert pause_applies(pause, snapshot(conn))
    conn.execute("MATCH (e:Engagement {name:'eng-test'}) SET e.status='active',e.cancel='false',e.leased_by='B',e.lease_at=101")
    assert not pause_applies(pause, snapshot(conn))
    assert not pause_applies({"paused": True, "by": "A"}, snapshot(conn))
    assert not pause_applies({"paused": True}, snapshot(conn))
    assert rows(conn, query, n="eng-test", self="A", pauseAt=102) == []
    assert snapshot(conn) == ["active", "false", "B", 101]


def test_real_server_pause_loader_uses_temporary_connection(conn, tmp_path, monkeypatch):
    from graphd import app
    monkeypatch.setattr(app, "_D2D_PAUSE_DIR", str(tmp_path))
    file = tmp_path / "paused-eng-test.json"
    pause = {"v": 2, "paused": True, "eng": "eng-test", "by": "A", "lease_at": 100}
    query = production_query(LIFECYCLE, "SET e.status='frozen'", "e.lease_at=$pauseAt")
    rows(conn, query, n="eng-test", self="A", pauseAt=100)
    file.write_text(json.dumps(pause), encoding="utf-8")
    assert app._eng_paused("eng-test", conn)
    conn.execute("MATCH (e:Engagement {name:'eng-test'}) SET e.status='active',e.cancel='false',e.leased_by='B',e.lease_at=101")
    # A 的文件恰在 B 接管后迟写，真实 loader 对真实 Kuzu 结果忽略它。
    file.write_text(json.dumps(pause), encoding="utf-8")
    assert not app._eng_paused("eng-test", conn)
    file.write_text(json.dumps({"paused": True, "by": "A"}), encoding="utf-8")
    assert not app._eng_paused("eng-test", conn)
    conn.execute("MATCH (e:Engagement {name:'eng-test'}) SET e.status='frozen',e.cancel='true',e.leased_by='',e.lease_at=100")
    pause["eng"] = "different-eng"
    file.write_text(json.dumps(pause), encoding="utf-8")
    assert not app._eng_paused("eng-test", conn)


def test_real_start_rollback_rejects_new_owner(conn):
    query = production_query(LIFECYCLE, "WHERE e.leased_by=$self", "SET e.status=$st")
    assert rows(conn, query, n="eng-test", self="B", st="frozen", pauseAt=100) == []
    assert rows(conn, query, n="eng-test", self="A", st="frozen", pauseAt=100) == [["eng-test", 100]]
    assert snapshot(conn) == ["frozen", "true", "", 100]


def test_real_deadline_fence_cannot_overwrite_takeover(conn):
    query = production_query(LIFECYCLE, "WHERE e.status='frozen'", "e.lease_at=$pauseAt", "SET e.status=$o")
    assert rows(conn, query, n="eng-test", o="completed", pauseAt=100) == []
    conn.execute("MATCH (e:Engagement {name:'eng-test'}) SET e.status='frozen',e.cancel='true',e.leased_by='',e.lease_at=100")
    assert rows(conn, query, n="eng-test", o="completed", pauseAt=100) == [["eng-test"]]
    conn.execute("MATCH (e:Engagement {name:'eng-test'}) SET e.status='active',e.cancel='false',e.leased_by='B',e.lease_at=101")
    assert rows(conn, query, n="eng-test", o="exhausted", pauseAt=100) == []
    assert snapshot(conn) == ["active", "false", "B", 101]


def test_real_worker_and_task_owner_cas_is_atomic(conn):
    agent = production_query(SCHEDULER, "leased_by:$self", "SET a.status=$s")
    params = {"eng": "eng-test", "self": "B", "w": "worker-A", "l": "turn-A", "s": "done", "cp": "result", "td": "", "t": "now", "ec": "ok"}
    assert rows(conn, agent, **params) == []
    params["self"] = "A"
    assert rows(conn, agent, **params) == [["turn-A"]]
    task = production_query(SCHEDULER, "leased_by:$self", "SET t.status=$st")
    rows(conn, task, eng="eng-test", self="B", id="task-A", w="worker-A", st="done")
    assert rows(conn, "MATCH (t:Task {id:'task-A'}) RETURN t.status") == [["claimed"]]
    rows(conn, task, eng="eng-test", self="A", id="task-A", w="wrong-worker", st="done")
    assert rows(conn, "MATCH (t:Task {id:'task-A'}) RETURN t.status") == [["claimed"]]
    rows(conn, task, eng="eng-test", self="A", id="task-A", w="worker-A", st="done")
    assert rows(conn, "MATCH (t:Task {id:'task-A'}) RETURN t.status") == [["done"]]


def test_real_crash_and_recovery_queries_keep_owner_fence(conn):
    agent = production_query(SCHEDULER, "leased_by:$self", "SET a.status='error'")
    assert rows(conn, agent, eng="eng-test", self="B", w="worker-A", l="turn-A", t="now", ec="crash") == []
    assert rows(conn, agent, eng="eng-test", self="A", w="worker-A", l="wrong-turn", t="now", ec="crash") == []
    assert rows(conn, agent, eng="eng-test", self="A", w="worker-A", l="turn-A", t="now", ec="crash") == [["turn-A"]]
    task = production_query(LIFECYCLE, "leased_by:$self", "SET t.status='pending'")
    rows(conn, task, n="eng-test", self="B")
    assert rows(conn, "MATCH (t:Task {id:'task-A'}) RETURN t.status,t.claimed_by") == [["claimed", "worker-A"]]
    rows(conn, task, n="eng-test", self="A")
    assert rows(conn, "MATCH (t:Task {id:'task-A'}) RETURN t.status,t.claimed_by") == [["pending", ""]]

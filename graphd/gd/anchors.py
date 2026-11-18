# gd/anchors.py — E40-D2 锚点写面拆分(/write/anchors, 逐字搬移自 app.py)
# 调用形态: handle_anchors(self, req, d) — self=app.Handler, d=依赖命名空间
# (app.py 装配: _locked/db/kuzu/_audit_event)。依赖注入规避双模块实例陷阱(见 queries_read.py 头注)。
try:
    from graphd.gd.queries import _jsonify  # noqa: F401 — 预留(本块当前无 _jsonify 消费, 保留导入面)
except Exception:
    from gd.queries import _jsonify  # noqa: F401


def handle_anchors(self, req, d):
    # E38(1.7.0 P2): 双图锚点写面(host-only 裁决面同 verification 口径) — 探索面实体
    # (Finding/Task)↔资产面(Asset)锚点边。幂等(既有边零新建, created:false); 端点引用
    # 双缺失 404(fail-closed — 锚点必须挂在真实节点上); 零 UPDATE 零 DELETE。
    if not self._auth("host"):
        return self._send(403, {"ok": False, "error": "anchors write requires host token"})
    _a_kind = str(req.get("anchor") or "").strip().lower()
    _a_from = str(req.get("from_ref") or "").strip()[:120]
    _a_asset = str(req.get("asset_id") or "").strip()[:120]
    if _a_kind not in ("finding", "task"):
        return self._send(400, {"ok": False, "error": "invalid anchor (finding|task)"})
    if not _a_from or not _a_asset:
        return self._send(400, {"ok": False, "error": "from_ref and asset_id required (锚点双端)"})
    _edge = "FINDING_ON" if _a_kind == "finding" else "TOUCHED"
    _node = "Finding" if _a_kind == "finding" else "Task"
    _a_note = str(req.get("note") or "").strip()[:200]
    with d._locked():
        try:
            conn = d.kuzu.Connection(d.db())
            _exists = conn.execute(
                f"MATCH (x:{_node} {{id:$f}})-[:{_edge}]->(a:Asset {{id:$a}}) RETURN count(x)",
                parameters={"f": _a_from, "a": _a_asset})
            if _exists.get_next()[0] > 0:
                self._send(200, {"ok": True, "created": False, "edge": _edge})
                return
            _missing = conn.execute(
                f"MATCH (x:{_node} {{id:$f}}) RETURN count(x)", parameters={"f": _a_from})
            if _missing.get_next()[0] == 0:
                return self._send(404, {"ok": False, "error": f"{_node} {_a_from} 不存在 — 锚点拒绝挂空(fail-closed)"})
            _missing_a = conn.execute(
                "MATCH (a:Asset {id:$a}) RETURN count(a)", parameters={"a": _a_asset})
            if _missing_a.get_next()[0] == 0:
                return self._send(404, {"ok": False, "error": f"Asset {_a_asset} 不存在 — 锚点拒绝挂空(fail-closed)"})
            conn.execute(
                f"MATCH (x:{_node} {{id:$f}}), (a:Asset {{id:$a}}) CREATE (x)-[:{_edge}]->(a)",
                parameters={"f": _a_from, "a": _a_asset})
            self._send(200, {"ok": True, "created": True, "edge": _edge, "note": _a_note})
            d._audit_event("anchors-write", {"edge": _edge, "from": _a_from, "asset": _a_asset})
        except Exception as e:
            self._send(500, {"ok": False, "error": f"anchors write failed: {str(e)[:200]}"})
    return

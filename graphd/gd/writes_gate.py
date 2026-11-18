# gd/writes_gate.py — E46-D2b 门控写面拆分(/write/dual-sign-transition + /write/frontier-transition,
# 逐字搬移自 app.py; 调用形态 handle_xxx(self, req, d) — self=app.Handler, d=依赖命名空间
# (_locked/db/kuzu/_audit_event/_log_transition/sys)。依赖注入规避双模块实例陷阱(queries_read.py
# 头注先例)。gates 纯函数双分支导入(graphd.* / gd.* 两形态)。既有校验链零删改: 函数体逐字搬移,
# 仅作用域替换(_locked→d._locked / kuzu→d.kuzu / db()→d.db() / _audit_event→d._audit_event /
# _log_transition→d._log_transition); gates 纯函数/DUAL_SIGN_STATES 双分支导入直用。
import sys
from datetime import datetime, timezone

try:
    from graphd.gd.gates import DUAL_SIGN_STATES, dual_sign_transition_gate, frontier_transition_gate, frontier_ref_backfill, frontier_utility_components
except Exception:
    from gd.gates import DUAL_SIGN_STATES, dual_sign_transition_gate, frontier_transition_gate, frontier_ref_backfill, frontier_utility_components


def handle_dual_sign_transition(self, req, d):
    # ---- T4-3-3(8-2): /write/dual-sign-transition —— Finding.dual_sign 状态机收编端点(host-only)。
    # scheduler 11 处 SET f.dual_sign 直写簿记收编至此(迁移表白名单=11 处实测全边集,
    # dual_sign_transition_gate 纯函数为真源, :382/:390 等调用点话术/runLog/审计逐字保留)。
    # 独立早退路由(experience-consensus 先例同款); 认证 host(_auth("host"), worker token 403);
    # 共享门自动生效(Content-Length 门/legacy token/R6 denylist 红线扫描 — path 以 /write/ 开头)。
    # 载荷 {id, to}: to=pending 走 0917 H7 CAS 语义(锁内读 cur, 仅 ''/NULL 可写; cur 已是
    # pending=并发入口已占 → 200+claimed:false 不算错误, 与旧条件写零命中等价); 其余 to 表判定,
    # 非法迁移 409(signed/disputed 真终态不可迁; blocked→pending 解冻边 0915 B1 先例合法);
    # finding 缺失 404(对齐旧簿记: MATCH 不命中=无写入)。
    if not self._auth("host"):
        return self._send(403, {"ok": False, "error": "dual sign transition requires host token"})
    fid = str(req.get("id") or "").strip()
    to = str(req.get("to") or "").strip()
    if not fid:
        return self._send(400, {"ok": False, "error": "id required"})
    if to not in DUAL_SIGN_STATES:  # to 形态预检: 越枚举 400(表外状态名)
        return self._send(400, {"ok": False,
                                "error": f"invalid dual_sign target: to must be one of {list(DUAL_SIGN_STATES)}"})
    with d._locked():  # V-11: 锁带 5s deadline(读 cur→门判定→SET 与转态端点同一锁窗口口径)
        try:
            conn = d.kuzu.Connection(d.db())
            r = conn.execute("MATCH (f:Finding {id:$id}) RETURN f.dual_sign", parameters={"id": fid})
            if not r.has_next():
                return self._send(404, {"ok": False, "error": "finding not found"})
            cur = r.get_next()[0]
            cur = "" if cur is None else str(cur)
            ok, reason = dual_sign_transition_gate(cur, to)
            if not ok:
                if to == "pending" and cur == "pending":
                    # 0917 H7 CAS 零命中等价: 已被并发入口占走 — 不算错误, claimed=false
                    return self._send(200, {"ok": True, "id": fid, "to": to, "claimed": False})
                return self._send(409, {"ok": False, "error": f"dual-sign transition rejected: {reason}",
                                        "from": cur})
            conn.execute("MATCH (f:Finding {id:$id}) SET f.dual_sign=$to",
                         parameters={"id": fid, "to": to})
        except TimeoutError as _te:
            return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
        except Exception as e:
            return self._send(500, {"ok": False, "error": str(e)[:200]})
    d._audit_event("dual-sign-transition", {"id": fid, "from": cur, "to": to})
    return self._send(200, {"ok": True, "id": fid, "to": to, "claimed": True})


def handle_frontier_transition(self, req, d):
    # ---- 3.6-1-4(前沿子系统 C): /write/frontier-transition —— Frontier 评审转态通道(host-only)。
    # 合法迁移表与 review_note 必填校验收敛在 gates.frontier_transition_gate 纯函数(单测真源):
    # 仅 proposed→accepted / proposed→rejected / accepted→explored 三条, 其余拒绝。
    # 转态写 Frontier.status + reviewed_at + review_note; 轨迹经 d._audit_event('frontier-transition');
    # 非法迁移记 'frontier-transition-illegal'; 闭环回填三参(ref backfill + utility_effective,
    # 3.6-4 段 C)逐字保留; 写失败降级 stderr 响亮留痕转态未发生必须如实回 500。
    if not self._auth("host"):
        return self._send(403, {"ok": False, "error": "frontier transitions require host token"})
    xid = str(req.get("frontier_id") or "").strip()
    to = str(req.get("target_status") or "").strip().lower()
    if not xid:
        return self._send(400, {"ok": False, "error": "frontier_id required"})
    if not to:
        return self._send(400, {"ok": False, "error": "target_status required (proposed|accepted|rejected|explored)"})
    # ---- 3.6-4 段 C(C-1 反馈闭环回填): 可选参数 — 转态端点带参(审计①拍板的最小侵入方案)。
    # 转态本体零改动, 三参均缺省时行为与既有调用逐字节等价; 显式传参才回填闭环锚点列。
    _ref_hyp = str(req.get("accepted_to_hypothesis_ref") or "").strip()
    _rej_h, _rej_h_reason, _ref_hyp = frontier_ref_backfill(_ref_hyp)
    if _rej_h:
        return self._send(400, {"ok": False, "error": f"accepted_to_hypothesis_ref: {_rej_h_reason}"})
    _ref_fnd = str(req.get("hypothesis_to_confirmed_ref") or "").strip()
    _rej_f, _rej_f_reason, _ref_fnd = frontier_ref_backfill(_ref_fnd)
    if _rej_f:
        return self._send(400, {"ok": False, "error": f"hypothesis_to_confirmed_ref: {_rej_f_reason}"})
    _util_eff = None
    if "utility_effective" in req:
        _ue = req.get("utility_effective")
        if not isinstance(_ue, bool):
            return self._send(400, {"ok": False, "error": "utility_effective must be a boolean"})
        _util_eff = _ue
    with d._locked():  # V-11: 锁带 5s deadline(读旧态→门判定→写新态同一锁窗口, /write/transition 同款)
        try:
            conn = d.kuzu.Connection(d.db())
            # 3.6-4 段 C: 读旧态同时取既有 value_components(utility 合并基线 — 既有键原样保留,
            # 仅置 utility 键); 无回填参数的既有调用多取一列零行为差。
            r = conn.execute("MATCH (x:Frontier {id:$id}) RETURN x.status, x.value_components",
                             parameters={"id": xid})
            if not r.has_next():
                return self._send(404, {"ok": False, "error": "frontier not found"})
            _frow = r.get_next()
            cur = str(_frow[0] or "proposed")
            _cur_vc = str(_frow[1] or "") if len(_frow) > 1 else ""
            ok, err = frontier_transition_gate(cur, to, req.get("review_note"))
            if not ok:
                # #73: 非法迁移审计(转态拒绝动作可追溯: id/cur/to/reviewer)
                d._audit_event("frontier-transition-illegal",
                               {"id": xid, "cur": cur, "to": to,
                                "reviewer": str(req.get("reviewer") or "")[:80], "err": err})
                return self._send(400, {"ok": False, "error": err})
            # utility 适用性预检(写状态前拒绝 — 零半程状态): 效用结论只在探索结束时产生
            if _util_eff is not None and to != "explored":
                return self._send(400, {"ok": False, "error": "utility_effective 仅在 accepted→explored 转态生效(探索结束才有效用结论)"})
            # 锚点存在性终检(服务端不信自报 — 假 ref 会污染转化率度量; refs 终检同款哲学)
            if _ref_hyp:
                _ex = conn.execute("MATCH (h:Hypothesis {id:$id}) RETURN h.id LIMIT 1",
                                   parameters={"id": _ref_hyp})
                if not _ex.has_next():
                    d._audit_event("frontier-ref-reject",
                                   {"id": xid, "field": "accepted_to_hypothesis_ref",
                                    "ref": _ref_hyp[:80]})
                    return self._send(400, {"ok": False, "error": f"accepted_to_hypothesis_ref {_ref_hyp[:60]} 不存在(Hypothesis 表无此 id)"})
            if _ref_fnd:
                _ex = conn.execute("MATCH (f:Finding {id:$id}) RETURN f.id LIMIT 1",
                                   parameters={"id": _ref_fnd})
                if not _ex.has_next():
                    d._audit_event("frontier-ref-reject",
                                   {"id": xid, "field": "hypothesis_to_confirmed_ref",
                                    "ref": _ref_fnd[:80]})
                    return self._send(400, {"ok": False, "error": f"hypothesis_to_confirmed_ref {_ref_fnd[:60]} 不存在(Finding 表无此 id)"})
            # 全参数绑定($id/$to/$ts/$note); 其他列零触碰(eng_id/direction/evidence/
            # proposed_by/created_at 不动 — 评审只产出裁决, 不改提案本体)。
            _ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute("MATCH (x:Frontier {id:$id}) SET x.status=$to, "
                         "x.reviewed_at=timestamp($ts), x.review_note=$note",
                         parameters={"id": xid, "to": to, "ts": _ts,
                                     "note": str(req.get("review_note") or "").strip()})
            # 3.6-4 段 C: 闭环回填(与转态写同一 d._locked() 窗口; 列级失败降级 stderr 不阻塞
            # 转态本体 — report_status 降级先例; 列由 schema 三处同步+ALTER 迁移保证)。
            _bf_err = []
            if _ref_hyp:
                try:
                    conn.execute("MATCH (x:Frontier {id:$id}) SET x.accepted_to_hypothesis_ref=$r",
                                 parameters={"id": xid, "r": _ref_hyp})
                except Exception as _be:
                    _bf_err.append(f"a2h: {type(_be).__name__}")
            if _ref_fnd:
                try:
                    conn.execute("MATCH (x:Frontier {id:$id}) SET x.hypothesis_to_confirmed_ref=$r",
                                 parameters={"id": xid, "r": _ref_fnd})
                except Exception as _be:
                    _bf_err.append(f"h2c: {type(_be).__name__}")
            if _util_eff is not None:
                try:
                    conn.execute("MATCH (x:Frontier {id:$id}) SET x.value_components=$vc",
                                 parameters={"id": xid,
                                             "vc": frontier_utility_components(_cur_vc, _util_eff)})
                except Exception as _be:
                    _bf_err.append(f"utility: {type(_be).__name__}")
            if _bf_err:
                print(f"[frontier] closure backfill degraded ({xid}): {'; '.join(_bf_err)}",
                      file=sys.stderr, flush=True)
        except TimeoutError as _te:
            return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
        except Exception as e:
            # 写失败降级: stderr 响亮留痕不阻塞服务(同 [transition] report_status 降级先例),
            # 转态未发生必须如实回 500 — 绝不假成功。
            print(f"[frontier] transition write failed (degraded): {type(e).__name__} {str(e)[:160]}",
                  file=sys.stderr, flush=True)
            return self._send(500, {"ok": False, "error": str(e)[:200]})
    # 成功转态审计(+3.6-4 段 C 追加键: 闭环锚点与效用 — 仅显式传参时出现, 既有审计键零改动);
    # 8-1: 转态旁路日志(锁外追加; log_transition 内部自吞异常静默计数 — 写失败绝不影响 200)。
    d._audit_event("frontier-transition",
                   {"id": xid, "from": cur, "to": to,
                    "reviewer": str(req.get("reviewer") or "host")[:80],
                    "reason": str(req.get("review_note") or ""),
                    "ts": datetime.now(timezone.utc).isoformat(),
                    **({"accepted_to_hypothesis_ref": _ref_hyp} if _ref_hyp else {}),
                    **({"hypothesis_to_confirmed_ref": _ref_fnd} if _ref_fnd else {}),
                    **({"utility_effective": _util_eff} if _util_eff is not None else {})})
    d._log_transition({"node_id": xid, "from_status": cur, "to_status": to,
                       "actor": str(req.get("reviewer") or "host"),
                       "reason": str(req.get("review_note") or ""),
                       "source_batch": str(req.get("source_batch") or "")})
    return self._send(200, {"ok": True, "id": xid, "from": cur, "to": to,
                            **({"accepted_to_hypothesis_ref": _ref_hyp} if _ref_hyp else {}),
                            **({"hypothesis_to_confirmed_ref": _ref_fnd} if _ref_fnd else {}),
                            **({"utility_effective": _util_eff} if _util_eff is not None else {})})

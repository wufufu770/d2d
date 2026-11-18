# gd/queries_read.py — E40-D2 读面拆分(/query、/query/experience、/query/frontier)
# 纯代码搬移自 app.py _do_post_impl 三个路由块, 逻辑零改动。调用形态:
#   handle_query(self, req, d) — self=app.Handler(用 _send/_auth/_headers/_peer),
#   d=依赖命名空间(app.py 装配: _locked/db/kuzu/_d2d_paused/_audit_event/WORKER_MUTATION_RE)。
# 依赖注入而非 import app — 规避脚本/包双形态下的双模块实例陷阱(cd graphd && python3 app.py
# 时 app.py 是 __main__ 不可二次 import)。gd 内纯函数(gates/queries/schema)照常双形态导入。
try:
    from graphd.gd.queries import MAX_QUERY_ROWS, _jsonify, bounded_rows
    from graphd.gd.gates import (WORKER_MUTATION_RE, engagement_cap_gate,
                                 engagement_merge_existing_key, host_query_gate,
                                 is_engagement_create, worker_query_allowed)
except Exception:  # 直接脚本运行(cd graphd && python3 app.py)
    from gd.queries import MAX_QUERY_ROWS, _jsonify, bounded_rows
    from gd.gates import (WORKER_MUTATION_RE, engagement_cap_gate,
                          engagement_merge_existing_key, host_query_gate,
                          is_engagement_create, worker_query_allowed)


def handle_query_experience(self, req, d):
    """/query/experience — 逐字搬移(原 :2265-2315)。"""
    if not self._auth("worker"):
        return self._send(401, {"ok": False, "error": "unauthorized: X-Auth (worker/host) token required"})
    # status: 缺省只返回 active(写入即隔离 — quarantined/deprecated 默认不入池);
    # 显式传值则精确过滤(蒸馏/评审管道可显式拉 quarantined 复核, 数据层不设枚举白名单)。
    _st = str(req.get("status") or "active").strip().lower() or "active"
    # scope: 精确匹配(拍板 — 选「精确匹配」而非前缀: 经验 scope 是条目级归标签,
    # 前缀语义在数据层引入隐式泛化, 留给调用方自行决定); 空值=不按 scope 过滤
    # (($scope='' OR e.scope=$scope) 同 :699 Hypothesis eng 过滤的仓内先例形态)。
    _scope = str(req.get("scope") or "").strip()
    # min_utility_score: 缺省 0.3(EvolveR 剪枝阈值); 非法回退缺省(cvss_or_default 同哲学),
    # NaN 归一缺省(NaN 比较恒 False 会让过滤静默清空)。
    try:
        _minu = float(req.get("min_utility_score"))
    except (TypeError, ValueError):
        _minu = 0.3
    if _minu != _minu:
        _minu = 0.3
    # limit: 缺省 10, 钳位 [1, MAX_QUERY_ROWS](沿 /query 行上限约束); 参数化 LIMIT($lim
    # 绑定, kuzu 0.11 现场实证支持) + bounded_rows 双保险。
    try:
        _lim = int(req.get("limit") or 10)
    except (TypeError, ValueError):
        _lim = 10
    _lim = max(1, min(_lim, MAX_QUERY_ROWS))
    # 排序: utility_score DESC, 平局按 created_at DESC 次级(新经验优先, 拍板记录)。
    _cy = ("MATCH (x:Experience) WHERE x.status = $st AND x.utility_score >= $minu "
           "AND ($scope = '' OR x.scope = $scope) "
           "RETURN x.id AS id, x.eng_id AS eng_id, x.category AS category, x.scope AS scope, "
           "x.title AS title, x.content AS content, x.evidence_ref AS evidence_ref, "
           "x.utility_score AS utility_score, x.retrieval_count AS retrieval_count, "
           "x.success_count AS success_count, x.created_at AS created_at, "
           "x.last_used_at AS last_used_at, x.status AS status, x.provenance_hash AS provenance_hash, "
           # T4-3-2: 读侧回传 +2 列(漏列=静默旧形态, 测试锁定 —— 细化: 共识消费方经此通道取值)
           "x.reasoning_path AS reasoning_path, x.consensus_status AS consensus_status "
           "ORDER BY x.utility_score DESC, x.created_at DESC LIMIT $lim")
    _params = {"st": _st, "minu": _minu, "scope": _scope, "lim": _lim}
    with d._locked():  # V-11: 锁带 5s deadline
        try:
            conn = d.kuzu.Connection(d.db())
            res = conn.execute(_cy, _params)
            # H13 同款: 行数上限封顶消费(超限停拉 + truncated 标记)
            rows, _trunc = bounded_rows(res, limit=_lim)
            cols = res.get_column_names()
            data = [{cols[i]: _jsonify(r[i]) for i in range(len(cols))} for r in rows]
        except TimeoutError as _te:
            return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
        except Exception as e:
            return self._send(400, {"ok": False, "error": str(e)[:200]})
    return self._send(200, {"ok": True, "experiences": data,
                            "count": len(data), "truncated": _trunc})


def handle_query_frontier(self, req, d):
    """/query/frontier — 逐字搬移(原 :2316-2364, 含 GW-2 host-only 门)。"""
    # GW-2 (gap #2): 路由升 host-only —— worker 级挂载下 eng_id 可选+缺省全态
    # = worker token 可拉全项目提案池(direction/evidence/review_note 跨项目明文)。
    # 生产消费方普查(gatewarden 方案卡 #2): frontier-review/closure 与面板 raw cypher
    # 全部持 host token; worker 侧生产调用方零——worker 读本 eng 提案走 raw /query +
    # WHERE(FULLSCAN 闭集已含 Frontier, GW-2 gap #1 同批收口)。
    if not self._auth("host"):
        return self._send(401, {"ok": False, "error": "unauthorized: X-Auth host token required (/query/frontier is host-only since GW-2)"})
    # status: 缺省 ''(不过滤 — 全态返回, 理由见上方拍板留痕); 显式传值则精确过滤。
    _st = str(req.get("status") or "").strip().lower()
    # eng_id: 精确匹配(空值=不过滤, ($eng='' OR ...) 同 /query/experience scope 过滤的
    # 仓内先例形态 — 共享黑板跨项目隔离由调用方按需收窄)。
    _eng = str(req.get("eng_id") or "").strip()
    # limit: 缺省 20, 钳位 [1, MAX_QUERY_ROWS](沿 /query 行上限约束); 参数化 LIMIT($lim)
    # 绑定(kuzu 0.11 现场实证) + bounded_rows 双保险。
    try:
        _lim = int(req.get("limit") or 20)
    except (TypeError, ValueError):
        _lim = 20
    _lim = max(1, min(_lim, MAX_QUERY_ROWS))
    # 排序: created_at DESC(新提案优先 — 评审消费最前沿输入)。
    _cy = ("MATCH (x:Frontier) WHERE ($eng = '' OR x.eng_id = $eng) AND ($st = '' OR x.status = $st) "
           "RETURN x.id AS id, x.eng_id AS eng_id, x.direction AS direction, x.evidence AS evidence, "
           "x.proposed_by AS proposed_by, x.status AS status, x.review_note AS review_note, "
           "x.created_at AS created_at, x.reviewed_at AS reviewed_at "
           "ORDER BY x.created_at DESC LIMIT $lim")
    _params = {"eng": _eng, "st": _st, "lim": _lim}
    with d._locked():  # V-11: 锁带 5s deadline
        try:
            conn = d.kuzu.Connection(d.db())
            res = conn.execute(_cy, _params)
            # H13 同款: 行数上限封顶消费(超限停拉 + truncated 标记)
            rows, _trunc = bounded_rows(res, limit=_lim)
            cols = res.get_column_names()
            data = [{cols[i]: _jsonify(r[i]) for i in range(len(cols))} for r in rows]
        except TimeoutError as _te:
            return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
        except Exception as e:
            return self._send(400, {"ok": False, "error": str(e)[:200]})
    return self._send(200, {"ok": True, "frontiers": data,
                            "count": len(data), "truncated": _trunc})


def handle_query(self, req, d):
    """/query — 逐字搬移(原 :2365-2440; worker 只读白名单/host CALL 禁令/容量栅栏原子窗)。"""
    cypher = req.get("cypher", "").strip()
    params = req.get("params") or {}
    if not cypher:
        return self._send(400, {"error": "empty cypher"})
    # V-05r: 只读白名单仅对 worker token —— host token 是调度器合法写通道
    # (AgentIdentity/Engagement/ExperienceWeight MERGE 均经 /query；worker 写走 /write/*)
    _host_tok = d.host_token
    _got = self.headers.get("X-Auth", "")
    _is_host = bool(_host_tok) and bool(_got) and d.hmac.compare_digest(_got, _host_tok)  # V-13
    if not _is_host:
        # V-06: 纯函数判定(大小写不敏感白名单+黑名单), 替代原区分大小写的 :271/:273
        ok_q, err_q = worker_query_allowed(cypher)
        if not ok_q:
            return self._send(403, {"ok": False, "error": err_q})
    else:
        # 4-3c-1: host token /query 的 CALL 禁令(一行级止血) —— host 写通道
        # (MERGE/CREATE/SET/...)零触碰, 仅拦 Kuzu 过程调用(元数据枚举面, 与 worker
        # 门 0913 C10 同口径)。纯正则判定不占锁(位于 with _locked() 之前);
        # #73: 拒绝统一审计(auth-fail 同款 detail 含 path/peer 来源地址)。
        ok_h, err_h = host_query_gate(cypher)
        if not ok_h:
            d._audit_event("host-call-denied", {"path": self.path, "peer": self._peer(),
                                                "cypher_head": cypher[:80]})
            return self._send(403, {"ok": False, "error": err_h})
        # FIX-1 A3: host 写通道停写 — /query 是调度器合法写通道(AgentIdentity/
        # Engagement MERGE 等), 全局暂停期僵尸调度器的写型查询同样拦(冷读 A3: 原暂停
        # 门只覆盖 /write/*, 经 /query 的变更语句绕过「全停写」)。判定复用
        # WORKER_MUTATION_RE(单一真源); 只读查询放行 — 停机调查需要读图(worker 侧
        # 本就只读, worker_query_allowed 拦变更, 零影响)。拒绝留审计可追溯。
        if d._d2d_paused() and WORKER_MUTATION_RE.search(cypher):
            d._audit_event("host-write-paused", {"path": self.path, "peer": self._peer(),
                                                 "cypher_head": cypher[:80]})
            return self._send(409, {"ok": False, "error": "d2d-paused — 全局暂停中, host 写通道已冻结(只读查询不受限)"})
    with d._locked():  # V-11: 锁带 5s deadline
        try:
            conn = d.kuzu.Connection(d.db())
            # H12: Engagement CREATE 的容量栅栏权威判定 — 必须与 CREATE 同一把锁原子完成。
            # 旧实现预检在外层独立锁窗口(:1197 一带), CREATE 在此处另一次加锁执行,
            # 两并发请求可同时过检再双双 CREATE, P2P_MAX_ACTIVE 上限被并发击穿(TOCTOU)。
            if is_engagement_create(cypher):
                # GW-2 v2 (N2/拍板③): MERGE 命中已存在 ≠ 新建 —— 同锁内先按 {name:$k|'k'}
                # 点查存在性(参数绑定), 命中=更新语义不计容量; 键不可提取(形态偏离/多 MERGE)
                # → 按新建计容量(fail-closed)。外层纵深预检仅 CREATE(见上段注释)。
                _merge_key = engagement_merge_existing_key(cypher)
                _is_existing_update = False
                if _merge_key is not None:
                    if "param" in _merge_key:
                        _mk = conn.execute(
                            "MATCH (e:Engagement {name:$k}) RETURN count(e)",
                            parameters={"k": str(params.get(_merge_key["param"], ""))})
                    else:
                        _mk = conn.execute(
                            "MATCH (e:Engagement {name:$k}) RETURN count(e)",
                            parameters={"k": _merge_key["value"]})
                    _is_existing_update = int(list(_mk.get_next())[0]) > 0 if _mk.has_next() else False
                if not _is_existing_update:
                    _r1 = conn.execute("MATCH (e:Engagement) WHERE e.status IN ['active','requested'] RETURN count(e)")
                    _n_active = int(list(_r1.get_next())[0]) if _r1.has_next() else 0
                    _cap_err = engagement_cap_gate(_n_active)
                    if _cap_err:
                        return self._send(409, {"ok": False, "error": _cap_err})
            res = conn.execute(cypher, params)
            # H13: 行数上限封顶(bounded_rows 纯逻辑供 pytest) — 大图全量缓冲 OOM 面
            rows, truncated = bounded_rows(res)
            cols = res.get_column_names()
            data = []
            for r in rows:
                data.append({cols[i]: _jsonify(r[i]) for i in range(len(cols))})
            return self._send(200, {"ok": True, "rows": data,
                                    "count": len(data), "truncated": truncated})
        except TimeoutError as _te:
            return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
        except Exception as e:
            # V-12: 错误信息截断回显(原 str(e) 全文回传)
            return self._send(400, {"ok": False, "error": str(e)[:200]})

"""gd.schema — SCHEMA 表定义 / init_schema 建表与增量迁移 / W5 engagement 池子归属
(时间窗归属纯函数族 + 存量混合池回填 _backfill_eng)。
纯代码搬移自 graphd/app.py(巨型文件拆分), 逻辑零改动;
app.py 侧 re-export 保持 `from graphd.app import X` 既有导入路径不变。"""
import re
import sys
from datetime import datetime, timezone

SCHEMA = [
    "CREATE NODE TABLE IF NOT EXISTS Engagement(name STRING, target STRING, scope STRING, auth STRING, status STRING, created_at STRING, PRIMARY KEY(name))",
    "CREATE NODE TABLE IF NOT EXISTS Endpoint(id STRING, url STRING, param STRING, method STRING, tech STRING, business_chain STRING, coverage_votes INT64 DEFAULT 0, exhausted BOOL DEFAULT false, eng STRING DEFAULT '', authorized BOOL DEFAULT false, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Signal_(id STRING, type STRING, weight DOUBLE DEFAULT 1.0, status STRING DEFAULT 'open', evidence STRING, ts STRING, ring STRING, eng STRING DEFAULT '', verify_tries INT64 DEFAULT 0, surface STRING DEFAULT '', boundary STRING DEFAULT '', content_hash STRING DEFAULT '', source_hash STRING DEFAULT '', evidence_ref STRING DEFAULT '', PRIMARY KEY(id))",
    # 命名区分(3B): Hypothesis.evidence_ref = 验证引用文本(存 signal/finding id);
    # Finding/Signal_ 的 evidence_ref 列(见下两行) = 证据文件指针 ev/<eng>/<node-id>.txt — 同名不同义。
    "CREATE NODE TABLE IF NOT EXISTS Hypothesis(id STRING, text STRING, strategy STRING, status STRING DEFAULT 'open', ts STRING, eng STRING DEFAULT '', claimed_by STRING DEFAULT '', claimed_at INT64 DEFAULT 0, verdict STRING DEFAULT '', evidence_ref STRING DEFAULT '', PRIMARY KEY(id))",
    # Finding/Signal_ 3B 三列(列名与 ALTER/_CRITICAL_COLUMNS 三处同步, 缺一即静默降级):
    # content_hash=内容指纹(去重), source_hash=来源指纹, evidence_ref=证据文件指针(格式见 gd/gates.py evidence_ref)。
    "CREATE NODE TABLE IF NOT EXISTS Finding(id STRING, title STRING, severity STRING, cvss DOUBLE DEFAULT 0.0, evidence_dir STRING, repro STRING, category STRING DEFAULT 'vuln', gate_status STRING DEFAULT 'candidate', ts STRING, verified_at STRING DEFAULT '', verified_log STRING DEFAULT '', notify_sent BOOL DEFAULT false, last_transition STRING DEFAULT '', eng STRING DEFAULT '', dual_sign STRING DEFAULT '', replay_matrix STRING DEFAULT '', content_hash STRING DEFAULT '', source_hash STRING DEFAULT '', evidence_ref STRING DEFAULT '', report_status STRING DEFAULT '', PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Plan(id STRING, text STRING, score DOUBLE DEFAULT 0.0, status STRING DEFAULT 'chosen', created_at STRING, eng STRING DEFAULT '', PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS ExperienceWeight(id STRING, pattern STRING, stack STRING, prior DOUBLE DEFAULT 1.0, hits INT64 DEFAULT 0, wins INT64 DEFAULT 0, target_type STRING DEFAULT 'web', recipe STRING DEFAULT '', stack_fp STRING DEFAULT '', payload_hint STRING DEFAULT '', cls STRING DEFAULT '', win_day STRING DEFAULT '', wins_today INT64 DEFAULT 0, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS AgentIdentity(worker_id STRING, ring STRING, chain STRING, status STRING, checkpoint STRING, todo STRING, updated_at STRING, eng STRING DEFAULT '', lease_id STRING DEFAULT '', exit_class STRING DEFAULT '', PRIMARY KEY(worker_id))",
    "CREATE NODE TABLE IF NOT EXISTS Task(id STRING, eng STRING DEFAULT '', kind STRING, payload STRING, priority DOUBLE DEFAULT 1.0, status STRING DEFAULT 'pending', claimed_by STRING DEFAULT '', claimed_at STRING DEFAULT '', target_type STRING DEFAULT 'web', link_id STRING DEFAULT '', created_at STRING, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Handoff(id STRING, eng STRING, digest STRING, model STRING DEFAULT '', created_at STRING, PRIMARY KEY(id))",
    "CREATE REL TABLE IF NOT EXISTS AT(FROM Signal_ TO Endpoint)",
    "CREATE REL TABLE IF NOT EXISTS CONFIRMS(FROM Finding TO Signal_)",
    "CREATE REL TABLE IF NOT EXISTS SUGGESTS(FROM Hypothesis TO Endpoint)",
    "CREATE REL TABLE IF NOT EXISTS DERIVED_FROM(FROM Signal_ TO Signal_)",
    "CREATE REL TABLE IF NOT EXISTS PRIOR_FOR(FROM ExperienceWeight TO Signal_)",
    "CREATE REL TABLE IF NOT EXISTS RELATES(FROM Endpoint TO Endpoint)",
]


def init_schema(conn):
    for q in SCHEMA:
        try:
            conn.execute(q)
        except Exception as e:
            if "already exists" not in str(e):
                raise
    # R3: 旧库增量迁移 ExperienceWeight 结构化经验列（列已存在/引擎不支持时忽略，新库由 SCHEMA 直接建全）
    # 列名为字面量枚举(无外部输入可拼入) — 上一版 f-string 写法触发扫描器 SIDI 判定, 改为逐条字面量
    for _ddl in ("ALTER TABLE ExperienceWeight ADD recipe STRING DEFAULT ''",
                 "ALTER TABLE ExperienceWeight ADD stack_fp STRING DEFAULT ''",
                 "ALTER TABLE ExperienceWeight ADD payload_hint STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # P0 计胜列迁移(实证: experience.mjs 的 EXP_UPSERT/CREDIT 写入 SET e.cls/e.win_day/e.wins_today,
    # 旧库无列时 Binder 报错被 worker 侧 .catch 静默吞 → verified 战果积分永不上涨, 自进化闭环断链)。
    # 列型与写入语句对齐: cls=归一漏洞类标注(STRING), win_day=当日窗口日期串 YYYY-MM-DD(STRING),
    # wins_today=当日计胜数(INT64, 跨日 CASE 重置)。列名为字面量枚举(同上, 防扫描器 SIDI 判定)。
    for _ddl in ("ALTER TABLE ExperienceWeight ADD cls STRING DEFAULT ''",
                 "ALTER TABLE ExperienceWeight ADD win_day STRING DEFAULT ''",
                 "ALTER TABLE ExperienceWeight ADD wins_today INT64 DEFAULT 0"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # P0 生命周期列迁移(0905 实证: 旧库无列时 SET/RETURN cancel 直接 Binder exception,
    # 调度器侧 .catch 静默吞掉 → 栅栏/租约/取消令牌整体失效)
    for _ddl in ("ALTER TABLE Engagement ADD cancel STRING DEFAULT 'false'",
                 "ALTER TABLE Engagement ADD leased_by STRING DEFAULT ''",
                 "ALTER TABLE Engagement ADD lease_at INT64 DEFAULT 0",
                 # 0906 图队列采纳: panel POST /d2d/api/start 写 status='requested' 节点,
                 # web 宿主调度器认领(adopt) — instances/objective 随节点传给 startEngagement
                 "ALTER TABLE Engagement ADD instances INT64 DEFAULT 2",
                 "ALTER TABLE Engagement ADD objective STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # R3: 旧库增量迁移 Finding.notify_sent（战果通知去重）与 Task.eng（任务归属 engagement）
    try:
        conn.execute("ALTER TABLE Finding ADD notify_sent BOOL DEFAULT false")
    except Exception:
        pass
    try:
        conn.execute("ALTER TABLE Task ADD eng STRING DEFAULT ''")
    except Exception:
        pass
    # W1: 七态转换审计轨迹列(旧库迁移, 新库由 SCHEMA 直接建全)
    try:
        conn.execute("ALTER TABLE Finding ADD last_transition STRING DEFAULT ''")
    except Exception:
        pass
    # 0913 双签断链修复: applyVerifyResults 消费查询 RETURN s.verify_tries — 旧库无此列时
    # Kuzu Binder 异常被 scheduler 侧 .catch(()=>[]) 静默吞掉 → 结论信号永不消费 → 双签永不盖章。
    # 新库由 SCHEMA 直接建全, 旧库 ALTER 迁移。
    try:
        conn.execute("ALTER TABLE Signal_ ADD verify_tries INT64 DEFAULT 0")
    except Exception:
        pass
    # 0913 同类修复: gates 双签查询 RETURN f.dual_sign — 缺列同款 Binder 静默失败 →
    # frow 恒 null → 双签(pending/disputed/signed)整段死代码, critical/high 永远单签。
    try:
        conn.execute("ALTER TABLE Finding ADD dual_sign STRING DEFAULT ''")
    except Exception:
        pass
    # 0913 星图认知层: Signal_ 坐标枚举(surface/boundary) + Hypothesis 生命周期
    # (claim 租约/verdict/证据引用) + Finding replay 矩阵。新库由 SCHEMA 直接建全, 旧库 ALTER 迁移。
    for _ddl in ("ALTER TABLE Signal_ ADD surface STRING DEFAULT ''",
                 "ALTER TABLE Signal_ ADD boundary STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD claimed_by STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD claimed_at INT64 DEFAULT 0",
                 "ALTER TABLE Hypothesis ADD verdict STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD evidence_ref STRING DEFAULT ''",
                 "ALTER TABLE Finding ADD replay_matrix STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # 签名去重: 跨 host 同缺陷(同 path+同类别)的关联标记 — 指向既有 finding id
    try:
        conn.execute("ALTER TABLE Finding ADD related_to STRING DEFAULT ''")
    except Exception:
        pass
    # W5(engagement 池子隔离): 池子表补 eng 归属列 — 新库由 SCHEMA 直接建全, 旧库 ALTER 迁移。
    # ExperienceWeight(经验)与模型策略刻意不加: 跨 src 项目共享(用户约定)。
    for _ddl in ("ALTER TABLE Endpoint ADD eng STRING DEFAULT ''",
                 "ALTER TABLE Signal_ ADD eng STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD eng STRING DEFAULT ''",
                 "ALTER TABLE Finding ADD eng STRING DEFAULT ''",
                 "ALTER TABLE Plan ADD eng STRING DEFAULT ''",
                 "ALTER TABLE AgentIdentity ADD eng STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # L0/L1 分级验证(参照 dsh-hunter): Endpoint.authorized 授权资产标记 — L1 主动验证硬门的数据源。
    # 新库由 SCHEMA 直接建全, 旧库 ALTER 迁移(与 W5 eng 列同款); 默认 false = 未授权(fail-safe)。
    try:
        conn.execute("ALTER TABLE Endpoint ADD authorized BOOL DEFAULT false")
    except Exception:
        pass
    # P0 Turn lease: worker 身份租约列 — 终态写入 CAS 的钥匙(scheduler.js 派发点生成,
    # stopAll/recoverOrphans 写终态时同语句置 '' 关闭; 迟到的旧 lease 回调 WHERE lease_id 零命中,
    # 双写竞态收敛为唯一胜出方)。列名为字面量枚举(同上, 防扫描器 SIDI 判定)。
    # 3A: exit_class=七类失败分类落图列(ok/quota/network/scope_denied/canceled/crash/other) —
    # scheduler.js 终态 CAS 的 SET 列表原地并入(WHERE lease_id 保证只在胜出路径写, 零竞态);
    # 三处同步(SCHEMA CREATE + 本 ALTER + _CRITICAL_COLUMNS), 缺一即静默降级。
    for _ddl in ("ALTER TABLE AgentIdentity ADD lease_id STRING DEFAULT ''",
                 "ALTER TABLE AgentIdentity ADD exit_class STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # 3B 证据指纹三列迁移(Finding/Signal_): content_hash(内容指纹去重)/source_hash(来源指纹)/
    # evidence_ref(证据文件指针 ev/<eng>/<node-id>.txt, 纯指针不落内容 — 写入由批次 2 的 3C 接线)。
    # 注意同名不同义: Hypothesis.evidence_ref=验证引用文本(存 signal/finding id), 此处是文件指针。
    # 新库由 SCHEMA 直接建全, 旧库 ALTER 迁移。列名为字面量枚举(同上, 防扫描器 SIDI 判定);
    # 缺列即走 _CRITICAL_COLUMNS/SCHEMA_DEGRADED 降级告警(dual_sign 缺列静默死代码的同款兜底)。
    for _ddl in ("ALTER TABLE Finding ADD content_hash STRING DEFAULT ''",
                 "ALTER TABLE Finding ADD source_hash STRING DEFAULT ''",
                 "ALTER TABLE Finding ADD evidence_ref STRING DEFAULT ''",
                 "ALTER TABLE Signal_ ADD content_hash STRING DEFAULT ''",
                 "ALTER TABLE Signal_ ADD source_hash STRING DEFAULT ''",
                 "ALTER TABLE Signal_ ADD evidence_ref STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # 3E 报告门状态列: report.mjs 统一过门后的报告状态标记(complete/incomplete/missing_evidence…)
    # 回写通道 = app.py /write/transition 在 reported 态接受可选 report_status 并写该列
    # (写失败降级 stderr 不阻塞)。三处同步(SCHEMA CREATE + 本 ALTER + _CRITICAL_COLUMNS),
    # 缺一即静默降级(SCHEMA_DEGRADED)。列名为字面量枚举(同上, 防扫描器 SIDI 判定)。
    try:
        conn.execute("ALTER TABLE Finding ADD report_status STRING DEFAULT ''")
    except Exception:
        pass
    # 存量混合池归属回填: 只处理 eng='' 的行, 幂等(每次启动 O(池子行数), 空转即跳过)。
    try:
        _backfill_eng(conn)
    except Exception:
        pass
    # 0915 B16/B17: 迁移收尾校验 — 上面 ALTER 全部 except pass, 列缺失时后续查询全 Binder 异常
    # 被调用方 .catch 吞掉(实证: dual_sign/eng 缺列 → 双签与池隔离整段静默死代码, 而 /health
    # 仍报健康)。此处**响亮记录 + 暴露降级状态**, 不抛异常阻断启动 — 启动期硬失败会把整个
    # 作战面拖下水, 与"可见即可修"的目标不成比例(见 SCHEMA_DEGRADED, app.py /health 回显)。
    _verify_critical_columns(conn)


# 关键列清单: 缺失即核心功能静默失效(查询 Binder 异常被上层 catch 吞)。
# 列名与读写语句必须一致 — 改动任何一处读写都要同步本表。
_CRITICAL_COLUMNS = {
    "Finding": ("dual_sign", "eng", "replay_matrix", "related_to", "last_transition",
                "content_hash", "source_hash", "evidence_ref", "report_status"),
    "Signal_": ("verify_tries", "eng", "surface", "boundary",
                "content_hash", "source_hash", "evidence_ref"),
    "Endpoint": ("eng", "authorized"),
    "Hypothesis": ("eng", "claimed_by", "verdict"),
    "Engagement": ("leased_by", "lease_at", "cancel"),
    "AgentIdentity": ("lease_id", "exit_class"),
}

# 迁移校验结果: 缺失关键列的 "表.列" 列表(空=健康)。app.py /health 回显此值,
# 非空即代表有功能静默失效, 运维/面板据此察觉。
SCHEMA_DEGRADED: list = []


def _verify_critical_columns(conn) -> list:
    """迁移后校验关键列; 缺失则记录到 SCHEMA_DEGRADED + stderr 告警(不抛异常)。

    注意: 原地修改 SCHEMA_DEGRADED(clear/extend)而不是重新赋值 — app.py 在导入时绑定的是
    同一个 list 对象, 重新赋值会让它永远看到空列表(import 绑定名字的经典陷阱)。
    """
    missing = []
    for table, cols in _CRITICAL_COLUMNS.items():
        try:
            r = conn.execute(f"CALL table_info('{table}') RETURN *")
            present = set()
            while r.has_next():
                present.add(str(r.get_next()[1]))
        except Exception as e:
            # table_info 不可用(旧版 kuzu/表不存在) — 无法判定, 不误报
            print(f"[schema] {table} 列校验跳过: {type(e).__name__} {str(e)[:80]}", file=sys.stderr, flush=True)
            continue
        for c in cols:
            if c not in present:
                missing.append(f"{table}.{c}")
    SCHEMA_DEGRADED.clear()
    SCHEMA_DEGRADED.extend(missing)
    if missing:
        print(
            "[schema] 迁移不完整, 缺失关键列: " + ", ".join(missing)
            + " — 对应功能(双签/池隔离/星图坐标等)查询会 Binder 异常并被上层静默吞掉, 请检查 migrations",
            file=sys.stderr, flush=True,
        )
    return missing


# ── W5: engagement 池子隔离 ─────────────────────────────────────────────
# 池子数据(Finding/Signal_/Endpoint/Hypothesis/Plan)带 eng 归属; 面板按选中 engagement 过滤,
# 经验(ExperienceWeight)与模型策略跨项目共享。存量混合池由 _backfill_eng 启动时一次性消化。

def parse_scope_allows(scope) -> list:
    """scope 字符串 → 授权(非 `!`)条目列表(纯函数)。与写门控同口径解析。"""
    out = []
    for s in str(scope or "").split(","):
        s = s.strip().lower()
        if s and not s.startswith("!"):
            out.append(s)
    return out


def host_in_scope(host, scope) -> bool:
    """host 是否落在 scope 授权条目内(纯函数) — 后缀匹配, 与写门控同口径。"""
    h = re.sub(r"^[a-z][a-z0-9+.-]*://", "", str(host or "").strip().lower()).split("/")[0]
    for a in parse_scope_allows(scope):
        if h == a or h.endswith("." + a):
            return True
    return False


def _parse_ts_ms(v):
    """ISO/epoch 字符串 → epoch ms(纯函数); 失败返回 0。"""
    if v is None:
        return 0
    if isinstance(v, (int, float)):
        return int(v)
    try:
        return int(str(v).strip())
    except ValueError:
        pass
    try:
        s = str(v).strip().replace("Z", "+00:00")
        d = datetime.fromisoformat(s)
        if d.tzinfo is None:
            d = d.replace(tzinfo=timezone.utc)
        return int(d.timestamp() * 1000)
    except Exception:
        return 0


def eng_time_windows(rows) -> list:
    """Engagement 行({name, created_at} 或 (name, created_at)) → 按时间排序的归属窗口
    [(name, start_ms, end_ms)]。end_ms = 下一 engagement 的 created_at(多开并行期归属先创建者),
    末位到 +∞。无时间戳的行跳过。"""
    pts = []
    for r in rows or []:
        if isinstance(r, dict):
            name, ca = r.get("name"), r.get("created_at")
        else:
            name, ca = (r[0], r[1] if len(r) > 1 else None)
        t = _parse_ts_ms(ca)
        if t:
            pts.append((t, str(name)))
    pts.sort()
    wins = []
    for i, (t, name) in enumerate(pts):
        end = pts[i + 1][0] if i + 1 < len(pts) else float("inf")
        wins.append((name, t, end))
    return wins


def attribute_by_time(ts, windows) -> str:
    """ts(ms) 按窗口归属 engagement 名(纯函数) — 落在窗口起点之前的孤儿数据不强行归属(返回 '')。"""
    t = _parse_ts_ms(ts)
    if not t:
        return ""
    for name, start, end in windows or []:
        if start <= t < end:
            return name
    return ""


def pick_write_eng(explicit, active_rows, hosts) -> str:
    """写入打标归属决策(纯函数): ①显式 eng 字段且在 active 列表内 → 采用
    ②恰一个 active → 它 ③多 active 时按载荷 host 命中 scope 投票(唯一命中者胜)
    ④兜底 ''(面板按 eng='' 也可视, 不丢数据)。"""
    names = []
    for r in active_rows or []:
        n = r.get("name") if isinstance(r, dict) else r[0]
        names.append(str(n))
    if explicit:
        e = str(explicit).strip()
        if e in names:
            return e
    if len(names) == 1:
        return names[0]
    if hosts:
        votes = {}
        for r in active_rows or []:
            n = r.get("name") if isinstance(r, dict) else r[0]
            sc = r.get("scope") if isinstance(r, dict) else (r[1] if len(r) > 1 else "")
            hit = sum(1 for h in hosts if host_in_scope(h, sc))
            if hit:
                votes[str(n)] = votes.get(str(n), 0) + hit
        if len(votes) == 1:
            return next(iter(votes))
    return ""


def _backfill_eng(conn):
    """存量混合池归属回填(启动时, 幂等只处理 eng=''):
    ①有 ts 的表按 engagement created_at 时间窗归属 ②Endpoint 无 ts → 经 AT 边继承 Signal 归属
    (多数票) ③仍空的 Endpoint 按 URL host 命中 scope 归属。多开并行的存量按先创建者窗口切分。"""
    rows = conn.execute("MATCH (e:Engagement) RETURN e.name, e.created_at, e.scope")
    engs = []
    while rows.has_next():
        n, ca, sc = rows.get_next()
        engs.append({"name": str(n or ""), "created_at": str(ca or ""), "scope": str(sc or "")})
    if not engs:
        return {"touched": 0}
    windows = eng_time_windows(engs)
    touched = 0
    # ① 时间窗归属(表, ts 列名)
    for table, tscol in (("Signal_", "ts"), ("Finding", "ts"), ("Hypothesis", "ts"), ("Plan", "created_at")):
        r = conn.execute(f"MATCH (x:{table}) WHERE x.eng = '' RETURN x.{tscol}, x.id")  # noqa: S608 — 表/列名为字面量枚举
        batch = []
        while r.has_next():
            ts, rid = r.get_next()
            eng = attribute_by_time(ts, windows)
            if eng:
                batch.append((eng, str(rid)))
        for eng, rid in batch:
            if table == "Signal_":
                conn.execute("MATCH (x:Signal_ {id:$i}) SET x.eng = $e", parameters={"i": rid, "e": eng})
            elif table == "Finding":
                conn.execute("MATCH (x:Finding {id:$i}) SET x.eng = $e", parameters={"i": rid, "e": eng})
            elif table == "Hypothesis":
                conn.execute("MATCH (x:Hypothesis {id:$i}) SET x.eng = $e", parameters={"i": rid, "e": eng})
            else:
                conn.execute("MATCH (x:Plan {id:$i}) SET x.eng = $e", parameters={"i": rid, "e": eng})
            touched += 1
    # ② Endpoint 经 AT 边继承 Signal 归属(多数票, 平票取最早创建的 signal 之归属)
    try:
        r = conn.execute(
            "MATCH (s:Signal_)-[:AT]->(e:Endpoint) WHERE e.eng = '' AND s.eng <> '' "
            "RETURN e.id, s.eng, count(s)")
        votes = {}
        while r.has_next():
            eid, seng, _c = r.get_next()
            votes.setdefault(str(eid), {})
            votes[str(eid)][str(seng)] = votes[str(eid)].get(str(seng), 0) + 1
        for eid, vm in votes.items():
            eng = max(vm.items(), key=lambda kv: kv[1])[0]
            conn.execute("MATCH (x:Endpoint {id:$i}) SET x.eng = $e", parameters={"i": eid, "e": eng})
            touched += 1
    except Exception:
        pass  # 旧库无 AT 边时跳过, ③兜底
    # ③ Endpoint host 命中 scope 归属
    r = conn.execute("MATCH (x:Endpoint) WHERE x.eng = '' RETURN x.id, x.url")
    batch = []
    while r.has_next():
        eid, url = r.get_next()
        h = re.sub(r"^[a-z][a-z0-9+.-]*://", "", str(url or "").strip().lower()).split("/")[0]
        if not h:
            continue
        for g in engs:
            if host_in_scope(h, g["scope"]):
                batch.append((g["name"], str(eid)))
                break
    for eng, eid in batch:
        conn.execute("MATCH (x:Endpoint {id:$i}) SET x.eng = $e", parameters={"i": eid, "e": eng})
        touched += 1
    return {"touched": touched}

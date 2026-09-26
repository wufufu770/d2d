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
    # 3.6-4 段 C: value_score 列(启发式价值分, 消费点认领时回写 — 下方 ALTER/_CRITICAL_COLUMNS
    # 三处同步; 计算公式权威锚 gates.py hypothesis_value_score, aging 排序消费在 loop.mjs)。
    "CREATE NODE TABLE IF NOT EXISTS Hypothesis(id STRING, text STRING, strategy STRING, status STRING DEFAULT 'open', ts STRING, eng STRING DEFAULT '', claimed_by STRING DEFAULT '', claimed_at INT64 DEFAULT 0, verdict STRING DEFAULT '', evidence_ref STRING DEFAULT '', value_score FLOAT DEFAULT 0.0, PRIMARY KEY(id))",
    # Finding/Signal_ 3B 三列(列名与 ALTER/_CRITICAL_COLUMNS 三处同步, 缺一即静默降级):
    # content_hash=内容指纹(去重), source_hash=来源指纹, evidence_ref=证据文件指针(格式见 gd/gates.py evidence_ref)。
    # 4-4 子批次 B(3B 两段式段 1): repairability=可修复性分类列(gd/gates.py repairability_classify
    # 落列占位, 写入接线留后续批次) — 同款三处同步。
    "CREATE NODE TABLE IF NOT EXISTS Finding(id STRING, title STRING, severity STRING, cvss DOUBLE DEFAULT 0.0, evidence_dir STRING, repro STRING, category STRING DEFAULT 'vuln', gate_status STRING DEFAULT 'candidate', ts STRING, verified_at STRING DEFAULT '', verified_log STRING DEFAULT '', notify_sent BOOL DEFAULT false, last_transition STRING DEFAULT '', eng STRING DEFAULT '', dual_sign STRING DEFAULT '', replay_matrix STRING DEFAULT '', content_hash STRING DEFAULT '', source_hash STRING DEFAULT '', evidence_ref STRING DEFAULT '', report_status STRING DEFAULT '', repairability STRING DEFAULT '', PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Plan(id STRING, text STRING, score DOUBLE DEFAULT 0.0, status STRING DEFAULT 'chosen', created_at STRING, eng STRING DEFAULT '', PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS ExperienceWeight(id STRING, pattern STRING, stack STRING, prior DOUBLE DEFAULT 1.0, hits INT64 DEFAULT 0, wins INT64 DEFAULT 0, target_type STRING DEFAULT 'web', recipe STRING DEFAULT '', stack_fp STRING DEFAULT '', payload_hint STRING DEFAULT '', cls STRING DEFAULT '', win_day STRING DEFAULT '', wins_today INT64 DEFAULT 0, PRIMARY KEY(id))",
    # 3.5-1(经验回流子系统 A 数据层): Experience 结构化经验表(方案 v2 逐列 14 列 — id 服务端生成,
    # 写入即隔离 status='quarantined', utility_score FLOAT 默认 0.5 为 EvolveR 冷启动, 时间列
    # DEFAULT epoch('1970-01-01 00:00:00' — kuzu 0.11 DDL 无当前时刻函数默认, 现场实证));
    # 写入通道 /write/experience, 读取通道 /query/experience(蒸馏 3.5-2/注入 3.5-3 后续批次接线)。
    # 与 ExperienceWeight 同名族不同表: 那是模式权重卡(cls/win_day 计胜), 本表是条目级经验回流。
    "CREATE NODE TABLE IF NOT EXISTS Experience(id STRING, eng_id STRING DEFAULT '', category STRING DEFAULT '', scope STRING DEFAULT '', title STRING DEFAULT '', content STRING DEFAULT '', evidence_ref STRING DEFAULT '', utility_score FLOAT DEFAULT 0.5, retrieval_count INT64 DEFAULT 0, success_count INT64 DEFAULT 0, created_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00'), last_used_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00'), status STRING DEFAULT 'quarantined', provenance_hash STRING DEFAULT '', PRIMARY KEY(id))",
    # 3.6-1(前沿子系统 C 数据层): Frontier 探索方向提案表(9 列 — worker 提案 direction,
    # 主控评审转态 proposed→accepted|rejected、accepted→explored)。时间列 DEFAULT epoch
    # ('1970-01-01 00:00:00' — kuzu 0.11 DDL 无当前时刻函数默认, 沿 Experience 3.5-1 现场实证
    # 先例); 写入通道 /write/frontier(status 恒 'proposed', reviewed_at 恒 epoch — 评审前无值),
    # 读取通道 /query/frontier(缺省全态), 转态通道 /write/frontier-transition(host-only)。
    # 3.6-2 v4.1 增列(9→14 列, 与下方 ALTER/_CRITICAL_COLUMNS 三处同步): value_score/value_components
    # 为价值评分占位(本批次恒 0/'' — 公式 3.6-3 实现, 写端点不接受调用方传值); 两个 *_ref 为
    # 采纳/确证链占位(写端点不写值, 由 3.6-3/3.6-4 转态链回填); version=行 schema 版本
    # (写端点恒写 'v1', 不接受调用方指定)。refs 图节点引用: 准入校验(工具侧预检 + 端点侧终检,
    # 拍板留痕见 app.py 写端注释)之外, 3.6-3 拍板改判落列 — 归一数组 JSON 串化存入(见下)。
    # 3.6-3 refs 列(14→15 列, 与下方 ALTER/_CRITICAL_COLUMNS 三处同步): 归一化后的引用 id
    # 数组 JSON 串(JSON.stringify 同构, DEFAULT '' = 无引用占位), 写端点唯一写入方。
    "CREATE NODE TABLE IF NOT EXISTS Frontier(id STRING, eng_id STRING DEFAULT '', direction STRING DEFAULT '', evidence STRING DEFAULT '', proposed_by STRING DEFAULT '', status STRING DEFAULT 'proposed', review_note STRING DEFAULT '', created_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00'), reviewed_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00'), value_score FLOAT DEFAULT 0.0, value_components STRING DEFAULT '', accepted_to_hypothesis_ref STRING DEFAULT '', hypothesis_to_confirmed_ref STRING DEFAULT '', version STRING DEFAULT 'v1', refs STRING DEFAULT '', PRIMARY KEY(id))",
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
    # 3.6-4 段 C: Hypothesis.value_score 同款幂等迁移(消费点认领时回写, 旧库缺列时该 SET
    # 会被 scheduler 侧 .catch 静默吞 — 缺列走 _CRITICAL_COLUMNS/SCHEMA_DEGRADED 响亮告警)。
    for _ddl in ("ALTER TABLE Signal_ ADD surface STRING DEFAULT ''",
                 "ALTER TABLE Signal_ ADD boundary STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD claimed_by STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD claimed_at INT64 DEFAULT 0",
                 "ALTER TABLE Hypothesis ADD verdict STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD evidence_ref STRING DEFAULT ''",
                 "ALTER TABLE Hypothesis ADD value_score FLOAT DEFAULT 0.0",
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
    # 4-4 子批次 B(3B 两段式段 1): repairability 可修复性分类列 — gd/gates.py
    # repairability_classify 的落列占位(写入接线: 审批回填/reported 前缺项检查, 留后续批次,
    # 本批不接 /write/finding)。三处同步(SCHEMA CREATE + 本 ALTER + _CRITICAL_COLUMNS),
    # 缺一即静默降级(SCHEMA_DEGRADED); 幂等: 列已存在时 ALTER 抛错被吞(同 3B/3A/3E 先例);
    # 列名为字面量枚举(同上, 防扫描器 SIDI 判定)。
    try:
        conn.execute("ALTER TABLE Finding ADD repairability STRING DEFAULT ''")
    except Exception:
        pass
    # 3.5-1(经验回流 A): Experience 表旧库逐列补缺迁移 —— 新表场景: 已存在但列缺失的 Experience
    # (早期形态/半建表)由本段幂等 ALTER 补齐(列已存在时 ALTER 抛错被吞, 同 3B/3A/3E 先例)。
    # 列名为字面量枚举(无外部输入可拼入, 防扫描器 SIDI 判定); 类型/默认值与 SCHEMA CREATE 逐字
    # 同源(三处同步之二); id 为 PRIMARY KEY 不可 ALTER ADD(带 id 的表必含主键, 无此缺列形态)。
    # 缺列即走 _CRITICAL_COLUMNS/SCHEMA_DEGRADED 降级告警(同 dual_sign 缺列静默死代码的兜底)。
    for _ddl in ("ALTER TABLE Experience ADD eng_id STRING DEFAULT ''",
                 "ALTER TABLE Experience ADD category STRING DEFAULT ''",
                 "ALTER TABLE Experience ADD scope STRING DEFAULT ''",
                 "ALTER TABLE Experience ADD title STRING DEFAULT ''",
                 "ALTER TABLE Experience ADD content STRING DEFAULT ''",
                 "ALTER TABLE Experience ADD evidence_ref STRING DEFAULT ''",
                 "ALTER TABLE Experience ADD utility_score FLOAT DEFAULT 0.5",
                 "ALTER TABLE Experience ADD retrieval_count INT64 DEFAULT 0",
                 "ALTER TABLE Experience ADD success_count INT64 DEFAULT 0",
                 "ALTER TABLE Experience ADD created_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00')",
                 "ALTER TABLE Experience ADD last_used_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00')",
                 "ALTER TABLE Experience ADD status STRING DEFAULT 'quarantined'",
                 "ALTER TABLE Experience ADD provenance_hash STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
        except Exception:
            pass
    # 3.6-1(前沿子系统 C): Frontier 表旧库逐列补缺迁移 —— 同 Experience 3.5-1 先例形态:
    # 早期形态/半建表由本段幂等 ALTER 补齐(列已存在时 ALTER 抛错被吞, 同 3B/3A/3E/3.5-1 先例)。
    # 列名为字面量枚举(无外部输入可拼入, 防扫描器 SIDI 判定); 类型/默认值与 SCHEMA CREATE 逐字
    # 同源(三处同步之二); id 为 PRIMARY KEY 不可 ALTER ADD(带 id 的表必含主键, 无此缺列形态)。
    # 缺列即走 _CRITICAL_COLUMNS/SCHEMA_DEGRADED 降级告警(同 Experience 缺列兜底)。
    for _ddl in ("ALTER TABLE Frontier ADD eng_id STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD direction STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD evidence STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD proposed_by STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD status STRING DEFAULT 'proposed'",
                 "ALTER TABLE Frontier ADD review_note STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD created_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00')",
                 "ALTER TABLE Frontier ADD reviewed_at TIMESTAMP DEFAULT timestamp('1970-01-01 00:00:00')",
                 # 3.6-2 v4.1 五列(类型/默认值与上方 SCHEMA CREATE 逐字同源 — 三处同步之二)
                 "ALTER TABLE Frontier ADD value_score FLOAT DEFAULT 0.0",
                 "ALTER TABLE Frontier ADD value_components STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD accepted_to_hypothesis_ref STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD hypothesis_to_confirmed_ref STRING DEFAULT ''",
                 "ALTER TABLE Frontier ADD version STRING DEFAULT 'v1'",
                 # 3.6-3 refs 列(类型/默认值与上方 SCHEMA CREATE 逐字同源 — 三处同步之二)
                 "ALTER TABLE Frontier ADD refs STRING DEFAULT ''"):
        try:
            conn.execute(_ddl)
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
    # 4-4 子批次 B(3B 两段式段 1): +repairability(可修复性分类列 — 三处同步之三; 缺列时写入/
    # 消费点 SET 被 scheduler .catch 静默吞, 修复性标注断链)
    "Finding": ("dual_sign", "eng", "replay_matrix", "related_to", "last_transition",
                "content_hash", "source_hash", "evidence_ref", "report_status", "repairability"),
    "Signal_": ("verify_tries", "eng", "surface", "boundary",
                "content_hash", "source_hash", "evidence_ref"),
    "Endpoint": ("eng", "authorized"),
    # 3.6-4 段 C: +value_score(启发式价值分落列 — SCHEMA CREATE + 上方 ALTER + 此处三处同步;
    # 缺列时消费点回写 SET 被 scheduler .catch 静默吞, 价值分/aging 审计断链)
    "Hypothesis": ("eng", "claimed_by", "verdict", "value_score"),
    "Engagement": ("leased_by", "lease_at", "cancel"),
    "AgentIdentity": ("lease_id", "exit_class"),
    # 3.5-1(经验回流 A): Experience 纳入全部列(含 id 主键) —— 与 Finding/Signal_ 只锁后期增量
    # 关键子集不同: Experience 是本批次全新表, 整表即经验回流数据层的全部载体, 任何一列缺失都属
    # schema 损坏(utility_score 缺→剪枝失效, created_at/last_used_at 缺→排序/时效失效, status 缺
    # →隔离语义失效, provenance_hash 缺→溯源断链, 其余列缺→读写 Binder 异常被上层静默吞), 且无
    # 历史存量需要区分"主功能列/迁移列"。全列校验成本同量级(table_info 单次调用), 不放子集。
    "Experience": ("id", "eng_id", "category", "scope", "title", "content", "evidence_ref",
                   "utility_score", "retrieval_count", "success_count", "created_at",
                   "last_used_at", "status", "provenance_hash"),
    # 3.6-1(前沿子系统 C): Frontier 纳入全部列(含 id 主键) —— 同 Experience 全列拍板:
    # 全新表整表即前沿提案数据层的全部载体, 任一列缺失都属 schema 损坏(status 缺→评审状态机
    # 失效, created_at/reviewed_at 缺→排序/时效失效, direction/evidence 缺→提案内容断链,
    # 其余列缺→读写 Binder 异常被上层静默吞), 且无历史存量需要区分"主功能列/迁移列"。
    # 全列校验成本同量级(table_info 单次调用), 不放子集。
    # 3.6-2 v4.1: 9→14 列(value_score/value_components/两个 *_ref/version — 三处同步之三)。
    # 3.6-3: +refs(图节点引用 JSON 数组串, 写端点唯一写入方) = 15 列。
    "Frontier": ("id", "eng_id", "direction", "evidence", "proposed_by",
                 "status", "review_note", "created_at", "reviewed_at",
                 "value_score", "value_components", "accepted_to_hypothesis_ref",
                 "hypothesis_to_confirmed_ref", "version", "refs"),
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
            r = conn.execute("CALL table_info('" + table + "') RETURN *")  # noqa: S608 — table 为 _CRITICAL_COLUMNS 字面量枚举键
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
        r = conn.execute("MATCH (x:" + table + ") WHERE x.eng = '' RETURN x." + tscol + ", x.id")  # noqa: S608 — 表/列名为字面量枚举
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

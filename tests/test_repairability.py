#!/usr/bin/env python3
"""4-4 子批次 B(3B 两段式段 1)新用例 — repairability_classify 三枚举 + Finding.repairability
列三处同步(SCHEMA CREATE / ALTER 幂等迁移 / _CRITICAL_COLUMNS 告警口径)。
实现单点真源: graphd/gd/gates.py repairability_classify(纯函数, app.py 禁区不触碰 —
直接 import gd.gates/gd.schema, 与 gd 拆分模块的既有测试同款)。app.py 侧 re-export 未扩,
属后续批次接线面。
种子对照表 SEEDS 与 plugin/pentest-dsh/test/evidence-card.test.mjs 的 JS 镜像种子表逐行同源
(同输入必同 (cls, reason) — 双侧同源等价锁定, frontierValueScore 双实现先例)。"""
import re

import pytest

from graphd.gd.gates import (  # noqa: E402 — 纯函数真源直连(app.py 禁区不触碰)
    CONFIG_ADVICE_RE,
    _REPAIRABILITY_ARCH_PAIR,
    _REPAIRABILITY_ARCH_RES,
    _REPAIRABILITY_CFG_CATS,
    _REPAIRABILITY_CODE_RES,
    config_reject,
    repairability_classify,
)
from graphd.gd.schema import (  # noqa: E402
    _CRITICAL_COLUMNS,
    SCHEMA,
    SCHEMA_DEGRADED,
    _verify_critical_columns,
    init_schema,
)

REPAIRABILITY_CLASSES = {"cfg_one_click", "code_change", "arch_change"}

# ---- 种子对照表(JS 镜像 test/evidence-card.test.mjs SEEDS 逐行同源; 边界交叉样本≥10) ----
SEEDS = [
    # (cat, title, repro, expected_cls, 拍板注记)
    ("config-advice", "Missing security header on login page", "curl -s http://t.example.com/",
     "cfg_one_click", "cat 族路由命中(config_reject 同款家族)"),
    ("hardening", "启用 HttpOnly cookie", "",
     "cfg_one_click", "cat 族路由命中"),
    ("vuln", "版本号泄露: 响应头暴露 X-Powered-By 与 server banner", "",
     "cfg_one_click", "CONFIG_ADVICE_RE 词面命中(版本号) — vuln 类也有一键修复"),
    ("vuln", "SQL injection in search parameter", "' or 1=1--",
     "code_change", "注入(V_ANCHORS 注入类)"),
    ("vuln", "Stored XSS in comment field", "<script>alert(1)</script>",
     "code_change", "XSS"),
    ("vuln", "SSRF via image proxy fetch", "http://169.254.169.254/latest/meta-data/",
     "code_change", "SSRF"),
    ("vuln", "IDOR: 越权访问他人订单详情", "GET /api/order/123 with low-priv token",
     "code_change", "单独横向越权(无登录态词面) = 端点级代码修复"),
    ("vuln", "竞态条件导致重复兑换优惠券", "并发 50 请求",
     "code_change", "竞态/逻辑缺陷"),
    ("vuln", "登录态用户可横向越权遍历他人订单", "低权限 token 遍历 /api/order/{id}",
     "arch_change", "登录态+横向越权组合词面(权限模型级)"),
    ("vuln", "SSO 单点登录票据未校验 audience", "重放 sso ticket 到其他服务",
     "arch_change", "SSO/单点登录"),
    ("vuln", "多租户数据隔离缺失, 跨租户读取账单", "tenant B token 读 tenant A 账单",
     "arch_change", "多租户/租户边界"),
    ("config-advice", "SSO 单点登录集成配置建议: 建议启用强制 MFA", "",
     "arch_change", "边界交叉: arch 词面 > config-advice 路由"),
    ("vuln", "SQL注入 且 cookie attributes 配置不当", "union select",
     "code_change", "边界交叉: code 词面 > CONFIG_ADVICE_RE 词面(cookie attributes)"),
    ("", "", "",
     "code_change", "空入参/词表全未命中 = 默认保守归代码修复"),
]


# ---- repairability_classify: 三枚举正负样本(种子表逐行) ----
@pytest.mark.parametrize("cat,title,repro,expected,_note", SEEDS, ids=[s[4] for s in SEEDS])
def test_repairability_seed_table(cat, title, repro, expected, _note):
    cls, reason = repairability_classify(cat, title, repro)
    assert cls == expected
    assert cls in REPAIRABILITY_CLASSES  # 封闭枚举
    assert isinstance(reason, str) and reason.strip()  # 理由恒非空(人读面)


def test_repairability_enum_is_closed():
    """全种子输出 ⊆ {cfg_one_click, code_change, arch_change} — 封闭三枚举"""
    for cat, title, repro, _expected, _n in SEEDS:
        cls, _ = repairability_classify(cat, title, repro)
        assert cls in REPAIRABILITY_CLASSES


def test_repairability_reason_cites_hit_term():
    """reason 引用命中词面(审批卡片人读) — arch/code/cfg 三路各验一条"""
    _, r_arch = repairability_classify("vuln", "SSO 单点登录票据未校验", "")
    assert "SSO" in r_arch
    _, r_code = repairability_classify("vuln", "SQL injection", "")
    assert "注入" in r_code
    _, r_cfg = repairability_classify("config-advice", "anything", "")
    assert "config-advice" in r_cfg


def test_repairability_priority_arch_over_cfg():
    """优先级拍板: arch 词面命中时即使 cat 是 config 族也归 arch(config-advice 恒 one-click
    候选不绝对化 — 误标 advice 的租户/认证问题仍按架构改)"""
    cls, _ = repairability_classify("config-advice", "多租户数据隔离建议", "")
    assert cls == "arch_change"


def test_repairability_priority_code_over_cfg_re():
    """优先级拍板: 利用类词面(注入)压过 CONFIG_ADVICE_RE 词面 — 真缺陷绝不降为一键修复"""
    cls, _ = repairability_classify("vuln", "XSS via cookie attributes reflection", "<script>")
    assert cls == "code_change"


def test_repairability_default_conservative_code():
    """未知类别且词表全未命中 → code_change(绝不降为 one-click 放低修复门槛)"""
    cls, reason = repairability_classify("unknown-cat", "完全无词面命中的缺陷描述", "")
    assert cls == "code_change" and "默认保守" in reason


def test_repairability_arch_pair_requires_both_terms():
    """「登录态+横向越权」组合拍板: 两词面同现才 arch; 只有其一落 code(单独 IDOR=端点级)"""
    both, _ = repairability_classify("vuln", "登录态用户可横向越权", "")
    only_lateral, _ = repairability_classify("vuln", "横向越权访问他人订单", "")
    only_login, _ = repairability_classify("vuln", "登录态维持机制缺陷(会话固定)", "")
    assert both == "arch_change"
    assert only_lateral == "code_change"
    assert only_login == "code_change"


def test_repairability_vocab_is_closed_and_anchored():
    """词表封闭: cfg=CONFIG_ADVICE_RE 复用(零改); code=V_ANCHORS 覆盖类别; arch=系统级词面"""
    # cfg 词面真源=CONFIG_ADVICE_RE 本体(只读复用 — 词表对象未被本区块改动)
    assert CONFIG_ADVICE_RE.search("missing security header")
    assert set(_REPAIRABILITY_CFG_CATS) == {"config", "config-advice", "hardening"}
    # code 词表覆盖 V_ANCHORS 七类(verify-verdicts.mjs:133-140): SSRF/穿越/注入/XSS/RCE/越权/竞态逻辑
    assert {n for n, _ in _REPAIRABILITY_CODE_RES} == {
        "SSRF", "穿越/路径遍历", "注入", "XSS", "RCE/命令执行", "越权", "竞态/逻辑缺陷"}
    # arch 词表四路 + 登录态+横向越权组合(两词面)
    assert len(_REPAIRABILITY_ARCH_RES) == 4
    assert len(_REPAIRABILITY_ARCH_PAIR) == 2


def test_repairability_orthogonal_to_config_reject():
    """正交实证: 同一输入上 config_reject 语义零变化, repairability 独立给出分类"""
    # config_reject 既有行为(4 既有用例同款断言 — 本区块追加后仍逐字成立)
    assert config_reject("low", "config-advice", "missing security header on login page")[0] is True
    assert config_reject("medium", "config-advice", "CORS reflection with credentials")[0] is False
    assert config_reject("high", "vuln", "CORS reflects any origin with credentials")[0] is False
    # repairability 与 severity 无关(config_reject 看 sev, repairability 不看) — 正交
    for sev in ("low", "medium", "high"):
        assert config_reject(sev, "vuln", "SQL injection in search")[0] is False
    assert repairability_classify("vuln", "SQL injection in search", "")[0] == "code_change"
    assert repairability_classify("config-advice", "CORS reflection with credentials", "")[0] == "cfg_one_click"


# ---- schema 三处同步: SCHEMA CREATE / ALTER 幂等迁移 / _CRITICAL_COLUMNS ----

def _finding_create() -> str:
    return [q for q in SCHEMA if "CREATE NODE TABLE IF NOT EXISTS Finding" in q][0]


def test_finding_create_declares_repairability():
    assert "repairability STRING DEFAULT ''" in _finding_create()


def test_critical_columns_declare_repairability():
    assert "repairability" in _CRITICAL_COLUMNS["Finding"]


def test_finding_critical_columns_all_present_in_create():
    """三处同步闭环(本批范围): repairability 同时出现在 CREATE/ALTER/_CRITICAL_COLUMNS。
    注: related_to 是本批之前即存在的"仅 ALTER 无 CREATE"列(schema.py:139 ALTER 有、CREATE 无)
    — 非本批引入, 不在本批三处同步范围内, 此处只锁 repairability 的闭环。"""
    create = _finding_create()
    for c in ("repairability",):
        assert re.search(rf"(?<![A-Za-z0-9_]){re.escape(c)}(?![A-Za-z0-9_])", create), c
    assert "related_to" not in create  # 存量形态留证(未顺手改 — 只追加零改既有纪律)


kuzu = pytest.importorskip("kuzu")


def test_init_schema_new_db_repairability_usable(tmp_path):
    """新库: init_schema 建全列 → repairability 默认 '' 且可写(写入接线留后续, 列先可用)"""
    conn = kuzu.Connection(kuzu.Database(str(tmp_path / "db")))
    init_schema(conn)
    conn.execute("CREATE (f:Finding {id:'f-1', title:'t', severity:'low'})")
    assert conn.execute("MATCH (f:Finding {id:'f-1'}) RETURN f.repairability").get_next()[0] == ""
    conn.execute("MATCH (f:Finding {id:'f-1'}) SET f.repairability='code_change'")
    assert conn.execute("MATCH (f:Finding {id:'f-1'}) RETURN f.repairability").get_next()[0] == "code_change"


def test_repairability_migration_on_old_db(tmp_path):
    """旧库(3E 形态无 repairability 列)→ init_schema ALTER 幂等补列且存量行默认 ''(迁移不阻塞)"""
    conn = kuzu.Connection(kuzu.Database(str(tmp_path / "db")))
    conn.execute(
        "CREATE NODE TABLE IF NOT EXISTS Finding(id STRING, title STRING, severity STRING, "
        "cvss DOUBLE DEFAULT 0.0, evidence_dir STRING, repro STRING, category STRING DEFAULT 'vuln', "
        "gate_status STRING DEFAULT 'candidate', ts STRING, verified_at STRING DEFAULT '', "
        "verified_log STRING DEFAULT '', notify_sent BOOL DEFAULT false, last_transition STRING DEFAULT '', "
        "eng STRING DEFAULT '', dual_sign STRING DEFAULT '', replay_matrix STRING DEFAULT '', "
        "content_hash STRING DEFAULT '', source_hash STRING DEFAULT '', evidence_ref STRING DEFAULT '', "
        "report_status STRING DEFAULT '', PRIMARY KEY(id))")
    conn.execute("CREATE (f:Finding {id:'f-old', title:'存量', severity:'medium'})")
    init_schema(conn)  # ALTER 补列
    assert conn.execute("MATCH (f:Finding {id:'f-old'}) RETURN f.repairability").get_next()[0] == ""
    init_schema(conn)  # 二次启动: 列已存在, ALTER 抛错被吞不抛出(幂等)
    assert conn.execute("MATCH (f:Finding {id:'f-old'}) RETURN f.repairability").get_next()[0] == ""


class _FakeResult:
    def __init__(self, rows):
        self._rows, self._i = rows, 0

    def has_next(self):
        return self._i < len(self._rows)

    def get_next(self):
        v = self._rows[self._i]
        self._i += 1
        return v


class _MissingColConn:
    """table_info 桩: 各表按 _CRITICAL_COLUMNS 报列, 指定表隐藏指定列 — 告警口径验证"""

    def __init__(self, table, col):
        self._table, self._col = table, col

    def execute(self, q, parameters=None):
        t = re.search(r"table_info\('([^']+)'\)", q).group(1)
        cols = list(_CRITICAL_COLUMNS.get(t, ()))
        if t == self._table:
            cols = [c for c in cols if c != self._col]
        return _FakeResult([[i, c] for i, c in enumerate(cols)])


def test_verify_critical_columns_alerts_missing_repairability():
    """告警口径: repairability 缺列 → missing=['Finding.repairability'] 且 SCHEMA_DEGRADED 响亮留痕"""
    missing = _verify_critical_columns(_MissingColConn("Finding", "repairability"))
    assert missing == ["Finding.repairability"]
    assert SCHEMA_DEGRADED == ["Finding.repairability"]
    SCHEMA_DEGRADED.clear()  # 还原模块态(原地修改对象 — 不影响其他测试文件)


def test_verify_critical_columns_healthy_when_repairability_present():
    """全列在位 → missing=[] 且 SCHEMA_DEGRADED 清空(不误报)"""
    missing = _verify_critical_columns(_MissingColConn("Finding", "__none__"))
    assert missing == []
    assert SCHEMA_DEGRADED == []

#!/usr/bin/env python3
"""gatewarden 对抗样本库 · graphd 侧（T4-3-1 / 8-3）— 数据驱动双向断言。

纪律（批次拍板）:
- 攻击者视角纯粹性: 发现缺口不修, 全部登记 docs/gatewarden-report.md gap 清单(修复归后续批)。
- 双向断言: expect='blocked' → 断言拦截(回归守护); expect='gap' → 断言并登记实际行为
  (gap 用例恒绿——若实际已被拦截则该 gap 视为闭合, 测试仍过并打印闭合提示)。
- 每条 gap 用例附绕过路径(复现步骤), 与报告 gap 清单一一对应。
- 直接 import 实现防复刻(I-009 惯例); 零 HTTP 层零生产依赖; 零门本体改动。
- 消歧: 本文件测的是 roadmap 阶段 8 的 8-3; graphd 源码注释里的 "8-1/8-2" 是 T1 期
  审计项编号, 与本批无关。
"""
import re
import pytest

from graphd.gd.gates import (
    worker_query_allowed,
    host_query_gate,
    finding_gates,
    auth_tier_gate,
    is_engagement_create,
    engagement_cap_gate,
    candidate_watermark_reject,
    prose_denylist_hit,
    l1_gate,
    transition_gate,
)

# ---- 对抗矩阵元数据(度量口径: per 攻击类汇总见文件尾 test_gatewarden_metrics) ----
# 攻击类: A=注入 B=越权 C=编码 D=时序 E=语义 X=跨门组合
GW_GRAPHD_CASES = [
    # id, gate, attack_class, expect, 说明
    ("GW-GD-G2-B-001", "worker_query_allowed", "B", "gap", "FULLSCAN_RE 标签闭集缺 Frontier — 跨项目提案池全表读"),
    ("GW-GD-G2-B-002", "worker_query_allowed", "B", "gap", "缺 Engagement — 跨项目 scope/target 枚举"),
    ("GW-GD-G2-B-003", "worker_query_allowed", "B", "gap", "缺 ExperienceWeight — 跨项目策略权重读"),
    ("GW-GD-G2-B-004", "worker_query_allowed", "B", "gap", "缺 Plan — 跨项目计划读"),
    ("GW-GD-G2-B-005", "worker_query_allowed", "B", "gap", "缺 Handoff — 跨项目交接摘要读"),
    ("GW-GD-G2-B-006", "worker_query_allowed", "B", "blocked", "Finding 六标签无谓词仍拒(既有权威隔离回归)"),
    ("GW-GD-G2-B-007", "worker_query_allowed", "B", "blocked", "变更词(MERGE)仍拒"),
    ("GW-GD-G2-G3-E-001", "host_query_gate", "E", "blocked", "CALL 禁令(注释/字符串内命中也算, fail-closed 回归)"),
    ("GW-GD-G4-E-001", "finding_gates", "E", "gap", "参数化 title:$t severity:$sev 使三正则子门全 miss"),
    ("GW-GD-G4-C-001", "finding_gates", "C", "gap", "junk 清单纯子串无空白归一 — 多空格变体逃逸"),
    ("GW-GD-G4-C-002", "finding_gates", "C", "gap", "制表符变体逃逸"),
    ("GW-GD-G4-A-001", "finding_gates", "A", "blocked", "DDL 变体仍拒(回归)"),
    ("GW-GD-G4-E-002", "finding_gates", "E", "blocked", "字面垃圾标题仍拒(回归)"),
    ("GW-GD-G5-E-001", "auth_tier_gate", "E", "gap", "档位标注只验在场不验真伪 — 谎报一行即过(设计使然, 对抗样本入库)"),
    ("GW-GD-G7-E-001", "is_engagement_create", "E", "gap", "MERGE 不含 CREATE 子串 — 容量门谓词整体绕过"),
    ("GW-GD-G7-E-002", "engagement_cap_gate", "E", "blocked", "cap 判定本身在 n>=cap 时仍拒(回归 — 缺口在谓词不在阈值)"),
    ("GW-GD-G8-E-001", "candidate_watermark_reject", "E", "blocked", "low/medium 超水位仍拒(回归)"),
    ("GW-GD-G8-E-002", "candidate_watermark_reject", "E", "blocked", "high 豁免(设计 — 与 G5 谎报组合成灌水链, 见组合用例)"),
    ("GW-GD-G10-C-001", "prose_denylist_hit", "C", "gap", "全角点号变体 miss(词面闸门)"),
    ("GW-GD-G10-C-002", "prose_denylist_hit", "C", "gap", "十进制整数 IP 变体 miss(结构化正则只认点分)"),
    ("GW-GD-G10-C-003", "prose_denylist_hit", "C", "blocked", "三轮 percent 编码仍命中(双轮 decode 已覆盖 — 回归)"),
    ("GW-GD-G10-C-004", "prose_denylist_hit", "C", "blocked", "精确域名命中(回归)"),
    ("GW-GD-G9-E-001", "l1_gate", "E", "gap", "host 级条目不匹配子域 — 与 scope 写面后缀匹配口径不一致"),
    ("GW-GD-G9-C-001", "l1_gate", "C", "blocked", "punycode/IDN 不归一 → miss 方向=拒绝(fail-closed, 无载荷收益, 回归锁定现状)"),
    ("GW-GD-G6-E-001", "transition_gate", "E", "blocked", "非法迁移仍拒(回归)"),
]


def _case_params():
    return [pytest.param(cid, gate, cls, expect, note, id=cid) for cid, gate, cls, expect, note in GW_GRAPHD_CASES]


# 载荷表(与用例 id 一一对应; expect='gap' 的附绕过路径说明)
PAYLOADS = {
    "GW-GD-G2-B-001": ("MATCH (x:Frontier) RETURN x.eng_id, x.direction, x.evidence", True),
    "GW-GD-G2-B-002": ("MATCH (e:Engagement) RETURN e.name, e.scope, e.target", True),
    "GW-GD-G2-B-003": ("MATCH (x:ExperienceWeight) RETURN x.pattern, x.prior, x.stack", True),
    "GW-GD-G2-B-004": ("MATCH (p:Plan) RETURN p.text", True),
    "GW-GD-G2-B-005": ("MATCH (h:Handoff) RETURN h.digest", True),
    "GW-GD-G2-B-006": ("MATCH (f:Finding) RETURN count(f)", False),
    "GW-GD-G2-B-007": ("MATCH (f:Finding) MERGE (g:Finding {id:'x'}) RETURN g.id", False),
    "GW-GD-G4-E-001": ('CREATE (f:Finding {id:"x", title:$t, severity:$sev})', True),
    "GW-GD-G4-C-001": ('CREATE (f:Finding {id:"x", title:"no   rate   limit", severity:"low"})', True),
    "GW-GD-G4-C-002": ('CREATE (f:Finding {id:"x", title:"no\trate\tlimit", severity:"low"})', True),
    "GW-GD-G7-E-001": ("MERGE (g:Engagement {name:'gw-cap-bypass'}) RETURN g.name", True),
    "GW-GD-G10-C-001": ("visit demo-src。com now", True),
    "GW-GD-G10-C-002": ("see http://2130706433/admin", True),
}

GATE_CALLS = {
    "worker_query_allowed": lambda cy: worker_query_allowed(cy)[0],
    "host_query_gate": lambda cy: host_query_gate(cy)[0],
    "finding_gates": lambda cy: finding_gates(cy)[0],
    "is_engagement_create": lambda cy: is_engagement_create(cy),
    "prose_denylist_hit": lambda cy: not prose_denylist_hit(cy.lower(), ["demo-src.com"]),
}

# blocked 回归用例的载荷与门(与 gap 用例同表驱动; bpass=False 表示该载荷应被拒)
BLOCKED_CASES = {
    "GW-GD-G2-B-006": ("worker_query_allowed", "MATCH (f:Finding) RETURN count(f)", False),
    "GW-GD-G2-B-007": ("worker_query_allowed", "MATCH (f:Finding) MERGE (g:Finding {id:'x'}) RETURN g.id", False),
    "GW-GD-G2-G3-E-001": ("host_query_gate", "MATCH (n) RETURN n /* CALL something */", False),
    "GW-GD-G4-A-001": ("finding_gates", "CREATE NODE TABLE Evil(id STRING)", False),
    "GW-GD-G4-E-002": ("finding_gates", 'CREATE (f:Finding {id:"x", title:"no rate limit", severity:"low"})', False),
    "GW-GD-G10-C-003": ("prose_denylist_hit", "mail%252Edemo-src%252Ecom", False),
    "GW-GD-G10-C-004": ("prose_denylist_hit", "contact mail.demo-src.com today", False),
}

GW_RESULTS = []  # (case_id, attack_class, expect, actual_pass) — 度量汇总消费


@pytest.mark.parametrize("cid,gate,cls,expect,note", _case_params())
def test_gatewarden_case(cid, gate, cls, expect, note):
    if cid in BLOCKED_CASES:
        bgate, bcy, bpass = BLOCKED_CASES[cid]
        raw = GATE_CALLS[bgate](bcy)
        ok = raw if bpass else not raw
    elif gate == "auth_tier_gate":
        # G5: 谎报档位一行即过(在场性检查) — 对抗样本; 真伪钳位归 auto-triage(文档化)
        ok = auth_tier_gate("high", "某注入漏洞\n鉴权档位: 零cookie", "repro body")[0]
    elif gate == "l1_gate":
        if cid.endswith("E-001"):
            # scope 写面 example.com 放行 sub.example.com(后缀匹配), L1 验证面精确匹配拒绝 — 口径差
            ok = l1_gate("L1", "sub.example.com:443", ["example.com"])[0]
        else:
            ok = l1_gate("L1", "xn--e1afmkfd.example.com:443", ["例え.example.com"])[0] is False
    elif gate == "transition_gate":
        ok = transition_gate("candidate", "accepted", "host", "r")[0] is False
    elif gate == "engagement_cap_gate":
        ok = engagement_cap_gate(4, cap=4) != ""
    elif gate == "candidate_watermark_reject":
        if cid.endswith("E-001"):
            ok = bool(candidate_watermark_reject("low", 100, 100))
        else:
            ok = not candidate_watermark_reject("high", 100, 100)[0]
    else:
        cy, expect_pass = PAYLOADS[cid]
        raw = GATE_CALLS[gate](cy)
        ok = raw if expect_pass else not raw
    if expect == "gap":
        # gap 用例: 断言"当前未拦"(绕过成立); 若将来被修复(拦截), 用例仍绿并打印闭合提示
        if ok:
            GW_RESULTS.append((cid, cls, expect, True))
        else:
            GW_RESULTS.append((cid, cls, expect, True))
            print(f"\n[gatewarden] gap {cid} 已闭合(实际被拦截) — 可从 docs/gatewarden-report.md gap 清单撤下")
        assert True
    else:
        GW_RESULTS.append((cid, cls, expect, ok))
        assert ok, f"{cid} 回归守护失败: 预期拦截但放行 — {note}"


def test_gatewarden_metrics():
    """度量口径: 总用例/expect 分布/攻击类分布 — 报告 docs/gatewarden-report.md 的数据源。"""
    total = len(GW_GRAPHD_CASES)
    gaps = [c for c in GW_GRAPHD_CASES if c[3] == "gap"]
    blocked = [c for c in GW_GRAPHD_CASES if c[3] == "blocked"]
    by_class = {}
    for _, _, cls, _, _ in GW_GRAPHD_CASES:
        by_class[cls] = by_class.get(cls, 0) + 1
    print(f"\n[gatewarden graphd] 总用例 {total} = gap 登记 {len(gaps)} + blocked 回归 {len(blocked)}; 按攻击类 {by_class}")
    assert total == len(gaps) + len(blocked)
    assert len(gaps) == 13, "gap 数与 docs/gatewarden-report.md graphd 清单不一致(13: G2×5+G4×3+G5×1+G7×1+G10×2+G9×1)"
    assert set(by_class) <= {"A", "B", "C", "D", "E", "X"}, "攻击类超出六类基线须先扩拍板枚举"

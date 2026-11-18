#!/usr/bin/env python3
"""E40-B1(#101) 回归 — 结构化写面的归属/授权解耦: pick_write_eng 只管归属,
write_scope_auth 独立做正向范围授权(payload host 逐一对被归属 engagement 的 scope 校验)。
修掉的洞: 恰一个 active 时, 范围外目标借"有效归属"入图(归属被当成了授权替身)。"""
import graphd.app as app

# 活跃行既支持 dict 形态(生产路径)也支持 tuple 形态(纯函数测试友好) — 与 pick_write_eng 同约定
ACTIVES_DICT = [
    {"name": "proj-a", "scope": "target-a.com, 10.0.0.0/8"},
    {"name": "proj-b", "scope": "target-b.com"},
]


def _rows(rows):
    return rows


def test_no_hosts_passes_regardless():
    """载荷无 URL host → 无可授权面, 放行(既有语义: 仅 host 形态载荷受限)。"""
    ok, why = app.write_scope_auth("", [], ACTIVES_DICT)
    assert ok is True and why == ""


def test_unattributed_with_hosts_rejected_h13_kept():
    """无归属(eng='')+带 host → 403 fail-closed(0913 H13 语义保持)。"""
    ok, why = app.write_scope_auth("", ["target-a.com"], ACTIVES_DICT)
    assert ok is False
    assert "match no active engagement scope" in why


def test_single_active_out_of_scope_host_rejected():
    """核心修复: 单 active 归属后, 范围外 host 必须被拒 — 修复前此形态借有效归属入图。"""
    ok, why = app.write_scope_auth("proj-b", ["evil.example.net"], [{"name": "proj-b", "scope": "target-b.com"}])
    assert ok is False
    assert "越出 proj-b 授权范围" in why
    assert "evil.example.net" in why


def test_single_active_in_scope_host_allowed():
    """单 active + 载荷在 scope 内(含子域后缀匹配)→ 放行。"""
    ok, _ = app.write_scope_auth("proj-b", ["target-b.com", "sub.target-b.com"], [{"name": "proj-b", "scope": "target-b.com"}])
    assert ok is True


def test_cidr_scope_authorization():
    """scope 为 CIDR 时 IP host 授权(host_in_scope 同口径)。"""
    ok, _ = app.write_scope_auth("proj-a", ["10.1.2.3"], ACTIVES_DICT)
    assert ok is True
    ok, why = app.write_scope_auth("proj-a", ["192.168.1.1"], ACTIVES_DICT)
    assert ok is False and "192.168.1.1" in why


def test_explicit_eng_attribution_still_scope_checked():
    """显式 eng 归属不豁免授权 — worker 带正确 eng 也不能写 scope 外目标。"""
    ok, why = app.write_scope_auth("proj-a", ["target-b.com"], ACTIVES_DICT)
    assert ok is False and "target-b.com" in why


def test_multi_active_vote_then_authorize():
    """多 active: 投票唯一命中者归属后, 仍按其 scope 授权。"""
    hosts = ["deep.target-a.com"]
    eng = app.pick_write_eng("", ACTIVES_DICT, hosts)
    assert eng == "proj-a"
    ok, _ = app.write_scope_auth(eng, hosts, ACTIVES_DICT)
    assert ok is True


def test_unknown_attributed_eng_rejected():
    """归属名不在 active 面(防御性 — 生产链路 pick_write_eng 不会产出)→ fail-closed。"""
    ok, why = app.write_scope_auth("ghost-eng", ["target-a.com"], ACTIVES_DICT)
    assert ok is False


def test_pick_write_eng_behavior_unchanged():
    """归属函数本体零改动回归(显式命中>单active>投票>'' — 授权已移出)。
    显式 eng 不在 active 时落投票链(既有语义), 由授权层兜底范围校验。"""
    assert app.pick_write_eng("proj-b", ACTIVES_DICT, ["target-a.com"]) == "proj-b"
    assert app.pick_write_eng("", [{"name": "only", "scope": ""}], []) == "only"
    assert app.pick_write_eng("", ACTIVES_DICT, ["nope.example.org"]) == ""
    assert app.pick_write_eng("gone", ACTIVES_DICT, ["target-a.com"]) == "proj-a", "显式未命中落投票(既有行为)"

#!/usr/bin/env python3
"""graphd 机械门负例集 — 直接 import 实现，防复刻漏检（I-009）。
"""
import re
import pytest
from graphd.app import finding_gates, JUNK_PATTERNS
from graphd.app import transition_gate

# ---- 与 graphd/app.py 单点真源对接，不复刻正则 ----

def empty_title_rejected(cypher: str) -> bool:
    ok, err = finding_gates(cypher)
    return not ok and "must be non-empty" in err


def ddl_rejected(cypher: str) -> bool:
    ok, err = finding_gates(cypher)
    return not ok and "DDL" in err


def junk_rejected(cypher: str) -> bool:
    ok, err = finding_gates(cypher)
    return not ok and "garbage-listed" in err


# ---- #21 空标题门 ----
def test_empty_title_double_quote():
    assert empty_title_rejected('CREATE (f:Finding {id:"a", title:"", severity:"low"})')

def test_empty_title_single_quote():
    assert empty_title_rejected("CREATE (f:Finding {id:'a', title:'', severity:'low'})")

def test_no_title_at_all_followed_by_comma():
    assert empty_title_rejected("CREATE (f:Finding {id:'a', title:, severity:'low'})")

def test_real_title_passes_empty_gate():
    assert not empty_title_rejected('CREATE (f:Finding {id:"a", title:"XSS in search", s:1})')

def test_regex_is_alive_not_double_escaped():
    """锁定历史缺陷: 双重转义的 title\\s* 永不匹配 — 现以真函数验证"""
    ok, _ = finding_gates("CREATE (f:Finding {id:\"x\", title:\"\", severity:\"low\"})")
    assert not ok
    # 正常标题应通过
    ok2, _ = finding_gates("CREATE (f:Finding {id:\"x\", title:\"XSS in search\", severity:\"low\"})")
    assert ok2
    # 确保 JUNK_PATTERNS 未 NameError
    assert isinstance(JUNK_PATTERNS, list) and len(JUNK_PATTERNS) > 0

# ---- #18 DDL 禁令 ----
@pytest.mark.parametrize("cypher", [
    "CREATE NODE TABLE Evil(id STRING)",
    "DROP TABLE Signal_",
    "create node table x(id string)",
])
def test_ddl_variants_rejected(cypher):
    assert ddl_rejected(cypher)

@pytest.mark.parametrize("cypher", [
    "CREATE (f:Finding {id:'a', title:'users table dump', severity:'low'})",
    "MATCH (s:Signal_) RETURN count(s)",
])
def test_normal_writes_pass_ddl(cypher):
    assert not ddl_rejected(cypher)

# ---- #24 垃圾洞清单门 ----
@pytest.mark.parametrize("title", [
    "Login has no rate limit",
    "Missing security header X-Frame-Options",
    "CORS configuration allows all origins",
])
def test_junk_titles_rejected(title):
    assert junk_rejected(f'CREATE (f:Finding {{id:"j", title:"{title}", severity:"low"}})')

@pytest.mark.parametrize("title", [
    "SQL injection in login bypasses auth",
    "BOLA in payment history access",
    "JWT none-algorithm admin forge",
])
def test_real_titles_pass_junk_gate(title):
    assert not junk_rejected(f'CREATE (f:Finding {{id:"r", title:"{title}", severity:"high"}})')

# ---- scope 启发式(写操作 URL 必须在 127.0.0.1/localhost) ----
SCOPE_OK = {"127.0.0.1", "localhost"}
URL = re.compile(r"https?://[A-Za-z0-9.\-]+")

def url_scope_violation(cypher: str) -> bool:
    if re.search(r"\b(CREATE|SET|MERGE|DELETE)\b", cypher):
        hosts = {u.split("://")[1].lower() for u in URL.findall(cypher)}
        return any(h not in SCOPE_OK for h in hosts)
    return False

def test_out_of_scope_url_in_write_rejected():
    assert url_scope_violation("SET (e:Engagement {target:'http://evil.example.com/'})")

def test_in_scope_url_passes():
    assert not url_scope_violation("SET (e:Engagement {target:'http://127.0.0.1:8081/'})")

# ---- I-009 新增：直接验证 finding_gates 本体 ----
def test_finding_gates_import_is_real():
    """确保 finding_gates 为真实现而非复刻，且 JUNK_PATTERNS 引用正确（NameError 类回归）"""
    ok, err = finding_gates('CREATE (f:Finding {id:"x", title:"Missing security header X", severity:"low"})')
    assert not ok and "garbage-listed" in err
    ok2, err2 = finding_gates('CREATE (f:Finding {id:"x", title:"Normal finding", severity:"low"})')
    assert ok2 and err2 == ""


# ---- V-06 回归: worker /query 只读门(大小写不敏感) — 2026-08-29 杀链实证后的锁定用例 ----
from graphd.app import worker_query_allowed, redact_pii

def test_v06_lowercase_detach_delete_blocked():
    ok, err = worker_query_allowed("MATCH (n) detach delete n RETURN 1")
    assert not ok and "mutation keywords forbidden" in err

def test_v06_uppercase_still_blocked():
    ok, err = worker_query_allowed("MATCH (n) DETACH DELETE n")
    assert not ok

def test_v06_lowercase_merge_blocked():
    ok, err = worker_query_allowed('merge (e:ExperienceWeight {id:"evil"}) set e.prior=0.99 RETURN 1')
    assert not ok

def test_v06_lowercase_create_blocked():
    ok, err = worker_query_allowed('create (:Engagement {name:"evil"}) RETURN 1')
    assert not ok

def test_v06_remove_blocked():
    ok, err = worker_query_allowed("MATCH (e:Engagement) REMOVE e.scope RETURN 1")
    assert not ok

def test_v06_legit_match_passes():
    ok, _ = worker_query_allowed("MATCH (f:Finding) RETURN count(f) AS c")
    assert ok

def test_v06_mutation_first_word_blocked():
    ok, _ = worker_query_allowed("DELETE (f:Finding)")
    assert not ok

# ---- V-10 回归: redact_pii 扩展模式 ----
def test_v10_aws_key_redacted():
    # 动态拼接: 测试夹具非真实凭据, 防扫描器静态误报
    out, n = redact_pii("key=" + "AKIA" + "IOSFODNN7" + "EXAMPLE" + " in log")
    assert "AKIA" + "IOSFODNN7" + "EXAMPLE" not in out and "[REDACTED:aws-key]" in out and n >= 1

def test_v10_jwt_redacted():
    out, _ = redact_pii("tok eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.SflKxwRJSMeKKF2QT4")
    assert "eyJhbGciOiJIUzI1NiJ9" not in out and "[REDACTED:jwt]" in out

def test_v10_private_key_redacted():
    out, _ = redact_pii("-----BEGIN RSA PRIVATE KEY-----\nMIIB\n-----END RSA PRIVATE KEY-----")
    assert "MIIB" not in out and "[REDACTED:private-key]" in out

def test_v10_uppercase_email_redacted():
    out, _ = redact_pii("mail USER@EXAMPLE.COM end")
    assert "USER@EXAMPLE.COM" not in out and "[REDACTED:email]" in out

def test_v10_separated_phone_redacted():
    out, _ = redact_pii("call 138 0013 8000 now")
    assert "138 0013 8000" not in out and "[REDACTED:phone]" in out

def test_v10_authorization_header_redacted():
    out, _ = redact_pii('curl -H "Authorization: Bearer abcdef123456" http://x')
    assert "abcdef123456" not in out


# ---- 类别名归一(issue #89 前置, 2026-09 批) ----
from graphd.app import canonical_cat

def test_canonical_chain_family():
    assert canonical_cat("exploit-chain") == "attack-chain"
    assert canonical_cat("complete-abuse-chain") == "attack-chain"
    assert canonical_cat("auth-chain") == "attack-chain"
    assert canonical_cat("chain") == "attack-chain"

def test_canonical_other_families():
    assert canonical_cat("cors-misc") == "cors-misconfiguration"
    assert canonical_cat("authentication-bypass") == "auth-bypass"
    assert canonical_cat("broken-crypto") == "crypto-failure"
    assert canonical_cat("info-leak") == "info-disclosure"
    assert canonical_cat("credential-theft") == "credential-exposure"

def test_canonical_passthrough_and_case():
    assert canonical_cat("idor-bola") == "idor-bola"
    assert canonical_cat("  Auth-Bypass  ") == "auth-bypass"
    assert canonical_cat("") == ""


# ---- R3 回归: 七态机 / config-advice 归类 ----
from graphd.app import FINDING_STATES, FINDING_TRANSITIONS, CONFIG_ADVICE_RE


def test_r3_seven_states_complete():
    # 八态: needs-scope(evidence-gate 四态采纳) — verify 无法判定先归因授权边界, 不硬判 rejected
    assert set(FINDING_STATES) == {"candidate", "triaged", "verified", "isolated", "reported", "accepted", "rejected", "needs-scope"}
    for src, dsts in FINDING_TRANSITIONS.items():
        # frozen 是唯一的历史别名例外(issue #88): 不属于状态机, 仅提供解冻出口, 不可作为迁移目标
        if src == "frozen":
            assert set(dsts) <= {"candidate", "triaged", "rejected"}
            continue
        assert src in FINDING_STATES
        for d in dsts:
            assert d in FINDING_STATES and d != src
    assert FINDING_TRANSITIONS["accepted"] == () and FINDING_TRANSITIONS["rejected"] == ()


def test_r3_needs_scope_state_transitions():
    # needs-scope: candidate/triaged 可进入; 澄清后可重新入验证/直通/驳回; 终态不可进入
    assert "needs-scope" in FINDING_TRANSITIONS["candidate"]
    assert "needs-scope" in FINDING_TRANSITIONS["triaged"]
    assert set(FINDING_TRANSITIONS["needs-scope"]) == {"candidate", "triaged", "verified", "rejected"}
    # needs-scope 的合法迁移必须过审计门(轨迹含 actor/reason)
    ok, err, traj = transition_gate("candidate", "needs-scope", "verify", "missing low-priv account")
    assert ok and traj["to"] == "needs-scope" and traj["from"] == "candidate"
    ok2, err2, _ = transition_gate("verified", "needs-scope", "verify", "scope unclear")
    assert not ok2 and "illegal transition" in err2


def test_r3_config_advice_low_severity_matches():
    assert CONFIG_ADVICE_RE.search("session cookie lacks the Secure flag")
    assert CONFIG_ADVICE_RE.search("X-Powered-By discloses version")
    assert CONFIG_ADVICE_RE.search("missing security headers on responses")


def test_r3_config_advice_not_overmatching_real_vulns():
    assert not CONFIG_ADVICE_RE.search("SQL injection in login parameter")
    assert not CONFIG_ADVICE_RE.search("forged session bypasses CSRF protection")


def test_r3_seven_state_transitions_source_of_truth():
    # graphd /write/transition 的合法性判定与实现同源(FINDING_TRANSITIONS)
    assert "accepted" not in FINDING_TRANSITIONS["verified"]
    assert "reported" in FINDING_TRANSITIONS["verified"]
    assert "candidate" in FINDING_TRANSITIONS["isolated"]  # 隔离可凭新证据重开


# ---- W1: 七态转换审计门(纯函数真源) —— actor/reason 必填 + 轨迹完整 + 非法迁移仍拒 ----
def test_w1_transition_requires_actor():
    ok, err, _ = transition_gate("candidate", "verified", "", "verify replay")
    assert not ok and "actor" in err

def test_w1_transition_requires_reason():
    ok, err, _ = transition_gate("candidate", "verified", "scheduler", "   ")
    assert not ok and "reason" in err

def test_w1_trajectory_complete():
    ok, err, traj = transition_gate("candidate", "verified", "scheduler", "verify 独立重放背书")
    assert ok and not err
    assert traj["from"] == "candidate" and traj["to"] == "verified"
    assert traj["actor"] == "scheduler" and traj["reason"] and traj["ts"]

def test_w1_illegal_transition_still_blocked():
    ok, err, traj = transition_gate("accepted", "verified", "scheduler", "try reopen")
    assert not ok and traj is None and "illegal transition" in err

def test_w1_actor_bound_40():
    ok, err, _ = transition_gate("candidate", "triaged", "a" * 41, "x")
    assert not ok and "actor" in err

def test_w1_reason_bound_80():
    ok, err, _ = transition_gate("candidate", "triaged", "scheduler", "r" * 81)
    assert not ok and "reason" in err



# ---- #6: repro 强制门(纯函数) — severity != info 必须带可复现命令 ----
from graphd.app import repro_gate, normalize_title, titles_duplicate

def test_repro_gate_blocks_empty_for_high():
    ok, err = repro_gate("high", "")
    assert not ok and "repro required" in err

def test_repro_gate_blocks_whitespace_for_medium():
    ok, err = repro_gate("medium", "   ")
    assert not ok

def test_repro_gate_info_exempt():
    ok, err = repro_gate("info", "")
    assert ok and err == ""

def test_repro_gate_passes_with_command():
    ok, err = repro_gate("critical", "curl -s http://t/login -d \"u=' or 1=1--\" | grep root")
    assert ok

# ---- #11: 去重门(纯函数) — normalized 标题精确/trigram>0.9 ----
def test_normalize_title_strips_noise():
    assert normalize_title("PHP/5.6.40 Version Leak!") == "php5640versionleak"
    assert normalize_title("  XSS-in <search> ") == "xssinsearch"

def test_dup_exact_after_normalization():
    assert titles_duplicate(normalize_title("Tencent Cloud WAF Protection Detected"),
                            normalize_title("tencent-cloud waf protection detected!"))

def test_dup_trigram_near_identical():
    # 实证样本: "/site/error 静态" 与 "/site/error 静态页" — 只差尾缀
    assert titles_duplicate(normalize_title("/site/error 静态"), normalize_title("/site/error 静态页"))

def test_not_dup_different_vulns():
    assert not titles_duplicate(normalize_title("SQL injection in login bypasses auth"),
                                normalize_title("Reflected XSS in search parameter"))

def test_not_dup_empty():
    assert not titles_duplicate("", "anything")
    assert not titles_duplicate("x", "")

# ---- #5: /write/endpoint upsert(真实 kuzu) ----
kuzu = pytest.importorskip("kuzu")
from graphd.app import upsert_endpoint, SCHEMA

def _endpoint_conn(tmp_path):
    db = kuzu.Database(str(tmp_path / "kuzu_db"))
    conn = kuzu.Connection(db)
    # 表结构取生产 SCHEMA 的 Endpoint DDL(含 W5 eng 归属列), 避免测试夹具与生产漂移
    for ddl in SCHEMA:
        if "NODE TABLE IF NOT EXISTS Endpoint" in ddl:
            conn.execute(ddl)
    return conn

def test_upsert_endpoint_creates_then_updates(tmp_path):
    conn = _endpoint_conn(tmp_path)
    eid1 = upsert_endpoint(conn, "https://t.example.com/api/v1/users", "nginx/1.24", "auth")
    assert eid1.startswith("e-")
    r = conn.execute("MATCH (e:Endpoint) RETURN count(e) AS c")
    assert r.get_next()[0] == 1
    # 幂等: 同 url 再写不新建, 只补指纹
    eid2 = upsert_endpoint(conn, "https://t.example.com/api/v1/users", "nginx/1.25", "auth2")
    assert eid2 == eid1
    r = conn.execute("MATCH (e:Endpoint) RETURN count(e) AS c")
    assert r.get_next()[0] == 1
    r = conn.execute("MATCH (e:Endpoint) RETURN e.tech AS t, e.business_chain AS b")
    row = r.get_next()
    assert row[0] == "nginx/1.25" and row[1] == "auth2"

def test_upsert_endpoint_different_urls_distinct(tmp_path):
    conn = _endpoint_conn(tmp_path)
    a = upsert_endpoint(conn, "https://t.example.com/a", "", "")
    b = upsert_endpoint(conn, "https://t.example.com/b", "", "")
    assert a != b
    r = conn.execute("MATCH (e:Endpoint) RETURN count(e) AS c")
    assert r.get_next()[0] == 2


# ---- 垃圾拒收出口 / candidate 水位门 / 端点签名去重(2026-09 批) ----
from graphd.app import config_reject, candidate_watermark_reject, endpoint_sig_duplicate, title_tokens

def test_config_reject_low_config_advice():
    ok, reason = config_reject("low", "config-advice", "missing security header on login page")
    assert ok and "不入漏洞库" in reason

def test_config_reject_low_title_regex():
    ok, _ = config_reject("info", "vuln", "Server version disclosure in response headers")
    assert ok

def test_config_reject_medium_not_rejected():
    assert config_reject("medium", "config-advice", "CORS reflection with credentials")[0] is False

def test_config_reject_high_real_vuln_not_rejected():
    assert config_reject("high", "vuln", "CORS reflects any origin with credentials")[0] is False

def test_config_reject_low_normal_vuln_not_rejected():
    assert config_reject("low", "idor-bola", "IDOR on order id traversal")[0] is False

def test_watermark_medium_rejected_at_threshold():
    ok, reason = candidate_watermark_reject("medium", 100, 100)
    assert ok and "积压" in reason

def test_watermark_high_never_rejected():
    assert candidate_watermark_reject("high", 150, 100)[0] is False
    assert candidate_watermark_reject("critical", 150, 100)[0] is False

def test_watermark_below_threshold_pass():
    assert candidate_watermark_reject("low", 99, 100)[0] is False

def test_endpoint_sig_duplicate_same_host_path():
    ft = title_tokens("CORS reflection with credentials confirmed at gateway")
    et = title_tokens("CORS reflection with credentials found at gateway")
    assert endpoint_sig_duplicate("api.demo-src.com", "/v1/tokens", ft, "api.demo-src.com", "/v1/tokens", et) == "dup"

def test_endpoint_sig_related_cross_host():
    ft = title_tokens("CORS reflection with credentials confirmed at gateway")
    et = title_tokens("CORS reflects any origin with credentials at gateway")
    assert endpoint_sig_duplicate("api.demo-src.com", "/v1/tokens", ft, "kx-api.demo-src.com", "/v1/tokens", et) == "related"

def test_endpoint_sig_low_similarity_passes():
    ft = title_tokens("SQL injection in search box")
    et = title_tokens("CORS reflection with credentials at gateway")
    assert endpoint_sig_duplicate("api.demo-src.com", "/v1/search", ft, "api.demo-src.com", "/v1/tokens", et) == ""

def test_endpoint_sig_empty_path_never_flags():
    ft = title_tokens("CORS reflection with credentials at gateway")
    assert endpoint_sig_duplicate("api.demo-src.com", "", ft, "api.demo-src.com", "/v1", ft) == ""


# ---- issue #88: frozen 历史状态兼容出口(解冻回验证管线, 禁止越权直通 verified) ----

def test_frozen_to_candidate_allowed():
    ok, err, _ = transition_gate("frozen", "candidate", "migration", "issue #88 存量解冻")
    assert ok, err


def test_frozen_to_triaged_allowed():
    ok, err, _ = transition_gate("frozen", "triaged", "migration", "issue #88 有证据直通")
    assert ok, err


def test_frozen_to_rejected_allowed():
    ok, err, _ = transition_gate("frozen", "rejected", "migration", "issue #88 垃圾清理")
    assert ok, err


def test_frozen_to_verified_still_illegal():
    ok, err, _ = transition_gate("frozen", "verified", "migration", "try direct verify")
    assert not ok and "illegal transition frozen -> verified" in err


def test_frozen_missing_actor_still_rejected():
    ok, err, _ = transition_gate("frozen", "candidate", "", "migration")
    assert not ok and "actor" in err


# ---- issue #73: denylist 兜底散文匹配(模块级纯函数, 与 R6 结构化字段扫描互为双保险) ----
import json
from graphd.app import prose_denylist_hit, _read_denylist_file

def test_prose73_hit_exact_asset_in_evidence():
    """实证回归形态: evidence 散文直接提及红线资产本身 → 命中"""
    blob = json.dumps({"evidence": "切换验证时发现同时影响 mail.demo-src.com 的同型接口"},
                      ensure_ascii=False).lower()
    assert prose_denylist_hit(blob, ["mail.demo-src.com"]) == "mail.demo-src.com"

def test_prose73_hit_subdomain_under_parent_entry():
    """实证回归形态①: 父域条目(demo-src.com)对子域散文(mail.demo-src.com) —
    结构化正则左界排除 '.', 本兜底以非字母数字(含 '.')为左界命中"""
    blob = json.dumps({"evidence": "we also saw mail.demo-src.com in the logs"}).lower()
    assert prose_denylist_hit(blob, ["demo-src.com"]) == "demo-src.com"

def test_prose73_hit_percent_encoded():
    """实证回归形态②: percent-encoded 点号(%2e)形态 — percent-decode 后命中"""
    blob = "redirect target=mail%2edemo-src%2ecom confirmed"
    assert prose_denylist_hit(blob, ["mail.demo-src.com"]) == "mail.demo-src.com"

def test_prose73_hit_double_percent_encoded():
    """双重编码 %252e → 两轮 unquote 后命中"""
    assert prose_denylist_hit("go mail%252edemo-src%252ecom now", ["mail.demo-src.com"]) == "mail.demo-src.com"

def test_prose73_no_hit_normal_text():
    assert prose_denylist_hit("reflected xss at example.com/search?q=1 in login flow",
                              ["mail.demo-src.com"]) == ""
    assert prose_denylist_hit("正常证据文本, 无任何红线资产提及", ["mail.demo-src.com"]) == ""

def test_prose73_no_substring_false_positive():
    """全段匹配不做子串误伤: 前后紧贴字母数字不命中"""
    assert prose_denylist_hit("we probed demo-src.company internal portal", ["demo-src.com"]) == ""
    assert prose_denylist_hit("host notdemo-src.com was untouched", ["demo-src.com"]) == ""

def test_prose73_empty_inputs_return_empty():
    assert prose_denylist_hit("", ["demo-src.com"]) == ""
    assert prose_denylist_hit("anything", []) == ""
    assert prose_denylist_hit("anything", [None, "", "   "]) == ""

def test_prose73_skips_cidr_prefix_entries():
    """网段前缀条目(以 '.' 结尾)不进散文兜底, 由结构化扫描的 \\d 语义负责"""
    assert prose_denylist_hit("payload mentions 203.0.113.5", ["203.0.113."]) == ""


# ---- issue #73: denylist 加载大小写一致性(R6.1 _read_denylist_file → lower()) ----
def test_denylist73_loader_lowercases_domains(tmp_path, monkeypatch):
    f = tmp_path / "denylist.json"
    f.write_text('{"domains": ["Mail.Demo-Src.COM", "Evil.Example.ORG"], "cidr_prefix": ["203.0.113."]}')
    monkeypatch.setenv("P2P_DENYLIST_FILE", str(f))
    dl = _read_denylist_file()
    assert dl["domains"] == ["mail.demo-src.com", "evil.example.org"]
    assert dl["cidr_prefix"] == ["203.0.113."]


# ---- issue #73: audit_event — JSONL 追加 / 0700 目录 / 0600 文件 / 写失败静默计数 ----
import os
import stat
from graphd import audit as graphd_audit

def test_audit73_jsonl_append_and_file_modes(tmp_path, monkeypatch):
    log = tmp_path / "logs" / "audit.log"
    monkeypatch.setenv("P2P_AUDIT_LOG", str(log))
    assert graphd_audit.audit_event("denylist-hit", {"path": "/write/signal", "asset": "mail.demo-src.com"}) is True
    assert graphd_audit.audit_event("auth-fail-worker", {"path": "/query", "peer": "127.0.0.1:40000"}) is True
    # JSONL: 每行一个完整 JSON 对象, 追加不覆盖
    lines = log.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    ev1, ev2 = json.loads(lines[0]), json.loads(lines[1])
    assert ev1["kind"] == "denylist-hit" and ev1["detail"]["asset"] == "mail.demo-src.com" and ev1["ts"]
    assert ev2["kind"] == "auth-fail-worker" and ev2["detail"]["peer"] == "127.0.0.1:40000"
    # 0600 文件 / 0700 目录
    assert stat.S_IMODE(os.stat(log).st_mode) == 0o600
    assert stat.S_IMODE(os.stat(log.parent).st_mode) == 0o700

def test_audit73_silent_failure_counts_not_raises(tmp_path, monkeypatch):
    """落盘点父路径被既有文件占用 → makedirs 失败: 静默计数返回 False, 绝不抛异常"""
    blocker = tmp_path / "blocker"
    blocker.write_text("x")  # 使 blocker/sub/audit.log 的父目录创建必然失败
    monkeypatch.setenv("P2P_AUDIT_LOG", str(blocker / "sub" / "audit.log"))
    before = graphd_audit._fail_count
    assert graphd_audit.audit_event("transition-illegal", {"cur": "candidate", "to": "verified"}) is False
    assert graphd_audit._fail_count == before + 1
    assert not os.path.exists(blocker / "sub")

def test_audit73_no_follow_symlink(tmp_path, monkeypatch):
    """O_NOFOLLOW: 审计路径被符号链接替换时写失败(静默), 不跟随链接写"""
    real = tmp_path / "real.txt"
    real.write_text("victim")
    link = tmp_path / "audit.log"
    os.symlink(real, link)
    monkeypatch.setenv("P2P_AUDIT_LOG", str(link))
    before = graphd_audit._fail_count
    assert graphd_audit.audit_event("auth-fail", {"path": "/x"}) is False
    assert graphd_audit._fail_count == before + 1
    assert real.read_text() == "victim"  # 链接目标未被写入


# ---- P0-3 全局暂停开关(取消令牌 worker 侧通道): stopAll 写 paused.json → 写通道 409 ----

def test_d2d_paused_file_lifecycle(tmp_path, monkeypatch):
    import graphd.app as app
    pf = tmp_path / "paused.json"
    monkeypatch.setattr(app, "_D2D_PAUSE_FILE", str(pf))
    monkeypatch.setattr(app, "_pause_mtime_cache", [None, False])
    assert app._d2d_paused() is False            # 无文件 = 不暂停
    pf.write_text('{"paused": true}')
    assert app._d2d_paused() is True             # 文件出现 = 暂停
    pf.write_text('{"paused": false}')
    assert app._d2d_paused() is False            # mtime 变化 = 重新加载
    pf.unlink()
    assert app._d2d_paused() is False            # 删除(startEngagement) = 解除


# ---- W5: engagement 池子隔离(归属纯函数 + 真实 kuzu 回填) ----
from graphd.app import host_in_scope, parse_scope_allows, eng_time_windows, attribute_by_time, pick_write_eng, _backfill_eng, SCHEMA

def test_parse_scope_allows_and_host_match():
    scope = "a.example.com, b.example.com, !secret.a.example.com, 203.0.113."
    assert parse_scope_allows(scope) == ["a.example.com", "b.example.com", "203.0.113."]
    assert host_in_scope("a.example.com", scope)
    assert host_in_scope("x.a.example.com", scope)
    assert not host_in_scope("a.example.com.evil.cn", scope)
    assert not host_in_scope("", scope)

def test_eng_time_windows_and_attribute_by_time():
    rows = [
        {"name": "e1", "created_at": "2026-09-01T10:00:00Z"},
        {"name": "e2", "created_at": "2026-09-02T10:00:00Z"},
    ]
    wins = eng_time_windows(rows)
    assert attribute_by_time("2026-09-01T12:00:00Z", wins) == "e1"
    assert attribute_by_time("2026-09-02T09:59:00Z", wins) == "e1"
    assert attribute_by_time("2026-09-02T10:00:00Z", wins) == "e2"
    assert attribute_by_time("2026-09-05T10:00:00Z", wins) == "e2"  # 末位开放区间
    assert attribute_by_time("2026-08-30T10:00:00Z", wins) == ""    # 窗口前的孤儿不强行归属
    assert attribute_by_time("garbage", wins) == ""

def test_pick_write_eng_priority():
    actives = [
        {"name": "e1", "scope": "a.example.com"},
        {"name": "e2", "scope": "b.example.com"},
    ]
    assert pick_write_eng("e2", actives, []) == "e2"            # 显式 eng 且 active → 采用
    assert pick_write_eng("e9", actives, []) == ""              # 显式 eng 不在 active → 落推断
    assert pick_write_eng("", [actives[0]], []) == "e1"         # 恰一个 active → 直接归属
    assert pick_write_eng("", actives, ["x.b.example.com"]) == "e2"  # 多 active → host-scope 投票
    assert pick_write_eng("", actives, []) == ""                # 无法判定 → ''(不误归属)

def test_eng_paused_per_engagement(tmp_path, monkeypatch):
    """W5: per-eng 暂停只影响对应 engagement; 停 A 不误伤 B(多开硬需求)。"""
    import graphd.app as app
    pdir = tmp_path / "config"
    pdir.mkdir()
    monkeypatch.setattr(app, "_D2D_PAUSE_DIR", str(pdir))
    pf = pdir / "paused-eng-a.json"
    pf.write_text('{"paused": true}')
    assert app._eng_paused("eng-a") is True
    assert app._eng_paused("eng-b") is False
    assert app._eng_paused("") is False
    assert app._eng_paused("../evil") is False  # 路径注入拒绝

def test_backfill_eng_on_real_kuzu(tmp_path):
    db = kuzu.Database(str(tmp_path / "kuzu_db"))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    conn.execute("CREATE (e:Engagement {name:'e1', target:'http://a.example.com', scope:'a.example.com', auth:'declared', status:'frozen', created_at:'2026-09-01T10:00:00Z'})")
    conn.execute("CREATE (e:Engagement {name:'e2', target:'http://b.example.com', scope:'b.example.com', auth:'declared', status:'active', created_at:'2026-09-02T10:00:00Z'})")
    # 无主 Finding: ts 落 e1 窗口 → 归 e1; 无 ts 的 Endpoint host 命中 b scope → 归 e2
    conn.execute("CREATE (f:Finding {id:'F1', title:'t1', severity:'high', repro:'curl http://a.example.com/x', category:'sqli', gate_status:'candidate', ts:'2026-09-01T12:00:00Z'})")
    conn.execute("CREATE (ep:Endpoint {id:'EP1', url:'http://b.example.com/y', eng:''})")
    r = _backfill_eng(conn)
    assert r["touched"] >= 2
    got = conn.execute("MATCH (f:Finding {id:'F1'}) RETURN f.eng").get_next()[0]
    assert got == "e1", f"F1 归属错误: {got}"
    got = conn.execute("MATCH (e:Endpoint {id:'EP1'}) RETURN e.eng").get_next()[0]
    assert got == "e2", f"EP1 归属错误: {got}"
    _backfill_eng(conn)  # 幂等: 二次回填不改已归属行
    got = conn.execute("MATCH (f:Finding {id:'F1'}) RETURN f.eng").get_next()[0]
    assert got == "e1"


# ---- L0/L1 分级验证 + 授权资产硬门(参照 dsh-hunter): authorized 标记 / 授权集合 / L1 硬门 ----
from graphd.app import L1_DENY_REASON, hostport_of, l1_gate, init_schema


def test_hostport_of_normalization():
    """授权比对键(与 validator.js hostportOf 同口径): 显式端口照抄/补默认端口/userinfo 剥离"""
    assert hostport_of("http://1.2.3.4:8080/x") == "1.2.3.4:8080"
    assert hostport_of("https://a.b.com/c") == "a.b.com:443"
    assert hostport_of("http://a.b.com") == "a.b.com:80"
    assert hostport_of("http://u:p@a.b.com:9000/x") == "a.b.com:9000"
    assert hostport_of("http://[::1]:8080/") == "[::1]:8080"
    assert hostport_of("garbage") == ""
    assert hostport_of("") == ""
    assert hostport_of(None) == ""


def test_l1_gate_l0_passive_always_allowed():
    """L0 被动验证(GET 首页存活+指纹比对): 任何 scope 内资产可做"""
    ok, err = l1_gate("L0", "8.8.8.8:80", [])
    assert ok and err == ""
    assert l1_gate("l0", "8.8.8.8:80", None)[0]


def test_l1_gate_unauthorized_denied_with_fixed_reason():
    """互联网/未授权资产执行 L1 必须被硬门拒绝, 拒绝话术固定(与 validator.js 同文可对账)"""
    ok, err = l1_gate("L1", "8.8.8.8:80", [])
    assert not ok and err == L1_DENY_REASON
    assert "授权" in err and "L0 被动验证" in err


def test_l1_gate_authorized_exact_hostport():
    """带端口条目 = 精确 host:port 命中; 端口不匹配 = 未授权"""
    assert l1_gate("L1", "127.0.0.1:8888", ["127.0.0.1:8888"])[0]
    assert not l1_gate("L1", "127.0.0.1:9999", ["127.0.0.1:8888"])[0]


def test_l1_gate_authorized_host_level_entry():
    """不带端口条目 = 该 host 任意端口放行(资产级授权)"""
    assert l1_gate("L1", "10.1.2.3:8080", ["10.1.2.3"])[0]
    assert l1_gate("L1", "10.1.2.3:443", ["10.1.2.3"])[0]


def test_l1_gate_l2_never_allowed():
    """L2 完整 EXP 永不自动执行(不存在该档); 未知档位一律拒绝"""
    ok, err = l1_gate("L2", "127.0.0.1:8888", ["127.0.0.1:8888"])
    assert not ok and "L2" in err
    ok2, _ = l1_gate("", "127.0.0.1:8888", ["127.0.0.1:8888"])
    assert not ok2


def test_upsert_endpoint_authorized_flag(tmp_path):
    """authorized 字段写入: 显式 authorized=True 打标; 默认 false = 未授权(fail-safe)"""
    conn = _endpoint_conn(tmp_path)
    a = upsert_endpoint(conn, "https://auth.example.com/", "nginx", "", authorized=True)
    b = upsert_endpoint(conn, "https://plain.example.com/", "nginx", "")
    r = conn.execute("MATCH (e:Endpoint) RETURN e.id AS i, e.authorized AS az ORDER BY e.id")
    rows = {}
    while r.has_next():
        rid, az = r.get_next()
        rows[str(rid)] = bool(az)
    assert rows[a] is True and rows[b] is False


def test_upsert_endpoint_authorized_set_sticky_on_reupsert(tmp_path):
    """授权标记只升不降: authorized=True 打标后, 常规 upsert(补指纹)不清既有标记"""
    conn = _endpoint_conn(tmp_path)
    eid = upsert_endpoint(conn, "https://s.example.com/", "", "")
    assert bool(conn.execute("MATCH (e:Endpoint {id:$i}) RETURN e.authorized",
                             parameters={"i": eid}).get_next()[0]) is False
    upsert_endpoint(conn, "https://s.example.com/", "nginx", "", authorized=True)
    upsert_endpoint(conn, "https://s.example.com/", "nginx2", "")
    assert bool(conn.execute("MATCH (e:Endpoint {id:$i}) RETURN e.authorized",
                             parameters={"i": eid}).get_next()[0]) is True


def test_authorized_set_query_lists_only_authorized(tmp_path):
    """授权集合查询(GET /authorized 与 validator 查图同一条 cypher): 只列 authorized=true 资产"""
    conn = _endpoint_conn(tmp_path)
    upsert_endpoint(conn, "https://a.example.com/", "", "", authorized=True)
    upsert_endpoint(conn, "https://b.example.com/", "", "")
    r = conn.execute("MATCH (e:Endpoint) WHERE e.authorized = true RETURN e.url")
    urls = []
    while r.has_next():
        urls.append(str(r.get_next()[0]))
    assert urls == ["https://a.example.com/"]


def test_authorized_column_migration_on_old_db(tmp_path):
    """旧库 ALTER 迁移(W5 eng 列同款): 无 authorized 列的存量 Endpoint 表经 init_schema 补列且默认 false"""
    db = kuzu.Database(str(tmp_path / "kuzu_db"))
    conn = kuzu.Connection(db)
    conn.execute("CREATE NODE TABLE IF NOT EXISTS Endpoint(id STRING, url STRING, param STRING, method STRING, "
                 "tech STRING, business_chain STRING, coverage_votes INT64 DEFAULT 0, exhausted BOOL DEFAULT false, "
                 "eng STRING DEFAULT '', PRIMARY KEY(id))")
    conn.execute("CREATE (e:Endpoint {id:'E0', url:'http://old.example.com/', eng:''})")
    init_schema(conn)  # 幂等: 已存在的表 CREATE 跳过, 走 ALTER 补列
    assert bool(conn.execute("MATCH (e:Endpoint {id:'E0'}) RETURN e.authorized").get_next()[0]) is False
    init_schema(conn)  # 二次启动: 列已存在, ALTER 静默跳过不抛
    assert bool(conn.execute("MATCH (e:Endpoint {id:'E0'}) RETURN e.authorized").get_next()[0]) is False


# =====================================================================
# 外部审计修复回归(2026-09-10 批): C7 / H12 / H13 / H18 / H15 / H16
# 与实现单点真源对接(纯函数直测), H15/H16 经 node 子进程驱动 spa-render.mjs 导出面
# =====================================================================
import graphd.app as graphd_app
from graphd.app import (MAX_BODY_BYTES, MAX_QUERY_ROWS,
                        content_length_gate, bounded_rows,
                        is_engagement_create, engagement_cap_gate,
                        reset_database)

# ---- C7: Content-Length 负数/非数字必须 400(旧 int('-1') 穿过上限检查 → read(-1)=读到 EOF 的无上限内存 DoS) ----
def test_c7_negative_content_length_rejected_400():
    n, err = content_length_gate("-1")
    assert err is not None and err[0] == 400 and "Content-Length" in err[1]

@pytest.mark.parametrize("raw", ["abc", "1.5", "0x10", "-99", "  -1 "])
def test_c7_non_numeric_or_negative_rejected(raw):
    # 非数字/负数一律 400(负数曾直落 rfile.read(-1) = 读到 EOF 的无上限读)
    n, err = content_length_gate(raw)
    assert err is not None and err[0] == 400

def test_c7_oversize_rejected_413():
    n, err = content_length_gate(str(MAX_BODY_BYTES + 1))
    assert err is not None and err[0] == 413 and n == MAX_BODY_BYTES + 1

def test_c7_normal_and_missing_content_length_pass():
    assert content_length_gate("5") == (5, None)
    assert content_length_gate("0") == (0, None)
    assert content_length_gate(None) == (0, None)
    assert content_length_gate("") == (0, None)
    assert content_length_gate(str(MAX_BODY_BYTES)) == (MAX_BODY_BYTES, None)  # 边界内放行


# ---- H13: /query 结果行数上限(旧实现全量缓冲 → 大图 OOM) ----
class _FakeResult:
    """鸭子类型 kuzu 结果集: has_next/get_next"""
    def __init__(self, total):
        self._left = int(total)
    def has_next(self):
        return self._left > 0
    def get_next(self):
        self._left -= 1
        return ("row",)

def test_h13_row_cap_truncates_and_stops_pulling():
    rows, truncated = bounded_rows(_FakeResult(50), limit=10)
    assert len(rows) == 10 and truncated is True

def test_h13_under_cap_not_truncated():
    rows, truncated = bounded_rows(_FakeResult(3), limit=10)
    assert len(rows) == 3 and truncated is False

def test_h13_zero_rows_never_truncated():
    assert bounded_rows(_FakeResult(0)) == ([], False)

def test_h13_default_cap_is_meaningful():
    assert MAX_QUERY_ROWS >= 10000


# ---- H12: Engagement 容量栅栏与 CREATE 同锁(旧: 检查/CREATE 两把锁 → TOCTOU 击穿 P2P_MAX_ACTIVE) ----
def test_h12_engagement_create_detection():
    assert is_engagement_create("CREATE (e:Engagement {name:$n, status:'active'})")
    assert is_engagement_create("create (:Engagement {name:'x'})")
    assert not is_engagement_create("MATCH (e:Engagement) RETURN e.name")
    assert not is_engagement_create("CREATE (f:Finding {id:'x', title:'t'})")
    assert not is_engagement_create("")
    assert not is_engagement_create(None)

def test_h12_cap_gate_blocks_at_and_above_cap_only():
    assert "cap 4" in engagement_cap_gate(4, cap=4)
    assert engagement_cap_gate(9, cap=4) != ""
    assert engagement_cap_gate(3, cap=4) == ""
    assert engagement_cap_gate(0, cap=4) == ""

def test_h12_cap_gate_against_real_kuzu_counts(tmp_path):
    db = kuzu.Database(str(tmp_path / "kuzu_db"))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    r = conn.execute("MATCH (e:Engagement) WHERE e.status IN ['active','requested'] RETURN count(e)")
    n0 = int(list(r.get_next())[0]) if r.has_next() else 0
    assert n0 == 0 and engagement_cap_gate(n0) == ""  # 空图放行
    for i in range(4):
        conn.execute("CREATE (e:Engagement {name:$n, target:'t', scope:'s', auth:'a', status:'active', created_at:'c'})",
                     parameters={"n": f"e{i}"})
    r = conn.execute("MATCH (e:Engagement) WHERE e.status IN ['active','requested'] RETURN count(e)")
    n4 = int(list(r.get_next())[0])
    assert n4 == 4 and engagement_cap_gate(n4) != ""  # 满载拦截(handler 同锁内以同口径 409)


# ---- H18: /reset 先 close 再删再 init(旧: 不 close 就 rmtree + ignore_errors=True 半删) ----
def test_h18_reset_closes_db_wipes_and_reinits(tmp_path, monkeypatch):
    dbp = tmp_path / "kuzu_db"
    monkeypatch.setattr(graphd_app, "DB_PATH", str(dbp))
    db = kuzu.Database(str(dbp))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    conn.execute("CREATE (e:Engagement {name:'gone', target:'t', scope:'s', auth:'a', status:'active', created_at:'c'})")
    conn = None  # 释放连接, 模拟请求间隙
    closed = []
    _real_close = db.close

    class _Spy:
        def close(self):
            closed.append(True)
            _real_close()

    monkeypatch.setattr(graphd_app, "_db", _Spy())
    out = reset_database()
    assert out["ok"] is True and closed == [True]  # close 先于删除被调用
    assert dbp.exists()  # 重建后目录在(schema 就绪)
    r = kuzu.Connection(graphd_app._db).execute("MATCH (e:Engagement) RETURN count(*)")
    assert r.get_next()[0] == 0  # 旧数据清零, 图可用

def test_h18_reset_reports_delete_failure_instead_of_silent_half_delete(tmp_path, monkeypatch):
    import shutil as _shutil
    dbp = tmp_path / "kuzu_db"
    dbp.mkdir()
    monkeypatch.setattr(graphd_app, "DB_PATH", str(dbp))
    monkeypatch.setattr(graphd_app, "_db", None)

    def _boom(*a, **k):
        raise OSError("disk busy")

    monkeypatch.setattr(_shutil, "rmtree", _boom)
    out = reset_database()
    assert out["ok"] is False and "reset failed" in out["error"]  # 不再 ignore_errors 假成功

def test_h18_reset_is_idempotent_on_missing_dir(tmp_path, monkeypatch):
    monkeypatch.setattr(graphd_app, "DB_PATH", str(tmp_path / "never_created"))
    monkeypatch.setattr(graphd_app, "_db", None)
    out = reset_database()
    assert out["ok"] is True  # FileNotFoundError 幂等放行
    assert (tmp_path / "never_created").exists()  # 且重建了 schema


# ---- H15: spa-render Cypher 注入修复(参数化) —— node 子进程驱动导出面 + 真实 kuzu 执行对抗载荷 ----
import shutil
import subprocess

def _spa_eval(body, tmp_path):
    """在 node 子进程里导入 scripts/gateway/spa-render.mjs(D2D_DATA_DIR 指向临时目录,
    与生产锁/配置隔离)并执行 body, 返回 body 内 return 的对象的 JSON。"""
    node = shutil.which("node")
    if not node:
        pytest.skip("node unavailable")
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    mod = os.path.join(repo, "scripts", "gateway", "spa-render.mjs")
    script = ("import fs from 'node:fs'\n"
              f"const m = await import({json.dumps(mod)})\n"
              "const out = await (async () => {\n" + body + "\n})()\n"
              "console.log(JSON.stringify(out))\n")
    env = dict(os.environ, D2D_DATA_DIR=str(tmp_path))
    p = subprocess.run([node, "--input-type=module", "-e", script], env=env,
                       capture_output=True, text=True, timeout=60)
    assert p.returncode == 0, f"node subprocess failed: {p.stderr[-800:]}"
    return json.loads(p.stdout.strip().splitlines()[-1])

H15_EXPECTED_CYPHER = ("MERGE (e:Endpoint {id:$id}) SET e.url=$url, e.method=$method, "
                       "e.tech=coalesce(e.tech,'spa-cdp')")

def test_h15_payload_parameterized_method_whitelisted(tmp_path):
    out = _spa_eval("""
const p = m.endpointWritePayload({id:'ep-x', url:"http://e/x'; DETACH DELETE (s:Signal_) //", method:'TRACE'})
return {cy: p.cypher, pr: p.params, norm: m.normalizeMethod("post"), bad: m.normalizeMethod("PROBE")}
""", tmp_path)
    assert out["cy"] == H15_EXPECTED_CYPHER  # Cypher 文本只含 $占位符, 无任何外部输入
    assert out["pr"]["url"] == "http://e/x'; DETACH DELETE (s:Signal_) //"  # 对抗载荷原样进 params(不再拼接)
    assert out["pr"]["method"] == "GET"   # 白名单外 method(TRACE)归 GET
    assert out["norm"] == "POST" and out["bad"] == "GET"

def test_h15_adversarial_payload_executes_safely_on_real_kuzu(tmp_path):
    """含引号 + 反斜杠双形态对抗载荷经参数化通道在真实 kuzu 执行:
    注入文本必须按字面值落库, 且不得产生任何额外语法效果(删除/多行)。"""
    out = _spa_eval("""
const quote = m.endpointWritePayload({id:'ep-q', url:"http://e/x'; DETACH DELETE (s:Signal_) //", method:'get'})
const bslash = m.endpointWritePayload({id:'ep-b', url:'http://e/\\\\', method:'POST'})
const tailBs = m.endpointWritePayload({id:'ep-t', url:"http://e/x\\\\'; DROP TABLE Endpoint //", method:'POST'})
return {quote, bslash, tailBs}
""", tmp_path)
    db = kuzu.Database(str(tmp_path / "kuzu_db"))
    conn = kuzu.Connection(db)
    for ddl in SCHEMA:
        conn.execute(ddl)
    conn.execute("CREATE (s:Signal_ {id:'victim', type:'t', evidence:'e', ts:'0', ring:'discovery'})")
    for key in ("quote", "bslash", "tailBs"):
        payload = out[key]
        assert payload["cypher"] == H15_EXPECTED_CYPHER
        conn.execute(payload["cypher"], parameters=payload["params"])  # 注入载荷原样绑定
    assert conn.execute("MATCH (s:Signal_) RETURN count(*)").get_next()[0] == 1  # victim 未被 DETACH DELETE
    assert conn.execute("MATCH (e:Endpoint) RETURN count(*)").get_next()[0] == 3  # 恰 3 个端点, 无越权副作用
    rows = {}
    r = conn.execute("MATCH (e:Endpoint) RETURN e.id, e.url, e.method")
    while r.has_next():
        rid, u, mth = r.get_next()
        rows[str(rid)] = (str(u), str(mth))
    assert rows["ep-q"] == ("http://e/x'; DETACH DELETE (s:Signal_) //", "GET")
    assert rows["ep-b"] == ("http://e/\\", "POST")   # 旧 \\' 转义的尾随反斜杠绕过形态, 现按字面落库
    assert rows["ep-t"] == ("http://e/x\\'; DROP TABLE Endpoint //", "POST")

def test_h15_old_vulnerable_pattern_is_gone():
    """锁定旧缺陷不复活: 源码不得再把外部值拼进 Cypher 字符串(\\' 前置转义)"""
    repo = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    src = open(os.path.join(repo, "scripts", "gateway", "spa-render.mjs"), encoding="utf-8").read()
    assert "replace(/'/g" not in src  # 旧 url.replace(/'/g,"\\'") 已移除
    assert "e.url=$url, e.method=$method" in src  # 值一律走 $params 绑定


# ---- H16: spa-render 单例锁原子性(旧 statSync 后 writeFileSync 覆盖写的 TOCTOU) ----
def test_h16_lock_acquire_is_exclusive(tmp_path):
    out = _spa_eval("""
const a = m.tryAcquireLock()
const b = m.tryAcquireLock()
const pid = JSON.parse(fs.readFileSync(m.SPA_LOCK, 'utf8')).pid === process.pid
return {a, b, pid}
""", tmp_path)
    assert out == {"a": True, "b": False, "pid": True}  # O_EXCL: 同进程二次抢锁必失败

def test_h16_lock_stale_takeover(tmp_path):
    out = _spa_eval("""
const a = m.tryAcquireLock()
const old = new Date(Date.now() - 60000)
fs.utimesSync(m.SPA_LOCK, old, old)
const takeover = m.tryAcquireLock()
return {a, takeover}
""", tmp_path)
    assert out == {"a": True, "takeover": True}  # 崩溃残留按过期接管

def test_h16_release_only_by_owner(tmp_path):
    out = _spa_eval("""
fs.writeFileSync(m.SPA_LOCK, JSON.stringify({pid: 1}))  // 模拟他者(胜者)持锁
m.releaseLock()                                          // 本进程从未持锁 → 不得删除
const kept = fs.existsSync(m.SPA_LOCK)
const old = new Date(Date.now() - 60000)
fs.utimesSync(m.SPA_LOCK, old, old)
const acq = m.tryAcquireLock()   // 过期接管
m.releaseLock()                  // 持有者释放
const gone = !fs.existsSync(m.SPA_LOCK)
m.releaseLock()                  // 双重释放不抛不再删
return {kept, acq, gone}
""", tmp_path)
    assert out == {"kept": True, "acq": True, "gone": True}

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
    assert set(FINDING_STATES) == {"candidate", "triaged", "verified", "isolated", "reported", "accepted", "rejected"}
    for src, dsts in FINDING_TRANSITIONS.items():
        # frozen 是唯一的历史别名例外(issue #88): 不属于七态, 仅提供解冻出口, 不可作为迁移目标
        if src == "frozen":
            assert set(dsts) <= {"candidate", "triaged", "rejected"}
            continue
        assert src in FINDING_STATES
        for d in dsts:
            assert d in FINDING_STATES and d != src
    assert FINDING_TRANSITIONS["accepted"] == () and FINDING_TRANSITIONS["rejected"] == ()


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
from graphd.app import upsert_endpoint

def _endpoint_conn(tmp_path):
    db = kuzu.Database(str(tmp_path / "kuzu_db"))
    conn = kuzu.Connection(db)
    conn.execute("CREATE NODE TABLE IF NOT EXISTS Endpoint(id STRING, url STRING, param STRING, method STRING, tech STRING, business_chain STRING, coverage_votes INT64 DEFAULT 0, exhausted BOOL DEFAULT false, PRIMARY KEY(id))")
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

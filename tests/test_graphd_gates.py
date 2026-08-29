#!/usr/bin/env python3
"""graphd 机械门负例集 — 直接 import 实现，防复刻漏检（I-009）。
"""
import re
import pytest
from graphd.app import finding_gates, JUNK_PATTERNS

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


# ---- R3 回归: 七态机 / config-advice 归类 ----
from graphd.app import FINDING_STATES, FINDING_TRANSITIONS, CONFIG_ADVICE_RE


def test_r3_seven_states_complete():
    assert set(FINDING_STATES) == {"candidate", "triaged", "verified", "isolated", "reported", "accepted", "rejected"}
    for src, dsts in FINDING_TRANSITIONS.items():
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

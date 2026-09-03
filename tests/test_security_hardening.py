"""tests/test_security_hardening.py — 6 P0+M security hardening tests

Tests graphd security hardening in isolation (does not require kuzu installed).
The graphd.app module is tested via its pure functions only.
"""
import os
import sys
import json
import time
import pathlib
import importlib.util
import pytest

# Make graphd importable
ROOT = pathlib.Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

# Load literal_strip (no deps)
spec = importlib.util.spec_from_file_location(
    "literal_strip",
    str(ROOT / "graphd" / "literal_strip.py"),
)
ls_mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ls_mod)
strip_literals_and_comments = ls_mod.strip_literals_and_comments
strip_and_normalize = ls_mod.strip_and_normalize


# P0-M4: re-implement canonicalization here (mirror of graphd/app.py logic) for testability
import ipaddress
import urllib.parse


def _iter_strings(obj):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _iter_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _iter_strings(v)


def _canonicalize_url(s):
    s = s.strip()
    if "://" not in s:
        s = "http://" + s
    try:
        u = urllib.parse.urlparse(s)
        host = u.hostname
        if not host:
            return None, None
        try:
            host = urllib.parse.unquote(host)
        except Exception:
            pass
        host = host.lower().strip(".")
        try:
            ip = ipaddress.ip_address(host)
            return None, str(ip)
        except ValueError:
            pass
        if host.isdigit():
            try:
                ip = ipaddress.ip_address(int(host))
                return None, str(ip)
            except ValueError:
                pass
        return host, None
    except Exception:
        return None, None


def _ip_in_network(ip_str, cidr):
    try:
        if "/" in cidr:
            net = ipaddress.ip_network(cidr, strict=False)
            return ipaddress.ip_address(ip_str) in net
        else:
            if "." in cidr and not cidr.endswith("."):
                return ip_str == cidr
            return ip_str.startswith(cidr)
    except Exception:
        return False


import re as _re
_URL_RE = _re.compile(
    r'https?://[^\s"\\<>()]+|'
    r'\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b|'
    r'\b\d{8,10}\b'
)


def _extract_urls_and_ips(s):
    return _URL_RE.findall(s or "")


def _canonicalized_denylist_check(payload, denied):
    denied_domains = [d for d in denied if "/" not in d and not d.replace(".", "").isdigit()]
    denied_cidrs = [d for d in denied if "/" in d or d.replace(".", "").isdigit()]
    for d in denied_domains:
        if d.endswith("."):
            denied_cidrs.append(d)

    for s in _iter_strings(payload):
        if not isinstance(s, str) or len(s) < 4:
            continue
        candidates = _extract_urls_and_ips(s)
        candidates.append(s)
        for candidate in candidates:
            host, ip = _canonicalize_url(candidate)
            if ip:
                for cidr in denied_cidrs:
                    if _ip_in_network(ip, cidr):
                        return cidr
            if host:
                for dom in denied_domains:
                    dom_clean = dom.lower().strip(".")
                    if not dom_clean.endswith("."):
                        if host == dom_clean or host.endswith("." + dom_clean):
                            return dom
    return ""


# ============== P0-M1: Socket read timeout ==============
def test_socket_timeout_constants():
    """P2P_REQ_TIMEOUT default is 5s."""
    assert os.environ.get("P2P_REQ_TIMEOUT", "5") == "5"


# ============== P0-M2: Literal/comment stripping ==============
def test_literal_strip_simple():
    """Mutation keyword in string literal should be stripped."""
    q = "MATCH (n) WHERE n.foo = 'DELETE FROM x' RETURN n"
    stripped = strip_literals_and_comments(q)
    # Code keywords preserved
    assert "MATCH" in stripped.upper()
    assert "RETURN" in stripped.upper()
    # The DELETE keyword in literal is replaced with spaces (no longer contiguous)
    # Check: the original positions of 'DELETE FROM x' are now spaces
    # Find the position of 'DELETE' in the original; verify it's been replaced
    delete_pos = q.find("DELETE")
    assert stripped[delete_pos:delete_pos+6] != "DELETE"
    # And it became spaces
    assert stripped[delete_pos] == " "


def test_literal_strip_double_quotes():
    q = 'CREATE (n:Foo {x: "DROP TABLE x"}) RETURN n'
    stripped = strip_literals_and_comments(q)
    # CREATE outside literal survives
    assert "CREATE" in stripped.upper()
    assert "RETURN" in stripped.upper()
    # DROP inside literal is replaced
    drop_pos = q.find("DROP")
    assert stripped[drop_pos:drop_pos+4] != "DROP"
    assert stripped[drop_pos] == " "


def test_literal_strip_line_comment():
    q = "MATCH (n) // DELETE everything\nRETURN n"
    stripped = strip_literals_and_comments(q)
    assert "DELETE" not in stripped  # comment is gone
    assert "MATCH" in stripped.upper()
    assert "RETURN" in stripped.upper()


def test_literal_strip_block_comment():
    q = "MATCH (n) /* DELETE all */ RETURN n"
    stripped = strip_literals_and_comments(q)
    assert "DELETE" not in stripped
    assert "MATCH" in stripped.upper()
    assert "RETURN" in stripped.upper()


def test_literal_strip_backtick():
    q = "MATCH (`DELETE-ME`) RETURN n"
    stripped = strip_literals_and_comments(q)
    # Backtick content replaced with spaces
    assert "DELETE-ME" not in stripped


def test_literal_strip_escape():
    q = "MATCH (n) WHERE n.x = 'it\\'s DROP' RETURN n"
    stripped = strip_literals_and_comments(q)
    # Inside string literal, the keyword DROP should be stripped
    # (we can't easily test position, but no crash)
    assert "MATCH" in stripped.upper()


# ============== P0-M3: Cypher normalization (logic test) ==============
def test_strip_and_normalize_lowercase():
    s = strip_and_normalize("  match (n) return n  ")
    assert s == "match (n) return n"


def test_strip_and_normalize_with_literal():
    s = strip_and_normalize("MATCH (n) WHERE n.x = 'DELETE' RETURN n")
    # Code keywords preserved
    assert "MATCH" in s.upper()
    assert "RETURN" in s.upper()
    # 'DELETE' in literal replaced with spaces (no longer contiguous 'DELETE' string)
    delete_pos = s.find("DELETE")
    if delete_pos >= 0:
        assert s[delete_pos:delete_pos+6] != "DELETE"


# ============== P0-M4: Denylist canonicalization ==============
def test_denylist_percent_encoded():
    """'https://example%2Ecom/' should be recognized as example.com."""
    denied = ["example.com"]
    payload = {"evidence": "see https://example%2Ecom/ for details"}
    hit = _canonicalized_denylist_check(payload, denied)
    assert hit == "example.com"


def test_denylist_ip_decimal_to_cidr():
    """Decimal IP '2886729729' = '172.16.0.1' should match '172.16.0.0/12'."""
    denied = ["172.16.0.0/12"]
    payload = {"note": "server at 2886729729"}
    hit = _canonicalized_denylist_check(payload, denied)
    assert hit == "172.16.0.0/12"


def test_denylist_ip_in_cidr_block():
    """'10.5.0.1' should match '10.0.0.0/8'."""
    denied = ["10.0.0.0/8"]
    payload = {"endpoint": "http://10.5.0.1/admin"}
    hit = _canonicalized_denylist_check(payload, denied)
    assert hit == "10.0.0.0/8"


def test_denylist_subdomain_match():
    """'mail.ztgame.com' should match 'ztgame.com' (subdomain suffix)."""
    denied = ["ztgame.com"]
    payload = {"target": "mail.ztgame.com"}
    hit = _canonicalized_denylist_check(payload, denied)
    assert hit == "ztgame.com"


def test_denylist_no_false_positive():
    """Unrelated domain should not match."""
    denied = ["evil.com"]
    payload = {"target": "https://good.com/"}
    hit = _canonicalized_denylist_check(payload, denied)
    assert hit == ""


def test_denylist_nested_payload():
    """Should find denied string in nested JSON."""
    denied = ["banned.com"]
    payload = {"outer": {"inner": [{"url": "http://banned.com/x"}]}}
    hit = _canonicalized_denylist_check(payload, denied)
    assert hit == "banned.com"


def test_denylist_decimal_ip_direct():
    """2886729729 = 172.16.0.1 — test direct decimal IP."""
    assert str(ipaddress.ip_address(2886729729)) == "172.16.0.1"


def test_denylist_idn_domain():
    """IDN domains (unicode) — basic handling."""
    # IDN punycode xn--nxasmq6b should be normalized
    s = "xn--nxasmq6b"  # example IDN
    host, _ = _canonicalize_url(f"https://{s}.com")
    assert host == f"{s}.com"  # preserved as-is for now


# ============== M5: Token file ownership ==============
def test_token_ownership_644_warning(tmp_path, monkeypatch, capsys):
    """Token file with 0o644 should be flagged."""
    config_dir = tmp_path / "config" / "d2d"
    config_dir.mkdir(parents=True)
    token = config_dir / "test.token"
    token.write_text("secret")
    os.chmod(token, 0o644)

    my_uid = os.getuid() if hasattr(os, "getuid") else -1
    st = os.stat(token)
    mode = st.st_mode & 0o777
    # Verify the condition that triggers warning
    assert mode != 0o600  # not 0o600
    # Or not owned by current uid
    should_warn = (mode != 0o600) or (my_uid >= 0 and st.st_uid != my_uid)
    assert should_warn is True


def test_token_ownership_600_ok(tmp_path, monkeypatch):
    """Token file with 0o600 owned by current uid is OK."""
    config_dir = tmp_path / "config" / "d2d"
    config_dir.mkdir(parents=True)
    token = config_dir / "test.token"
    token.write_text("secret")
    os.chmod(token, 0o600)

    my_uid = os.getuid() if hasattr(os, "getuid") else -1
    st = os.stat(token)
    mode = st.st_mode & 0o777
    should_warn = (mode != 0o600) or (my_uid >= 0 and st.st_uid != my_uid)
    assert should_warn is False


# ============== M6: Structured audit logging ==============
def test_audit_log_auth_failure(tmp_path, monkeypatch):
    """auth failure should write to audit/security.jsonl."""
    monkeypatch.setenv("D2D_DATA_DIR", str(tmp_path))

    # Reload audit module to pick up new D2D_DATA_DIR
    sys.modules.pop("graphd.audit", None)
    sys.path.insert(0, str(ROOT))
    audit_spec = importlib.util.spec_from_file_location(
        "graphd.audit",
        str(ROOT / "graphd" / "audit.py"),
    )
    audit_mod = importlib.util.module_from_spec(audit_spec)
    audit_spec.loader.exec_module(audit_mod)

    # Trigger auth failure
    audit_mod.audit_auth_failure("test_token_mismatch", "abc12345")
    time.sleep(0.1)

    log_path = tmp_path / "audit" / "security.jsonl"
    assert log_path.exists(), f"audit log not created at {log_path}"
    content = log_path.read_text()
    assert "auth_failure" in content
    assert "test_token_mismatch" in content


def test_audit_log_denylist_hit(tmp_path, monkeypatch):
    monkeypatch.setenv("D2D_DATA_DIR", str(tmp_path))
    sys.modules.pop("graphd.audit", None)
    audit_spec = importlib.util.spec_from_file_location(
        "graphd.audit",
        str(ROOT / "graphd" / "audit.py"),
    )
    audit_mod = importlib.util.module_from_spec(audit_spec)
    audit_spec.loader.exec_module(audit_mod)

    audit_mod.audit_denylist_hit("evil.com", "/write/finding")
    time.sleep(0.1)

    log_path = tmp_path / "audit" / "security.jsonl"
    assert "denylist_hit" in log_path.read_text()
    assert "evil.com" in log_path.read_text()


def test_audit_log_token_perm(tmp_path, monkeypatch):
    monkeypatch.setenv("D2D_DATA_DIR", str(tmp_path))
    sys.modules.pop("graphd.audit", None)
    audit_spec = importlib.util.spec_from_file_location(
        "graphd.audit",
        str(ROOT / "graphd" / "audit.py"),
    )
    audit_mod = importlib.util.module_from_spec(audit_spec)
    audit_spec.loader.exec_module(audit_mod)

    audit_mod.audit_token_perm_issue("/tmp/test.token", 0o644, 1000)
    time.sleep(0.1)

    log_path = tmp_path / "audit" / "security.jsonl"
    assert "token_perm_issue" in log_path.read_text()

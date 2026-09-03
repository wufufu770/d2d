#!/usr/bin/env python3
"""graphd - Kuzu 单写者 sidecar。三环+插件全部经 HTTP 读写图,规避多进程锁。
stdlib only (kuzu 除外). GET /health POST /query POST /reset
"""
import hmac
import ipaddress
import json
import os
import socket as _socket
import urllib.parse

# R6.1: 全局黑名单(denylist.json)运行时缓存 — 启动时从文件加载, 对所有 engagement 生效
DENYLIST = {"domains": [], "cidr_prefix": []}
import re
import sys
import threading
import time
import uuid
import pathlib

# P0-M5: literal/comment stripping + structured audit log
try:
    from literal_strip import strip_literals_and_comments, strip_and_normalize
except ImportError:
    def strip_literals_and_comments(s): return s
    def strip_and_normalize(s): return (s or "").strip()
try:
    from audit import (
        _audit_log, audit_auth_failure, audit_denylist_hit,
        audit_transition_violation, audit_token_perm_issue, audit_gate_block,
    )
except ImportError:
    def _audit_log(*a, **k): pass
    def audit_auth_failure(*a, **k): pass
    def audit_denylist_hit(*a, **k): pass
    def audit_transition_violation(*a, **k): pass
    def audit_token_perm_issue(*a, **k): pass
    def audit_gate_block(*a, **k): pass

# P0-M5: token file ownership validation
def _validate_token_files():
    """Scan ~/.config/d2d/*.token — verify owner is current UID and mode 0o600."""
    config_dir = pathlib.Path(os.environ.get("D2D_CONFIG_DIR", os.path.expanduser("~/.config/d2d")))
    if not config_dir.exists():
        return
    strict = os.environ.get("P2P_TOKEN_STRICT", "0") == "1"
    my_uid = os.getuid() if hasattr(os, "getuid") else -1
    for p in config_dir.glob("*.token"):
        try:
            st = p.stat()
            mode = st.st_mode & 0o777
            if mode != 0o600 or (my_uid >= 0 and st.st_uid != my_uid):
                audit_token_perm_issue(str(p), mode, st.st_uid)
                msg = f"[security] token file {p} mode={oct(mode)} owner={st.st_uid} (expected 0o600 owned by {my_uid})"
                if strict:
                    raise SystemExit(f"FATAL: {msg} (P2P_TOKEN_STRICT=1)")
                print(msg, file=sys.stderr)
        except Exception:
            pass

_validate_token_files()
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# 可移植性: DB 默认落在脚本同目录(每仓天然隔离); 端口由各仓 start.sh 钉定
DB_PATH = os.environ.get("P2P_GRAPH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "kuzu_db"))
PORT = int(os.environ.get("P2P_GRAPH_PORT", "8766"))

import kuzu

_lock = threading.Lock()
_db = None
MAX_BODY_BYTES = 1_000_000  # V-11: 请求体上限, 防全量读入内存的 DoS


@contextmanager
def _locked(timeout: float = 5.0):
    """V-11: 锁获取带 deadline —— 慢查询持锁时其余请求 5s 后 503 而非无限等待"""
    if not _lock.acquire(timeout=timeout):
        raise TimeoutError("graphd busy: single-writer lock not released within 5s")
    try:
        yield
    finally:
        _lock.release()


def db():
    global _db
    if _db is None:
        parent = os.path.dirname(DB_PATH)
        if parent:
            os.makedirs(parent, exist_ok=True)
        _db = kuzu.Database(DB_PATH)
        conn = kuzu.Connection(_db)
        init_schema(conn)
    return _db


SCHEMA = [
    "CREATE NODE TABLE IF NOT EXISTS Engagement(name STRING, target STRING, scope STRING, auth STRING, status STRING, created_at STRING, PRIMARY KEY(name))",
    "CREATE NODE TABLE IF NOT EXISTS Endpoint(id STRING, url STRING, param STRING, method STRING, tech STRING, business_chain STRING, coverage_votes INT64 DEFAULT 0, exhausted BOOL DEFAULT false, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Signal_(id STRING, type STRING, weight DOUBLE DEFAULT 1.0, status STRING DEFAULT 'open', evidence STRING, ts STRING, ring STRING, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Hypothesis(id STRING, text STRING, strategy STRING, status STRING DEFAULT 'open', ts STRING, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Finding(id STRING, title STRING, severity STRING, cvss DOUBLE DEFAULT 0.0, evidence_dir STRING, repro STRING, category STRING DEFAULT 'vuln', gate_status STRING DEFAULT 'candidate', ts STRING, verified_at STRING DEFAULT '', verified_log STRING DEFAULT '', notify_sent BOOL DEFAULT false, last_transition STRING DEFAULT '', PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Plan(id STRING, text STRING, score DOUBLE DEFAULT 0.0, status STRING DEFAULT 'chosen', created_at STRING, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS ExperienceWeight(id STRING, pattern STRING, stack STRING, prior DOUBLE DEFAULT 1.0, hits INT64 DEFAULT 0, wins INT64 DEFAULT 0, target_type STRING DEFAULT 'web', recipe STRING DEFAULT '', stack_fp STRING DEFAULT '', payload_hint STRING DEFAULT '', PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS AgentIdentity(worker_id STRING, ring STRING, chain STRING, status STRING, checkpoint STRING, todo STRING, updated_at STRING, PRIMARY KEY(worker_id))",
    "CREATE NODE TABLE IF NOT EXISTS Task(id STRING, eng STRING DEFAULT '', kind STRING, payload STRING, priority DOUBLE DEFAULT 1.0, status STRING DEFAULT 'pending', claimed_by STRING DEFAULT '', claimed_at STRING DEFAULT '', target_type STRING DEFAULT 'web', link_id STRING DEFAULT '', created_at STRING, PRIMARY KEY(id))",
    "CREATE NODE TABLE IF NOT EXISTS Handoff(id STRING, eng STRING, digest STRING, model STRING DEFAULT '', created_at STRING, PRIMARY KEY(id))",
    "CREATE REL TABLE IF NOT EXISTS AT(FROM Signal_ TO Endpoint)",
    "CREATE REL TABLE IF NOT EXISTS CONFIRMS(FROM Finding TO Signal_)",
    "CREATE REL TABLE IF NOT EXISTS SUGGESTS(FROM Hypothesis TO Endpoint)",
    "CREATE REL TABLE IF NOT EXISTS DERIVED_FROM(FROM Signal_ TO Signal_)",
    "CREATE REL TABLE IF NOT EXISTS PRIOR_FOR(FROM ExperienceWeight TO Signal_)",
]


def init_schema(conn):
    for q in SCHEMA:
        try:
            conn.execute(q)
        except Exception as e:
            if "already exists" not in str(e):
                raise
    # R3: 旧库增量迁移 ExperienceWeight 结构化经验列（列已存在/引擎不支持时忽略，新库由 SCHEMA 直接建全）
    for _col in ("recipe", "stack_fp", "payload_hint"):
        try:
            conn.execute(f"ALTER TABLE ExperienceWeight ADD {_col} STRING DEFAULT ''")
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


JUNK_PATTERNS = ["no rate limit", "missing rate limit", "lack of rate limiting",
                 "rate limiting disabled", "限速缺失", "未限速",
                 "security header", "安全头", "cors configuration",
                 "sourcemap", "版本号指纹", "self-xss", "tls warning"]

# R3: 配置建议归类 —— 加固建议不作为漏洞结论（原设定质量门控条目），降级为 config-advice 单独归类
CONFIG_ADVICE_RE = re.compile(
    r"(cors|security headers?|安全头|cookie (attrs?|attributes|属性)|httponly|samesite|"
    r"secure flag|版本号|x-powered-by|server banner|version (disclosure|泄露)|missing security)",
    re.I)

# R3: Finding 七态状态机（INTEGRATION-DAG 采纳项）—— 只允许合法迁移
FINDING_STATES = ("candidate", "triaged", "verified", "isolated", "reported", "accepted", "rejected")
FINDING_TRANSITIONS = {
    "candidate": ("triaged", "verified", "isolated", "rejected"),
    "triaged": ("verified", "isolated", "rejected"),
    "verified": ("reported", "isolated"),
    "isolated": ("candidate", "rejected"),
    "reported": ("accepted", "rejected"),
    "accepted": (),
    "rejected": (),
}

def transition_gate(cur, to, actor, reason):
    """W1: 七态转换审计门 — 纯函数单测真源(与 finding_gates 同模式)。
    谁在何时推动了状态必须可追溯: actor(1-40字符) 与 reason(1-80字符) 必填,
    合法迁移才产出轨迹 {ts, actor, reason, from, to}(宿主写入 Finding.last_transition)。"""
    if to not in FINDING_STATES:
        return False, f"to must be one of {list(FINDING_STATES)}", None
    if to not in FINDING_TRANSITIONS.get(cur, ()):
        return False, f"illegal transition {cur} -> {to}", None
    actor = str(actor or "").strip()
    reason = str(reason or "").strip()
    if not actor or len(actor) > 40:
        return False, "actor required (1-40 chars): 谁推动了状态", None
    if not reason or len(reason) > 80:
        return False, "reason required (1-80 chars): 为什么转换", None
    traj = {"ts": datetime.now(timezone.utc).isoformat(), "actor": actor,
            "reason": reason, "from": cur, "to": to}
    return True, "", traj


def redact_pii(s):
    """I-014 + V-10: PII/凭据脱敏 —— 身份证/手机号(含分隔符)/邮箱(大小写)/AWS key/JWT/私钥/Authorization 头"""
    import re as _p
    n = 0
    s, k = _p.subn(r"\b\d{17}[\dXx]\b", "[REDACTED:idcard]", s); n += k
    s, k = _p.subn(r"\b1[3-9]\d[- ]?\d{4}[- ]?\d{4}\b", "[REDACTED:phone]", s); n += k
    s, k = _p.subn(r"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}", "[REDACTED:email]", s); n += k
    s, k = _p.subn(r"\bAKIA[0-9A-Z]{16}\b", "[REDACTED:aws-key]", s); n += k
    s, k = _p.subn(r"\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b", "[REDACTED:jwt]", s); n += k
    s, k = _p.subn(r"-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----",
                   "[REDACTED:private-key]", s); n += k
    s, k = _p.subn(r"(?i)\b(authorization\s*:\s*(?:bearer\s+)?|api[_-]?key\s*[:=]\s*)[^\s\"',;)]{8,}",
                   r"\1[REDACTED]", s); n += k
    return s, n


def upsert_endpoint(conn, url, tech="", business_chain="", param="", method="GET"):
    """#5: worker 可写的 Endpoint 通道 — url 幂等 upsert(存在则补指纹字段, 不存在则建)。
    此前 worker 只有 finding/signal/hypothesis 三个写端点而 /query 只读,
    N2 规则(Signal-[:AT]->Endpoint)结构性落空(实证 endpoints=0, coverage 恒 0)。"""
    r = conn.execute("MATCH (e:Endpoint {url:$u}) RETURN e.id AS id", parameters={"u": url})
    if r.has_next():
        eid = str(r.get_next()[0])
        sets, params = [], {"id": eid}
        if tech:
            sets.append("e.tech=$t"); params["t"] = str(tech)[:100]
        if business_chain:
            sets.append("e.business_chain=$b"); params["b"] = str(business_chain)[:100]
        if sets:
            conn.execute(f"MATCH (e:Endpoint {{id:$id}}) SET {', '.join(sets)}", parameters=params)
        return eid
    eid = f"e-{uuid.uuid4().hex[:12]}"
    conn.execute(
        "CREATE (e:Endpoint {id:$id, url:$u, param:$p, method:$m, tech:$t, business_chain:$b, "
        "coverage_votes:0, exhausted:false})",
        parameters={"id": eid, "u": url, "p": str(param)[:200], "m": str(method)[:10],
                    "t": str(tech)[:100], "b": str(business_chain)[:100]})
    return eid


def normalize_title(t: str) -> str:
    """#11: 标题归一化 — 小写 + 去非字母数字。"""
    return re.sub(r"[^a-z0-9]+", "", str(t or "").lower())


def titles_duplicate(a_norm: str, b_norm: str) -> bool:
    """#11: 去重门判定(纯函数供 pytest) — normalized 精确相等或 trigram Jaccard > 0.9。"""
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm:
        return True
    def _tg(s):
        return {s[i:i + 3] for i in range(len(s) - 2)} if len(s) >= 3 else {s}
    ta, tb = _tg(a_norm), _tg(b_norm)
    inter = len(ta & tb)
    return bool(inter) and inter / len(ta | tb) > 0.9


def repro_gate(sev: str, repro) -> tuple[bool, str]:
    """#6: repro 强制门(纯函数供 pytest) — severity != info 必须带可复现命令。
    实证: 32 条 candidate repro 全空 → 验证环 mass-refute → 报告导出恒空。"""
    if str(sev or "").lower() != "info" and not str(repro or "").strip():
        return False, ("repro required for severity != info: 必须携带可复现命令/证据"
                       "(完整 curl 单行+预期响应特征), 空 repro 会被验证环 refuted 且报告导出恒空")
    return True, ""


def finding_gates(cypher: str) -> tuple[bool, str]:
    """I-009: 三个门提取为模块级纯函数 — 空标题 / DDL / 垃圾清单
    P0-M2: strip literals/comments first (防 'DELETE' in string bypass)
    P0-M3: normalize cypher + case-insensitive entity check
    返回 (ok, err)：ok True 表示通过，False 表示被门拦截，err 为拦截原因
    供 tests/test_graphd_gates.py import 实测，防复刻正则漏检（如 junk NameError）
    """
    import re as _re
    cypher = strip_and_normalize(cypher)
    if not cypher:
        return False, "empty cypher after normalization"
    cu = cypher.upper()
    # DDL 禁令 — schema 固定，运行期禁止建/删表（最优先，与 Finding 无关）
    if _re.search(r"\b(CREATE|DROP)\s+(NODE\s+|REL\s+)?TABLE", cypher, _re.I):
        return False, "DDL forbidden at runtime (schema is fixed)"
    # Finding 相关门：仅当涉及 Finding CREATE 时检查（case-insensitive + word boundary）
    if _re.search(r"\bFINDING\b", cu) and "CREATE" in cu:
        # 空标题门
        m = _re.search(r"title\s*:", cypher + " ")
        if m:
            tail = cypher[m.end():].lstrip()[:2]
            if tail[0:1] in (")", ",") or tail in ('""', "''"):
                return False, "Finding.title must be non-empty"
        # 垃圾洞清单门
        t = _re.search(r"title\s*:\s*[\"'](.*?)[\"']", cypher)
        if t:
            tv = t.group(1).lower()
            if any(j in tv for j in JUNK_PATTERNS):
                return False, f"garbage-listed finding rejected: {tv[:60]}"
    return True, ""


# V-06: worker /query 只读判定提为纯函数(大小写不敏感)。
# P0-M2: strip literals+comments (防 'set/delete' in string literal bypass)
# P0-M3: normalize cypher
# 原 :271/:273 正则区分大小写, Kuzu 关键字大小写不敏感 → 'MATCH (n) detach delete n' 绕过黑名单
# 删任意节点(2026-08-29 隔离实例杀链实证: 写入→小写删除→复查=0)。提取纯函数供 pytest 锁回归。
WORKER_READONLY_WHITELIST = re.compile(r"^(MATCH|RETURN|WITH|CALL)\b", re.I)
WORKER_MUTATION_RE = re.compile(
    r"\b(CREATE|MERGE|SET|DELETE|DETACH|DROP|REMOVE|COPY|EXPORT|IMPORT|ATTACH)\b", re.I)


def worker_query_allowed(cypher: str) -> tuple[bool, str]:
    """worker token /query 只读门: 白名单首词 + 全文变更关键字扫描(均大小写不敏感)。
    P0-M2: strip literals+comments first; P0-M3: normalize cypher."""
    cypher = strip_and_normalize(cypher)
    if not cypher:
        return False, "empty cypher after normalization"
    if not WORKER_READONLY_WHITELIST.match(cypher):
        return False, "/query is read-only for workers (MATCH/RETURN/WITH/CALL only); use /write/* for mutations"
    if WORKER_MUTATION_RE.search(cypher):
        return False, "/query is read-only for workers: mutation keywords forbidden (case-insensitive)"
    return True, ""

# D-4: 并发连接上限 — ThreadingHTTPServer 每连接一线程, 慢连接可耗尽线程/内存(纵深防御)
_INFLIGHT = threading.BoundedSemaphore(int(os.environ.get("P2P_MAX_CONNS", "32")))


# P0-M4: denylist canonicalization
def _iter_strings(obj):
    """Recursively yield all string values from a JSON-like structure."""
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from _iter_strings(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from _iter_strings(v)


def _canonicalize_url(s: str) -> tuple:
    """Try to parse s as URL, return (host_lower, ip_str_or_None).

    Handles:
      - Percent-decoded hostnames (example%2Ecom → example.com)
      - Decimal IP notation (2886729729 = 172.16.0.1)
      - Standard IPv4/IPv6
    """
    s = s.strip()
    if "://" not in s:
        s = "http://" + s
    try:
        u = urllib.parse.urlparse(s)
        host = u.hostname
        if not host:
            return None, None
        # Percent-decode hostname (handles %2E, %2F, etc.)
        try:
            host = urllib.parse.unquote(host)
        except Exception:
            pass
        host = host.lower().strip(".")
        # Try to parse as IP
        try:
            ip = ipaddress.ip_address(host)
            return None, str(ip)
        except ValueError:
            pass
        # Decimal IP notation: all-numeric string → int → IPv4
        if host.isdigit():
            try:
                ip = ipaddress.ip_address(int(host))
                return None, str(ip)
            except ValueError:
                pass
        return host, None
    except Exception:
        return None, None


# Regex to extract URLs and IP-like strings from arbitrary text
_URL_RE = re.compile(
    r'https?://[^\s"\\<>()]+|'
    r'\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b|'
    r'\b\d{8,10}\b'  # decimal IP notation
)


def _extract_urls_and_ips(s: str) -> list:
    """Extract URL-like and IP-like strings from arbitrary text."""
    return _URL_RE.findall(s or "")


def _canonicalized_denylist_check(payload: dict, denied: list) -> str:
    """P0-M4: structured denylist check. Returns matched entry or empty string.

    Extracts URLs and IPs from all string values in payload, then matches
    each against the denylist (domains: suffix match; CIDR: network match).
    """
    denied_domains = [d for d in denied if "/" not in d and not d.replace(".", "").isdigit()]
    denied_cidrs = [d for d in denied if "/" in d or d.replace(".", "").isdigit()]

    # Also include CIDRs from existing endpoint-style entries (e.g. "222.73.243.")
    for d in denied_domains:
        if d.endswith("."):
            denied_cidrs.append(d)

    for s in _iter_strings(payload):
        if not isinstance(s, str) or len(s) < 4:
            continue
        # Extract URLs and IPs from arbitrary text
        candidates = _extract_urls_and_ips(s)
        # Also try the string itself as a URL
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
                    if not dom_clean.endswith("."):  # domain, not prefix
                        if host == dom_clean or host.endswith("." + dom_clean):
                            return dom
    return ""


def _ip_in_network(ip_str: str, cidr: str) -> bool:
    """Check if ip_str is in network cidr (e.g. '10.0.0.0/8' or '222.73.243.')."""
    try:
        if "/" in cidr:
            net = ipaddress.ip_network(cidr, strict=False)
            return ipaddress.ip_address(ip_str) in net
        else:
            # Plain IP or prefix like "222.73.243."
            if "." in cidr and not cidr.endswith("."):
                return ip_str == cidr
            # prefix
            return ip_str.startswith(cidr)
    except Exception:
        return False


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def handle_one_request(self):
        if not _INFLIGHT.acquire(blocking=False):
            try:
                self.send_response(503)
                self.send_header("Content-Type", "application/json")
                self.send_header("Retry-After", "1")
                body = b'{"ok": false, "error": "server busy: connection cap reached"}'
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            except Exception:
                pass
            self.close_connection = True
            return
        try:
            super().handle_one_request()
        finally:
            _INFLIGHT.release()

    def _send(self, code, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/health":
            # V-12: 不回显 DB_PATH(本机信息暴露面收敛)
            self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "unknown"})

    def _auth(self, level):
        """level='host': 需 HOST_TOKEN; level='worker': WORKER 或 HOST 均可。
        #32(审查F1) 提权修复: host 级必须「已配置且匹配」;
        P2P_TOKEN_REQUIRED=1 时未配置即拒绝(生产模式), 默认 0 放行(range 模式)。
        V-13: 恒定时间比较(hmac.compare_digest), 消除 loopback 时序侧信道。"""
        # #32 严格版: 无任何开放回退 —— 未配置 token 的端点一律拒绝
        host = os.environ.get("P2P_HOST_TOKEN", "")
        worker = os.environ.get("P2P_WORKER_TOKEN", "")
        got = self.headers.get("X-Auth", "")
        if level == "host":
            return bool(host) and bool(got) and hmac.compare_digest(got, host)
        # #33修复: host token 单独配置时也放行宿主写入
        if worker:
            if got and worker and hmac.compare_digest(got, worker):
                return True
            if got and host and hmac.compare_digest(got, host):
                return True
            return False
        # I-013: range 开放改为显式 opt-in(P2P_OPEN_RANGE=1), 默认 fail-closed
        if os.environ.get("P2P_OPEN_RANGE") == "1":
            return True
        return False

    def do_POST(self):

        # P0-M1: socket read timeout (slowloris 防护)
        try:
            self.connection.settimeout(int(os.environ.get("P2P_REQ_TIMEOUT", "5")))
        except Exception:
            pass

        # V-11: Content-Length 数值校验 + 1MB 上限(原 int() 对非数字头抛 ValueError 断连)
        try:
            n = int(self.headers.get("Content-Length", 0) or 0)
        except (TypeError, ValueError):
            return self._send(400, {"ok": False, "error": "invalid Content-Length"})
        if n > MAX_BODY_BYTES:
            return self._send(413, {"ok": False, "error": f"payload too large (> {MAX_BODY_BYTES} bytes)"})
        try:
            req_raw = self.rfile.read(n) or b"{}"
            req = json.loads(req_raw)
        except (_socket.timeout,) as e:
            return self._send(408, {"ok": False, "error": f"request timeout: {e}"})
        except Exception as e:
            return self._send(400, {"ok": False, "error": f"bad json: {e}"})
        if not isinstance(req, dict):
            return self._send(400, {"ok": False, "error": "body must be a JSON object"})
        # token 认证(未配置 P2P_TOKEN 时放行) — V-13: 恒定时间比较
        tok = os.environ.get("P2P_TOKEN", "")
        _got_tok = self.headers.get("X-Auth", "")
        if tok and not (_got_tok and hmac.compare_digest(_got_tok, tok)):
            audit_auth_failure("token_mismatch", _got_tok)
            return self._send(401, {"error": "unauthorized"})
        # I-013: /query 与 /write/* 统一 worker 级认证(原先 /query 无 _auth 调用)
        if self.path in ("/query", "/write/finding", "/write/signal", "/write/hypothesis", "/write/endpoint"):
            if not self._auth("worker"):
                audit_auth_failure("worker_token_required", _got_tok)
                return self._send(401, {"ok": False, "error": "unauthorized: X-Auth (worker/host) token required"})
        # R6: 排除清单(denylist)硬拦截 —— 结构化写端点全字段扫描
        # P0-M4: 替换 substring search 为结构化 URL/IP 解析
        # /write/transition 豁免 —— 合规隔离转移的 reason 需要引用红线资产本身。
        if self.path.startswith("/write/") and self.path != "/write/transition":
            _denied = list(DENYLIST.get("domains", [])) + list(DENYLIST.get("cidr_prefix", []))
            try:
                with _locked():
                    _c = kuzu.Connection(db())
                    _r = _c.execute("MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.scope")
                    while _r.has_next():
                        for _s in str(_r.get_next()[0] or "").split(","):
                            _s = _s.strip().lower()
                            if _s.startswith("!") and len(_s) > 1 and _s[1:] not in _denied:
                                _denied.append(_s[1:])
            except Exception as e:
                return self._send(503, {"ok": False, "error": f"denylist check failed (fail-closed): {str(e)[:120]}"})
            if _denied:
                # P0-M4: structured canonicalization — extract URL/IPs from payload,
                # decode percent-encoding, normalize, match against denylist
                _hit = _canonicalized_denylist_check(req, _denied)
                if _hit:
                    audit_denylist_hit(_hit, self.path)
                    return self._send(403, {"ok": False, "error": f"excluded asset (denylist 红线): {_hit} — 排除资产禁测/禁枚举/禁引用, 载荷含之即拒绝"})
        # ---- 结构化写端点: 参数校验替代内联 cypher 正则扫描(根治 #21 死门与 params 旁路) ----

        if self.path in ("/write/finding", "/write/signal", "/write/hypothesis", "/write/endpoint"):
            # V-12: 移除重复 _auth("worker")(上方 :152-154 已统一校验, 原 :157-160 为死代码)
            # 注意: req 已由 do_POST 开头解析, 此处严禁重复 rfile.read(#27 双读挂死)
            with _locked():  # V-11: 锁带 5s deadline
                try:
                    conn = kuzu.Connection(db())
                    if self.path == "/write/finding":
                        title = str(req.get("title") or "").strip()
                        if not title:
                            return self._send(400, {"ok": False, "error": "title required"})
                        # F8: severity 枚举校验
                        sev = str(req.get("severity") or "medium").lower()
                        if sev not in ("critical", "high", "medium", "low", "info"):
                            return self._send(400, {"ok": False, "error": f"invalid severity: {sev}"})
                        pii_hits = 0
                        for fld in ("title", "repro", "evidence_dir"):
                            if req.get(fld):
                                req[fld], k = redact_pii(str(req[fld])); pii_hits += k
                        tl = title.lower().strip()
                        if tl in ("test", "t", "x"):
                            return self._send(400, {"ok": False, "error": "placeholder finding rejected"})
                        if any(j in tl for j in JUNK_PATTERNS):
                            return self._send(400, {"ok": False, "error": "garbage-listed finding rejected"})
                        # R3: 配置建议归类 —— 低危/信息级加固项不占漏洞结论位
                        cat = str(req.get("category") or "vuln")
                        if cat in ("config", "config-advice", "hardening") or \
                                (sev in ("low", "info") and CONFIG_ADVICE_RE.search(tl)):
                            cat = "config-advice"
                        # #6: repro 强制门(纯函数 repro_gate) — worker 收到 400 后可当场自纠重写
                        _ok_rp, _err_rp = repro_gate(sev, req.get("repro"))
                        if not _ok_rp:
                            return self._send(400, {"ok": False, "error": _err_rp})
                        # #11: 去重门 — 同 category 下 normalized(title) 重复(纯函数 titles_duplicate)即拒,
                        # 返回已有 finding id(worker 补证据而非重复新建)。实证: 同标题 finding ×2~3,
                        # 每条重复 candidate 白耗一个完整验证 worker 回合, 漏斗计数被灌水。
                        _norm = normalize_title(title)
                        if _norm:
                            _r = conn.execute("MATCH (f:Finding) WHERE f.category = $c RETURN f.id AS id, f.title AS t",
                                              parameters={"c": cat})
                            while _r.has_next():
                                _row = _r.get_next()
                                _eid, _etitle = str(_row[0]), str(_row[1] or "")
                                if titles_duplicate(_norm, normalize_title(_etitle)):
                                    return self._send(409, {"ok": False, "existing_id": _eid,
                                                            "error": f"duplicate finding: 与 {_eid}('{_etitle[:60]}') 标题重复(category={cat}) — 请勿新建重复条目; 补充证据用 /write/signal 引用该 finding id"})
                        conn.execute(
                            "CREATE (f:Finding {id:$id, title:$title, severity:$sev, cvss:$cvss, "
                            "evidence_dir:$edir, repro:$repro, category:$cat, gate_status:'candidate', ts:$ts})",
                            parameters={"id": str(req.get("id") or f"f-{int(time.time()*1000)}"),
                                        "title": title, "sev": sev,
                                        "cvss": float(req.get("cvss") or 5.0),
                                        "edir": str(req.get("evidence_dir") or ""),
                                        "repro": str(req.get("repro") or ""),
                                        "cat": cat,
                                        "ts": str(req.get("ts") or datetime.now(timezone.utc).isoformat())})
                    elif self.path == "/write/signal":
                        # I-014: Signal.evidence 脱敏
                        _ev_raw = str(req.get("evidence") or "")[:2000]
                        _ev_raw, _ = redact_pii(_ev_raw)
                        _sid = str(req.get("id") or f"s-{int(time.time()*1000)}")
                        conn.execute(
                            "CREATE (s:Signal_ {id:$id, type:$t, weight:$w, status:$st, evidence:$ev, ts:$ts, ring:$ring})",
                            parameters={"id": _sid,
                                        "t": str(req.get("type") or "unknown"),
                                        "w": float(req.get("weight") or 1.0),
                                        "st": str(req.get("status") or "open"),
                                        "ev": _ev_raw,
                                        "ts": str(req.get("ts") or datetime.now(timezone.utc).isoformat()),
                                        "ring": str(req.get("ring") or "discovery")})
                        # #5: 内联 endpoint_url — graphd 代写 Endpoint 节点(缺则建) + AT 边,
                        # N2 规则(Signal-[:AT]->Endpoint)由此闭环(worker /query 只读无法自建边)。
                        _ep = str(req.get("endpoint_url") or "").strip()
                        if _ep and re.match(r"^https?://", _ep, re.I) and len(_ep) <= 500:
                            upsert_endpoint(conn, _ep,
                                            str(req.get("endpoint_tech") or ""),
                                            str(req.get("endpoint_chain") or ""))
                            conn.execute(
                                "MATCH (s:Signal_ {id:$sid}), (e:Endpoint {url:$u}) CREATE (s)-[:AT]->(e)",
                                parameters={"sid": _sid, "u": _ep})
                    elif self.path == "/write/endpoint":
                        # #5: worker 可写的 Endpoint 通道(独立于 signal 内联) — upsert 幂等
                        url = str(req.get("url") or "").strip()
                        if not url or len(url) > 500:
                            return self._send(400, {"ok": False, "error": "url required (1-500 chars)"})
                        if not re.match(r"^https?://", url, re.I):
                            return self._send(400, {"ok": False, "error": "url must start with http(s)://"})
                        _tech, _ = redact_pii(str(req.get("tech") or "")[:100])
                        eid = upsert_endpoint(conn, url, _tech,
                                              str(req.get("business_chain") or ""),
                                              str(req.get("param") or ""),
                                              str(req.get("method") or "GET"))
                        return self._send(200, {"ok": True, "id": eid})
                    else:
                        # I-014: Hypothesis.text 脱敏
                        _txt_raw = str(req.get("text") or "")[:1500]
                        _txt_raw, _ = redact_pii(_txt_raw)
                        conn.execute(
                            "CREATE (h:Hypothesis {id:$id, text:$txt, strategy:$strat, status:'open', ts:$ts})",
                            parameters={"id": str(req.get("id") or f"h-{int(time.time()*1000)}"),
                                        "txt": _txt_raw,
                                        "strat": str(req.get("strategy") or "inversion"),
                                        "ts": str(req.get("ts") or datetime.now(timezone.utc).isoformat())})
                except TimeoutError as _te:
                    return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
                except Exception as e:
                    return self._send(500, {"ok": False, "error": str(e)[:200]})
            return self._send(200, {"ok": True})

        # R3: Finding 七态状态机转换（host 专属；worker 的 verified 结论仍须经验证器环独立重放背书）
        if self.path == "/write/transition":
            if not self._auth("host"):
                return self._send(403, {"ok": False, "error": "transitions require host token"})
            fid = str(req.get("id") or "")
            to = str(req.get("to") or "").strip().lower()
            if not fid:
                return self._send(400, {"ok": False, "error": "id required"})
            with _locked():
                try:
                    conn = kuzu.Connection(db())
                    r = conn.execute("MATCH (f:Finding {id:$id}) RETURN f.gate_status", parameters={"id": fid})
                    if not r.has_next():
                        return self._send(404, {"ok": False, "error": "finding not found"})
                    cur = str(r.get_next()[0] or "candidate")
                    ok, err, traj = transition_gate(cur, to, req.get("actor"), req.get("reason"))
                    if not ok:
                        return self._send(400, {"ok": False, "error": err})
                    traj_s = json.dumps(traj, ensure_ascii=False)
                    if to == "verified":
                        conn.execute(
                            "MATCH (f:Finding {id:$id}) SET f.gate_status=$to, f.verified_at=$ts, f.last_transition=$traj",
                            parameters={"id": fid, "to": to, "ts": traj["ts"], "traj": traj_s})
                    else:
                        conn.execute(
                            "MATCH (f:Finding {id:$id}) SET f.gate_status=$to, f.last_transition=$traj",
                            parameters={"id": fid, "to": to, "traj": traj_s})
                except TimeoutError as _te:
                    return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
                except Exception as e:
                    return self._send(500, {"ok": False, "error": str(e)[:200]})
            return self._send(200, {"ok": True, "from": cur, "to": to, "last_transition": traj})

        # 经验库写权限收归 host(防被注入的 worker 给自己刷经验权重) — V-06: re.I + REMOVE
        if re.search(r"ExperienceWeight", req.get("cypher", "")) and \
                re.search(r"\b(CREATE|SET|MERGE|DELETE|REMOVE)\b", req.get("cypher", ""), re.I):
            if not self._auth("host"):
                return self._send(403, {"ok": False, "error": "ExperienceWeight mutations require host token"})
        cypher_raw = req.get("cypher", "")
        # I-009: 三个门已提取为 finding_gates 纯函数，单点调用（防复刻漏检）
        ok, err = finding_gates(cypher_raw)
        if not ok:
            code = 403 if "DDL" in err else 400
            return self._send(code, {"ok": False, "error": err})
        # 纵深防御: 写操作中的 URL host 必须在活跃 scope 内 — V-06: re.I + REMOVE
        import re as _re
        if _re.search(r"\b(CREATE|SET|MERGE|DELETE|REMOVE)\b", cypher_raw, _re.I):
            # #4: 单 active engagement 门(写入侧 fail-closed) — 已有 active 时拒绝再建,
            #     防"B 轮启动→stopAll 全局杀 worker→A 变僵尸 active"(实证 36 分钟零派发)。
            #     续跑(P2P_RESUME)走同节点接管不建新 Engagement, 不受影响。
            if "Engagement" in cypher_raw and "CREATE" in cypher_raw.upper():
                with _locked():
                    try:
                        _c1 = kuzu.Connection(db())
                        _r1 = _c1.execute("MATCH (e:Engagement) WHERE e.status='active' RETURN e.name AS n LIMIT 1")
                        if _r1.has_next():
                            _n1 = str(_r1.get_next()[0] or "?")
                            return self._send(409, {"ok": False, "error": f"active engagement exists: {_n1} — 同一时刻只允许一个(先 /pentest-stop 冻结, 或同目标 P2P_RESUME=1 续跑接管)"})
                    except Exception as e:
                        return self._send(503, {"ok": False, "error": f"single-active check failed (fail-closed): {str(e)[:120]}"})
            urls = _re.findall(r"https?://[A-Za-z0-9.\-]+", cypher_raw)
            hosts = set()
            for u in urls:
                h = u.split("://")[1].lower()
                if h not in ("127.0.0.1", "localhost"):
                    hosts.add(h)
            if hosts:
                # 首个 engagement 创建时无活跃 scope，跳过校验（自身即定义 scope）
                if "Engagement" in cypher_raw and "CREATE" in cypher_raw.upper():
                    pass
                else:
                    with _locked():  # V-11: 锁带 5s deadline
                        try:
                            c = kuzu.Connection(db())
                            r = c.execute("MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.scope")
                            scope = ""
                            while r.has_next():
                                scope += str(r.get_next()[0] or "") + ","
                            # R6: scope 语法扩展 —— `!` 前缀条目 = 排除清单(denylist), 优先于白名单硬拦截。
                            # 实证: 授权泛域(z tgame.com)的白名单天然放行排除资产子域(mail.ztgame.com),
                            # 简报红线(提示层)拦不住自主 worker → 需在写门控层 fail-closed。
                            allowed, denied = [], []
                            for s in scope.split(","):
                                s = s.strip().lower()
                                if not s:
                                    continue
                                if s.startswith("!"):
                                    d = s[1:].strip()
                                    if d:
                                        denied.append(d)
                                else:
                                    allowed.append(s)
                            # R6.1: 合并全局黑名单文件(denylist.json)
                            for d in DENYLIST.get("domains", []):
                                if d not in denied:
                                    denied.append(d)
                            for c in DENYLIST.get("cidr_prefix", []):
                                if c not in denied:
                                    denied.append(c)
                            if not allowed:
                                pass  # 无活跃 engagement 时开放（首个创建）
                            else:
                                for h in hosts:
                                    # R6: 排除清单优先 —— 后缀/前缀匹配, 命中即拒绝(红线资产零触碰)
                                    if any(h == d or h.endswith("." + d) or (d.endswith(".") and h.startswith(d)) for d in denied):
                                        return self._send(403, {"error": f"excluded asset (denylist): {h}"})
                                    if not any(h == a or h.endswith("." + a) for a in allowed):
                                        return self._send(403, {"error": f"scope violation at graphd layer: {h}"})
                        except Exception as e:
                            # I-007: fail-closed — scope 校验自身故障时拒绝写入而非放行
                            return self._send(503, {"ok": False, "error": f"scope check failed (fail-closed): {str(e)[:120]}"})
        if self.path == "/query":
            cypher = req.get("cypher", "").strip()
            params = req.get("params") or {}
            if not cypher:
                return self._send(400, {"error": "empty cypher"})
            # V-05r: 只读白名单仅对 worker token —— host token 是调度器合法写通道
            # (AgentIdentity/Engagement/ExperienceWeight MERGE 均经 /query；worker 写走 /write/*)
            _host_tok = os.environ.get("P2P_HOST_TOKEN", "")
            _got = self.headers.get("X-Auth", "")
            _is_host = bool(_host_tok) and bool(_got) and hmac.compare_digest(_got, _host_tok)  # V-13
            if not _is_host:
                # V-06: 纯函数判定(大小写不敏感白名单+黑名单), 替代原区分大小写的 :271/:273
                ok_q, err_q = worker_query_allowed(cypher)
                if not ok_q:
                    return self._send(403, {"ok": False, "error": err_q})
            with _locked():  # V-11: 锁带 5s deadline
                try:
                    conn = kuzu.Connection(db())
                    res = conn.execute(cypher, params)
                    rows = []
                    while res.has_next():
                        rows.append(res.get_next())
                    cols = res.get_column_names()
                    data = []
                    for r in rows:
                        data.append({cols[i]: _jsonify(r[i]) for i in range(len(cols))})
                    return self._send(200, {"ok": True, "rows": data})
                except TimeoutError as _te:
                    return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
                except Exception as e:
                    # V-12: 错误信息截断回显(原 str(e) 全文回传)
                    return self._send(400, {"ok": False, "error": str(e)[:200]})
        elif self.path == "/reset":
            # V-12: /reset 改认 HOST token(原仅认遗留 P2P_TOKEN, 与主鉴权体系脱节)
            if not self._auth("host"):
                return self._send(403, {"ok": False, "error": "/reset requires host token"})
            global _db
            with _lock:
                _db = None
                import shutil
                shutil.rmtree(DB_PATH, ignore_errors=True)
            return self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "unknown"})


def _jsonify(v):
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    return str(v)


if __name__ == "__main__":
    # #14: 实例互斥(flock) — kuzu 无文件锁, 两个 graphd 并发打开同一 DB 会互相覆盖
    #      (实证: worker 自主拉起第二实例 + kill -9 → 377 findings 全图丢失)。
    #      独占非阻塞锁; 锁文件随进程存活, 进程死亡(含 kill -9)由 OS 自动释放。
    import fcntl
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    _lock_fh = open(DB_PATH + ".lock", "w")
    try:
        fcntl.flock(_lock_fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print(f"[graphd] refusing to start: another instance holds {DB_PATH}.lock "
              f"(kuzu 无实例互斥, 并发打开同一库会毁数据 — 先停旧实例)", flush=True)
        sys.exit(1)
    db()  # 初始化 schema

    def _safe_token_path(p):
        """路径参数白名单: token 文件仅允许位于 ~/.config/d2d/ 下(防 env 污染导向任意路径读写)"""
        base = os.path.realpath(os.path.expanduser("~/.config/d2d"))
        r = os.path.realpath(os.path.expanduser(p))
        if not r.startswith(base + os.sep):
            print(f"[graphd] token path rejected (outside {base}): {p}", flush=True)
            sys.exit(1)
        return r

    # #32: host token 持久化 —— 文件存在则加载进环境; 不存在则生成
    import secrets as _sec
    if not os.environ.get("P2P_HOST_TOKEN"):
        tok_path = _safe_token_path(os.environ.get("P2P_HOST_TOKEN_FILE", os.path.expanduser("~/.config/d2d/host-token")))
        if os.path.exists(tok_path):
            # V-13: with-open 防句柄泄漏
            with open(tok_path) as _f:
                os.environ["P2P_HOST_TOKEN"] = _f.read().strip()
        else:
            # 兼容旧路径回退（迁移期）
            _legacy = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".host-token")
            if os.path.exists(_legacy):
                with open(_legacy) as _f:
                    os.environ["P2P_HOST_TOKEN"] = _f.read().strip()
                # 迁移到新路径
                os.makedirs(os.path.dirname(tok_path), exist_ok=True)
                with open(tok_path, "w") as f:
                    f.write(os.environ["P2P_HOST_TOKEN"])
                os.chmod(tok_path, 0o600)
            else:
                tok = _sec.token_hex(16)
                os.makedirs(os.path.dirname(tok_path), exist_ok=True)
                with open(tok_path, "w") as f:
                    f.write(tok)
                os.chmod(tok_path, 0o600)
                os.environ["P2P_HOST_TOKEN"] = tok
    # I-013: worker token 持久化（fail-closed 凭证）
    if not os.environ.get("P2P_WORKER_TOKEN"):
        w_tok_path = _safe_token_path(os.environ.get("P2P_WORKER_TOKEN_FILE", os.path.expanduser("~/.config/d2d/worker-token")))
        if os.path.exists(w_tok_path):
            with open(w_tok_path) as _wf:  # V-13: with-open
                os.environ["P2P_WORKER_TOKEN"] = _wf.read().strip()
        else:
            w_tok = _sec.token_hex(16)
            os.makedirs(os.path.dirname(w_tok_path), exist_ok=True)
            with open(w_tok_path, "w") as f:
                f.write(w_tok)
            os.chmod(w_tok_path, 0o600)
            os.environ["P2P_WORKER_TOKEN"] = w_tok
    # R6.1: 全局黑名单(denylist.json) — 与白名单对应; 对所有 engagement 的写门控生效
    # (模块级 DENYLIST 已在文件头初始化; 此处同模块作用域, 无需 global)
    try:
        _dl_path = os.environ.get("P2P_DENYLIST_FILE", os.path.expanduser("~/.d2d-data/config/denylist.json"))
        with open(_dl_path) as _dlf:
            _dl = json.load(_dlf)
        DENYLIST["domains"] = [str(x).lower() for x in _dl.get("domains", [])]
        DENYLIST["cidr_prefix"] = [str(x) for x in _dl.get("cidr_prefix", [])]
    except Exception:
        DENYLIST = {"domains": [], "cidr_prefix": []}
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    _tok = "required" if os.environ.get("P2P_TOKEN_REQUIRED") == "1" else "open"
    print(f"[graphd] listening :{PORT} db={DB_PATH} token_required={_tok} "
          f"host={'set' if os.environ.get('P2P_HOST_TOKEN') else 'unset'} "
          f"worker={'set' if os.environ.get('P2P_WORKER_TOKEN') else 'unset'}", flush=True)
    srv.serve_forever()

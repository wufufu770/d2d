#!/usr/bin/env python3
"""graphd - Kuzu 单写者 sidecar。三环+插件全部经 HTTP 读写图,规避多进程锁。
stdlib only (kuzu 除外). GET /health POST /query POST /reset
"""
import hmac
import json
import os

# R6.1: 全局黑名单(denylist.json)运行时缓存 — 启动时从文件加载, 对所有 engagement 生效
DENYLIST = {"domains": [], "cidr_prefix": []}
import re
import sys
import threading
import time
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


def finding_gates(cypher: str) -> tuple[bool, str]:
    """I-009: 三个门提取为模块级纯函数 — 空标题 / DDL / 垃圾清单
    返回 (ok, err)：ok True 表示通过，False 表示被门拦截，err 为拦截原因
    供 tests/test_graphd_gates.py import 实测，防复刻正则漏检（如 junk NameError）
    """
    import re as _re
    # DDL 禁令 — schema 固定，运行期禁止建/删表（最优先，与 Finding 无关）
    if _re.search(r"\b(CREATE|DROP)\s+(NODE\s+|REL\s+)?TABLE", cypher, _re.I):
        return False, "DDL forbidden at runtime (schema is fixed)"
    # Finding 相关门：仅当涉及 Finding CREATE 时检查
    if "Finding" in cypher and "CREATE" in cypher.upper():
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
# 原 :271/:273 正则区分大小写, Kuzu 关键字大小写不敏感 → 'MATCH (n) detach delete n' 绕过黑名单
# 删任意节点(2026-08-29 隔离实例杀链实证: 写入→小写删除→复查=0)。提取纯函数供 pytest 锁回归。
WORKER_READONLY_WHITELIST = re.compile(r"^(MATCH|RETURN|WITH|CALL)\b", re.I)
WORKER_MUTATION_RE = re.compile(
    r"\b(CREATE|MERGE|SET|DELETE|DETACH|DROP|REMOVE|COPY|EXPORT|IMPORT|ATTACH)\b", re.I)


def worker_query_allowed(cypher: str) -> tuple[bool, str]:
    """worker token /query 只读门: 白名单首词 + 全文变更关键字扫描(均大小写不敏感)。
    误报取舍: 字符串字面量里含独立 'set/delete' 等词的查询会被拒 —— fail-closed 方向。"""
    if not WORKER_READONLY_WHITELIST.match(cypher):
        return False, "/query is read-only for workers (MATCH/RETURN/WITH/CALL only); use /write/* for mutations"
    if WORKER_MUTATION_RE.search(cypher):
        return False, "/query is read-only for workers: mutation keywords forbidden (case-insensitive)"
    return True, ""

# D-4: 并发连接上限 — ThreadingHTTPServer 每连接一线程, 慢连接可耗尽线程/内存(纵深防御)
_INFLIGHT = threading.BoundedSemaphore(int(os.environ.get("P2P_MAX_CONNS", "32")))

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

        # V-11: Content-Length 数值校验 + 1MB 上限(原 int() 对非数字头抛 ValueError 断连)
        try:
            n = int(self.headers.get("Content-Length", 0) or 0)
        except (TypeError, ValueError):
            return self._send(400, {"ok": False, "error": "invalid Content-Length"})
        if n > MAX_BODY_BYTES:
            return self._send(413, {"ok": False, "error": f"payload too large (> {MAX_BODY_BYTES} bytes)"})
        try:
            req = json.loads(self.rfile.read(n) or b"{}")
        except Exception as e:
            return self._send(400, {"ok": False, "error": f"bad json: {e}"})
        if not isinstance(req, dict):
            return self._send(400, {"ok": False, "error": "body must be a JSON object"})
        # token 认证(未配置 P2P_TOKEN 时放行) — V-13: 恒定时间比较
        tok = os.environ.get("P2P_TOKEN", "")
        _got_tok = self.headers.get("X-Auth", "")
        if tok and not (_got_tok and hmac.compare_digest(_got_tok, tok)):
            return self._send(401, {"error": "unauthorized"})
        # I-013: /query 与 /write/* 统一 worker 级认证(原先 /query 无 _auth 调用)
        if self.path in ("/query", "/write/finding", "/write/signal", "/write/hypothesis"):
            if not self._auth("worker"):
                return self._send(401, {"ok": False, "error": "unauthorized: X-Auth (worker/host) token required"})
        # R6: 排除清单(denylist)硬拦截 —— 结构化写端点全字段扫描(禁引用: 载荷含排除资产即 403)。
        # 实证通道: /write/signal 的 evidence 带 mail.ztgame.com 曾直穿(旧实现只扫 /query 变更类 cypher)。
        # /write/transition 豁免 —— 合规隔离转移的 reason 需要引用红线资产本身。
        if self.path.startswith("/write/") and self.path != "/write/transition":
            _denied = list(DENYLIST.get("domains", [])) + list(DENYLIST.get("cidr_prefix", []))
            try:
                with _locked():  # V-11: 锁带 5s deadline
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
                _blob = json.dumps(req, ensure_ascii=False).lower()
                _hit = None
                for _d in _denied:
                    # 网段前缀条目(如 "222.73.243.")后接数字 IP 主机位; 域名条目要求词边界
                    if _d.endswith("."):
                        _pat = r"(?:^|[^a-z0-9.\-])" + re.escape(_d) + r"\d"
                    else:
                        _pat = r"(?:^|[^a-z0-9.\-])" + re.escape(_d) + r"(?:$|[^a-z0-9\-])"
                    if re.search(_pat, _blob) or f"https://{_d}" in _blob or f"http://{_d}" in _blob:
                        _hit = _d
                        break
                if _hit:
                    return self._send(403, {"ok": False, "error": f"excluded asset (denylist 红线): {_hit} — 排除资产禁测/禁枚举/禁引用, 载荷含之即拒绝"})
        # ---- 结构化写端点: 参数校验替代内联 cypher 正则扫描(根治 #21 死门与 params 旁路) ----

        if self.path in ("/write/finding", "/write/signal", "/write/hypothesis"):
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
                        conn.execute(
                            "CREATE (s:Signal_ {id:$id, type:$t, weight:$w, status:$st, evidence:$ev, ts:$ts, ring:$ring})",
                            parameters={"id": str(req.get("id") or f"s-{int(time.time()*1000)}"),
                                        "t": str(req.get("type") or "unknown"),
                                        "w": float(req.get("weight") or 1.0),
                                        "st": str(req.get("status") or "open"),
                                        "ev": _ev_raw,
                                        "ts": str(req.get("ts") or datetime.now(timezone.utc).isoformat()),
                                        "ring": str(req.get("ring") or "discovery")})
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

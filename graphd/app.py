#!/usr/bin/env python3
"""graphd - Kuzu 单写者 sidecar。三环+插件全部经 HTTP 读写图,规避多进程锁。
stdlib only (kuzu 除外). GET /health GET /authorized POST /query POST /reset
"""
import hmac
import json
import os
import re
import socket
import sys
import threading
import time
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# #73: 审计日志 —— 可选依赖, try/except 降级导入(audit.py 缺失/损坏时审计退化为无操作, 业务不崩)。
# 两种形态都接住: 包内导入(from graphd.app import, pytest/调度器侧)与直接脚本运行(cd graphd && python3 app.py)。
try:
    from graphd import audit as _audit_mod
except Exception:
    try:
        import audit as _audit_mod
    except Exception:
        _audit_mod = None


def _audit_event(kind, detail):
    """#73: 审计事件统一出口。audit_event 内部自吞一切异常(静默计数), 此处不重复包裹 ——
    审计故障永不改变门控判定结果。调用点: 认证失败 / denylist 命中 / 非法状态迁移。"""
    if _audit_mod is not None:
        _audit_mod.audit_event(kind, detail)

# 可移植性: DB 默认落在脚本同目录(每仓天然隔离); 端口由各仓 start.sh 钉定
DB_PATH = os.environ.get("P2P_GRAPH", os.path.join(os.path.dirname(os.path.abspath(__file__)), "kuzu_db"))
# M8 守护自愈锚: /health 回显三要素。发版必须改 VERSION — preflight 据版本差异识别 stale 旧实例;
# STARTED_AT 是本进程启动时间, 预检与 /proc/<pid> starttime 比对防 pid 复用误判。
VERSION = "1.1.0"
STARTED_AT = datetime.now(timezone.utc).isoformat(timespec="seconds")
PORT = int(os.environ.get("P2P_GRAPH_PORT", "8766"))

import kuzu

# 巨型文件拆分(纯代码搬移, 逻辑零改动): 纯函数/表定义/门控逻辑移入 gd 子包, 此处统一 re-export
# —— `from graphd.app import X` 的既有导入路径(tests/外部调用方)零改动。两种形态都接住:
# 包内导入(graphd.gd —— pytest/调度器侧)与直接脚本运行(cd graphd && python3 app.py)。
try:
    from graphd.gd import (_URL_RE, DENYLIST, FINDING_DEDUP_SCAN_SQL, FINDING_STATES,
                           FINDING_TRANSITIONS, JUNK_PATTERNS, L1_DENY_REASON, MAX_BODY_BYTES,
                           MAX_QUERY_ROWS,
                           CONFIG_ADVICE_RE, SCHEMA, _backfill_eng, _jsonify,
                           _read_denylist_file, _safe_token_path, attribute_by_time,
                           auth_check, bounded_rows, candidate_watermark_reject,
                           canonical_cat, config_reject, content_length_gate,
                           cvss_or_default, dedup_cat, engagement_cap_gate,
                           endpoint_sig_duplicate,
                           eng_time_windows, finding_gates, host_in_scope, hostport_of,
                           init_schema, is_engagement_create, l1_gate, legacy_token_ok,
                           normalize_title, parse_scope_allows, pick_write_eng,
                           prose_denylist_hit, redact_pii, repro_gate, title_tokens,
                           titles_duplicate, transition_gate, url_sig, worker_query_allowed)
except Exception:  # 直接脚本运行(cd graphd && python3 app.py)
    from gd import (_URL_RE, DENYLIST, FINDING_DEDUP_SCAN_SQL, FINDING_STATES,
                    FINDING_TRANSITIONS, JUNK_PATTERNS, L1_DENY_REASON, MAX_BODY_BYTES,
                    MAX_QUERY_ROWS,
                    CONFIG_ADVICE_RE, SCHEMA, _backfill_eng, _jsonify,
                    _read_denylist_file, _safe_token_path, attribute_by_time,
                    auth_check, bounded_rows, candidate_watermark_reject,
                    canonical_cat, config_reject, content_length_gate,
                    cvss_or_default, dedup_cat, engagement_cap_gate,
                    endpoint_sig_duplicate,
                    eng_time_windows, finding_gates, host_in_scope, hostport_of,
                    init_schema, is_engagement_create, l1_gate, legacy_token_ok,
                    normalize_title, parse_scope_allows, pick_write_eng,
                    prose_denylist_hit, redact_pii, repro_gate, title_tokens,
                    titles_duplicate, transition_gate, url_sig, worker_query_allowed)

_lock = threading.Lock()
_db = None


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


def reset_database():
    """H18: /reset 核心(handler 与 pytest 共用)。审计实证: 旧实现不 close Database 就
    rmtree + ignore_errors=True —— 打开中的句柄下删除产生半删状态, 删除失败被静默吞掉,
    且 kuzu 0.11.x 的 DB 是单文件(rmtree 对文件必抛) → /reset 实为静默 no-op。
    现顺序: ①持全局写锁(与所有 DB 读写互斥, 确保无在途使用) ②close Database
    ③删 DB(文件/目录双形态, 失败必须上报, 调用方回 500 而非假成功) ④清 .wal 残留
    ⑤重新 init schema。返回 {"ok": bool, "error"?: str}。"""
    global _db
    with _lock:
        old = _db
        _db = None
        if old is not None:
            _close = getattr(old, "close", None)
            if callable(_close):
                try:
                    _close()
                except Exception:
                    pass  # 句柄已坏不阻塞重置; 目录删不掉时由 rmtree 上报
        import shutil
        try:
            if os.path.isdir(DB_PATH):
                shutil.rmtree(DB_PATH)  # 旧版 kuzu: DB 为目录
            else:
                # kuzu 0.11.x: DB 落为单文件。审计 H18 加重实锤: 旧代码 rmtree(文件) 抛
                # NotADirectoryError 被 ignore_errors=True 静默吞掉 → /reset 实为 no-op,
                # 库从未被删掉, 面板却收到 200 ok。
                os.remove(DB_PATH)
        except FileNotFoundError:
            pass  # 本就不存在: 幂等
        except Exception as e:
            return {"ok": False,
                    "error": f"reset failed (DB 未删净, 请人工检查 {DB_PATH}): {str(e)[:200]}"}
        try:
            if os.path.exists(DB_PATH + ".wal"):
                os.remove(DB_PATH + ".wal")  # wal 残留会在重建时被重放, 必须一并清除
        except Exception as e:
            return {"ok": False, "error": f"reset failed (wal 清理失败): {str(e)[:160]}"}
        # 注意: DB_PATH.lock 不动 —— flock 由本存活进程持有, 删锁文件会破坏实例互斥(#14)
        db()  # 重建并 init schema, 后续请求立即可用
        return {"ok": True}


def upsert_endpoint(conn, url, tech="", business_chain="", param="", method="GET", eng="", authorized=False):
    """#5: worker 可写的 Endpoint 通道 — url 幂等 upsert(存在则补指纹字段, 不存在则建)。
    此前 worker 只有 finding/signal/hypothesis 三个写端点而 /query 只读,
    N2 规则(Signal-[:AT]->Endpoint)结构性落空(实证 endpoints=0, coverage 恒 0)。
    W5: eng 归属 — 新建即打标; 已有无主(eng='')行被归属时补写, 已归属行不抢占。
    L0/L1 分级验证: authorized 授权资产标记 — 只升不降(显式 authorized=True 才打标,
    常规 upsert 不清既有标记); HTTP 侧该字段仅 host token 可置(worker 不可自授权)。"""
    r = conn.execute("MATCH (e:Endpoint {url:$u}) RETURN e.id AS id, e.eng AS eng", parameters={"u": url})
    if r.has_next():
        row = r.get_next()
        eid = str(row[0])
        cur_eng = str(row[1] or "") if len(row) > 1 else ""
        sets, params = [], {"id": eid}
        if tech:
            sets.append("e.tech=$t"); params["t"] = str(tech)[:100]
        if business_chain:
            sets.append("e.business_chain=$b"); params["b"] = str(business_chain)[:100]
        if sets:
            conn.execute(f"MATCH (e:Endpoint {{id:$id}}) SET {', '.join(sets)}", parameters=params)
        if cur_eng == "" and eng:
            conn.execute("MATCH (e:Endpoint {id:$id}) SET e.eng=$e", parameters={"id": eid, "e": str(eng)[:120]})
        if authorized:
            conn.execute("MATCH (e:Endpoint {id:$id}) SET e.authorized=true", parameters={"id": eid})
        return eid
    eid = f"e-{uuid.uuid4().hex[:12]}"
    conn.execute(
        "CREATE (e:Endpoint {id:$id, url:$u, param:$p, method:$m, tech:$t, business_chain:$b, "
        "coverage_votes:0, exhausted:false, eng:$eng, authorized:$az})",
        parameters={"id": eid, "u": url, "p": str(param)[:200], "m": str(method)[:10],
                    "t": str(tech)[:100], "b": str(business_chain)[:100], "eng": str(eng)[:120],
                    "az": bool(authorized)})
    return eid


_D2D_PAUSE_FILE = os.environ.get("D2D_DATA_DIR", os.path.expanduser("~/.d2d-data")) + "/config/paused.json"
_pause_mtime_cache: list = [None, False]  # [mtime, paused] — 每请求检查 mtime, 变了才重读


def _d2d_paused() -> bool:
    """P0-3 全局暂停开关(取消令牌的 worker 侧通道) — stopAll 写 paused.json, 写通道 409。
    mtime 缓存: 文件未变时不重读, 请求路径零额外 IO; startEngagement 删除文件即解除。"""
    try:
        m = os.path.getmtime(_D2D_PAUSE_FILE)
    except OSError:
        _pause_mtime_cache[0], _pause_mtime_cache[1] = None, False
        return False
    if m != _pause_mtime_cache[0]:
        try:
            with open(_D2D_PAUSE_FILE) as f:
                _pause_mtime_cache[1] = bool(json.load(f).get("paused"))
        except Exception:
            _pause_mtime_cache[1] = False
        _pause_mtime_cache[0] = m
    return _pause_mtime_cache[1]


_D2D_PAUSE_DIR = os.path.dirname(_D2D_PAUSE_FILE)
_eng_pause_cache: dict = {}  # eng → [mtime, paused] — 多开隔离: 停 A 不 409 B 的写入


def _eng_paused(eng: str) -> bool:
    """W5: per-engagement 暂停开关 — stopAll(该 engagement 的 runner/调度器)写
    config/paused-<eng>.json, 只有归属该 engagement 的写入被 409; 多开互不误伤。
    旧版全局 paused.json 仍生效(向后兼容), 但新停机路径只写 per-eng 文件。"""
    if not eng or "/" in eng or ".." in eng:
        return False
    p = f"{_D2D_PAUSE_DIR}/paused-{eng}.json"
    try:
        m = os.path.getmtime(p)
    except OSError:
        _eng_pause_cache.pop(eng, None)
        return False
    c = _eng_pause_cache.get(eng)
    if c is None or m != c[0]:
        try:
            with open(p) as f:
                v = bool(json.load(f).get("paused"))
        except Exception:
            v = False
        _eng_pause_cache[eng] = [m, v]
        return v
    return c[1]


# D-4: 并发连接上限 — ThreadingHTTPServer 每连接一线程, 慢连接可耗尽线程/内存(纵深防御)
_INFLIGHT = threading.BoundedSemaphore(int(os.environ.get("P2P_MAX_CONNS", "32")))

class Handler(BaseHTTPRequestHandler):
    # #73 slowloris 第一道(慢头部): StreamRequestHandler.setup() 依据该类属性, 在连接的
    # 「首个请求行/头部字节被读取之前」即对 socket settimeout —— 首请求与 keep-alive 后续
    # 请求的头部阶段全程受限。超时抛 socket.timeout: 头部阶段由 stdlib handle_one_request
    # 捕获并断连(线程立即释放); body 阶段由 do_POST 显式捕获回 408。
    timeout = 30

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

    def _slowloris_arm(self):
        """#73 slowloris 第二道(请求处理入口): 对连接 socket 设 30s 读超时。
        socket 超时是连接级属性, 一旦设置即覆盖本连接「后续所有读」—— 当前请求的 body 阶段,
        以及 keep-alive 下一请求的请求行/头部阶段(慢头部); 与类属性 timeout=30(覆盖首请求
        慢头部)互为冗余防线, 慢头部+慢 body 两阶段均不超 30s。响应发送后不恢复 None ——
        连接本就该短命, 保持受限; 读超时统一走 _timeout_408/stdlib 断连路径。"""
        try:
            self.connection.settimeout(30)
        except Exception:
            pass  # 连接已被对端关闭: 交由上层异常路径处理

    def _timeout_408(self):
        """#73: 读超时(慢头部/慢 body 任一阶段漏到本层) → 408 Request Timeout 并关闭连接。
        rfile 在超时后缓冲状态不可靠, 必须 close_connection; 408 让客户端可感知重试语义。
        (头部阶段首请求的 socket.timeout 由 stdlib handle_one_request 捕获, 静默断连。)"""
        self.close_connection = True
        try:
            self._send(408, {"ok": False,
                             "error": "request timeout: read phase exceeded 30s (slowloris guard)"})
        except Exception:
            pass

    def _peer(self):
        """来源地址(防御性格式化: client_address 存在 AF_UNIX 等非 (ip, port) 形态)。"""
        try:
            return "%s:%s" % (self.client_address[0], self.client_address[1])
        except Exception:
            return str(self.client_address)

    def do_GET(self):
        self._slowloris_arm()  # #73: 慢头部/慢 body 读全程受限(见 _slowloris_arm 注释)
        if self.path == "/health":
            # V-12: 不回显 DB_PATH(本机信息暴露面收敛)
            # M8 守护自愈: version/pid/started_at — start-all 预检做"只杀自己人"三重校验
            # (pidfile + /proc starttime + 版本握手, 任一不符视为外来者不接管)
            self._send(200, {"ok": True, "version": VERSION, "pid": os.getpid(), "started_at": STARTED_AT})
        elif self.path == "/authorized":
            # L0/L1 分级验证: 授权资产集合查询 — L1 主动验证硬门的数据出口。
            # 与 /query 同级认证(worker/host token); validator.js 亦可经 q() 直查同表
            # (MATCH (e:Endpoint) WHERE e.authorized = true), 两口同源不双写。
            if not self._auth("worker"):
                return self._send(401, {"ok": False, "error": "unauthorized: X-Auth (worker/host) token required"})
            with _locked():  # V-11: 锁带 5s deadline
                try:
                    conn = kuzu.Connection(db())
                    r = conn.execute("MATCH (e:Endpoint) WHERE e.authorized = true RETURN e.url")
                    items = []
                    while r.has_next():
                        u = str(r.get_next()[0] or "")
                        items.append({"url": u, "hostport": hostport_of(u)})
                except TimeoutError as _te:
                    return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
                except Exception as e:
                    return self._send(500, {"ok": False, "error": str(e)[:200]})
            return self._send(200, {"ok": True, "authorized": items, "count": len(items)})
        else:
            self._send(404, {"error": "unknown"})

    def _auth(self, level):
        """level='host': 需 HOST_TOKEN; level='worker': WORKER 或 HOST 均可。
        #32(审查F1) 提权修复: host 级必须「已配置且匹配」;
        P2P_TOKEN_REQUIRED=1 时未配置即拒绝(生产模式), 默认 0 放行(range 模式)。
        V-13: 恒定时间比较(hmac.compare_digest), 消除 loopback 时序侧信道。
        #73: 认证失败统一审计 —— host 级 kind='auth-fail', worker 级 kind='auth-fail-worker',
        detail 含 path 与来源地址; 审计只增不改判定语义。"""
        ok = self._auth_check(level)
        if not ok:
            _audit_event("auth-fail" if level == "host" else "auth-fail-worker",
                         {"path": self.path, "peer": self._peer()})
        return ok

    def _auth_check(self, level):
        """#73 拆分: 纯判定逻辑(_auth 负责失败审计包装), 判定规则与原 _auth 完全一致。
        (判定主体搬移至 gd.auth.auth_check 纯函数, 此处仅读取 X-Auth 头后委托 —— 行为零改动。)"""
        return auth_check(level, self.headers.get("X-Auth", ""))

    def do_POST(self):
        self._slowloris_arm()  # #73: 慢头部/慢 body 读全程受限(见 _slowloris_arm 注释)

        # V-11 + C7: Content-Length 解析门(纯函数 content_length_gate 供 pytest 锁回归)。
        # C7 实证: 负数(如 '-1')曾穿过 n > MAX_BODY_BYTES 检查 → rfile.read(-1) = 读到 EOF,
        # 无上限读入内存(DoS)。现负数/非数字一律 400, 超上限 413。
        n, _cl_err = content_length_gate(self.headers.get("Content-Length"))
        if _cl_err is not None:
            return self._send(_cl_err[0], {"ok": False, "error": _cl_err[1]})
        try:
            _body = self.rfile.read(n)  # #73: body 读取全程受 30s 读超时约束(慢 body 阶段)
        except socket.timeout:
            return self._timeout_408()
        try:
            req = json.loads(_body or b"{}")
        except Exception as e:
            return self._send(400, {"ok": False, "error": f"bad json: {e}"})
        if not isinstance(req, dict):
            return self._send(400, {"ok": False, "error": "body must be a JSON object"})
        # token 认证(未配置 P2P_TOKEN 时放行) — V-13: 恒定时间比较
        # 中危审计修复(11): 判定收敛到 legacy_token_ok 纯函数 —— host/worker token 优先,
        # P2P_TOKEN 仅兼容旧客户端, 任一匹配即过(旧实现三 token 并存时认证矩阵死锁)。
        tok = os.environ.get("P2P_TOKEN", "")
        if tok and not legacy_token_ok(self.headers.get("X-Auth", ""), tok,
                                       os.environ.get("P2P_HOST_TOKEN", ""),
                                       os.environ.get("P2P_WORKER_TOKEN", "")):
            return self._send(401, {"error": "unauthorized"})
        # R6.3: 黑名单热重载 —— 面板增删改 denylist.json 后免重启即时生效(仅 host token;
        # 不接受 worker token — 名单是全局红线, 只归宿主管)。加载失败保留旧名单(fail-safe)。
        if self.path == "/reload/denylist":
            if not self._auth("host"):
                return self._send(401, {"ok": False, "error": "unauthorized: host token required"})
            try:
                _dl_new = _read_denylist_file()
            except Exception as e:
                return self._send(500, {"ok": False, "error": f"denylist reload failed (keep old): {str(e)[:120]}"})
            with _locked():
                DENYLIST["domains"] = _dl_new["domains"]
                DENYLIST["cidr_prefix"] = _dl_new["cidr_prefix"]
            return self._send(200, {"ok": True, "denylist": dict(DENYLIST),
                                    "count": len(DENYLIST["domains"]) + len(DENYLIST["cidr_prefix"])})
        # I-013: /query 与 /write/* 统一 worker 级认证(原先 /query 无 _auth 调用)
        # #73 复核: /query 保持 worker 级(WORKER 或 HOST 均可, 只读门见 worker_query_allowed);
        # /write/transition 为 host-only(见下方 _auth("host") 注释)。
        if self.path in ("/query", "/write/finding", "/write/signal", "/write/hypothesis", "/write/endpoint"):
            if not self._auth("worker"):
                return self._send(401, {"ok": False, "error": "unauthorized: X-Auth (worker/host) token required"})
        # R6: 排除清单(denylist)硬拦截 —— 结构化写端点全字段扫描(禁引用: 载荷含排除资产即 403)。
        # 实证通道: /write/signal 的 evidence 带 mail.demo-src.com 曾直穿(旧实现只扫 /query 变更类 cypher)。
        # /write/transition 豁免 —— 合规隔离转移的 reason 需要引用红线资产本身。
        if self.path.startswith("/write/") and self.path != "/write/transition":
            try:
                # 中危审计修复(denylist 并发): 与 /reload/denylist 写者同锁做快照读 — 旧版无锁直读
                # DENYLIST 两个键, 热重载(分键两次赋值)交错时可能读到「新 domains + 旧 cidr」的撕裂视图。
                with _locked():
                    _denied = list(DENYLIST.get("domains", [])) + list(DENYLIST.get("cidr_prefix", []))
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
                # #73 大小写一致性: 名单加载即 lower()(:19), scope `!` 条目 lower()(:下方), 文本亦
                # lower() 后比对 —— 双端同构, 无需 re.I。
                _blob = json.dumps(req, ensure_ascii=False).lower()
                _hit = None
                for _d in _denied:
                    # 网段前缀条目(如 "203.0.113.")后接数字 IP 主机位; 域名条目要求词边界
                    if _d.endswith("."):
                        _pat = r"(?:^|[^a-z0-9.\-])" + re.escape(_d) + r"\d"
                    else:
                        _pat = r"(?:^|[^a-z0-9.\-])" + re.escape(_d) + r"(?:$|[^a-z0-9\-])"
                    if re.search(_pat, _blob) or f"https://{_d}" in _blob or f"http://{_d}" in _blob:
                        _hit = _d
                        break
                if not _hit:
                    # #73 兜底(散文提及, 结构化检查之外的第二道): 结构化正则左界字符类排除 '.',
                    # 父域条目(demo-src.com)对子域散文(mail.demo-src.com)与 percent-encoded 点号
                    # (%2e)形态会漏检 —— 对整包小写文本 percent-decode 后再做词边界全段匹配。
                    # 双保险关系: 结构化扫描(含 CIDR 前缀与 https:// 快路径)为主, 本兜底仅补
                    # 域名条目的散文/编码形态; 任一命中即 403(红线散文提及零容忍, fail-closed)。
                    _prose = prose_denylist_hit(_blob, [x for x in _denied if not x.endswith(".")])
                    if _prose:
                        _hit = _prose
                if _hit:
                    _audit_event("denylist-hit", {"path": self.path, "asset": _hit})
                    return self._send(403, {"ok": False, "error": f"excluded asset (denylist 红线): {_hit} — 排除资产禁测/禁枚举/禁引用, 载荷含之即拒绝"})
        # ---- 结构化写端点: 参数校验替代内联 cypher 正则扫描(根治 #21 死门与 params 旁路) ----

        if self.path in ("/write/finding", "/write/signal", "/write/hypothesis", "/write/endpoint"):
            # P0-3 取消令牌的 worker 侧通道: 全局暂停文件存在 → 写通道 409, 在跑 worker 下一次
            # 写图即知停机并自行收尾(实证 0905: 僵尸派发器靠进程猎杀停不干净)。brief 已 instruct。
            if _d2d_paused():
                return self._send(409, {"ok": False, "error": "d2d-paused — 全局暂停中(stopAll/熔断), 任务立即收尾退出"})
            # V-12: 移除重复 _auth("worker")(上方 :152-154 已统一校验, 原 :157-160 为死代码)
            # 注意: req 已由 do_POST 开头解析, 此处严禁重复 rfile.read(#27 双读挂死)
            with _locked():  # V-11: 锁带 5s deadline
                try:
                    conn = kuzu.Connection(db())
                    # W5: 写入归属 — 显式 eng > 唯一 active > 载荷 host 对 active scope 投票 > ''。
                    # 多开并行时 worker JSON 带 "eng" 字段即精准归属; per-eng 暂停在此生效(停 A 不误伤 B)。
                    _ar = conn.execute("MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.name, e.scope")
                    _actives = []
                    while _ar.has_next():
                        _row = _ar.get_next()
                        _actives.append({"name": str(_row[0] or ""), "scope": str(_row[1] or "") if len(_row) > 1 else ""})
                    _hosts = []
                    for _fld in ("endpoint_url", "url", "repro", "title"):
                        for _m in _URL_RE.finditer(str(req.get(_fld) or "")):
                            try:
                                from urllib.parse import urlparse as _up
                                _h = _up(_m.group(0)).hostname
                                if _h and _h not in ("127.0.0.1", "localhost"):
                                    _hosts.append(str(_h).lower())
                            except Exception:
                                pass
                    _eng = pick_write_eng(str(req.get("eng") or ""), _actives, _hosts)
                    if _eng and _eng_paused(_eng):
                        return self._send(409, {"ok": False, "error": f"d2d-paused({_eng}) — 该 engagement 已冻结, 任务立即收尾退出"})
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
                        # 垃圾拒收出口: config/info 级加固建议直接 400(worker 改写 signal 或升级证据), 不再降级入库
                        _crej, _crej_reason = config_reject(sev, str(req.get("category") or ""), title)
                        if _crej:
                            return self._send(400, {"ok": False, "error": _crej_reason})
                        # issue #89 前置: 类别名归一(写入即 canonical, 防命名漂移逃逸去重);
                        # 缺省/空 category 归一默认类(dedup_cat, 与去重读侧同口径 — 否则缺省写入
                        # 与显式 'vuln' 存量互不命中, 同标题去重被空类绕过)
                        cat = dedup_cat(req.get("category"))
                        # R3: 配置建议归类 —— medium+ 的加固项仍降级 config-advice 入库供人工复核
                        if cat in ("config", "config-advice", "hardening") or \
                                (sev in ("low", "info") and CONFIG_ADVICE_RE.search(tl)):
                            cat = "config-advice"
                        # #6: repro 强制门(纯函数 repro_gate) — worker 收到 400 后可当场自纠重写
                        _ok_rp, _err_rp = repro_gate(sev, req.get("repro"))
                        if not _ok_rp:
                            return self._send(400, {"ok": False, "error": _err_rp})
                        # candidate 积压水位门 — 积压超阈值时 low/medium/info 暂收(429), high/critical 不受限
                        _wm = int(os.environ.get("P2P_CANDIDATE_WATERMARK", "100"))
                        if _wm > 0:
                            _bk = conn.execute("MATCH (f:Finding {gate_status:'candidate'}) WHERE f.eng = $e RETURN count(f)",
                                               parameters={"e": _eng})
                            _backlog = int(list(_bk.get_next())[0]) if _bk.has_next() else 0
                            _wm_rej, _wm_reason = candidate_watermark_reject(sev, _backlog, _wm)
                            if _wm_rej:
                                return self._send(429, {"ok": False, "error": _wm_reason})
                        # #11: 去重门 — 同 category 下 normalized(title) 重复(纯函数 titles_duplicate)即拒,
                        # 返回已有 finding id(worker 补证据而非重复新建)。实证: 同标题 finding ×2~3,
                        # 每条重复 candidate 白耗一个完整验证 worker 回合, 漏斗计数被灌水。
                        # 签名去重(与 triage.mjs 同口径): 同 host+path+category 高相似 → 409;
                        # 跨 host 同 path+category 高相似 → 放行但标 related_to(三网关同缺陷归并)。
                        _norm = normalize_title(title)
                        _fhost, _fpath = url_sig(title, str(req.get("repro") or ""))
                        _ftoks = title_tokens(title)
                        _rt = ""
                        if _norm or _fpath:
                            # 缺省/空 category 去重域归一(读侧): 存量 ''/NULL 行(旧缺省写入)一并
                            # 纳入候选(SQL 单点在 queries.FINDING_DEDUP_SCAN_SQL), 应用侧按
                            # dedup_cat 归一比对 — 缺省写入与显式 'vuln' 互查命中; 显式跨类仍隔离。
                            _r = conn.execute(FINDING_DEDUP_SCAN_SQL, parameters={"c": cat, "e": _eng})
                            while _r.has_next():
                                _row = _r.get_next()
                                _eid, _etitle, _erepro = str(_row[0]), str(_row[1] or ""), str(_row[2] or "")
                                _ecat = str(_row[3] or "") if len(_row) > 3 else ""
                                if dedup_cat(_ecat) != cat:
                                    continue  # 归一后不同域 → 不互查(显式其他 category 仍隔离)
                                if _norm and titles_duplicate(_norm, normalize_title(_etitle)):
                                    return self._send(409, {"ok": False, "existing_id": _eid,
                                                            "error": f"duplicate finding: 与 {_eid}('{_etitle[:60]}') 标题重复(category={cat}) — 请勿新建重复条目; 补充证据用 /write/signal 引用该 finding id"})
                                _ehost, _epath = url_sig(_etitle, _erepro)
                                _rel = endpoint_sig_duplicate(_fhost, _fpath, _ftoks, _ehost, _epath, title_tokens(_etitle))
                                if _rel == "dup":
                                    return self._send(409, {"ok": False, "existing_id": _eid,
                                                            "error": f"duplicate finding(端点签名): 与 {_eid}('{_etitle[:60]}') 同 host+path+category 高相似 — 补充证据用 /write/signal 引用该 finding id"})
                                if _rel == "related" and not _rt:
                                    _rt = _eid
                        conn.execute(
                            "CREATE (f:Finding {id:$id, title:$title, severity:$sev, cvss:$cvss, "
                            "evidence_dir:$edir, repro:$repro, category:$cat, gate_status:'candidate', ts:$ts, related_to:$rt, eng:$eng})",
                            parameters={"id": str(req.get("id") or f"f-{int(time.time()*1000)}"),
                                        "title": title, "sev": sev,
                                        "cvss": cvss_or_default(req.get("cvss")),
                                        "edir": str(req.get("evidence_dir") or ""),
                                        "repro": str(req.get("repro") or ""),
                                        "cat": cat,
                                        "rt": _rt,
                                        "eng": _eng,
                                        "ts": str(req.get("ts") or datetime.now(timezone.utc).isoformat())})
                    elif self.path == "/write/signal":
                        # I-014: Signal.evidence 脱敏
                        _ev_raw = str(req.get("evidence") or "")[:2000]
                        _ev_raw, _ = redact_pii(_ev_raw)
                        _sid = str(req.get("id") or f"s-{int(time.time()*1000)}")
                        conn.execute(
                            "CREATE (s:Signal_ {id:$id, type:$t, weight:$w, status:$st, evidence:$ev, ts:$ts, ring:$ring, eng:$eng})",
                            parameters={"id": _sid,
                                        "t": str(req.get("type") or "unknown"),
                                        "w": float(req.get("weight") or 1.0),
                                        "st": str(req.get("status") or "open"),
                                        "ev": _ev_raw,
                                        "ts": str(req.get("ts") or datetime.now(timezone.utc).isoformat()),
                                        "ring": str(req.get("ring") or "discovery"),
                                        "eng": _eng})
                        # #5: 内联 endpoint_url — graphd 代写 Endpoint 节点(缺则建) + AT 边,
                        # N2 规则(Signal-[:AT]->Endpoint)由此闭环(worker /query 只读无法自建边)。
                        _ep = str(req.get("endpoint_url") or "").strip()
                        if _ep and re.match(r"^https?://", _ep, re.I) and len(_ep) <= 500:
                            upsert_endpoint(conn, _ep,
                                            str(req.get("endpoint_tech") or ""),
                                            str(req.get("endpoint_chain") or ""), eng=_eng)
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
                        # L0/L1 分级验证: authorized 标记仅 host token 可置 — worker 不可自授权
                        # (worker 自标 = L1 硬门形同虚设); 未带 authorized 字段的常规 upsert 不受影响。
                        _want_az = str(req.get("authorized") or "").strip().lower() in ("1", "true", "yes", "on")
                        if _want_az and not self._auth("host"):
                            return self._send(403, {"ok": False, "error": "authorized=true requires host token — 授权资产标记归宿主管, worker 不可自授权(L1 硬门)"})
                        eid = upsert_endpoint(conn, url, _tech,
                                              str(req.get("business_chain") or ""),
                                              str(req.get("param") or ""),
                                              str(req.get("method") or "GET"), eng=_eng,
                                              authorized=_want_az)
                        return self._send(200, {"ok": True, "id": eid, "authorized": bool(_want_az)})
                    else:
                        # I-014: Hypothesis.text 脱敏
                        _txt_raw = str(req.get("text") or "")[:1500]
                        _txt_raw, _ = redact_pii(_txt_raw)
                        conn.execute(
                            "CREATE (h:Hypothesis {id:$id, text:$txt, strategy:$strat, status:'open', ts:$ts, eng:$eng})",
                            parameters={"id": str(req.get("id") or f"h-{int(time.time()*1000)}"),
                                        "txt": _txt_raw,
                                        "strat": str(req.get("strategy") or "inversion"),
                                        "eng": _eng,
                                        "ts": str(req.get("ts") or datetime.now(timezone.utc).isoformat())})
                except TimeoutError as _te:
                    return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
                except Exception as e:
                    return self._send(500, {"ok": False, "error": str(e)[:200]})
            return self._send(200, {"ok": True})

        # R3: Finding 七态状态机转换（host 专属；worker 的 verified 结论仍须经验证器环独立重放背书）
        # #73 token 归属复核: 本端点已 host-only —— _auth("host") 只接受与 HOST_TOKEN 的恒等
        # 比较, worker token 无法通过(403), 无需改动。/query 维持 worker 级(见下方统一 _auth("worker"))。
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
                        # #73: 非法迁移审计(七态机拒绝动作可追溯: cur/to/actor)
                        _audit_event("transition-illegal",
                                     {"id": fid, "cur": cur, "to": to,
                                      "actor": str(req.get("actor") or ""), "err": err})
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
            # #4→W5: 多开门(写入侧 fail-closed 收敛为容量上限) — 多 src 并行挖掘按 engagement
            #     隔离池子(eng 列)+ 租约/取消令牌/per-eng 暂停防跨轮误伤; active+requested 总数
            #     超 P2P_MAX_ACTIVE(默认 4)仍拒绝, 防失控堆叠。同目标重复 active 由调度器层拦截。
            if "Engagement" in cypher_raw and "CREATE" in cypher_raw.upper():
                with _locked():
                    try:
                        _c1 = kuzu.Connection(db())
                        _r1 = _c1.execute("MATCH (e:Engagement) WHERE e.status IN ['active','requested'] RETURN count(e)")
                        _n_active = int(list(_r1.get_next())[0]) if _r1.has_next() else 0
                        _cap = int(os.environ.get("P2P_MAX_ACTIVE", "4"))
                        if _n_active >= _cap:
                            return self._send(409, {"ok": False, "error": f"active engagements {_n_active} >= cap {_cap} — 先冻结部分 engagement 再新建(面板可管理)"})
                    except Exception as e:
                        return self._send(503, {"ok": False, "error": f"max-active check failed (fail-closed): {str(e)[:120]}"})
            # H15 配套: Endpoint 写入的值改走 $params(spa-render 参数化)后不再出现在 cypher 文本,
            # 红线/scope 扫描必须连 params 一起看, 否则形成「参数化即绕过 scope/denylist 门」的旁路。
            # 仅限 cypher 触及 Endpoint 的写入 —— ExperienceWeight 等跨项目共享文本里的他项目 URL
            # 不受影响(那是既有 params 旁路的已知留白, 不在本审计范围)。
            _scan_blob = cypher_raw
            if "Endpoint" in cypher_raw:
                try:
                    _scan_blob += " " + json.dumps(req.get("params") or {}, ensure_ascii=False)
                except Exception:
                    pass
            urls = _re.findall(r"https?://[A-Za-z0-9.\-]+", _scan_blob)
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
                            # 实证: 授权泛域(demo-src.com)的白名单天然放行排除资产子域(mail.demo-src.com),
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
                                        _audit_event("denylist-hit", {"path": self.path, "asset": h})  # #73
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
                    # H12: Engagement CREATE 的容量栅栏权威判定 — 必须与 CREATE 同一把锁原子完成。
                    # 旧实现预检在外层独立锁窗口(:1197 一带), CREATE 在此处另一次加锁执行,
                    # 两并发请求可同时过检再双双 CREATE, P2P_MAX_ACTIVE 上限被并发击穿(TOCTOU)。
                    if is_engagement_create(cypher):
                        _r1 = conn.execute("MATCH (e:Engagement) WHERE e.status IN ['active','requested'] RETURN count(e)")
                        _n_active = int(list(_r1.get_next())[0]) if _r1.has_next() else 0
                        _cap_err = engagement_cap_gate(_n_active)
                        if _cap_err:
                            return self._send(409, {"ok": False, "error": _cap_err})
                    res = conn.execute(cypher, params)
                    # H13: 行数上限封顶(bounded_rows 纯逻辑供 pytest) — 大图全量缓冲 OOM 面
                    rows, truncated = bounded_rows(res)
                    cols = res.get_column_names()
                    data = []
                    for r in rows:
                        data.append({cols[i]: _jsonify(r[i]) for i in range(len(cols))})
                    return self._send(200, {"ok": True, "rows": data,
                                            "count": len(data), "truncated": truncated})
                except TimeoutError as _te:
                    return self._send(503, {"ok": False, "error": f"graph busy (V-11 lock deadline): {_te}"})
                except Exception as e:
                    # V-12: 错误信息截断回显(原 str(e) 全文回传)
                    return self._send(400, {"ok": False, "error": str(e)[:200]})
        elif self.path == "/reset":
            # V-12: /reset 改认 HOST token(原仅认遗留 P2P_TOKEN, 与主鉴权体系脱节)
            if not self._auth("host"):
                return self._send(403, {"ok": False, "error": "/reset requires host token"})
            # H18: close DB → 删目录(失败上报, 不再 ignore_errors 假成功) → 重新 init schema
            _out = reset_database()
            if not _out.get("ok"):
                return self._send(500, {"ok": False, "error": _out.get("error", "reset failed")})
            return self._send(200, {"ok": True})
        else:
            self._send(404, {"error": "unknown"})


if __name__ == "__main__":
    # #14: 实例互斥(flock) — kuzu 无文件锁, 两个 graphd 并发打开同一 DB 会互相覆盖
    #      (实证: worker 自主拉起第二实例 + kill -9 → 377 findings 全图丢失)。
    #      独占非阻塞锁; 锁文件随进程存活, 进程死亡(含 kill -9)由 OS 自动释放。
    import fcntl
    os.makedirs(os.path.dirname(DB_PATH) or ".", exist_ok=True)
    # Mimosa 加固: 锁文件 O_NOFOLLOW+0600(防符号链接替换; DB_PATH 为服务端常量, 非用户输入)
    _lock_fh = os.fdopen(os.open(DB_PATH + ".lock", os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600), "w")
    try:
        fcntl.flock(_lock_fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        print(f"[graphd] refusing to start: another instance holds {DB_PATH}.lock "
              f"(kuzu 无实例互斥, 并发打开同一库会毁数据 — 先停旧实例)", flush=True)
        sys.exit(1)
    db()  # 初始化 schema
    # issue #88 防回归: 启动一致性检查 — gate_status 出现状态机之外的值时告警
    # (历史数据漂移必须被看见, 不再让 301 条 frozen 无感知堆积)
    try:
        _conn = kuzu.Connection(_db)
        _rs = _conn.execute("MATCH (f:Finding) RETURN DISTINCT f.gate_status AS s")
        _known = set(FINDING_STATES) | {"frozen"}
        _unknown = []
        while _rs.has_next():
            _s = str(_rs.get_next()[0] or "")
            if _s and _s not in _known:
                _unknown.append(_s)
        if _unknown:
            print(f"[graphd] ⚠ gate_status 出现状态机之外的值: {sorted(_unknown)} — "
                  f"请核对写入点(frozen 兼容出口已开: →candidate/triaged/rejected)", flush=True)
    except Exception as _e:
        print(f"[graphd] gate_status 一致性检查跳过: {_e}", flush=True)

    # _safe_token_path 已搬移至 gd.auth(路径白名单纯函数), 由模块顶部 re-export 提供同名实现。

    def _write_token_file(raw_path: str, data: str) -> str:
        """Mimosa 加固: 唯一 token 落盘点 — 路径白名单校验(_safe_token_path)后 O_NOFOLLOW+0600 写入,
        三处写入点收敛至此, 防符号链接替换/任意路径写。
        返回值 = data 本身(调用方直接 os.environ 赋值)。0905 冒烟实证: 曾误返回 safe 路径,
        env 被设成路径字符串 → 全新部署(无外部 P2P_HOST_TOKEN env)所有 host 认证全挂。"""
        safe = _safe_token_path(raw_path)
        os.makedirs(os.path.dirname(safe), exist_ok=True)
        fd = os.open(safe, os.O_WRONLY | os.O_CREAT | os.O_NOFOLLOW, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(data)
        os.chmod(safe, 0o600)
        return data

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
                _write_token_file(tok_path, os.environ["P2P_HOST_TOKEN"])
            else:
                tok = _sec.token_hex(16)
                os.environ["P2P_HOST_TOKEN"] = _write_token_file(tok_path, tok)
    # I-013: worker token 持久化（fail-closed 凭证）
    if not os.environ.get("P2P_WORKER_TOKEN"):
        w_tok_path = _safe_token_path(os.environ.get("P2P_WORKER_TOKEN_FILE", os.path.expanduser("~/.config/d2d/worker-token")))
        if os.path.exists(w_tok_path):
            with open(w_tok_path) as _wf:  # V-13: with-open
                os.environ["P2P_WORKER_TOKEN"] = _wf.read().strip()
        else:
            w_tok = _sec.token_hex(16)
            os.environ["P2P_WORKER_TOKEN"] = _write_token_file(w_tok_path, w_tok)
    # R6.1: 全局黑名单(denylist.json) — 与白名单对应; 对所有 engagement 的写门控生效
    # (R6.3 起运行时热重载走 /reload/denylist; 文件缺失/损坏时保持空名单 — 与原启动行为一致)
    try:
        _dl_new = _read_denylist_file()
        DENYLIST["domains"] = _dl_new["domains"]
        DENYLIST["cidr_prefix"] = _dl_new["cidr_prefix"]
    except Exception:
        pass
    srv = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    _tok = "required" if os.environ.get("P2P_TOKEN_REQUIRED") == "1" else "open"
    print(f"[graphd] listening :{PORT} db={DB_PATH} token_required={_tok} "
          f"host={'set' if os.environ.get('P2P_HOST_TOKEN') else 'unset'} "
          f"worker={'set' if os.environ.get('P2P_WORKER_TOKEN') else 'unset'}", flush=True)
    srv.serve_forever()

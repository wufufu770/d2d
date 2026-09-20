"""gd.gates — 写入门控/垃圾拒收/签名去重/denylist 加载与兜底/L0-L1 硬门/七态转换门
等模块级纯函数(供 pytest 单测真源)。
纯代码搬移自 graphd/app.py(巨型文件拆分), 判定逻辑与话术逐字保留零改动;
app.py 侧 re-export 保持 `from graphd.app import X` 既有导入路径不变。
3B 新增: 证据文件指针 evidence_ref/evidence_ref_disk 纯函数 — 格式与落点已拍板
(ev/<eng>/<node-id>.txt ↔ DATA_DIR/runs/<eng>/ev/<node-id>.txt), 写入逻辑由批次 2 的
3C 接线, 本批次不落盘。"""
import hashlib
import json
import os
import re
from datetime import datetime, timezone

# R6.1: 全局黑名单(denylist.json)运行时缓存 — 启动时从文件加载, 对所有 engagement 生效
DENYLIST = {"domains": [], "cidr_prefix": []}


def _read_denylist_file():
    """R6.3: 读取 denylist.json → {domains, cidr_prefix}; 文件缺失/损坏抛异常,
    fail-safe 语义由调用方决定(启动=保持空名单, /reload/denylist=保留旧名单)。"""
    _dl_path = os.environ.get("P2P_DENYLIST_FILE", os.path.expanduser("~/.d2d-data/config/denylist.json"))
    with open(_dl_path) as _dlf:
        _dl = json.load(_dlf)
    return {"domains": [str(x).lower() for x in _dl.get("domains", [])],
            "cidr_prefix": [str(x) for x in _dl.get("cidr_prefix", [])]}


MAX_BODY_BYTES = 1_000_000  # V-11: 请求体上限, 防全量读入内存的 DoS


def content_length_gate(raw, max_bytes=None):
    """C7: Content-Length 解析门(纯函数供 pytest 锁回归)。返回 (n, err):
    err 非 None 时调用方必须以 err[0] 的 HTTP 状态码拒绝。
    审计 C7 实证: 旧实现 int('-1') = -1 通过 n > MAX_BODY_BYTES 检查后直落
    rfile.read(-1) —— read(-1) 语义是读到 EOF, 即无上限把整个 socket 缓冲读进内存(DoS)。
    故负数与非数字一律 400; 超上限 413; 缺失/空按 0(空 body 由后续 json 解析兜住)。"""
    limit = MAX_BODY_BYTES if max_bytes is None else int(max_bytes)
    try:
        n = int(str(raw).strip()) if raw is not None and str(raw).strip() != "" else 0
    except (TypeError, ValueError):
        return 0, (400, "invalid Content-Length")
    if n < 0:
        return 0, (400, "invalid Content-Length")
    if n > limit:
        return n, (413, f"payload too large (> {limit} bytes)")
    return n, None


def cvss_or_default(raw):
    """中危审计修复(0910): CVSS=0 被 `or 5.0` 吞成 5.0 — 0 是合法评分(信息收集类漏洞)。
    显式 None/非法判定: 缺失或无法解析 → 5.0 缺省; 合法数值(含 0)原样保留; 越界钳到 [0,10]。"""
    if raw is None or str(raw).strip() == "":
        return 5.0
    try:
        v = float(raw)
    except (TypeError, ValueError):
        return 5.0
    if v != v:  # NaN
        return 5.0
    return min(10.0, max(0.0, v))


JUNK_PATTERNS = ["no rate limit", "missing rate limit", "lack of rate limiting",
                 "rate limiting disabled", "限速缺失", "未限速",
                 "security header", "安全头", "cors configuration",
                 "sourcemap", "版本号指纹", "self-xss", "tls warning"]

# R3: 配置建议归类 —— 加固建议不作为漏洞结论（原设定质量门控条目），降级为 config-advice 单独归类
CONFIG_ADVICE_RE = re.compile(
    r"(cors|security headers?|安全头|cookie (attrs?|attributes|属性)|httponly|samesite|"
    r"secure flag|版本号|x-powered-by|server banner|version (disclosure|泄露)|missing security)",
    re.I)

# issue #89 前置: 类别名归一 — 同缺陷因命名漂移(chain 族 4 种写法等)逃逸签名去重与分类统计。
# 写入时归一(canonical_cat) + 存量迁移(scripts/ops 层), canonical 选择取存量最高频写法。
CAT_ALIASES = {
    # chain 族
    "exploit-chain": "attack-chain", "complete-abuse-chain": "attack-chain",
    "auth-chain": "attack-chain", "chain": "attack-chain",
    # cors 族
    "cors-misconfig": "cors-misconfiguration", "cors-misc": "cors-misconfiguration",
    "cors-session-theft": "cors-misconfiguration",
    # auth 族
    "authentication-bypass": "auth-bypass", "auth-bypass-partial": "auth-bypass",
    "auth-bypass-attempt": "auth-bypass", "auth-bypass-vector": "auth-bypass",
    # crypto 族
    "crypto-bypass": "crypto-failure", "broken-crypto": "crypto-failure", "crypto-weakness": "crypto-failure",
    # info 族
    "info-leak": "info-disclosure", "information-disclosure": "info-disclosure",
    # credential 族
    "credential-theft": "credential-exposure", "credential-extraction": "credential-exposure",
    "credential-abuse": "credential-exposure",
    # config 族
    "config-issue": "config-advice", "config-change": "config-advice",
}


def canonical_cat(c) -> str:
    """类别归一(纯函数供 pytest) — 小写化后按别名表映射到 canonical 写法。"""
    c = str(c or "").strip().lower()
    return CAT_ALIASES.get(c, c)


# 缺省/空 category 去重域归一 — 标题/签名去重按 category 域隔离, 而历史写入路径可能落
# category=''/NULL(缺省), 与显式 'vuln' 的同标题互不命中 → 去重被绕过(同标题重复条目堆积)。
# 读写两侧统一经 dedup_cat 归一: 缺省/空 ≡ 默认类; 显式其他 category 仍隔离(不误伤跨类同标题)。
DEFAULT_CATEGORY = "vuln"


def dedup_cat(c) -> str:
    """去重域归一(纯函数供 pytest) — canonical 归一后为空(None/''/纯空白)则落默认类 'vuln'。"""
    return canonical_cat(c) or DEFAULT_CATEGORY


# ── L0/L1 分级验证 + 授权资产硬门(参照 dsh-hunter) ─────────────────────────
# L0 被动验证(GET 首页存活+指纹一致性比对): 任何 scope 内资产可做;
# L1 主动最小验证(只读 curl 重放): 仅限授权表内(Endpoint.authorized=true)资产,
#     互联网/未授权资产执行 L1 必须被硬门拒绝;
# L2 完整 EXP: 永不自动执行(不存在该档, 传入即按未知档拒绝)。

L1_DENY_REASON = "目标不在授权资产表，L1 主动验证被拒绝——仅可执行 L0 被动验证"


def hostport_of(url) -> str:
    """URL → host:port 授权比对键(纯函数, 与 validator.js hostportOf 同口径)。
    显式端口照抄; 无端口按 scheme 补默认(http=:80, https=:443); 剥离 userinfo; 解析失败返回 ''。"""
    s = str(url or "").strip().lower()
    m = re.match(r"^[a-z][a-z0-9+.-]*://([^/?#]+)", s)
    if not m:
        return ""
    hp = m.group(1)
    at = hp.rfind("@")
    if at >= 0:
        hp = hp[at + 1:]
    if ":" in hp and hp.rfind(":") > hp.rfind("]"):
        h, _, p = hp.rpartition(":")
        if p.isdigit():
            return f"{h}:{p}"
    return f"{hp}:{443 if s.startswith('https') else 80}"


def l1_gate(level, hostport, authorized_hostports) -> tuple[bool, str]:
    """L0/L1 分级硬门(纯函数供 pytest, 与 validator.js l1Gate 同语义):
    L0 被动验证任何资产放行; L1 主动验证仅限授权表内资产 — 条目带端口=精确 host:port,
    不带端口=该 host 任意端口(资产级授权); 其他档位(含 L2)一律拒绝 — L2 完整 EXP 永不自动执行。
    未授权返回 L1_DENY_REASON 固定话术(validator 落 verified_log 审计, 两端同文可对账)。"""
    lv = str(level or "").strip().upper()
    if lv == "L0":
        return True, ""
    if lv != "L1":
        return False, "未知验证档位(仅 L0/L1; L2 完整 EXP 永不自动执行)"
    hp = str(hostport or "").strip().lower()
    if not hp:
        return False, L1_DENY_REASON
    for e in authorized_hostports or []:
        e = str(e or "").strip().lower()
        if not e:
            continue
        if ":" in e and e.rfind(":") > e.rfind("]"):
            if hp == e:
                return True, ""
        elif hp.rpartition(":")[0] == e:
            return True, ""
    return False, L1_DENY_REASON


# R3: Finding 八态状态机（INTEGRATION-DAG 采纳项）—— 只允许合法迁移
# needs-scope(evidence-gate 四态采纳): verify 无法判定时先归因授权边界(缺低权限账号/身份租户边界
# 不明/目标归属存疑)而非硬判 rejected —— 过去这类样本被误杀且不可复查。授权澄清后可重新入验证
# 或带补充证据直通 verified。
FINDING_STATES = ("candidate", "triaged", "verified", "isolated", "reported", "accepted", "rejected", "needs-scope")
FINDING_TRANSITIONS = {
    "candidate": ("triaged", "verified", "isolated", "rejected", "needs-scope"),
    "triaged": ("verified", "isolated", "rejected", "needs-scope"),
    "verified": ("reported", "isolated"),
    "isolated": ("candidate", "rejected"),
    "reported": ("accepted", "rejected"),
    "accepted": (),
    "rejected": (),
    "needs-scope": ("candidate", "triaged", "verified", "rejected"),
    # issue #88: 早期冻结逻辑写入的历史状态(frozen 不在七态内, 实测存量 301 条永久卡死)。
    # 兼容出口只开三条: 退回 candidate(重新入验证)/triaged(有证据直通)/rejected; 禁止 frozen→verified 越权直通。
    "frozen": ("candidate", "triaged", "rejected"),
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
    """I-014 + V-10: PII/凭据脱敏 —— 身份证/手机号(含分隔符)/邮箱(大小写)/AWS key/JWT/私钥/Authorization 头
    3D 新增第 8 模式 access_token(裸参数 access_token=xxx / access_token: xxx / "access_token":"xxx",
    值替换为 [REDACTED], 键名保留) — 受 P2P_EVIDENCE_REDACT 开关控制(见下方分支注释)。"""
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
    # 3D: 第 8 模式 access_token — 开关语义(已拍板): 默认(未设置/任意非'0'值)生效; 仅显式
    # P2P_EVIDENCE_REDACT=0 时关闭; 关闭范围严格仅本模式, 既有七类不受影响。
    # env 在调用时实时读取(不得 import 时缓存) — pytest monkeypatch 需生效。
    if os.environ.get("P2P_EVIDENCE_REDACT") != "0":
        s, k = _p.subn(r"(?i)(\baccess_token\s*[=:]\s*|\"access_token\"\s*:\s*\")[^\s\"',;&)]+",
                       r"\1[REDACTED]", s); n += k
    return s, n


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


def config_reject(sev: str, cat: str, title: str) -> tuple[bool, str]:
    """垃圾拒收出口(纯函数供 pytest) — config/info 级加固建议不进漏洞库, /write/finding 直接 400。
    此前行为是降级 config-advice 入库, 实证一轮 SRC 积压 165 条 config-advice 候选堆尸。
    medium+ 仍降级入库供人工复核; worker 收到 400 后应改写 /write/signal 或升级证据重交。"""
    s = str(sev or "").lower()
    if s in ("low", "info"):
        c = str(cat or "").lower()
        if c in ("config", "config-advice", "hardening") or CONFIG_ADVICE_RE.search(str(title or "").lower()):
            return True, ("config/info 级加固建议不入漏洞库: 加固项写 /write/signal(type='config-advice'); "
                          "若确属可利用漏洞请提升 severity 并附凭证化证据(如 ACAC:true 回显)")
    return False, ""


def candidate_watermark_reject(sev: str, backlog: int, threshold: int) -> tuple[bool, str]:
    """candidate 积压水位门(纯函数供 pytest) — 积压 ≥ 阈值时 low/medium/info 新 finding 暂收(429),
    high/critical 不受限; 逼 worker 转写 signal/补证据, 防漏斗灌水(实证积压 258 条时验证环追不上)。"""
    if int(backlog) >= int(threshold) and str(sev or "").lower() in ("low", "info", "medium"):
        return True, (f"candidate 积压 {backlog}≥{threshold}: 暂收 low/medium/info Finding(只收 high/critical); "
                      f"发现转写 /write/signal, 或为既有 candidate 补充证据")
    return False, ""


_URL_RE = re.compile(r"https?://[A-Za-z0-9.\-]+(?:/[A-Za-z0-9._~\-/?%=&]*)?")


def url_sig(title: str, repro: str) -> tuple[str, str]:
    """title+repro 首个 URL 的 (host, path); 无 URL/本地地址返回 ('','')(与 triage.mjs findingSig 同口径)。"""
    m = _URL_RE.search(f"{title or ''} {repro or ''}")
    if not m:
        return "", ""
    try:
        from urllib.parse import urlparse
        u = urlparse(m.group(0))
        if u.hostname in ("127.0.0.1", "localhost"):
            return "", ""
        return (u.hostname or "").lower(), (u.path or "/").rstrip("/").lower()
    except Exception:
        return "", ""


def title_tokens(t: str) -> set:
    return {w for w in re.split(r"[^a-z0-9\u4e00-\u9fff]+", str(t or "").lower()) if len(w) >= 2}


def token_jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / (len(a) + len(b) - inter) if (len(a) + len(b) - inter) else 0.0


def endpoint_sig_duplicate(fhost: str, fpath: str, ftoks: set, ehost: str, epath: str, etoks: set,
                           j_threshold: float = 0.45) -> str:
    """签名去重判定(纯函数供 pytest, 与 triage.mjs 问题签名同口径) —
    'dup'=同 host+同 path 高相似(409 拒, 返回 existing_id); 'related'=跨 host 同 path 高相似(入库标 related_to); ''=放行。"""
    if not fpath or not epath:
        return ""
    j = token_jaccard(ftoks, etoks)
    if j < j_threshold:
        return ""
    if fhost and ehost:
        if fhost == ehost and fpath == epath:
            return "dup"
        if fhost != ehost and fpath == epath:
            return "related"
    return ""


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
        # 0917: 鉴权档位门(微博实证教训固化) — high/critical 必须注明档位, 防 worker 过度宣称
        # (实证: 「零鉴权」头条实为游客态可达, 零 cookie 302)。worker 收到本 400 后补测补标即可:
        # 零cookie 才可 high/critical; 游客态可达且有超出游客 UI 的增量(第三方 token/无上限分页)最高 medium。
        sev_hi = _re.search(r"severity\s*:\s*[\"'](high|critical)[\"']", cypher, _re.I)
        if sev_hi:
            ok_tier, err_tier = auth_tier_gate(sev_hi.group(1).lower(), cypher, cypher)
            if not ok_tier:
                return False, err_tier
    return True, ""


# 0917: 鉴权档位门纯函数 — host Cypher 路径(finding_gates)与 /write/finding 结构化 JSON 路径共用。
# 高危结论必须回答「用什么身份可达」: 零cookie / 游客态 / 登录态(未测要如实标注)。
# 只检查标注存在, 不判档位与严重度匹配(那是 auto-triage authTierMismatch 的钳位职责)。
AUTH_TIER_MARKER_RE = re.compile(r"(鉴权档位|零\s*cookie|无\s*cookie|游客态|登录态)", re.I)


def auth_tier_gate(severity: str, title: str, repro: str) -> tuple[bool, str]:
    sev = str(severity or "").lower()
    if sev not in ("high", "critical"):
        return True, ""
    text = f"{title or ''}\n{repro or ''}"
    if AUTH_TIER_MARKER_RE.search(text):
        return True, ""
    return False, ("high/critical Finding 必须注明鉴权档位 — 在 repro 首行写 「鉴权档位: 零cookie|游客态|登录态」"
                   "(三档都测: 零cookie 直连 / 游客系统匿名凭据 / 登录态未测则标注; "
                   "零cookie 才可 high/critical, 游客态可达且有超出游客UI的增量最高 medium)")


# V-06: worker /query 只读判定提为纯函数(大小写不敏感)。
# 原 :271/:273 正则区分大小写, Kuzu 关键字大小写不敏感 → 'MATCH (n) detach delete n' 绕过黑名单
# 删任意节点(2026-08-29 隔离实例杀链实证: 写入→小写删除→复查=0)。提取纯函数供 pytest 锁回归。
WORKER_READONLY_WHITELIST = re.compile(r"^(MATCH|RETURN|WITH)\b", re.I)
WORKER_MUTATION_RE = re.compile(
    r"\b(CREATE|MERGE|SET|DELETE|DETACH|DROP|REMOVE|COPY|EXPORT|IMPORT|ATTACH|CALL)\b", re.I)
# 0913 C10: 跨 engagement 全表扫禁 — 共享黑板表的无谓词 MATCH 可横扫其他项目数据
# (读隔离此前只靠 brief 里的 eng 约定, graphd 不拦)。带 WHERE 或 {prop:..} 锚(含按 id 点查)放行。
WORKER_FULLSCAN_RE = re.compile(
    r"MATCH\s*\(\s*\w+\s*:\s*(Finding|Signal_|Endpoint|Task|AgentIdentity|Hypothesis)\s*\)", re.I)


def worker_query_allowed(cypher: str) -> tuple[bool, str]:
    """worker token /query 只读门: 白名单首词 + 全文变更关键字扫描 + CALL/跨项目全表扫禁(均大小写不敏感)。
    误报取舍: 字符串字面量里含独立 'set/delete' 等词的查询会被拒 —— fail-closed 方向。
    0913 C10: ①CALL 从白名单移除(Kuzu 过程调用可枚举表结构/配置元数据, worker 无需);
    ②共享黑板表的无 WHERE/无属性锚 MATCH 拒收(须带 WHERE x.eng='<eng>' 或 {id:..} 点查)。
    已知误报(fail-closed 可接受): 逗号连接的多标签 MATCH(如 MATCH (f:Finding),(s) WHERE ...) —
    worker 简报不产生该形态。"""
    if not WORKER_READONLY_WHITELIST.match(cypher):
        return False, "/query is read-only for workers (MATCH/RETURN/WITH only); use /write/* for mutations"
    if WORKER_MUTATION_RE.search(cypher):
        return False, "/query is read-only for workers: mutation keywords forbidden (case-insensitive)"
    for m in WORKER_FULLSCAN_RE.finditer(cypher):
        tail = cypher[m.end():].lstrip()
        if not tail.startswith(("WHERE", "{", "WHERE".lower(), "{".lower())):
            return False, "cross-engagement full scan forbidden: add WHERE <v>.eng='<engagement>' or an {id:..} predicate"
    return True, ""


def prose_denylist_hit(text_lower: str, domains) -> str:
    """#73: denylist 兜底散文匹配(模块级纯函数供 pytest) — 与 R6 结构化字段扫描互为双保险。

    堵两个实证漏检形态(结构化正则左界字符类 [^a-z0-9.\\-] 排除了 '.'):
      1) 父域条目(demo-src.com)对子域散文提及(mail.demo-src.com)不命中 —— 前导 '.' 被排除;
      2) percent-encoded 点号形态(mail%2Edemo-src%2Ecom)不命中。
    规则与 plugin/pentest-dsh/domain/scope.mjs 的 deniedHit 后缀匹配同口径: 域名条目须以
    「行首或非字母数字字符(含 '.')」为左界、以「串尾或非字母数字字符」为右界全段出现 ——
    全段匹配不做子串误伤(demo-src.company / notdemo-src.com 不命中); 右界含 '-' 与 '.'
    (散文红线零容忍, fail-closed: 'demo-src.com.cn' 这类更长域名的提及同样拒收)。
    仅处理域名条目: 以 '.' 结尾的网段前缀条目(如 203.0.113.)不进本兜底, 由结构化扫描的
    \\d 主机位语义负责。
    text_lower 须为已 lower() 文本(调用方传 json.dumps(req).lower()); 内部对原文做至多两轮
    unquote(percent-decode, 覆盖双重编码), 原文/解码文任一命中即返回该域名条目, 未命中返回 ''。"""
    if not text_lower or not domains:
        return ""
    variants = [text_lower]
    try:
        from urllib.parse import unquote
        _dec = text_lower
        for _ in range(2):
            _n = unquote(_dec).lower()
            if _n == _dec:
                break
            _dec = _n
            variants.append(_dec)
    except Exception:
        pass
    for _raw in domains:
        d = str(_raw or "").strip().lower()
        if not d or "." not in d or d.endswith("."):
            continue  # 空条目/无点条目/网段前缀不在散文兜底范围
        pat = re.compile(r"(?:^|[^a-z0-9])" + re.escape(d) + r"(?:$|[^a-z0-9])")
        for v in variants:
            if pat.search(v):
                return d
    return ""


def _max_active_cap() -> int:
    """H12: engagement 容量上限(环境变量可调, 非数字回退默认 4)。"""
    try:
        return int(os.environ.get("P2P_MAX_ACTIVE", "4"))
    except ValueError:
        return 4


def is_engagement_create(cypher: str) -> bool:
    """H12: 识别 Engagement CREATE 写入(纯函数供 pytest) — 与外层容量预检同一判定口径
    (字符串包含而非正则, 与既有外层门一致: 注入面由 /query 只读门+host token 把守)。"""
    c = str(cypher or "")
    return "Engagement" in c and "CREATE" in c.upper()


def engagement_cap_gate(n_active, cap=None) -> str:
    """H12: engagement 容量栅栏判定(纯函数供 pytest) — active+requested 计数 ≥ cap 返回拦截话术,
    否则返回 ''。审计 H12 结论: 旧实现该检查在独立锁窗口执行, CREATE 在 /query 的另一次
    加锁里执行 —— 两请求可同时过检再双双 CREATE, 容量上限可被并发击穿(TOCTOU)。
    修复: 权威判定移入 /query 执行锁内, 与 CREATE 同一把锁原子完成(见 do_POST /query 分支)。"""
    cap = _max_active_cap() if cap is None else int(cap)
    if int(n_active) >= cap:
        return (f"active engagements {n_active} >= cap {cap} — "
                f"先冻结部分 engagement 再新建(面板可管理)")
    return ""


# ── 3B: 证据文件指针(evidence_ref)格式约定 ─────────────────────────────────────
# 格式与落点已拍板: 图内指针 ev/<eng>/<node-id>.txt ↔ 落盘 DATA_DIR/runs/<eng>/ev/<node-id>.txt
# (evidence_ref() 与 evidence_ref_disk() 同参一一对应: 同 eng 同 node_id 时, 盘上文件落在
#  <data_dir>/runs/<eng>/ 目录下、文件名 ev 同款段 + <node-id>.txt)。
# 写入逻辑由批次 2 的 3C 接线, 本批次不落盘 —— 本区只提供纯函数, 无任何文件 IO。
# 同名不同义: Hypothesis.evidence_ref(schema.py)是验证引用文本(存 signal/finding id),
# 此处产出的指针写 Finding/Signal_ 的 evidence_ref 列。
# 3B 留痕的已知缺口(清洗放行纯 '.' 段)已由 3C 按拍板授权补上: 段级穿越校验见
# _evidence_ref_part_rejected(清洗前含 '/'/'\\' 拒收; 清洗后恰为 '.'/'..' 拒收),
# 拒收=返回空串, 调用方不得落盘 —— 除本函数区外 3B 语义零改动。
EVIDENCE_REF_PREFIX = "ev"


def _evidence_ref_safe_part(part) -> str:
    """指针路径段安全清洗(纯函数): 只保留 [A-Za-z0-9._-], 其余替换 '_', 空值返回 ''。"""
    s = str(part or "")
    if not s:
        return ""
    return re.sub(r"[^A-Za-z0-9._-]", "_", s)


def _evidence_ref_part_rejected(part) -> bool:
    """3C: 段级穿越校验(纯函数) — 对「清洗前」的原始输入判定, 任一命中即拒收:
      ① 原始输入含 '/' 或 '\\' (任意形态的路径分隔/多段路径) → 拒收;
      ② 清洗后恰为 '.' 或 '..' (当前目录/父目录段名, 可拼出 ev/.. 穿越出 ev 根) → 拒收。
    拒收语义 = evidence_ref/evidence_ref_disk 整体返回 ''(不生成路径, 调用方不得落盘)。
    非段落名形态不误伤: 'a.b'/'...'/空白清洗后段照常放行(仅锁 '.'/'..' 两个穿越名)。"""
    raw = str(part or "")
    if "/" in raw or "\\" in raw:
        return True
    return _evidence_ref_safe_part(raw) in (".", "..")


def evidence_ref(eng: str, node_id: str) -> str:
    """证据文件指针(纯函数, 无 IO): 返回 'ev/<eng>/<node-id>.txt'。
    eng/node_id 先做安全清洗(_evidence_ref_safe_part: 只保留 [A-Za-z0-9._-], 其余替 '_');
    3C 穿越防护: 任一参数被拒收(清洗前含 '/'/'\\', 或清洗后恰为 '.'/'..')→ 整体返回 ''。
    任一参数清洗后为空(None/''/空串/被拒收)返回 ''(无指针)。
    拒收=返回空串, 调用方不得落盘。"""
    if _evidence_ref_part_rejected(eng) or _evidence_ref_part_rejected(node_id):
        return ""
    e = _evidence_ref_safe_part(eng)
    n = _evidence_ref_safe_part(node_id)
    if not e or not n:
        return ""
    return f"{EVIDENCE_REF_PREFIX}/{e}/{n}.txt"


def evidence_ref_disk(data_dir: str, eng: str, node_id: str) -> str:
    """证据文件落盘路径(纯函数, 无 IO): 返回 '<data_dir>/runs/<eng>/ev/<node-id>.txt'。
    与 evidence_ref() 同参一一对应(同 eng/node_id 指向同一份证据文件); eng/node_id 同款清洗
    +同款 3C 穿越防护(拒收=返回空串, 调用方不得落盘), 任一为空返回 '';
    data_dir 原样拼接(调用方传 DATA_DIR, 不做清洗)。"""
    if _evidence_ref_part_rejected(eng) or _evidence_ref_part_rejected(node_id):
        return ""
    e = _evidence_ref_safe_part(eng)
    n = _evidence_ref_safe_part(node_id)
    if not e or not n:
        return ""
    return f"{data_dir}/runs/{e}/{EVIDENCE_REF_PREFIX}/{n}.txt"


def experience_evidence_ref_rejected(ref) -> bool:
    """3.5-1(经验回流 A): /write/experience 入参 evidence_ref 的宽松格式确认(纯函数供 pytest
    与 handler 同源)。复用/对齐本区 3B/3C 拒收语义 —— 与 evidence_ref() 的差异: 那里是服务端
    由 eng+node_id 生成(拒收=返回 ''不落盘), 这里是调用方显式传入指针(拒收=handler 400)。
    允许空(None/''/纯空白 → 放行, 落库 ''); 非空必须:
      ① 以 'ev/' 前缀开头(3B 证据指针格式 ev/<eng>/<node-id>.txt, 与 evidence_ref() 产出同形);
      ② 无穿越特征: 含 '\\' 即拒; 任一 '/' 分段恰为 '.'/'..' 即拒(对齐 _evidence_ref_part_rejected
         的段级穿越判定; '...'/'a.b' 等非纯点段不误伤 — 同 3C 边界)。
    返回 True=拒收(handler 400), False=放行。"""
    s = str(ref or "").strip()
    if not s:
        return False
    if not s.startswith(EVIDENCE_REF_PREFIX + "/"):
        return True
    if "\\" in s:
        return True
    return any(seg in (".", "..") for seg in s.split("/"))


# ── 3C: 双哈希指纹(content_hash/source_hash) — 写入接线用纯函数, 无任何 IO ─────────────
# 拍板口径: content_hash=对脱敏后完整落库终值取 SHA-256; source_hash=对规范化后来源 URL
# (host+path 去 query)取 SHA-256。落库列 = schema.py 的 Finding/Signal_ 三列(3B 已迁移)。

# 部件分隔符: ASCII 单元分隔符 0x1F — 消除部件边界歧义(("ab","c") ≠ ("a","bc")),
# 正常业务文本不含该控制字符。仅参与哈希运算, 不落库。
CONTENT_HASH_SEP = "\x1f"


def content_hash(*parts: str) -> str:
    """内容指纹(纯函数, 无 IO): 对「脱敏后完整落库终值」的部件组合取 SHA-256 hexdigest。
    部件顺序由接线处固定(app.py /write/* 的 CREATE 之前), 拍板约定:
      - Finding(/write/finding): (title, repro, evidence_dir) — 与 CREATE 绑定的
        $title/$repro/$edir 参数表达式逐字同源;
      - Signal_(/write/signal): (evidence,) — 即截 2000 + redact_pii 之后的落库终值
        (哈希必须取 redact 之后、CREATE 之前的最终值)。
    规则: 部件逐个 str() 化(None→''), 以 CONTENT_HASH_SEP 拼接后 utf-8 编码,
    hashlib.sha256().hexdigest()。全部件为空(或无部件)→ 返回 ''(无内容不产生指纹,
    落库按 schema DEFAULT '' 同语义)。"""
    vals = [str(p or "") for p in parts]
    if not any(vals):
        return ""
    return hashlib.sha256(CONTENT_HASH_SEP.join(vals).encode("utf-8")).hexdigest()


def source_hash(url: str) -> str:
    """来源 URL 指纹(纯函数, 无 IO): 规范化后取 host+path 的 SHA-256 hexdigest。
    规范化规则(拍板口径: host+path 去 query — 逐条):
      1) 仅接受 http/https scheme; 其余 scheme(ftp/file/javascript/无 scheme 等)返回 '';
      2) scheme 与 host 统一小写(urlsplit 已归一, 此处再显式 lower() 兜底);
      3) 去 query 与 fragment('?'/'#' 及其后内容一律不参与, 含 access_token 等敏感 query);
      4) 去默认端口(http 默认 80, https 默认 443); 非默认端口保留为 host:port;
      5) 去末尾斜杠: path 尾随 '/' 剥除, 根 '/' 归一为空 → 指纹即裸 host;
      6) userinfo('@' 前凭据段)不参与指纹(与 hostport_of 同哲学);
      7) scheme 不参与指纹(仅作准入; http/https 同 host+path 同指纹 — 拍板口径即 host+path)。
    指纹串 = 规范化 host[:port] + 规范化 path, utf-8 编码 SHA-256 hexdigest。
    输入空/空白/无法解析/端口非法 → ''(无有效来源不产生指纹)。"""
    s = str(url or "").strip()
    if not s:
        return ""
    try:
        from urllib.parse import urlsplit
        sp = urlsplit(s)
        scheme = (sp.scheme or "").lower()
        if scheme not in ("http", "https"):
            return ""
        host = (sp.hostname or "").lower()
        if not host:
            return ""
        port = sp.port  # 端口非法(非数字/越界)在此抛 ValueError → 归入解析失败
    except Exception:
        return ""
    default_port = 443 if scheme == "https" else 80
    host_part = host if (port is None or port == default_port) else f"{host}:{port}"
    path = (sp.path or "").rstrip("/")
    return hashlib.sha256(f"{host_part}{path}".encode("utf-8")).hexdigest()

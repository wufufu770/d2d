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


# ── 3.5-4-1(写端增强): Experience 指令性文本检测词表 + 三档扫描纯函数 ─────────────
# 词表唯一真源在 graphd 侧, 导出常量供 plugin/pentest-dsh/sanitize.js 同步(词表扩充)。
# 审计实测中文缺口: 「忽略之前指令」「系统提示」独立短语不命中 sanitize.js:19-25 既有五条
# 正则 —— 英文系(ignore/disregard/forget)不认中文; 中文复合条又要求「你必须」类前缀,
# 独立短语全漏。本词表: 高置信集=独立短语(命中即 400 拒绝); 软命中集=复合形态
# (五条正则语义移植 + 中文缺口补齐, 命中照写但 content 加 '[SUSPECT] ' 前缀 + 审计,
# 经验池评审进程天然先见隔离行 → 置顶复核)。
EXPERIENCE_INJECTION_HIGH = (
    "忽略之前指令",
    "ignore all previous instructions",
)
# system prompt 系(无空格/多空格变体, 与 sanitize.js 第 5 条 system\s*prompt 同形; re.I)
_EXPERIENCE_INJECTION_HIGH_RES = (re.compile(r"system\s*prompt", re.I),)
# 软命中: sanitize.js:19-25 五条正则语义移植(前四条) + 中文独立短语缺口补齐(末两条)。
# 末第二条覆盖「无视上述规则/忘记先前的指示」等兄弟形态; 「忽略之前指令」是高置信,
# 由 high 先判命中防降档。系统提示/系统提示词/系统提示音等「系统提示」前缀词面均算软命中
# (软档不拒写只标注, 宁滥标不漏标 — 复核由评审进程裁决)。
EXPERIENCE_INJECTION_SOFT_RES = (
    re.compile(r"ignore\s+[\w\s]{0,24}?instructions", re.I),
    re.compile(r"disregard\s+[\w\s]{0,24}?(instructions|rules)", re.I),
    re.compile(r"forget\s+(everything|your)\s+(else|instructions)", re.I),
    re.compile(r"你(的)?(可以|必须|禁止)[\s\S]{0,20}?(忽略|无视|忘记)"),
    re.compile(r"(忽略|无视|忘记)[^\n]{0,6}(之前|以上|上述|先前|所有|全部)(的)?(指令|指示|规则)"),
    re.compile(r"系统提示"),
)


def experience_injection_scan(text) -> str:
    """3.5-4-1: Experience 指令性文本三档判定(纯函数供 pytest 与 handler 同源)。
    返回 'high'(高置信独立短语 → handler 400 拒绝 + experience-injection-block 审计) /
    'soft'(复合形态 → 照写但 content 加 '[SUSPECT] ' 前缀 + experience-injection-soft 审计) /
    'clean'(未命中 → 现行为)。
    判定顺序: high 优先(soft 词表是 high 的超集形态, 先判 high 防降档);
    大小写不敏感(英文短语 lower() 后子串匹配 + re.I); 空输入恒 'clean'; 非字符串 str() 化。
    调用方以 title+'\\n'+content 拼接扫描: \\n 隔断跨字段子串误拼(high 需同字段连续出现,
    跨字段复合形态落 soft — 复合本就该软档)。已知取舍: 全角/同形字符混淆(ＳＹＳＴＥＭ)
    不命中 — 本门是词面闸门不是语义闸门, 漏网形态由评审复核兜底。"""
    s = str(text or "")
    low = s.lower()
    for phrase in EXPERIENCE_INJECTION_HIGH:
        if phrase in low:
            return "high"
    for pat in _EXPERIENCE_INJECTION_HIGH_RES:
        if pat.search(s):
            return "high"
    for pat in EXPERIENCE_INJECTION_SOFT_RES:
        if pat.search(s):
            return "soft"
    return "clean"


# ── 3.5-4-3(写端增强): Experience per-eng_id 写入配额(端点侧粗兜底) ────────────────
# 防直写 /write/experience 灌水: 该 eng_id 条目数(含 quarantined 隔离行 — 评审出池前同样
# 占池)≥ 阈值即 429(水位门同款)。蒸馏轮次条数(5/轮)由管道侧 DISTILL_WRITE_CAP 管, 本门是
# 宿主面 50/eng_id 保守兜底。engagement_cap_gate/candidate_watermark_reject(:269-275)同款
# 形态: 计数与 CREATE 同一 _locked() 锁窗口原子完成(TOCTOU 教训)。
EXPERIENCE_WRITE_CAP_DEFAULT = 50


def _experience_write_cap() -> int:
    """per-eng_id 写入配额阈值(P2P_EXPERIENCE_WRITE_CAP 可调, 非数字回退默认 50)。"""
    try:
        return int(os.environ.get("P2P_EXPERIENCE_WRITE_CAP", str(EXPERIENCE_WRITE_CAP_DEFAULT)))
    except ValueError:
        return EXPERIENCE_WRITE_CAP_DEFAULT


def experience_quota_reject(count, cap=None) -> tuple[bool, str]:
    """3.5-4-3: Experience per-eng_id 写入配额判定(纯函数供 pytest) — 条目计数 ≥ cap
    返回拦截话术(调用方 429, candidate 水位门同款), 否则返回 ''。cap=None 时取
    P2P_EXPERIENCE_WRITE_CAP(缺省 50)。权威计数必须在调用方与 CREATE 同一 _locked()
    窗口内执行(engagement_cap_gate 的 H12 TOCTOU 教训同款)。"""
    cap = _experience_write_cap() if cap is None else int(cap)
    if int(count) >= cap:
        return True, (f"experience 写入配额满: 该 eng_id 条目数 {count}≥{cap} — "
                      f"直写灌水防护(评审出池前隔离行同样计数), 稍后再写或由宿主调 P2P_EXPERIENCE_WRITE_CAP")
    return False, ""


# ── 3.5-4-2(转态机制): Experience 转态合法迁移表 + 纯函数门 ────────────────────────
# 三态拍板(方案 v2): quarantined(写入即隔离) / active(评审出池) / deprecated(过期退役)。
# 合法迁移仅两条: quarantined→active(跨 engagement 佐证达标出池) 与 active→deprecated
# (退役, 只降不升); 无回退路径(active 不得回 quarantined, deprecated 终态) — 状态机单向,
# 评审幂等性由此保证: 已出池条目天然离开 quarantined 候选池。
EXPERIENCE_STATES = ("quarantined", "active", "deprecated")
EXPERIENCE_TRANSITIONS = {
    "quarantined": ("active",),
    "active": ("deprecated",),
    "deprecated": (),
}


def experience_transition_gate(cur, to, reviewer_note):
    """3.5-4-2: Experience 转态审计门 — 纯函数单测真源(transition_gate :186-202 同形态:
    合法迁移表 + 备注非空校验)。返回 (ok, reason): ok=False 时 reason 为拒绝话术(调用方
    400 + experience-transition-illegal 审计)。谁在何时以何理由推动转态由调用方 _audit_event
    旁路追溯(拍板⑧: 不加列, 仅审计事件), 故本门不产出轨迹对象。
    reviewer_note(1-80 字符)必填 — 空白/越界拒绝; cur 不在迁移表(含 unknown)与 to 越枚举
    一律拒绝(fail-closed)。"""
    if to not in EXPERIENCE_STATES:
        return False, f"to must be one of {list(EXPERIENCE_STATES)}"
    if to not in EXPERIENCE_TRANSITIONS.get(cur, ()):
        return False, f"illegal transition {cur} -> {to}"
    note = str(reviewer_note or "").strip()
    if not note or len(note) > 80:
        return False, "reviewer_note required (1-80 chars): 为什么转态(可追溯)"
    return True, ""


# ── 3.6-1(前沿子系统 C): Frontier 转态合法迁移表 + 纯函数门 ─────────────────────────
# 四态拍板: proposed(worker 提案入图即此态, 主控评审输入) / accepted(评审采纳, 待探索) /
# rejected(评审否决, 终态) / explored(已探索消化, 终态)。合法迁移仅三条:
#   proposed→accepted(采纳) / proposed→rejected(否决) / accepted→explored(探索完成回写);
# rejected/explored 均为终态无出边, 状态机单向 — 与 Experience/experience_transition_gate
# 同款评审幂等性: 已裁决条目天然离开 proposed 候选池(/query/frontier 缺省全态返回, 但
# 主控只消费 proposed — 迁移表拒绝重复裁决, 双轮并发最坏一次 400 + 留痕)。
FRONTIER_STATES = ("proposed", "accepted", "rejected", "explored")
FRONTIER_TRANSITIONS = {
    "proposed": ("accepted", "rejected"),
    "accepted": ("explored",),
    "rejected": (),
    "explored": (),
}


def frontier_transition_gate(cur, to, review_note):
    """3.6-1: Frontier 转态审计门 — 纯函数单测真源(experience_transition_gate 同形态:
    合法迁移表 + 备注非空校验)。返回 (ok, reason): ok=False 时 reason 为拒绝话术(调用方
    400 + frontier-transition-illegal 审计)。谁在何时以何理由推动转态由调用方 _audit_event
    旁路追溯, 故本门不产出轨迹对象。
    review_note(1-80 字符)必填 — 空白/越界拒绝; cur 不在迁移表(含 unknown)与 to 越枚举
    一律拒绝(fail-closed)。"""
    if to not in FRONTIER_STATES:
        return False, f"to must be one of {list(FRONTIER_STATES)}"
    if to not in FRONTIER_TRANSITIONS.get(cur, ()):
        return False, f"illegal transition {cur} -> {to}"
    note = str(review_note or "").strip()
    if not note or len(note) > 80:
        return False, "review_note required (1-80 chars): 为什么转态(可追溯)"
    return True, ""


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


# ── 3.6-2 v4.1(前沿写端增强): refs 准入门 / engagement 级滑动窗口配额 / 签名去重指纹 ──
# 三个纯函数(无 IO, pytest 与 handler 同源), 消费方 app.py /write/frontier:
#   · refs 终检的图查询与 20/h 计数在 handler 侧 _locked() 锁窗口内执行(TOCTOU 教训,
#     experience_quota_reject 同款), 本区只做格式判定与阈值话术。

# refs 上限: 防超长列表撑大 IN 绑定与预检开销; 现实提案引用 2-5 个信号/端点, 16 已极宽。
FRONTIER_REFS_MAX = 16
# engagement 级滑动窗口写入配额(条/小时): 提案是评审资源(方案 v2 §4.2 精神 — 量少质高),
# 工具侧 cap=3/会话管单会话, 本门管全部直写通道的 engagement 总面(20/h)。
FRONTIER_WRITE_WINDOW_DEFAULT = 20
# 窗口宽度(小时): 限流窗 1h(滑动, 沿 created_at 列比较); 签名去重窗 6h(同向提案静默合并)。
FRONTIER_RATE_WINDOW_HOURS = 1
FRONTIER_DEDUP_WINDOW_HOURS = 6
_REFS_HINT = "refs required: ≥1 个图节点 id(Signal/Endpoint — p2p_graph 只读查询/brief 中引用的 id)"


def frontier_refs_rejected(refs) -> tuple:
    """refs 准入格式门(纯函数): 必填 ≥1 且 ≤FRONTIER_REFS_MAX 个非空字符串 id。
    返回 (rejected, reason, normalized): rejected=True 时 reason 为 400 话术;
    normalized = 逐项 str().strip() + 去空 + 保序去重(handler 拿它做存在性/同 eng 终检)。
    注意本门只判「形」, 不判「存在/同 eng」— 那是锁内图查询的事(数据会变, 格式不会)。"""
    if isinstance(refs, str):
        # 容错: 单个 id 直接传串 → 视作单元素(拒绝 null/空串由下方归一逻辑统一处理)
        refs = [refs]
    if not isinstance(refs, (list, tuple)):
        return True, _REFS_HINT, []
    norm = []
    for r in refs:
        s = str(r or "").strip()
        if s and s not in norm:
            norm.append(s)
    if not norm:
        return True, _REFS_HINT, []
    if len(norm) > FRONTIER_REFS_MAX:
        return True, f"refs too many: {len(norm)} > {FRONTIER_REFS_MAX}(引用贵精不贵多)", []
    return False, "", norm


def _frontier_write_window() -> int:
    """engagement 级每小时写入配额阈值(P2P_FRONTIER_WRITE_WINDOW 可调, 非数字回退默认 20)。
    与 _experience_write_cap 同形态(面板热调/env 兜底)。"""
    try:
        return int(os.environ.get("P2P_FRONTIER_WRITE_WINDOW", str(FRONTIER_WRITE_WINDOW_DEFAULT)))
    except ValueError:
        return FRONTIER_WRITE_WINDOW_DEFAULT


def frontier_rate_reject(count, cap=None) -> tuple:
    """engagement 级滑动窗口配额判定(纯函数供 pytest) — 窗口内已有条数 ≥ cap 返回拦截话术
    (调用方 429 + frontier-quota 审计), 否则 ''。cap=None 时取 P2P_FRONTIER_WRITE_WINDOW
    (缺省 20)。权威计数必须在调用方与 CREATE 同一 _locked() 窗口内执行(H12 TOCTOU 教训)。
    窗口语义: created_at > now-FRONTIER_RATE_WINDOW_HOURS(滑动窗, 非自然小时 — 直写历史
    created_at 的行按其值参与窗口, 图内数据天然持久准确)。"""
    cap = _frontier_write_window() if cap is None else int(cap)
    if int(count) >= cap:
        return True, (f"frontier 写入配额满: engagement 最近 {FRONTIER_RATE_WINDOW_HOURS} 小时提案数 "
                      f"{count}≥{cap} — 评审资源限流(工具侧另有 3 条/会话), 稍后再提或由宿主调 "
                      f"P2P_FRONTIER_WRITE_WINDOW")
    return False, ""


def frontier_signature(direction, eng_id) -> str:
    """签名去重指纹(纯函数): sha256(direction + eng_id) — 复用 content_hash 同实现
    (0x1F 分隔符消部件边界歧义, 部件顺序 (direction, eng_id) 由本函数钉死)。
    消费方仅审计留痕(frontier-suppress 事件)与测试锁定; 图内判重直接按 (eng_id, direction)
    精确匹配查询(等价语义, 不新增指纹列 — v4.1 五列清单为闭集, refs/指纹均不落列)。"""
    return content_hash(str(direction or ""), str(eng_id or ""))


# ── 3.6-3(前沿主控评审): value_score 加权公式 + rejection 拉普拉斯平滑(纯函数) ──────
# 拍板公式: value_score = 0.4*quadrant_blankness + 0.3*signal_affinity + 0.3*(1-rejection_rate)。
# 双侧同源声明: 本区是公式权威锚(Python 纯函数, pytest 单测真源); 评审决策的实时计算在
# plugin/pentest-dsh/scheduler/frontier-review.mjs 的 frontierValueScore/computeRejectionRate
# 同式镜像(系数/钳位/平滑常数逐条对齐, 改一侧必改另一侧)。三因子语义(逐条):
#   · quadrant_blankness — 覆盖空白度: allocator.coverageQuadrants(同 eng Signal_
#     surface×boundary 象限, <3 样本 null→0)的 blanks.length/total(total>0 否则 0);
#     数学上可 >1(枚举 21 格 vs 少样本), 由 _clamp01 收口。
#   · signal_affinity — refs 亲和: 提案 refs 列(JSON 数组串)所指 Signal 的 surface|boundary
#     落 coverageQuadrants 的 dense 簇=1.0 / 落其他已填充格=0.5 / 无命中或无 refs 数据=0;
#     多 ref 取最值(max, 拍板形态: 单条死引用不稀释命中, 稳定抗 refs 噪声) —
#     JS 侧 signalAffinity 同式。
#   · rejection_rate — 历史(eng_id, direction) 否决率的拉普拉斯冷启动平滑
#     (compute_rejection_rate), 取补 (1-rr) 使历史高否决拉低价值; 冷启动 rr=0.5 →
#     该项恒贡献 0.15(中性, 不罚无历史的新方向)。
# 评审决策线(value<0.3 rejected / ≥0.3 accepted; blank>0.5 倾向 accepted / <0.3 倾向
# rejected, 冲突以 value 阈值优先)属评审编排语义, 常量落 JS 模块(本区只锚公式)。
FRONTIER_VALUE_WEIGHTS = (0.4, 0.3, 0.3)


def _frontier_clamp01(x) -> float:
    """因子钳位(纯函数): 非数值(None/字符串/NaN)按 0.0, 其余收口 [0.0, 1.0]。"""
    try:
        v = float(x)
    except (TypeError, ValueError):
        return 0.0
    if v != v:  # NaN
        return 0.0
    return min(1.0, max(0.0, v))


def compute_rejection_rate(rejected_count, total_count) -> float:
    """3.6-3: 同 (direction, eng_id) 历史否决率 — 拉普拉斯冷启动平滑(纯函数供 pytest 与
    JS 评审侧 computeRejectionRate 同式镜像):
        rejection_rate = (rejected + 0.5) / (total + 1)
    total=0(该方向无历史提案)返回 0.5 中性先验 — 不罚冷启动方向, 也不给它白送低否决红利。
    防御钳位(图数据异常不产出越界比率): 负计数按 0; rejected > total 按 total 收口
    (此时恒 <1, 与 (t+0.5)/(t+1)<1 单调一致)。"""
    t = max(0, int(total_count))
    r = min(max(0, int(rejected_count)), t)
    return (r + 0.5) / (t + 1)


def frontier_value_score(quadrant_blankness, signal_affinity, rejection_rate) -> float:
    """3.6-3: Frontier 提案价值分(纯函数, transition_gate :678 同区形态 — 公式逐条见
    上方区块注释):
        value_score = 0.4*quadrant_blankness + 0.3*signal_affinity + 0.3*(1-rejection_rate)
    各因子先经 _frontier_clamp01(非数值/NaN 按 0, 越界收口 [0,1])再代入; 全因子取 1 时
    输出恰 1.0, 全 0 时输出 0.3(rejection 补项) — 恒落 [0,1] 闭区间。
    与 JS frontierValueScore 同式双实现(双侧同源声明, 见区块注释); 本批次 app.py 零接线 —
    本函数供 pytest 锚与后续服务端消费(3.6-4 探索消化链), 评审实时计算在 JS 侧。"""
    w_blank, w_affin, w_reject = FRONTIER_VALUE_WEIGHTS
    qb = _frontier_clamp01(quadrant_blankness)
    sa = _frontier_clamp01(signal_affinity)
    rr = _frontier_clamp01(rejection_rate)
    return w_blank * qb + w_affin * sa + w_reject * (1.0 - rr)


# ── 3.6-4 段 C(C-1 反馈闭环 + C-3 假设价值分): 纯函数区 ────────────────────────────
# 本区块不触碰 FRONTIER_VALUE_WEIGHTS 公式(上方 :839 禁改)与 Frontier 表既有字段定义 —
# 只服务两类新语义:
#   (a) C-1 反馈闭环: /write/frontier-transition 可选回填参数(转态端点带参 — 审计①拍板的
#       最小侵入方案)的门与合并; 两个 *_ref 占位列(3.6-2 定死, 现恒 '')由此获得唯一写入方。
#   (b) C-3 假设价值分+aging: Hypothesis 消费排序的权威公式锚。消费点在 plugin 侧
#       (scheduler/loop.mjs consumeHypotheses, 现场为 FIFO ts ASC), JS 镜像实现在
#       domain/hypothesis-aging.mjs — 双侧同源声明(系数/ε/窗口常数逐条对齐, 改一侧必改另一侧),
#       Python 纯函数是权威锚(pytest 单测真源), 与 3.6-3 frontierValueScore 双实现先例同形态。

# ── (a) C-1: 回填 ref 门 / utility 键合并 / 转化率度量 ─────────────────────────────

# 回填 ref 单值长度上限: 锚点 id 现场形态 h-<ms>/f-<ms>(≤20 字符), 120 已极宽;
# 防把散文/摘要误当 id 灌进锚点列(转化率=非空比率, 脏值直接毁度量)。
FRONTIER_REF_BACKFILL_MAX = 120


def frontier_ref_backfill(value) -> tuple:
    """闭环锚点回填格式门(纯函数): 单个 ref 值归一 — strip 后空串放行(=不回填, 既有
    转态调用零改动), 非空超 FRONTIER_REF_BACKFILL_MAX 拒绝(400 话术)。
    返回 (rejected, reason, normalized)。只判「形」; 存在性(Hypothesis/Finding 表内
    真有此 id)是 handler 锁内图查询的事(服务端不信自报, refs 终检同款哲学)。"""
    s = str(value or "").strip()
    if not s:
        return False, "", ""
    if len(s) > FRONTIER_REF_BACKFILL_MAX:
        return True, (f"ref too long: {len(s)} > {FRONTIER_REF_BACKFILL_MAX}"
                      "(锚点须为图内节点 id, 非散文)"), ""
    return False, "", s


# 方向效用动态调整常数(拍板: engagement 结束后被探索方向 有效 +0.2 / 无发现 -0.1)。
# 公式常量单源本区(调用方只传 effective 布尔, 不传数值 — 与 FRONTIER_VALUE_WEIGHTS
# 权威锚同哲学); 落点 = Frontier.value_components JSON 串内扩展 utility 键
# (已定死字段内加键不违约 — 字段定义零改动); 看板 8.5-2 后续只读消费。
FRONTIER_UTILITY_EFFECTIVE = 0.2
FRONTIER_UTILITY_NONE = -0.1


def frontier_utility_components(components_str, effective) -> str:
    """value_components JSON 串合并 utility 键(纯函数): 解析既有串(坏 JSON/非 dict 按
    {} — 现场该列写入端恒 '', 首次合并即从 {} 起), 置 components['utility'] =
    FRONTIER_UTILITY_EFFECTIVE(effective truthy) / FRONTIER_UTILITY_NONE(否则), 其余键
    原样保留(保序), 序列化回 JSON 串(ensure_ascii=False)。恒返回合法 JSON 串 —
    调用方直接 SET 落列, 不抛异常。"""
    try:
        comps = json.loads(components_str) if str(components_str or "").strip() else {}
    except Exception:
        comps = {}
    if not isinstance(comps, dict):
        comps = {}
    comps["utility"] = FRONTIER_UTILITY_EFFECTIVE if effective else FRONTIER_UTILITY_NONE
    return json.dumps(comps, ensure_ascii=False)


def frontier_conversion_rate(rows) -> dict:
    """转化率度量(纯函数): 两个闭环锚点列的非空比率 —
        accepted_to_hypothesis = accepted_to_hypothesis_ref 非空行数 / 总行数
        hypothesis_to_confirmed = hypothesis_to_confirmed_ref 非空行数 / 总行数
    rows: 可迭代的 dict(按列名取)或二元组 (a2h, h2c); 空池两比率恒 0.0(无分母不产 NaN)。
    看板 8.5-2 与 pytest 同源消费; 本批次只写数据(refs 回填), 读侧为后续批次。"""
    total = 0
    a2h = 0
    h2c = 0
    for r in rows or []:
        if isinstance(r, dict):
            va = r.get("accepted_to_hypothesis_ref")
            vc = r.get("hypothesis_to_confirmed_ref")
        else:
            va = r[0] if len(r) > 0 else ""
            vc = r[1] if len(r) > 1 else ""
        total += 1
        if str(va or "").strip():
            a2h += 1
        if str(vc or "").strip():
            h2c += 1
    if total <= 0:
        return {"total": 0, "accepted_to_hypothesis": 0.0, "hypothesis_to_confirmed": 0.0}
    return {"total": total,
            "accepted_to_hypothesis": a2h / total,
            "hypothesis_to_confirmed": h2c / total}


# ── (b) C-3: Hypothesis 价值分启发式 + aging sort_key ──────────────────────────────
# 启发式家族(拍板: 覆盖空白象限 +1 / 跨链 +1 / 历史同类 confirmed 率加权), 数据源现场定:
#   · 覆盖空白象限 — 假设文本同时提及某 surface×boundary 枚举格(allocator.COVERAGE_SURFACES
#     ×COVERAGE_BOUNDARIES 21 格, 词边界匹配)且该格在本 eng coverage 行中零观测(未填充格)。
#     数据源 = Signal_.surface/boundary(loop.mjs:355 同款查询), 空白=该组合尚无信号。
#   · 跨链 — 假设经 SUGGESTS 边(schema.py Hypothesis→Endpoint, 创造环简报指令产出)所指
#     Endpoint 的 business_chain 去重 ≥2(一条假设横跨多条业务链)。
#   · 历史同类 confirmed 率 — 同 (eng, strategy) 已裁决假设(verdict∈confirmed|refuted|
#     suspected)中 confirmed 占比; 无历史按 0(不给无凭据假设白送分 — 与 3.6-3 rejection
#     冷启动平滑的「中性 0.5」刻意不同: 那是罚否决率的补数, 这里是加分项, 无据不加分)。
#   value_score = 1.0*blank + 1.0*cross + 1.0*rate ∈ [0,3]。
# aging: sort_key = value_score + HYP_AGE_EPS×age_hours(ε=0.05/h — 现场定小值: 分值差 1.0
#   需 20h 龄差才翻越, 价值分主导、老龄保底上浮); 另加候选窗口硬保证: 每轮候选必含 1 条
#   oldest(hypothesis_aging_candidates), 防「低分老假设永久饥饿」。
HYP_SCORE_BLANK_QUADRANT = 1.0
HYP_SCORE_CROSS_CHAIN = 1.0
HYP_SCORE_CONFIRM_RATE = 1.0
HYP_AGE_EPS = 0.05            # 每小时龄期上浮(小值 — 现场拍板, 见上)
HYP_CANDIDATE_WINDOW = 6      # 每轮消费候选窗口(消费点旧 LIMIT 6 同值, 行为零放大)


def hypothesis_value_score(blank_quadrant, cross_chain, confirmed_rate) -> float:
    """假设价值分(纯函数): 1.0*blank + 1.0*cross + 1.0*confirmed_rate。
    blank/cross 按真值参与(布尔/0/1), confirmed_rate 经 _frontier_clamp01 收口 [0,1]
    (非数值/NaN 按 0)。输出 ∈ [0, 3]。与 JS hypothesisValueScore 同式双实现。"""
    b = HYP_SCORE_BLANK_QUADRANT if blank_quadrant else 0.0
    c = HYP_SCORE_CROSS_CHAIN if cross_chain else 0.0
    return b + c + HYP_SCORE_CONFIRM_RATE * _frontier_clamp01(confirmed_rate)


def hypothesis_sort_key(value_score, age_hours, eps=None) -> float:
    """aging 排序键(纯函数): value_score + ε×age_hours; ε 缺省 HYP_AGE_EPS。
    age_hours 负值(时钟偏移/脏 ts)按 0 收口 — 龄期不倒扣分。"""
    e = HYP_AGE_EPS if eps is None else float(eps)
    try:
        h = float(age_hours)
    except (TypeError, ValueError):
        h = 0.0
    if h != h:  # NaN
        h = 0.0
    return float(value_score) + e * max(0.0, h)


def hypothesis_aging_candidates(items, k=None) -> list:
    """消费候选窗口(纯函数): items=[{id, sort_key, ts(epoch ms)}] →
    sort_key 降序(平局 ts 升序 — 同分老者先)取前 k-1 条; 全池 oldest(min ts, 平局先现者)
    不在列则追加在尾 — 「每轮至少放行 1 条 oldest」的窗口硬保证(高分位被 CAS 占用后,
    下一个 CAS 目标即它)。返回 id 列表(长度 ≤ k); 空 items → []。"""
    k = HYP_CANDIDATE_WINDOW if k is None else max(1, int(k))
    rows = []
    for it in items or []:
        try:
            sk = float(it.get("sort_key"))
        except (TypeError, ValueError):
            sk = 0.0
        try:
            ts = int(it.get("ts"))
        except (TypeError, ValueError):
            ts = 0
        rows.append({"id": str(it.get("id")), "sort_key": sk, "ts": ts})
    if not rows:
        return []
    rows.sort(key=lambda r: (-r["sort_key"], r["ts"]))
    pick = rows[: max(1, k - 1)]
    oldest = min(rows, key=lambda r: (r["ts"],))
    if all(p["id"] != oldest["id"] for p in pick):
        pick.append(oldest)
    return [p["id"] for p in pick]

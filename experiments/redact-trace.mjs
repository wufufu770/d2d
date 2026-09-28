// T2-1-1 轨迹清洗器 — 从真实 run-log/graphd 轨迹构建脱敏评测集的落盘前置门。
// 背景(审计实证, 见 run-log 的 scope-gate-eng 事件 cmd/context 字段): worker token 明文
// (32 位 hex)随命令文本落盘; PHPSESSID/dvwaSession、默认凭证 admin/password、worker_id、
// engagement 名、/tmp/d2d-mitm-* 证据路径同为泄露面。既有 graphd/gd/gates.py:213 redact_pii
// (8 类 PII)不覆盖 token/回环 URL/eng 名/worker_id 形态, 故本模块独立实现, 规则与其同向。
//
// 用法:
//   import { redactTrace, redactJson } from '<repo>/experiments/redact-trace.mjs'
//   redactTrace(text)            -> { text, hits: [{ rule, count }, ...] }
//   redactJson(obj)              -> { obj, hits }   // 深遍历, 只改字符串值, 不改键名
//   二者均接受第二参 { aliases }  — 传入自备 Map(eng 名 -> 场占位)以跨调用锁定同一映射;
//   缺省用模块级替换表(首次见到某 eng 名时按 A/B/.../Z/AA... 顺序分配 run-<字母>)。
//
// 一致性契约(评测集硬门): 同一 engagement 名在同一场次(同一 alias 表)内多处出现,
// 永远映射到同一占位; worker_id 与其所属场共享同一占位字母。

// ---------- 替换表(同场一致性) ----------
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'
function placeholderOf(n) {
  // 0->A, 1->B, ... 25->Z, 26->AA, 27->AB ...
  let s = ''
  n = n + 1
  while (n > 0) {
    const r = (n - 1) % 26
    s = LETTERS[r] + s
    n = Math.floor((n - 1) / 26)
  }
  return s
}
const defaultAliases = new Map() // eng 名 -> run-<占位>
function aliasFor(eng, table) {
  let ph = table.get(eng)
  if (!ph) {
    ph = `run-${placeholderOf(table.size)}`
    table.set(eng, ph)
  }
  return ph
}
/** 场占位分配预置: 建评测集时按 run-A/run-B/... 顺序锁定映射, 保证 source 字段与正文一致。 */
export function seedAliases(pairs, table = defaultAliases) {
  for (const [eng, ph] of Object.entries(pairs)) table.set(eng, ph)
  return table
}
/** 仅测试用: 清空缺省替换表。 */
export function resetAliases() { defaultAliases.clear() }

// ---------- 规则表(顺序即执行顺序; 每条 {rule, re|fn, to|repl}) ----------
// 说明: worker-id 依赖 eng-name 先行(占位化后形如 run-A-discovery-uldd, 再剥 4hex 尾)。
const RULES = [
  { rule: 'mitm-evidence', re: /\/tmp\/d2d-mitm-[A-Za-z0-9._*-]*/g, to: '/tmp/[REDACTED:evidence]' },
  // 回环 URL → 保留路径结构(评测需要 path 语义), host 换 target.example
  { rule: 'target-url', re: /https?:\/\/127\.0\.0\.1(?::\d+)?(?:(\/[^\s"'<>()\[\]{}\\]*)?)/g,
    repl: (_m, p1) => `http://target.example${p1 || ''}` },
  // 剩余裸 127.0.0.1(scope 字段/参数值等非 URL 上下文)
  { rule: 'target-host', re: /(?<![\w.])127\.0\.0\.1(?::\d+)?(?![\w.])/g, to: 'target.example' },
  // PHPSESSID=<任意非空值> → 定值占位(真实会话值/中文占位一体覆盖, 防漏)
  { rule: 'phpsessid', re: /PHPSESSID\s*[=:]\s*("[^"]*"|'[^']*'|[^\s"',;)\]}&]+)/gi,
    repl: (_m) => 'PHPSESSID=[REDACTED:session]' },
  // 已知默认凭证对 admin/password、gordonb/abc123、1337/charley 等(用户名/弱口令字面量)。
  // (?<!/) 防误伤文件路径 /etc/passwd(LFI 证据核心 payload, 必须保留语义)。
  { rule: 'cred-pair',
    re: /(?<![/\\])\b([A-Za-z0-9_]{3,16})\s*\/\s*(password|passwd|pwd|pass|abc123|charley|letmein)\b/gi,
    repl: () => '[REDACTED:user]/[REDACTED:cred]' },
  // password=<值> / "password":"<值>"(含 password_new/password_conf/password_old 变体)
  { rule: 'password-kv',
    re: /("?\b(?:password|passwd|pwd|pass)(?:[-_]?(?:new|conf|old))?\b"?\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s"'&;,)\]}\\]+)/gi,
    repl: (_m, p1, p2) => {
      const q = p2 && (p2.startsWith('"') || p2.startsWith("'")) ? p2[0] : ''
      return `${p1}${q}[REDACTED:cred]${q}`
    } },
  // username=admin / user=admin
  { rule: 'username-kv', re: /\b(username|user|login)\s*[=:]\s*admin\b/gi,
    repl: (_m, p1) => `${p1}=[REDACTED:user]` },
  // 散词 admin(DVWA 默认管理员用户名) — credential 语义, 与 redact_pii 同向
  { rule: 'admin-user', re: /\badmin\b/gi, to: '[REDACTED:user]' },
  // engagement 名 → 场占位(替换表保同场一致); repl 在 redactTrace 内特判走 aliasFor
  { rule: 'eng-name', re: /\beng-\d{4}-\d{4}-[\d.]+-[0-9a-z]+\b|\beng-\d{4}-t\d+-[0-9a-z]+\b/gi },
  // worker_id(占位化后 run-<X>-<ring>-<4字符>) → worker-<X>-<ring>(剥 4 字符尾; 实测尾为
  // uldd/ee3d/gxqo/41cr 等随机 [0-9a-z]{4}, 非 hex)
  { rule: 'worker-id', re: /\brun-([A-Z][A-Z0-9]*)-([a-z][0-9a-z-]*?)-([0-9a-z]{4})\b/g,
    repl: (_m, p1, p2) => `worker-${p1}-${p2}` },
  // 截断形态短 token(user_token=18559ffa...) — 不足 32 位但仍是真实凭据碎片。
  // 尾随 (?![0-9a-fA-F]): 值必须在此终结, 防止吞掉 32/64 位完整 token 的前缀留碎片
  // (完整 token 交给下方 hex-token-64/32 规则整体脱敏)。
  { rule: 'short-token',
    re: /\b(user_token|csrf[_-]?token|session[_-]?token|TOKEN)\s*[=:]\s*"?[0-9a-f]{6,63}(?:\.\.\.)?"?(?![0-9a-fA-F])/g,
    repl: (_m, p1) => `${p1}=[REDACTED:token]` },
  // 裸 hex token(64 位先于 32 位, 防重叠吞配)
  { rule: 'hex-token-64', re: /\b[0-9a-fA-F]{64}\b/g, to: '[REDACTED:token]' },
  { rule: 'hex-token-32', re: /\b[0-9a-fA-F]{32}\b/g, to: '[REDACTED:token]' },
  // PII(与 graphd/gd/gates.py redact_pii 同向简版): 邮箱/手机号/身份证
  { rule: 'email', re: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, to: '[REDACTED:email]' },
  { rule: 'phone', re: /\b1[3-9]\d[- ]?\d{4}[- ]?\d{4}\b/g, to: '[REDACTED:phone]' },
  { rule: 'idcard', re: /\b\d{17}[\dXx]\b/g, to: '[REDACTED:idcard]' },
]

/** 对一段文本执行全部规则; 返回 {text, hits}。hits 为按规则序的 {rule, count} 数组(仅含命中项)。 */
export function redactTrace(text, { aliases } = {}) {
  let s = String(text ?? '')
  const table = aliases || defaultAliases
  const hits = []
  for (const { rule, re, to, repl } of RULES) {
    let count = 0
    re.lastIndex = 0
    s = s.replace(re, (...args) => {
      count++
      if (to !== undefined) return to
      if (rule === 'eng-name') return aliasFor(args[0], table) // 命中串即 eng 名
      return repl(...args)
    })
    if (count > 0) hits.push({ rule, count })
  }
  return { text: s, hits }
}

/** 深遍历对象/数组, 对所有字符串值做 redactTrace; 键名不动; 返回 {obj, hits}(hits 合并汇总)。 */
export function redactJson(obj, opts = {}) {
  const hits = []
  const walk = (v) => {
    if (typeof v === 'string') {
      const r = redactTrace(v, opts)
      if (r.hits.length) hits.push(...r.hits)
      return r.text
    }
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') {
      const out = {}
      for (const [k, val] of Object.entries(v)) out[k] = walk(val) // 键名原样
      return out
    }
    return v
  }
  return { obj: walk(obj), hits }
}

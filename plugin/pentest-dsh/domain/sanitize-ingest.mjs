// sanitize-ingest.mjs — T3-2-4 安全核心: 外部数据入图统一消毒编排(纯函数, fail-closed)
// 安全底线 2(拍板): 任何外部 MCP/OSINT 响应, 未过本链(注入扫描→消毒→external 标记)一律
//   不得进图黑板。设计定稿(docs/mcp-security-design.md §编排):
//   链序: ①空/超长 → 丢弃(fail-closed) ②注入词面扫描(loader 词面+HIGH 镜像) → 高置信命中丢弃
//         ③sanitizeUntrusted 消毒(指令文本视为数据/剥可执行结构/实体替换) ④[external:<source>]
//         标记前缀(来源可溯)。
//   失败语义: 任一步异常 → 整条丢弃 + alert 留痕(绝不放行半处理数据); HIGH 命中 → 丢弃;
//     SOFT 命中 → 放行但 alert 留痕(对齐 graphd EXPERIENCE_INJECTION_HIGH/SOFT 双档语义)。
//   标记形态: evidence 文本前缀(选型理由: Signal 无来源列; osint-* type 族是类型不是标记;
//     前缀与 graphd 写端脱敏产物 [REDACTED:*] 同款先例, 零表结构改动)。
// 词表来源: sanitize.js injection-patterns loader(与 Python 读端共读同一份文件 — 单点真源);
//   HIGH 镜像词面(graphd gates.py EXPERIENCE_INJECTION_HIGH 同款: system prompt 类独立短语)。

// HIGH 镜像词面(gates.py EXPERIENCE_INJECTION_HIGH 同源语义: 提示注入高置信独立短语)
const HIGH_PATTERNS = [
  /ignore\s+[\w\s]{0,24}?(previous\s+)?instructions/i,
  /disregard\s+[\w\s]{0,20}?instructions/i,
  /system\s*prompt/i,
  /you\s+are\s+now\s+a/i,
  /reveal\s+your\s+(system\s+)?(prompt|instructions)/i,
]

/** 注入扫描(loader 词面 + HIGH 镜像) → { high: string[], soft: string[] } */
export function scanInjection(text, patterns = []) {
  const s = String(text ?? '')
  const high = [], soft = []
  for (const re of HIGH_PATTERNS) if (re.test(s)) high.push(String(re))
  for (const p of patterns) {
    try {
      const re = p instanceof RegExp ? p : new RegExp(String(p), 'i')
      if (HIGH_PATTERNS.some((h) => h.source === re.source)) continue
      if (re.test(s)) soft.push(String(re))
    } catch { /* 非法词面跳过(loader 白名单已挡, 双保险) */ }
  }
  return { high, soft }
}

/** 统一消毒编排入口 → { ok, text, alerts, via }
 * ok=false = 整条丢弃(fail-closed); ok=true 时 text 已消毒且带 [external:<source>] 前缀。
 * sanitizeImpl 注入(sanitizeUntrusted), patterns 注入(loader 词面) — 全 mock 可测。 */
export function sanitizeIngestExternal(raw, { source = 'unknown', maxLen = 20000, sanitizeImpl, patterns = [] } = {}) {
  const alerts = []
  const via = []
  try {
    const s = String(raw ?? '')
    if (!s.trim()) return { ok: false, text: '', alerts: ['empty'], via: ['empty-guard'] }
    if (s.length > maxLen) { alerts.push(`over-limit(${s.length}>${maxLen})`); return { ok: false, text: '', alerts, via: ['limit-guard'] } }
    // ① 注入扫描(fail-closed: HIGH → 丢弃; 词面函数抛异常 → 丢弃)
    let scan
    try { scan = scanInjection(s, patterns) } catch (e) { return { ok: false, text: '', alerts: [`scan-error:${String(e?.message ?? e).slice(0, 80)}`], via: ['injection-scan'] } }
    if (scan.high.length) { alerts.push(`injection-high:${scan.high.length}`); return { ok: false, text: '', alerts, via: ['injection-scan'] } }
    if (scan.soft.length) alerts.push(`injection-soft:${scan.soft.length}`)
    // ② 消毒(sanitizeUntrusted: 指令文本视为数据 + RISKY_MAP 实体替换 + maxLen 钳制)
    if (typeof sanitizeImpl !== 'function') return { ok: false, text: '', alerts: ['sanitize-unavailable'], via: ['sanitize'] }
    let clean
    try { clean = String(sanitizeImpl(s, { maxLen })) } catch (e) { return { ok: false, text: '', alerts: [`sanitize-error:${String(e?.message ?? e).slice(0, 80)}`], via: ['sanitize'] } }
    if (!clean.trim()) { alerts.push('sanitize-emptied'); return { ok: false, text: '', alerts, via: ['sanitize'] } }
    via.push('injection-scan', 'sanitize')
    // ③ external 标记(来源可溯; source 白名单归一 — 防标记位自身被注入)
    const src = String(source ?? '').toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, 40) || 'external'
    via.push('external-mark')
    return { ok: true, text: `[external:${src}] ${clean}`, alerts, via }
  } catch (e) {
    return { ok: false, text: '', alerts: [`unexpected:${String(e?.message ?? e).slice(0, 80)}`], via: ['unexpected'] }
  }
}

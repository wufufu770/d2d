// fingerprint.mjs — 自研指纹匹配引擎(P1/M4): 规则 JSON + 证据(body/header/title/favicon-md5) → 命中产品。
// 规则形状(内嵌 assets/fingerprints/rules.json, fp-translate.mjs 可从 EHole/FingerprintHub 子集转译):
//   { id, product, vendor?, tags[], matchers: [ {type:'word'|'regex'|'favicon-md5', part:'body'|'header'|'title',
//      words?[], patterns?[], hashes?[], condition?:'and'|'or'} ] }
// 语义: 单 matcher 内 words/patterns/hashes 按 condition(默认 or); 规则级 = 全部 matcher 命中(AND)。
// header 匹配 = 任意头名或头值包含(小写)。全部纯函数, 零 IO — 规则加载与文件分离。
import crypto from 'node:crypto'
import { relaxLadder } from './mapping/query.mjs'

const evidenceOf = (ev) => ({
  status: Number(ev?.status ?? 0),
  body: String(ev?.body ?? '').slice(0, 512_000),
  title: String(ev?.title ?? ''),
  headers: ev?.headers ?? {},
  faviconMd5: String(ev?.faviconMd5 ?? ''),
})

function containsWord(hay, word) {
  if (!hay) return false
  return hay.toLowerCase().includes(String(word).toLowerCase())
}

function matcherHit(m, ev) {
  const condition = m.condition === 'and' ? 'every' : 'some'
  if (m.type === 'favicon-md5') {
    const hashes = (m.hashes ?? []).map((h) => String(h).toLowerCase())
    if (!hashes.length) return false
    return hashes[condition === 'every' ? 'every' : 'some']((h) => h === ev.faviconMd5.toLowerCase())
  }
  if (m.type === 'regex') {
    const pats = m.patterns ?? []
    if (!pats.length) return false
    const hit = (p) => { try { return new RegExp(p, 'i').test(m.part === 'title' ? ev.title : ev.body) } catch { return false } }
    return pats[condition](hit)
  }
  // word: body/header/title
  if (m.part === 'header') {
    const pairs = Object.entries(ev.headers).map(([k, v]) => `${k}: ${v}`)
    const words = m.words ?? []
    if (!words.length) return false
    return words[condition]((w) => pairs.some((p) => containsWord(p, w)))
  }
  const hay = m.part === 'title' ? ev.title : ev.body
  const words = m.words ?? []
  if (!words.length) return false
  return words[condition]((w) => containsWord(hay, w))
}

// → bool: 规则全部 matcher 命中
export function matchRule(rule, evidence) {
  if (!rule?.matchers?.length) return false
  const ev = evidenceOf(evidence)
  return rule.matchers.every((m) => matcherHit(m, ev))
}

// #49(OSINT 自动喂送): 高价值指纹 tag 词表 — 中间件/DevOps/数据面等基础设施产品值得反查测绘面
// (cms/framework/php 等泛型 tag 不触发)。autofeed 只对 osintCandidate=true 的命中自动喂送。
export const OSINT_HIGH_VALUE_TAGS = new Set([
  'middleware', 'devops', 'ci', 'k8s', 'registry', 'db', 'monitor', 'oa', 'erp', 'bi', 'pm', 'storage',
])
export function isOsintCandidate(tags) {
  return (tags ?? []).some((t) => OSINT_HIGH_VALUE_TAGS.has(String(t).toLowerCase()))
}

// → [{product, vendor, tags}] 命中产品列表(去重, 保规则序); 高价值命中(#49)额外带 osintCandidate:true —
// 纯增量字段, 既有消费方只读 product/vendor/tags 不受影响。
export function detectFingerprint(rules, evidence) {
  const out = []
  const seen = new Set()
  for (const r of rules ?? []) {
    if (!r?.product || seen.has(r.product)) continue
    try {
      if (matchRule(r, evidence)) {
        seen.add(r.product)
        const hit = { product: r.product, vendor: r.vendor ?? '', tags: r.tags ?? [] }
        if (isOsintCandidate(hit.tags)) hit.osintCandidate = true
        out.push(hit)
      }
    } catch { /* 单规则坏不拖垮 */ }
  }
  return out
}

// favicon.md5 — probe 抓 favicon 后算哈希用
export function md5(buf) { return crypto.createHash('md5').update(buf).digest('hex') }

// 规则校验(加载期): 坏规则丢弃并列原因, 不让单个脏条目炸整个规则库
export function validateRule(r) {
  const errs = []
  if (!String(r?.id ?? '').trim()) errs.push('id required')
  if (!String(r?.product ?? '').trim()) errs.push('product required')
  if (!Array.isArray(r?.matchers) || !r.matchers.length) errs.push('matchers required')
  for (const [i, m] of (r?.matchers ?? []).entries()) {
    if (!['word', 'regex', 'favicon-md5'].includes(m?.type)) errs.push(`matcher[${i}].type 非法`)
    if (!['body', 'header', 'title', 'favicon'].includes(m?.part ?? 'body')) errs.push(`matcher[${i}].part 非法`)
    if (m?.type === 'word' && !Array.isArray(m.words)) errs.push(`matcher[${i}].words 必须数组`)
    if (m?.type === 'regex' && !Array.isArray(m.patterns)) errs.push(`matcher[${i}].patterns 必须数组`)
    if (m?.type === 'favicon-md5' && !Array.isArray(m.hashes)) errs.push(`matcher[${i}].hashes 必须数组`)
  }
  return { ok: errs.length === 0, errors: errs }
}

export function loadRules(json) {
  const rules = Array.isArray(json?.rules) ? json.rules : []
  const out = []
  const bad = []
  for (const r of rules) {
    const v = validateRule(r)
    if (v.ok) out.push(r)
    else bad.push({ id: r?.id ?? '?', errors: v.errors })
  }
  return { rules: out, bad }
}

// ---- 指纹规则 → 测绘查询(P2 测绘放宽联动, 与 mapping/query.mjs 共用 relaxLadder):
// 规则各面(title/body/header)取首个特征词生成特征键, product 兜底 framework — 经 relaxLadder
// 生成五轮放宽查询序列, 供测绘侧按指纹规则反查资产面。纯函数: 正则特征剥语法取首段可读词,
// 注入字符(引号/反斜杠/换行)与正则元字符剥除; base 为每轮保留的限定 DSL 键(如 {domain:'x.com'})。
export function ruleToDsl(rule, base = {}) {
  const featOf = (part) => {
    const m = (rule?.matchers ?? []).find((x) => x?.part === part && (x?.words?.length || x?.patterns?.length))
    const raw = m?.words?.length ? m.words[0] : String(m?.patterns?.[0] ?? '')
    const token = String(raw)
      .replace(/[\\^$.*+?()[\]{}|]/g, ' ')
      .replace(/["\r\n]/g, '')
      .trim()
      .split(/\s+/)[0] ?? ''
    return token.slice(0, 64)
  }
  const dsl = { ...base }
  for (const k of ['title', 'body', 'header']) {
    const v = featOf(k)
    if (v) dsl[k] = v
  }
  if (String(rule?.product ?? '').trim()) dsl.framework = String(rule.product).trim().slice(0, 64)
  return dsl
}

// 便捷: 规则 → 放宽阶梯查询串(默认 FOFA 语法; render 可传 (dsl)=>translateQuery(dsl,'hunter') 等)
export function ruleQueryLadder(rule, base = {}, render = undefined) {
  return relaxLadder(ruleToDsl(rule, base), render)
}

// fp-translate.mjs — 外部指纹库 → d2d 规则 JSON 转译器(P1/M4)。
// 支持两个来源的子集(零依赖手写解析, 只转译不复制数据 — 原库各自 license 归属):
//   ①EHole finger.json(Apache-2.0): {cms, method: keyword|faviconhash|regular, location: body|header|title, keyword[]}
//     — keyword 数组语义是 AND(全命中); faviconhash 的 mmh3 数值哈希本引擎不吃(md5-only), 跳过并计数。
//   ②FingerprintHub JSON(MIT) 单条目: {id?, metadata:{product,vendor}, http:[{matchers:[{type,part,words/patterns/hash,condition}]}]}
//     — type word/regex 与 favicon(md5 形态)可转; 其他类型跳过并计数。
// 输出: {rules, skipped:[{id, reason}]} — validateRule 兜底再滤一次。
import { validateRule } from './fingerprint.mjs'

const d2dPart = (loc) => (loc === 'header' || loc === 'title' || loc === 'body' ? loc : 'body')

// EHole finger.json 单条 → 0..1 条 d2d 规则(faviconhash-mmh3 无法转, 返回 null + skip)
export function translateEholeEntry(e) {
  const cms = String(e?.cms ?? '').trim()
  if (!cms) return { rule: null, skip: '缺 cms' }
  if (e?.method === 'faviconhash') return { rule: null, skip: `${cms}: faviconhash(mmh3) 不支持` }
  if (e?.method === 'regular') return { rule: null, skip: `${cms}: regular(正则组) 暂不支持` }
  const kws = (Array.isArray(e?.keyword) ? e.keyword : []).map((k) => String(k)).filter(Boolean)
  if (!kws.length) return { rule: null, skip: `${cms}: 空 keyword` }
  const part = d2dPart(e?.location)
  const rule = {
    id: slug(cms),
    product: slug(cms),
    tags: ['ehole'],
    matchers: [{ type: 'word', part, words: kws, condition: 'and' }], // EHole keyword 语义 = 全命中
  }
  const v = validateRule(rule)
  return v.ok ? { rule, skip: null } : { rule: null, skip: `${cms}: ${v.errors.join(';')}` }
}

export function translateEhole(fingerJson) {
  const list = Array.isArray(fingerJson?.fingerprint) ? fingerJson.fingerprint : Array.isArray(fingerJson) ? fingerJson : []
  const rules = [], skipped = []
  for (const e of list) {
    const { rule, skip } = translateEholeEntry(e)
    if (rule) rules.push(rule)
    else if (skip) skipped.push({ id: e?.cms ?? '?', reason: skip })
  }
  return { rules, skipped }
}

// FingerprintHub JSON 条目(matchers 数组形态) → 0..1 条 d2d 规则
export function translateFingerprintHubEntry(e) {
  const product = slug(String(e?.metadata?.product ?? e?.id ?? '').trim())
  if (!product) return { rule: null, skip: '缺 metadata.product' }
  const http = Array.isArray(e?.http) ? e.http : []
  const matchers = []
  for (const h of http) {
    for (const m of Array.isArray(h?.matchers) ? h.matchers : []) {
      if (m?.type === 'word') matchers.push({ type: 'word', part: d2dPart(m?.part), words: (m?.words ?? []).map(String), condition: m?.condition === 'and' ? 'and' : 'or' })
      else if (m?.type === 'regex') matchers.push({ type: 'regex', part: d2dPart(m?.part), patterns: (m?.pattern ?? m?.patterns ?? []).map(String), condition: m?.condition === 'and' ? 'and' : 'or' })
      else if (m?.type === 'favicon') matchers.push({ type: 'favicon-md5', part: 'favicon', hashes: (m?.hash ?? m?.hashes ?? []).map((x) => String(x).toLowerCase()).filter((x) => /^[0-9a-f]{32}$/.test(x)) })
      // 其他类型(status/iconhash-mmh3/...)跳过 — 计入 skipped 由调用方汇总
    }
  }
  if (!matchers.length) return { rule: null, skip: `${product}: 无可转 matcher` }
  const rule = { id: product, product, vendor: String(e?.metadata?.vendor ?? ''), tags: ['fphub', ...String(e?.info?.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean)], matchers }
  const v = validateRule(rule)
  return v.ok ? { rule, skip: null } : { rule: null, skip: `${product}: ${v.errors.join(';')}` }
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || ''
}

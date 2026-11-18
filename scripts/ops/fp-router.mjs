#!/usr/bin/env node
// fp-router.mjs — E46-FP: 误报模式表运行时消费(docs/false-positive-schema.md 4-2 交付的
// 接口面——"运行时消费(热载、匹配、路由)不在本批实施"的本批兑现)。
// 语义: 每条 finding 输入 {file, ruleId?, snippet?, op?, ext?} → 逐模式判别式(封闭枚举+
// 内置 guard)评估 → low(自动路由, tier-depth-mapping 异步免批) / high(人工甄别, 同步审批)。
// 纪律: guard 任一失败/判定不出 → 降人工不自动放行(宁可多降不可误放); hitCount 命中写回
// (工程纪律②); 账本(ledger)同名 id 覆盖静态(优先级 ledger>static)。
// CLI: fp-router.mjs --file <f> [--rule <id>] [--snippet <text>] [--op read|write] [--ext .json]
//      [--json '<findings 数组>'] [--format json|md] [--table <路径覆盖>]
import fs from 'node:fs'
import path from 'node:path'

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const DEFAULT_TABLE = `${REPO}/config/false-positive-patterns.json`

// ---- 热载(mtime 缓存; 账本覆盖静态: ledger 同名 id 整体顶替) ----
const _cache = new Map() // path → { mtimeMs, table }
export function loadTable(tablePath = DEFAULT_TABLE, fsImpl = fs) {
  let st
  try { st = fsImpl.statSync(tablePath) } catch { return { table: null, why: `表不可读: ${tablePath}` } }
  const hit = _cache.get(tablePath)
  if (hit && hit.mtimeMs === st.mtimeMs) return { table: hit.table }
  let table
  try { table = JSON.parse(fsImpl.readFileSync(tablePath, 'utf8')) } catch (e) { return { table: null, why: `表损坏: ${String(e?.message ?? e).slice(0, 80)}` } }
  if (!Array.isArray(table.patterns)) return { table: null, why: '表非法(patterns 缺失)' }
  // 账本覆盖(优先级 ledger>static, 同名 id 整体顶替; 账本删除=静态不复活)
  const ledgerPath = path.join(path.dirname(tablePath), 'false-positive-ledger.json')
  try {
    const ledger = JSON.parse(fsImpl.readFileSync(ledgerPath, 'utf8'))
    if (Array.isArray(ledger.patterns)) {
      const byId = new Map(table.patterns.map((p) => [p.id, p]))
      for (const lp of ledger.patterns) byId.set(lp.id, { ...lp, source: 'ledger' })
      table = { ...table, patterns: [...byId.values()] }
    }
  } catch { /* 账本缺席=纯静态(合法) */ }
  _cache.set(tablePath, { mtimeMs: st.mtimeMs, table })
  return { table }
}

const wb = (text, word) => new RegExp(`(^|[^\\w])${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\w]|$)`, 'i').test(String(text ?? ''))
const hasPathSegment = (file, seg) => String(file ?? '').split(/[/\\]/).includes(String(seg))
const wordBoundary = (text, word) => new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(String(text ?? ''))

/** 单模式判别式评估(封闭枚举; 判定不出 → {level:'high', why})。返回 {level, why} | null(不适用)。 */
export function evaluate(pattern, finding, fsImpl = fs) {
  const f = finding ?? {}
  const file = String(f.file ?? '')
  const snippet = String(f.snippet ?? '')
  const body = String(f.functionBody ?? snippet)
  switch (pattern.type) {
    case 'test-ddl': {
      if (!hasPathSegment(file, pattern.pathSegment)) return null
      const kw = (pattern.keywords ?? []).find((k) => wb(body, k))
      if (!kw) return null
      const guardHit = (pattern.guards ?? []).find((g) => wordBoundary(body, g))
      if (guardHit) return { level: 'high', matched: pattern.id, why: `guard 词元 "${guardHit}" 命中(词边界) — 降人工不自动放行` }
      return { level: 'low', matched: pattern.id, why: `tests/** + DDL 关键字 "${kw}", 词表干净` }
    }
    case 'test-urlopen': {
      if (!hasPathSegment(file, pattern.pathSegment)) return null
      if (!wb(body, pattern.callToken)) return null
      const loop = (pattern.loopbackHosts ?? []).some((h) => snippet.includes(h))
      if (!loop) return null
      // 同文件本地起服构造双验——fileText 缺席=判定不出 → 降人工(方向保守)
      let marker = false
      if (typeof f.fileText === 'string') marker = f.fileText.includes(pattern.localServerMarker)
      else if (snippet.includes(pattern.localServerMarker)) marker = true
      if (!marker) return { level: 'high', matched: pattern.id, why: '本地起服构造未证实(fileText 未提供或标记缺失) — 降人工' }
      return { level: 'low', matched: pattern.id, why: 'urlopen 回环 + 本地起服构造双验通过' }
    }
    case 'validator-triple': {
      if (!f.ruleId) return null
      const hit = (pattern.triples ?? []).find((t) => t.file === file && t.ruleId === String(f.ruleId))
      if (!hit) return null
      // 锚函数符号解析: functionBody 提供 → 锚词元须命中(词边界); 未提供 → 降人工(解析不出=降人工)
      if (!f.functionBody || !wordBoundary(f.functionBody, hit.anchor)) {
        if (f.functionBody === undefined) return { level: 'high', matched: pattern.id, why: `锚函数 "${hit.anchor}" 未解析(functionBody 未提供) — 降人工` }
        return { level: 'high', matched: pattern.id, why: `锚函数 "${hit.anchor}" 解析失败 — 降人工` }
      }
      return { level: 'low', matched: pattern.id, why: `三元整行命中(file+${f.ruleId}+锚 ${hit.anchor})` }
    }
    case 'function-triple': {
      if (file !== pattern.file) return null
      const bodyText = String(f.functionBody ?? snippet)
      if (!bodyText) return null
      const missing = (pattern.tokens ?? []).filter((t) => !bodyText.includes(t))
      if (!f.functionBody) return { level: 'high', matched: pattern.id, why: '函数体作用域未提供 — 降人工' }
      if (missing.length) return { level: 'high', matched: pattern.id, why: `三件套缺 ${missing.join(', ')} — 降人工` }
      return { level: 'low', matched: pattern.id, why: '函数体内三件套全中' }
    }
    case 'env-read-json': {
      const envVar = String(f.envVar ?? '')
      const isEnv = (pattern.envExact ?? []).includes(envVar) || new RegExp(`^${pattern.envPrefix ?? 'P2P_'}[A-Z0-9_]+$`).test(envVar)
      if (!envVar || !isEnv) return null
      if (String(f.op ?? 'read') !== 'read') return { level: 'high', matched: pattern.id, why: `操作 ${f.op} 非读型 — 降人工(guard)` }
      const ext = String(f.ext ?? path.extname(String(f.file ?? '')))
      if (!(pattern.exts ?? []).includes(ext)) return null
      const writeWord = (pattern.writeWords ?? []).find((w) => wordBoundary(snippet, w))
      if (writeWord) return { level: 'high', matched: pattern.id, why: `写操作词元 "${writeWord}" 命中 — 降人工(guard)` }
      return { level: 'low', matched: pattern.id, why: `env(${envVar}) 读型 ${ext} — 判别式三条齐备` }
    }
    case 'manual':
    default: {
      // manual 型: 判别式登记留档但运行时判定不出 → 恒降人工(spec: 判定不出绑定来源→降人工)
      if (pattern.file && file !== pattern.file) return null
      if (pattern.noqa && !snippet.includes(pattern.noqa)) return null
      return { level: 'high', matched: pattern.id, why: 'manual 型模式(判别式需源码级判定) — 恒降人工' }
    }
  }
}

/** 路由单条 finding: 首个适用模式的判定为准; 无适用模式 → high(默认人工, fail-closed)。 */
export function route(finding, table, fsImpl = fs) {
  for (const p of table?.patterns ?? []) {
    const r = evaluate(p, finding, fsImpl)
    if (r) return { ...r, routingSafe: Boolean(p.routingSafe) }
  }
  return { level: 'high', matched: null, why: '无适用模式 — 默认人工(fail-closed)' }
}

/** hitCount 写回(工程纪律②: 命中率统计) — matched-low 模式 hitCount+1, 原子写回表文件。 */
export function bumpHitCount(tablePath, patternId, fsImpl = fs) {
  try {
    const t = JSON.parse(fsImpl.readFileSync(tablePath, 'utf8'))
    const p = (t.patterns ?? []).find((x) => x.id === patternId)
    if (!p) return false
    p.hitCount = (Number(p.hitCount) || 0) + 1
    fsImpl.writeFileSync(tablePath, JSON.stringify(t, null, 2) + '\n')
    _cache.delete(tablePath) // 写后失效热载缓存
    return true
  } catch { return false }
}

// ---- CLI ----
const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirect) {
  const argv = process.argv.slice(2)
  const argOf = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? d) : d }
  const tablePath = argOf('--table', DEFAULT_TABLE)
  const format = argOf('--format', 'json')
  const { table, why } = loadTable(tablePath)
  if (!table) { console.error(`✗ ${why}`); process.exit(2) }
  let findings = []
  const jsonArg = argOf('--json', null)
  if (jsonArg) findings = JSON.parse(jsonArg)
  else if (argv.includes('--stdin')) findings = JSON.parse(fs.readFileSync(0, 'utf8'))
  else {
    findings = [{
      file: argOf('--file', ''),
      ruleId: argOf('--rule', undefined),
      snippet: argOf('--snippet', ''),
      functionBody: argOf('--body', undefined),
      op: argOf('--op', undefined),
      ext: argOf('--ext', undefined),
      envVar: argOf('--env', undefined),
    }]
  }
  const results = (Array.isArray(findings) ? findings : [findings]).map((f) => {
    const r = route(f, table, fs)
    if (r.level === 'low' && r.matched) bumpHitCount(tablePath, r.matched, fs)
    return { file: f.file, ruleId: f.ruleId ?? null, ...r }
  })
  if (format === 'md') {
    for (const r of results) console.log(`- [${r.level.toUpperCase()}] ${r.file}${r.ruleId ? ` (${r.ruleId})` : ''} — ${r.matched ?? 'no-pattern'}: ${r.why}`)
  } else {
    console.log(JSON.stringify({ ok: true, results }, null, 1))
  }
  process.exit(0)
}

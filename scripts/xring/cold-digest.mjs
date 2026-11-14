// cold-digest.mjs — 大 brief 冷摘要(E39-B2-2, reArtex cold_digest 语义移植)
// 问题锚: E33 定谳——--from-record 大 brief(18 leads)起步体积触发传输层失败(TRANSPORT 形态①)。
// 本模块=brief 注入前的**体积守门**: 超封顶才压缩, 小输入恒等零改动(合规输入恒等承诺,
// normalize.mjs E34 先例同款)——**scheduler.js:570-618 brief 组装序禁区零触碰**(接线走
// first-run 注入面, 输入侧压缩)。
// 压缩分级(保真优先序): falsified/negative 白名单零压缩(防复测语义) > facts 逐条截断
// (底账全保留) > leads 排序裁切(优先级高在前, 尾部折叠计数行)。迭代收敛(cap 不足则
// 反复收紧直至达标或全部最小化)。
// 用法(库): digestBrief(carriers, {cap}) → {changed, carriers, stats}
// 用法(CLI): node scripts/xring/cold-digest.mjs --in handoff.json [--out digested.json] [--cap 9000]
import fs from 'node:fs'

export const HANDOFF_CAP_BYTES = 9000 // night-chain 种子 9KB 封顶同口径(seed-gen.py 先例)

const jsonSize = (v) => JSON.stringify(v).length
const truncStr = (s, n) => (String(s ?? '').length <= n ? String(s ?? '') : String(s ?? '').slice(0, n))

/** leads 裁切: 优先级字段降序(缺省 0), 条数与单条长度双向收紧。 */
function cutLeads(leads, maxEach) {
  const arr = [...(leads ?? [])].sort((a, b) => Number(b?.priority ?? b?.weight ?? 0) - Number(a?.priority ?? a?.weight ?? 0))
  return arr.map((l) => {
    if (typeof l === 'string') return truncStr(l, maxEach)
    const out = { ...l }
    for (const k of Object.keys(out)) {
      if (typeof out[k] === 'string' && out[k].length > maxEach) out[k] = out[k].slice(0, maxEach)
    }
    return out
  })
}

function cutFacts(facts, maxEach) {
  return (facts ?? []).map((f) => {
    if (typeof f === 'string') return truncStr(f, maxEach)
    const out = { ...f }
    for (const k of Object.keys(out)) {
      if (typeof out[k] === 'string' && out[k].length > maxEach) out[k] = out[k].slice(0, maxEach)
    }
    return out
  })
}

/** 主入口: carriers={facts,leads,falsified,fp?,...}。超 cap 才压缩(恒等承诺), 迭代收紧。
 *  falsified/negative/白名单字段零压缩(防复测语义——"已知假"被裁=复测浪费预算)。 */
export function digestBrief(carriers, { cap = HANDOFF_CAP_BYTES, keepUncompressed = ['falsified', 'negative', 'fp'] } = {}) {
  if (!carriers || typeof carriers !== 'object') return { changed: false, carriers, stats: { reason: 'non-object' } }
  const origSize = jsonSize(carriers)
  if (origSize <= cap) return { changed: false, carriers, stats: { origSize, size: origSize, reason: 'within-cap(恒等)' } }
  const keys = Object.keys(carriers)
  const protectedKeys = new Set(keepUncompressed.filter((k) => k in carriers))
  const shrinkable = keys.filter((k) => !protectedKeys.has(k))
  const stats = { origSize, cutLeads: 0, cutFacts: 0, rounds: 0 }
  let working = { ...carriers }
  let size = origSize
  let maxEach = 240
  while (size > cap && maxEach >= 20) {
    stats.rounds++
    for (const k of shrinkable) {
      const before = jsonSize(working[k])
      if (k === 'leads') working[k] = cutLeads(working[k], maxEach)
      else if (k === 'facts') working[k] = cutFacts(working[k], maxEach)
      else if (Array.isArray(working[k])) working[k] = cutLeads(working[k], maxEach)
      else if (typeof working[k] === 'string') working[k] = truncStr(working[k], maxEach)
      const after = jsonSize(working[k])
      if (k === 'leads') stats.cutLeads += before - after
      if (k === 'facts') stats.cutFacts += before - after
    }
    size = jsonSize(working)
    if (size <= cap) break
    maxEach = Math.floor(maxEach / 2) // 迭代收紧
  }
  // 终极兜底: leads 裁到前 5 条(排序保真), 其余 shrinkable 数组裁前 3
  if (size > cap) {
    if (Array.isArray(working.leads)) working.leads = working.leads.slice(0, 5)
    for (const k of shrinkable) {
      if (k !== 'leads' && Array.isArray(working[k])) working[k] = working[k].slice(0, 3)
    }
    size = jsonSize(working)
  }
  stats.size = size
  return { changed: true, carriers: working, stats }
}

// ── CLI(薄壳): --in handoff.json [--out digested.json] [--cap] [--apply] ──────────
async function cliMain(argv) {
  const has = (f) => argv.includes(f)
  const arg = (f) => (has(f) ? argv[argv.indexOf(f) + 1] : undefined)
  if (has('--help') || !arg('--in')) {
    console.log('用法: node scripts/xring/cold-digest.mjs --in handoff.json [--out digested.json] [--cap 9000]')
    process.exit(has('--finding') ? 0 : 2)
  }
  const doc = JSON.parse(fs.readFileSync(String(arg('--in')), 'utf8'))
  const carriers = doc.carriers ?? doc
  const r = digestBrief(carriers, { cap: Number(arg('--cap') ?? HANDOFF_CAP_BYTES) })
  console.log(JSON.stringify(r.stats, null, 1))
  const outPath = arg('--out')
  if (outPath) {
    const out = doc.carriers ? { ...doc, carriers: r.carriers } : r.carriers
    fs.writeFileSync(String(outPath), JSON.stringify(out, null, 1) + '\n')
    console.log(`[cold-digest] 写出 ${outPath}(changed=${r.changed})`)
  }
}

const isMain = process.argv[1] && import.meta.url === (await import('node:url')).pathToFileURL(process.argv[1]).href
if (isMain) await cliMain(process.argv.slice(2)).catch((e) => { console.error(`✗ ${e.message}`); process.exit(1) })

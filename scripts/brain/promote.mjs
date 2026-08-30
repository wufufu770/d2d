#!/usr/bin/env node
// promote.mjs — 知识包三层晋级门禁(无靶场依赖, 生产化)
// 用法:
//   promote.mjs --check                 只跑门禁①②看结论
//   promote.mjs --to-shadow [--graph P] staged → versions/vN(status=shadow)+brain/shadow 软链; 门禁①②必须全过
//   promote.mjs --to-current [--force]  shadow → current; 门禁③: 可信实战命中证据(样本量收紧, --force 记审计越过)
//   promote.mjs --reject                丢弃 staged
//   promote.mjs --seed                  安装 brain/seed/v0 基线为首个 current(生产冷启动)
//   promote.mjs --status                版本一览
// 版本恒 ≤3: current + 前 2 版, 晋级时自动修剪
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = process.env.D2D ?? `${os.homedir()}/d2d`
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const BRAIN = `${DATA_DIR}/brain`
const STAGED = `${BRAIN}/staged`
const VERSIONS = `${BRAIN}/versions`
const SEED = `${REPO}/brain/seed/v0-techniques.json`
const GRAPH = process.argv[process.argv.indexOf('--graph') + 1] ?? '8766'
const FORCE = process.argv.includes('--force')

// 门禁①: 注入/破坏性内容扫描(与 sanitize/destructive 同向)
const EVIL = [
  /ignore\s+[\w\s]{0,24}?instructions/i, /disregard\s+[\w\s]{0,20}?instructions/i,
  /rm\s+-rf?\s+\//, /mkfs/, /dd\s+[^|]*of=\/dev\//, /shutdown|reboot|halt/i,
  /DROP\s+(TABLE|DATABASE)/i, /curl[^|]*\|\s*(ba)?sh/,
]
const tok = (s) => String(s ?? '').toLowerCase().split(/[^a-z0-9_]+/).filter((w) => w.length > 2)

function gq(cy) {
  try {
    const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
    // 参数数组直传(不经 shell): cypher 内含单引号曾把 -d 截断, 门禁静默空转
    const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
      `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
      '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher })], { encoding: 'utf8' })
    return JSON.parse(res).rows ?? []
  } catch { return [] }
}

function structuralGate(cards) {
  const errs = [], clean = []
  const currentIds = new Set((currentCards()).map((c) => c.id))
  for (const c of cards) {
    const blob = JSON.stringify(c)
    if (!/^card:[a-z0-9-]+$/.test(String(c.id ?? ''))) { errs.push(`${c.id ?? '?'}: id 非法`); continue }
    if (!c.title || !Array.isArray(c.applies_to) || !c.applies_to.length || !c.validation_recipe) { errs.push(`${c.id}: 字段缺失`); continue }
    // E-4: variants 可选字段形状校验 [{stack, payload_diff}]
    if (c.variants !== undefined && (!Array.isArray(c.variants) || c.variants.some((v) => !v || typeof v.stack !== 'string' || typeof v.payload_diff !== 'string'))) {
      errs.push(`${c.id}: variants 形状非法(需 [{stack,payload_diff}])`); continue
    }
    if (EVIL.some((re) => re.test(blob))) { errs.push(`${c.id}: 注入/破坏性内容`); continue }
    if (currentIds.has(c.id)) continue // 与现役同卡: 幂等跳过
    clean.push(c)
  }
  return { clean, errs }
}

// 门禁②: 历史复盘回归 — 卡的适用指纹撞上已证伪方向(refuted 且无胜绩) → 隔离; 隔离率>30% 整版拒绝
const _norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')
function historyGate(cards) {
  const refuted = gq(`MATCH (s:Signal_) WHERE s.status IN ['refuted','pruned'] RETURN DISTINCT s.type AS t LIMIT 60`)
    .map((r) => _norm(r.t))
  const wins = new Set(gq(`MATCH (e:ExperienceWeight) WHERE e.wins > 0 RETURN e.pattern AS p`).map((r) => _norm(String(r.p ?? '').replace(/^(succ|fail):/, ''))))
  const kept = [], quarantined = []
  for (const c of cards) {
    const toks = (c.applies_to ?? []).map((k) => _norm(k)).filter(Boolean)
    const hitDead = toks.some((k) => refuted.some((r) => r && (r.includes(k) || k.includes(r))) && ![...wins].some((w) => w.includes(k) || k.includes(w)))
    ;(hitDead ? quarantined : kept).push(c.id)
  }
  const rate = cards.length ? quarantined.length / cards.length : 0
  return { kept, quarantined, rate, ok: rate <= 0.3 }
}

function currentCards() {
  try { return JSON.parse(fs.readFileSync(`${BRAIN}/current/techniques.json`, 'utf8')).cards ?? [] } catch { return [] }
}
function versionDirs() {
  try {
    return fs.readdirSync(VERSIONS).filter((d) => /^v\d+$/.test(d) && fs.existsSync(`${VERSIONS}/${d}/manifest.json`))
      .map((d) => ({ dir: d, ...JSON.parse(fs.readFileSync(`${VERSIONS}/${d}/manifest.json`, 'utf8')) }))
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
  } catch { return [] }
}
function prune() {
  const cur = (() => { try { return path.basename(fs.readlinkSync(`${BRAIN}/current`)) } catch { return null } })()
  const vs = versionDirs().filter((v) => v.dir !== cur)
  const keep = new Set(vs.slice(-2).map((v) => v.dir))
  for (const v of vs) if (!keep.has(v.dir)) { fs.rmSync(`${VERSIONS}/${v.dir}`, { recursive: true, force: true }); console.log(`修剪超期版本 ${v.dir}`) }
}
// 门禁③(样本量收紧): wins>=1 即转正是低先验高方差陷阱 — 单次命中可能是运气。
// 可信证据 = wins>=3, 或 wins>=2 且该卡 applies_to 不撞已证伪方向(refuted/pruned)。
function fieldEvidence() {
  const rows = gq(`MATCH (e:ExperienceWeight) WHERE e.id STARTS WITH 'card:' AND e.wins > 0 RETURN e.id AS id, e.wins AS w, e.hits AS h, e.prior AS p`)
  const laplace = (w, h) => Math.round(((w + 1) / (h + 2)) * 100) / 100
  return rows.map((r) => {
    const w = Number(r.w), h = Number(r.h ?? r.w)
    return { id: String(r.id), wins: w, hits: h, prior: Number(r.p ?? laplace(w, h)) }
  })
}
function gate3(ev) {
  const refuted = gq(`MATCH (s:Signal_) WHERE s.status IN ['refuted','pruned'] RETURN DISTINCT s.type AS t LIMIT 60`).map((r) => _norm(r.t))
  const shadowCards = (() => { try { return JSON.parse(fs.readFileSync(`${BRAIN}/shadow/techniques.json`, 'utf8')).cards ?? [] } catch { return [] } })()
  const dirty = new Set(shadowCards
    .filter((c) => (c.applies_to ?? []).some((k) => refuted.some((r) => r && (r.includes(_norm(k)) || _norm(k).includes(r)))))
    .map((c) => c.id))
  const pass = [], detail = []
  for (const e of ev) {
    const ok = e.wins >= 3 || (e.wins >= 2 && !dirty.has(e.id))
    detail.push(`${e.id}(wins=${e.wins}, laplace=${e.prior}${dirty.has(e.id) ? ', 撞refuted' : ''})${ok ? '✓' : '✗'}`)
    if (ok) pass.push(`${e.id}(wins=${e.wins}, laplace=${e.prior})`)
  }
  return { ok: pass.length > 0, pass, detail }
}

const cmd = process.argv[2]
if (cmd === '--to-current') {
  const shadowLink = (() => { try { return fs.readlinkSync(`${BRAIN}/shadow`) } catch { return null } })()
  if (!shadowLink) { console.error('无 shadow 版本'); process.exit(1) }
  const g3 = gate3(fieldEvidence())
  if (!g3.ok && !FORCE) {
    console.error(`❌ 门禁③未过: 影子包无可信实战证据(需 wins>=3, 或 wins>=2 且不撞已证伪方向)。随行观察或 --force 越过(记审计)。`)
    if (g3.detail.length) console.error('  现状: ' + g3.detail.join('; '))
    process.exit(1)
  }
  if (!g3.ok && FORCE) console.log('⚠ --force 越过门禁③(无可信实战命中)')
  const vdir = path.basename(shadowLink)
  try { fs.rmSync(`${BRAIN}/current`) } catch {}
  fs.symlinkSync(`${VERSIONS}/${vdir}`, `${BRAIN}/current`)
  try { fs.rmSync(`${BRAIN}/shadow`) } catch {}
  const manifest = JSON.parse(fs.readFileSync(`${shadowLink}/manifest.json`, 'utf8'))
  fs.writeFileSync(`${shadowLink}/manifest.json`, JSON.stringify({ ...manifest, status: 'current', promoted_at: new Date().toISOString(), field_evidence: g3.pass }, null, 2))
  console.log(`✅ ${vdir} 已晋级 current${g3.pass.length ? `; 实战证据: ${g3.pass.join(', ')}` : ''}`)
  prune()
  process.exit(0)
}

if (cmd === '--status') {
  console.log('current →', (() => { try { return fs.readlinkSync(`${BRAIN}/current`) } catch { return '(未安装)' } })())
  console.log('shadow  →', (() => { try { return fs.readlinkSync(`${BRAIN}/shadow`) } catch { return '(无)' } })())
  for (const v of versionDirs()) console.log(`${v.dir} status=${v.status} created=${v.created_at} parent=${v.parent_version ?? '-'} docs=${(v.source_docs ?? []).join(',')}`)
  process.exit(0)
}

if (cmd === '--seed') {
  // E-4/C-1: seed 以「下一版本」安装(保留旧版本可回退, 恒 ≤3 由 prune 收口), 不再覆写 v0
  const curBase = (() => { try { return path.basename(fs.readlinkSync(`${BRAIN}/current`)) } catch { return '' } })()
  const maxV = versionDirs().reduce((m, v) => Math.max(m, Number(v.dir.slice(1))), 0)
  const next = `v${Math.max(maxV + 1, curBase ? Number(curBase.slice(1)) + 1 : 1)}`
  fs.mkdirSync(VERSIONS, { recursive: true })
  fs.mkdirSync(`${VERSIONS}/${next}`, { recursive: true })
  fs.copyFileSync(SEED, `${VERSIONS}/${next}/techniques.json`)
  fs.writeFileSync(`${VERSIONS}/${next}/manifest.json`, JSON.stringify({ created_at: new Date().toISOString(), status: 'current', parent_version: curBase || null, source_docs: ['builtin-seed'], bench_score: null }, null, 2))
  try { fs.rmSync(`${BRAIN}/current`); } catch {}
  fs.symlinkSync(`${VERSIONS}/${next}`, `${BRAIN}/current`)
  // 旧 current 降为 retired(状态字段与软链一致, 便于审计)
  if (curBase) {
    try {
      const om = JSON.parse(fs.readFileSync(`${VERSIONS}/${curBase}/manifest.json`, 'utf8'))
      fs.writeFileSync(`${VERSIONS}/${curBase}/manifest.json`, JSON.stringify({ ...om, status: 'retired', retired_at: new Date().toISOString() }, null, 2))
    } catch {}
  }
  console.log(`${next} 基线已安装为 current(parent=${curBase || 'null'})`)
  prune()
  process.exit(0)
}
if (cmd === '--reject') {
  fs.rmSync(STAGED, { recursive: true, force: true })
  console.log('staged 已丢弃')
  process.exit(0)
}

const stagedCards = (() => {
  try { return JSON.parse(fs.readFileSync(`${STAGED}/techniques.json`, 'utf8')).cards ?? [] } catch { return [] }
})()
if (!stagedCards.length) { console.error('staged 为空 — 先跑 study.mjs --apply'); process.exit(1) }

// 门禁①
const g1 = structuralGate(stagedCards)
if (g1.errs.length) console.log(`门禁① 结构: 拒绝 ${g1.errs.length} 张: ${g1.errs.join('; ')}`)
console.log(`门禁① 通过 ${g1.clean.length} 张(与现役幂等去重后)`)

// 门禁②
const g2 = historyGate(g1.clean)
console.log(`门禁② 复盘: 隔离 ${g2.quarantined.length} 张(撞已证伪方向): ${g2.quarantined.join(', ') || '-'}; 隔离率 ${(g2.rate * 100).toFixed(0)}%`)
if (!g2.ok) { console.error('❌ 整版拒绝: 隔离率>30%'); process.exit(1) }
const finalCards = g1.clean.filter((c) => !g2.quarantined.includes(c.id))
if (!finalCards.length) { console.error('❌ 无有效新卡'); process.exit(1) }

if (cmd === '--check') { console.log(`✅ 门禁①②通过, 可 --to-shadow (${finalCards.length} 张)`); process.exit(0) }
if (cmd === '--to-shadow') {
  const curBase = (() => { try { return path.basename(fs.readlinkSync(`${BRAIN}/current`)) } catch { return '' } })()
  const maxV = versionDirs().reduce((m, v) => Math.max(m, Number(v.dir.slice(1))), 0)
  const next = `v${Math.max(maxV + 1, curBase ? Number(curBase.slice(1)) + 1 : 1)}`
  fs.mkdirSync(`${VERSIONS}/${next}`, { recursive: true })
  fs.writeFileSync(`${VERSIONS}/${next}/techniques.json`, JSON.stringify({ cards: finalCards }, null, 1))
  const manifest = JSON.parse(fs.readFileSync(`${STAGED}/manifest.json`, 'utf8'))
  fs.writeFileSync(`${VERSIONS}/${next}/manifest.json`, JSON.stringify({ ...manifest, status: 'shadow', gate: { structural_rejected: g1.errs, quarantined: g2.quarantined } }, null, 2))
  try { fs.rmSync(`${BRAIN}/shadow`) } catch {}
  fs.symlinkSync(`${VERSIONS}/${next}`, `${BRAIN}/shadow`)
  fs.rmSync(STAGED, { recursive: true, force: true })
  console.log(`✅ ${next} 已进入影子伴随(shadow); 现役 current 未动。实战命中后: promote.mjs --to-current`)
  prune()
  process.exit(0)
}
console.error('用法: promote.mjs --check|--to-shadow|--to-current|--reject|--seed|--status')
process.exit(1)

#!/usr/bin/env node
// skill-promote.mjs — T3-2-2 skill 晋级通道(平行新建, 复用 promote.mjs 机制形态而非改既有链路)
// 用法:
//   node scripts/brain/skill-promote.mjs list              列全部 skill 与状态
//   node scripts/brain/skill-promote.mjs check <id>        跑结构门+复盘门看结论(不转态)
//   node scripts/brain/skill-promote.mjs promote <id>      转态: quarantined→shadow(门①②) / shadow→current(门③soft)
//   node scripts/brain/skill-promote.mjs reject <id>       quarantined→deprecated(丢弃否决)
// 存储形态: ${DATA_DIR}/brain/skills/<skill-id>/SKILL.md + memory.md(可选) + state.json
// 三门(拍板 2: skill 是平行新对象, 不改 Experience 表结构与既有晋级链路):
//   ①结构门(hard)  = SKILL.md front-matter Schema + 正文小节齐备 + EVIL 扫描(domain/skill-schema.mjs validateSkillFull)
//   ②历史复盘门(hard) = signal_affinity 撞已证伪方向(refuted/pruned 且无胜绩) → 隔离(语义照 promote.mjs historyGate)
//   ③实战证据门(soft) = evidence 非空即可转 current(skill wins 自动归因未建 — 全量归因登记开放项)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { validateSkillFull, parseSkillMd } from '../../plugin/pentest-dsh/domain/skill-schema.mjs'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const SKILLS = `${DATA_DIR}/brain/skills`
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '')

function gq(cy) {
  try {
    const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
    const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST', `http://127.0.0.1:${process.env.P2P_GRAPHD_PORT ?? 8766}/query`,
      '-H', 'Content-Type: application/json', '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher: cy })], { encoding: 'utf8' })
    return JSON.parse(res).rows ?? []
  } catch { return [] } // 图不可达 → 无 refuted 集合(降级同 promote.mjs historyGate 口径)
}

/** 历史复盘门②: signal_affinity 撞已证伪方向(且无胜绩背书) → 隔离 */
function historyGate(fm) {
  const refuted = gq(`MATCH (s:Signal_) WHERE s.status IN ['refuted','pruned'] RETURN DISTINCT s.type AS t LIMIT 60`).map((r) => norm(r.t)).filter(Boolean)
  const wins = new Set(gq(`MATCH (e:ExperienceWeight) WHERE e.wins > 0 RETURN e.pattern AS p`).map((r) => norm(String(r.p ?? '').replace(/^(succ|fail):/, ''))).filter(Boolean))
  const hits = []
  for (const raw of (fm.signal_affinity ?? [])) {
    const k = norm(raw)
    if (!k) continue
    if (refuted.some((r) => r && (r.includes(k) || k.includes(r))) && ![...wins].some((w) => w.includes(k) || k.includes(w))) hits.push(String(raw))
  }
  return { ok: hits.length === 0, hits }
}

function skillDir(id) {
  const d = path.join(SKILLS, String(id ?? '').replace(/^skill:/, ''))
  if (!/^[a-z0-9-]+$/.test(path.basename(d))) throw new Error(`skill id 非法: ${id}`)
  return d
}

function readSkill(id) {
  const d = skillDir(id)
  const md = fs.readFileSync(path.join(d, 'SKILL.md'), 'utf8')
  const state = JSON.parse(fs.readFileSync(path.join(d, 'state.json'), 'utf8'))
  return { dir: d, md, state, fm: parseSkillMd(md)?.fm ?? {} }
}

function writeState(dir, patch) {
  const p = path.join(dir, 'state.json')
  const cur = JSON.parse(fs.readFileSync(p, 'utf8'))
  fs.writeFileSync(p, JSON.stringify({ ...cur, ...patch }, null, 2))
}

function listAll() {
  try {
    for (const d of fs.readdirSync(SKILLS).sort()) {
      try {
        const st = JSON.parse(fs.readFileSync(path.join(SKILLS, d, 'state.json'), 'utf8'))
        console.log(`${st.status.padEnd(12)} ${st.id}  ${st.title ?? ''}`)
      } catch { console.log(`(状态缺失)  ${d}`) }
    }
  } catch { console.log(`(无 skills 目录: ${SKILLS})`) }
}

const cmd = process.argv[2]
const arg = process.argv[3]
if (cmd === 'list') { listAll(); process.exit(0) }

if (!arg) { console.error('用法: skill-promote.mjs list | check <id> | promote <id> | reject <id>'); process.exit(1) }

if (cmd === 'check' || cmd === 'promote' || cmd === 'reject') {
  const sk = readSkill(arg)
  const structural = validateSkillFull(sk.md)
  const history = historyGate(sk.fm)
  if (cmd === 'check') {
    console.log(`结构门: ${structural.ok ? '✅' : '❌'} ${structural.errors.join('; ') || '全过'}`)
    console.log(`复盘门: ${history.ok ? '✅' : `❌ 撞已证伪: ${history.hits.join(', ')}`}`)
    console.log(`证据门(soft): ${((sk.fm.evidence ?? []).length ? '✅' : '⚠ evidence 为空(current 需非空)')}`)
    process.exit(structural.ok && history.ok ? 0 : 1)
  }
  if (cmd === 'reject') {
    if (sk.state.status !== 'quarantined') { console.error(`❌ reject 仅限 quarantined(现 ${sk.state.status}) — 状态机单向`); process.exit(1) }
    writeState(sk.dir, { status: 'deprecated', deprecated_at: new Date().toISOString() })
    console.log(`✅ ${arg} 已弃置(deprecated)`)
    process.exit(0)
  }
  // promote
  if (sk.state.status === 'quarantined') {
    if (!structural.ok) { console.error(`❌ 门①结构未过: ${structural.errors.join('; ')}`); process.exit(1) }
    if (/<待人工蒸馏/.test(sk.md)) { console.error(`❌ 门①未过: 正文含占位符(管道骨架未人工蒸馏, 禁止晋级)`); process.exit(1) }
    if (!history.ok) { console.error(`❌ 门②复盘未过: 撞已证伪方向 ${history.hits.join(', ')}`); process.exit(1) }
    writeState(sk.dir, { status: 'shadow', shadow_at: new Date().toISOString() })
    console.log(`✅ ${arg} → shadow(门①②全过)`)
  } else if (sk.state.status === 'shadow') {
    if (!structural.ok) { console.error(`❌ 门①结构未过: ${structural.errors.join('; ')}`); process.exit(1) }
    if (!(sk.fm.evidence ?? []).length) { console.error(`❌ 门③证据(soft)未过: evidence 为空 — 补实战出处后再转 current`); process.exit(1) }
    writeState(sk.dir, { status: 'current', promoted_at: new Date().toISOString() })
    console.log(`✅ ${arg} → current(证据: ${(sk.fm.evidence ?? []).length} 条)`)
  } else { console.error(`❌ 现态 ${sk.state.status} 无晋级通路(状态机单向)`); process.exit(1) }
  process.exit(0)
}
console.error('用法: skill-promote.mjs list | check <id> | promote <id> | reject <id>')
process.exit(1)

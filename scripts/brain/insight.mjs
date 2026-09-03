#!/usr/bin/env node
// insight.mjs — #74/P2 自产课程: 把图中 verified 战果蒸馏成《实战洞察》文档投放 knowledge/inbox,
// 下次 study.mjs 提炼成 technique cards — 挖掘成果自动变教材(Voyager/GenericAgent 式闭环)。
// 幂等: 同日同名文件已存在则跳过。无 verified 战果 = 不产出(不空转造卡)。
// 用法: node scripts/brain/insight.mjs [--data ~/.d2d-data] [--graph 8766] [--limit 20]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const INBOX = `${DATA_DIR}/knowledge/inbox`
const gi = process.argv.indexOf('--graph')
const GRAPH = gi > 0 ? process.argv[gi + 1] : '8766'
const li = process.argv.indexOf('--limit')
const LIMIT = li > 0 ? Number(process.argv[li + 1]) || 20 : 20

function gq(cypher) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher })], { encoding: 'utf8' })
  return JSON.parse(res).rows ?? []
}

let rows = []
try {
  rows = gq(
    `MATCH (f:Finding) WHERE f.gate_status='verified' AND f.severity IN ['critical','high','medium'] ` +
    `RETURN f.id AS id, f.title AS t, f.severity AS sev, f.category AS cat, f.repro AS repro ` +
    `ORDER BY f.ts DESC LIMIT ${LIMIT}`,
  )
} catch (e) {
  console.log(`graphd 不可达(${String(e.message).slice(0, 80)}) — 不产空课程`)
  process.exit(0)
}

if (!rows.length) {
  console.log('无 verified 战果(或 graphd 不可达) — 不产空课程')
  process.exit(0)
}

// 标题近重排重(同 W2 分诊口径的简化版): 同标题只保留最新一条
const seen = new Set()
const uniq = []
for (const r of rows) {
  const sig = String(r.t ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 60)
  if (seen.has(sig)) continue
  seen.add(sig)
  uniq.push(r)
}

const today = new Date().toISOString().slice(0, 10)
fs.mkdirSync(INBOX, { recursive: true })
const out = path.join(INBOX, `insight-${today}.md`)
if (fs.existsSync(out)) {
  console.log(`${out} 已存在(今日已蒸馏) — 跳过`)
  process.exit(0)
}

const lines = [
  `# 实战洞察 ${today}(自动蒸馏自 verified 战果, ${uniq.length} 条)`,
  '',
  `> 来源: graphd 图内 gate_status='verified' 的 Finding(按时间倒序, 上限 ${LIMIT})。`,
  `> 用途: study.mjs 提炼为 technique cards; 下一轮 engagement 经简报卡下发并按 #74/P0 命中归因计胜。`,
  '',
]
for (const r of uniq) {
  const repro = String(r.repro ?? '').replace(/\s+/g, ' ').slice(0, 300)
  lines.push(
    `## [${String(r.sev ?? 'medium').toUpperCase()}] ${String(r.t ?? '').slice(0, 80)}`,
    `- 类别: ${String(r.cat ?? 'unknown')} | id: ${String(r.id ?? '')}`,
    repro ? `- 复现要点: ${repro}` : '- 复现要点: (无 repro 记录)',
    '',
  )
}
fs.writeFileSync(out, lines.join('\n') + '\n')
console.log(`✅ 已蒸馏 ${uniq.length} 条 verified 战果 → ${out}`)

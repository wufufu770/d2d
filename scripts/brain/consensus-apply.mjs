#!/usr/bin/env node
// consensus-apply.mjs — T4-3-2(8-1 共识验证 v2): v1 共识评估结果经 /write/experience-consensus
// (host-only B 面)回写落库。**dry-run 缺省**(打印将写入清单, 零写动作); --apply 实写。
// 评估=experience-consensus.mjs v1 纯函数(语义零改动): deviations.older → superseded:<newer.id>,
// 其余全部行 → consistent。图不可达 exit 3(与 consensus-check.mjs 同款)。
// 用法: node scripts/brain/consensus-apply.mjs [--apply] [--graph 8766]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { consensusCheck, groupExperiences } from '../../plugin/pentest-dsh/domain/experience-consensus.mjs'

const APPLY = process.argv.includes('--apply')
const _gi = process.argv.indexOf('--graph')
const GRAPH = _gi > -1 ? (process.argv[_gi + 1] || '8766') : '8766'

function post(path, body) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}${path}`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`,
    '-d', JSON.stringify(body)], { encoding: 'utf8' })
  return JSON.parse(res)
}

function fetchRows() {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`,
    '-d', JSON.stringify({
      cypher: 'MATCH (x:Experience) RETURN x.id AS id, x.eng_id AS eng_id, x.category AS category, '
        + 'x.scope AS scope, x.title AS title, x.content AS content, x.status AS status, '
        + 'x.retrieval_count AS retrieval_count, x.success_count AS success_count, x.created_at AS created_at, '
        + 'x.consensus_status AS consensus_status',
    })], { encoding: 'utf8' })
  return JSON.parse(res).rows ?? []
}

// 评估 → 写入计划: deviations.older → superseded:<newer.id>; 其余行(含孤例) → consistent。
function buildPlan(rows) {
  const r = consensusCheck(rows)
  const plan = new Map()
  for (const d of r.deviations) plan.set(String(d.older?.id ?? ''), `superseded:${d.newer?.id ?? ''}`)
  for (const row of rows) {
    const id = String(row?.id ?? '')
    if (id && !plan.has(id)) plan.set(id, 'consistent')
  }
  return { r, plan: [...plan].map(([id, status]) => ({ id, status })) }
}

let rows
try { rows = fetchRows() } catch (e) {
  console.error(`❌ 图不可达(${String(e?.message ?? e).slice(0, 120)}) — 共识回写需要 graphd 通道`)
  process.exit(3)
}
const { r, plan } = buildPlan(rows)
console.log(`共识评估(T4-3-2 v2 回写${APPLY ? ', --apply 实写' : ', dry-run 缺省'}): ${rows.length} 条 / ${groupExperiences(rows).size} 组 — 分歧 ${r.deviations.length}, 异常 ${r.anomalies.length}`)
const supCount = plan.filter((p) => p.status.startsWith('superseded:')).length
console.log(`写入计划: consistent ${plan.length - supCount} 条 / superseded ${supCount} 条`)
for (const p of plan) console.log(`  ${APPLY ? '' : '[dry] '}${p.id} → ${p.status}`)
if (!APPLY) {
  console.log('(dry-run: 未写任何数据 — 实写请加 --apply)')
  process.exit(0)
}
let ok = 0, skip = 0, fail = 0
for (const p of plan) {
  try {
    const cur = rows.find((x) => String(x?.id ?? '') === p.id)?.consensus_status ?? ''
    if (String(cur) === p.status) { skip++; continue } // 幂等: 目标态一致跳过
    const res = post('/write/experience-consensus', { experience_id: p.id, consensus_status: p.status })
    if (res?.ok) ok++
    else { fail++; console.error(`  ✗ ${p.id}: ${String(res?.error ?? 'unknown').slice(0, 120)}`) }
  } catch (e) { fail++; console.error(`  ✗ ${p.id}: ${String(e?.message ?? e).slice(0, 120)}`) }
}
console.log(`回写完成: ok ${ok} / skip(已一致) ${skip} / fail ${fail}`)
process.exit(fail ? 1 : 0)

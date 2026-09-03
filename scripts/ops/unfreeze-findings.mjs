#!/usr/bin/env node
// unfreeze-findings.mjs — issue #88 一次性迁移: 存量 gate_status='frozen' 的 Finding 解冻回验证管线。
// 策略(issue #88 建议 1+2 组合): 状态机已开 frozen 兼容出口(→candidate/triaged/rejected);
// 本脚本把 frozen 逐条 transition 到 candidate(actor='migration', reason 记录), 让 auto-triage 重新分诊。
// dry-run 默认只统计; --apply 写回。幂等: 已非 frozen 的条目自然跳过。
// 用法: node scripts/ops/unfreeze-findings.mjs [--apply] [--graph 8766]
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const gi = process.argv.indexOf('--graph')
const GRAPH = gi > 0 ? process.argv[gi + 1] : '8766'
const APPLY = process.argv.includes('--apply')

function gq(cypher, params = {}) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '20', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher, params })], { encoding: 'utf8' })
  const data = JSON.parse(res)
  if (!data.ok) throw new Error(data.error ?? 'query failed')
  return data.rows ?? []
}
function transition(id, to) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '15', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}/write/transition`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`,
    '-d', JSON.stringify({ id, to, actor: 'migration', reason: 'issue #88: frozen 存量解冻, 回验证管线重新分诊' })], { encoding: 'utf8' })
  return JSON.parse(res)
}

const rows = gq(`MATCH (f:Finding) WHERE f.gate_status='frozen' RETURN f.id AS id, f.title AS t, f.severity AS sev ORDER BY f.ts DESC LIMIT 2000`)
console.log(`frozen 存量: ${rows.length} 条${APPLY ? '' : '(dry-run, 加 --apply 执行迁移)'}`)
let ok = 0, skip = 0, fail = 0
for (const r of rows) {
  console.log(`  [${String(r.sev ?? '?').padEnd(8)}] ${String(r.id)} ${String(r.t ?? '').slice(0, 60)}`)
  if (!APPLY) continue
  try {
    const res = transition(String(r.id), 'candidate')
    if (res.ok) ok++
    else if (String(res.error ?? '').includes('illegal')) skip++ // 并行已被迁移
    else fail++
  } catch { fail++ }
}
console.log(APPLY ? `\n✅ 迁移 ${ok}, 并行已处理跳过 ${skip}, 失败 ${fail} — 解冻条目将由 auto-triage 重新分诊` : '\n(dry-run 结束)')

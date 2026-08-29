#!/usr/bin/env node
// src-export.mjs — SRC 报告一键导出(G4/G5): findings → 去重指纹 → CVSS → markdown 报告 + 提交台账
// 用法: node scripts/report/src-export.mjs [--graph 8767] [--min-severity high] [--all-states]
//   默认只导 gate_status='verified'(W1 状态机接线后未验证候选不进提交清单); --min-severity 过滤; config-advice 单独一节(不作漏洞结论)
// 台账: DATA_DIR/evidence/src-submitted.json 记录已导出指纹, 重复导出标注 [已提交过] 防重复提交
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import crypto from 'node:crypto'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const GRAPH = process.argv[process.argv.indexOf('--graph') + 1] ?? '8766'
const MIN = (() => { const i = process.argv.indexOf('--min-severity'); return i > 0 ? process.argv[i + 1] : 'medium' })()
const SEV_RANK = { critical: 3, high: 2, medium: 1, low: 0 }
const SEV_CVSS = { critical: 9.1, high: 7.5, medium: 5.3, low: 3.1, info: 0 }

function gq(cypher) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST', `http://127.0.0.1:${GRAPH}/query`,
    '-H', 'Content-Type: application/json', '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher })], { encoding: 'utf8' })
  return JSON.parse(res).rows ?? []
}
// 从 repro 提取首个 URL 与参数名, 生成去重指纹 (host,path,param,category,payload-hash)
function fingerprint(f) {
  const repro = String(f.repro ?? '')
  const m = repro.match(/https?:\/\/[^\s"'<>\\]+/)
  let host = '', path_ = '', param = ''
  if (m) {
    try {
      const u = new URL(m[0])
      host = u.hostname
      path_ = u.pathname
      param = [...u.searchParams.keys()][0] ?? ''
    } catch {}
  }
  const payloadHash = crypto.createHash('sha1').update(repro.slice(0, 400)).digest('hex').slice(0, 10)
  return { fp: `${host}|${path_}|${param}|${f.category ?? ''}|${payloadHash}`, host, path: path_, param }
}

const rows = gq(`MATCH (f:Finding) RETURN f.id AS id, f.title AS t, f.severity AS sev, f.cvss AS cvss, f.repro AS repro, f.category AS cat, f.gate_status AS g, f.evidence_dir AS ed, f.verified_at AS va, f.last_transition AS lt ORDER BY f.ts DESC LIMIT 200`)
const ledgerPath = `${DATA_DIR}/evidence/src-submitted.json`
let ledger = { submitted: {} }
try { ledger = JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) } catch {}

const ALL_STATES = process.argv.includes('--all-states')
const now = new Date().toISOString()
const vulns = [], advice = [], newFps = []
for (const f of rows) {
  const { fp, host, path, param } = fingerprint(f)
  const entry = { ...f, fp, host, path, param, dup: !!ledger.submitted[fp] }
  if (f.cat === 'config-advice') advice.push(entry)
  else if (!ALL_STATES && f.g !== 'verified') continue // W1: 状态机已接线 — 未验证候选不进提交清单(--all-states 越过)
  else if (SEV_RANK[f.sev] === undefined || SEV_RANK[f.sev] < SEV_RANK[MIN]) continue
  else {
    if (!entry.dup) newFps.push(fp)
    vulns.push(entry)
  }
}
vulns.sort((a, b) => (SEV_RANK[b.sev] ?? 0) - (SEV_RANK[a.sev] ?? 0))

const L = []
L.push(`# SRC 提交报告 ${now}`)
L.push(`\n> 由 d2d 自动生成; 共 ${vulns.length} 个可提交漏洞(${newFps.length} 个新指纹), ${advice.length} 条加固建议(不作漏洞结论)。`)
L.push(`\n## 漏洞清单\n`)
for (const v of vulns) {
  // graphd 写入的 cvss 默认 5.0 占位: 非 medium 的 5.0 视为占位, 回退严重度基准分
  const stored = Number(v.cvss) > 0 ? Number(v.cvss) : 0
  const cvss = stored && !(stored === 5.0 && v.sev !== 'medium') ? stored : SEV_CVSS[v.sev] ?? 0
  L.push(`### [${v.dup ? '已提交过|' : ''}${v.sev.toUpperCase()}] CVSS ${cvss.toFixed(1)} — ${v.t}`)
  L.push(`- 指纹: \`${v.fp}\``)
  // W1: 七态状态轨迹(谁在何时以何理由推动了状态)
  const lt = (() => { try { return JSON.parse(String(v.lt ?? '')) } catch { return null } })()
  L.push(`- 状态: ${v.g ?? 'candidate'}${lt ? ` — ${lt.from}→${lt.to} by ${lt.actor}(${lt.reason}) @ ${String(lt.ts ?? '').slice(0, 19)}` : ''}`)
  if (v.host) L.push(`- 资产: ${v.host}${v.path}${v.param ? ` (param: ${v.param})` : ''}`)
  if (v.ed) L.push(`- 证据目录: ${v.ed}`)
  if (v.repro) L.push(`- 复现:\n\`\`\`\n${String(v.repro).slice(0, 1200)}\n\`\`\``)
  L.push(``)
}
if (advice.length) {
  L.push(`## 加固建议(单独归类, 不作漏洞结论)\n`)
  for (const a of advice) L.push(`- [${a.sev}] ${a.t}`)
}
const out = `${DATA_DIR}/evidence/src-report-${Date.now()}.md`
fs.writeFileSync(out, L.join('\n') + '\n')
for (const fp of newFps) ledger.submitted[fp] = { first_seen: now, report: out }
fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 1))
console.log(`报告 → ${out}`)
console.log(`可提交: ${newFps.length} 新 / ${vulns.length - newFps.length} 重复; 加固建议 ${advice.length} 条(独立节)`)

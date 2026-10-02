#!/usr/bin/env node
// eval-e2e-collect.mjs — EV-2 端到端评测指标采集(立项卡五指标; 按 eng 隔离只读)
// 数据面: graphd /query(findings/首信号, host token) + runs/model-usage.jsonl(worker·时长账本)
//        + runs/<eng>/run-log.jsonl(事件计数)。
// 口径注记(拍板 2 缺口径标注): model-usage 账本**无 token 数字段**(零成本配置未落账) —
// "token 账本"指标以 worker 数/角色分解/时长分布为代理面, token 数采集归后续采集面工程。
// 用法: node experiments/eval-e2e-collect.mjs --eng ev2-dvwa-1 [--out results/eval2-x.json] [--graph 8766]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const args = process.argv.slice(2)
const argOf = (k, dflt) => { const i = args.indexOf(k); return i > -1 ? (args[i + 1] ?? dflt) : dflt }
const ENG = argOf('--eng', '')
const GRAPH = argOf('--graph', '8766')
const OUT = argOf('--out', '')
const RUNS_DIR = process.env.D2D_RUNS_DIR ?? path.join(os.homedir(), '.d2d-data', 'runs')

function q(cypher, params) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const body = { cypher }
  if (params) body.params = params // Mimosa 约束: 外部输入(eng 名)一律参数绑定
  const res = execFileSync('curl', ['-s', '-m', '15', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`, '-d', JSON.stringify(body)], { encoding: 'utf8' })
  const j = JSON.parse(res)
  if (!j.ok) throw new Error(`query failed: ${String(j.error ?? '').slice(0, 160)}`)
  return j.rows ?? []
}

/** 纯函数: findings 行 → 档位/闭环/时长聚合(EV-2 五指标口径, 供单测) */
export function aggregateFindings(rows) {
  const bySeverity = {}, byGate = {}
  let verified = 0, unverified = 0, disputed = 0
  const durations = []
  const verifiedList = []
  for (const r of rows ?? []) {
    const sev = String(r.severity ?? 'unknown')
    bySeverity[sev] = (bySeverity[sev] ?? 0) + 1
    const gst = String(r.gate_status ?? 'unknown')
    byGate[gst] = (byGate[gst] ?? 0) + 1
    if (gst === 'verified') {
      verified++
      verifiedList.push({ id: r.id, severity: sev, title: String(r.title ?? '').slice(0, 120), repro_head: String(r.repro ?? '').slice(0, 160), verified_at: r.verified_at ?? '' })
    } else if (String(r.dual_sign ?? '') === 'disputed') disputed++
    else unverified++
    const t0 = Date.parse(String(r.ts ?? '')), t1 = Date.parse(String(r.verified_at ?? ''))
    if (Number.isFinite(t0) && Number.isFinite(t1) && t1 >= t0) durations.push(t1 - t0)
  }
  const denom = verified + unverified + disputed
  return {
    count: (rows ?? []).length, bySeverity, byGate,
    closureRate: denom ? Math.round((verified / denom) * 1000) / 1000 : null,
    verified, unverified, disputed, durationsMs: durations, verifiedList,
  }
}

/** 纯函数: model-usage 行(worker 前缀过滤) → worker·时长账本聚合(代理面口径) */
export function aggregateLedger(lines, engPrefix) {
  const byRole = {}, models = new Set()
  let workers = new Set(), totalMs = 0, terminals = 0
  for (const l of lines ?? []) {
    let e
    try { e = JSON.parse(l) } catch { continue }
    if (!String(e.worker ?? '').startsWith(engPrefix)) continue
    if (e.role) byRole[e.role] = (byRole[e.role] ?? 0) + 1
    if (e.model) models.add(String(e.model))
    if (e.worker) workers.add(String(e.worker))
    if (e.event === 'terminal' && Number.isFinite(Number(e.ms))) { totalMs += Number(e.ms); terminals++ }
  }
  return { workers: workers.size, terminals, totalMs, byRole, models: [...models], note: 'token 数无采集设施 — worker·时长为代理面(本批补口径)' }
}

/** 纯函数: run-log 行 → 事件计数 */
export function aggregateRunLog(lines) {
  const events = {}
  for (const l of lines ?? []) {
    let e
    try { e = JSON.parse(l) } catch { continue }
    const k = String(e.event ?? 'unknown')
    events[k] = (events[k] ?? 0) + 1
  }
  return { total: (lines ?? []).length, events }
}

async function main() {
  if (!ENG) { console.error('用法: --eng <eng 名> 必填'); process.exit(2) }
  const findings = q("MATCH (f:Finding) WHERE f.eng = $e RETURN f.id AS id, f.severity AS severity, f.gate_status AS gate_status, f.dual_sign AS dual_sign, f.title AS title, f.repro AS repro, f.ts AS ts, f.verified_at AS verified_at ORDER BY f.id", { e: ENG })
  const sig = q("MATCH (s:Signal_) WHERE s.eng = $e RETURN count(s) AS signals, min(s.ts) AS first_signal", { e: ENG })
  const exp = q("MATCH (x:Experience) WHERE x.eng_id = $e RETURN count(x) AS exps, sum(CASE WHEN x.reasoning_path <> '' THEN 1 ELSE 0 END) AS rp_non_empty", { e: ENG })
  let usageLines = [], runLogLines = []
  try { usageLines = fs.readFileSync(path.join(RUNS_DIR, 'model-usage.jsonl'), 'utf8').split('\n').filter(Boolean) } catch { }
  try { runLogLines = fs.readFileSync(path.join(RUNS_DIR, ENG, 'run-log.jsonl'), 'utf8').split('\n').filter(Boolean) } catch { }

  const report = {
    eng: ENG, collectedAt: new Date().toISOString(),
    signals: sig[0] ?? { signals: 0, first_signal: null },
    experience: { exps: Number(exp[0]?.exps ?? 0), rpNonEmpty: Number(exp[0]?.rp_non_empty ?? 0) },
    findings: aggregateFindings(findings),
    ledger: aggregateLedger(usageLines, ENG),
    runLog: aggregateRunLog(runLogLines),
  }
  if (OUT) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true })
    fs.writeFileSync(OUT, JSON.stringify(report, null, 1))
    console.log(`已写入 ${OUT}`)
  }
  console.log(JSON.stringify({ eng: report.eng, signals: report.signals.signals, findings: report.findings.count, bySeverity: report.findings.bySeverity, closureRate: report.findings.closureRate, verified: report.findings.verified, ledgerWorkers: report.ledger.workers }, null, 1))
}

// CLI 入口守卫(规范形, wmpf/match-site 先例同源) — 被 import(单测)时不触发主流程
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  if (!ENG) { console.error('用法: --eng <eng 名> 必填'); process.exit(2) }
  main().catch((e) => { console.error(`✗ ${e?.message ?? e}`); process.exit(1) })
}

#!/usr/bin/env node
// stability-view.mjs — 8-4 L1 只读稳定视图(阶段 8 收官批 T4-3-4)
// 严格只读聚合(零写零控制): 读 DATA_DIR/runs/<eng>/run-log.jsonl 尾部窗口 + graphd /query
// 只读通道(AgentIdentity 终态/Finding dual_sign 挂起面) —— L2 自适应稳定控制器撞 scheduler
// 2C 禁区维持预降级(state.md:111-112 审计登记), 本脚本是其只读替代形态, 任何写/控制冲动
// 登记 L2 候选不动手。
// 信号源(全部既有留痕面, 零补埋点):
//   runLog 事件  terminal(code≠0/崩溃类) / fence-stop(lease 心跳 CAS miss) /
//                stale-lease-write-rejected / zero-write / dual-sign-blocked-model-dead /
//                dual-sign-hetero-rejected / dual-sign-disputed
//   图内 AgentIdentity  exit_class≠'' 分组 / status='error' 计数
//   图内 Finding        dual_sign IN ('blocked','disputed') —— 人工仲裁与待解冻挂起面
// 用法:
//   node scripts/ops/stability-view.mjs [--eng <name>] [--json] [--tail <N>] [--graph <port>]
//     --eng 缺省聚合 runs/ 下全部 engagement(≤20 目录, 每文件只读尾部窗口)
//     --tail 尾部窗口行数, 缺省 2000, 上限 20000(run-log 50MB 轮转先例, 全文扫描无必要)
// 退出码: 恒 0(v1 只报告不阻断——稳定视图无门语义); graph 不可达 → 图内节置 null 继续
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

// ── 纯聚合(供 pytest/mocha 单测; 输入=已解析的窗口行/图行, 不碰 fs/net) ──────────
export const SIGNAL_EVENT_SET = new Set([
  'fence-stop', 'stale-lease-write-rejected', 'zero-write',
  'dual-sign-blocked-model-dead', 'dual-sign-hetero-rejected', 'dual-sign-disputed',
])

/** runLog 窗口行 → 事件计数(白名单集 + terminal 特判非零退出/崩溃类)。 */
export function aggregateRunlogEvents(rows) {
  const counts = {}
  for (const raw of rows ?? []) {
    const r = typeof raw === 'string' ? parseJsonlLine(raw) : raw
    if (!r || typeof r !== 'object') continue
    if (r.event === 'terminal' && (Number(r.code ?? 0) !== 0 || r.class)) {
      counts[`terminal:${String(r.class ?? 'code-nonzero')}`] = (counts[`terminal:${String(r.class ?? 'code-nonzero')}`] ?? 0) + 1
      continue
    }
    if (SIGNAL_EVENT_SET.has(r.event)) counts[r.event] = (counts[r.event] ?? 0) + 1
  }
  return counts
}

function parseJsonlLine(l) {
  try { return JSON.parse(l) } catch { return null }
}

/**
 * 三源聚合 → 稳定视图对象。
 * @param runlogByEng {Map<string, object[]>} eng → runLog 窗口行(已解析)
 * @param agentRows   {Array} /query 行 [{cls, st, n}] exit_class≠'' 分组
 * @param agentErrN   {number} status='error' 计数
 * @param findingRows {Array} /query 行 [{ds, n}] dual_sign IN ('blocked','disputed') 分组
 */
export function aggregateStability(runlogByEng, agentRows, agentErrN, findingRows) {
  const byEng = {}
  const total = {}
  for (const [eng, rows] of runlogByEng ?? []) {
    const c = aggregateRunlogEvents(rows)
    byEng[eng] = c
    for (const [k, v] of Object.entries(c)) total[k] = (total[k] ?? 0) + v
  }
  const exitClasses = {}
  for (const r of agentRows ?? []) {
    if (r?.cls) exitClasses[String(r.cls)] = (exitClasses[String(r.cls)] ?? 0) + Number(r.n ?? 0)
  }
  const dualSignPending = {}
  for (const r of findingRows ?? []) {
    if (r?.ds) dualSignPending[String(r.ds)] = (dualSignPending[String(r.ds)] ?? 0) + Number(r.n ?? 0)
  }
  return {
    generated_at: new Date().toISOString(),
    runlog_by_eng: byEng,
    runlog_total: total,
    agent_exit_classes: exitClasses,
    agent_error_count: Number(agentErrN ?? 0),
    dual_sign_pending: dualSignPending,
    note: 'L1 只读稳定视图(零写零控制; L2 控制器维持预降级) —— 信号源均为既有留痕面',
  }
}

// ── 读取面(只读: fs.readFileSync + POST /query; token 不回显) ────────────────────
const GRAPH_PORT = (() => {
  const i = process.argv.indexOf('--graph')
  return i > -1 ? (process.argv[i + 1] || '8766') : '8766'
})()
const TAIL = (() => {
  const i = process.argv.indexOf('--tail')
  const n = i > -1 ? Number(process.argv[i + 1] || '2000') : 2000
  return Math.min(Math.max(Number.isFinite(n) ? n : 2000, 10), 20000)
})()
const ENG = (() => {
  const i = process.argv.indexOf('--eng')
  return i > -1 ? String(process.argv[i + 1] || '').trim() : ''
})()
const JSON_OUT = process.argv.includes('--json')

function dataDir() {
  return process.env.D2D_DATA_DIR || `${os.homedir()}/.d2d-data`
}

/** runs/ 下 engagement 目录清单(--eng 缺省聚合全部, ≤20 目录防枚举无界)。 */
export function listEngDirs(runsBase, engFilter = ENG) {
  try {
    const all = fs.readdirSync(runsBase, { withFileTypes: true })
      .filter((d) => d.isDirectory()).map((d) => d.name)
      .filter((n) => !n.startsWith('.'))
    const picked = engFilter ? all.filter((n) => n === engFilter) : all
    return picked.slice(0, 20)
  } catch { return [] }
}

/** 尾部窗口读取(只读): 文件末尾 TAIL 行。 */
export function readTailLines(p, n = TAIL) {
  try {
    const lines = fs.readFileSync(p, 'utf8').split('\n').filter((l) => l.trim() !== '')
    return lines.slice(-n)
  } catch { return [] }
}

function hostToken() {
  if (process.env.P2P_HOST_TOKEN) return process.env.P2P_HOST_TOKEN
  try { return fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' }
}

/** graphd 只读查询(字面量 cypher; 不可达返 null —— 视图降级为 runLog 单源, 不阻断)。 */
export function graphQuery(cypher) {
  try {
    const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
      `http://127.0.0.1:${GRAPH_PORT}/query`, '-H', 'Content-Type: application/json',
      ...(hostToken() ? ['-H', `X-Auth: ${hostToken()}`] : []),
      '-d', JSON.stringify({ cypher })], { encoding: 'utf8' })
    return JSON.parse(res).rows ?? []
  } catch { return null }
}

const AGENT_EXIT_QUERY = "MATCH (a:AgentIdentity) WHERE a.exit_class <> '' RETURN a.exit_class AS cls, count(a) AS n"
const AGENT_ERR_QUERY = "MATCH (a:AgentIdentity) WHERE a.status = 'error' RETURN count(a) AS n"
const FINDING_DUAL_QUERY = "MATCH (f:Finding) WHERE f.dual_sign IN ['blocked','disputed'] RETURN f.dual_sign AS ds, count(f) AS n"

function main() {
  const runsBase = `${dataDir()}/runs`
  const byEng = new Map()
  for (const eng of listEngDirs(runsBase)) {
    byEng.set(eng, readTailLines(`${runsBase}/${eng}/run-log.jsonl`).map(parseJsonlLine).filter(Boolean))
  }
  const agentRows = graphQuery(AGENT_EXIT_QUERY)
  const agentErrRows = graphQuery(AGENT_ERR_QUERY)
  const findingRows = graphQuery(FINDING_DUAL_QUERY)
  const view = aggregateStability(
    byEng,
    agentRows,
    agentErrRows?.[0]?.n ?? 0,
    findingRows,
  )
  view.graph_reachable = agentRows !== null
  if (JSON_OUT) { console.log(JSON.stringify(view, null, 1)); return }
  console.log(`L1 只读稳定视图(窗口 ${TAIL} 行/eng; graph ${view.graph_reachable ? '可达' : '不可达——runLog 单源'})`)
  console.log(`eng 聚合: ${Object.keys(view.runlog_by_eng).length} 个`)
  for (const [eng, c] of Object.entries(view.runlog_by_eng)) {
    const sum = Object.values(c).reduce((a, b) => a + b, 0)
    console.log(`  ${eng}: 信号 ${sum} 处 ${JSON.stringify(c)}`)
  }
  console.log(`runLog 合计: ${JSON.stringify(view.runlog_total)}`)
  console.log(`AgentIdentity exit_class≠'': ${JSON.stringify(view.agent_exit_classes)} / status=error: ${view.agent_error_count}`)
  console.log(`Finding dual_sign 挂起面(blocked/disputed): ${JSON.stringify(view.dual_sign_pending)}`)
}

// 入口守卫(先例 14 规范形): 仅直接执行时跑主流程, 测试 import 不触发
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main()

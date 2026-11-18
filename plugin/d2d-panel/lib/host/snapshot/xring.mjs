// snapshot/xring.mjs — XR-P2 X-Ring 只读聚合面(拆分自 snapshot.mjs: 1074-1224, 逻辑零改动)
// 记录面外置红线(方案 §3⑦): xring/<eng>/<run-id>/events.jsonl 宿主监控进程独占写 —— 本函数纯读,
// worker 对该树不可达。fail-soft 恒不抛(xring 数据缺 = snapshot 该节缺省形态 available:false,
// 不炸面板 —— 与图查询 fail-closed 整体 503 语义刻意区分: 文件面邻居缺失是合法常态)。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { cap, num } from './const.mjs'

export const XRING = Object.freeze({
  eventTail: 50, // 事件尾窗(拍板 2: 轮询快照即可, 不做 SSE)
  maxRuns: 20, // 历史 run 列表上限(新→旧; 活跃计数在截断前统计)
  maxScan: 40, // 扫描上限(XR-P3 拍板 7 成本上界: 按 mtime 新→旧扫描, 超出部分不解析——记录树积累不拖垮轮询)
  deriveLines: 2000, // 状态推导读尾上限(预算 tick 30s/条 ≈ 一天量级; 超长 run 的 monitor-start 可能落出窗 → budget:null 降级)
  staleAfterMs: 120_000, // 心跳失联阈(budget-tick 即心跳; env P2P_XRING_STALE_MS 可调——拍板 6)
})

/** X-Ring 记录面根目录(env 可注入; 与 cli.mjs DATA_DIR 同序)。 */
export function xringRecordBase(env = process.env) {
  return env.P2P_XRING_RECORD ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/xring`
}

/** events.jsonl 单行 → wire 投影(封闭形态; 长字段截尾)。tokens/idleMs=XR-P3 运行中代理+停滞遥测。 */
function xringEventOf(r) {
  const e = { ts: String(r.ts ?? ''), event: String(r.event ?? '') }
  if (r.ok !== undefined) e.ok = r.ok === true
  if (r.reason !== undefined) e.reason = cap(r.reason, 60)
  if (r.detail !== undefined) e.detail = cap(r.detail, 160)
  if (Number.isFinite(r.tokens)) e.tokens = r.tokens
  if (Number.isFinite(r.idleMs)) e.idleMs = r.idleMs
  if (Number.isFinite(r.transcripts)) e.transcripts = r.transcripts
  return e
}

/** 单个 run 目录 → 投影(任何局部读失败 = degraded 记因继续, 不抛)。 */
function xringRunOf(eng, runId, runDir, fsImpl, nowMs, degraded, env = process.env) {
  const run = {
    eng: String(eng), runId: String(runId),
    status: 'unknown', stopReason: null, startedAt: null, elapsedSec: null,
    mode: null, budget: null, lastTick: null, artifacts: null, events: [],
  }
  let lines = []
  try {
    lines = fsImpl.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).slice(-XRING.deriveLines)
  } catch (e) {
    degraded.push(`${eng}/${runId}: events.jsonl 不可读(${String(e?.code ?? e?.message ?? e).slice(0, 60)})`)
    return run
  }
  const events = []
  for (const ln of lines) {
    try { events.push(JSON.parse(ln)) } catch { /* 坏行跳过(audit 同款语义) */ }
  }
  if (!events.length) {
    degraded.push(`${eng}/${runId}: 无可解析事件行`)
    return run
  }
  run.events = events.slice(-XRING.eventTail).map(xringEventOf)
  const start = events.find((e) => e.event === 'monitor-start')
  if (start) {
    run.budget = { maxHours: num(start.maxHours) || null, maxTokens: num(start.maxTokens) || null }
    if (start.mode !== undefined) run.mode = cap(start.mode, 20) // U2 三档（XR-P3 首事件落档）
  }
  const firstTs = Date.parse(events[0]?.ts ?? '')
  const startedMs = start ? Date.parse(start.ts ?? '') : (Number.isFinite(firstTs) ? firstTs : NaN)
  if (Number.isFinite(startedMs)) run.startedAt = new Date(startedMs).toISOString()
  const stop = [...events].reverse().find((e) => e.event === 'stop')
  run.status = stop ? 'stopped' : 'running'
  if (stop) run.stopReason = cap(stop.reason ?? '', 60) || null
  const endEv = stop ?? events[events.length - 1]
  const endMs = Date.parse(endEv?.ts ?? '')
  if (Number.isFinite(startedMs) && Number.isFinite(endMs)) {
    run.elapsedSec = +Math.max(0, ((stop ? endMs : nowMs) - startedMs) / 1000).toFixed(1)
  }
  const tick = [...events].reverse().find((e) => e.event === 'budget-tick')
  if (tick) {
    run.lastTick = { ok: tick.ok === true, detail: cap(tick.detail ?? '', 160) }
    if (Number.isFinite(tick.tokens)) run.lastTick.tokens = tick.tokens // 运行中转录尾代理（近精确）
    if (Number.isFinite(tick.idleMs)) run.lastTick.idleMs = tick.idleMs // 停滞遥测
  }
  // 工件计数(A=repro_paths.findings / B=hypotheses / C=lessons): 只在回流发生后可得 ——
  // reflow-start 事件携带 workspace 路径; 无回流 = null(计数不可得的诚实呈现, 不造 0)。
  const rs = [...events].reverse().find((e) => e.event === 'reflow-start')
  if (rs && rs.workspace) {
    const ws = String(rs.workspace)
    const count = (file, key) => {
      try {
        const doc = JSON.parse(fsImpl.readFileSync(path.join(ws, file), 'utf8'))
        return Array.isArray(doc?.[key]) ? doc[key].length : null
      } catch { return null }
    }
    const done = [...events].reverse().find((e) => e.event === 'reflow-done')
    run.artifacts = {
      A: count('repro_paths.json', 'findings'),
      B: count('hypotheses.json', 'hypotheses'),
      C: count('lessons.json', 'lessons'),
      reflow: done ? { written: num(done.written) || 0, held: num(done.held) || 0, errors: num(done.errors) || 0 } : null,
    }
  }
  // 心跳失联（拍板 6）: running 且末事件早于阈值 → stale 标记（面板降级警告+建议 stop;
  // monitor 死亡时 worker 会裸奔到自然退出——检测+警告为必做, 自动耦合杀=调查项登记）
  if (run.status === 'running') {
    const staleMs = Number(env.P2P_XRING_STALE_MS) || XRING.staleAfterMs
    const lastTs = Date.parse(events[events.length - 1]?.ts ?? '')
    if (Number.isFinite(lastTs) && nowMs - lastTs > staleMs) run.stale = { idleMs: nowMs - lastTs, thresholdMs: staleMs }
  }
  return run
}

/**
 * readXringRuns(opts, fsImpl, env) → X-Ring 记录面只读聚合。
 * 布局: <base>/<eng>/<run-id>/events.jsonl(smoke/编排层约定, runner.start recordRoot 同构)。
 * 返回 { available, base, activeCount, runs, degraded }; base 缺失 = available:false 空形态。
 */
export function readXringRuns(opts = {}, fsImpl = fs, env = process.env) {
  const base = opts.base ?? xringRecordBase(env)
  const nowMs = opts.nowMs ?? Date.now()
  const degraded = []
  let engDirs = []
  try {
    engDirs = fsImpl.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return { available: false, base, activeCount: 0, runs: [], degraded } // 无记录面 = 合法空态(尚未跑过任何 run)
  }
  const runs = []
  const candidates = []
  let scanned = 0
  let skipped = 0
  for (const eng of engDirs) {
    let runDirs = []
    try {
      runDirs = fsImpl.readdirSync(path.join(base, eng.name), { withFileTypes: true }).filter((d) => d.isDirectory())
    } catch (e) {
      degraded.push(`${eng.name}: 不可读(${String(e?.code ?? e?.message ?? e).slice(0, 60)})`)
      continue
    }
    for (const rd of runDirs) candidates.push({ eng: eng.name, runId: rd.name, dir: path.join(base, eng.name, rd.name) })
  }
  // 扫描成本上界（拍板 7）: 按 events.jsonl mtime 新→旧排序, 只解析最近 XRING.maxScan 个——
  // mtime 早退=记录树积累后老 run 不再逐次解析（活跃计数在"已扫描集合"内, cap 外 run 视为
  // 非活跃——上限 40 远大于单活跃守卫语义所需的可见窗口）
  candidates.sort((a, b) => {
    const mt = (c) => {
      try { return fsImpl.statSync(path.join(c.dir, 'events.jsonl')).mtimeMs } catch { return 0 }
    }
    return mt(b) - mt(a)
  })
  for (const c of candidates) {
    if (scanned >= XRING.maxScan) { skipped++; continue }
    scanned++
    runs.push(xringRunOf(c.eng, c.runId, c.dir, fsImpl, nowMs, degraded, env))
  }
  if (skipped > 0) degraded.push(`扫描上限 ${XRING.maxScan}: ${skipped} 个更早 run 未解析（mtime 排序截断）`)
  const activeCount = runs.filter((r) => r.status === 'running').length
  runs.sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')))
  return { available: true, base, activeCount, runs: runs.slice(0, XRING.maxRuns), degraded }
}

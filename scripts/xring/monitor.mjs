#!/usr/bin/env node
// scripts/xring/monitor.mjs — X-Ring 预算监控 skeleton（XR-P0 族 4）
// 红线（方案 §3⑦/M3）：计数器外置——本进程为宿主侧独立进程，worker 对本文件与
// 记录面均不可写（worker env 不注入路径，见族 5 启动器）；events.jsonl 本进程独占写。
// 本批=skeleton：可单测纯函数 + 轮询骨架；不接真 worker（spawn 接线归 P1）。
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'

// ---- 预算常量（方案 M1/M2/§3⑦：默认 3h/100 万，上限 6h/200 万）----
export const BUDGET_LIMITS = Object.freeze({
  maxHours: { default: 3, cap: 6 },
  maxTokens: { default: 1_000_000, cap: 2_000_000 },
})

/** 预算判定（纯函数）：超时/超 token 任一触发即停。 */
export function budgetCheck({ elapsedMs, tokensUsed, maxHours, maxTokens }) {
  const hours = elapsedMs / 3_600_000
  if (hours >= maxHours) return { ok: false, reason: 'timeout', detail: `${hours.toFixed(2)}h >= ${maxHours}h` }
  if (tokensUsed >= maxTokens) return { ok: false, reason: 'tokens', detail: `${tokensUsed} >= ${maxTokens}` }
  return { ok: true, reason: null, detail: `${hours.toFixed(2)}h/${maxHours}h, ${tokensUsed}/${maxTokens} tokens` }
}

/** 转录单行 → usage.totalTokens（非 usage 行/坏行 = 0）。 */
export function parseUsageLine(line) {
  try {
    const j = JSON.parse(line)
    return Number.isFinite(j?.usage?.totalTokens) ? j.usage.totalTokens : 0
  } catch {
    return 0
  }
}

/** 多行累计（纯函数）。 */
export function accumulateUsage(lines) {
  let total = 0
  let messages = 0
  for (const line of lines) {
    const t = parseUsageLine(line)
    if (t > 0) messages++
    total += t
  }
  return { totalTokens: total, usageMessages: messages }
}

/**
 * 转录目录 token 累计（通道①）：扫描 sessions 下全部 session.v3.jsonl.zstd，
 * unzstd 只读解压逐行累计（读取通道与仓内先例同构：adapter-dsh.mjs:101）。
 * runExec 注入点：测试传假实现；生产缺省 spawnSync('unzstd')。
 */
export function collectTranscriptUsage(sessionsDir, runExec) {
  const exec = runExec ?? ((file) => spawnSync('unzstd', ['-c', file], { maxBuffer: 2e8, encoding: 'utf8' }))
  let totalTokens = 0
  let files = 0
  let entries
  try {
    entries = fs.readdirSync(sessionsDir, { withFileTypes: true })
  } catch {
    return { totalTokens: 0, files: 0, error: `sessions 目录不可读: ${sessionsDir}` }
  }
  for (const d of entries) {
    if (!d.isDirectory()) continue
    const bucket = path.join(sessionsDir, d.name)
    for (const f of fs.readdirSync(bucket)) {
      if (!f.endsWith('.jsonl.zstd')) continue
      files++
      const r = exec(path.join(bucket, f))
      if (r.status === 0 && r.stdout) totalTokens += accumulateUsage(String(r.stdout).split('\n')).totalTokens
    }
  }
  return { totalTokens, files }
}

/** events.jsonl 追加（append-only；本进程独占写——调用方约定单写者）。 */
export function appendEvent(eventsFile, event) {
  fs.mkdirSync(path.dirname(eventsFile), { recursive: true })
  fs.appendFileSync(eventsFile, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n')
}

/** 尾读 events（status 只读投影用）。 */
export function readEvents(eventsFile, tail = 50) {
  try {
    return fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).slice(-tail)
      .map((l) => { try { return JSON.parse(l) } catch { return { bad: l } } })
  } catch {
    return []
  }
}

/**
 * 超限五步路径（方案 §3⑦）：SIGTERM → N 秒 SIGKILL → 读 workspace 已有产出 →
 * 回流 → stop 事件。本批 skeleton：kill/回流两个 IO 面注入 stub（P1 接真 worker），
 * 判定与事件写入为真实现。
 */
export function overBudgetSequence(run, { killStub = null, reflowStub = null } = {}) {
  appendEvent(run.eventsFile, { event: 'budget-exceeded', reason: run.reason, detail: run.detail })
  if (killStub) killStub('SIGTERM')
  // TODO(P1): N 秒后 SIGKILL + 组杀（detached 进程组）
  if (killStub) killStub('SIGKILL')
  // TODO(P1): 读 workspace 已有产出（repro_paths 等三 JSON 可能未达契约——回流按部分产出语义）
  if (reflowStub) reflowStub(run.workspace)
  appendEvent(run.eventsFile, { event: 'stop', reason: 'budget', detail: run.detail })
}

/**
 * 轮询骨架：每 pollIntervalMs 判定一次预算，超限走五步后退出。
 * 本批 skeleton 不 spawn worker（worker.pid/转录目录由 P1 启动器注入）。
 */
export function startMonitor(opts) {
  const { runId, eventsFile, sessionsDir, workspace, maxHours = BUDGET_LIMITS.maxHours.default,
    maxTokens = BUDGET_LIMITS.maxTokens.default, startedAt = Date.now(), pollIntervalMs = 30_000 } = opts
  for (const [k, v] of [['maxHours', maxHours], ['maxTokens', maxTokens]]) {
    if (v > BUDGET_LIMITS[k].cap) throw new Error(`${k}=${v} 超硬上限 ${BUDGET_LIMITS[k].cap}（拒绝，不 clamp）`)
  }
  appendEvent(eventsFile, { event: 'monitor-start', runId, maxHours, maxTokens })
  const timer = setInterval(() => {
    const usage = collectTranscriptUsage(sessionsDir)
    const verdict = budgetCheck({ elapsedMs: Date.now() - startedAt, tokensUsed: usage.totalTokens, maxHours, maxTokens })
    appendEvent(eventsFile, { event: 'budget-tick', ok: verdict.ok, detail: verdict.detail, transcripts: usage.files })
    if (!verdict.ok) {
      clearInterval(timer)
      overBudgetSequence({ eventsFile, workspace, reason: verdict.reason, detail: verdict.detail })
      process.exit(0)
    }
  }, pollIntervalMs)
  return { stop: () => { clearInterval(timer) } }
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirect) {
  console.log('monitor skeleton — 由启动器调用（spawn 接线归 P1）；用法见测试与本文件导出')
}

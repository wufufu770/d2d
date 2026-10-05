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

// ---- U2 共存三档（XR-P3 拍板 1；档位细目=本批提示词，方案 §五留位由本批补齐）----
// off=纯观察（监控记录照常，回流整体跳过=零图写）；queue=缺省（B/C 入 quarantine、
// A 走 verify 双签）；bypass=B/C 直接入图（落库可见性由 graphd 服务端语义决定——
// C 写入即隔离是服务端硬语义，档位不改变它）、A 级 verify 双签硬线不随档位豁免。
export const XRING_MODES = Object.freeze(['off', 'queue', 'bypass'])

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
 * 转录目录 token 累计（通道①）：递归扫 sessions 下全部 *.jsonl.zstd（真实 dsh 形态=
 * sessions/<cwd 桶>/session-<uuid>/session.v3.jsonl.zstd 三层; XR-P1 实测修——P0 版只扫
 * 两层在真形态下 files=0），unzstd 只读解压逐行累计（仓内先例同构：adapter-dsh.mjs:101）。
 * runExec 注入点：测试传假实现；生产缺省 spawnSync('unzstd')。
 */
export function collectTranscriptUsage(sessionsDir, runExec, subBucket = null) {
  const exec = runExec ?? ((file) => spawnSync('unzstd', ['-c', file], { maxBuffer: 2e8, encoding: 'utf8' }))
  let totalTokens = 0
  let files = 0
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return // 不可读子树跳过（fail-soft; 记录面外置红线=监控不因局部不可达崩）
    }
    for (const d of entries) {
      const p = path.join(dir, d.name)
      if (d.isDirectory()) walk(p)
      else if (d.name.endsWith('.jsonl.zstd')) {
        files++
        const r = exec(p)
        if (r.status === 0 && r.stdout) totalTokens += accumulateUsage(String(r.stdout).split('\n')).totalTokens
      }
    }
  }
  // subBucket: workspace 对应桶（XR-P1 smoke 实测——全量扫历史桶随运行次数线性变慢）
  walk(subBucket ? path.join(sessionsDir, subBucket) : sessionsDir)
  return { totalTokens, files }
}

/** dsh 会话桶名推导: ('/' + workspace + '/') 全 '/' → '-'（实测桶名逐字一致）。 */
export function sessionsBucketFor(workspace) {
  return ('/' + workspace + '/').replaceAll('/', '-')
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
 * 超限五步路径（方案 §3⑦）—— XR-P1 族 2 真执行版。
 * SIGTERM → killAfterMs 后 SIGKILL（detached 进程组, -pid）→ 读 workspace 已有产出 →
 * 回流（reflow 由编排层注入）→ stop 事件。killFn/reflow 注入点保留（测试 stub；
 * 缺省真执行=process.kill 组信号）。
 */
export function overBudgetSequence(run, { killFn = null, reflow = null, killAfterMs = 8000 } = {}) {
  const _kill = killFn ?? ((sig) => { try { process.kill(-run.workerPid, sig) } catch (e) { appendEvent(run.eventsFile, { event: 'kill-error', sig, error: String(e?.message ?? e).slice(0, 120) }) } })
  appendEvent(run.eventsFile, { event: 'budget-exceeded', reason: run.reason, detail: run.detail })
  _kill('SIGTERM')
  const t = setTimeout(() => _kill('SIGKILL'), killAfterMs)
  if (typeof t?.unref === 'function') t.unref()
  // 回流为异步编排: 编排层在 stop 事件后调 reflow（本函数只留事件序——五步之 3/4 由
  // runReflow 在收到 stop 后执行, 事件 stop-reflowed 随后落盘）
  appendEvent(run.eventsFile, { event: 'stop', reason: run.reason === 'user' ? 'user' : 'budget', detail: run.detail })
}

/**
 * 轮询监控（XR-P1 族 2 真进程化）：预算判定（真计时+通道①转录累计）+ stop-request 消费。
 * 返回 { stop }；超限或 stop-request 触发五步后自停（回调 onTerminate 供编排层接 reflow）。
 */
export function startMonitor(opts) {
  const { runId, eventsFile, sessionsDir, workspace, maxHours = BUDGET_LIMITS.maxHours.default,
    maxTokens = BUDGET_LIMITS.maxTokens.default, startedAt = Date.now(), pollIntervalMs = 30_000,
    workerPid = null, onTerminate = null, killAfterMs = 8000, killFn = null, mode = 'queue' } = opts
  for (const [k, v] of [['maxHours', maxHours], ['maxTokens', maxTokens]]) {
    if (v > BUDGET_LIMITS[k].cap) throw new Error(`${k}=${v} 超硬上限 ${BUDGET_LIMITS[k].cap}（拒绝，不 clamp）`)
  }
  if (!XRING_MODES.includes(mode)) throw new Error(`mode=${mode} 非法（${XRING_MODES.join('|')}）`)
  appendEvent(eventsFile, { event: 'monitor-start', runId, maxHours, maxTokens, mode })
  let terminated = false
  const timer = setInterval(() => {
    if (terminated) return
    // stop-request 消费（cli stop 唯一干预例外）
    const events = readEvents(eventsFile, 20)
    const stopReq = [...events].reverse().find((e) => e.event === 'stop-request')
    const usage = collectTranscriptUsage(sessionsDir, null, workspace ? sessionsBucketFor(workspace) : null)
    const verdict = budgetCheck({ elapsedMs: Date.now() - startedAt, tokensUsed: usage.totalTokens, maxHours, maxTokens })
    appendEvent(eventsFile, { event: 'budget-tick', ok: verdict.ok, detail: verdict.detail, transcripts: usage.files })
    if (stopReq) {
      terminated = true
      clearInterval(timer)
      overBudgetSequence({ eventsFile, workspace, workerPid, reason: 'user', detail: 'stop-request' }, { killFn, killAfterMs })
      onTerminate?.({ reason: 'user' })
      return
    }
    if (!verdict.ok) {
      terminated = true
      clearInterval(timer)
      overBudgetSequence({ eventsFile, workspace, workerPid, reason: verdict.reason, detail: verdict.detail }, { killFn, killAfterMs })
      onTerminate?.({ reason: verdict.reason })
    }
  }, pollIntervalMs)
  return { stop: () => { terminated = true; clearInterval(timer) } }
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirect) {
  console.log('monitor skeleton — 由启动器调用（spawn 接线归 P1）；用法见测试与本文件导出')
}

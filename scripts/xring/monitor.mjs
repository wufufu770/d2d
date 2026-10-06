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

/**
 * 转录单行 → usage.totalTokens（非 usage 行/坏行 = 0）。
 * XR-G2 修复: dsh v3 会话 assistant/message 行的 usage 嵌套于 `data.usage`（XR-P4 首跑实证:
 * 16 条 usage 行全在 data.usage, 顶层读 0 → token 熔断路径本形态盲, 计账恒 0）。兼容两层:
 * 顶层 usage 优先（既有语义零变化——旧会话/其他行形态）, 缺失时回退 data.usage。
 */
export function parseUsageLine(line) {
  try {
    const j = JSON.parse(line)
    const u = j?.usage ?? j?.data?.usage
    return Number.isFinite(u?.totalTokens) ? u.totalTokens : 0
  } catch {
    return 0
  }
}

/**
 * 多行累计（纯函数；语义=**逐段 delta 求和**——SC-1 族7 落地 xr-wave-wrapup 登记的精确口径）。
 * XR-P3 调查实证：dsh 转录 usage.totalTokens 为会话累计值——旧求和语义高估 ~16×
 * （探针实录: sumAll 198356 vs 真值 12149）。
 * XR-P4② 曾采 max-wins：B 层 30 样本复核发现 2 例计数器回落（会话内上下文重置/分叉后
 * 重新爬升）——max-wins 对多段合计仍低估（峰值 ≠ 各段真和）。
 * SC-1 族7 逐段 delta：单调段 delta=增量（累计值语义下 sum(delta)=末值=max-wins 等值）；
 * 回落=新段开启（delta=当前值重计）——跨段真和 ≥ max-wins 恒成立=预算熔断只早不晚。
 * 跨文件仍求和（每文件=独立会话计数器）。
 */
export function accumulateUsage(lines) {
  let total = 0
  let messages = 0
  let prev = 0
  for (const line of lines) {
    const t = parseUsageLine(line)
    if (t > 0) { messages++; total += t >= prev ? t - prev : t; prev = t } // 单调段=增量；回落=新段重计
  }
  return { totalTokens: total, usageMessages: messages }
}

/**
 * 转录目录 token 累计（通道①，XR-P3 升格=运行中近精确代理）：递归扫桶下全部
 * *.jsonl.zstd（真实 dsh 形态=sessions/<projectKey(cwd)>/session-<uuid>/session.v3.jsonl.zstd），
 * unzstd 只读解压逐行累计。dsh 源码级事实（调查实录）：追加经 200ms 批窗持久落盘
 * （enqueueLive→drainLive→appendLines fsync），转录文件运行中存在且增长、可随时解码
 * ——运行中 token 增量可得的结论推翻 P1"会话级落盘时序不可得"旧解释（该误诊实为
 * 桶名公式错+解码缺位）。runExec 注入点：测试传假实现；缺省 spawnSync('unzstd')。
 * 返回 { totalTokens, files, bytes, idleMs } — bytes/idleMs=停滞遥测（拍板 4）。
 */
export function collectTranscriptUsage(sessionsDir, runExec, subBucket = null, nowMs = Date.now()) {
  const exec = runExec ?? ((file) => spawnSync('unzstd', ['-c', file], { maxBuffer: 2e8, encoding: 'utf8' }))
  let totalTokens = 0
  let files = 0
  let bytes = 0
  let newestMtimeMs = 0
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
        try {
          const st = fs.statSync(p)
          bytes += st.size
          if (st.mtimeMs > newestMtimeMs) newestMtimeMs = st.mtimeMs
        } catch { /* stat 失败不碍解码累计 */ }
        const r = exec(p)
        if (r.status === 0 && r.stdout) totalTokens += accumulateUsage(String(r.stdout).split('\n')).totalTokens
      }
    }
  }
  // subBucket: workspace 对应桶（全量扫历史桶随运行次数线性变慢——P2 挂起根因, 恒桶限定）
  walk(subBucket ? path.join(sessionsDir, subBucket) : sessionsDir)
  return { totalTokens, files, bytes, idleMs: newestMtimeMs ? Math.max(0, nowMs - newestMtimeMs) : null }
}

/**
 * dsh 会话桶名推导（源码级对齐 dsh-session-persistence-jsonl projectKey）：
 * 分隔符（/ \ :）游程折叠为单个 '-'；[A-Za-z0-9._-] 保留；其余 → ~XXXX 十六进制转义；
 * 剥前导 '-' 后以 `--…--` 双杠包裹（截 251 字符；空串落 'root'）。
 * XR-P3 调查实证：旧 '/'+ws+'/' replaceAll 公式少一个尾杠恒 mismatch（真桶双尾杠），
 * 是 P1/P2 files=0 误诊的真因。
 * XR-P4①：按 UTF-16 码元迭代（charCodeAt，与 dsh 逐字同构）——B 层观察：for..of 码点迭代
 * 对星外平面字符（emoji 等）产生单 ~1F600 而 dsh 产 ~D83D~DE00 代理对双转义。
 */
export function sessionsBucketFor(workspace) {
  const s = String(workspace)
  let readable = ''
  let sep = false
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i)
    const ch = s[i]
    if (ch === '/' || ch === '\\' || ch === ':') {
      if (!sep) readable += '-'
      sep = true
    } else if (ch !== '~' && /^[A-Za-z0-9._-]$/.test(ch)) {
      readable += ch
      sep = false
    } else {
      readable += '~' + code.toString(16).toUpperCase().padStart(4, '0')
      sep = false
    }
  }
  return `--${(readable.replace(/^-+/, '') || 'root').slice(0, 251)}--`
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
    // token 旋钮升格（XR-P3 调查实录）: 运行中转录尾近精确（200ms 批窗+append fsync）——
    // budgetCheck 的 tokensUsed 即该值; 停滞遥测随 tick 落盘（transcriptBytes/idleMs, 拍板 4）
    appendEvent(eventsFile, { event: 'budget-tick', ok: verdict.ok, detail: verdict.detail, transcripts: usage.files, tokens: usage.totalTokens, transcriptBytes: usage.bytes, idleMs: usage.idleMs })
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

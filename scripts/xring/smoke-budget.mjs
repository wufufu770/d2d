#!/usr/bin/env node
// scripts/xring/smoke-budget.mjs — XR-P1 熔断双路径实测（零模型成本; 拍板 3 口径）
// ①超时路径: stub worker（sleep detached 组）+30s 预算 → 五步真执行（SIGTERM→SIGKILL→读 workspace→回流→stop 事件）
// ②token 路径: 预置大 usage 转录文件（会话级落盘时序下运行中增量不可得——XR-P1 实测定谳, 拍板 3 原口径）→ token 熔断
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { startMonitor, readEvents } from './monitor.mjs'

const log = (...a) => console.error('[budget-smoke]', ...a)
const results = {}

// ---------- ① 超时路径 ----------
{
  const root = fs.mkdtempSync('/tmp/xrp1-budget-timeout-')
  const record = path.join(root, 'record', 'xring', 'run-timeout')
  const workspace = path.join(record, 'workspace')
  const eventsFile = path.join(record, 'events.jsonl')
  fs.mkdirSync(workspace, { recursive: true })
  fs.writeFileSync(path.join(workspace, 'partial.txt'), '熔断前已落盘的部分产出（五步之 3 读到它）')
  // stub worker: detached 组 sleep（模拟 dsh worker 不退出）
  const stub = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  stub.unref()
  log('① stub worker pid=', stub.pid, '预算 30s')
  const t0 = Date.now()
  let term = null
  const mon = startMonitor({
    runId: 'run-timeout', eventsFile, sessionsDir: path.join(root, 'no-sessions'), workspace,
    maxHours: 3 / 3600, maxTokens: 1000000, startedAt: Date.now(), pollIntervalMs: 1000,
    workerPid: stub.pid, killAfterMs: 1500,
    onTerminate(info) { term = info },
  })
  // 等 monitor 五步完成（超时 1s 判定+killAfter 1.5s+余量）
  await new Promise((r) => setTimeout(r, 6000))
  mon.stop()
  const alive = (() => { try { process.kill(stub.pid, 0); return true } catch { return false } })()
  const evs = readEvents(eventsFile, 50).map((e) => e.event)
  const partialRead = fs.existsSync(path.join(workspace, 'partial.txt'))
  results.timeout = {
    terminated: term?.reason === 'timeout',
    workerKilled: !alive,
    events: evs,
    partialReadable: partialRead,
    elapsedSec: +((Date.now() - t0) / 1000).toFixed(1),
  }
  log('① 超时路径:', JSON.stringify(results.timeout))
}

// ---------- ② token 路径（预置大 usage 转录）----------
{
  const root = fs.mkdtempSync('/tmp/xrp1-budget-token-')
  const record = path.join(root, 'record', 'xring', 'run-tokens')
  const workspace = path.join(record, 'workspace')
  const eventsFile = path.join(record, 'events.jsonl')
  const sessionsDir = path.join(root, 'sessions')
  const bucket = path.join(sessionsDir, '--tmp-xrp1-budget-token--workspace--')
  fs.mkdirSync(bucket, { recursive: true })
  const sessDir = path.join(bucket, 'session-smoke0001')
  fs.mkdirSync(sessDir)
  // 预置大 usage 转录: 每行 totalTokens=60000 × 3 行 = 180000 > maxTokens 100000
  const lines = Array.from({ length: 3 }, (_, i) => JSON.stringify({ type: 'message', seq: i, usage: { inputTokens: 50000, outputTokens: 10000, totalTokens: 60000, cacheReadTokens: 0 } })).join('\n') + '\n'
  const raw = path.join(sessDir, 'session.v3.jsonl')
  fs.writeFileSync(raw, lines)
  execFileSync('zstd', ['-q', '-f', raw])
  fs.renameSync(raw + '.zst', raw + '.zstd')   // zstd CLI 后缀恒 .zst; dsh 产物=双 d(.zstd) — rename 对齐
  // 桶名与 startMonitor 的 sessionsBucketFor(workspace) 对齐（XR-P1 实测定式）
  const slug = ('/' + workspace + '/').replaceAll('/', '-')
  const alignedBucket = path.join(sessionsDir, slug)
  if (alignedBucket !== bucket) {
    fs.mkdirSync(path.dirname(alignedBucket), { recursive: true })
    fs.renameSync(bucket, alignedBucket)
  }
  const stub = spawn('sleep', ['300'], { detached: true, stdio: 'ignore' })
  stub.unref()
  log('② stub worker pid=', stub.pid, '预置转录 totalTokens=180000 > maxTokens=100000')
  let term = null
  const mon = startMonitor({
    runId: 'run-tokens', eventsFile, sessionsDir, workspace,
    maxHours: 6, maxTokens: 100000, startedAt: Date.now(), pollIntervalMs: 1000,
    workerPid: stub.pid, killAfterMs: 1500,
    onTerminate(info) { term = info },
  })
  await new Promise((r) => setTimeout(r, 6000))
  mon.stop()
  const alive = (() => { try { process.kill(stub.pid, 0); return true } catch { return false } })()
  const ticks = readEvents(eventsFile, 50).filter((e) => e.event === 'budget-tick')
  results.tokens = {
    terminated: term?.reason === 'tokens',
    workerKilled: !alive,
    lastTickDetail: ticks[ticks.length - 1]?.detail ?? null,
    events: readEvents(eventsFile, 50).map((e) => e.event),
  }
  log('② token 路径:', JSON.stringify(results.tokens))
}

const ok = results.timeout.terminated && results.timeout.workerKilled && results.tokens.terminated && results.tokens.workerKilled
fs.mkdirSync(path.join(new URL('.', import.meta.url).pathname, '../../experiments/results'), { recursive: true })
fs.writeFileSync(path.join(new URL('.', import.meta.url).pathname, '../../experiments/results/xrp1-smoke-budget.json'), JSON.stringify(results, null, 1))
console.log(JSON.stringify({ ok, timeout: !!results.timeout.workerKilled, tokens: !!results.tokens.workerKilled }))
process.exit(ok ? 0 : 1)

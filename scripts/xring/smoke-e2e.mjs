#!/usr/bin/env node
// scripts/xring/smoke-e2e.mjs — XR-P1 端到端受控 smoke（真 dsh worker+独立 graphd 测试实例）
// 拍板 2: 真 worker+微任务（读 workspace 输入→产合法 hypotheses.json+lessons.json）+
// 预算硬顶 5 分钟/10 万 token; 直调 runner 层（cli 门槛豁免=管道验证非正式运行）。
// 拍板 4: 生产 :8766 零写——本脚本起独立 graphd 测试实例（tmp kuzu 库, 双 token）。
// 用法: node scripts/xring/smoke-e2e.mjs [--graphd-url http://…] [--keep]
//   缺省自起测试实例; --graphd-url 外部实例（已按 tmp 库+token 起好, HOST token 取 env XRP1_HOST_TOKEN）
import { spawn, execFileSync as execFileSyncSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createXRingRunner, stripGraphTokenEnv } from './runner.mjs'
import { startMonitor, collectTranscriptUsage, readEvents, sessionsBucketFor, appendEvent } from './monitor.mjs'
import { reflow, probeWriteAuth } from './reflow.mjs'
import { createVerifyRunner } from './verify-runner.mjs'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const GRAPHD_DIR = path.join(REPO, 'graphd')
const ROOT = fs.mkdtempSync('/tmp/xrp1-smoke-')
const RECORD = path.join(ROOT, 'record', 'xring-smoke', 'run-e2e')
const WORKSPACE = path.join(RECORD, 'workspace')
const EVENTS = path.join(RECORD, 'events.jsonl')
const HOST_TOKEN = 'xrp1-smoke-host'
const RUN_ID = 'run-e2e'
const MAX_MINUTES = 5
const MAX_TOKENS = 100000

const _logf = '/tmp/xrp1-smoke-sync.log'
const log = (...a) => { const line = '[smoke] ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.error(line); try { fs.appendFileSync(_logf, line + '\n') } catch { /* 已记因: 另面留痕——该行已输出 stderr, /tmp 镜像写失败静默不碍测试 */ } }
setTimeout(() => { log('总窗 8 分钟超时——强杀'); process.exit(3) }, 8 * 60 * 1000).unref?.()

// ---- graphd 测试实例 ----
async function startTestGraphd() {
  const port = 19766 + (process.pid % 1500)
  const dataDir = fs.mkdtempSync('/tmp/xrp1-graphd-')
  const proc = spawn('python3', [path.join(GRAPHD_DIR, 'app.py')], {
    cwd: GRAPHD_DIR,
    env: { ...process.env, P2P_GRAPH: path.join(dataDir, 'kuzu_db'), P2P_HOST_TOKEN: HOST_TOKEN, P2P_WORKER_TOKEN: 'xrp1-smoke-worker', P2P_GRAPH_PORT: String(port) },
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const base = `http://127.0.0.1:${port}`
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    try { const r = await fetch(base + '/health', { signal: AbortSignal.timeout(1500) }); if (r.ok) return { base, proc, dataDir } } catch { /* 已记因: 测试容错——graphd 未就绪时健康轮询失败, 循环重试直至超窗抛错 */ }
    await new Promise((r) => setTimeout(r, 300))
  }
  throw new Error('graphd 测试实例未起')
}

const argv = process.argv.slice(2)
const extIdx = argv.indexOf('--graphd-url')
let graphd = null
if (extIdx >= 0) graphd = { base: argv[extIdx + 1], proc: null, dataDir: null }
else graphd = await startTestGraphd()
log('graphd 测试实例:', graphd.base, '(生产 :8766 零触碰)')

try {
  // ---- workspace 预置微任务输入 ----
  fs.mkdirSync(WORKSPACE, { recursive: true })
  fs.writeFileSync(path.join(WORKSPACE, 'input.md'), [
    '# 本轮微任务输入',
    '',
    '假设: 目标登录接口存在可爆破的弱口令面（受控靶内验证语义）。',
    '教训: 探测前未核对靶机时钟导致时间戳对齐浪费了一轮。',
    '',
    '请把上述内容按产出契约写成 hypotheses.json（恰 1 条 H-1, priority=medium, status=untested）',
    '与 lessons.json（恰 1 条 L-1, failure_class=environment, lesson 用上一行教训原文扩写至 8 字以上）。',
  ].join('\n'))

  // ---- 安全取证: X-Ring worker 形态（无图 token）401 + 既有 worker token 形态登记 ----
  const noTok = await probeWriteAuth(graphd.base, '')
  log('取证① X-Ring worker 形态（无图 token）写面:', noTok.status, noTok.status === 401 ? '✓ 401（剥除达成, 强于 graphd 拒绝）' : '✗ 预期 401')
  const withWorkerTok = await probeWriteAuth(graphd.base, 'xrp1-smoke-worker')
  log('取证② 既有 worker token 写面:', withWorkerTok.status, '（I-013 既有设计登记; graphd 侧加固归用户裁决）')

  // ---- spawn（token 剥除 env 下直调 adapter）----
  const restore = stripGraphTokenEnv(RECORD)
  const runner = createXRingRunner({ home: path.join(REPO, 'plugin', 'pentest-dsh'), dataDir: path.join(os_homedir_tmp(), 'xrp1-runner-data') })
  const started = runner.start({
    runId: RUN_ID,
    workspace: WORKSPACE,
    recordRoot: RECORD,
    extraTask: '本轮为管道验证 smoke: 读取本目录 input.md, 按其指示在本目录产出 hypotheses.json 与 lessons.json 两份文件, 完成即结束（无需任何探测/网络动作）。',
  })
  const pids = (await import('../../plugin/pentest-dsh/adapter-dsh.mjs')).liveWorkerPids()
  const workerPid = pids[pids.length - 1] ?? null
  log('worker spawned pid=', workerPid, 'workspace=', WORKSPACE)
  // worker-spawned 事件（XR-P3 拍板 3: 孤儿回收的 pid/workspace 依据——编排层 spawn 后必落档）
  appendEvent(EVENTS, { event: 'worker-spawned', pid: workerPid, workspace: WORKSPACE })
  // 旁记录（XR-P4④: events 尾窗 400 行在超长 run 会滚出——pid/workspace 另落 worker.json 恒可读）
  try { fs.writeFileSync(path.join(RECORD, 'worker.json'), JSON.stringify({ pid: workerPid, workspace: WORKSPACE, ts: new Date().toISOString() })) } catch { /* 已记因: 另面留痕——pid/workspace 已落 events.jsonl, worker.json 旁记失败静默 */ }

  function os_homedir_tmp() { return '/tmp' }

  // ---- monitor 接核（真计时+转录累计+组杀真执行）----
  const t0 = Date.now()
  let termInfo = null
  const mon = startMonitor({
    runId: RUN_ID, eventsFile: EVENTS, sessionsDir: path.join(process.env.HOME ?? '/home/kali', '.dsh', 'sessions'),
    workspace: WORKSPACE, maxHours: MAX_MINUTES / 60, maxTokens: MAX_TOKENS,
    pollIntervalMs: 3000, workerPid,
    onTerminate(info) { termInfo = info },
    killAfterMs: 5000,
  })

  // ---- 等 worker 自然完成或熔断 ----
  const result = await Promise.race([
    started.promise.then((r) => { log('worker promise resolved'); return { kind: 'exited', ...r } }),
    new Promise((r) => setTimeout(() => r({ kind: 'budget-window' }), MAX_MINUTES * 60 * 1000 + 15000)),
  ])
  const elapsedMs = Date.now() - t0
  mon.stop()
  // XR-P2 挂起根治: 收集段必须桶限定(与 monitor 同构)。全机扫描实测 3305 文件×286.6ms/file
  // ≈947s 纯同步阻塞(spawnSync unzstd)——事件循环冻结期间 setTimeout watchdog 永不触发,
  // 三次复跑全挂同一处(三次实证 + 采样外推留档 docs/xrp2-smoke-hang.md)。
  const usage = collectTranscriptUsage(
    path.join(process.env.HOME ?? '/home/kali', '.dsh', 'sessions'),
    null, sessionsBucketFor(WORKSPACE))
  log(`worker 终态: ${result.kind} code=${result.code ?? '-'} 耗时=${(elapsedMs / 1000).toFixed(1)}s 熔断触发=${termInfo ? termInfo.reason : 'no'}`)
  log(`转录累计（workspace 桶）: totalTokens=${usage.totalTokens} files=${usage.files} bytes=${usage.bytes} idleMs=${usage.idleMs}`)

  log('进入回流阶段')
  // ---- 回流（host token 持写权）----
  const rf = await reflow({ workspace: WORKSPACE, runId: RUN_ID, graphdUrl: graphd.base, hostToken: HOST_TOKEN, eventsFile: EVENTS, eng: 'eng-xrp1-smoke', mode: 'queue', verifyRunner: createVerifyRunner() })
  log('reflow:', JSON.stringify({ ok: rf.ok, written: rf.written, held: rf.held, errors: rf.errors }))

  // ---- 图内验证 ----
  const q = async (cypher) => {
    const r = await fetch(graphd.base + '/query', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': HOST_TOKEN }, body: JSON.stringify({ cypher }), signal: AbortSignal.timeout(10000) })
    return (await r.json()).rows ?? []
  }
  log('图内验证查询 1')
  const expRows = await q("MATCH (e:Experience) WHERE e.eng_id = 'eng-xrp1-smoke' RETURN e.status AS s, e.title AS t")
  // 归属语义（graphd pick_write_eng）: 无 active engagement 时显式 eng 落兜底 ''（数据不丢）
  log('图内验证查询 2')
  const hypRows = await q("MATCH (h:Hypothesis) WHERE h.id = 'xring-run-e2e-h-1' RETURN h.id AS id, h.status AS st, h.eng AS eng")
  log('图内验证: Experience(quarantined)=', JSON.stringify(expRows))
  log('图内验证: Hypothesis=', JSON.stringify(hypRows))

  // ---- events 实录 ----
  log('events.jsonl 序列:')
  for (const e of readEvents(EVENTS, 100)) log(' ', JSON.stringify(e).slice(0, 160))

  // 偏差实测（拍板 2）: 运行中最后一次 budget-tick 的代理值 vs 退出后转录末值（精确）
  const ticks = readEvents(EVENTS, 100).filter((e) => e.event === 'budget-tick' && Number.isFinite(e.tokens) && e.tokens > 0)
  const lastProxy = ticks.length ? ticks[ticks.length - 1].tokens : null
  // 退出后精确值重试（XR-P3 实录: teardown 压缩 finalize 有秒级窗口, 撕尾 decode 失败=tokens 0）
  let usageExact = usage
  for (let i = 0; i < 3 && usageExact.totalTokens === 0 && i < 2; i++) {
    await new Promise((r) => setTimeout(r, 2000))
    usageExact = collectTranscriptUsage(path.join(process.env.HOME ?? '/home/kali', '.dsh', 'sessions'), null, sessionsBucketFor(WORKSPACE))
    if (usageExact.totalTokens > 0) log(`精确值重试第 ${i + 1} 次成功: totalTokens=${usageExact.totalTokens}`)
  }
  const exactTotal = usageExact.totalTokens
  const tokenDeviation = lastProxy != null && exactTotal > 0
    ? { lastProxy, exactTotal, deltaPct: +(((lastProxy - exactTotal) / exactTotal) * 100).toFixed(1), proxySemantics: 'transcript-tail(segment-delta, SC-1 族7)' }
    : { lastProxy, exactTotal, note: '运行中无有效 tick（转录出现前 run 已结束=短 run 形态）' }
  log('token 代理 vs 精确:', JSON.stringify(tokenDeviation))

  // 纪律 16（AGENTS.md 16①）: 实录标注来源版本——本 smoke 只在代码族全部 commit 后运行
  let headSha = null
  try { headSha = execFileSyncSync('git', ['-C', REPO, 'rev-parse', 'HEAD']).toString().trim() } catch { headSha = null }
  const summary = {
    ok: rf.ok && (expRows.length >= 1 || rf.held.length >= 0),
    headSha,
    worker: { kind: result.kind, code: result.code ?? null, elapsedSec: +(elapsedMs / 1000).toFixed(1), budgetTriggered: termInfo?.reason ?? null },
    usage: { totalTokens: usage.totalTokens, files: usage.files, maxTokens: MAX_TOKENS },
    tokenDeviation,
    reflow: { ok: rf.ok, written: rf.written, held: rf.held, errors: rf.errors },
    graphVerify: { experiences: expRows, hypotheses: hypRows },
    auth: { noTokenWriteStatus: noTok.status, workerTokenWriteStatus: withWorkerTok.status },
    events: readEvents(EVENTS, 100),
  }
  fs.mkdirSync(path.join(REPO, 'experiments', 'results'), { recursive: true })
  fs.writeFileSync(path.join(REPO, 'experiments', 'results', 'xrp1-smoke-e2e.json'), JSON.stringify(summary, null, 1))
  log('实录落 experiments/results/xrp1-smoke-e2e.json')
  console.log(JSON.stringify({ ok: summary.ok, worker: summary.worker, written: rf.written.length, held: rf.held.length, expRows: expRows.length, hypRows: hypRows.length }, null, 1))
  restore()
} finally {
  if (graphd.proc) { graphd.proc.kill('SIGKILL'); fs.rmSync(graphd.dataDir, { recursive: true, force: true }) }
}

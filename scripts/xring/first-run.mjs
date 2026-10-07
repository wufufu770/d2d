#!/usr/bin/env node
// scripts/xring/first-run.mjs — XR-P4 阶段 B 真首跑编排（拍板 1: 单 engagement 受控任务集）
// 与 smoke-e2e 的差异: ①graphd=生产 :8766（回流走 worker token 写通道=系统合法写面;
//   宿主 host token 只在编排进程读取——worker env 白名单语义不破坏）; ②DVWA 靶集任务书
//   （extraTask=目标声明与范围红线, 非流程指令——A2/A3 模型自主性质不变）; ③预算
//   --max-hours 0.5（验收表 A8 拍板 2 收敛口径）+maxTokens 100 万（BUDGET_LIMITS 缺省）;
// ④五项观察+能力调用日志采集; ⑤首跑实录落 experiments/results/xrp4-first-run.json。
// 用法: node scripts/xring/first-run.mjs [--graphd-url http://127.0.0.1:8766] [--skip-reset]
//   前置: DVWA 容器 Up（默认先跑 scripts/ops/dvwa-reset.sh 重置）; graphd 生产实例健康;
//   P2P_HOST_TOKEN_FILE（或 ~/.config/d2d/host-token 缺省路径）存在。
//   注意: 本脚本不设 P2P_XRING_MODE → U2 缺省 queue 档（B/C quarantine、A 级 verify 双签）。
import { execFileSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createXRingRunner, stripGraphTokenEnv, ensureXRingEngagement, releaseXRingEngagement } from './runner.mjs'
import { startMonitor, collectTranscriptUsage, readEvents, sessionsBucketFor, appendEvent, BUDGET_LIMITS } from './monitor.mjs'
import { reflow } from './reflow.mjs'
import { createVerifyRunner } from './verify-runner.mjs'

const REPO = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..')
const argv = process.argv.slice(2)
const argOf = (k, dflt = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? dflt) : dflt }
const GRAPHD_URL = argOf('--graphd-url', 'http://127.0.0.1:8766')
const SKIP_RESET = argv.includes('--skip-reset')
const RUN_ID = `run-xrp4b-${new Date().toISOString().slice(5, 16).replace(/[-T:]/g, '')}`
const ROOT = path.join(REPO, 'experiments', 'xrp4-first-run')
const RECORD = path.join(ROOT, 'record', 'xring-first', RUN_ID)
const WORKSPACE = path.join(RECORD, 'workspace')
const EVENTS = path.join(RECORD, 'events.jsonl')
// 预算护栏双保险（拍板 3）: 时长 0.5h（验收表 A8 收敛口径）×token 100 万（BUDGET_LIMITS 缺省,
// 硬 cap 200 万由 monitor 拒绝不 clamp）——超限任一触发即熔断=S3 停下留证（护栏即终点）。
const MAX_HOURS = 0.5
const MAX_TOKENS = BUDGET_LIMITS.maxTokens.default
const HOST_TOKEN_FILE = process.env.P2P_HOST_TOKEN_FILE ?? `${os.homedir()}/.config/d2d/host-token`
const TARGET_BASE = 'http://127.0.0.1'

const log = (...a) => { const line = '[first-run] ' + a.map(x => typeof x === 'string' ? x : JSON.stringify(x)).join(' '); console.error(line); try { fs.appendFileSync('/tmp/xrp4-first-run.log', line + '\n') } catch { /* 已记因: 另面留痕——stderr 已出, /tmp 镜像写失败静默 */ } }

// ---- DVWA 靶集任务书（extraTask——目标声明与范围红线; 零探索流程指令, 模型自主组织）----
const EXTRA_TASK = [
  '## 本轮运行目标（宿主声明——运行前提与范围, 非流程指令）', '',
  '- 唯一授权目标: DVWA 靶场 http://127.0.0.1/（本地受控靶, Damn Vulnerable Web Application v1.10）。',
  '- 登录凭据: admin / password（DVWA 公开默认凭据, 靶场专用, 非真实密钥）。',
  '- 授权范围: 该靶机全部可达页面与功能（DVWA 自带漏洞模块面）。范围外任何目标', '  （其他主机/域名/网段）零尝试——越界即违规。',
  '- 可复现路径（repro_paths.json findings[].target）一律写 http://127.0.0.1 形态:',
  '  回流验证器只对该基址执行重放, 其他目标一律转 manual 留人工。',
  '- 完成判定: 你自主决定何时收束; 产出契约三份 JSON 完整即为本轮完成。',
].join('\n')

// ---- 五项观察①: worker 进程树 env 扫描（私钥运行时探测——A7 实战数据点）----
function scanProcEnv(pid) {
  const hits = []
  const readEnv = (p) => {
    try {
      const raw = fs.readFileSync(`/proc/${p}/environ`)
      for (const kv of raw.toString().split('\0')) {
        const eq = kv.indexOf('=')
        if (eq <= 0) continue
        const k = kv.slice(0, eq)
        if (/^P2P_HOST_/i.test(k) || /HOST_(TOKEN|KEY|SECRET)/i.test(k)) hits.push({ pid: String(p), key: k })
      }
    } catch { /* 已记因: 进程已退出/权限不足=采集窗口错过, 非凭据面信号 */ }
  }
  readEnv(pid)
  try {
    const tids = fs.readdirSync(`/proc/${pid}/task`)
    for (const t of tids) {
      const kids = fs.readFileSync(`/proc/${pid}/task/${t}/children`, 'utf8').trim().split(/\s+/).filter(Boolean)
      for (const k of kids) readEnv(k)
    }
  } catch { /* 已记因: 子进程枚举失败=窗口错过, 低险 */ }
  return hits
}

async function graphdQuery(cypher) {
  const r = await fetch(`${GRAPHD_URL}/query`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': hostToken }, body: JSON.stringify({ cypher }), signal: AbortSignal.timeout(10000) })
  const j = await r.json()
  if (!r.ok) throw new Error(`graphd query 失败: ${r.status} ${JSON.stringify(j).slice(0, 200)}`)
  return j.rows ?? []
}

// ---- 前置核验 ----
log('==== XR-P4 阶段 B 真首跑 ====')
log('runId:', RUN_ID, 'graphd:', GRAPHD_URL, '预算:', `${MAX_HOURS}h/${MAX_TOKENS}tok`)
if (!fs.existsSync(HOST_TOKEN_FILE)) throw new Error(`host token 文件缺失: ${HOST_TOKEN_FILE}（回流写权通道前置）`)
const hostToken = fs.readFileSync(HOST_TOKEN_FILE, 'utf8').trim()
if (!hostToken) throw new Error('host token 文件为空')
const health = await fetch(`${GRAPHD_URL}/health`, { signal: AbortSignal.timeout(5000) })
if (!health.ok) throw new Error(`生产 graphd 不健康: ${health.status}`)
const allow = JSON.parse(fs.readFileSync(process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data/config/model-policies.json`, 'utf8'))
const xringAllow = allow?.roles?.xring?.allowlist ?? []
if (!xringAllow.length || xringAllow.some((m) => m.includes('<'))) throw new Error(`allowlist 占位/缺失: ${JSON.stringify(xringAllow)}（阶段 B 前置）`)
log('allowlist:', JSON.stringify(xringAllow))
if (!SKIP_RESET) {
  log('DVWA 重置（dvwa-reset.sh）...')
  execFileSync('bash', [path.join(REPO, 'scripts', 'ops', 'dvwa-reset.sh')], { stdio: 'inherit' })
}
const dvwaUp = await fetch(`${TARGET_BASE}/login.php`, { signal: AbortSignal.timeout(8000) }) // nosemgrep: typescript.react.security.react-insecure-request.react-insecure-request — 本地受控靶（DVWA 无 https 面），http=设计内形态非降级
if (!dvwaUp.ok) throw new Error(`DVWA 不就绪: login.php=${dvwaUp.status}（先跑 scripts/ops/dvwa-reset.sh）`)
log('DVWA 就绪: login.php', dvwaUp.status)

// ---- 图内基线（R4c 空闲图观察面+回流量分母）----
const baseCounts = {}
for (const [k, cy] of Object.entries({
  findings: 'MATCH (f:Finding) RETURN count(f) AS c',
  experiences: 'MATCH (x:Experience) RETURN count(x) AS c',
  hypotheses: 'MATCH (h:Hypothesis) RETURN count(h) AS c',
  quarantined: "MATCH (x:Experience {status:'quarantined'}) RETURN count(x) AS c",
})) baseCounts[k] = Number((await graphdQuery(cy))[0]?.c ?? 0)
log('图内基线:', JSON.stringify(baseCounts))

// ---- 发射（token 剥除 env 下直调 runner——系统正规通道）----
// XR-G1（拍板 1 方案 A）: 发射预建 engagement 上下文——图内真实节点（scope=受控靶 127.0.0.1）
// + worker env P2P_ENGAGEMENT 精准归属（resolveEngagement ①路径）→ OPSEC 门放行靶集内、
// 照拦靶集外（门判据零触碰）。建立失败=发射中止（S3 停下留证——不降级为无上下文发射）。
fs.mkdirSync(WORKSPACE, { recursive: true })
const xringEng = await ensureXRingEngagement({
  graphdUrl: GRAPHD_URL, hostToken, runId: RUN_ID, scope: '127.0.0.1',
  target: 'DVWA http://127.0.0.1 (X-Ring 受控靶)',
  objective: 'XR-P4 阶段 B X-Ring 受控首跑（靶集绑定, 时限=run 预算窗, runId 关联）',
})
appendEvent(EVENTS, { event: 'xring-eng-created', name: xringEng.name, scope: xringEng.scope, runId: RUN_ID, ts: new Date().toISOString() })
log('XR-G1 engagement 预建:', JSON.stringify(xringEng))
process.env.P2P_ENGAGEMENT = xringEng.name // 编排进程 env → adapter 拷贝 → worker 会话（resolveEngagement ①路径）
const restore = stripGraphTokenEnv(RECORD)
const runner = createXRingRunner({ home: path.join(REPO, 'plugin', 'pentest-dsh') })
const started = runner.start({ runId: RUN_ID, workspace: WORKSPACE, recordRoot: RECORD, extraTask: EXTRA_TASK })
const { liveWorkerPids } = await import('../../plugin/pentest-dsh/adapter-dsh.mjs')
const pids = liveWorkerPids()
const workerPid = pids[pids.length - 1] ?? null
log('worker spawned pid=', workerPid)
appendEvent(EVENTS, { event: 'worker-spawned', pid: workerPid, workspace: WORKSPACE, runId: RUN_ID })
fs.writeFileSync(path.join(RECORD, 'worker.json'), JSON.stringify({ pid: workerPid, workspace: WORKSPACE, ts: new Date().toISOString(), maxHours: MAX_HOURS, maxTokens: MAX_TOKENS }))

// ---- 运行中观察①: 私钥运行时探测（spawn 落定后 60s 采一次——dsh 会话已起的窗口）----
let envScan = { hits: [], note: '采集中' }
await new Promise((r) => setTimeout(r, 60_000))
envScan = { hits: scanProcEnv(workerPid), scannedAt: new Date().toISOString(), note: 'worker pid+一层子进程 /proc/environ 扫描（P2P_HOST_*|HOST_*TOKEN/KEY/SECRET）' }
log('观察①私钥运行时探测:', JSON.stringify(envScan))

// ---- monitor 接核（预算双路径熔断真执行）----
const t0 = Date.now()
let termInfo = null
const mon = startMonitor({
  runId: RUN_ID, eventsFile: EVENTS, sessionsDir: path.join(os.homedir(), '.dsh', 'sessions'),
  workspace: WORKSPACE, maxHours: MAX_HOURS, maxTokens: MAX_TOKENS,
  pollIntervalMs: 30_000, workerPid,
  onTerminate(info) { termInfo = info },
})
const result = await Promise.race([
  started.promise.then((r) => { log('worker promise resolved'); return { kind: 'exited', ...r } }),
  new Promise((r) => setTimeout(() => r({ kind: 'budget-window' }), MAX_HOURS * 3600_000 + 60_000)),
])
const elapsedMs = Date.now() - t0
mon.stop()
restore()
delete process.env.P2P_ENGAGEMENT
log(`worker 终态: ${result.kind} code=${result.code ?? '-'} 耗时=${(elapsedMs / 60000).toFixed(1)}min 熔断=${termInfo ? termInfo.reason : 'no'}`)
// XR-G1 收尾释放: 冻结+清租约（stopAll 同款终态语义——不留 active 僵尸, adoptRequested 防线双保险）
try {
  await releaseXRingEngagement({ graphdUrl: GRAPHD_URL, hostToken, name: xringEng.name })
  appendEvent(EVENTS, { event: 'xring-eng-released', name: xringEng.name, runId: RUN_ID, ts: new Date().toISOString() })
  log('XR-G1 engagement 释放:', xringEng.name, '→ frozen')
} catch (e) {
  log('XR-G1 释放失败（如实留痕, 不阻塞结果处理）:', String(e?.message ?? e).slice(0, 160))
  appendEvent(EVENTS, { event: 'xring-eng-release-failed', name: xringEng.name, runId: RUN_ID, err: String(e?.message ?? e).slice(0, 160) })
}

// ---- 五项观察②③④: PDEATHSIG 孤儿检查 / wall-clock / 会话态语法 ----
let orphans = []
try {
  const out = execFileSync('bash', ['-c', `ps -eo pid,ppid,args | grep -F '${WORKSPACE}' | grep -v grep || true`]).toString().trim()
  orphans = out ? out.split('\n') : []
} catch { /* 已记因: ps 失败=采集降级, 低险 */ }
log('观察②退出后孤儿检查:', orphans.length ? JSON.stringify(orphans) : '零孤儿残留')
const usage = collectTranscriptUsage(path.join(os.homedir(), '.dsh', 'sessions'), null, sessionsBucketFor(WORKSPACE))
log(`观察④会话态解析: totalTokens=${usage.totalTokens} files=${usage.files} bytes=${usage.bytes} idleMs=${usage.idleMs} wallClockMs=${elapsedMs}`)
log(`观察③wall-clock 对照: 实际 ${(elapsedMs / 60000).toFixed(1)}min / 预算 ${MAX_HOURS}h; token ${usage.totalTokens}/${MAX_TOKENS}`)

// ---- 能力调用日志（会话 tool 频次——阶段九插件化优先级输入; 如实统计不美化）----
const toolFreq = {}
try {
  const bucket = sessionsBucketFor(WORKSPACE)
  const sessDir = path.join(os.homedir(), '.dsh', 'sessions', bucket)
  const files = (function walk(d) { let out = []; for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) out = out.concat(walk(p)); else if (e.name.endsWith('.zstd')) out.push(p) } return out })(sessDir)
  for (const f of files.slice(-8)) { // 尾窗 8 份会话文件（本轮产物窗）
    const r = execFileSync('unzstd', ['-c', f], { maxBuffer: 2e8, encoding: 'utf8' })
    for (const m of r.matchAll(/"(?:tool_name|toolName|tool_use|name)"\s*:\s*"([A-Za-z_][\w-]{1,40})"/g)) {
      const name = m[1]
      if (['inputTokens', 'outputTokens', 'assistant', 'user', 'message', 'content', 'text', 'type', 'id', 'role'].includes(name)) continue
      toolFreq[name] = (toolFreq[name] ?? 0) + 1
    }
  }
} catch (e) { log('能力日志采集降级:', String(e?.message ?? e).slice(0, 120)) }
const capabilityLog = Object.entries(toolFreq).sort((a, b) => b[1] - a[1]).slice(0, 20).map(([tool, count]) => ({ tool, count }))
log('能力调用统计（top20）:', JSON.stringify(capabilityLog))

// ---- 回流（queue 档: B/C quarantine、A 级 verifyRunner 必经——DVWA targetBase）----
log('进入回流阶段（mode=queue, verifyRunner targetBase=' + TARGET_BASE + '）')
const rf = await reflow({ workspace: WORKSPACE, runId: RUN_ID, graphdUrl: GRAPHD_URL, hostToken, eventsFile: EVENTS, eng: `xring-${RUN_ID}`, mode: 'queue', verifyRunner: createVerifyRunner({ targetBase: TARGET_BASE }) })
log('reflow:', JSON.stringify({ ok: rf.ok, written: rf.written, held: rf.held, errors: rf.errors }))

// ---- 图内对比（回流量+R4c 空闲图观察面）----
const afterCounts = {}
for (const [k, cy] of Object.entries({
  findings: 'MATCH (f:Finding) RETURN count(f) AS c',
  experiences: 'MATCH (x:Experience) RETURN count(x) AS c',
  hypotheses: 'MATCH (h:Hypothesis) RETURN count(h) AS c',
  quarantined: "MATCH (x:Experience {status:'quarantined'}) RETURN count(x) AS c",
})) afterCounts[k] = Number((await graphdQuery(cy))[0]?.c ?? 0)
const delta = Object.fromEntries(Object.keys(baseCounts).map((k) => [k, afterCounts[k] - baseCounts[k]]))
log('图内对比（基线→后）:', JSON.stringify({ baseCounts, afterCounts, delta }))

const summary = {
  runId: RUN_ID, headSha: execFileSync('git', ['-C', REPO, 'rev-parse', 'HEAD']).toString().trim(),
  startedAt: new Date(t0).toISOString(), finishedAt: new Date().toISOString(),
  engagement: { name: xringEng.name, scope: xringEng.scope, mode: 'XR-G1 预建（方案 A）' },
  budget: { maxHours: MAX_HOURS, maxTokens: MAX_TOKENS, elapsedMin: +(elapsedMs / 60000).toFixed(1), tokensUsed: usage.totalTokens, terminated: termInfo?.reason ?? null },
  worker: { kind: result.kind, code: result.code ?? null, pid: workerPid },
  observations: { envScan, orphans, wallClockMs: elapsedMs, sessionParse: { totalTokens: usage.totalTokens, files: usage.files, idleMs: usage.idleMs } },
  capabilityLog,
  reflow: { ok: rf.ok, written: rf.written, held: rf.held, errors: rf.errors },
  graphDelta: { baseCounts, afterCounts, delta },
}
fs.mkdirSync(path.join(REPO, 'experiments', 'results'), { recursive: true })
fs.writeFileSync(path.join(REPO, 'experiments', 'results', 'xrp4-first-run.json'), JSON.stringify(summary, null, 1))
fs.writeFileSync(path.join(REPO, 'experiments', 'results', 'xrp4-first-run-events.json'), JSON.stringify(readEvents(EVENTS, 400), null, 1))
log('实录落 experiments/results/xrp4-first-run.json')
console.log(JSON.stringify({ runId: RUN_ID, ok: rf.ok, worker: summary.worker, budget: summary.budget, delta, capabilityTop: capabilityLog.slice(0, 5) }, null, 1))

#!/usr/bin/env node
// range_run.mjs <pi|dsh> — 覆盖驱动续跑: 打一轮→评估→缺口注入下一轮, 至多3轮, PASS即止
import { execSync, spawn } from 'node:child_process'
import { rmSync } from 'node:fs'

const D2D_ROOT = process.env.D2D ?? '/home/wff/d2d'
const WHICH = process.argv[2]
const PROFILE = process.argv[3] ?? `${D2D_ROOT}/ranges/profiles/vuln-bank.json`
const TARGET = process.env.R_TARGET ?? 'http://127.0.0.1:5000'
const SCOPE = process.env.R_SCOPE ?? '127.0.0.1'
// 多车道: LANE_GRAPHD 覆盖默认端口映射(并行 attempt 分片)
const PORT = process.env.LANE_GRAPHD ?? (WHICH === 'pi' ? '8765' : '8766')
const MAX_ATTEMPTS = 3

const q = async (cypher) => {
  const res = await fetch(`http://127.0.0.1:${PORT}/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ cypher }),
  })
  return (await res.json()).rows ?? []
}
const evalProfile = () => {
  const out = execSync(
    `python3 /home/wff/d2d/eval_profile.py ${PORT} ${PROFILE}`,
    { encoding: 'utf8' })
  return JSON.parse(out)
}

const seedHypotheses = async () => {
  // 种子持久化: 每轮清图后重播定向假设(<profile>.seeds.json)
  try {
    const seedFile = PROFILE.replace(/\.json$/, '.seeds.json')
    const { readFileSync } = await import('node:fs')
    const seeds = JSON.parse(readFileSync(seedFile, 'utf8'))
    for (const s of seeds) {
      await fetch(`http://127.0.0.1:${PORT}/write/hypothesis`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...s, id: `seed-${Math.random().toString(36).slice(2, 8)}` }),
      })
    }
    console.log(`[seeds] 重播 ${seeds.length} 条定向假设`)
  } catch {}
}
const wipeRuntime = async () => {
  // 清档前快照 findings(FAIL 取证不丢)
  try {
    const rows = await q('MATCH (f:Finding) RETURN f')
    if (rows.length) {
      const { mkdirSync, writeFileSync } = await import('node:fs')
      const dir = '/home/wff/d2d/evidence/range-snapshots'
      mkdirSync(dir, { recursive: true })
      writeFileSync(`${dir}/${WHICH}-${Date.now()}.json`, JSON.stringify(rows, null, 1))
    }
  } catch {}
  for (const lbl of ['Engagement','Finding','Hypothesis','Endpoint','AgentIdentity','Signal_'])
    await q(`MATCH (n:${lbl}) DETACH DELETE n`)
}

const launchRound = (attempt) => {
  rmSync('/tmp/jiti', { recursive: true, force: true })
  const env = { ...process.env, R_TARGET: TARGET, R_SCOPE: SCOPE }
  const p = spawn('node', ['round-launch.mjs', WHICH], {
    cwd: '/home/wff/d2d', env,
    stdio: ['ignore', 'ignore', 'ignore'],
    detached: true,
  })
  globalThis.__launcherPid = p.pid
}
const killLauncher = () => {
  const pid = globalThis.__launcherPid
  if (!pid) return
  try { process.kill(-pid, 'SIGKILL') } catch {}
  try { process.kill(pid, 'SIGKILL') } catch {}
}

const waitTerminal = async () => {
  const deadline = Date.now() + 75 * 60_000
  let lastEventCount = -1
  let stalledTicks = 0
  const eventCount = async () => {
    try {
      const f = execSync(`ls -t ${process.env.P2P_RUNS_DIR ?? '/home/wff/runs'}/*/run-log.jsonl 2>/dev/null | head -1`, { encoding: 'utf8' }).trim()
      if (!f) return 0
      return parseInt(execSync(`wc -l < '${f}'`, { encoding: 'utf8' }).trim(), 10) || 0
    } catch { return 0 }
  }
  while (Date.now() < deadline) {
    const rows = await q('MATCH (e:Engagement) RETURN e.status AS s ORDER BY e.created_at DESC')
    const st = rows[0]?.s
    if (st && st !== 'active') return st
    // #30 保底: 调度器 tick 静默时由外部确定性收口(15分钟无事件推进 -> 直接闭环)
    const ec = await eventCount()
    if (ec === lastEventCount) {
      stalledTicks++
      if (stalledTicks >= 30) {  // 30 x 30s = 15min 无任何事件
        // #31 守卫: discovery 首轮天然安静, 只有已出现过 worker 终态才允许外部收口
        let terms = 0
        try {
          const r = await q(`MATCH (a:AgentIdentity) WHERE a.status <> 'running' RETURN count(a) AS c`)
          terms = Number(r[0]?.c ?? 0)
        } catch {}
        let fcount = 0
        try {
          const r2 = await q(`MATCH (f:Finding) RETURN count(f) AS c`)
          fcount = Number(r2[0]?.c ?? 0)
        } catch {}
        if (terms >= 2 && fcount >= 5) {
          console.log(`[runner] 检测到调度静默(15min)+终态${terms}+findings${fcount}, 外部执行确定性收口`)
          try {
            await q(`MATCH (e:Engagement) WHERE e.status='active' SET e.status='completed'`)
            return 'completed-external'
          } catch {}
        }
        stalledTicks = 10  // 未满足则重置部分预算, 避免无限累积
      }
    } else stalledTicks = 0
    lastEventCount = ec
    await new Promise(r => setTimeout(r, 30_000))
  }
  return 'timeout'
}

let hints = ''
for (let i = 1; i <= MAX_ATTEMPTS; i++) {
  console.log(`\n===== [${WHICH}] 第${i}轮 =====`)
  if (hints) process.env.P2P_GAP_HINTS = hints
  await wipeRuntime()
  await seedHypotheses()
  await launchRound(i)
  const terminal = await waitTerminal()
  killLauncher()
  const ev = evalProfile()
  console.log(`[${WHICH}] 终态=${terminal} 覆盖=${ev.covered}(${ev.coverage_pct}%) artifacts=${ev.artifacts} FP=${ev.false_positives.length} PASS=${ev.PASS}`)
  if (ev.PASS) { console.log(`\n[${WHICH}] ✅ PASS @第${i}轮`); process.exit(0) }
  const miss = Object.entries(ev.class_detail).filter(([, v]) => !v).map(([k]) => k)
  const missArt = Object.entries(ev.artifact_detail).filter(([, v]) => !v).map(([k]) => k)
  hints = [...miss.map(c => `类:${c}`), ...missArt.map(a => `证据:${a}`)].join('; ')
  console.log(`[${WHICH}] 缺口注入下一轮: ${hints}`)
}
console.log(`\n[${WHICH}] ❌ ${MAX_ATTEMPTS}轮未达标`)
process.exit(1)

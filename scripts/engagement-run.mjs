#!/usr/bin/env node
// engagement-run.mjs — W5 多开 runner: 一个进程认领并跑完一个 engagement
// 由调度器 adoptRequested(忙时)或手工启动: node scripts/engagement-run.mjs --name eng-0906-...
// 节点 lifecycle: 面板/dsh 写 status='requested'(新建或 frozen→resume) → 本脚本读节点参数
// → startEngagement({adoptName}) 置 active 并阻塞调度到终态 → 退出。SIGTERM/SIGINT 走 stopAll
// 标准冻结(cancel 令牌 + per-eng 暂停文件 + 交接摘要), 不留僵尸 active。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const name = (() => {
  const i = process.argv.indexOf('--name')
  const v = i !== -1 ? process.argv[i + 1] : ''
  return String(v ?? process.env.P2P_ENGAGEMENT ?? '').trim()
})()
if (!name) {
  console.error('[runner] 用法: engagement-run.mjs --name <engagement 名>(或 P2P_ENGAGEMENT env)')
  process.exit(2)
}

const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const _tokFile = process.env.P2P_HOST_TOKEN_FILE ?? `${os.homedir()}/.config/d2d/host-token`
const TOKEN = (() => { try { return fs.readFileSync(_tokFile, 'utf8').trim() } catch { return '' } })()

async function q(cypher, params = {}) {
  const res = await fetch(`${GRAPHD}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'X-Auth': TOKEN } : {}) },
    body: JSON.stringify({ cypher, params }),
    signal: AbortSignal.timeout(8000),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) throw new Error(`graphd: ${data?.error ?? `http ${res.status}`}`)
  return data.rows ?? []
}

// 节点参数: target/scope/instances/objective 全在图上(start/resume 写入), 此处只读不改
const rows = await q(`MATCH (e:Engagement {name:$n}) RETURN e.target AS t, e.scope AS s, e.instances AS i, e.objective AS o, e.status AS st`, { n: name })
if (!rows?.length) {
  console.error(`[runner] engagement 不存在: ${name}`)
  process.exit(3)
}
const eng = rows[0]
if (String(eng.st) !== 'requested') {
  console.error(`[runner] ${name} 状态为 ${eng.st}(需 requested) — 不重复认领`)
  process.exit(4)
}

const { createDshAdapter } = await import(`${REPO}/plugin/pentest-dsh/adapter-dsh.mjs`)
const { createScheduler } = await import(`${REPO}/plugin/pentest-dsh/scheduler.js`)
const adapter = createDshAdapter({ home: process.env.D2D ?? REPO, osHome: os.homedir() })
const sched = createScheduler(adapter, {
  graphdUrl: GRAPHD,
  coreDir: `${REPO}/plugin/pentest-dsh`,
  home: process.env.D2D ?? REPO,
})

let stopping = false
const shutdown = async (sig) => {
  if (stopping) return
  stopping = true
  console.log(`[runner] ${sig} → stopAll(标准冻结)`)
  try { await sched.stopAll() } catch (e) { console.error('[runner] stopAll:', e?.message) }
  process.exit(0)
}
process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))

console.log(`[runner] 认领 ${name}: target=${eng.t} instances=${eng.i ?? 2}`)
try {
  const result = await sched.startEngagement(
    String(eng.t ?? ''), String(eng.s ?? ''), Number(eng.i) || 2, String(eng.o ?? ''),
    { adoptName: name },
  )
  console.log('[runner] 终态:', result)
} catch (e) {
  console.error('[runner] 启动失败:', e?.message)
  // 认领失败置 superseded(与 in-process 采纳同口径), 面板可见, 队列不堆积
  await q(`MATCH (e:Engagement {name:$n}) SET e.status='superseded'`, { n: name }).catch(() => {})
  process.exit(5)
}
process.exit(0)

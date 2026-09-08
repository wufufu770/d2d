#!/usr/bin/env node
// graphd-preflight.mjs — graphd 守护自愈预检(P3/M8, Bazel「只杀自己人」/ Gradle「版本隔离」采纳):
//   ①健康实例且版本匹配 → 复用 ②健康但版本不符(stale 旧实例) → 三重校验全中才接管:
//      pidfile 记录的 pid 存活 + /proc/<pid>/stat starttime 与记录一致(防 pid 复用) + /health 版本握手
//      → SIGTERM 优雅停(kuzu WAL, ≤6s) → 重启新实例 ③任一不符 = 外来者 → 不杀, 换端口(8766+n)。
//   端口空闲 → 直接启动新实例并登记 pidfile。
// 用法: node scripts/ops/graphd-preflight.mjs --repo /path/to/d2d [--port 8766]
// 输出(末行, 供 shell eval): GRAPHD_URL=http://127.0.0.1:<port>
// exit: 0=就绪(复用或新启) / 2=连续多端口都被外来者占用 / 3=启动失败
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'

const argOf = (k, dflt = '') => { const i = process.argv.indexOf(k); return i > -1 ? String(process.argv[i + 1] ?? '') : dflt }
const REPO = argOf('--repo', process.env.D2D ?? path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..'))
const GRAPHD_DIR = path.join(REPO, 'graphd')
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const PIDFILE = `${os.homedir()}/.config/d2d/graphd.json`
const BASE_PORT = parseInt(argOf('--port', process.env.GRAPHD_PORT ?? '8766'), 10)
const MAX_PORT_TRIES = 5

// 版本真源: graphd/app.py 的 VERSION 常量(与 /health 握手比对)
const expectedVersion = (() => {
  const m = fs.readFileSync(path.join(GRAPHD_DIR, 'app.py'), 'utf8').match(/^VERSION\s*=\s*"([^"]+)"/m)
  return m ? m[1] : 'unknown'
})()

const readPidfile = () => { try { return JSON.parse(fs.readFileSync(PIDFILE, 'utf8')) } catch { return null } }
const writePidfile = (rec) => { fs.mkdirSync(path.dirname(PIDFILE), { recursive: true }); fs.writeFileSync(PIDFILE, JSON.stringify(rec, null, 2)) }

// /proc/<pid>/stat 第 22 字段 starttime(时钟 tick) — comm 含空格时括号后取, 防 pid 复用误判
const procStarttime = (pid) => {
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, 'utf8')
    return stat.slice(stat.lastIndexOf(')') + 2).trim().split(/\s+/)[19]
  } catch { return null }
}
const alive = (pid) => { try { process.kill(pid, 0); return true } catch { return false } }

const health = (port) => new Promise((resolve) => {
  const req = fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(2500) })
    .then((r) => r.json()).then((j) => resolve(j?.ok ? j : null)).catch(() => resolve(null))
})
const portBusy = (port) => new Promise((resolve) => {
  const s = net.connect(port, '127.0.0.1')
  s.on('connect', () => { s.destroy(); resolve(true) })
  s.on('error', () => resolve(false))
  s.setTimeout(1500, () => { s.destroy(); resolve(false) })
})

function terminateOwn(pid) {
  // 优雅送终: graphd 持 kuzu WAL, 先 SIGTERM 等 ≤6s(与 start-all stop_graceful 同语义), 再 SIGKILL
  try { process.kill(pid, 'SIGTERM') } catch { return }
  for (let i = 0; i < 12; i++) {
    if (!alive(pid)) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  try { process.kill(pid, 'SIGKILL') } catch {}
}

function startGraphd(port) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  const log = path.join(DATA_DIR, 'graphd.log')
  const child = spawn('python3', ['app.py'], {
    cwd: GRAPHD_DIR,
    detached: true,
    stdio: ['ignore', fs.openSync(log, 'a'), fs.openSync(log, 'a')],
    env: { ...process.env, P2P_GRAPH_PORT: String(port) },
  })
  child.unref()
  return child.pid
}

// app.py 端口来源: 底部 serve 段(环境变量 P2P_GRAPHD_PORT 优先, 缺省 8766) — 与本脚本注入对齐
for (let attempt = 0; attempt < MAX_PORT_TRIES; attempt++) {
  const port = BASE_PORT + attempt
  const h = await health(port)

  if (h) {
    if (String(h.version) === expectedVersion) {
      // 版本匹配 → 复用; pidfile 与健康实例对齐(供下次 stale 判定)
      writePidfile({ pid: h.pid, version: h.version, port, startedAt: h.started_at, at: new Date().toISOString() })
      console.error(`graphd 已就绪(复用): v${h.version} pid=${h.pid}`)
      console.log(`GRAPHD_URL=http://127.0.0.1:${port}`)
      process.exit(0)
    }
    // 版本不符 → 候选 stale: 三重校验(pidfile.pid 存活 + starttime 一致 + health 握手已过)才接管
    const rec = readPidfile()
    const st = rec?.pid ? procStarttime(rec.pid) : null
    if (rec && Number(rec.pid) === Number(h.pid) && rec.startedAt === h.started_at && st && alive(rec.pid)) {
      console.error(`stale 实例接管: v${rec.version ?? '?'} → v${expectedVersion}(pid=${rec.pid} 三重校验通过, 优雅送终)`)
      terminateOwn(rec.pid)
      if (!(await portBusy(port))) {
        startGraphd(port)
        for (let i = 0; i < 30; i++) {
          await new Promise((r) => setTimeout(r, 500))
          const nh = await health(port)
          if (nh) {
            writePidfile({ pid: nh.pid, version: nh.version, port, startedAt: nh.started_at, at: new Date().toISOString() })
            console.error(`接管完成: v${nh.version} pid=${nh.pid}`)
            console.log(`GRAPHD_URL=http://127.0.0.1:${port}`)
            process.exit(0)
          }
        }
        console.error('接管启动失败(详见 graphd.log)')
        process.exit(3)
      }
    } else {
      console.error(`端口 ${port} 上是外来 graphd(v${h.version} ≠ 期望 v${expectedVersion}, 非本工具登记) — 不接管, 换端口`)
    }
    continue
  }

  if (await portBusy(port)) {
    console.error(`端口 ${port} 被非 graphd 进程占用 — 不动它, 换端口`)
    continue
  }

  const pid = startGraphd(port)
  for (let i = 0; i < 30; i++) {
    await new Promise((r) => setTimeout(r, 500))
    const nh = await health(port)
    if (nh) {
      writePidfile({ pid: nh.pid ?? pid, version: nh.version ?? expectedVersion, port, startedAt: nh.started_at, at: new Date().toISOString() })
      console.error(`graphd 已启动: v${nh.version} pid=${nh.pid ?? pid} port=${port}`)
      console.log(`GRAPHD_URL=http://127.0.0.1:${port}`)
      process.exit(0)
    }
  }
  console.error(`启动超时 — 详见 ${path.join(DATA_DIR, 'graphd.log')}`)
  process.exit(3)
}
console.error(`连续 ${MAX_PORT_TRIES} 个端口不可用 — 换 --port 基数或清场后重试`)
process.exit(2)

// R1 发射器: 同时给 pi 与 dsh 布置同一靶场
import { rmSync } from 'node:fs'
import os from 'node:os'
const D2D_ROOT = process.env.D2D ?? `${os.homedir()}/d2d`
try { rmSync('/tmp/jiti', { recursive: true, force: true }); } catch {}
const TARGET = process.env.R_TARGET ?? 'http://127.0.0.1:8080'
const SCOPE = process.env.R_SCOPE ?? '127.0.0.1'
const INST = process.env.R_INST ?? '2'

async function launchPi() {
  const { createJiti } = await import(`${os.homedir()}/p2p/pi/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs`)
  const jiti = createJiti(import.meta.url)
  globalThis.__p2pChildProcess = await import('node:child_process')
  globalThis.__p2pFs = await import('node:fs')
  const mod = await jiti.import(`${os.homedir()}/p2p/home/.pi/agent/extensions/pentest/index.ts`)
  const cmds = {}, tools = {}
  const notifyLog = []
  const fakePi = {
    on: () => {},
    registerCommand: (n, d) => (cmds[n] = d),
    registerTool: () => {},
  }
  // 薄壳导出 apply(pi); 兼容旧单体 default 导出
  const applyFn = mod.apply ?? mod.default
  await applyFn(fakePi)
  // 门控注册需要 ctx.on —— 薄壳通过 adapter.registerGate(pi, handler) 已调用 fakePi.on ✓
  const res = await cmds['pentest'].handler(`${TARGET} ${SCOPE} ${INST}`, {
    ui: { notify: (m) => { notifyLog.push(m); console.log('[pi]', m.slice(0, 120)) } },
  })
  // 保持存活驱动链式调度
  setTimeout(() => process.exit(0), 15_000) // R4c: 终态后 15s 退出(原 120min 空挂曾让外部编排每轮白等)
  return res
}

async function launchDsh() {
  const plugin = await import(`${D2D_ROOT}/plugin/pentest-dsh/index.js`)
  globalThis.__p2pChildProcess = await import('node:child_process')
  globalThis.__p2pFs = await import('node:fs')
  const cmds = {}, gates = []
  const ctx = {
    on: (e, f) => gates.push({ e, f }),
    tools: { register: (t) => {} },
    commands: { register: (c) => (cmds[c.name] = c) },
  }
  await plugin.apply(ctx, {})
  const inv = { rawInput: `${TARGET} ${SCOPE} ${INST}`, signal: new AbortController().signal }
  const res = await cmds['pentest'].handler(inv)
  setTimeout(() => process.exit(0), 15_000) // R4c: 终态后 15s 退出(原 120min 空挂曾让外部编排每轮白等)
  return res
}

const which = process.argv[2]
if (which === 'pi') console.log(JSON.stringify(await launchPi()))
else if (which === 'dsh') console.log(JSON.stringify(await launchDsh()))

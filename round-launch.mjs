// R1 发射器: 同时给 pi 与 dsh 布置同一靶场
import { rmSync } from 'node:fs'
try { rmSync('/tmp/jiti', { recursive: true, force: true }); } catch {}
const TARGET = process.env.R_TARGET ?? 'http://127.0.0.1:8080'
const SCOPE = process.env.R_SCOPE ?? '127.0.0.1'
const INST = process.env.R_INST ?? '2'

async function launchPi() {
  const { createJiti } = await import('/home/wff/p2p/pi/node_modules/@earendil-works/pi-coding-agent/node_modules/jiti/lib/jiti.mjs')
  const jiti = createJiti(import.meta.url)
  globalThis.__p2pChildProcess = await import('node:child_process')
  const mod = await jiti.import('/home/wff/p2p/home/.pi/agent/extensions/pentest/index.ts')
  const cmds = {}, tools = {}
  const notifyLog = []
  const fakePi = {
    on: () => {},
    registerCommand: (n, d) => (cmds[n] = d),
    registerTool: () => {},
  }
  await mod.default(fakePi)
  const res = await cmds['pentest'].handler(`${TARGET} ${SCOPE} ${INST}`, {
    ui: { notify: (m) => { notifyLog.push(m); console.log('[pi]', m.slice(0, 120)) } },
  })
  // 保持存活驱动链式调度
  setTimeout(() => process.exit(0), 120 * 60_000)
  return res
}

async function launchDsh() {
  const plugin = await import('/home/wff/d2d/plugin/pentest-dsh/index.js')
  globalThis.__p2pChildProcess = await import('node:child_process')
  const cmds = {}, gates = []
  const ctx = {
    on: (e, f) => gates.push({ e, f }),
    tools: { register: (t) => {} },
    commands: { register: (c) => (cmds[c.name] = c) },
  }
  await plugin.apply(ctx, {})
  const inv = { rawInput: `${TARGET} ${SCOPE} ${INST}`, signal: new AbortController().signal }
  const res = await cmds['pentest'].handler(inv)
  setTimeout(() => process.exit(0), 120 * 60_000)
  return res
}

const which = process.argv[2]
if (which === 'pi') console.log(JSON.stringify(await launchPi()))
else if (which === 'dsh') console.log(JSON.stringify(await launchDsh()))

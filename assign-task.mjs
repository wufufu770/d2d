// 给 dsh 布置与 pi 相同的靶场任务(经插件 /pentest 处理器, 与 Web UI 调用等价)
const plugin = await import('/home/wff/d2d/plugin/pentest-dsh/index.js')
globalThis.__p2pChildProcess = await import('node:child_process')

const registered = { tools: {}, commands: {}, gates: [] }
const ctx = {
  on(event, fn) { registered.gates.push({ event, fn }) },
  tools: { register: (t) => { registered.tools[t.name] = t } },
  commands: { register: (c) => { registered.commands[c.name] = c } },
}
await plugin.apply(ctx, {})

const inv = {
  rawInput: process.argv[2] ?? process.env.R_TARGET ?? (() => { console.error('用法: node assign-task.mjs <target> [scope] [instances]'); process.exit(1) })(),
  signal: new AbortController().signal,
}
const res = await registered.commands['pentest'].handler(inv)
console.log(JSON.stringify(res))
// 保持进程存活直到 worker 子进程结束(写状态回图)
setTimeout(() => process.exit(0), 30 * 60_000)

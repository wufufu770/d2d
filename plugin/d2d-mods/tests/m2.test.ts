// tests/m2.test.ts — M2 门禁：工具/角色全注册 + 门族接线（离线跑）
// 运行：cd plugin/d2d-mods && claude plugin test
import { expect, test, mock } from 'claude-code/testing'

// 本文件内所有用例共用同一 engagement（D2D_ENG_SCOPE=example.com）；engCache 有 60s TTL，
// 同一模块实例内首个 resolveEng 会为整文件定调，故统一配置、只变被测命令。
function prime(on: any, health: { ok: boolean; status: number; text: string } = { ok: true, status: 200, text: '{}' }, counts?: { tools: number; agents: number }) {
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', () => { if (counts) counts.tools += 1; return { value: undefined } })
  on('agent.register', () => { if (counts) counts.agents += 1; return { value: undefined } })
  on('ui.status', () => ({ value: undefined }))
  mock.env(on, { D2D_GRAPH_URL: 'http://127.0.0.1:8766', D2D_GRAPH_TOKEN: '', D2D_ENG_SCOPE: 'example.com' })
  on('http.fetch', () => ({ value: health }))
}

test('session.start 全注册：9 工具（1 内置 + 8 d2d）+ 24 角色', async ($, on) => {
  const counts = { tools: 0, agents: 0 }
  prime(on, undefined, counts)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  expect(counts.tools).toBe(9)
  expect(counts.agents).toBe(24)
})

test('Bash 门：scope 内出网放行', async ($, on) => {
  prime(on)
  on('tool.call', () => ({ result: 'allowed' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.call({ tool: 'Bash', command: 'curl http://example.com/api' })
  expect(JSON.stringify(r)).toContain('allowed')
})

test('Bash 门：越界目标拦截', async ($, on) => {
  prime(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.call({ tool: 'Bash', command: 'curl http://evil.example.net/api' })
  expect(JSON.stringify(r)).toContain('scope')
})

test('Bash 门：裸主机名（无 scheme）拦截', async ($, on) => {
  prime(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.call({ tool: 'Bash', command: 'curl intranet-host/admin' })
  expect(JSON.stringify(r)).toContain('scheme')
})

test('工具门：WebFetch 非 http(s) scheme 硬拒', async ($, on) => {
  prime(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.check({ tool: 'WebFetch', input: { url: 'file:///etc/passwd' } })
  expect(JSON.stringify(r)).toContain('deny')
})

test('工具门：WebFetch http 目标降级为 ask', async ($, on) => {
  prime(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.check({ tool: 'WebFetch', input: { url: 'http://example.com/' } })
  expect(JSON.stringify(r)).toContain('ask')
})

test('工具门：WebSearch 为 ask', async ($, on) => {
  prime(on)
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.check({ tool: 'WebSearch', input: { queries: ['example.com dork'] } })
  expect(JSON.stringify(r)).toContain('ask')
})

// tests/m1.test.ts — M1 门禁：离线跑（无会话/无登录/无网络）
// 运行：cd plugin/d2d-mods && claude plugin test
import { expect, test, mock } from 'claude-code/testing'

// 让 session.start 能跑完：补齐它调用的每个 $ 方法
function primeSession(on: any, health: { ok: boolean; status: number; text: string }) {
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: undefined }))
  on('tool.register', () => ({ value: undefined }))
  on('agent.register', () => ({ value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  mock.env(on, { D2D_GRAPH_URL: 'http://127.0.0.1:8766', D2D_GRAPH_TOKEN: '', D2D_ENG_SCOPE: 'example.com' })
  on('http.fetch', () => ({ value: health }))
}

test('/d2d 报告 graphd 在线', async ($, on) => {
  primeSession(on, { ok: true, status: 200, text: '{"ok":true}' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const answer = await $.command.run({ command: 'd2d', args: '' })
  expect(answer.text).toBe('d2d: graphd 在线 · engagement=(env) scope=example.com')
})

test('/d2d 报告 graphd 离线', async ($, on) => {
  primeSession(on, { ok: false, status: 503, text: 'down' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const answer = await $.command.run({ command: 'd2d', args: '' })
  expect(answer.text).toBe('d2d: graphd 离线 (503)')
})

test('门拦截高危 Bash 命令', async ($, on) => {
  primeSession(on, { ok: true, status: 200, text: '{}' })
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const denied = await $.tool.call({ tool: 'Bash', command: 'rm -rf /' })
  expect(JSON.stringify(denied)).toContain('d2d-gate')
})

test('门放行普通 Bash 命令', async ($, on) => {
  primeSession(on, { ok: true, status: 200, text: '{}' })
  on('tool.call', () => ({ result: 'ok' }))
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  const r = await $.tool.call({ tool: 'Bash', command: 'ls -la' })
  expect(JSON.stringify(r)).toContain('ok')
})

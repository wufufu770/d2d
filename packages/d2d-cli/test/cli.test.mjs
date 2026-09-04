import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { run, COMMANDS } from '../src/cli.mjs'

function bufOut() {
  const lines = []
  return { lines, out: (s) => lines.push(String(s)) }
}

describe('d2d-cli 分发', () => {
  it('COMMANDS 枚举齐全', () => {
    assert.deepEqual(COMMANDS, ['version', 'list', 'doctor', 'graphd', 'agents', 'skills', 'hooks', 'osint-cred'])
  })
  it('version 列出各包版本', async () => {
    const t = bufOut()
    const code = await run(['version'], t)
    assert.equal(code, 0)
    assert.ok(t.lines.some((l) => l.startsWith('d2d-monorepo')))
    assert.ok(t.lines.some((l) => l.includes('@wufufu770/d2d-core')))
  })
  it('agents 输出 12 agent', async () => {
    const t = bufOut()
    await run(['agents'], t)
    assert.ok(t.lines.some((l) => l.includes('12')))
  })
  it('skills: 列出内置样本 skill, keyword 触发打分', async () => {
    const t = bufOut()
    await run(['skills'], t)
    assert.ok(t.lines.some((l) => l.startsWith('ping ')))
    const t2 = bufOut()
    await run(['skills', '--keyword', 'recon'], t2)
    assert.ok(t2.lines.some((l) => l.includes('score=')))
    assert.ok(t2.lines.some((l) => l.startsWith('recon-report ')))
  })
  it('doctor: graphd 不可达返回 1', async () => {
    const t = bufOut()
    const code = await run(['doctor', '--graphd-url', 'http://127.0.0.1:1'], {
      ...t,
      fetchImpl: async () => { throw new Error('ECONNREFUSED') },
    })
    assert.equal(code, 1)
    assert.ok(t.lines.some((l) => l.startsWith('✘ graphd')))
  })
  it('doctor: mock /health 通过返回 0', async () => {
    const t = bufOut()
    const code = await run(['doctor'], {
      ...t,
      fetchImpl: async () => ({ ok: true, status: 200, text: async () => '{"status":"ok"}' }),
    })
    assert.equal(code, 0)
  })
  it('hooks/osint-cred/graphd 正常退出; 未知子命令返回 1', async () => {
    const t = bufOut()
    assert.equal(await run(['hooks'], t), 0)
    assert.equal(await run(['osint-cred'], t), 0)
    assert.equal(await run(['graphd'], t), 0)
    assert.equal(await run(['nope'], t), 1)
  })
})

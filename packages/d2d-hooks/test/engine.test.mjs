import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { HOOK_EVENTS, makeMatcher, hookMatches, runHooks } from '../src/engine.mjs'

describe('hook matcher', () => {
  it('7 事件枚举', () => {
    assert.deepEqual(HOOK_EVENTS, ['session-start', 'session-end', 'pre-worker-spawn', 'post-worker-terminal', 'pre-write', 'finding-verified', 'error'])
  })
  it('undefined/always 恒匹配', () => {
    assert.equal(makeMatcher(undefined)('anything'), true)
    assert.equal(makeMatcher('always')(''), true)
  })
  it('精确匹配', () => {
    const m = makeMatcher('bash')
    assert.equal(m('bash'), true)
    assert.equal(m('bashx'), false)
  })
  it("'a|b' 多选", () => {
    const m = makeMatcher('bash | node')
    assert.equal(m('node'), true)
    assert.equal(m('python'), false)
  })
  it('正则串 /…/i', () => {
    const m = makeMatcher('/^curl|wget$/i')
    assert.equal(m('CURL'), true)
    assert.equal(m('nc'), false)
  })
  it('hookMatches: 事件不匹配直接 false; subject 取 ctx.tool', () => {
    assert.equal(hookMatches({ event: 'pre-write', command: 'x' }, 'pre-write', { tool: 'bash' }), true)
    assert.equal(hookMatches({ event: 'pre-write', command: 'x' }, 'error'), false)
    assert.equal(hookMatches({ event: 'pre-write', matcher: 'bash', command: 'x' }, 'pre-write', { tool: 'node' }), false)
  })
})

describe('runHooks 执行与失败模式', () => {
  const spawnOk = () => ({ status: 0, stderr: '' })
  const spawnFail = () => ({ status: 1, stderr: 'boom' })

  it('warn 模式: 失败记 warning 继续执行后续 hook', () => {
    const ran = []
    const r = runHooks('pre-write', { tool: 'bash' }, [
      { event: 'pre-write', command: 'fail', failMode: 'warn' },
      { event: 'pre-write', command: 'then' },
    ], { spawnProcess: (cmd) => { ran.push(cmd); return cmd === 'fail' ? spawnFail() : spawnOk() } })
    assert.deepEqual(ran, ['fail', 'then'])
    assert.equal(r.blocked, false)
    assert.equal(r.warnings.length, 1)
    assert.match(r.warnings[0], /boom/)
  })

  it('block 模式: 失败即 blocked 且停止后续 hook', () => {
    const ran = []
    const r = runHooks('pre-write', {}, [
      { event: 'pre-write', command: 'fail', failMode: 'block' },
      { event: 'pre-write', command: 'never' },
    ], { spawnProcess: (cmd) => { ran.push(cmd); return spawnFail() } })
    assert.deepEqual(ran, ['fail'])
    assert.equal(r.blocked, true)
  })

  it('matcher 不过滤的 hook 不执行; 事件不匹配不执行', () => {
    let n = 0
    runHooks('error', {}, [{ event: 'pre-write', command: 'x', matcher: 'bash' }], { spawnProcess: () => { n++ } })
    assert.equal(n, 0)
  })

  it('spawnProcess 抛异常视为失败(warn)', () => {
    const r = runHooks('session-start', {}, [{ event: 'session-start', command: 'x' }], {
      spawnProcess: () => { throw new Error('spawn gone') },
    })
    assert.equal(r.blocked, false)
    assert.match(r.warnings[0], /spawn gone/)
  })

  it('默认成功(status 0)不产生 warning, ctx.event 传递给 spawnProcess', () => {
    let seenCtx
    const r = runHooks('finding-verified', { tool: 'bash' }, [{ event: 'finding-verified', command: 'ok' }], {
      spawnProcess: (cmd, c) => { seenCtx = c; return spawnOk() },
    })
    assert.equal(r.warnings.length, 0)
    assert.equal(seenCtx.event, 'finding-verified')
    assert.equal(seenCtx.tool, 'bash')
  })
})

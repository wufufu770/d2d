import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createClient, GraphdError, FINDING_STATES } from '../src/index.mjs'

function mockFetch(handler) {
  const calls = []
  const fn = async (url, init = {}) => {
    calls.push({ url, init })
    return handler(url, init)
  }
  fn.calls = calls
  return fn
}
const ok = (body) => ({ ok: true, status: 200, text: async () => JSON.stringify(body) })

describe('d2d-graphd client', () => {
  it('query 携带 x-auth hostToken(graphd 只认 X-Auth) 且 POST 到 /query', async () => {
    const f = mockFetch(() => ok({ rows: [] }))
    const g = createClient({ baseUrl: 'http://127.0.0.1:9999/', hostToken: 'tok', fetch: f })
    await g.query('MATCH (n) RETURN n', { x: 1 })
    const { url, init } = f.calls[0]
    assert.equal(url, 'http://127.0.0.1:9999/query')
    assert.equal(init.headers['x-auth'], 'tok')
    assert.equal(init.headers.authorization, undefined, 'authorization: Bearer 会被 graphd 401, 不得发送')
    assert.equal(init.method, 'POST')
    assert.deepEqual(JSON.parse(init.body), { cypher: 'MATCH (n) RETURN n', params: { x: 1 } })
  })

  it('health GET 且无 token 时不带 x-auth 头', async () => {
    const f = mockFetch(() => ok({ status: 'ok' }))
    const g = createClient({ fetch: f })
    await g.health()
    assert.equal(f.calls[0].url, 'http://127.0.0.1:8766/health')
    assert.equal(f.calls[0].init.headers['x-auth'], undefined)
  })

  it('非 2xx 抛 GraphdError 并带 status', async () => {
    const g = createClient({ fetch: mockFetch(() => ({ ok: false, status: 403, text: async () => 'forbidden' })) })
    await assert.rejects(g.writeFinding({ title: 'x' }), (e) => {
      assert.ok(e instanceof GraphdError)
      assert.equal(e.status, 403)
      assert.match(e.message, /403/)
      return true
    })
  })

  it('网络不可达抛 GraphdError(status=0)', async () => {
    const g = createClient({ fetch: mockFetch(() => { throw new Error('ECONNREFUSED') }) })
    await assert.rejects(g.writeSignal({ kind: 'hb' }), (e) => e instanceof GraphdError && e.status === 0 && /ECONNREFUSED/.test(e.message))
  })

  it('非 JSON 成功响应原样返回文本', async () => {
    const g = createClient({ fetch: mockFetch(() => ({ ok: true, status: 200, text: async () => 'pong' })) })
    assert.equal(await g.health(), 'pong')
  })

  it('transition 组装 graphd 契约 {id, to, actor, reason}(app.py 读 id/actor/reason)', async () => {
    const f = mockFetch(() => ok({ ok: 1 }))
    const g = createClient({ fetch: f })
    await g.transition({ findingId: 'f1', to: 'verified' })
    assert.equal(f.calls[0].url, 'http://127.0.0.1:8766/write/transition')
    assert.deepEqual(JSON.parse(f.calls[0].init.body), { id: 'f1', to: 'verified', actor: 'host', reason: '' })
    await g.transition({ findingId: 'f2', to: 'dropped', note: '误报', actor: 'verifier-1' })
    assert.deepEqual(JSON.parse(f.calls[1].init.body), { id: 'f2', to: 'dropped', actor: 'verifier-1', reason: '误报' })
  })

  it('FINDING_STATES 为七态', () => {
    assert.equal(FINDING_STATES.length, 7)
  })
})

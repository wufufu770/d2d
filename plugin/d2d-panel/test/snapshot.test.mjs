// snapshot.test.mjs — host 半聚合逻辑单测(node:test, 零依赖)
// 运行: node --test plugin/d2d-panel/test/
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildSnapshot, groupStates, markZombie, createGraphdQuery, readFleet, FINDING_STATES } from '../lib/host/snapshot.mjs'

// fake query: 按 cypher 特征路由(与 snapshot.mjs 的 Q 常量一一对应)
function makeFake(t = {}) {
  return async (cypher) => {
    if (cypher.includes("status = 'active'")) return t.engActive ?? []
    if (cypher.includes('e.name AS name')) return t.engLast ?? []
    if (cypher.includes('AgentIdentity')) return t.agents ?? []
    if (cypher.includes('gate_status AS state')) return t.byState ?? []
    if (cypher.includes('f.id AS id')) return t.findings ?? []
    if (cypher.includes('s.type AS type')) return t.signals ?? []
    if (cypher.includes('count(e)')) return t.endpoints ?? [{ n: 0 }]
    if (cypher.includes('count(s)')) return t.signalsOpen ?? [{ n: 0 }]
    if (cypher.includes('count(h)')) return t.hyps ?? [{ n: 0 }]
    if (cypher.includes('count(x)')) return t.experience ?? [{ n: 0 }]
    throw new Error(`fake: unmatched query: ${cypher.slice(0, 60)}`)
  }
}

test('groupStates: 七态 → 4 宏观列(§4.4 列义)', () => {
  const byState = { candidate: 3, triaged: 2, verified: 5, isolated: 1, reported: 2, accepted: 1, rejected: 4 }
  assert.deepEqual(groupStates(byState), { active: 5, verified: 6, delivered: 3, rejected: 4 })
  assert.deepEqual(groupStates({}), { active: 0, verified: 0, delivered: 0, rejected: 0 })
  assert.deepEqual(groupStates({ weird_state: 9 }), { active: 0, verified: 0, delivered: 0, rejected: 0 }) // 未知态忽略
})

test('markZombie: running 且心跳 >30s 才判 zombie(§4.6)', () => {
  const now = Date.parse('2026-08-31T12:00:00Z')
  const [fresh, stale, doneStale, noTs] = markZombie([
    { worker_id: 'a', status: 'running', updated_at: '2026-08-31T11:59:50Z' },
    { worker_id: 'b', status: 'running', updated_at: '2026-08-31T11:00:00Z' },
    { worker_id: 'c', status: 'done', updated_at: '2026-08-31T11:00:00Z' },
    { worker_id: 'd', status: 'running', updated_at: '' },
  ], now)
  assert.equal(fresh.zombie, false)
  assert.equal(stale.zombie, true)
  assert.equal(doneStale.zombie, false) // 非 running 不判
  assert.equal(noTs.ageMs, -1)
  assert.equal(noTs.zombie, false) // 无心跳时间戳 → 未知, 不判
})

test('buildSnapshot: 空图 → engagement null + 七态零填充 + 空列表', async () => {
  const s = await buildSnapshot(makeFake())
  assert.equal(s.ok, true)
  assert.equal(s.engagement, null)
  assert.deepEqual(Object.keys(s.findings.byState).sort(), [...FINDING_STATES].sort())
  assert.equal(s.findings.total ?? s.counts.findings, 0)
  assert.deepEqual(s.findings.list, [])
  assert.deepEqual(s.agents, [])
  assert.deepEqual(s.signals, [])
  assert.equal(s.fleet, null)
  assert.ok(Date.parse(s.now) > 0)
})

test('buildSnapshot: 有数据 → 聚合/截断/排序字段齐备', async () => {
  const s = await buildSnapshot(makeFake({
    engActive: [{ name: 'eng-x', target: 'http://t.local', scope: 't.local', status: 'active', created_at: '2026-08-31T10:00:00Z' }],
    agents: [{ worker_id: 'w1', ring: 'discovery', chain: 'auth', status: 'running', updated_at: new Date().toISOString() }],
    byState: [{ state: 'candidate', n: 2 }, { state: 'verified', n: 3 }, { state: 'bogus', n: 99 }],
    findings: [{ id: 'F1', title: 'SQL injection in /login', severity: 'critical', cvss: 9.14, gate_status: 'verified', category: 'sqli', ts: '2026-08-31T11:00:00Z', verified_at: '2026-08-31T11:05:00Z' }],
    signals: [{ id: 'sig-1', type: 'sqli', weight: 4.5, ts: '2026-08-31T11:00:00Z' }],
    endpoints: [{ n: 12 }],
    signalsOpen: [{ n: 7 }],
    hyps: [{ n: 2 }],
    experience: [{ n: 9 }],
  }), { fleet: { default: { primary: '', backup: '' }, roles: { deep: { primary: 'm/a', backup: 'm/b' } } } })
  assert.equal(s.engagement.name, 'eng-x')
  assert.equal(s.counts.endpoints, 12)
  assert.equal(s.counts.signals_open, 7)
  assert.equal(s.counts.findings, 5) // 2 candidate + 3 verified; bogus 态不计
  assert.equal(s.findings.byState.candidate, 2)
  assert.equal(s.findings.byState.verified, 3)
  assert.deepEqual(s.findings.macro, { active: 2, verified: 3, delivered: 0, rejected: 0 })
  assert.equal(s.findings.list[0].cvss, 9.1) // fnum 一位小数
  assert.equal(s.findings.list[0].state, 'verified')
  assert.equal(s.agents[0].ring, 'discovery')
  assert.equal(s.signals[0].weight, 4.5)
  assert.equal(s.fleet.roles.deep.backup, 'm/b')
})

test('buildSnapshot: 无 active → 带出最近终态 engagement 供上下文(§7)', async () => {
  const s = await buildSnapshot(makeFake({ engLast: [{ name: 'eng-done', target: 'http://t', scope: 't', status: 'completed', created_at: '2026-08-30T00:00:00Z' }] }))
  assert.equal(s.engagement.name, 'eng-done')
  assert.equal(s.engagement.status, 'completed')
})

test('buildSnapshot: 任一图读取失败 → 整体抛错(fail-closed, 不下半截快照)', async () => {
  const q = async (cypher) => { if (cypher.includes('count(x)')) throw new Error('boom'); return makeFake()(cypher) }
  await assert.rejects(() => buildSnapshot(q), /boom/)
})

test('createGraphdQuery: X-Auth 注入 + 非 ok 响应抛错', async () => {
  let captured = null
  const okFetch = async (url, opts) => {
    captured = { url, opts }
    return { ok: true, status: 200, json: async () => ({ ok: true, rows: [{ n: 1 }] }) }
  }
  const q = createGraphdQuery({ graphdUrl: 'http://127.0.0.1:8766', token: 'tok123', fetchImpl: okFetch })
  const rows = await q('MATCH (x) RETURN count(x) AS n')
  assert.deepEqual(rows, [{ n: 1 }])
  assert.equal(captured.url, 'http://127.0.0.1:8766/query')
  assert.equal(captured.opts.headers['X-Auth'], 'tok123')
  assert.equal(JSON.parse(captured.opts.body).cypher, 'MATCH (x) RETURN count(x) AS n')

  const badFetch = async () => ({ ok: false, status: 401, json: async () => ({ ok: false, error: 'unauthorized' }) })
  await assert.rejects(() => createGraphdQuery({ graphdUrl: 'http://x', token: 't', fetchImpl: badFetch })('MATCH (x)'), /unauthorized/)

  const graphErr = async () => ({ ok: true, status: 200, json: async () => ({ ok: false, error: 'bad cypher' }) })
  await assert.rejects(() => createGraphdQuery({ graphdUrl: 'http://x', token: 't', fetchImpl: graphErr })('bad'), /bad cypher/)
})

test('readFleet: DATA_DIR 外置策略, 缺失返回 null(A-2)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-test-'))
  const env = { D2D_DATA_DIR: dir }
  assert.equal(readFleet(env), null) // 未配置
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'config', 'model-policies.json'), JSON.stringify({
    default: { primary: 'p/d', backup: '' },
    roles: { deep: { primary: 'p/x', backup: 'p/y' } },
  }))
  const f = readFleet(env)
  assert.equal(f.default.primary, 'p/d')
  assert.equal(f.roles.deep.backup, 'p/y')
  fs.rmSync(dir, { recursive: true, force: true })
})

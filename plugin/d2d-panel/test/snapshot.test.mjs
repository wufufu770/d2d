// snapshot.test.mjs — host 半聚合逻辑单测(node:test, 零依赖)
// 运行: node --test plugin/d2d-panel/test/
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { buildSnapshot, groupStates, markZombie, createGraphdQuery, readFleet, writeFleet, readRunEvents, transitionFinding, FINDING_STATES, parseProviderModels, loadDshCatalog } from '../lib/host/snapshot.mjs'

// fake query: 按 cypher 特征路由(与 snapshot.mjs 的 Q 常量一一对应)
function makeFake(t = {}) {
  return async (cypher) => {
    if (cypher.includes("status = 'active'")) return t.engActive ?? []
    if (cypher.includes('e.name AS name')) return t.engLast ?? []
    if (cypher.includes('AgentIdentity')) return t.agents ?? []
    if (cypher.includes('f.id AS id')) return t.findings ?? [] // findingsList 亦含 'gate_status AS state', 须先判
    if (cypher.includes('gate_status AS state')) return t.byState ?? []
    if (cypher.includes('s.type AS type')) return t.signals ?? []
    if (cypher.includes('sum(CASE')) return t.coverage ?? [{ total: 0, covered: null }]
    if (cypher.includes('business_chain AS bc')) return t.gaps ?? []
    if (cypher.includes('h.digest AS digest')) return t.handoffs ?? []
    if (cypher.includes('x.pattern AS pattern')) return t.experienceTail ?? []
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
    agents: [{ worker_id: 'w1', ring: 'discovery', chain: 'auth', status: 'running', checkpoint: '已枚举 /api', todo: '继续测 /login', updated_at: new Date().toISOString() }],
    byState: [{ state: 'candidate', n: 2 }, { state: 'verified', n: 3 }, { state: 'bogus', n: 99 }],
    findings: [{ id: 'F1', title: 'SQL injection in /login', severity: 'critical', cvss: 9.14, state: 'verified', category: 'sqli', ts: '2026-08-31T11:00:00Z', verified_at: '2026-08-31T11:05:00Z', last_transition: '{"from":"candidate","to":"verified","actor":"verify-w1","reason":"重放成立"}' }], // 键名与 Q.findingsList 的 RETURN 别名对齐
    signals: [{ id: 'sig-1', type: 'sqli', weight: 4.5, ts: '2026-08-31T11:00:00Z' }],
    coverage: [{ total: 10, covered: 4 }],
    gaps: [{ bc: 'checkout' }, { bc: '' }],
    handoffs: [{ id: 'h2', digest: '第二阶段交接', model: 'm/b', created_at: '2026-08-31T11:30:00Z' }, { id: 'h1', digest: '第一阶段交接', model: 'm/a', created_at: '2026-08-31T10:30:00Z' }],
    experienceTail: [{ id: 'x1', pattern: 'jwt-none', stack: 'node', prior: 2.5, hits: 4, wins: 3, target_type: 'web' }],
    endpoints: [{ n: 12 }],
    signalsOpen: [{ n: 7 }],
    hyps: [{ n: 2 }],
    experience: [{ n: 9 }],
  }), { fleet: { default: { primary: '', backup: '' }, roles: { deep: { primary: 'm/a', backup: 'm/b' } } }, runEvents: { events: [{ ts: '2026-08-31T11:00:00Z', kind: 'dispatch', worker: 'w1', ring: 'discovery', role: 'discovery', model: 'm/a' }], usage: { 'm/a': 3, 'm/b': 1 }, quotaHits: ['m/b'] } })
  assert.equal(s.engagement.name, 'eng-x')
  assert.equal(s.counts.endpoints, 12)
  assert.equal(s.counts.signals_open, 7)
  assert.equal(s.counts.findings, 5) // 2 candidate + 3 verified; bogus 态不计
  assert.equal(s.findings.byState.candidate, 2)
  assert.equal(s.findings.byState.verified, 3)
  assert.deepEqual(s.findings.macro, { active: 2, verified: 3, delivered: 0, rejected: 0 })
  assert.equal(s.findings.list[0].cvss, 9.1) // fnum 一位小数
  assert.equal(s.findings.list[0].state, 'verified')
  assert.ok(s.findings.list[0].last_transition.includes('"to":"verified"'))
  assert.equal(s.agents[0].ring, 'discovery')
  assert.equal(s.agents[0].checkpoint, '已枚举 /api') // worker 抽屉数据随快照下发
  assert.equal(s.agents[0].todo, '继续测 /login')
  assert.equal(s.signals[0].weight, 4.5)
  assert.deepEqual(s.coverage, { total: 10, covered: 4 }) // 覆盖大数字
  assert.deepEqual(s.gaps, ['checkout']) // 空链名过滤
  assert.equal(s.milestones.length, 2)
  assert.equal(s.milestones[0].id, 'h1') // reverse → 升序
  assert.equal(s.experience[0].pattern, 'jwt-none')
  assert.equal(s.experience[0].prior, 2.5)
  assert.deepEqual(s.run.usage, { 'm/a': 3, 'm/b': 1 })
  assert.deepEqual(s.run.quotaHits, ['m/b'])
  assert.equal(s.run.events[0].worker, 'w1')
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
  const env = { D2D_DATA_DIR: dir, DSH_HOME: '/tmp/definitely-not-exist-dsh-xyz' } // 隔离真实 dsh 目录, catalog 保持确定性
  assert.equal(readFleet(env), null) // 未配置
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'config', 'model-policies.json'), JSON.stringify({
    default: { primary: 'p/d', backup: '' },
    roles: { deep: { primary: 'p/x', backup: 'p/y' } },
  }))
  const f = readFleet(env)
  assert.equal(f.default.primary, 'p/d')
  assert.equal(f.roles.deep.backup, 'p/y')
  assert.deepEqual(f.models.sort(), ['p/d', 'p/x', 'p/y'].sort()) // 已用模型并集(选择器候选)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('writeFleet: 换槽原子写 + 非法 id 拒绝 + backup 清除', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-test-'))
  const env = { D2D_DATA_DIR: dir }
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'config', 'model-policies.json'), JSON.stringify({
    default: { primary: 'p/d', backup: '' },
    roles: { deep: { primary: 'p/x', backup: 'p/y' }, verify: { primary: 'p/v', backup: '' } },
  }))
  // primary 换槽
  let f = writeFleet({ role: 'deep', slot: 'primary', model: 'p/z' }, env)
  assert.equal(f.roles.deep.primary, 'p/z')
  assert.equal(f.roles.deep.backup, 'p/y') // 不动 backup
  assert.equal(f.roles.verify.primary, 'p/v') // 不动其它角色
  // backup 清除(空 model)
  f = writeFleet({ role: 'deep', slot: 'backup', model: '' }, env)
  assert.equal(f.roles.deep.backup, '')
  // 非法 model id 拒绝
  assert.throws(() => writeFleet({ role: 'deep', slot: 'primary', model: 'no-slash' }, env), /bad model id/)
  assert.throws(() => writeFleet({ role: '', slot: 'primary', model: 'a/b' }, env), /role required/)
  // 磁盘文件确实落盘(非仅内存)
  const onDisk = JSON.parse(fs.readFileSync(`${dir}/config/model-policies.json`, 'utf8'))
  assert.equal(onDisk.roles.deep.primary, 'p/z')
  fs.rmSync(dir, { recursive: true, force: true })
})

test('readRunEvents: usage 计数 + 轨迹事件 + quota 命中 + 坏行跳过', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-test-'))
  const runs = `${dir}/runs`
  fs.mkdirSync(runs, { recursive: true })
  fs.mkdirSync(`${runs}/eng-x`, { recursive: true })
  fs.writeFileSync(`${runs}/model-usage.jsonl`, [
    JSON.stringify({ ts: '1', worker: 'w1', role: 'deep', model: 'm/a' }),
    JSON.stringify({ ts: '2', worker: 'w2', role: 'verify', model: 'm/a' }),
    JSON.stringify({ ts: '3', worker: 'w1', role: 'deep', model: 'm/b' }),
    '{bad json',
    '',
  ].join('\n'))
  fs.writeFileSync(`${runs}/eng-x/run-log.jsonl`, [
    JSON.stringify({ ts: '2026-08-31T12:00:00Z', event: 'dispatch', worker_id: 'w1', ring: 'deep', role: 'deep', model: 'm/a' }),
    JSON.stringify({ ts: '2026-08-31T12:05:00Z', event: 'terminal', worker_id: 'w1', ring: 'deep', code: 0, model: 'm/a' }),
    JSON.stringify({ ts: '2026-08-31T12:06:00Z', event: 'terminal', worker_id: 'w2', ring: 'verify', code: 1, model: 'm/b', quota: 'rate_limited' }),
    JSON.stringify({ ts: '2026-08-31T12:07:00Z', event: 'handoff', reason: 'milestone' }),
    'garbage line',
  ].join('\n'))
  const r = readRunEvents({ engName: 'eng-x', dataDir: dir }, fs, { D2D_DATA_DIR: dir })
  assert.deepEqual(r.usage, { 'm/a': 2, 'm/b': 1 })
  assert.equal(r.events.length, 4) // 坏行跳过
  assert.equal(r.events[0].kind, 'dispatch')
  assert.equal(r.events[0].worker, 'w1')
  assert.deepEqual(r.quotaHits, ['m/b'])
  // 无 engagement → 只有 usage, 无轨迹
  const r2 = readRunEvents({ engName: '', dataDir: dir }, fs, { D2D_DATA_DIR: dir })
  assert.equal(r2.events.length, 0)
  assert.deepEqual(r2.usage, { 'm/a': 2, 'm/b': 1 })
  fs.rmSync(dir, { recursive: true, force: true })
})

test('transitionFinding: 代理 /write/transition + host token 注入 + 服务端拒绝透传', async () => {
  let captured = null
  const okFetch = async (url, opts) => {
    captured = { url, opts }
    return { ok: true, status: 200, json: async () => ({ ok: true, from: 'candidate', to: 'triaged' }) }
  }
  const r = await transitionFinding({ graphdUrl: 'http://127.0.0.1:8766', token: 'host-tok', id: 'F1', to: 'triaged', actor: 'panel', reason: '面板裁决' }, okFetch)
  assert.equal(captured.url, 'http://127.0.0.1:8766/write/transition')
  assert.equal(captured.opts.headers['X-Auth'], 'host-tok')
  assert.deepEqual(JSON.parse(captured.opts.body), { id: 'F1', to: 'triaged', actor: 'panel', reason: '面板裁决' })
  assert.equal(r.to, 'triaged')

  const denyFetch = async () => ({ ok: false, status: 403, json: async () => ({ ok: false, error: 'illegal transition candidate -> accepted' }) })
  await assert.rejects(() => transitionFinding({ graphdUrl: 'http://x', token: 't', id: 'F1', to: 'accepted', actor: 'panel', reason: 'x' }, denyFetch), /illegal transition/)
})

// ---- Fleet 模型目录: dsh 配置枚举(2026-09 批) ----

test('parseProviderModels: settings.yaml 缩进形态(providers@2)', () => {
  const y = [
    'llm-pi-ai:',
    '  providers:',
    '    provider-a:',
    '      models:',
    '        - id: model-y-fast',
    '        - id: model-y',
    '      apiKeyEnv: PROVIDER_A_API_KEY',
    'agent-default-model:',
    '  provider: provider-b',
    '  model: model-x',
  ].join('\n')
  assert.deepEqual(parseProviderModels(y), [{ provider: 'provider-a', models: ['model-y-fast', 'model-y'], apiKeyEnv: 'PROVIDER_A_API_KEY' }])
})

test('parseProviderModels: cordis.patch.yml 缩进形态(providers@4, 块外 - id 不误收)', () => {
  const y = [
    '- id: llm-pi-ai',
    '  config:',
    '    providers:',
    '      provider-a:',
    '        models:',
    '          - id: model-x-fast',
    '          - id: model-x',
    '- id: pentest-worker-env',
  ].join('\n')
  assert.deepEqual(parseProviderModels(y), [{ provider: 'provider-a', models: ['model-x-fast', 'model-x'] }])
})

test('loadDshCatalog: 合并 settings.yaml 与多 profile patch 并去重', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cat-'))
  fs.mkdirSync(path.join(dir, 'profiles', 'web'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'profiles', 'headless'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'settings.yaml'), [
    'llm-pi-ai:',
    '  providers:',
    '    provider-b:',
    '      models:',
    '        - id: model-y-fast',
    '        - id: model-y',
  ].join('\n'))
  fs.writeFileSync(path.join(dir, 'profiles', 'headless', 'cordis.patch.yml'), [
    'x:',
    '  providers:',
    '    provider-b:',
    '      models:',
    '        - id: model-y',
    '        - id: model-y-large',
    '    provider-a:',
    '      models:',
    '        - id: model-x',
  ].join('\n'))
  const cat = loadDshCatalog({ DSH_HOME: dir })
  assert.deepEqual(cat, [
    { provider: 'provider-a', models: ['model-x'], apiKeyEnv: '', hasKey: false },
    { provider: 'provider-b', models: ['model-y', 'model-y-fast', 'model-y-large'], apiKeyEnv: '', hasKey: false },
  ])
})

test('loadDshCatalog: dsh 目录缺失 → 空数组(容错)', () => {
  assert.deepEqual(loadDshCatalog({ DSH_HOME: '/tmp/definitely-not-exist-dsh-xyz' }), [])
})

test('readFleet: catalog 模型并入 models 并集(去重)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-data-'))
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'config', 'model-policies.json'), JSON.stringify({
    default: { primary: 'provider-b/model-y-fast', backup: '' },
    roles: { discovery: { primary: 'provider-b/model-y-fast', backup: 'provider-a/model-x' } },
  }))
  const dshDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cat2-'))
  fs.writeFileSync(path.join(dshDir, 'settings.yaml'), [
    'llm-pi-ai:',
    '  providers:',
    '    provider-b:',
    '      models:',
    '        - id: model-y-fast',
    '        - id: model-y',
  ].join('\n'))
  const fleet = readFleet({ D2D_DATA_DIR: dir, DSH_HOME: dshDir })
  assert.ok(fleet.catalog.some((p) => p.provider === 'provider-b'))
  assert.ok(fleet.models.includes('provider-b/model-y'))
  assert.ok(fleet.models.includes('provider-b/model-y-fast'))
})

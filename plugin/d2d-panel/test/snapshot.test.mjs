// snapshot.test.mjs — host 半聚合逻辑单测(node:test, 零依赖)
// 运行: node --test plugin/d2d-panel/test/
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { buildSnapshot, groupStates, markZombie, createGraphdQuery, readFleet, writeFleet, readRunEvents, readModelUsage, costEfficiency, transitionFinding, FINDING_STATES, parseProviderModels, loadDshCatalog, readSelectedEngagement, writeSelectedEngagement, mergeCredentialRefs } from '../lib/host/snapshot.mjs'
import { apply as applyHostRoutes } from '../lib/host/index.mjs'

// fake query: 按 cypher 特征路由(与 snapshot.mjs 的 Q 常量一一对应); params 透传给断言用断言器
function makeFake(t = {}) {
  return async (cypher, params) => {
    if (cypher.includes('e.instances AS instances')) return t.engList ?? [] // engList(全量 engagement)
    if (cypher.includes('f.eng AS eng')) return t.findingsByEng ?? [] // 每 engagement 战果聚合
    if (cypher.includes('a.eng AS eng, count(a)')) return t.workersByEng ?? [] // 每 engagement 在跑 worker
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

test('groupStates: 八态 → 5 宏观列(§4.4 列义 + needs-scope 边界待澄清)', () => {
  const byState = { candidate: 3, triaged: 2, verified: 5, isolated: 1, reported: 2, accepted: 1, rejected: 4 }
  assert.deepEqual(groupStates(byState), { active: 5, verified: 6, delivered: 3, 'needs-scope': 0, rejected: 4 })
  assert.deepEqual(groupStates({}), { active: 0, verified: 0, delivered: 0, 'needs-scope': 0, rejected: 0 })
  assert.deepEqual(groupStates({ weird_state: 9 }), { active: 0, verified: 0, delivered: 0, 'needs-scope': 0, rejected: 0 }) // 未知态忽略
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
  assert.deepEqual(s.engagements, [])
  assert.equal(s.selected, '')
  assert.deepEqual(Object.keys(s.findings.byState).sort(), [...FINDING_STATES].sort())
  assert.equal(s.findings.total ?? s.counts.findings, 0)
  assert.deepEqual(s.findings.list, [])
  assert.deepEqual(s.agents, [])
  assert.deepEqual(s.signals, [])
  assert.equal(s.fleet, null)
  assert.ok(Date.parse(s.now) > 0)
})

test('buildSnapshot: 有数据 → 聚合/截断/排序字段齐备 + eng 过滤参数下发', async () => {
  const seenParams = []
  const base = makeFake({
    engList: [
      { name: 'eng-x', target: 'http://t.local', scope: 't.local', status: 'active', created_at: '2026-08-31T10:00:00Z', instances: 2, objective: 'src 挖掘' },
      { name: 'eng-old', target: 'http://old.local', scope: 'old.local', status: 'frozen', created_at: '2026-08-30T10:00:00Z', instances: 2, objective: '' },
    ],
    findingsByEng: [{ eng: 'eng-x', state: 'candidate', n: 2 }, { eng: 'eng-x', state: 'verified', n: 3 }, { eng: 'eng-old', state: 'verified', n: 7 }],
    workersByEng: [{ eng: 'eng-x', n: 2 }],
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
  })
  const q = async (cypher, params) => { seenParams.push({ cypher, params }); return base(cypher, params) }
  const s = await buildSnapshot(q, { eng: 'eng-x', fleet: { default: { primary: '', backup: '' }, roles: { deep: { primary: 'm/a', backup: 'm/b' } } }, runEvents: { events: [{ ts: '2026-08-31T11:00:00Z', kind: 'dispatch', worker: 'w1', ring: 'discovery', role: 'discovery', model: 'm/a' }], usage: { 'm/a': 3, 'm/b': 1 }, quotaHits: ['m/b'] } })
  assert.equal(s.engagement.name, 'eng-x')
  assert.equal(s.selected, 'eng-x')
  assert.equal(s.engagements.length, 2)
  assert.equal(s.engagements[0].selected, true) // 选中项标记
  assert.equal(s.engagements[0].progress.active, 2)
  assert.equal(s.engagements[0].progress.verified, 3)
  assert.equal(s.engagements[0].progress.workers, 2)
  assert.equal(s.engagements[1].progress.verified, 7) // 旧项目战果独立可见(切换即回看)
  assert.equal(s.engagements[1].selected, false)
  // W5: 池子查询全部携带 $eng 过滤参数
  const filtered = seenParams.filter((x) => x.cypher.includes('f.eng = $eng'))
  assert.ok(filtered.length >= 2)
  assert.ok(filtered.every((x) => x.params?.eng === 'eng-x'))
  assert.equal(s.counts.endpoints, 12)
  assert.equal(s.counts.signals_open, 7)
  assert.equal(s.counts.findings, 5) // 2 candidate + 3 verified; bogus 态不计
  assert.equal(s.findings.byState.candidate, 2)
  assert.equal(s.findings.byState.verified, 3)
  assert.deepEqual(s.findings.macro, { active: 2, verified: 3, delivered: 0, 'needs-scope': 0, rejected: 0 })
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

test('buildSnapshot: selected 文件缺名 → 落最新 active; 全无 active → 最近终态(W5 兜底)', async () => {
  const s1 = await buildSnapshot(makeFake({ engList: [
    { name: 'eng-b', target: 'http://b', scope: 'b', status: 'frozen', created_at: '2026-08-30T00:00:00Z' },
    { name: 'eng-a', target: 'http://a', scope: 'a', status: 'active', created_at: '2026-08-31T00:00:00Z' },
  ] }), { eng: '' })
  assert.equal(s1.engagement.name, 'eng-a') // active 优先
  const s2 = await buildSnapshot(makeFake({ engList: [
    { name: 'eng-done', target: 'http://t', scope: 't', status: 'completed', created_at: '2026-08-30T00:00:00Z' },
  ] }), { eng: '' })
  assert.equal(s2.engagement.name, 'eng-done')
  assert.equal(s2.engagement.status, 'completed')
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

// ---- W5: selected engagement(项目视图切换) ----

test('selected-engagement: 原子写 + 读回 + 空名拒绝 + 缺文件返回空', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-sel-'))
  const env = { D2D_DATA_DIR: dir }
  assert.equal(readSelectedEngagement(env), '') // 缺文件
  writeSelectedEngagement('eng-a', env)
  assert.equal(readSelectedEngagement(env), 'eng-a')
  writeSelectedEngagement('eng-b', env) // 切换覆盖
  assert.equal(readSelectedEngagement(env), 'eng-b')
  const onDisk = JSON.parse(fs.readFileSync(`${dir}/config/selected-engagement.json`, 'utf8'))
  assert.equal(onDisk.name, 'eng-b')
  assert.ok(onDisk.updated_at) // ISO 时间戳
  assert.throws(() => writeSelectedEngagement('', env), /name required/)
  fs.rmSync(dir, { recursive: true, force: true })
})

// ---- 阶段2: 性价比卡 — per-engagement token 账本聚合 + 产出密度公式 ----

test('readModelUsage: per-eng 账本 input_tokens 求和 + 别名字段 + 坏行跳过 + 派发计数', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-cost-'))
  const runs = `${dir}/runs`
  fs.mkdirSync(`${runs}/eng-x`, { recursive: true })
  fs.writeFileSync(`${runs}/eng-x/model-usage.jsonl`, [
    JSON.stringify({ ts: '1', worker: 'eng-x-discovery-a1', role: 'discovery', model: 'm/a', input_tokens: 12000, output_tokens: 800 }),
    JSON.stringify({ ts: '2', worker: 'eng-x-deep-b2', role: 'deep', model: 'm/b', inputTokens: 3000 }), // 驼峰别名兼容
    JSON.stringify({ ts: '3', worker: 'eng-x-deep-b2', event: 'terminal', code: 0, ms: 60000, input_tokens: 500 }), // terminal 行 token 也算消耗
    '{bad json',
    '',
  ].join('\n'))
  const r = readModelUsage({ engName: 'eng-x', dataDir: dir }, fs, { D2D_DATA_DIR: dir })
  assert.equal(r.source, 'per-eng')
  assert.equal(r.inputTokens, 15500) // 12000 + 3000 + 500
  assert.equal(r.outputTokens, 800)
  assert.equal(r.dispatches, 2) // 只有带 model 且非 event 的行计派发
  fs.rmSync(dir, { recursive: true, force: true })
})

test('readModelUsage: per-eng 缺失 → 回落全局账本按 worker 前缀过滤(engagement 池子隔离)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-cost2-'))
  const runs = `${dir}/runs`
  fs.mkdirSync(`${runs}/eng-y`, { recursive: true }) // eng-y 有目录但无账本 → 仍算缺失
  fs.writeFileSync(`${runs}/model-usage.jsonl`, [
    JSON.stringify({ ts: '1', worker: 'eng-x-discovery-a1', model: 'm/a', input_tokens: 7000 }),
    JSON.stringify({ ts: '2', worker: 'eng-y-discovery-z9', model: 'm/a' }), // 他项目行: 不计入 eng-x
    JSON.stringify({ ts: '3', worker: 'eng-x-verify-c3', model: 'm/b', input_tokens: 500 }),
  ].join('\n'))
  const rx = readModelUsage({ engName: 'eng-x', dataDir: dir }, fs, { D2D_DATA_DIR: dir })
  assert.equal(rx.source, 'global-filtered')
  assert.equal(rx.inputTokens, 7500) // 只算 eng-x-* 前缀
  assert.equal(rx.dispatches, 2)
  // per-eng 文件存在时优先, 不读全局
  fs.writeFileSync(`${runs}/eng-y/model-usage.jsonl`, JSON.stringify({ ts: '0', worker: 'w', model: 'm', input_tokens: 1 }))
  const ry = readModelUsage({ engName: 'eng-y', dataDir: dir }, fs, { D2D_DATA_DIR: dir })
  assert.equal(ry.source, 'per-eng')
  assert.equal(ry.inputTokens, 1)
  fs.rmSync(dir, { recursive: true, force: true })
})

test('readModelUsage: 无任何账本/空 eng 名 → source=none 全零(卡片空态, 不抛错)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-cost3-'))
  const env = { D2D_DATA_DIR: dir }
  assert.deepEqual(readModelUsage({ engName: 'eng-none', dataDir: dir }, fs, env), { inputTokens: 0, outputTokens: 0, dispatches: 0, source: 'none' })
  assert.deepEqual(readModelUsage({ engName: '', dataDir: dir }, fs, env), { inputTokens: 0, outputTokens: 0, dispatches: 0, source: 'none' })
  fs.rmSync(dir, { recursive: true, force: true })
})

test('costEfficiency: findings/triaged ÷ 10万 input tokens(两位小数); tokens=0 → null 免除以零', () => {
  const r = costEfficiency({ findingsTotal: 6, triagedTotal: 2, inputTokens: 50_000 })
  assert.equal(r.findingsPer100k, 12) // 6 × 100000 / 50000
  assert.equal(r.triagedPer100k, 4)
  assert.equal(r.findings, 6)
  assert.equal(r.triaged, 2)
  assert.equal(r.inputTokens, 50000)
  const r2 = costEfficiency({ findingsTotal: 1, triagedTotal: 0, inputTokens: 30_000 })
  assert.equal(r2.findingsPer100k, 3.33) // 3.333… 两位小数
  assert.equal(r2.triagedPer100k, 0) // 0 产出也是有效数(非 null)
  const r0 = costEfficiency({ findingsTotal: 9, triagedTotal: 3, inputTokens: 0 })
  assert.equal(r0.findingsPer100k, null)
  assert.equal(r0.triagedPer100k, null)
})

test('buildSnapshot: modelUsage 注入 → cost 字段(当前 engagement findings/triaged × token 密度)', async () => {
  const s = await buildSnapshot(makeFake({
    byState: [{ state: 'candidate', n: 4 }, { state: 'triaged', n: 2 }],
  }), { eng: 'eng-x', modelUsage: { inputTokens: 100_000, outputTokens: 8000, dispatches: 10, source: 'per-eng' } })
  assert.deepEqual(
    { findings: s.cost.findings, triaged: s.cost.triaged, findingsPer100k: s.cost.findingsPer100k, triagedPer100k: s.cost.triagedPer100k, source: s.cost.source },
    { findings: 6, triaged: 2, findingsPer100k: 6, triagedPer100k: 2, source: 'per-eng' },
  )
  // 不传 modelUsage(旧调用方) → cost 全零降级, 快照不炸
  const s2 = await buildSnapshot(makeFake({ byState: [{ state: 'candidate', n: 1 }] }))
  assert.equal(s2.cost.inputTokens, 0)
  assert.equal(s2.cost.findingsPer100k, null)
  assert.equal(s2.cost.source, 'none')
})

// ── H17(外部审计): host/index.mjs 的 credential 路由曾嵌死在 `fleet || transition` 外层分支内 ──
// method='credential' 时外层条件恒假 → 整块处理逻辑是死代码, POST /d2d/api/credential 恒 404。
// 回归(黑盒驱动真实 handler): credential 路由须真实可达(200/405/400 分型正确),
// fleet 分派不受影响; 凭据值只落 0600 文件, 不得回显进响应。
function mountPanelHost(config = {}) {
  let handler = null
  applyHostRoutes({
    log: () => {},
    effect: (fn) => fn(),
    webServer: { register: (route) => { handler = route.handler } },
    webRuntime: { trustedHosts: [] },
  }, { graphdUrl: 'http://127.0.0.1:1', ...config })
  return handler
}

async function driveRoute(handler, method, pathname, body) {
  const req = new EventEmitter()
  req.method = method
  req.url = pathname
  req.headers = { host: '127.0.0.1:3000' } // loopback → 过浏览器信任栅栏
  const res = {
    code: 0, raw: '',
    writeHead(code) { this.code = code },
    end(b) { this.raw = String(b ?? '') },
  }
  const p = handler(req, res)
  await new Promise((r) => setImmediate(r))
  if (body !== undefined) req.emit('data', Buffer.from(JSON.stringify(body)))
  req.emit('end')
  await p
  let json = {}
  try { json = JSON.parse(res.raw || '{}') } catch {}
  return { code: res.code, body: json, raw: res.raw }
}

test('host 路由 H17: POST /d2d/api/credential 真实可达 — 凭据落 0600 refs, 值不回显', async () => {
  const saved = { DSH_HOME: process.env.DSH_HOME, P2P_HOST_TOKEN: process.env.P2P_HOST_TOKEN }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-h17-'))
  process.env.DSH_HOME = home
  process.env.P2P_HOST_TOKEN = 'test-token'
  try {
    // dsh 供应商目录(settings.yaml, providers@2 缩进形态) + 已存在的 credentials refs 文件
    fs.writeFileSync(path.join(home, 'settings.yaml'), [
      'providers:',
      '  prov-a:',
      '    - id: model-a',
      '      apiKeyEnv: PROV_A_API_KEY',
      '',
    ].join('\n'))
    fs.writeFileSync(path.join(home, '.credentials.yaml'), 'version: 1\n', { mode: 0o664 }) // 预存宽松权限: handler 落盘后必须收口 0600
    const handler = mountPanelHost()
    const r = await driveRoute(handler, 'POST', '/d2d/api/credential', { provider: 'prov-a', key: 'sk-test-12345678' })
    assert.equal(r.code, 200, r.raw)
    assert.deepEqual(r.body, { ok: true, provider: 'prov-a', env: 'PROV_A_API_KEY' })
    assert.ok(!r.raw.includes('sk-test-'), '凭据值不得回显进响应')
    const credPath = path.join(home, '.credentials.yaml')
    const merged = fs.readFileSync(credPath, 'utf8')
    // 中危审计修复(0910): 值统一双引号包裹(YAML 注入面归零)
    assert.ok(merged.includes('  PROV_A_API_KEY: "sk-test-12345678"'), merged)
    assert.equal(fs.statSync(credPath).mode & 0o777, 0o600, '凭据文件必须 0600')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('host 路由 H17: GET /d2d/api/credential → 405(旧版落不到写端点门, 恒 404)', async () => {
  process.env.P2P_HOST_TOKEN = 'test-token'
  const handler = mountPanelHost()
  const r = await driveRoute(handler, 'GET', '/d2d/api/credential', undefined)
  assert.equal(r.code, 405)
  assert.equal(r.body.error?.code, 'method-error')
})

test('host 路由 H17: credential 校验分型 — 未知供应商 400 / 短 key 400', async () => {
  const saved = { DSH_HOME: process.env.DSH_HOME, P2P_HOST_TOKEN: process.env.P2P_HOST_TOKEN }
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-h17-'))
  process.env.DSH_HOME = home
  process.env.P2P_HOST_TOKEN = 'test-token'
  try {
    fs.writeFileSync(path.join(home, 'settings.yaml'), 'providers:\n  prov-a:\n    - id: model-a\n      apiKeyEnv: PROV_A_API_KEY\n')
    fs.writeFileSync(path.join(home, '.credentials.yaml'), 'version: 1\n')
    const handler = mountPanelHost()
    const bad = await driveRoute(handler, 'POST', '/d2d/api/credential', { provider: 'nope', key: 'sk-test-12345678' })
    assert.equal(bad.code, 400)
    assert.equal(bad.body.error?.code, 'unknown-provider')
    const short = await driveRoute(handler, 'POST', '/d2d/api/credential', { provider: 'prov-a', key: 'short' })
    assert.equal(short.code, 400)
    assert.equal(short.body.error?.code, 'bad-request')
  } finally {
    fs.rmSync(home, { recursive: true, force: true })
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  }
})

test('host 路由 H17: fleet 分支不受影响(分派顺序不变, 校验错误仍 400 fleet-write-error)', async () => {
  process.env.P2P_HOST_TOKEN = 'test-token'
  const handler = mountPanelHost()
  const r = await driveRoute(handler, 'POST', '/d2d/api/fleet', { role: '', slot: 'primary', model: '' })
  assert.equal(r.code, 400)
  assert.equal(r.body.error?.code, 'fleet-write-error')
})

// ── 中危审计修复(0910): mergeCredentialRefs YAML 注入 + writeFleet 原型污染 ──
test('mergeCredentialRefs 中危4: 值含 `: `/换行不再注入任意 YAML(双引号包裹+转义)', () => {
  const evil = 'sk-1: injected\n  EVIL_KEY: owned # comment'
  const out = mergeCredentialRefs('version: 1\n', 'PROV_A_API_KEY', evil)
  const lines = out.split('\n')
  // 新值必须落在单行内且为双引号标量 — 换行被转义为 \n 字面量, 不能产生新 YAML 键
  assert.ok(lines.every((l) => !/^  EVIL_KEY:/.test(l)), out)
  assert.ok(out.includes('  PROV_A_API_KEY: "sk-1: injected\\n  EVIL_KEY: owned # comment"'), out)
  // 再合并(读回形态)不破坏 refs 段识别
  const out2 = mergeCredentialRefs(out, 'PROV_B_API_KEY', 'sk-2')
  assert.ok(out2.includes('  PROV_B_API_KEY: "sk-2"'), out2)
  assert.ok(out2.includes('  PROV_A_API_KEY:'), out2)
})

test('mergeCredentialRefs 中危4: 反斜杠/双引号/回车/制表符均转义, 值永远单标量', () => {
  const out = mergeCredentialRefs('version: 1\n', 'K', 'a\\b"c\rd\te')
  assert.ok(out.includes('  K: "a\\\\b\\"c\\rd\\te"'), out)
  assert.equal(out.split('\n').length, 4) // 'version: 1' + 尾空行 + 'refs:' + 单行条目
})

test('writeFleet 中危5: __proto__/constructor/prototype 角色名拒绝(原型污染归零)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-pollution-'))
  const env = { D2D_DATA_DIR: dir }
  try {
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'config', 'model-policies.json'), JSON.stringify({ default: { primary: '', backup: '' }, roles: { deep: { primary: 'p/1', backup: '' } } }))
    assert.throws(() => writeFleet({ role: '__proto__', slot: 'primary', model: 'a/b' }, env), /bad role id/)
    assert.throws(() => writeFleet({ role: 'constructor', slot: 'primary', model: 'a/b' }, env), /bad role id/)
    assert.throws(() => writeFleet({ role: 'prototype', slot: 'backup', model: 'a/b' }, env), /bad role id/)
    assert.equal(({}).primary, undefined, 'Object.prototype 不得被污染')
    assert.equal(({}).backup, undefined)
    // 正常角色照旧
    const f = writeFleet({ role: 'deep', slot: 'primary', model: 'p/z' }, env)
    assert.equal(f.roles.deep.primary, 'p/z')
    // 非法词形(注入符号/过长)同样拒绝
    assert.throws(() => writeFleet({ role: 'a'.repeat(65), slot: 'primary', model: 'a/b' }, env), /bad role id/)
    assert.throws(() => writeFleet({ role: 'x/y', slot: 'primary', model: 'a/b' }, env), /bad role id/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('readFleet 中危5: 手改文件带 __proto__ 键不并入(读侧过滤)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-pollution-read-'))
  const env = { D2D_DATA_DIR: dir }
  try {
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
    // JSON.parse 对 __proto__ 生成 own property(可直接序列化回文件)
    const raw = '{"default":{"primary":"","backup":""},"roles":{"__proto__":{"primary":"evil/1","backup":""},"deep":{"primary":"p/1","backup":""}}}'
    fs.writeFileSync(path.join(dir, 'config', 'model-policies.json'), raw)
    const f = readFleet(env)
    assert.ok(!Object.hasOwn(f.roles, '__proto__'), '读侧必须过滤 __proto__ 键(不得并入 roles)')
    assert.ok(!('primary' in {}), 'Object.prototype 不得被污染')
    assert.equal(f.roles.deep.primary, 'p/1')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

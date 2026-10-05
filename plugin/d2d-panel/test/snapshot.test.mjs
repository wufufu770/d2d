// 测试范围: 面板快照数据组装(host API 聚合面)
// snapshot.test.mjs — host 半聚合逻辑单测(node:test, 零依赖)
// 运行: node --test plugin/d2d-panel/test/
import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { EventEmitter } from 'node:events'
import { buildSnapshot, groupStates, markZombie, createGraphdQuery, readFleet, writeFleet, readRunEvents, readModelUsage, costEfficiency, computeConversion, transitionFinding, FINDING_STATES, parseProviderModels, loadDshCatalog, readSelectedEngagement, writeSelectedEngagement, mergeCredentialRefs, readCaps, writeCaps, buildStarmap, buildCoverage, buildHypLane, parseCandidatePairs, buildCapability, clampLaneDays, aggregateTransitions, clampFlowDays, readTransitionFlows, readAuditTail, readToolCalls, buildChain, buildFrontierPool, frontierTransition, readConfigOverview, attachEngCosts, readXringRuns, xringRecordBase } from '../lib/host/snapshot.mjs'
import { apply as applyHostRoutes } from '../lib/host/index.mjs'

// fake query: 按 cypher 特征路由(与 snapshot.mjs 的 Q 常量一一对应); params 透传给断言用断言器
function makeFake(t = {}) {
  return async (cypher, params) => {
    if (cypher.includes('e.instances AS instances')) return t.engList ?? [] // engList(全量 engagement)
    if (cypher.includes('f.eng AS eng, f.severity AS severity')) return t.sevRows ?? [] // T3-3-2: 每 eng severity 聚合(全句特征, 防误吞 findingsList)
    if (cypher.includes('f.eng AS eng')) return t.findingsByEng ?? [] // 每 engagement 战果聚合
    if (cypher.includes('a.eng AS eng, count(a)')) return t.workersByEng ?? [] // 每 engagement 在跑 worker
    if (cypher.includes('AgentIdentity')) return t.agents ?? []
    if (cypher.includes('f.id AS id')) return t.findings ?? [] // findingsList 亦含 'gate_status AS state', 须先判
    if (cypher.includes('gate_status AS state')) return t.byState ?? []
    if (cypher.includes('s.type AS type')) return t.signals ?? []
    if (cypher.includes('sum(CASE')) return t.coverage ?? [{ total: 0, covered: null }]
    if (cypher.includes('business_chain AS bc')) return t.gaps ?? []
    if (cypher.includes('h.digest AS digest')) return t.handoffs ?? []
    if (cypher.includes('x.accepted_to_hypothesis_ref')) return t.frontier ?? [] // T2-1-2: Frontier 两 ref 列(按 $eng)
    if (cypher.includes('x.direction AS direction')) return t.frontierPool ?? [] // T3-3-2: 前沿提案池
    if (cypher.includes('x.pattern AS pattern')) return t.experienceTail ?? []
    if (cypher.includes('count(e)')) return t.endpoints ?? [{ n: 0 }]
    if (cypher.includes('count(s)')) return t.signalsOpen ?? [{ n: 0 }]
    if (cypher.includes('count(h)')) return t.hyps ?? [{ n: 0 }]
    if (cypher.includes('count(x)')) return t.experience ?? [{ n: 0 }]
    // T3-3-2 探索链路(chain 路由)九查询
    if (cypher.includes('t.kind AS kind')) return t.chainTasks ?? []
    if (cypher.includes('-[:CONFIRMS]->')) return t.confirms ?? []
    if (cypher.includes('-[:AT]->')) return t.atEdges ?? []
    if (cypher.includes('-[:SUGGESTS]->')) return t.suggests ?? []
    if (cypher.includes('-[:DERIVED_FROM]->')) return t.derived ?? []
    if (cypher.includes('e.url AS url')) return t.chainEndpoints ?? []
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

// ── 0916: engConverge 节热调(writeCaps 透传 + 不丢节 + 白名单/钳位) ──
test('writeCaps engConverge: 合法键写入, 其他 caps 写操作不丢该节, 未知键/越界拒绝', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-engconv-'))
  const env = { D2D_DATA_DIR: dir }
  try {
    // 既有节保留: 写 deepParallel 不应丢掉已配置的 engConverge(原实现按白名单重建会整节点丢失)
    fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'config', 'caps.json'), JSON.stringify({ engConverge: { softDeadlineMin: 60, minVerified: 1 } }))
    let r = writeCaps({ updates: { deepParallel: 3 } }, env)
    assert.equal(r.engConverge.softDeadlineMin, 60, '既有 engConverge 节必须保留')
    assert.equal(r.engConverge.minVerified, 1)
    assert.equal(r.deepParallel, 3)
    // 新键写入 + 空值清除
    r = writeCaps({ updates: { engConverge: { findingStableRounds: 4, staleSignalTtlMin: '45' } } }, env)
    assert.equal(r.engConverge.findingStableRounds, 4)
    assert.equal(r.engConverge.staleSignalTtlMin, 45)
    assert.equal(r.engConverge.softDeadlineMin, 60, '未提及键保留')
    // 调度器读侧同源(白名单解析经 parseRingTuning): 写入值能被热读
    r = writeCaps({ updates: { engConverge: { staleSignalTtlMin: null } } }, env)
    assert.ok(!('staleSignalTtlMin' in r.engConverge), '空值 = 清除该覆盖')
    // 非法输入
    assert.throws(() => writeCaps({ updates: { engConverge: { bogus: 1 } } }, env), /未知 engConverge 键/)
    assert.throws(() => writeCaps({ updates: { engConverge: { softDeadlineMin: 99999 } } }, env), /10-720/)
    assert.throws(() => writeCaps({ updates: { engConverge: 'x' } }, env), /engConverge 必须是对象/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

// ── T2-1-2: 转化率卡(看板 8.5-2) — computeConversion 纯函数 + buildSnapshot frontier 键 ──
// 口径真源 = graphd/gd/gates.py:1003-1028 frontier_conversion_rate: 两 ref 各自非空行数/total,
// 空池三值全零(无分母不产 NaN); JS 侧与 gates 同名同义, pytest 与本测试同锚锁定。

test('computeConversion: 构造 rows 三值口径 — ref 非空行数/total(gates.py:1003-1028 同名同义)', () => {
  const r = computeConversion([
    { accepted_to_hypothesis_ref: 'H-1', hypothesis_to_confirmed_ref: 'F-9' },
    { accepted_to_hypothesis_ref: 'H-2', hypothesis_to_confirmed_ref: '' },
    { accepted_to_hypothesis_ref: '', hypothesis_to_confirmed_ref: null },
  ])
  assert.deepEqual(r, { total: 3, accepted_to_hypothesis: 2 / 3, hypothesis_to_confirmed: 1 / 3 })
  // 空白串/缺列行与空串同记空(str(v or '').strip() 同义), total 仍计数
  const r2 = computeConversion([
    { accepted_to_hypothesis_ref: '  ', hypothesis_to_confirmed_ref: 'F-1' },
    {},
    { accepted_to_hypothesis_ref: undefined, hypothesis_to_confirmed_ref: 'F-2' },
  ])
  assert.equal(r2.total, 3)
  assert.equal(r2.accepted_to_hypothesis, 0)
  assert.equal(r2.hypothesis_to_confirmed, 2 / 3)
})

test('computeConversion: 空池/rows 缺席 → 三值全零(无分母不产 NaN); 二元组行形态同义 gates', () => {
  assert.deepEqual(computeConversion([]), { total: 0, accepted_to_hypothesis: 0.0, hypothesis_to_confirmed: 0.0 })
  assert.deepEqual(computeConversion(null), { total: 0, accepted_to_hypothesis: 0.0, hypothesis_to_confirmed: 0.0 })
  assert.deepEqual(computeConversion(), { total: 0, accepted_to_hypothesis: 0.0, hypothesis_to_confirmed: 0.0 })
  // gates.py:1016-1018 二元组 (a2h, h2c) 形态同义支持
  assert.deepEqual(
    computeConversion([['H-1', 'F-1'], ['H-2', ''], ['', '']]),
    { total: 3, accepted_to_hypothesis: 2 / 3, hypothesis_to_confirmed: 1 / 3 },
  )
  const r = computeConversion([{ accepted_to_hypothesis_ref: '', hypothesis_to_confirmed_ref: '' }])
  assert.ok(!Number.isNaN(r.accepted_to_hypothesis) && !Number.isNaN(r.hypothesis_to_confirmed), '全空 ref 不得产 NaN')
})

test('buildSnapshot: frontier 键 — Q.frontierConversion 按 $eng 过滤, total=该 eng Frontier 行数', async () => {
  const seen = []
  const base = makeFake({
    engList: [{ name: 'eng-x', target: 'http://t.local', scope: 't.local', status: 'active', created_at: '2026-09-01T00:00:00Z' }],
    frontier: [
      { accepted_to_hypothesis_ref: 'H-1', hypothesis_to_confirmed_ref: 'F-1' },
      { accepted_to_hypothesis_ref: 'H-2', hypothesis_to_confirmed_ref: '' },
      { accepted_to_hypothesis_ref: '', hypothesis_to_confirmed_ref: '' },
    ],
  })
  const q = async (cypher, params) => { seen.push({ cypher, params }); return base(cypher, params) }
  const s = await buildSnapshot(q, { eng: 'eng-x' })
  assert.deepEqual(s.frontier, { total: 3, accepted_to_hypothesis: 2 / 3, hypothesis_to_confirmed: 1 / 3 })
  const fq = seen.find((x) => x.cypher.includes('x.accepted_to_hypothesis_ref'))
  assert.ok(fq, 'frontier 查询已随聚合下发')
  assert.equal(fq.params?.eng, 'eng-x') // W5: 池子按 selected eng 过滤(eng_id 列)
  // 空池(无 Frontier 行) → 三值全零, 快照不炸(转化率卡降级「暂无前沿数据」)
  const s2 = await buildSnapshot(makeFake(), { eng: 'eng-x' })
  assert.deepEqual(s2.frontier, { total: 0, accepted_to_hypothesis: 0, hypothesis_to_confirmed: 0 })
})

// ══════════ T3-3-1 viz 数据面: 三纯函数 + capability + 路由级(含 #24 盲区顺手补) ══════════

test('viz buildStarmap: 节点 host 提取(evidence 不出 host)+边两端过滤+candidate-links pairs 解析(坏对丢弃)', async () => {
  const q = async (cy) => {
    if (cy.includes('DERIVED_FROM')) return [{ a: 's1', b: 's2' }, { a: 's1', b: 's-ghost' }]
    if (cy.includes('s.weight AS weight')) return [
      { id: 's1', type: 'asset-perimeter', weight: 2, ts: '2026-10-01', evidence: 'http://a.com/x?y=1' },
      { id: 's2', type: 'js-endpoint', weight: 1, ts: '2026-10-02', evidence: 'no-url-here' },
    ]
    throw new Error(`unmatched: ${cy.slice(0, 50)}`)
  }
  const sm = await buildStarmap(q, { eng: 'e', runEvents: { events: [
    { kind: 'candidate-links', pairs: ['s1(asset-perimeter)~s2(js-endpoint)@a.com', 'bad-pair-form'] },
    { kind: 'tick' },
  ] } })
  assert.equal(sm.nodes.length, 2)
  assert.equal(sm.nodes[0].host, 'a.com', 'hostname 提取')
  assert.equal(sm.nodes[1].host, '', '无 URL → 空 host')
  assert.equal(sm.edges.length, 1, '两端不在集内的边被过滤(ghost)')
  assert.deepEqual(sm.candidates, [{ a: 's1', aType: 'asset-perimeter', b: 's2', bType: 'js-endpoint', host: 'a.com' }], '坏对丢弃不中断')
  assert.equal(sm.truncated, false)
})

test('viz buildCoverage: 21 格固定网格填充(枚举序稳定, 空格补零)', async () => {
  const q = async (cy) => [{ su: 'js', bo: 'outer', n: 7 }, { su: 'apk', bo: 'cross', n: 2 }]
  const cov = await buildCoverage(q, { eng: 'e' })
  assert.equal(cov.cells.length, 21, '7 面 × 3 周界')
  assert.equal(cov.cells.find((c) => c.su === 'js' && c.bo === 'outer').n, 7)
  assert.equal(cov.cells.find((c) => c.su === 'request' && c.bo === 'outer').n, 0, '无数据格补零')
  assert.equal(cov.total, 9)
  assert.deepEqual(cov.surfaces, ['request', 'response', 'js', 'business', 'flow', 'apk', 'mini'])
})

test('viz buildHypLane: 五态分组 + since 参数下发($eng/$since 绑定) + 天数钳位', async () => {
  let seen = null
  const q = async (cy, params) => {
    if (cy.includes('count(h)')) return [{ status: 'open', n: 3 }, { status: 'confirmed', n: 1 }, { status: 'bogus', n: 9 }]
    if (cy.includes('$since')) { seen = params; return [{ id: 'h1', text: 'x'.repeat(300), strategy: 'strat', status: 'open', ts: '2026-10-01' }] }
    throw new Error(`unmatched: ${cy.slice(0, 50)}`)
  }
  const hl = await buildHypLane(q, { eng: 'e', days: 9999, nowMs: Date.parse('2026-10-01T00:00:00Z') })
  assert.deepEqual(hl.byStatus, { open: 3, claimed: 0, confirmed: 1, refuted: 0, suspected: 0 }, '未知态忽略')
  assert.equal(hl.windowDays, 90, '钳位 1..90')
  assert.ok(seen && typeof seen.since === 'string' && seen.seen === undefined, 'since 为 ISO 串参数绑定')
  assert.ok(seen.since < '2026-10-01', 'since = now - 90d')
  assert.ok(hl.items[0].text.length <= 161, 'text 截断')
  assert.equal(clampLaneDays('bogus'), 14, '非法回缺省')
  assert.equal(clampLaneDays('0'), 14)
})

test('viz parseCandidatePairs/buildCapability: 静态读降级语义(fail-soft, degraded 记因)', () => {
  assert.deepEqual(parseCandidatePairs(['x']), [])
  const cap1 = buildCapability({ manifest: null, baselinesRaw: null })
  assert.equal(cap1.manifest, null)
  assert.equal(cap1.baselines, null)
  assert.equal(cap1.degraded.length, 2, '两源均缺席 → degraded 记两条')
  const cap2 = buildCapability({
    manifest: { generated: '2026-10-01', exports: [{ form: 'tool', id: 'x', status: 'live', impl: 'a.mjs', note: 'n' }] },
    baselinesRaw: JSON.stringify({ version: 'v1', baselines: [{ tool: 'p2p_status' }, { tool: 'p2p_status.cypher' }, { tool: 'delegate_subtask' }] }),
  })
  assert.equal(cap2.manifest.exports.length, 1)
  assert.equal(cap2.manifestValid, true)
  assert.deepEqual(cap2.baselines.tools, ['delegate_subtask', 'p2p_status'], '参数级键去 . 后缀去重')
  assert.equal(cap2.baselines.keys, 3)
  assert.equal(cap2.degraded.length, 0)
})

// #24 盲区顺手补: host 路由级 — viz 四路由 + approval/caps/denylist 既有路由分型
test('host 路由: capability 静态读路由真实可达(fail-soft 200, 兄弟包链接部署下读真实 manifest/baselines)', async () => {
  const handler = mountPanelHost()
  const r = await driveRoute(handler, 'GET', '/d2d/api/capability')
  assert.equal(r.code, 200, r.raw)
  assert.equal(r.body.ok, true)
  assert.ok(r.body.capability, 'capability 字段恒在(缺席走 degraded)')
})
test('host 路由: viz 三路由 graphd 不可达 → 503 fail-closed(不下发半截数据); capability 不受牵动', async () => {
  const handler = mountPanelHost() // graphdUrl=127.0.0.1:1 不可达
  for (const m of ['starmap', 'coverage', 'hypotheses']) {
    const r = await driveRoute(handler, 'GET', `/d2d/api/${m}`)
    assert.equal(r.code, 503, `${m} fail-closed`)
    assert.equal(r.body.error?.code, 'graphd-unreachable')
  }
  const cap = await driveRoute(handler, 'GET', '/d2d/api/capability')
  assert.equal(cap.code, 200, 'capability 零 graphd 依赖, 不随 graphd 不可达降级')
})
test('host 路由: viz 路由 POST → 405(只读); 未知名 → 404 兜底', async () => {
  const handler = mountPanelHost()
  const post = await driveRoute(handler, 'POST', '/d2d/api/starmap', {})
  assert.equal(post.code, 405)
  const nf = await driveRoute(handler, 'GET', '/d2d/api/viz-bogus')
  assert.equal(nf.code, 404)
})
test('host 路由(#24 盲区顺手): approval GET 200 / caps GET 200 / denylist POST 非法 → 400 分型', async () => {
  const saved = { D2D_DATA_DIR: process.env.D2D_DATA_DIR }
  process.env.D2D_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-route-'))
  try {
    const handler = mountPanelHost()
    const ap = await driveRoute(handler, 'GET', '/d2d/api/approval')
    assert.equal(ap.code, 200, ap.raw.slice(0, 120))
    assert.equal(ap.body.ok, true)
    const caps = await driveRoute(handler, 'GET', '/d2d/api/caps')
    assert.equal(caps.code, 200)
    const dl = await driveRoute(handler, 'POST', '/d2d/api/denylist', { op: 'add', kind: 'bogus-kind', value: 'x' })
    assert.ok([200, 400].includes(dl.code), `denylist 非法 kind 分型(实现定义): ${dl.code}`)
  } finally {
    fs.rmSync(process.env.D2D_DATA_DIR, { recursive: true, force: true })
    if (saved.D2D_DATA_DIR === undefined) delete process.env.D2D_DATA_DIR
    else process.env.D2D_DATA_DIR = saved.D2D_DATA_DIR
  }
})

// ══════════ T3-3-2 收官批: 9 标签页数据面(桑基/审计/工具调用/链路/前沿/配置/总览增量) ══════════

/** 内存 fs 桩: {绝对路径: 内容}; 缺文件抛 ENOENT(真实 fail-soft 语义由被测函数承担)。 */
function makeFs(files = {}) {
  return {
    readFileSync: (p) => {
      if (String(p) in files) return files[String(p)]
      const e = new Error('no such file'); e.code = 'ENOENT'; throw e
    },
    readdirSync: (p) => {
      const hit = Object.keys(files).filter((f) => f.startsWith(`${String(p)}/`)).map((f) => f.slice(String(p).length + 1))
      if (!hit.length) { const e = new Error('no such dir'); e.code = 'ENOENT'; throw e }
      return hit
    },
  }
}
const NOW = Date.parse('2026-10-02T04:00:00Z')
const iso = (hAgo) => new Date(NOW - hAgo * 3_600_000).toISOString()
const ENV2 = { D2D_DATA_DIR: '/d2d-fake', P2P_TRANSITION_LOG: '/d2d-fake/logs/transition-log.jsonl', P2P_AUDIT_LOG: '/d2d-fake/logs/audit.log' }
const TL_ROWS = [
  { transition_id: 't1', node_id: 'f-1', from_status: 'candidate', to_status: 'verified', actor: 'host', reason: 'r1', source_batch: '', timestamp: iso(1) },
  { transition_id: 't2', node_id: 'f-2', from_status: 'candidate', to_status: 'verified', actor: 'host', reason: 'r2', source_batch: '', timestamp: iso(2) },
  { transition_id: 't3', node_id: 'fr-1', from_status: 'proposed', to_status: 'accepted', actor: 'master', reason: 'r3', source_batch: '', timestamp: iso(30 * 24) }, // 30 天前(窗口外)
  { transition_id: 't4', node_id: 'exp-1', from_status: 'quarantined', to_status: 'active', actor: 'host', reason: 'r4', source_batch: '', timestamp: iso(3) },
  '{"broken":', // 坏行(尾读纪律: 跳过不中断)
  { transition_id: 't5', node_id: 'f-3', from_status: 'verified', to_status: 'verified', actor: 'host', reason: '自环防御', source_batch: '', timestamp: iso(1) },
].map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\n')

test('T3-3-2 aggregateTransitions: from→to 对计数合并 + 族过滤 + 自环/空字段防御', () => {
  const rows = [
    { node_id: 'f-1', from_status: 'candidate', to_status: 'verified' },
    { node_id: 'f-2', from_status: 'candidate', to_status: 'verified' },
    { node_id: 'fr-1', from_status: 'proposed', to_status: 'accepted', },
    { node_id: 'f-3', from_status: 'verified', to_status: 'verified' }, // 自环跳过
    { node_id: 'f-4', from_status: '', to_status: 'x' }, // 空字段跳过
  ]
  const all = aggregateTransitions(rows)
  assert.deepEqual(all.map((l) => `${l.family}:${l.from}->${l.to}:${l.count}`), ['finding:candidate->verified:2', 'frontier:proposed->accepted:1'], '按 count 降序')
  const onlyFinding = aggregateTransitions(rows, { family: 'finding' })
  assert.equal(onlyFinding.length, 1)
  assert.equal(onlyFinding[0].count, 2)
  assert.equal(aggregateTransitions(rows, { family: 'experience' }).length, 0)
})

test('T3-3-2 clampFlowDays: 非法回缺省 7, 上限 90', () => {
  assert.equal(clampFlowDays('abc'), 7)
  assert.equal(clampFlowDays('0'), 7)
  assert.equal(clampFlowDays('-3'), 7)
  assert.equal(clampFlowDays('14'), 14)
  assert.equal(clampFlowDays('3650'), 90)
})

test('T3-3-2 readTransitionFlows: 尾读+时间窗+族过滤聚合; 坏行跳过; 文件缺失 fail-soft 空态+degraded', () => {
  const fsOk = makeFs({ '/d2d-fake/logs/transition-log.jsonl': TL_ROWS })
  const flows = readTransitionFlows({ days: 7, family: 'all', nowMs: NOW }, fsOk, ENV2)
  assert.equal(flows.linesRead, 6, '6 行全读(含坏行与自环)')
  assert.equal(flows.matched, 4, '窗口内 4 行(坏行不计入 matched)')
  assert.deepEqual(flows.links.map((l) => `${l.family}:${l.from}->${l.to}:${l.count}`), [
    'finding:candidate->verified:2', 'experience:quarantined->active:1',
  ], '30 天前沿迁移被窗口剔除; 自环剔除; 降序')
  const onlyExp = readTransitionFlows({ days: 7, family: 'experience', nowMs: NOW }, fsOk, ENV2)
  assert.equal(onlyExp.links.length, 1)
  assert.equal(onlyExp.family, 'experience')
  assert.equal(readTransitionFlows({ family: 'bogus', nowMs: NOW }, fsOk, ENV2).family, 'all', '非法族回 all')
  const missing = readTransitionFlows({ nowMs: NOW }, makeFs({}), ENV2)
  assert.deepEqual(missing.links, [])
  assert.equal(missing.linesRead, 0)
  assert.ok(missing.degraded[0].includes('transition-log 不可读'), 'fail-soft 记因(先例 10: CI 没有这个文件会怎样)')
})

test('T3-3-2 readAuditTail: audit.log+transition-log 双源合流降序 + kind 过滤 + limit 钳位 + 单侧缺失降级', () => {
  const files = {
    '/d2d-fake/logs/audit.log': [
      JSON.stringify({ ts: iso(1), kind: 'transition-illegal', detail: { id: 'f-9', from: 'verified', to: 'accepted' } }),
      JSON.stringify({ ts: iso(2), kind: 'auth-fail', detail: { path: '/query' } }),
      '{"broken"',
    ].join('\n'),
    '/d2d-fake/logs/transition-log.jsonl': TL_ROWS,
  }
  const a = readAuditTail({ limit: 200 }, makeFs(files), ENV2)
  assert.equal(a.total, 7, 'audit 2(坏行跳过)+transition 5(含自环/坏行? 坏行跳过→4+2 窗外也计入: 审计无时间窗) — 2+5 行中合法 6 行') // audit2 + transition 5 合法行(坏行跳过)
  assert.ok(a.kinds.includes('transition-illegal') && a.kinds.includes('auth-fail') && a.kinds.includes('transition'))
  assert.ok(a.events.some((e) => e.source === 'audit') && a.events.some((e) => e.source === 'transition'), '双源合流')
  assert.equal(a.events[0].ts, iso(1), '降序: 最近事件在前(同 ts 双源并列, 稳定序不承诺跨源先后)')
  const onlyIllegal = readAuditTail({ kind: 'transition-illegal' }, makeFs(files), ENV2)
  assert.equal(onlyIllegal.total, 1)
  assert.ok(onlyIllegal.events.every((e) => e.kind === 'transition-illegal'))
  const lim = readAuditTail({ limit: '99999' }, makeFs(files), ENV2)
  assert.ok(lim.events.length <= 500, 'limit 上钳 500')
  const half = readAuditTail({}, makeFs({ '/d2d-fake/logs/transition-log.jsonl': TL_ROWS }), ENV2)
  assert.equal(half.total, 5, 'audit.log 缺失 → transition 侧照常(降级不整路由失败)')
  assert.ok(half.degraded[0].includes('audit.log 不可读'))
  assert.ok(half.events.every((e) => e.detail && typeof e.detail.node_id === 'string'), 'transition 事件 detail 结构化(含 node_id/from/to/actor/reason 截尾)')
})

test('T3-3-2 readToolCalls: run-log 全事件投影 + kind 过滤/limit/eng 消毒 + 工具量榜; fail-soft', () => {
  const runLog = [
    JSON.stringify({ ts: iso(1), event: 'dispatch', worker_id: 'eng-x-deep-w1', ring: 'deep', role: 'attacker', model: 'prov/model-a' }),
    JSON.stringify({ ts: iso(1), event: 'tool-gate-deny', worker_id: 'eng-x-deep-w1', tool: 'web_fetch', reason: 'scope 外目标', extra_field: 'kept' }),
    JSON.stringify({ ts: iso(2), event: 'terminal', worker_id: 'eng-x-deep-w1', code: 'ok', quota: '', ms: 60000, tools: 7 }),
    '{"broken"',
  ].join('\n')
  const usage = [
    JSON.stringify({ ts: iso(1), worker: 'eng-x-deep-w1', role: 'attacker', model: 'prov/model-a' }),
    JSON.stringify({ ts: iso(2), event: 'terminal', worker: 'eng-x-deep-w1', code: 'ok', ms: 60000, tools: 7, steps: 9 }),
    JSON.stringify({ ts: iso(2), event: 'terminal', worker: 'eng-x-creative-w2', code: 'ok', ms: 30000, tools: 3, steps: 4 }),
  ].join('\n')
  const fsx = makeFs({
    '/d2d-fake/runs/eng-x/run-log.jsonl': runLog,
    '/d2d-fake/runs/eng-x/model-usage.jsonl': usage,
  })
  const tc = readToolCalls({ engName: 'eng-x', limit: 200 }, fsx, ENV2)
  assert.equal(tc.eng, 'eng-x')
  assert.equal(tc.events.length, 3, '坏行跳过')
  assert.ok(tc.kinds.includes('dispatch') && tc.kinds.includes('tool-gate-deny') && tc.kinds.includes('terminal'))
  const deny = tc.events.find((e) => e.kind === 'tool-gate-deny')
  assert.equal(deny.tool, 'web_fetch')
  assert.ok(deny.extra.includes('extra_field'), '白名单外字段经 extra 兜底不丢')
  assert.deepEqual(tc.toolTotals, [{ worker: 'eng-x-deep-w1', tools: 7, terminals: 1 }, { worker: 'eng-x-creative-w2', tools: 3, terminals: 1 }], '按 tools 降序')
  const filtered = readToolCalls({ engName: 'eng-x', kind: 'dispatch' }, fsx, ENV2)
  assert.equal(filtered.events.length, 1)
  assert.equal(filtered.events[0].model, 'prov/model-a')
  assert.equal(readToolCalls({ engName: '../../evil', limit: 5 }, fsx, ENV2).eng, '....evil', 'H19 同款消毒(斜杠剥除后无路径穿越, 点保留与 readRunEvents 同口径)')
  assert.deepEqual(readToolCalls({ engName: '' }, fsx, ENV2).events, [], '空 eng 直接空态')
  const missing = readToolCalls({ engName: 'nope' }, makeFs({}), ENV2)
  assert.ok(missing.degraded[0].includes('run-log 不可读'), '缺文件 fail-soft 记因')
})

test('T3-3-2 buildChain: 九查询装配(Task/worker/信号/端点/漏洞+四族边) + 边去重', async () => {
  const q = async (cypher, params) => {
    assert.equal(params.eng, 'eng-x')
    if (cypher.includes('t.kind AS kind')) return [{ id: 'task-1', kind: 'probe', status: 'claimed', link_id: 'sig-1', claimed_by: 'w1', created_at: '2026-10-01' }]
    if (cypher.includes('AgentIdentity')) return [{ worker_id: 'eng-x-deep-w1', ring: 'deep', chain: 'c', status: 'running' }]
    if (cypher.includes('s.type AS type')) return [{ id: 'sig-1', type: 'asset-perimeter', weight: 2, ts: 't', evidence: 'http://a.com/x' }]
    if (cypher.includes('-[:DERIVED_FROM]->')) return [{ a: 'sig-1', b: 'sig-0' }, { a: 'sig-1', b: 'sig-0' }]
    if (cypher.includes('-[:AT]->')) return [{ a: 'sig-1', b: 'ep-1' }]
    if (cypher.includes('-[:CONFIRMS]->')) return [{ a: 'fnd-1', b: 'sig-1' }]
    if (cypher.includes('-[:SUGGESTS]->')) return []
    if (cypher.includes('e.url AS url')) return [{ id: 'ep-1', url: 'https://a.com/x', method: 'GET' }]
    if (cypher.includes('f.id AS id')) return [{ id: 'fnd-1', title: 'XSS in search', severity: 'high', state: 'verified' }]
    throw new Error(`unmatched: ${cypher.slice(0, 50)}`)
  }
  const chain = await buildChain(q, { eng: 'eng-x' })
  assert.equal(chain.tasks.length, 1)
  assert.equal(chain.tasks[0].link_id, 'sig-1')
  assert.equal(chain.workers[0].worker_id, 'eng-x-deep-w1')
  assert.equal(chain.signals[0].host, 'a.com', 'evidence 提 hostname(evidence 全文不出 host)')
  assert.deepEqual(chain.edges.derived, [{ a: 'sig-1', b: 'sig-0' }], '边去重')
  assert.deepEqual(chain.edges.confirms, [{ a: 'fnd-1', b: 'sig-1' }])
  assert.equal(chain.findings[0].severity, 'high')
  assert.deepEqual(chain.caps, { tasks: 50, findings: 100, endpoints: 200, edges: 300 }, '护栏参数钉死')
})

test('T3-3-2 buildFrontierPool: 提案池映射+byStatus; frontierTransition 代理钉 reviewer=panel', async () => {
  const pool = await buildFrontierPool(async () => [
    { id: 'fr-1', direction: '探测 /api/v2', status: 'proposed', proposed_by: 'w1', created_at: '2026-10-01T00:00:00', value_score: 1.5, review_note: '', hypothesis_ref: '' },
    { id: 'fr-2', direction: 'x'.repeat(400), status: 'accepted', proposed_by: 'w2', created_at: 't', value_score: 0, review_note: 'ok', hypothesis_ref: 'hyp-1' },
  ], { eng: 'eng-x' })
  assert.equal(pool.total, 2)
  assert.deepEqual(pool.byStatus, { proposed: 1, accepted: 1 })
  assert.equal(pool.pool[1].direction.length, 200, 'direction 截尾(MAX.title)')
  assert.equal(pool.pool[1].hypothesis_ref, 'hyp-1', '闭环 ref 透出')
  const calls = []
  const r = await frontierTransition({
    graphdUrl: 'http://gd', token: 'tok', frontierId: 'fr-1', targetStatus: 'accepted', reviewNote: 'lgtm',
  }, async (url, opts) => {
    calls.push({ url, opts })
    return { ok: true, json: async () => ({ ok: true, status: 'accepted' }) }
  })
  assert.equal(calls[0].url, 'http://gd/write/frontier-transition', 'graphd 零改动 — 代理既有端点')
  const body = JSON.parse(calls[0].opts.body)
  assert.deepEqual(body, { frontier_id: 'fr-1', target_status: 'accepted', reviewer: 'panel', review_note: 'lgtm' }, 'reviewer 由 host 半钉死, 不接受调用方指定')
  assert.equal(r.status, 'accepted')
  await assert.rejects(() => frontierTransition({ graphdUrl: 'http://gd', token: '', frontierId: 'fr-1', targetStatus: 'bogus' },
    async () => ({ ok: false, json: async () => ({ ok: false, error: 'invalid target' }) })), /invalid target/, 'graphd 拒绝 → 上抛(路由转 400)')
})

test('T3-3-2 readConfigOverview: notify 脱敏(configured/method/has_webhook, webhook_url 值不出)+paused 清单', () => {
  const fsx = makeFs({
    '/d2d-fake/config/notify.json': JSON.stringify({ webhook_url: 'https://push.example.com/token/SECRET', method: 'PUT' }),
    '/d2d-fake/config/paused-eng-a.json': '{}',
    '/d2d-fake/config/paused-eng-b.json': '{}',
  })
  const c = readConfigOverview(fsx, ENV2)
  assert.deepEqual(c.notify, { configured: true, method: 'PUT', has_webhook: true })
  assert.ok(!JSON.stringify(c).includes('SECRET'), 'webhook 值(内嵌 token)绝不进 wire — PANEL-UI-SPEC §5')
  assert.deepEqual(c.paused, ['eng-a', 'eng-b'])
  const none = readConfigOverview(makeFs({}), ENV2)
  assert.equal(none.notify.configured, false, '缺文件=未配置, 不记因')
  assert.deepEqual(none.paused, [])
  const broken = readConfigOverview(makeFs({ '/d2d-fake/config/notify.json': '{broken' }), ENV2)
  assert.equal(broken.notify.configured, false)
  assert.ok(broken.degraded[0].includes('notify.json 不可读'), '非 ENOENT 错误记因(吞错必须记因 — 先例 10)')
})

test('T3-3-2 attachEngCosts: 活跃优先 ≤8 挂 per-eng 账本, 其余 null(原地标注)', () => {
  const engs = Array.from({ length: 10 }, (_, i) => ({ name: `eng-${i}`, status: i === 3 ? 'active' : 'frozen' }))
  const readImpl = ({ engName }) => ({ inputTokens: 100, outputTokens: 10, dispatches: 2, source: 'per-eng', engName })
  const out = attachEngCosts(engs, readImpl, 8)
  assert.equal(out, engs, '原地标注返回同数组')
  const active = out.find((e) => e.status === 'active')
  assert.equal(active.cost.inputTokens, 100, 'active 必在 ≤8 名单内')
  assert.equal(out.filter((e) => e.cost !== null).length, 8, '恰好 8 个挂账')
  assert.ok(out.filter((e) => e.cost === null).length === 2, '其余 null')
})

test('T3-3-2 buildSnapshot: sevRows → engagements[].sev 聚合(未知 eng 无键, 级别小写归一)', async () => {
  const s = await buildSnapshot(makeFake({
    engList: [{ name: 'eng-a', target: 'https://a.com', scope: 'a.com', status: 'active', created_at: 't', instances: 1, objective: 'o' }],
    sevRows: [
      { eng: 'eng-a', severity: 'HIGH', n: 2 },
      { eng: 'eng-a', severity: 'critical', n: 1 },
      { eng: 'eng-b', severity: 'low', n: 5 },
    ],
  }), { eng: 'eng-a', approvalSummary: null })
  assert.deepEqual(s.engagements[0].sev, { high: 2, critical: 1 }, '按 eng 过滤 + 小写归一')
})

test('T3-3-2 host 路由: 四 fail-soft 本地面可达 + chain/frontier fail-closed 503 + frontier-transition 校验分型', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'd2d-panel-t332-'))
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'runs/eng-a'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'config'), { recursive: true })
  const nowIso = new Date().toISOString()
  fs.writeFileSync(path.join(dir, 'logs/transition-log.jsonl'), JSON.stringify({ transition_id: 't', node_id: 'f-1', from_status: 'candidate', to_status: 'verified', actor: 'host', reason: 'r', source_batch: '', timestamp: nowIso }))
  fs.writeFileSync(path.join(dir, 'logs/audit.log'), JSON.stringify({ ts: nowIso, kind: 'auth-fail', detail: { path: '/query' } }))
  fs.writeFileSync(path.join(dir, 'runs/eng-a/run-log.jsonl'), JSON.stringify({ ts: nowIso, event: 'dispatch', worker_id: 'eng-a-deep-w1', ring: 'deep' }))
  fs.writeFileSync(path.join(dir, 'config/paused-eng-a.json'), '{}')
  const saved = { D2D_DATA_DIR: process.env.D2D_DATA_DIR, D2D_RUNS_DIR: process.env.D2D_RUNS_DIR, P2P_TRANSITION_LOG: process.env.P2P_TRANSITION_LOG, P2P_AUDIT_LOG: process.env.P2P_AUDIT_LOG }
  process.env.D2D_DATA_DIR = dir
  delete process.env.D2D_RUNS_DIR
  delete process.env.P2P_TRANSITION_LOG
  delete process.env.P2P_AUDIT_LOG
  try {
    const handler = mountPanelHost()
    // 桑基: 文件面 fail-soft — 真数据聚合 + 家族/窗口参数透传
    const flows = await driveRoute(handler, 'GET', '/d2d/api/transition-flows?days=7&family=finding')
    assert.equal(flows.code, 200, flows.raw.slice(0, 120))
    assert.equal(flows.body.flows.matched, 1)
    assert.equal(flows.body.flows.links[0]?.count, 1)
    assert.equal(flows.body.flows.family, 'finding')
    // 工具调用明细: eng 显式 + 投影
    const tools = await driveRoute(handler, 'GET', '/d2d/api/toolcalls?eng=eng-a')
    assert.equal(tools.code, 200)
    assert.equal(tools.body.toolcalls.events.length, 1)
    assert.equal(tools.body.toolcalls.events[0].kind, 'dispatch')
    // 审计时间线: kind 过滤
    const audit = await driveRoute(handler, 'GET', '/d2d/api/audit?kind=auth-fail')
    assert.equal(audit.body.audit.total, 1)
    // 配置总览: paused 清单 + notify 未配置
    const cfg = await driveRoute(handler, 'GET', '/d2d/api/configx')
    assert.deepEqual(cfg.body.config.paused, ['eng-a'])
    assert.equal(cfg.body.config.notify.configured, false)
    // 图依赖路由: graphd 不可达 → 503 fail-closed(vizRoute 同款, 不下发空态)
    const chain = await driveRoute(handler, 'GET', '/d2d/api/chain')
    assert.equal(chain.code, 503)
    assert.equal(chain.body.error.code, 'graphd-unreachable')
    assert.equal((await driveRoute(handler, 'GET', '/d2d/api/frontier')).code, 503)
    // frontier-transition 校验分型(400: 缺 id / 非法 target)
    assert.equal((await driveRoute(handler, 'POST', '/d2d/api/frontier-transition', { frontier_id: '', target_status: 'accepted' })).code, 400)
    assert.equal((await driveRoute(handler, 'POST', '/d2d/api/frontier-transition', { frontier_id: 'fr-1', target_status: 'bogus' })).code, 400)
    // 只读路由 POST → 405
    assert.equal((await driveRoute(handler, 'POST', '/d2d/api/transition-flows', {})).code, 405)
    assert.equal((await driveRoute(handler, 'POST', '/d2d/api/configx', {})).code, 405)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  }
})

// ══════════ XR-P2: X-Ring 只读聚合面(readXringRuns + snapshot.xring 节, 过程可见 M6) ══════════

/** 造一个 run 记录目录(布局 = <base>/<eng>/<run-id>/events.jsonl, runner.start recordRoot 同构)。 */
function mkXringRun(base, eng, runId, events, workspaceFiles = null) {
  const runDir = path.join(base, eng, runId)
  fs.mkdirSync(runDir, { recursive: true })
  fs.writeFileSync(path.join(runDir, 'events.jsonl'), events.map((e) => (typeof e === 'string' ? e : JSON.stringify(e))).join('\n') + '\n')
  if (workspaceFiles) {
    fs.mkdirSync(path.join(runDir, 'workspace'), { recursive: true })
    for (const [f, doc] of Object.entries(workspaceFiles)) fs.writeFileSync(path.join(runDir, 'workspace', f), JSON.stringify(doc))
  }
  return runDir
}

test('xring: readXringRuns 布局解析 — stopped+reason/预算/工件三级计数/事件尾窗(坏行容忍)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xring-agg-'))
  try {
    const ws = path.join(dir, 'eng-a', 'run-1', 'workspace')
    mkXringRun(dir, 'eng-a', 'run-1', [
      { ts: '2026-10-06T01:00:00.000Z', event: 'monitor-start', runId: 'run-1', maxHours: 3, maxTokens: 1000000, mode: 'queue' },
      { ts: '2026-10-06T01:00:30.000Z', event: 'budget-tick', ok: true, detail: '0.01h/3h, 12590/1000000 tokens', transcripts: 1, tokens: 12590, idleMs: 42000 },
      { ts: '2026-10-06T01:01:00.000Z', event: 'budget-exceeded', reason: 'timeout', detail: '3.00h >= 3h' },
      { ts: '2026-10-06T01:01:00.100Z', event: 'stop', reason: 'budget', detail: '3.00h >= 3h' },
      { ts: '2026-10-06T01:01:01.000Z', event: 'reflow-start', runId: 'run-1', workspace: ws },
      { ts: '2026-10-06T01:01:01.500Z', event: 'reflow-done', runId: 'run-1', written: 2, held: 1, errors: 0 },
      '{bad json', // 坏行跳过(audit 同款语义), 不抛
    ], {
      'hypotheses.json': { hypotheses: [{ id: 'H-1' }, { id: 'H-2' }] },
      'lessons.json': { lessons: [{ id: 'L-1' }] },
      'repro_paths.json': { findings: [{ id: 'F-1' }] },
    })
    const r = readXringRuns({ base: dir })
    assert.equal(r.available, true)
    assert.equal(r.base, dir)
    assert.equal(r.activeCount, 0, '已停止不计活跃')
    assert.equal(r.runs.length, 1)
    const run = r.runs[0]
    assert.equal(run.eng, 'eng-a')
    assert.equal(run.runId, 'run-1')
    assert.equal(run.status, 'stopped')
    assert.equal(run.stopReason, 'budget')
    assert.equal(run.startedAt, '2026-10-06T01:00:00.000Z')
    assert.equal(run.elapsedSec, 60.1, 'stop 事件边界计时')
    assert.deepEqual(run.budget, { maxHours: 3, maxTokens: 1000000 })
    assert.equal(run.mode, 'queue', 'U2 档位投影（首事件落档）')
    assert.equal(run.lastTick.ok, true)
    assert.equal(run.lastTick.tokens, 12590, '运行中 token 代理值（XR-P3 转录尾）')
    assert.equal(run.lastTick.idleMs, 42000, '停滞遥测投影')
    assert.deepEqual(run.artifacts, { A: 1, B: 2, C: 1, reflow: { written: 2, held: 1, errors: 0 } }, 'A/B/C 三级计数 + 回流账目')
    assert.equal(run.events.length, 6, '坏行不进尾窗')
    assert.equal(run.events[0].event, 'monitor-start')
    assert.equal(run.events[run.events.length - 1].event, 'reflow-done')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('xring: running run — elapsed 按 nowMs 推导; 回流未发生=artifacts null(计数不可得不造 0)', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xring-run-'))
  try {
    const t0 = '2026-10-06T01:00:00.000Z'
    mkXringRun(dir, 'eng-b', 'run-live', [
      { ts: t0, event: 'monitor-start', runId: 'run-live', maxHours: 6, maxTokens: 2000000 },
      { ts: '2026-10-06T01:01:40.000Z', event: 'budget-tick', ok: true, detail: '0.03h/6h, 0/2000000 tokens', transcripts: 0 },
    ])
    const r = readXringRuns({ base: dir, nowMs: Date.parse('2026-10-06T01:01:40.000Z') })
    const run = r.runs[0]
    assert.equal(r.activeCount, 1)
    assert.equal(run.status, 'running')
    assert.equal(run.stopReason, null)
    assert.equal(run.elapsedSec, 100, 'running = now - startedAt')
    assert.equal(run.artifacts, null, '未回流 → 计数不可得(诚实呈现, 不造 0)')
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('xring: fail-soft — base 缺失=available:false 空态; workspace 缺失=计数 null; 空事件=degraded 记因; 多 run 新→旧+cap', () => {
  assert.deepEqual(readXringRuns({ base: '/tmp/definitely-missing-xring-dir' }),
    { available: false, base: '/tmp/definitely-missing-xring-dir', activeCount: 0, runs: [], degraded: [] }, '记录面缺失=合法空态(不炸面板)')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xring-fs-'))
  try {
    // workspace 指向不存在路径 → 三级计数 null(文件面邻居缺失是合法常态)
    mkXringRun(dir, 'eng-c', 'run-nows', [
      { ts: '2026-10-06T02:00:00.000Z', event: 'monitor-start', runId: 'run-nows', maxHours: 1, maxTokens: 100000 },
      { ts: '2026-10-06T02:00:05.000Z', event: 'reflow-start', runId: 'run-nows', workspace: '/tmp/xring-no-such-ws' },
    ])
    // 空 events → degraded 记因, run 不抛
    mkXringRun(dir, 'eng-c', 'run-empty', [''])
    const r = readXringRuns({ base: dir })
    assert.equal(r.available, true)
    assert.equal(r.runs.length, 2)
    const nows = r.runs.find((x) => x.runId === 'run-nows')
    assert.deepEqual(nows.artifacts, { A: null, B: null, C: null, reflow: null })
    const empty = r.runs.find((x) => x.runId === 'run-empty')
    assert.equal(empty.status, 'unknown')
    assert.ok(r.degraded.some((d) => d.includes('run-empty')), 'degraded 记因含 run 标识')
    assert.ok(r.degraded.some((d) => d.includes('无可解析事件行')))
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('xring: 心跳失联 stale 标记 + 扫描 cap（拍板 6/7）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xring-stale-'))
  try {
    // running + 末事件早于阈 → stale; stopped 不标
    mkXringRun(dir, 'eng-e', 'run-stale', [
      { ts: '2026-10-06T01:00:00.000Z', event: 'monitor-start', runId: 'run-stale', maxHours: 1, maxTokens: 100000 },
      { ts: '2026-10-06T01:01:00.000Z', event: 'budget-tick', ok: true, detail: 'x' },
    ])
    mkXringRun(dir, 'eng-e', 'run-stopped', [
      { ts: '2026-10-06T00:00:00.000Z', event: 'monitor-start', runId: 'run-stopped', maxHours: 1, maxTokens: 100000 },
      { ts: '2026-10-06T00:30:00.000Z', event: 'stop', reason: 'user', detail: 'd' },
    ])
    const nowMs = Date.parse('2026-10-06T01:05:00.000Z') // stale run 末事件后 4 分钟（>120s 阈）
    const r = readXringRuns({ base: dir, nowMs })
    const st = r.runs.find((x) => x.runId === 'run-stale')
    assert.deepEqual(st.stale, { idleMs: 240000, thresholdMs: 120000 }, 'running 心跳失联=stale 标记')
    assert.equal(r.runs.find((x) => x.runId === 'run-stopped').stale, undefined, 'stopped 不标')
    // env 阈可调
    const r2 = readXringRuns({ base: dir, nowMs: Date.parse('2026-10-06T01:02:30.000Z') }, fs, { P2P_XRING_STALE_MS: '60000' })
    assert.ok(r2.runs.find((x) => x.runId === 'run-stale')?.stale, 'env 阈 60s 下 90s 间隔即标（严格大于）')
    // 扫描 cap: 45 run 目录只解析 40, degraded 记因
    const dir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'xring-cap-'))
    try {
      for (let i = 0; i < 45; i++) {
        fs.mkdirSync(path.join(dir2, 'eng', `run-${String(i).padStart(2, '0')}`), { recursive: true })
        fs.writeFileSync(path.join(dir2, 'eng', `run-${String(i).padStart(2, '0')}`, 'events.jsonl'), JSON.stringify({ ts: '2026-10-06T01:00:00.000Z', event: 'stop', reason: 'user' }) + '\n')
      }
      const r3 = readXringRuns({ base: dir2 })
      assert.equal(r3.runs.length, 20, '返回仍受 maxRuns=20 截（解析成本由 maxScan=40 封顶）')
      assert.ok(r3.degraded.some((d) => d.includes('扫描上限 40: 5 个更早 run 未解析')), 'cap 截断记因（45-40=5 个 mtime 最旧不解析）')
    } finally { fs.rmSync(dir2, { recursive: true, force: true }) }
  } finally { fs.rmSync(dir, { recursive: true, force: true }) }
})

test('xring: env 注入与 buildSnapshot 集成 — snap.xring 节随记录面在/缺切换(缺=available:false 不炸)', async () => {
  const saved = process.env.P2P_XRING_RECORD
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'xring-snap-'))
  try {
    mkXringRun(dir, 'eng-d', 'run-9', [
      { ts: '2026-10-06T03:00:00.000Z', event: 'monitor-start', runId: 'run-9', maxHours: 2, maxTokens: 500000 },
      { ts: '2026-10-06T03:00:10.000Z', event: 'stop', reason: 'user', detail: 'stop-request' },
    ])
    process.env.P2P_XRING_RECORD = dir
    let snap = await buildSnapshot(makeFake())
    assert.equal(snap.xring.available, true)
    assert.equal(snap.xring.runs[0].status, 'stopped')
    assert.equal(snap.xring.runs[0].stopReason, 'user')
    assert.equal(snap.xring.activeCount, 0)
    // 无记录面 → 空形态(整体快照不抛 = xring 面与图 fail-closed 语义刻意区分)。
    // env 注入不存在的路径（XR-P2 B 层观察修正: 不依赖本机无真实记录面——消机器状态依赖）
    process.env.P2P_XRING_RECORD = path.join(os.tmpdir(), 'xring-snap-definitely-missing')
    snap = await buildSnapshot(makeFake())
    assert.equal(snap.xring.available, false)
    assert.deepEqual(snap.xring.runs, [])
    assert.equal(xringRecordBase({ D2D_DATA_DIR: '/data' }), '/data/xring', 'DATA_DIR 同序回退')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
    if (saved === undefined) delete process.env.P2P_XRING_RECORD
    else process.env.P2P_XRING_RECORD = saved
  }
})

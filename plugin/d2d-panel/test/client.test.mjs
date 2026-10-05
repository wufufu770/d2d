// 测试范围: 浏览器半 bundle 拼接防漂移 + 假 window 注册/装配链路(产物 gitignore, 测试自建)
// test/client.test.mjs — 浏览器半(lib/client.js)冒烟: 片段拼接防漂移 + 假 window 下注册/装配链路
// 不依赖 react / DOM: factory 顶层只有声明, tab 注册只调 ctx.betterSidebar.registerTab, 全部可用假对象驱动。
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { buildClient, FRAG_DIR, ORDER, OUT } from '../scripts/build-client.mjs'

// 0913 仓库治理: lib/client.js 是构建产物(已 gitignore) — 测试自行构建一次再读
if (!fs.existsSync(OUT)) fs.writeFileSync(OUT, buildClient())
const bundle = fs.readFileSync(OUT, 'utf8')

/** 在隔离 vm 上下文里执行 bundle, 捕获 __ModuleLoader__.load 注册, 返回 {loaded, materialize}。 */
function loadBundle() {
  const loaded = []
  const sandbox = { window: { __ModuleLoader__: { load: (m) => loaded.push(m) } } }
  vm.runInNewContext(bundle, sandbox, { filename: 'd2d-panel/lib/client.js' })
  const requested = []
  const fakeReact = {
    createElement: (type, props, ...children) => ({ type, props, children }),
    useState() {}, useEffect() {}, useMemo() {}, useCallback() {},
  }
  const fakeRequire = (id) => { requested.push(id); if (id === 'react') return fakeReact; throw new Error(`unexpected require: ${id}`) }
  return { loaded, requested, materialize: () => loaded[0].factory(fakeRequire) }
}

/** 假 better-sidebar 宿主 ctx: 记录 registerTab / effect / log 调用。 */
function fakeCtx(svc) {
  const tabs = []
  const effects = []
  const logs = []
  const ctx = {
    log: (...a) => logs.push(a.join(' ')),
    effect: (fn, label) => { effects.push(label); return fn() },
  }
  if (svc !== undefined) ctx.betterSidebar = svc === null ? null : { ...svc, registerTab: (t) => { tabs.push(t); return () => {} } }
  return { ctx, tabs, effects, logs }
}

test('client: lib/client.js 与 lib/client/*.js 片段拼接结果逐字节一致(防漂移; 改片段后须 npm run build)', () => {
  assert.equal(bundle, buildClient(), 'lib/client.js 已漂移 — 运行 npm run build 重新生成')
  assert.equal(new Set(ORDER).size, ORDER.length, 'ORDER 不应有重复片段')
  assert.deepEqual(fs.readdirSync(FRAG_DIR).filter((f) => f.endsWith('.js')).sort(), [...ORDER].sort(), '片段目录与 ORDER 不一致')
})

test('client: 每个片段独立可解析(factory 体声明), 整包无相对路径 require(dsh 每包只投递单文件)', () => {
  for (const f of ORDER) {
    const src = fs.readFileSync(path.join(FRAG_DIR, f), 'utf8')
    assert.doesNotThrow(() => new vm.Script(src, { filename: `lib/client/${f}` }), `${f} 语法错误`)
    assert.match(src.split('\n')[0], /^ {4}\/\/ ══/, `${f} 首行应为 4 空格缩进的区块 banner`)
    assert.doesNotMatch(src, /^\s*(import|export)\s/m, `${f} 不得含 ESM import/export(它是 factory 体片段)`)
  }
  assert.doesNotMatch(bundle, /require\(\s*['"]\.{1,2}\//, 'bundle 含相对路径 require — dsh 运行时无法解析')
  assert.equal((bundle.match(/^window\.__ModuleLoader__\.load\(/gm) ?? []).length, 1, '应恰好一次顶层 __ModuleLoader__.load 调用')
})

test('client: bundle 执行仅注册 factory(零副作用); materialize 只 require react, 导出 {apply, inject}', () => {
  const { loaded, requested, materialize } = loadBundle()
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].id, 'd2d-panel')
  assert.equal(typeof loaded[0].factory, 'function')
  assert.deepEqual(requested, [], '执行 bundle 不应触发任何 require(lazy-CJS)')
  const exp = materialize()
  assert.deepEqual(requested, ['react'], 'factory 顶层应只 require react(其余由 ctx 注入)')
  assert.deepEqual([...exp.inject], ['betterSidebar'])
  assert.equal(typeof exp.apply, 'function')
  assert.deepEqual(Object.keys(exp).sort(), ['apply', 'inject'])
})

test('client: apply 注册 9 个 single tab(60-68), badge 能力探测通过时挂 badge, component 装配到对应视图', () => {
  const { materialize } = loadBundle()
  const { apply } = materialize()
  const { ctx, tabs, effects } = fakeCtx({ features: ['badge'] })
  apply(ctx)
  assert.deepEqual(effects, [
    'd2d-panel: ops tab', 'd2d-panel: findings tab', 'd2d-panel: viz tab',
    'd2d-panel: approval tab', 'd2d-panel: chain tab', 'd2d-panel: tools tab', 'd2d-panel: audit tab', 'd2d-panel: config tab',
    'd2d-panel: xring tab',
  ], 'XR-P2: X-Ring tab 注册(九 tab)')
  assert.deepEqual(tabs.map((t) => t.id), ['d2d:ops', 'd2d:findings', 'd2d:viz', 'd2d:approval', 'd2d:chain', 'd2d:tools', 'd2d:audit', 'd2d:config', 'd2d:xring'])
  assert.deepEqual(tabs.map((t) => t.order), [60, 61, 62, 63, 64, 65, 66, 67, 68])
  assert.deepEqual(tabs.map((t) => t.single), [true, true, true, true, true, true, true, true, true])
  assert.deepEqual(tabs.map((t) => t.title()), ['d2d', 'd2d Findings', 'd2d Viz', 'd2d Approval', 'd2d Chain', 'd2d Tools', 'd2d Audit', 'd2d Config', 'd2d XRing'])
  assert.deepEqual(tabs.slice(0, 2).map((t) => t.badge()), [null, null], '未拉取快照前 badge 为 null(同步缓存读, 不发请求)')
  assert.equal(tabs[3].badge(), null, 'T3-3-2: approval tab badge=待决数(快照 approvals.pending, 缺席→null)')
  for (const i of [2, 4, 5, 6, 7, 8]) assert.equal('badge' in tabs[i], false, `tab#${i} 无 badge 语义`)
  const props = { visible: true }
  const [ops, findings, viz, approval, chain, tools, audit, config, xring] = tabs.map((t) => t.component(props))
  assert.equal(ops.type.name, 'OpsView')
  assert.equal(findings.type.name, 'FindingsView')
  assert.equal(viz.type.name, 'VizView', 'T3-3-1: viz tab 装配 VizView')
  assert.equal(approval.type.name, 'ApprovalView', 'T3-3-2: approval tab 装配 ApprovalView')
  assert.equal(chain.type.name, 'ChainView', 'T3-3-2: chain tab 装配 ChainView')
  assert.equal(tools.type.name, 'ToolsView', 'T3-3-2: tools tab 装配 ToolsView')
  assert.equal(audit.type.name, 'AuditView', 'T3-3-2: audit tab 装配 AuditView')
  assert.equal(config.type.name, 'ConfigView', 'T3-3-2: config tab 装配 ConfigView')
  assert.equal(xring.type.name, 'XRingView', 'XR-P2: xring tab 装配 XRingView')
  assert.equal(ops.props, props, 'props 原样透传给视图')
})

test('client: 老版本 better-sidebar(无 features 数组)仍挂 badge; features 不含 badge 则不挂', () => {
  const { materialize } = loadBundle()
  const { apply } = materialize()
  const legacy = fakeCtx({})
  apply(legacy.ctx)
  // badge 挂点: ops/findings(既有) + approval(T3-3-2); viz/chain/tools/audit/config/xring 无 badge 语义
  assert.deepEqual(legacy.tabs.map((t) => typeof t.badge), ['function', 'function', 'undefined', 'function', 'undefined', 'undefined', 'undefined', 'undefined', 'undefined'])
  const noBadge = fakeCtx({ features: ['something-else'] })
  apply(noBadge.ctx)
  assert.deepEqual(noBadge.tabs.map((t) => 'badge' in t), [false, false, false, false, false, false, false, false, false])
})

test('client: betterSidebar 服务缺失 → 记录日志并静默跳过(软依赖, 不注册 effect)', () => {
  const { materialize } = loadBundle()
  const { apply } = materialize()
  for (const svc of [undefined, null]) {
    const { ctx, tabs, effects, logs } = fakeCtx(svc)
    assert.doesNotThrow(() => apply(ctx))
    assert.deepEqual(tabs, [])
    assert.deepEqual(effects, [])
    assert.deepEqual(logs, ['d2d-panel: betterSidebar 服务不可用, tab 注册跳过'])
  }
})

// ══════════ bug 回归: 片段级行为探针 — 片段放进隔离 vm, 工厂作用域依赖(h/useState/panel/…)打桩后直接驱动组件 ══════════

/** 把 lib/client/<frag> 片段源码放进隔离 vm 上下文(sloppy 模式, 顶层函数声明落全局),
 *  sandbox 预置组件引用的工厂作用域符号桩; 返回上下文(可取 ctx.<组件函数>)。 */
function loadFragment(frag, stubs) {
  const src = fs.readFileSync(path.join(FRAG_DIR, frag), 'utf8')
  const ctx = vm.createContext({ ...stubs })
  vm.runInContext(src, ctx, { filename: `lib/client/${frag}` })
  return ctx
}

/** h 桩: 记录每个创建的元素 {type, props, children}, 供渲染树断言。 */
function makeH() {
  const els = []
  const h = (type, props, ...children) => {
    const el = { type, props: props ?? {}, children }
    els.push(el)
    return el
  }
  return { h, els }
}

function panelStubs() {
  return {
    panel: { muted: () => ({ style: {} }), chip: () => ({}), btn: () => ({}), input: () => ({}), mono: { style: {} }, root: {} },
  }
}

test('client(bug回归): OpsView 策略库卡 — 模块开启且有数据才渲染, 关闭或无数据隐藏(旧版条件反转: 开启反而隐藏)', () => {
  const snap = { findings: { byState: {}, list: [] }, gaps: [], experience: [], counts: { signals_open: 0 }, signals: [], strategies: [{ id: 's1', title: 'T' }] }
  const offBox = { set: new Set() }
  const { h, els } = makeH()
  const ctx = loadFragment('view.ops.js', {
    h, useState: (init) => [init, () => {}],
    useEffect: () => {}, // T3-3-2: useFrontier(FrontierPoolCard)在探针下不真轮询
    fetchApi: async () => ({ ok: true, frontier: { pool: [], byStatus: {} } }),
    postJson: async () => ({ ok: true }), // T3-3-2: 评审动作探针下不出网
    useSnapshot: () => ({ snap, err: null, now: 0, refresh: () => {} }),
    useModules: () => ({ off: offBox.set, toggle: () => {} }),
    Card: function Card() {}, Style: () => null, FailClosedBanner: function F() {}, Skeleton: function S() {},
    EngagementCard: function E() {}, DenylistCard: function D() {}, CapsCard: function C() {},
    FleetCard: function F() {}, UsageCard: function U() {}, CostCard: function CO() {},
    ConversionCard: function CV() {}, // T2-1-2: 转化率卡(view.ops.js 新增工厂作用域依赖)
    WorkersCard: function W() {}, FunnelCard: function FU() {}, GapsCard: function G() {},
    ExperienceCard: function EX() {}, StrategiesCard: function ST() {}, MODULES: [],
    ...panelStubs(),
  })
  const OpsView = ctx.OpsView
  const rendered = () => els.some((e) => e.type === ctx.StrategiesCard)
  offBox.set = new Set()
  els.length = 0
  OpsView({ visible: true })
  assert.ok(rendered(), '模块开启 + 有数据 → 策略库卡应渲染(旧版 !off.has 反转: 开启反而 null)')
  offBox.set = new Set(['strategies'])
  els.length = 0
  OpsView({ visible: true })
  assert.ok(!rendered(), '模块关闭 → 隐藏')
  offBox.set = new Set()
  snap.strategies = []
  els.length = 0
  OpsView({ visible: true })
  assert.ok(!rendered(), '模块开启但无数据 → 隐藏(空态守卫保留)')
})

test('client(bug回归): FleetCard.saveCredential — 成功路径不再引用未定义 setCredMsg(旧版 ReferenceError 且 refresh 不执行); 失败路径提示且不抛未处理拒绝', async () => {
  const states = []
  const stateInit = { 0: 'coder/primary' } // 第 0 个 useState(open) 初值覆盖 → 渲染出 picker 才能摘到 onCredential
  let idx = 0
  const useState = (init) => {
    const k = idx++
    const st = { value: k in stateInit ? stateInit[k] : init, set: (v) => { st.value = v } }
    states.push(st)
    return [st.value, st.set]
  }
  const posts = []
  const refreshed = []
  let respond = () => ({ ok: true })
  const { h, els } = makeH()
  const ctx = loadFragment('cards.ops.js', {
    h, useState,
    postJson: async (ep, body) => { posts.push([ep, body]); return respond() },
    Card: function Card() {}, FleetModelPicker: function FM() {}, shortModel: (m) => String(m ?? '').split('/').pop(),
    ...panelStubs(),
  })
  const FleetCard = ctx.FleetCard
  const fleet = { roles: { coder: { primary: 'p/a', backup: '' } }, models: [], catalog: [] }
  FleetCard({ fleet, run: {}, refresh: () => refreshed.push('r') })
  const picker = els.find((e) => e.type === ctx.FleetModelPicker)
  assert.ok(picker, 'open 槽应渲染 FleetModelPicker(onCredential 经 props 透出)')
  const saveCredential = picker.props.onCredential
  // 成功路径: 不抛错、写 credential、给出提示、refresh() 必须执行
  await assert.doesNotReject(() => saveCredential('acme', 'sk-secret'))
  assert.equal(posts.length, 1)
  assert.equal(posts[0][0], 'credential')
  assert.equal(posts[0][1].provider, 'acme') // vm 侧对象跨 realm, 不用 deepStrictEqual 比原型
  assert.equal(posts[0][1].key, 'sk-secret')
  assert.equal(refreshed.length, 1, '成功后必须 refresh()(旧版 setCredMsg ReferenceError 中断)')
  const credState = states.find((s) => typeof s.value === 'string' && s.value.includes('acme'))
  assert.ok(credState?.value.includes('凭据'), '成功提示置入本组件 credMsg state')
  // 失败路径: 不再向调用方抛未处理拒绝(picker onClick 无 catch), 错误置入本组件 err state
  posts.length = 0
  respond = () => { throw new Error('boom') }
  await assert.doesNotReject(() => saveCredential('acme', 'sk-2'))
  assert.equal(posts.length, 1)
  assert.equal(posts[0][0], 'credential')
  assert.equal(posts[0][1].provider, 'acme')
  assert.equal(posts[0][1].key, 'sk-2')
  assert.equal(refreshed.length, 1, '失败不触发 refresh')
  assert.equal(states[2].value, 'boom', '失败提示置入本组件 err state')
})

// ══════════ T3-3-1 可视化组件探针: view.viz.js 片段 vm 驱动 — 数据进 vnode 出(纯函数护栏) ══════════

/** view.viz.js 片段加载桩: h 记录器 + 工厂作用域依赖(Card/Style/panel/hooks/localStorage)。 */
function loadVizFragment() {
  const { h, els } = makeH()
  const ctx = loadFragment('view.viz.js', {
    h,
    panel: { muted: () => ({ style: {} }), chip: (e) => ({ style: e ?? {} }), btn: (e) => ({ style: e ?? {} }), mono: { style: {} }, root: { className: 'd2d-panel' }, dot: () => ({ style: {} }) },
    Card: (p, ...children) => h('card', { title: p?.title, extra: p?.extra }, ...(children ?? [])),
    Style: () => h('style'),
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    useCallback: (f) => f,
    localStorage: { getItem: () => null, setItem: () => {} },
  })
  return { ctx, els }
}
const mkNodes = (n) => Array.from({ length: n }, (_, i) => ({ id: `s${i}`, type: 'asset-perimeter', weight: 1, ts: '2026-10-01', host: 'a.com' }))

test('client(viz): StarMapChart 渲染护栏 — 500 节点输入渲染 ≤200 circle + 超限计数提示(数据不丢)', () => {
  const { ctx, els } = loadVizFragment()
  const el = ctx.StarMapChart({ starmap: { nodes: mkNodes(500), edges: [], total: 500, truncated: true, candidates: [] } })
  assert.equal(el.type, 'div')
  assert.ok(els.some((e) => e.type === 'svg'), '自绘 SVG 在位')
  const circles = els.filter((e) => e.type === 'circle')
  assert.ok(circles.length <= 200 && circles.length > 0, `circle 渲染上限(${circles.length})`)
  assert.ok(JSON.stringify(els).includes('+300 未显示'), '超限计数提示(500-200)')
})
test('client(viz): StarMapChart 空态与候选连线 chip', () => {
  const { ctx, els } = loadVizFragment()
  ctx.StarMapChart({ starmap: { nodes: [], edges: [], total: 0, truncated: false, candidates: [] } })
  assert.ok(JSON.stringify(els).includes('星图空'), '空态文案')
  const { ctx: ctx2, els: els2 } = loadVizFragment()
  ctx2.StarMapChart({ starmap: { nodes: mkNodes(2), edges: [], total: 2, truncated: false, candidates: [{ a: 's0', aType: 't1', b: 's1', bType: 't2', host: 'h' }] } })
  assert.ok(JSON.stringify(els2).includes('t1~t2@h'), '候选连线提示 chip')
})
test('client(viz): CoverageHeat — 21 格渲染(空格也渲染, title 带格坐标)', () => {
  const { ctx, els } = loadVizFragment()
  const coverage = {
    surfaces: ['request', 'response', 'js', 'business', 'flow', 'apk', 'mini'],
    boundaries: ['outer', 'inner', 'cross'],
    cells: Array.from({ length: 21 }, (_, i) => ({ su: ['request', 'response', 'js', 'business', 'flow', 'apk', 'mini'][Math.floor(i / 3)], bo: ['outer', 'inner', 'cross'][i % 3], n: i })),
    total: 210,
  }
  ctx.CoverageHeat({ coverage })
  const gridCells = els.filter((e) => typeof e.props?.title === 'string' && e.props.title.includes(' × '))
  assert.equal(gridCells.length, 21, '21 格全渲染(含零格)')
})
test('client(viz): HypLaneSwim — 生命周期五列 + 时间窗 chips(localStorage 记忆)', () => {
  const { ctx, els } = loadVizFragment()
  ctx.HypLaneSwim({ hypotheses: { byStatus: { open: 2, claimed: 1, confirmed: 0, refuted: 0, suspected: 0 }, items: [{ id: 'h1', text: '假设甲', strategy: 's', status: 'open', ts: 't' }], windowDays: 14 } })
  const blob = JSON.stringify(els)
  for (const label of ['Open', 'Claimed', 'Confirmed', 'Refuted', 'Suspected']) assert.ok(blob.includes(label), `泳道列 ${label}`)
  assert.ok(blob.includes('3d') && blob.includes('30d'), '时间窗 chips(3/7/14/30)')
})
test('client(viz): CapabilityCard — 形态计数 chips + 导出清单 + degraded 展示', () => {
  const { ctx, els } = loadVizFragment()
  ctx.CapabilityCard({ capability: { manifestValid: true, manifest: { generated: 'g', exports: [{ form: 'tool', id: 'browser_form_fuzzer', status: 'live', impl: 'a.mjs', note: '表单模糊' }] }, baselines: { version: 'v1', keys: 62, tools: ['p2p_status'] }, degraded: ['baselines: x'] } })
  const blob = JSON.stringify(els)
  assert.ok(blob.includes('live 1'), 'live 计数')
  assert.ok(blob.includes('基线 62 键'), '基线键数')
  assert.ok(blob.includes('browser_form_fuzzer'), '导出清单')
  assert.ok(blob.includes('降级: baselines: x'), 'degraded 记因展示')
})
test('client(viz): VizView 容器 — visible 驱动 useViz, 数据未达时五卡全渲染不可用态(单卡降级不炸 tab)', () => {
  const { ctx, els } = loadVizFragment()
  ctx.VizView({ visible: true })
  const cards = els.filter((e) => e.type === ctx.Card)
  assert.equal(cards.length, 4, 'card() 直渲染四卡(热力/泳道/星图/能力)')
  assert.ok(els.some((e) => e.type === ctx.SankeyCard), '桑基卡 vnode 在位(makeH 不展开子组件) — T3-3-2 桑基入 viz tab')
  const blob = JSON.stringify(els)
  for (const t of ['覆盖象限热力', '假设泳道', '信号星图', '能力看板']) assert.ok(blob.includes(t), `卡标题 ${t}`)
  // makeH 不展开子组件 — 图组件 vnode 在位且收到 undefined 数据(路由失败单卡降级, 各图组件自渲染不可用态)
  const comps = els.filter((e) => [ctx.CoverageHeat, ctx.HypLaneSwim, ctx.StarMapChart, ctx.CapabilityCard].includes(e.type))
  assert.equal(comps.length, 4, '四图组件 vnode 在位')
  for (const c of comps) {
    const p = Object.values(c.props ?? {})[0]
    assert.equal(p, undefined, `${c.type.name} 数据 undefined(降级态)`)
  }
  const sk = els.find((e) => e.type === ctx.SankeyCard)
  assert.equal(sk.props.flows, undefined, '桑基卡降级态(flows undefined — transition-flows 路由失败单卡降级)')
})

// ══════════ T3-3-2 收官批: 桑基纯函数护栏 + 五新 tab 片段探针 + 禁区 grep ══════════

/** view.viz.js 探针(与 loadVizFragment 同桩, 便于取 SankeyCard 的家族 chips)。 */
function loadNewFragment(frag, extra = {}) {
  const { h, els } = makeH()
  const ctx = loadFragment(frag, {
    h,
    panel: { muted: () => ({ style: {} }), chip: (e) => ({ style: e ?? {} }), btn: (e) => ({ style: e ?? {} }), input: (e) => ({ style: e ?? {} }), mono: { style: {} }, root: { className: 'd2d-panel' }, dot: () => ({ style: {} }) },
    Card: (p, ...children) => h('card', { title: p?.title, extra: p?.extra }, ...(children ?? [])),
    Style: () => h('style'),
    useState: (v) => [v, () => {}],
    useEffect: () => {},
    useCallback: (f) => f,
    sevColor: () => 'var(--x)', // ui.js 语义色(view.chain/view.tools 引用)
    fmtClock: () => '03:00', // ui.js 时间格式化(view.tools 行渲染)
    ...extra,
  })
  return { ctx, els }
}
const mkFlows = () => ({
  links: [
    { family: 'finding', from: 'candidate', to: 'verified', count: 8 },
    { family: 'frontier', from: 'proposed', to: 'accepted', count: 3 },
  ],
  windowDays: 7, linesRead: 100, matched: 11, degraded: [],
})

test('client(sankey): SankeyChart — 双列节点+缎带按 count 缩宽+家族过滤(client 侧零重取)', () => {
  const { ctx, els } = loadNewFragment('view.viz.js')
  ctx.SankeyChart({ flows: mkFlows(), family: 'all' })
  assert.ok(els.some((e) => e.type === 'svg'), '自绘 SVG 在位')
  assert.equal(els.filter((e) => e.type === 'path').length, 2, '两条迁移缎带')
  assert.ok(els.filter((e) => e.type === 'rect').length >= 4, '左右两列节点')
  const { ctx: c2, els: e2 } = loadNewFragment('view.viz.js')
  c2.SankeyChart({ flows: mkFlows(), family: 'finding' })
  assert.equal(e2.filter((el) => el.type === 'path').length, 1, 'family=finding 只剩漏洞缎带')
  const { ctx: c3, els: e3 } = loadNewFragment('view.viz.js')
  c3.SankeyChart({ flows: mkFlows(), family: 'experience' })
  assert.ok(JSON.stringify(e3).includes('无迁移事件'), '过滤后空族 → 显式空态')
})

test('client(sankey): 空数据/降级注记 + SankeyCard 家族 chips + 窗口注记(稀疏即真相不造数据)', () => {
  const { ctx, els } = loadNewFragment('view.viz.js')
  ctx.SankeyChart({ flows: { links: [], windowDays: 7, linesRead: 0, matched: 0, degraded: [] }, family: 'all' })
  const blob = JSON.stringify(els)
  assert.ok(blob.includes('无迁移事件') && blob.includes('不造数据'), '空态注记(拍板 3)')
  const { ctx: c2, els: e2 } = loadNewFragment('view.viz.js')
  c2.SankeyChart({ flows: { ...mkFlows(), degraded: ['transition-log 不可读: ENOENT'] }, family: 'all' })
  assert.ok(JSON.stringify(e2).includes('transition-log 不可读'), 'degraded 记因进 UI')
  const { ctx: c3, els: e3 } = loadNewFragment('view.viz.js')
  c3.SankeyCard({ flows: mkFlows(), errs: {} })
  const b3 = JSON.stringify(e3)
  for (const f of ['全部', '漏洞', '经验', '前沿']) assert.ok(b3.includes(f), `家族 chip ${f}`)
  assert.ok(b3.includes('稀疏即历史真相'), '预期管理注记')
  const { ctx: c4, els: e4 } = loadNewFragment('view.viz.js')
  c4.SankeyCard({ flows: mkFlows(), errs: { 'transition-flows': new Error('HTTP 503') } })
  assert.ok(JSON.stringify(e4).includes('不可用'), '路由错误单卡降级提示')
})

const mkChain = () => ({
  tasks: [{ id: 'task-1', kind: 'probe', status: 'claimed', link_id: 'sig-1', claimed_by: 'w1', created_at: 't' }],
  workers: [{ worker_id: 'w1', ring: 'deep', chain: '', status: 'running' }],
  signals: [{ id: 'sig-1', type: 'asset-perimeter', weight: 1, ts: '', host: 'a.com' }],
  endpoints: [{ id: 'ep-1', url: 'https://a.com/x', method: 'GET' }],
  findings: [{ id: 'fnd-1', title: 'XSS in search', severity: 'high', state: 'verified' }],
  edges: { derived: [{ a: 'sig-1', b: 'sig-0' }], at: [{ a: 'sig-1', b: 'ep-1' }], confirms: [{ a: 'fnd-1', b: 'sig-1' }], suggests: [] },
  caps: { tasks: 50, findings: 100, endpoints: 200, edges: 300 },
})

test('client(chain): ChainChart 三列节点+边两端在列内才画 + CONFIRMS 稀疏注记(拍板 3)', () => {
  const { ctx, els } = loadNewFragment('view.chain.js')
  ctx.ChainChart({ chain: mkChain() })
  assert.ok(els.some((e) => e.type === 'svg'), '自绘 SVG 在位')
  assert.equal(els.filter((e) => e.type === 'path').length, 2, 'AT+CONFIRMS 各一条; DERIVED_FROM 末端 sig-0 不在列内被滤')
  const blob = JSON.stringify(els)
  assert.ok(blob.includes('历史存量恒 0'), 'CONFIRMS 稀疏注记')
  assert.ok(blob.includes('SUGGESTS'), '未画族计数披露')
  const { ctx: c2, els: e2 } = loadNewFragment('view.chain.js')
  c2.ChainChart({ chain: null })
  assert.ok(JSON.stringify(e2).includes('不可用'), '数据不可用态')
})

test('client(chain): ChainTaskBoard 状态/kind/认领人 + 空态; ChainView 双卡装配(vnode 在位口径)', () => {
  const { ctx, els } = loadNewFragment('view.chain.js')
  ctx.ChainTaskBoard({ chain: mkChain() })
  let blob = JSON.stringify(els)
  assert.ok(blob.includes('任务看板') && blob.includes('进行中') && blob.includes('sig-1'), '任务行渲染(link_id 锚点)')
  const { ctx: c2, els: e2 } = loadNewFragment('view.chain.js')
  c2.ChainTaskBoard({ chain: { tasks: [] } })
  assert.ok(JSON.stringify(e2).includes('无任务记录'), '空态')
  const { ctx: c3, els: e3 } = loadNewFragment('view.chain.js', { fetchApi: async () => ({ ok: true, eng: 'eng-a', chain: mkChain() }) })
  c3.ChainView({ visible: true })
  blob = JSON.stringify(e3)
  assert.ok(blob.includes('探索链路'), '链路卡直渲染(Card 在 ChainView 体内)')
  const comps = e3.filter((e) => [c3.ChainChart, c3.ChainTaskBoard].includes(e.type))
  assert.equal(comps.length, 2, '图+看板组件 vnode 在位(makeH 不展开子组件; 须用同源上下文函数比对)')
})

test('client(approval): ApprovalTicket 通过/驳回按钮回调携带 (id, decision); ApprovalView 空队列与模式 chip', () => {
  const { ctx, els } = loadNewFragment('view.approval.js')
  let decided = null
  ctx.ApprovalTicket({
    t: { id: 'tid-1', tier: 'high', command: 'bash -c curl evil', context: { eng: 'eng-a', gate_summary: 'tier:high', proposer_reason: '需要出网' }, proposer: 'w1', created_at: '2026-10-01T09:00:00Z', expiry_at: '2026-10-01T09:15:00Z' },
    onDecide: (id, d) => { decided = [id, d] },
    busyId: '',
  })
  const btns = els.filter((e) => e.type === 'button')
  assert.equal(btns.length, 2, '通过+驳回')
  btns[0].props.onClick()
  assert.deepEqual(decided, ['tid-1', 'approved'])
  btns[1].props.onClick()
  assert.deepEqual(decided, ['tid-1', 'rejected'])
  const blob = JSON.stringify(els)
  assert.ok(blob.includes('高危') && blob.includes('tier:high'), 'tier chip+门摘要在位')
  const { ctx: c2, els: e2 } = loadNewFragment('view.approval.js', { fetchApi: async () => ({ ok: true, mode: 'queue', count: 0, approvals: [] }) })
  c2.ApprovalView({ visible: true })
  const b2 = JSON.stringify(e2)
  assert.ok(b2.includes('审批队列') && b2.includes('队列为空'), '空队列态(探针 useState 不承接异步取数 — 数据路径由 host 测试覆盖)')
  assert.ok(b2.includes('授权与审批正交'), '正交语义声明(不碰审批门)')
})

test('client(tools/audit): ToolEventRow/AuditRow 直驱 + 容器壳降级态', () => {
  const { ctx, els } = loadNewFragment('view.tools.js')
  ctx.ToolEventRow({ e: { ts: '2026-10-02T03:00:00Z', kind: 'tool-gate-deny', worker: 'w1', ring: 'deep', role: '', model: '', code: null, quota: '', reason: 'scope 外', tool: 'web_fetch', command: '', extra: '' } })
  const blob = JSON.stringify(els)
  assert.ok(blob.includes('tool-gate-deny') && blob.includes('scope 外') && blob.includes('web_fetch'), '事件行 kind+reason+tool')
  const { ctx: c2, els: e2 } = loadNewFragment('view.tools.js')
  c2.ToolsView({ visible: true })
  const b2 = JSON.stringify(e2)
  assert.ok(b2.includes('工具调用明细') && b2.includes('工具量榜'), '双卡标题')
  assert.ok(b2.includes('无事件') && b2.includes('暂无终态账本行'), '取数未达空态(探针 useState 不承接异步)')
  const { ctx: c3, els: e3 } = loadNewFragment('view.audit.js')
  c3.AuditRow({ e: { ts: '2026-10-02T03:00:00Z', source: 'transition', kind: 'transition', detail: { node_id: 'f-1', from_status: 'candidate', to_status: 'verified', actor: 'host', reason: 'r' } } })
  c3.AuditRow({ e: { ts: '2026-10-02T02:00:00Z', source: 'audit', kind: 'transition-illegal', detail: { id: 'f-9' } } })
  const b3 = JSON.stringify(e3)
  assert.ok(b3.includes('candidate → verified'), 'transition 源语义化摘要')
  assert.ok(b3.includes('transition-illegal'), 'audit 源 kind')
  const { ctx: c4, els: e4 } = loadNewFragment('view.audit.js')
  c4.AuditView({ visible: true })
  const b4 = JSON.stringify(e4)
  assert.ok(b4.includes('审计时间线') && b4.includes('无审计事件'), '容器壳+空态')
  assert.ok(b4.includes('合流'), '双源合流注记')
})

test('client(config): ConfigView 只读总览(探针降级态) + 写面卡集中装配(vnode 在位)', () => {
  const { ctx, els } = loadNewFragment('view.config.js', {
    useSnapshot: () => ({ snap: { approvals: { mode: 'off', pending: 0 }, fleet: { roles: {} }, run: {}, denylist: { domains: [], cidr_prefix: [] } }, err: null, now: 0, refresh: () => {} }),
    FailClosedBanner: function F() {}, Skeleton: function S() {},
    DenylistCard: function D() {}, CapsCard: function C() {}, FleetCard: function FL() {},
  })
  ctx.ConfigView({ visible: true })
  const blob = JSON.stringify(els)
  assert.ok(blob.includes('配置总览'), '只读总览卡')
  assert.ok(blob.includes('通知通道 未配置'), 'configx 取数未达 → 未配置降级态(探针 useState 不承接异步)')
  assert.ok(blob.includes('暂停项目 0'), '暂停清单空态')
  assert.ok(blob.includes('审批模式 off'), '模式 chip(来自 useSnapshot 桩)')
  const comps = els.filter((e) => [ctx.DenylistCard, ctx.CapsCard, ctx.FleetCard].includes(e.type))
  assert.equal(comps.length, 3, '三个既有写面卡集中(复用不重写, vnode 在位)')
})

test('client(xring): XRingView 只读投影 — 当前 run/预算/工件/事件尾窗 + 空态; 零动作红线(源码+渲染双面)', () => {
  // 零动作红线(拍板 1; XR-P3 拍板 7 词表扩宽): 片段源码级 — 无事件处理器/无写端点/
  // 无 HTTP 动作词/无内容编辑面（B 层复核观察: 守卫窄于红线措辞——本表扩宽收口）
  const src = fs.readFileSync(path.join(FRAG_DIR, 'view.xring.js'), 'utf8')
  assert.doesNotMatch(src, /onClick|postJson|'button'|addEventListener|XMLHttpRequest|contentEditable|method\s*:\s*['"](POST|PUT|DELETE|PATCH)['"]|\.method\s*=|fetch\(|submit\(|FormData|navigator\.sendBeacon/, '零动作红线: 事件处理器/写端点/HTTP 动作词/编辑面全零引用')
  assert.match(src, /cli\.mjs stop/, 'CLI 提示文案在位(停止唯一例外=CLI)')
  // 空/缺记录面 → 合法空态(CLI 提示仍在)
  const { ctx, els } = loadNewFragment('view.xring.js', {
    useSnapshot: () => ({ snap: { xring: { available: false, base: '/d2d/xring', activeCount: 0, runs: [], degraded: [] } }, err: null, refresh: () => {} }),
    FailClosedBanner: function F() {}, Skeleton: function S() {},
  })
  ctx.XRingView({ visible: true })
  let blob = JSON.stringify(els)
  assert.ok(blob.includes('合法空态'), '空态文案')
  assert.ok(blob.includes('零干预入口'), 'CLI 提示(空态也在位)')
  // 有 run 数据 → 状态/预算/工件/事件尾窗/degraded
  const snap = { xring: { available: true, base: '/d2d/xring', activeCount: 1, degraded: ['eng-x/run-2: events.jsonl 不可读(ENOENT)'], runs: [
    { eng: 'eng-x', runId: 'run-1', status: 'running', stopReason: null, startedAt: '2026-10-06T01:00:00.000Z', elapsedSec: 125, mode: 'queue', budget: { maxHours: 3, maxTokens: 1000000 }, lastTick: { ok: true, detail: '0.03h/3h, 12590/1000000 tokens', tokens: 12590, idleMs: 42000 }, artifacts: null, events: [
      { ts: '2026-10-06T01:01:40.000Z', event: 'budget-tick', ok: true, detail: '0.03h/3h, 0/1000000 tokens' },
      { ts: '2026-10-06T01:00:00.000Z', event: 'monitor-start', maxHours: 3, maxTokens: 1000000 },
    ] },
    { eng: 'eng-x', runId: 'run-0', status: 'stopped', stopReason: 'budget', startedAt: '2026-10-05T09:00:00.000Z', elapsedSec: 10800.5, mode: 'bypass', budget: { maxHours: 3, maxTokens: 1000000 }, lastTick: null, artifacts: { A: 1, B: 2, C: 1, reflow: { written: 2, held: 1, errors: 0 } }, events: [] },
  ] } }
  const { ctx: c2, els: e2 } = loadNewFragment('view.xring.js', {
    useSnapshot: () => ({ snap, err: null, refresh: () => {} }),
    FailClosedBanner: function F() {}, Skeleton: function S() {},
  })
  c2.XRingView({ visible: true })
  // 行组件直驱(makeH 不展开子组件 — ChainTaskBoard/AuditRow 同款口径): 状态/计数叶子在行内
  c2.XRingRunRow({ r: snap.xring.runs[1] })
  c2.XRingRunRow({ r: snap.xring.runs[0] })
  const b2 = JSON.stringify(e2)
  assert.ok(b2.includes('活跃 run 1') && b2.includes('历史 2'), '活跃/历史计数 chips')
  assert.ok(b2.includes('running') && b2.includes('stopped·budget'), '状态 chip(含停止原因)')
  assert.ok(b2.includes('预算 3h') && b2.includes('token 上限'), '预算行')
  assert.ok(b2.includes('档位 queue'), 'U2 档位显示')
  assert.ok(b2.includes('token 代理: 12,590'), '运行中 token 代理值（转录尾近精确, XR-P3）')
  assert.ok(b2.includes('转录静默: 42s'), '停滞遥测显示（拍板 4）')
  assert.ok(b2.includes('工件计数待回流'), '未回流=计数不可得(不造 0)')
  assert.ok(b2.includes('budget-tick') && b2.includes('0.03h/3h'), '事件尾窗渲染')
  assert.ok(b2.includes('eng-x/run-2: events.jsonl 不可读'), 'degraded 记因进 UI')
  assert.ok(b2.includes('A:1 B:2 C:1'), '历史行工件三级计数')
  const rows = e2.filter((e) => e.type === c2.XRingRunRow)
  assert.ok(rows.length >= 2, '当前+历史 run 行 vnode 在位(容器装配)')
  assert.equal(e2.filter((e) => e.type === 'button').length, 0, '零按钮(渲染层)')
  // cur 已回流形态 → 回流账目行(与"待回流"互斥, 独立上下文)
  const { ctx: c4, els: e4 } = loadNewFragment('view.xring.js', {
    useSnapshot: () => ({ snap: { xring: { available: true, base: '/d2d/xring', activeCount: 0, degraded: [], runs: [
      { eng: 'eng-x', runId: 'run-1', status: 'stopped', stopReason: 'user', startedAt: '2026-10-06T01:00:00.000Z', elapsedSec: 36.5, budget: { maxHours: 3, maxTokens: 1000000 }, lastTick: null, artifacts: { A: 1, B: 2, C: 1, reflow: { written: 2, held: 1, errors: 0 } }, events: [] },
    ] } }, err: null, refresh: () => {} }),
    FailClosedBanner: function F() {}, Skeleton: function S() {},
  })
  c4.XRingView({ visible: true })
  assert.ok(JSON.stringify(e4).includes('回流: 写入 2 / 留验 1 / 错误 0'), '回流账目行(已回流形态)')
  // err 且无 snap → fail-closed banner(standalone 同构)
  const { ctx: c3, els: e3 } = loadNewFragment('view.xring.js', {
    useSnapshot: () => ({ snap: null, err: new Error('HTTP 503'), refresh: () => {} }),
    FailClosedBanner: function F() {}, Skeleton: function S() {},
  })
  c3.XRingView({ visible: true })
  assert.ok(e3.some((e) => e.type === c3.FailClosedBanner), 'fail-closed banner(快照整体不可达)')
})

test('T3-3-2 禁区 grep: 授权契约链/tier-approval 零出现于 panel 面; approvals.mjs import 仅既有单一消费点', () => {
  const libDir = path.dirname(FRAG_DIR)
  const files = []
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => {
    const p = path.join(d, e.name)
    if (e.isDirectory()) walk(p)
    else files.push(p)
  })
  walk(libDir)
  const hits = (needle) => files.filter((f) => fs.readFileSync(f, 'utf8').includes(needle))
  assert.deepEqual(hits('auth-contract'), [], '授权契约链(T3-3-3 增量)零出现 — panel 不 import 不消费')
  assert.deepEqual(hits('tier-approval'), [], 'tier-approval.mjs 本体零出现')
  // import 语义形态(带引号的模块路径)只允许既有两处消费(审批路由 + 快照计数), 均先于本批存在
  const imports = hits("scheduler/approvals.mjs'")
  assert.deepEqual(imports.sort(), [path.join(libDir, 'host', 'index.mjs'), path.join(libDir, 'host', 'snapshot.mjs')].sort(), 'approvals.mjs import 消费点仅既有两处(消费不改动 — 拍板 4)')
  const clientHits = hits('approvals.mjs').filter((f) => f.includes(`${path.sep}client${path.sep}`) || f.endsWith(`${path.sep}client.js`))
  assert.deepEqual(clientHits, [], 'client 半零 approvals 模块引用(纯路由名消费)')
})

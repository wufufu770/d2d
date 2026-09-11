// test/client.test.mjs — 浏览器半(lib/client.js)冒烟: 片段拼接防漂移 + 假 window 下注册/装配链路
// 不依赖 react / DOM: factory 顶层只有声明, tab 注册只调 ctx.betterSidebar.registerTab, 全部可用假对象驱动。
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'
import vm from 'node:vm'
import { buildClient, FRAG_DIR, ORDER, OUT } from '../scripts/build-client.mjs'

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

test('client: apply 注册 d2d:ops(60) / d2d:findings(61) 两个 single tab, badge 能力探测通过时挂 badge, component 装配到对应视图', () => {
  const { materialize } = loadBundle()
  const { apply } = materialize()
  const { ctx, tabs, effects } = fakeCtx({ features: ['badge'] })
  apply(ctx)
  assert.deepEqual(effects, ['d2d-panel: ops tab', 'd2d-panel: findings tab'])
  assert.deepEqual(tabs.map((t) => t.id), ['d2d:ops', 'd2d:findings'])
  assert.deepEqual(tabs.map((t) => t.order), [60, 61])
  assert.deepEqual(tabs.map((t) => t.single), [true, true])
  assert.deepEqual(tabs.map((t) => t.title()), ['d2d', 'd2d Findings'])
  assert.deepEqual(tabs.map((t) => t.badge()), [null, null], '未拉取快照前 badge 为 null(同步缓存读, 不发请求)')
  const props = { visible: true }
  const [ops, findings] = tabs.map((t) => t.component(props))
  assert.equal(ops.type.name, 'OpsView')
  assert.equal(findings.type.name, 'FindingsView')
  assert.equal(ops.props, props, 'props 原样透传给视图')
})

test('client: 老版本 better-sidebar(无 features 数组)仍挂 badge; features 不含 badge 则不挂', () => {
  const { materialize } = loadBundle()
  const { apply } = materialize()
  const legacy = fakeCtx({})
  apply(legacy.ctx)
  assert.deepEqual(legacy.tabs.map((t) => typeof t.badge), ['function', 'function'])
  const noBadge = fakeCtx({ features: ['something-else'] })
  apply(noBadge.ctx)
  assert.deepEqual(noBadge.tabs.map((t) => 'badge' in t), [false, false])
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
    useSnapshot: () => ({ snap, err: null, now: 0, refresh: () => {} }),
    useModules: () => ({ off: offBox.set, toggle: () => {} }),
    Card: function Card() {}, Style: () => null, FailClosedBanner: function F() {}, Skeleton: function S() {},
    EngagementCard: function E() {}, DenylistCard: function D() {}, CapsCard: function C() {},
    FleetCard: function F() {}, UsageCard: function U() {}, CostCard: function CO() {},
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

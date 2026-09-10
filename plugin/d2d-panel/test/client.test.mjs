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

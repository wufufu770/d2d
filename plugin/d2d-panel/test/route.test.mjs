// route.test.mjs — B12 hash 路由回归(parse/build/归一/navigate/监听清理)
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import vm from 'node:vm'
import { describe, it } from 'node:test'

const FRAG = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'lib', 'client', 'route.js')

/** route.js 探针: vm 隔离 + window 桩(location.hash/addEventListener/hashchange 派发)。 */
function loadRoute({ initialHash = '' } = {}) {
  const listeners = new Map()
  const win = {
    location: { hash: initialHash },
    addEventListener(ev, fn) {
      if (!listeners.has(ev)) listeners.set(ev, new Set())
      listeners.get(ev).add(fn)
    },
    removeEventListener(ev, fn) { listeners.get(ev)?.delete(fn) },
    dispatch(nextHash) {
      win.location.hash = nextHash
      for (const fn of listeners.get('hashchange') ?? []) fn()
    },
  }
  let hookState = null
  let cleanup = null
  const ctx = vm.createContext({
    console,
    URLSearchParams,
    window: win,
    useState: (init) => {
      if (hookState === null) hookState = typeof init === 'function' ? init() : init
      return [hookState, (next) => { hookState = typeof next === 'function' ? next(hookState) : next }]
    },
    useEffect: (fn) => { cleanup = fn() },
    useCallback: (fn) => fn,
  })
  vm.runInContext(fs.readFileSync(FRAG, 'utf8'), ctx, { filename: 'route.js' })
  return { ctx, win, listeners, getState: () => hookState, unmount: () => cleanup?.() }
}

describe('route.js B12 hash 路由', () => {
  it('parseD2dHash: 空 hash 回缺省 tab; 提取 tab 与非空参数', () => {
    const { ctx } = loadRoute()
    assert.equal(JSON.stringify(ctx.parseD2dHash('ops')), JSON.stringify({ tab: 'ops', params: {} }))
    const { ctx: c2 } = loadRoute({ initialHash: '#d2d?tab=findings&state=verified&eng=demo&empty=' })
    assert.equal(JSON.stringify(c2.parseD2dHash('ops')), JSON.stringify({ tab: 'findings', params: { state: 'verified', eng: 'demo' } }))
  })

  it('buildD2dHash: tab 恒置 + null/空参数跳过', () => {
    const { ctx } = loadRoute()
    assert.equal(ctx.buildD2dHash('findings', { state: 'verified', skip: null, empty: '' }), '#d2d?tab=findings&state=verified')
  })

  it('useD2dRoute: 非法 tab 归一/navigate 写 hash/hashchange 回流/unmount 清监听', () => {
    const { ctx, win, listeners, getState, unmount } = loadRoute({ initialHash: '#d2d?tab=nonexistent&state=candidate' })
    const route = ctx.useD2dRoute(['ops', 'findings', 'viz'], 'ops')
    assert.equal(route.tab, 'ops', '非法 tab 归一缺省')
    assert.equal(JSON.stringify(route.params), JSON.stringify({ state: 'candidate' }))
    assert.equal(listeners.get('hashchange')?.size, 1)

    route.navigate('findings', { state: 'verified' })
    assert.equal(win.location.hash, '#d2d?tab=findings&state=verified')

    win.dispatch('#d2d?tab=viz&days=7')
    assert.equal(JSON.stringify(getState()), JSON.stringify({ tab: 'viz', params: { days: '7' } }))

    route.navigate('no-such-tab')
    assert.equal(win.location.hash, '#d2d?tab=ops', '非法 navigate 归一缺省 tab')

    unmount()
    assert.equal(listeners.get('hashchange')?.size, 0, 'unmount 清监听')
  })
})

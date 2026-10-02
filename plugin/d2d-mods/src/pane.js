// src/pane.js — d2d 状态 Pane 的**纯**渲染树构造（不接触 $）
// ui.render Pane hook 里 `$.ui.resolve(e)` 交回元素工厂表（Box/Text/...），
// 本函数只按表把「纯状态对象」画成一棵树 —— 无 JSX（hooks 模块是 .js，不转译），
// 直接调用工厂：`Text({ children, dimColor })`、`Box({ flexDirection, children })`。
// 纯函数 → 可用假 Box/Text 离线断言树形状（见 tests/m3.test.ts）。

/**
 * @param {object} s 状态快照
 * @param {{Box:Function, Text:Function}} ui 元素工厂表（来自 $.ui.resolve(e)）
 * @returns {object} 渲染树
 */
export function buildPaneTree(s = {}, ui = {}) {
  const Box = ui.Box
  const Text = ui.Text
  const ring = (r) => {
    const st = (s.rings ?? {})[r] ?? 'idle'
    const mark = st === 'done' ? '✔' : st === 'failed' ? '✘' : st === 'running' ? '…' : '·'
    return `${mark} ${r}`
  }
  const rows = [
    Text({ children: 'd2d', dimColor: true }),
    Text({ children: `graphd ${s.graphdHealthy === false ? '离线' : '在线'} · ${s.engName ?? '(no-engagement)'}` }),
    Text({ children: `scope ${s.scope ?? '-'}` }),
    Text({ children: `环 ${ring('discovery')} ${ring('deep')} ${ring('creative')}` }),
    Text({ children: `调用 ${Number(s.toolCalls ?? 0)} · 拦截 ${Number(s.gateDenies ?? 0)} · 桥 ${Number(s.bridged ?? 0)}` }),
  ]
  if (s.lastError) rows.push(Text({ children: `最近错误 ${s.lastError}`, dimColor: true }))
  return Box({ flexDirection: 'column', children: rows })
}

/** 环状态机：把 agentId→ring 的完成事件折算成每环状态（纯函数）。 */
export function foldRingState(rings, event) {
  const next = { ...(rings ?? {}) }
  const r = String(event?.ring ?? '')
  if (!r) return next
  if (event?.kind === 'spawn') next[r] = 'running'
  else if (event?.kind === 'done') next[r] = 'done'
  else if (event?.kind === 'failed') next[r] = 'failed'
  return next
}

// ui.js — client 半共享基础件: DSW 令牌样式 / 语义色 / 轮询 hook / 四态原语
// 主题契约(接入指南 §12): 背景/前景/边框/字体一律 DSW 令牌, 零硬编码主题色;
// severity 与 ring 是安全语义色(红=危), 主题不提供, 以面板局部 CSS 变量定义并保持低饱和。
import { createElement as h, useState, useEffect } from 'react'
import { fetchSnapshot } from './api.js'

export const POLL_MS = 2000
export const ZOMBIE_MS = 30_000

// 语义色(PANEL-UI-SPEC §4.6 豁免项): 低饱和, 深/浅主题均可读
const SEMANTIC_CSS = `
.d2d-panel{--d2d-sev-critical:#e5484d;--d2d-sev-high:#f0773c;--d2d-sev-medium:#d8a021;--d2d-sev-low:#58a36a;--d2d-sev-info:#8e97a8;
--d2d-ring-discovery:#4d6bfe;--d2d-ring-deep:#9b7bff;--d2d-ring-creative:#f5a623;--d2d-ring-verify:#2fb6a3;--d2d-ring-study:#8e97a8;
--d2d-ok:#58a36a;--d2d-warn:#d8a021;--d2d-line:rgba(128,140,165,.32);--d2d-line-strong:rgba(128,140,165,.5)}
@keyframes d2d-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes d2d-shimmer{0%{opacity:.45}50%{opacity:.9}100%{opacity:.45}}
@media (prefers-reduced-motion: no-preference){
  .d2d-dot-running{animation:d2d-pulse 2s ease-in-out infinite}
  .d2d-skel{animation:d2d-shimmer 1.6s ease-in-out infinite}
}
`
export function Style() { return h('style', null, SEMANTIC_CSS) }

export const sevColor = (s) => `var(--d2d-sev-${String(s || 'info').toLowerCase()}, var(--d2d-sev-info))`
export const ringColor = (r) => `var(--d2d-ring-${String(r || '').toLowerCase()}, var(--d2d-sev-info))`

// 布局原语: 全部 flex/grid + 令牌; 列表卡文本节点 ≤3(§3)
export const panel = {
  root: {
    className: 'd2d-panel',
    style: {
      background: 'var(--dsw-alias-bg-layer-1, transparent)', // §12.1: 面板表面唯一正确令牌
      color: 'inherit',
      font: 'inherit',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      overflowY: 'auto',
      height: '100%',
      boxSizing: 'border-box',
      minWidth: 0,
    },
  },
  card: {
    style: {
      border: '1px solid var(--d2d-line)',
      borderRadius: '8px',
      padding: '10px',
      display: 'flex',
      flexDirection: 'column',
      gap: '6px',
      minWidth: 0,
    },
  },
  cardTitle: { style: { fontSize: '11px', opacity: '.65', letterSpacing: '.04em', textTransform: 'uppercase', margin: 0 } },
  mono: { style: { fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', fontSize: '11px' } },
  muted: (o = 0.65) => ({ style: { opacity: String(o), fontSize: '11px' } }),
  chip: (extra = {}) => ({
    style: {
      display: 'inline-flex', alignItems: 'center', gap: '4px',
      border: '1px solid var(--d2d-line)', borderRadius: '999px',
      padding: '1px 7px', fontSize: '10px', whiteSpace: 'nowrap',
      ...extra,
    },
  }),
  dot: (color, pulse) => ({
    className: pulse ? 'd2d-dot-running' : undefined,
    style: { width: '7px', height: '7px', borderRadius: '50%', background: color, flex: '0 0 auto' },
  }),
}

export function Card({ title, children, extra }) {
  return h('div', panel.card,
    title ? h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
      h('span', panel.cardTitle, title), extra ?? null) : null,
    children)
}

// ---------- 轮询 hook: visible 门控 + 前端时钟(zombie 走字不占轮询, §4.6) ----------
export function useSnapshot(visible) {
  const [snap, setSnap] = useState(null)
  const [err, setErr] = useState(null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!visible) return // tab 不可见: 完全静默(接入指南 §4.2 / external-plugin-guide 建议)
    const ac = new AbortController()
    let stop = false
    const tick = async () => {
      try {
        const s = await fetchSnapshot(ac.signal)
        if (!stop) { setSnap(s); setErr(null) }
      } catch (e) {
        if (!stop && e?.name !== 'AbortError') setErr(e)
      }
    }
    void tick()
    const poll = setInterval(tick, POLL_MS)
    const clock = setInterval(() => setNow(Date.now()), 1000)
    return () => { stop = true; ac.abort(); clearInterval(poll); clearInterval(clock) }
  }, [visible])
  return { snap, err, now }
}

// ---------- 四态原语(§4.7): 骨架 / fail-closed / 空 ----------
export function Skeleton({ rows = 4 }) {
  return h('div', panel.root, h(Style()),
    h('div', panel.card,
      Array.from({ length: rows }, (_, i) =>
        h('div', { key: i, className: 'd2d-skel', style: { height: '14px', borderRadius: '4px', background: 'var(--d2d-line)' } }))))
}

export function FailClosedBanner({ err, onRetry }) {
  return h('div', panel.root, h(Style()),
    h('div', { ...panel.card, style: { ...panel.card.style, borderColor: 'var(--d2d-sev-high)' } },
      h('div', { style: { fontSize: '12px', fontWeight: 600 } }, '图服务不可达 · 轮询已暂停'),
      h('div', panel.muted(), 'fail-closed: 不展示过期快照'),
      h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.55', wordBreak: 'break-all' } }, String(err?.message ?? err)),
      h('button', { onClick: onRetry, style: { alignSelf: 'flex-start', marginTop: '2px' } }, '立即重试')))
}

export function fmtAge(ms) {
  if (ms < 0 || !Number.isFinite(ms)) return '?'
  if (ms < 60_000) return `${Math.floor(ms / 1000)}s`
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m`
  return `${Math.floor(ms / 3_600_000)}h`
}

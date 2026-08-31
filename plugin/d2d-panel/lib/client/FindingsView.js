// FindingsView.js — d2d:findings tab: 七态管线步进器 + 4 宏观列看板 + 卡片展开
// 列义(PANEL-UI-SPEC §4.4): 活跃(candidate+triaged)/已验证(verified+isolated)/
// 已交付(reported+accepted)/已驳回(rejected); rejected 卡 0.64 不可点(垃圾清单门在工作的证明)。
import { createElement as h, useState } from 'react'
import { useSnapshot, Skeleton, FailClosedBanner, Card, panel, sevColor, Style } from './ui.js'

const STEPS = ['candidate', 'triaged', 'verified', 'reported', 'accepted'] // 主链; isolated/rejected 走分支

function Stepper({ byState }) {
  return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } },
    STEPS.map((s, i) => h('span', { key: s, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
      i > 0 ? h('span', { style: { opacity: '.35', fontSize: '10px' } }, '→') : null,
      h('span', panel.chip({ borderColor: byState[s] ? 'var(--d2d-line-strong)' : 'var(--d2d-line)' }),
        h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px' } }, s),
        h('b', null, String(byState[s] ?? 0)))),
    h('span', { style: { display: 'inline-flex', gap: '4px', marginLeft: '6px' } },
      h('span', panel.chip(), `isolated ${byState.isolated ?? 0}`),
      h('span', panel.chip(), `rejected ${byState.rejected ?? 0}`)))
}

function FindingCard({ f, expanded, onToggle }) {
  const dead = f.state === 'rejected'
  return h('div', {
    onClick: dead ? undefined : onToggle,
    style: {
      borderLeft: `3px solid ${sevColor(f.severity)}`,
      border: '1px solid var(--d2d-line)', borderLeftWidth: '3px', borderLeftColor: sevColor(f.severity),
      borderRadius: '6px', padding: '6px 8px', cursor: dead ? 'default' : 'pointer',
      opacity: dead ? 0.64 : 1,
      display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0,
    },
  },
    h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
      h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, f.title || f.id),
      f.cvss > 0 ? h('span', { ...panel.mono, style: { ...panel.mono.style, color: sevColor(f.severity), fontWeight: 600 } }, f.cvss.toFixed(1)) : null),
    h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } },
      h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '9px', opacity: '.6' } }, f.state),
      f.category ? h('span', { style: { fontSize: '9px', opacity: '.5' } }, f.category) : null),
    expanded ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px solid var(--d2d-line)', paddingTop: '5px' } },
      h('div', panel.muted(.55), `id: ${f.id}`),
      h('div', panel.muted(.55), `ts: ${f.ts || '?'}`),
      f.verified_at ? h('div', panel.muted(.55), `verified_at: ${f.verified_at}`) : null,
      h('div', panel.muted(.4), '复现/转移审计/证据目录 → P3 抽屉')) : null)
}

const COLUMNS = [
  { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
  { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
  { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
  { key: 'rejected', label: '已驳回', states: ['rejected'] },
]

export function FindingsView(props) {
  const { visible } = props
  const [retry, setRetry] = useState(0)
  const [openId, setOpenId] = useState(null)
  const { snap, err } = useSnapshot(visible || retry >= 0)
  if (err && !snap) return h(FailClosedBanner, { err, onRetry: () => setRetry((r) => r + 1) })
  if (!snap) return h(Skeleton, { rows: 6 })
  const { byState, macro, list } = snap.findings
  return h('div', panel.root, h(Style()),
    h(Card, { title: '管线', extra: h('span', panel.muted(.5), `共 ${snap.counts.findings}`) },
      h(Stepper, { byState })),
    h('div', {
      style: {
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', // 容器查询降级: 自适应窄面板(§4.8)
        gap: '8px', alignItems: 'start',
      },
    }, COLUMNS.map((col) => {
      const items = list.filter((f) => col.states.includes(f.state))
      return h('div', { key: col.key, ...panel.card, style: { ...panel.card.style, background: 'transparent' } },
        h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
          h('span', panel.cardTitle, col.label),
          h('b', { style: { fontSize: '12px' } }, String(macro[col.key] ?? 0))),
        items.length
          ? items.slice(0, 30).map((f) =>
            h(FindingCard, { key: f.id, f, expanded: openId === f.id, onToggle: () => setOpenId(openId === f.id ? null : f.id) }))
          : h('div', panel.muted(.4), '空'))
    })))
}

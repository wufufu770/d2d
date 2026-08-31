// OpsView.js — d2d:ops tab(运营观测页): engagement 卡 + workers 心跳 + 开放信号 tail
// 数据: /d2d/api/snapshot 一条聚合响应; 四态渲染; 全部文本走 React 文本节点(结构免疫 XSS)。
import { createElement as h, useState } from 'react'
import { useSnapshot, Skeleton, FailClosedBanner, Card, panel, ringColor, fmtAge, Style, ZOMBIE_MS } from './ui.js'

function CountStrip({ counts }) {
  const items = [
    ['端点', counts.endpoints], ['开放信号', counts.signals_open],
    ['findings', counts.findings], ['经验', counts.experience], ['假设', counts.hypotheses_open],
  ]
  return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
    items.map(([k, v]) => h('span', panel.chip(), h('b', null, String(v ?? 0)), h('span', panel.muted(), k))))
}

function WorkerRow({ a, now }) {
  // 三通道编码(§4.6): 状态点 + 颜色环 + 文字
  const color = a.zombie ? 'var(--d2d-warn)' : a.status === 'running' ? 'var(--d2d-ok)'
    : a.status === 'done' ? 'var(--d2d-sev-info)' : 'var(--d2d-line-strong)'
  const age = a.status === 'running' || a.zombie ? fmtAge(a.ageMs < 0 ? -1 : Math.max(0, now - (Date.parse(a.updated_at) || 0))) : null
  const statusText = a.zombie ? `失联 ${fmtAge(now - (Date.parse(a.updated_at) || now))}` : (a.status || '?')
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 } },
    h('span', panel.dot(color, a.status === 'running' && !a.zombie)),
    h('span', panel.chip({ borderColor: ringColor(a.ring), color: ringColor(a.ring) }), a.ring || '?'),
    h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, a.worker_id || '?'),
    a.chain ? h('span', panel.muted(.5), a.chain) : null,
    h('span', { style: { fontSize: '10px', color: a.zombie ? 'var(--d2d-warn)' : 'inherit', opacity: '.7', whiteSpace: 'nowrap' } }, statusText, age ? ` · ${age}` : null))
}

function EngagementCard({ snap }) {
  const e = snap.engagement
  if (!e) {
    return h(Card, { title: 'Engagement' },
      h('div', panel.muted(), '无活跃 engagement — 用 /pentest 命令开始'))
  }
  const state = e.status === 'active' ? '运行中' : e.status
  return h(Card, {
    title: 'Engagement',
    extra: h('span', panel.chip({ borderColor: e.status === 'active' ? 'var(--d2d-ok)' : 'var(--d2d-line-strong)' }), state),
  },
    h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, e.name),
    h('div', panel.muted(.55), `${e.target || '?'} · scope: ${e.scope || '?'}`),
    h(CountStrip, { counts: snap.counts }))
}

function FleetCard({ fleet }) {
  if (!fleet?.roles || !Object.keys(fleet.roles).length) {
    return h(Card, { title: 'Fleet 模型矩阵' }, h('div', panel.muted(), '未配置 model-policies(fleet 卡降级)'))
  }
  return h(Card, { title: 'Fleet 模型矩阵' },
    Object.entries(fleet.roles).map(([role, m]) =>
      h('div', { key: role, style: { display: 'flex', gap: '7px', alignItems: 'baseline', minWidth: 0 } },
        h('span', panel.chip(), role),
        h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } },
          m.primary || '(default)'),
        m.backup ? h('span', panel.muted(.5), `备 ${m.backup}`) : h('span', panel.muted(.4), '无备·暂停策略'))))
}

export function OpsView(props) {
  const { visible } = props
  const [retry, setRetry] = useState(0)
  const { snap, err, now } = useSnapshot(visible || retry >= 0) // retry 触发重挂
  if (err && !snap) {
    return h(FailClosedBanner, { err, onRetry: () => setRetry((r) => r + 1) })
  }
  if (!snap) return h(Skeleton, null)
  return h('div', panel.root, h(Style()),
    h(EngagementCard, { snap }),
    h(Card, { title: `Workers · 存活 ${snap.agents.filter((a) => a.status === 'running' && !a.zombie).length}/${snap.agents.length}` },
      snap.agents.length
        ? snap.agents.map((a) => h(WorkerRow, { key: a.worker_id, a, now }))
        : h('div', panel.muted(), '暂无 worker 心跳(AgentIdentity 为空)')),
    h(Card, { title: `开放信号 tail · ${snap.counts.signals_open}` },
      snap.signals.length
        ? snap.signals.map((s) =>
          h('div', { key: s.id, style: { display: 'flex', gap: '7px', alignItems: 'baseline', minWidth: 0 } },
            h('span', panel.chip(), s.type || '?'),
            h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, s.id),
            h('span', panel.muted(.5), `w=${s.weight}`)))
        : h('div', panel.muted(), '无开放信号 — discovery 环产出后自动入列')),
    h(FleetCard, { fleet: snap.fleet }))
}

// lib/client.js — d2d-panel client 半(dsh web 浏览器侧)
// 格式: window.__ModuleLoader__.load({id, factory:(require)=>{...}}) — 生态静态插件
// 客户端包标准格式(参照 dsh-sidebar-leap lib/client.js); require('react') 由宿主提供。
// 本文件为手工内联打包(零构建, 与 d2d 仓库哲学一致); 各源模块以区块注释分节。
// 规范: DSH-better-sidebar docs/external-plugin-guide.md(v0.12.0+)
window.__ModuleLoader__.load({
  id: 'd2d-panel',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const react = require('react')
    const { createElement: h, useState, useEffect } = react

    // ══════════ api.js — 快照拉取(同源唯一通道, token 永不出 host) ══════════
    const badgeState = { workers: null, verified: null }

    async function fetchSnapshot(signal) {
      const r = await fetch('/d2d/api/snapshot', { signal, headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? 'bad snapshot'))
      badgeState.workers = j?.agents?.filter((a) => a?.status === 'running' && !a?.zombie).length ?? null // badge=真存活(排除 zombie)
      badgeState.verified = j?.findings?.macro?.verified ?? null
      return j
    }

    // ══════════ ui.js — DSW 令牌样式 / 语义色 / 轮询 hook / 四态原语 ══════════
    const POLL_MS = 2000
    const SEMANTIC_CSS = [
      '.d2d-panel{--d2d-sev-critical:#e5484d;--d2d-sev-high:#f0773c;--d2d-sev-medium:#d8a021;--d2d-sev-low:#58a36a;--d2d-sev-info:#8e97a8;',
      '--d2d-ring-discovery:#4d6bfe;--d2d-ring-deep:#9b7bff;--d2d-ring-creative:#f5a623;--d2d-ring-verify:#2fb6a3;--d2d-ring-study:#8e97a8;',
      '--d2d-ok:#58a36a;--d2d-warn:#d8a021;--d2d-line:rgba(128,140,165,.32);--d2d-line-strong:rgba(128,140,165,.5)}',
      '@keyframes d2d-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '@keyframes d2d-shimmer{0%{opacity:.45}50%{opacity:.9}100%{opacity:.45}}',
      '@media (prefers-reduced-motion: no-preference){',
      '.d2d-dot-running{animation:d2d-pulse 2s ease-in-out infinite}',
      '.d2d-skel{animation:d2d-shimmer 1.6s ease-in-out infinite}}',
    ].join('\n')

    const sevColor = (s) => `var(--d2d-sev-${String(s || 'info').toLowerCase()}, var(--d2d-sev-info))`
    const ringColor = (r) => `var(--d2d-ring-${String(r || '').toLowerCase()}, var(--d2d-sev-info))`

    const panel = {
      root: {
        className: 'd2d-panel',
        style: {
          background: 'var(--dsw-alias-bg-layer-1, transparent)', // 接入指南 §12.1: 面板表面唯一正确令牌
          color: 'inherit', font: 'inherit', padding: '10px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          overflowY: 'auto', height: '100%', boxSizing: 'border-box', minWidth: 0,
        },
      },
      card: { style: { border: '1px solid var(--d2d-line)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 } },
      cardTitle: { style: { fontSize: '11px', opacity: '.65', letterSpacing: '.04em', textTransform: 'uppercase', margin: 0 } },
      mono: { style: { fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', fontSize: '11px' } },
      muted: (o = 0.65) => ({ style: { opacity: String(o), fontSize: '11px' } }),
      chip: (extra = {}) => ({ style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--d2d-line)', borderRadius: '999px', padding: '1px 7px', fontSize: '10px', whiteSpace: 'nowrap', ...extra } }),
      dot: (color, pulse) => ({ className: pulse ? 'd2d-dot-running' : undefined, style: { width: '7px', height: '7px', borderRadius: '50%', background: color, flex: '0 0 auto' } }),
    }

    function Style() { return h('style', null, SEMANTIC_CSS) }

    function Card({ title, children, extra }) {
      return h('div', panel.card,
        title ? h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
          h('span', panel.cardTitle, title), extra ?? null) : null,
        children)
    }

    // 轮询 hook: visible 门控(tab 不可见完全静默) + 前端时钟(zombie 走字不占轮询)
    function useSnapshot(visible) {
      const [snap, setSnap] = useState(null)
      const [err, setErr] = useState(null)
      const [now, setNow] = useState(() => Date.now())
      useEffect(() => {
        if (!visible) return
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

    function Skeleton({ rows = 4 }) {
      return h('div', panel.root, Style(),
        h('div', panel.card,
          Array.from({ length: rows }, (_, i) =>
            h('div', { key: i, className: 'd2d-skel', style: { height: '14px', borderRadius: '4px', background: 'var(--d2d-line)' } }))))
    }

    function FailClosedBanner({ err, onRetry }) {
      return h('div', panel.root, Style(),
        h('div', { ...panel.card, style: { ...panel.card.style, borderColor: 'var(--d2d-sev-high)' } },
          h('div', { style: { fontSize: '12px', fontWeight: 600 } }, '图服务不可达 · 轮询已暂停'),
          h('div', panel.muted(), 'fail-closed: 不展示过期快照'),
          h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.55', wordBreak: 'break-all' } }, String(err?.message ?? err)),
          h('button', { onClick: onRetry, style: { alignSelf: 'flex-start', marginTop: '2px' } }, '立即重试')))
    }

    function fmtAge(ms) {
      if (ms < 0 || !Number.isFinite(ms)) return '?'
      if (ms < 60000) return `${Math.floor(ms / 1000)}s`
      if (ms < 3600000) return `${Math.floor(ms / 60000)}m`
      return `${Math.floor(ms / 3600000)}h`
    }

    // ══════════ OpsView.js — d2d:ops tab(运营观测页) ══════════
    function CountStrip({ counts }) {
      const items = [
        ['端点', counts.endpoints], ['开放信号', counts.signals_open],
        ['findings', counts.findings], ['经验', counts.experience], ['假设', counts.hypotheses_open],
      ]
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
        items.map(([k, v]) => h('span', { key: k, ...panel.chip() }, h('b', null, String(v ?? 0)), h('span', panel.muted(), k))))
    }

    function WorkerRow({ a, now }) {
      // 三通道编码: 状态点 + 环色 chip + 文字(不单靠颜色, WCAG)
      const color = a.zombie ? 'var(--d2d-warn)' : a.status === 'running' ? 'var(--d2d-ok)'
        : a.status === 'done' ? 'var(--d2d-sev-info)' : 'var(--d2d-line-strong)'
      const beatTs = Date.parse(a.updated_at) || 0
      const age = (a.status === 'running' || a.zombie) && beatTs ? fmtAge(Math.max(0, now - beatTs)) : null
      const statusText = a.zombie ? `失联 ${fmtAge(now - beatTs)}` : (a.status || '?')
      return h('div', { style: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0 } },
        h('span', panel.dot(color, a.status === 'running' && !a.zombie)),
        h('span', { ...panel.chip({ borderColor: ringColor(a.ring), color: ringColor(a.ring) }) }, a.ring || '?'),
        h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, a.worker_id || '?'),
        a.chain ? h('span', panel.muted(0.5), a.chain) : null,
        h('span', { style: { fontSize: '10px', color: a.zombie ? 'var(--d2d-warn)' : 'inherit', opacity: '.7', whiteSpace: 'nowrap' } },
          statusText, age ? ` · ${age}` : null))
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
        extra: h('span', { ...panel.chip({ borderColor: e.status === 'active' ? 'var(--d2d-ok)' : 'var(--d2d-line-strong)' }) }, state),
      },
        h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, e.name),
        h('div', panel.muted(0.55), `${e.target || '?'} · scope: ${e.scope || '?'}`),
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
            h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, m.primary || '(default)'),
            m.backup ? h('span', panel.muted(0.5), `备 ${m.backup}`) : h('span', panel.muted(0.4), '无备·暂停策略'))))
    }

    function OpsView(props) {
      const { visible } = props
      const [retry, setRetry] = useState(0)
      const { snap, err, now } = useSnapshot(visible || retry >= 0)
      if (err && !snap) {
        return h(FailClosedBanner, { err, onRetry: () => setRetry((r) => r + 1) })
      }
      if (!snap) return h(Skeleton, null)
      const alive = snap.agents.filter((a) => a.status === 'running' && !a.zombie).length
      return h('div', panel.root, Style(),
        h(EngagementCard, { snap }),
        h(Card, { title: `Workers · 存活 ${alive}/${snap.agents.length}` },
          snap.agents.length
            ? snap.agents.map((a) => h(WorkerRow, { key: a.worker_id, a, now }))
            : h('div', panel.muted(), '暂无 worker 心跳(AgentIdentity 为空)')),
        h(Card, { title: `开放信号 tail · ${snap.counts.signals_open}` },
          snap.signals.length
            ? snap.signals.map((s) =>
              h('div', { key: s.id, style: { display: 'flex', gap: '7px', alignItems: 'baseline', minWidth: 0 } },
                h('span', panel.chip(), s.type || '?'),
                h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, s.id),
                h('span', panel.muted(0.5), `w=${s.weight}`)))
            : h('div', panel.muted(), '无开放信号 — discovery 环产出后自动入列')),
        h(FleetCard, { fleet: snap.fleet }))
    }

    // ══════════ FindingsView.js — d2d:findings tab(七态看板) ══════════
    const STEPS = ['candidate', 'triaged', 'verified', 'reported', 'accepted'] // 主链; isolated/rejected 走分支
    const COLUMNS = [
      { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
      { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
      { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
      { key: 'rejected', label: '已驳回', states: ['rejected'] },
    ]

    function stepChip(s, n, strong) {
      return h('span', { ...panel.chip({ borderColor: strong ? 'var(--d2d-line-strong)' : 'var(--d2d-line)' }) },
        h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px' } }, s),
        h('b', null, String(n ?? 0)))
    }

    function Stepper({ byState }) {
      const chain = STEPS.map((s, i) => h('span', { key: s, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
        i > 0 ? h('span', { style: { opacity: '.35', fontSize: '10px' } }, '→') : null,
        stepChip(s, byState[s], byState[s] > 0)))
      const branch = h('span', { style: { display: 'inline-flex', gap: '4px', marginLeft: '6px' } },
        stepChip('isolated', byState.isolated, byState.isolated > 0),
        stepChip('rejected', byState.rejected, byState.rejected > 0))
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } }, chain, branch)
    }

    function FindingCard({ f, expanded, onToggle }) {
      const dead = f.state === 'rejected'
      return h('div', {
        onClick: dead ? undefined : onToggle,
        style: {
          border: '1px solid var(--d2d-line)', borderLeft: `3px solid ${sevColor(f.severity)}`,
          borderRadius: '6px', padding: '6px 8px', cursor: dead ? 'default' : 'pointer',
          opacity: dead ? 0.64 : 1, // rejected 不可点: 垃圾清单门在工作的证明(§4.4)
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
          h('div', panel.muted(0.55), `id: ${f.id}`),
          h('div', panel.muted(0.55), `ts: ${f.ts || '?'}`),
          f.verified_at ? h('div', panel.muted(0.55), `verified_at: ${f.verified_at}`) : null,
          h('div', panel.muted(0.4), '复现/转移审计/证据目录 → P3 抽屉')) : null)
    }

    function FindingsView(props) {
      const { visible } = props
      const [retry, setRetry] = useState(0)
      const [openId, setOpenId] = useState(null)
      const { snap, err } = useSnapshot(visible || retry >= 0)
      if (err && !snap) return h(FailClosedBanner, { err, onRetry: () => setRetry((r) => r + 1) })
      if (!snap) return h(Skeleton, { rows: 6 })
      const { byState, macro, list } = snap.findings
      return h('div', panel.root, Style(),
        h(Card, { title: '管线', extra: h('span', panel.muted(0.5), `共 ${snap.counts.findings}`) },
          h(Stepper, { byState })),
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', // 窄面板自适应(§4.8 容器查询降级)
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
              : h('div', panel.muted(0.4), '空'))
        })))
    }

    // ══════════ index.js — 插件入口: better-sidebar tab 注册(软依赖) ══════════
    // 软依赖: cordis inject=['betterSidebar'] 保证服务就绪才激活; 未安装 better-sidebar
    // 时本 client 恒 pending(dsh-sentinel 模式), host 半路由不受影响。
    const inject = ['betterSidebar']

    function apply(ctx) {
      const svc = ctx.betterSidebar
      if (!svc) {
        ctx.log?.('d2d-panel: betterSidebar 服务不可用, tab 注册跳过')
        return
      }
      const cap = (f) => !svc.features || svc.features.includes(f) // 能力探测(老版本降级)

      ctx.effect(() => svc.registerTab({
        id: 'd2d:ops', // 包前缀; 内置区 10-50, 三方区 60 起
        title: () => 'd2d',
        order: 60,
        single: true, // ≡ dedupeKey: () => id
        ...(cap('badge') ? { badge: () => badgeState.workers ?? null } : {}), // 同步缓存读, 不发请求
        component: (props) => h(OpsView, props),
      }), 'd2d-panel: ops tab')

      ctx.effect(() => svc.registerTab({
        id: 'd2d:findings',
        title: () => 'd2d Findings',
        order: 61,
        single: true,
        ...(cap('badge') ? { badge: () => badgeState.verified ?? null } : {}),
        component: (props) => h(FindingsView, props),
      }), 'd2d-panel: findings tab')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})

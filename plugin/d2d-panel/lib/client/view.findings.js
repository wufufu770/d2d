    // ══════════ view.findings.js — d2d:findings tab(七态看板 · 筛选 + 人工裁决) ══════════
    const STEPS = ['candidate', 'triaged', 'verified', 'reported', 'accepted'] // 主链; isolated/rejected/needs-scope 走分支
    const COLUMNS = [
      { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
      { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
      { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
      { key: 'needs-scope', label: '边界待澄清', states: ['needs-scope'] },
      { key: 'rejected', label: '已驳回', states: ['rejected'] },
    ]
    // 与 graphd/app.py FINDING_TRANSITIONS 同口径(镜像, 门在服务端)
    const TRANSITIONS = {
      candidate: ['triaged', 'verified', 'isolated', 'rejected', 'needs-scope'],
      triaged: ['verified', 'isolated', 'rejected', 'needs-scope'],
      verified: ['reported', 'isolated'],
      isolated: ['candidate', 'rejected'],
      'needs-scope': ['candidate', 'triaged', 'verified', 'rejected'],
      reported: ['accepted', 'rejected'],
      accepted: [],
      rejected: [],
    }

    function stepChip(s, n, opts = {}) {
      return h('button', {
        ...panel.chip({ borderColor: opts.active ? 'var(--d2d-brand)' : opts.strong ? 'var(--d2d-line-strong)' : 'var(--d2d-line)', color: opts.active ? 'var(--d2d-brand)' : undefined }),
        onClick: opts.onClick,
        disabled: !opts.onClick,
        style: { ...panel.chip({ borderColor: opts.active ? 'var(--d2d-brand)' : opts.strong ? 'var(--d2d-line-strong)' : 'var(--d2d-line)' }).style, ...(opts.onClick ? { cursor: 'pointer' } : { cursor: 'default' }) },
      },
        h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px' } }, s),
        h('b', null, String(n ?? 0)))
    }

    function Stepper({ byState, filter, setFilter }) {
      const chain = STEPS.map((s, i) => h('span', { key: s, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
        i > 0 ? h('span', { style: { opacity: '.35', fontSize: '10px' } }, '→') : null,
        stepChip(s, byState[s], { active: filter === s, strong: byState[s] > 0, onClick: () => setFilter(filter === s ? null : s) })))
      const branch = h('span', { style: { display: 'inline-flex', gap: '4px', marginLeft: '6px' } },
        stepChip('isolated', byState.isolated, { active: filter === 'isolated', strong: byState.isolated > 0, onClick: () => setFilter(filter === 'isolated' ? null : 'isolated') }),
        stepChip('rejected', byState.rejected, { active: filter === 'rejected', strong: byState.rejected > 0, onClick: () => setFilter(filter === 'rejected' ? null : 'rejected') }))
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } }, chain, branch)
    }

    /** 人工裁决: 合法转移按钮 + reason 输入 → POST /d2d/api/transition(actor=panel)。 */
    function TransitionOps({ f, refresh }) {
      const [reason, setReason] = useState('')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const [okTo, setOkTo] = useState(null)
      const legal = TRANSITIONS[f.state] ?? []
      if (!legal.length) return h('div', panel.muted(0.45), '终态 — 不可再转移')
      const go = async (to) => {
        setBusy(true); setErr(null); setOkTo(null)
        try {
          await postJson('transition', { id: f.id, to, actor: 'panel', reason: reason.trim() || `panel 推动到 ${to}` })
          setOkTo(to)
          setReason('')
          refresh()
        } catch (e) { setErr(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
          legal.map((to) => h('button', { key: to, ...panel.btn({ borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }), disabled: busy, onClick: () => go(to) },
            `→ ${to}${busy ? ' …' : ''}`))),
        h('input', {
          ...panel.input({ flex: 1 }),
          placeholder: '裁决理由(可选, 默认自动填)',
          value: reason,
          disabled: busy,
          onChange: (ev) => setReason(ev.target.value),
        }),
        err ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, err) : null,
        okTo ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-ok)' } }, `已转移 → ${okTo}(审计 actor=panel)`) : null)
    }

    function parseTraj(s) {
      try { return JSON.parse(s) } catch { return null }
    }

    function FindingCard({ f, expanded, onToggle, refresh }) {
      const dead = f.state === 'rejected'
      const traj = parseTraj(f.last_transition)
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
        expanded ? h('div', {
          onClick: (ev) => ev.stopPropagation(),
          style: { display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid var(--d2d-line)', paddingTop: '5px' },
        },
          h('div', panel.muted(0.55), `id: ${f.id} · ts: ${f.ts || '?'}`),
          f.verified_at ? h('div', panel.muted(0.55), `verified_at: ${f.verified_at}`) : null,
          traj ? h('div', panel.muted(0.55),
            `上次转移: ${traj.from}→${traj.to} · ${traj.actor} · ${String(traj.reason ?? '')}`) : null,
          h(TransitionOps, { f, refresh })) : null)
    }

    function FindingsView(props) {
      const { visible } = props
      const { snap, err, refresh } = useSnapshot(visible)
      const [openId, setOpenId] = useState(null)
      const [filter, setFilter] = useState(null)
      if (err && !snap) return h(FailClosedBanner, { err, onRetry: refresh })
      if (!snap) return h(Skeleton, { rows: 6 })
      const { byState, macro, list } = snap.findings
      const shown = filter ? list.filter((f) => f.state === filter) : list
      return h('div', panel.root, Style(),
        h(Card, {
          title: '管线',
          extra: h('span', panel.muted(0.5), filter ? `筛选: ${filter} · 点击 chip 取消` : `共 ${snap.counts.findings} · 点击 chip 筛选`),
        },
          h(Stepper, { byState, filter, setFilter })),
        filter ? h(Card, { title: `${filter} · ${shown.length}`, extra: h('button', { ...panel.btn(), onClick: () => setFilter(null) }, '清除筛选') },
          shown.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto', paddingRight: '2px' } },
              shown.map((f) =>
                h(FindingCard, { key: f.id, f, expanded: openId === f.id, onToggle: () => setOpenId(openId === f.id ? null : f.id), refresh })))
            : h('div', panel.muted(0.4), '该状态无记录')) : null,
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', // 窄面板自适应(§4.8 容器查询降级)
            gap: '8px', alignItems: 'start',
          },
        }, COLUMNS.map((col) => {
          const items = shown.filter((f) => col.states.includes(f.state))
          return h('div', { key: col.key, ...panel.card, style: { ...panel.card.style, background: 'transparent', display: 'flex', flexDirection: 'column', minWidth: 0 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
              h('span', panel.cardTitle, col.label),
              h('b', { style: { fontSize: '12px' } }, String(macro[col.key] ?? 0))),
            // R5: 列体固定高度 + 列内滚动 —— 115 条 candidate 不再把页面顶出三屏
            items.length
              ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto', paddingRight: '2px' } },
                items.map((f) =>
                  h(FindingCard, { key: f.id, f, expanded: openId === f.id, onToggle: () => setOpenId(openId === f.id ? null : f.id), refresh })))
              : h('div', panel.muted(0.4), '空'))
        })))
    }

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

    /** WRAP-2 回灌两路(verified 专用, 拍板 1): 显式两步确认(arm→confirm 防误触)→
     *  POST /d2d/api/adjudicate(kind=finding; 后端分流 revoke|false_positive;
     *  host-only+审计+既有门在 graphd 校验)。revoke=隔离待裁(可重开);
     *  false_positive=拒真终态不可逆。
     *  FIX-1 A1 仲裁分支: dual_sign='disputed' 行(双签不一致留人工)显示
     *  disputed_confirm(人工确认维持第一签→signed+verified)/disputed_reject(人工否决→
     *  rejected 终态)两钮 — 同组件同审计形态, 只扩入口不重设计; 门与审计在 graphd。 */
    function AdjudicateOps({ f, refresh }) {
      const [reason, setReason] = useState('')
      const [arm, setArm] = useState(null)
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const [done, setDone] = useState(null)
      const disputed = f.dual_sign === 'disputed'
      if (f.state !== 'verified' && !disputed) return null
      const go = async (action) => {
        setBusy(true); setErr(null)
        try {
          const fallback = action === 'revoke' ? 'panel 撤销: 复验未复现, 隔离待裁'
            : action === 'false_positive' ? 'panel 标假阳性: 鉴权档位/证据复核不成立'
            : action === 'disputed_confirm' ? 'panel 仲裁确认: 双签争议人工复核, 维持第一签结论'
            : 'panel 仲裁否决: 双签争议人工复核, 第一签结论不成立'
          await postJson('adjudicate', { kind: 'finding', action, id: f.id, operator: 'panel', reason: (reason.trim() || fallback).slice(0, 80) })
          setDone(action); setArm(null); setReason('')
          refresh()
        } catch (e) { setErr(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      const btn = (action, label, warn) => h('button', {
        ...panel.btn({ borderColor: warn ? 'var(--d2d-sev-high)' : 'var(--d2d-warn)', color: warn ? 'var(--d2d-sev-high)' : 'var(--d2d-warn)' }),
        disabled: busy,
        onClick: () => (arm === action ? go(action) : setArm(action)),
      }, arm === action ? `确认${label}?(再点一次)` : label)
      const doneMsg = done === 'revoke' ? '已回灌(撤销→isolated 可重开)'
        : done === 'false_positive' ? '已回灌(假阳性→rejected 终态)'
        : done === 'disputed_confirm' ? '已仲裁(确认→signed+verified 维持结论)'
        : done === 'disputed_reject' ? '已仲裁(否决→rejected 终态)' : null
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '4px' } },
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
          disputed
            ? [btn('disputed_confirm', '仲裁·确认(维持第一签→verified)', false),
               btn('disputed_reject', '仲裁·否决(→rejected 终态)', true)]
            : [btn('revoke', '回灌·撤销(隔离待裁)', false),
               btn('false_positive', '回灌·标假阳性(终态不可逆)', true)],
          h('span', panel.muted(0.45), disputed ? '双签 disputed · host-only · 人工身份审计' : 'host-only · 全量审计留痕')),
        h('input', {
          ...panel.input({ flex: 1 }),
          placeholder: '裁决理由(回灌必填, 缺省自动填; 1-80 字符)',
          value: reason,
          disabled: busy,
          onChange: (ev) => setReason(ev.target.value),
        }),
        err ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, err) : null,
        done ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-ok)' } }, `${doneMsg}; 审计 operator=panel`) : null)
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
          h(TransitionOps, { f, refresh }),
          h(AdjudicateOps, { f, refresh })) : null)
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
        h(Card, {
          title: '幻觉抽检(#18 合并 · 隔离池浏览)',
          extra: h('span', panel.muted(0.5), '记账: node scripts/brain/experience-metrics.mjs --sample 5 → 人工审 → --record'),
        },
          (snap.quarantine ?? []).length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' } },
              snap.quarantine.map((xq) => h('div', { key: xq.id, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
                h('span', panel.chip({ borderColor: 'var(--d2d-warn)' }), 'quarantined'),
                h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: xq.id }, xq.title || xq.id),
                h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '9px', opacity: '.5', flex: '0 0 auto' } }, String(xq.created_at ?? '').slice(0, 10)))))
            : h('div', panel.muted(0.4), '隔离池空 — 经验回流写入即 quarantined, 评审出池后在此浏览'),
          h('div', { ...panel.muted(0.45), style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '4px' } },
            '抽检=裁决入口的抽样浏览形态(同一入口): 勾选对象经 CLI --record 记账; 撤销经经验裁决回灌(active→deprecated, 检索面即时排除)')),
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

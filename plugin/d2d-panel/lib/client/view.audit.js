    // ══════════ view.audit.js — T3-3-2 审计时间线 tab: audit.log + transition-log 双源合流 ══════════
    // 数据面: GET /d2d/api/audit(fail-soft 文件面)。非法迁移只进 audit.log(transition-illegal 等),
    // 转态成功进 transition-log — 合流才是完整审计面; detail 经 host 侧脱敏/reason 截尾。
    const AUDIT_POLL_MS = 5000
    const AUDIT_KIND_WARN = ['auth-fail', 'transition-illegal', 'denylist-hit', 'injection-block', 'frontier-reject']

    function useAudit(visible, kind, limit) {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      useEffect(() => {
        if (!visible) return
        let stop = false
        const tick = async () => {
          try {
            const j = await fetchApi(`audit?limit=${encodeURIComponent(limit)}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`)
            if (!stop) { setData(j); setErr(null) }
          } catch (e) { if (!stop) setErr(e) }
        }
        void tick()
        const poll = setInterval(tick, AUDIT_POLL_MS)
        return () => { stop = true; clearInterval(poll) }
      }, [visible, kind, limit])
      return { audit: data?.audit ?? null, err }
    }

    /** detail 摘要(纯文本渲染 — 全部经 React 文本节点, 无 HTML 注入面):
     *  transition 源出语义化摘要, audit 源出 detail JSON 截尾。 */
    function auditDetailOf(e) {
      if (e?.source === 'transition') {
        const d = e?.detail ?? {}
        return [`${d.from_status || '?'} → ${d.to_status || '?'}`, d.node_id, d.actor ? `by ${d.actor}` : '', d.reason].filter(Boolean).join(' · ')
      }
      const s = JSON.stringify(e?.detail ?? {})
      return s === '{}' || s === 'null' ? '—' : s.slice(0, 160)
    }

    function AuditRow({ e }) {
      const warn = AUDIT_KIND_WARN.some((k) => String(e.kind).includes(k))
      return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
        h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.55, flex: '0 0 auto' } }, String(e.ts ?? '').slice(5, 19).replace('T', ' ')),
        h('span', panel.chip({ ...(e.source === 'transition' ? { borderColor: 'var(--d2d-ring-discovery)' } : {}) }), e.source),
        h('span', panel.chip({ ...(warn ? { borderColor: 'var(--d2d-sev-high)', color: 'var(--d2d-sev-high)' } : {}) }), e.kind),
        h('span', { ...panel.muted(0.6), style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }, title: auditDetailOf(e) }, auditDetailOf(e)))
    }

    /** 审计时间线 tab 容器: kind chips(双源词表)+limit+降序时间线。 */
    function AuditView({ visible }) {
      const [kind, setKind] = useState('')
      const [limit, setLimit] = useState(200)
      const { audit, err } = useAudit(visible, kind, limit)
      return h('div', panel.root, Style(),
        h(Card, {
          title: '审计时间线(安全事件 + 状态迁移合流)',
          extra: err
            ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, `不可用: ${String(err?.message ?? err).slice(0, 60)}`)
            : h('span', panel.muted(0.45), `显示 ${audit?.events?.length ?? 0} / ${audit?.total ?? 0} 条 · 降序`),
        },
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
            h('button', { ...panel.btn(!kind ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}), onClick: () => setKind('') }, '全部'),
            (audit?.kinds ?? []).slice(0, 14).map((k) => h('button', {
              key: k, ...panel.btn(kind === k ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}),
              onClick: () => setKind(kind === k ? '' : k),
            }, k)),
            h('span', { ...panel.muted(0.5), style: { marginLeft: 'auto' } }, '行数'),
            [100, 200, 500].map((n) => h('button', {
              key: n, ...panel.btn(limit === n ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}),
              onClick: () => setLimit(n),
            }, String(n)))),
          (audit?.degraded ?? []).map((d, i) => h('div', { key: i, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d)),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '420px', overflowY: 'auto', paddingRight: '2px' } },
            (audit?.events ?? []).length
              ? audit.events.map((e, i) => h(AuditRow, { key: `${e.ts}:${i}`, e }))
              : h('div', panel.muted(0.45), err ? '拉取失败 — fail-soft 不显示旧数据' : '无审计事件 — 图写入/门拒绝/转态发生时在此出现')),
          h('div', { ...panel.muted(0.45), style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
            '非法迁移(transition-illegal 等)只落 audit.log, 转态成功落 transition-log — 两源合流为完整审计面; reason 已截尾、凭据面不落本流。')))
    }

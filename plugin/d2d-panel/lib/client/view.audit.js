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
        // E40-C1: setTimeout 链式(不堆积) + AbortSignal
        const ac = new AbortController()
        let alive = true
        let t = null
        const tick = async () => {
          try {
            const j = await fetchApi(`audit?limit=${encodeURIComponent(limit)}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`, { signal: ac.signal })
            if (alive) { setData(j); setErr(null) }
          } catch (e) {
            if (alive && e?.name !== 'AbortError') setErr(e)
          } finally {
            if (alive && !ac.signal.aborted) t = setTimeout(tick, AUDIT_POLL_MS)
          }
        }
        void tick()
        return () => { alive = false; ac.abort(); if (t) clearTimeout(t) }
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

    // B10 kind → tone 映射(mockup: fail/illegal=danger, write 族=ok, warn 词表=danger 兜底, 默认 neutral)
    function auditToneOf(e) {
      const k = String(e?.kind ?? '')
      if (AUDIT_KIND_WARN.some((w) => k.includes(w))) return 'danger'
      if (k.includes('write') || k.includes('verification')) return 'ok'
      if (e?.source === 'transition') return 'info'
      return 'neutral'
    }

    /** B10 结构化表格行(grid: 132px time | 150px action tone badge | 1fr truncate detail)。
     *  整行点击 → DetailSheet(打开时刻快照)。 */
    function AuditRow({ e, onOpen }) {
      return h('div', { className: 'd2d-tablerow', onClick: () => onOpen?.(e), title: auditDetailOf(e),
        style: { display: 'grid', gridTemplateColumns: '132px 150px minmax(0,1fr)', gap: '8px', alignItems: 'center',
          padding: '5px 8px', borderRadius: '6px', minWidth: 0 } },
        h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '11px', color: 'var(--d2d-text-lo)' } }, String(e.ts ?? '').slice(5, 19).replace('T', ' ')),
        h('span', panel.chipTone(auditToneOf(e)), e.kind),
        h('span', { style: { fontSize: '11px', color: 'var(--d2d-text-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, auditDetailOf(e)))
    }

    /** 审计时间线 tab 容器: 搜索+kind chips(双源词表)+limit+结构化表格+DetailSheet。 */
    function AuditView({ visible }) {
      const [kind, setKind] = useState('')
      const [limit, setLimit] = useState(200)
      const [q, setQ] = useState('')
      const [sheet, setSheet] = useState(null)
      const { audit, err } = useAudit(visible, kind, limit)
      const events = (audit?.events ?? []).filter((e) => {
        if (!q.trim()) return true
        const blob = `${e.kind} ${e.source} ${auditDetailOf(e)}`.toLowerCase()
        return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => blob.includes(t))
      })
      return h('div', panel.root, Style(),
        h(Card, {
          title: '审计', icon: 'history',
          extra: err
            ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, '不可用')
            : h('span', panel.muted(0.45), `${audit?.events?.length ?? 0}/${audit?.total ?? 0}`),
        },
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
            h('div', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center', flex: '1 1 180px', minWidth: '150px' } },
              h('span', { style: { position: 'absolute', left: '8px', display: 'inline-flex', color: 'var(--d2d-text-lo)', pointerEvents: 'none' } }, h(IconSearch, { size: 13 })),
              h('input', { ...panel.input({ flex: 1 }), style: { ...panel.input({ flex: 1 }).style, paddingLeft: '28px' },
                placeholder: '搜索 Event / Payload', value: q, onChange: (ev) => setQ(ev.target.value) })),
            h('span', { ...panel.muted(0.5), style: { marginLeft: 'auto', flex: '0 0 auto' } }, '行数'),
            [100, 200, 500].map((n) => h('button', {
              key: n, ...panel.btn(limit === n ? { borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' } : {}),
              onClick: () => setLimit(n),
            }, String(n)))),
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
            h('button', { ...panel.btn(!kind ? { borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' } : {}), onClick: () => setKind('') }, '全部'),
            (audit?.kinds ?? []).slice(0, 14).map((k) => h('button', {
              key: k, ...panel.btn(kind === k ? { borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' } : {}),
              onClick: () => setKind(kind === k ? '' : k),
            }, k))),
          (audit?.degraded ?? []).map((d, i) => h('div', { key: i, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d)),
          // 表头(mockup: 11px lo 色, 底 border)
          h('div', { style: { display: 'grid', gridTemplateColumns: '132px 150px minmax(0,1fr)', gap: '8px', padding: '6px 8px', borderBottom: '1px solid var(--d2d-line)', color: 'var(--d2d-text-lo)', fontSize: '10px' } },
            h('span', null, 'Time'), h('span', null, 'Action'), h('span', null, 'Payload')),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px', maxHeight: '420px', overflowY: 'auto', paddingRight: '2px' } },
            events.length
              ? events.map((e, i) => h(AuditRow, { key: `${e.ts}:${i}`, e, onOpen: setSheet }))
              : h('div', panel.muted(0.45), err ? '拉取失败' : '无审计事件')),
          h(DetailSheet, { item: sheet, onClose: () => setSheet(null), title: 'Audit Event Detail' })))
    }

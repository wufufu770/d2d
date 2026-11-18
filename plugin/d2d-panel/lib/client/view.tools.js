    // ══════════ view.tools.js — T3-3-2 工具调用明细 tab: run-log 全事件投影 + per-worker 工具量 ══════════
    // 数据面: GET /d2d/api/toolcalls(fail-soft 文件面; eng 缺省=selected)。kind 过滤/limit 走服务端
    // 钳位(1..600); 坏行 host 侧跳过。轮询 3s(调度事件是活跃面)。
    const TOOLS_POLL_MS = 3000
    const TOOLS_LIMITS = [100, 200, 400]
    const TOOLS_KIND_WARN = ['tool-gate-deny', 'scope-denied-terminal', 'quota-fail-stop', 'crash', 'tool-output-truncated']

    function useToolCalls(visible, kind, limit) {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      const [rev, setRev] = useState(0)
      useEffect(() => {
        if (!visible) return undefined
        // E40-C1: setTimeout 链式(不堆积) + AbortSignal
        const ac = new AbortController()
        let alive = true
        let t = null
        const tick = async () => {
          try {
            const j = await fetchApi(`toolcalls?limit=${encodeURIComponent(limit)}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`, { signal: ac.signal })
            if (alive) { setData(j); setErr(null) }
          } catch (e) {
            if (alive && e?.name !== 'AbortError') setErr(e)
          } finally {
            if (alive && !ac.signal.aborted) t = setTimeout(tick, TOOLS_POLL_MS)
          }
        }
        void tick()
        return () => { alive = false; ac.abort(); if (t) clearTimeout(t) }
      }, [visible, kind, limit, rev])
      return { tc: data?.toolcalls ?? null, err, refresh: () => setRev((r) => r + 1) }
    }

    /** B10 事件行(结构化表格 grid: 100px time | 190px kind tone badge | 140px worker | 1fr detail)。
     *  整行点击 → DetailSheet(打开时刻快照; detail 对象=reason/tool/command/extra 面不含 worker 元数据)。 */
    function ToolEventRow({ e, onOpen }) {
      const warn = TOOLS_KIND_WARN.some((k) => String(e.kind).includes(k))
      const detail = [e.reason, e.tool, e.command, e.extra].filter(Boolean).join(' · ')
      return h('div', { className: 'd2d-tablerow', onClick: () => onOpen?.(e), title: detail,
        style: { display: 'grid', gridTemplateColumns: '100px 190px 140px minmax(0,1fr)', gap: '8px', alignItems: 'center',
          padding: '5px 8px', borderRadius: '6px', minWidth: 0 } },
        h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '11px', color: 'var(--d2d-text-lo)' } }, fmtClock(e.ts)),
        h('span', panel.chipTone(warn ? 'danger' : 'neutral'), e.kind),
        h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--d2d-text-mid)' }, title: `${e.worker} · ring ${e.ring} · ${e.model}` }, e.worker || '—'),
        h('span', { style: { fontSize: '11px', color: 'var(--d2d-text-mid)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 } }, detail || '—'))
    }

    /** 工具调用明细 tab 容器: 搜索+kind chips(服务端词表)+limit+结构化表格+DetailSheet+工具量榜。 */
    function ToolsView({ visible }) {
      const [kind, setKind] = useState('')
      const [limit, setLimit] = useState(200)
      const [q, setQ] = useState('')
      const [sheet, setSheet] = useState(null)
      const { tc, err, refresh } = useToolCalls(visible, kind, limit)
      if (err && !tc) return h(FailClosedBanner, { err, onRetry: refresh })
      const events = (tc?.events ?? []).filter((e) => {
        if (!q.trim()) return true
        const blob = `${e.kind} ${e.worker} ${e.tool} ${e.reason} ${e.command} ${e.extra}`.toLowerCase()
        return q.toLowerCase().split(/\s+/).filter(Boolean).every((t) => blob.includes(t))
      })
      return h('div', panel.root, Style(),
        h(Card, {
          title: '工具调用', icon: 'terminal',
          extra: err
            ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, '不可用')
            : h('span', panel.muted(0.45), `${tc?.events?.length ?? 0}`),
        },
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
            h('div', { style: { position: 'relative', display: 'inline-flex', alignItems: 'center', flex: '1 1 180px', minWidth: '150px' } },
              h('span', { style: { position: 'absolute', left: '8px', display: 'inline-flex', color: 'var(--d2d-text-lo)', pointerEvents: 'none' } }, h(IconSearch, { size: 13 })),
              h('input', { ...panel.input({ flex: 1 }), style: { ...panel.input({ flex: 1 }).style, paddingLeft: '28px' },
                placeholder: '搜索 Tool / Worker / Reason', value: q, onChange: (ev) => setQ(ev.target.value) })),
            h('span', { ...panel.muted(0.5), style: { marginLeft: 'auto', flex: '0 0 auto' } }, '行数'),
            TOOLS_LIMITS.map((n) => h('button', {
              key: n, ...panel.btn(limit === n ? { borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' } : {}),
              onClick: () => setLimit(n),
            }, String(n)))),
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
            h('button', { ...panel.btn(!kind ? { borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' } : {}), onClick: () => setKind('') }, '全部'),
            (tc?.kinds ?? []).slice(0, 12).map((k) => h('button', {
              key: k, ...panel.btn(kind === k ? { borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' } : {}),
              onClick: () => setKind(kind === k ? '' : k),
            }, k))),
          (tc?.degraded ?? []).map((d, i) => h('div', { key: i, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d)),
          h('div', { style: { display: 'grid', gridTemplateColumns: '100px 190px 140px minmax(0,1fr)', gap: '8px', padding: '6px 8px', borderBottom: '1px solid var(--d2d-line)', color: 'var(--d2d-text-lo)', fontSize: '10px' } },
            h('span', null, 'Time'), h('span', null, 'Action'), h('span', null, 'Worker'), h('span', null, 'Data')),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '1px', maxHeight: '360px', overflowY: 'auto', paddingRight: '2px' } },
            events.length
              ? events.map((e, i) => h(ToolEventRow, { key: `${e.ts}:${i}`, e, onOpen: setSheet }))
              : h('div', panel.muted(0.45), err ? '拉取失败' : '无事件')),
          h(DetailSheet, { item: sheet, onClose: () => setSheet(null), title: 'Tool Execution Detail' })),
        h(Card, { title: '工具量榜', icon: 'chart' },
          (tc?.toolTotals ?? []).length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
              tc.toolTotals.map((t) => h('div', { key: t.worker, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
                h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, t.worker),
                h('span', panel.muted(0.55), `${t.terminals} 终态`),
                h('span', { ...panel.mono, style: { ...panel.mono.style, fontWeight: 600 } }, `${t.tools} 次工具`))))
            : h('div', panel.muted(0.45), '暂无数据')))
    }

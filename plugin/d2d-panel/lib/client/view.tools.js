    // ══════════ view.tools.js — T3-3-2 工具调用明细 tab: run-log 全事件投影 + per-worker 工具量 ══════════
    // 数据面: GET /d2d/api/toolcalls(fail-soft 文件面; eng 缺省=selected)。kind 过滤/limit 走服务端
    // 钳位(1..600); 坏行 host 侧跳过。轮询 3s(调度事件是活跃面)。
    const TOOLS_POLL_MS = 3000
    const TOOLS_LIMITS = [100, 200, 400]
    const TOOLS_KIND_WARN = ['tool-gate-deny', 'scope-denied-terminal', 'quota-fail-stop', 'crash', 'tool-output-truncated']

    function useToolCalls(visible, kind, limit) {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      useEffect(() => {
        if (!visible) return
        let stop = false
        const tick = async () => {
          try {
            const j = await fetchApi(`toolcalls?limit=${encodeURIComponent(limit)}${kind ? `&kind=${encodeURIComponent(kind)}` : ''}`)
            if (!stop) { setData(j); setErr(null) }
          } catch (e) { if (!stop) setErr(e) }
        }
        void tick()
        const poll = setInterval(tick, TOOLS_POLL_MS)
        return () => { stop = true; clearInterval(poll) }
      }, [visible, kind, limit])
      return { tc: data?.toolcalls ?? null, err }
    }

    /** 事件行: 时间|级别着色 kind|worker|ring|model|code/quota|reason/tool/command/extra(截尾兜底)。 */
    function ToolEventRow({ e }) {
      const warn = TOOLS_KIND_WARN.some((k) => String(e.kind).includes(k))
      const detail = [e.reason, e.tool, e.command, e.extra].filter(Boolean).join(' · ')
      return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
        h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.55, flex: '0 0 auto' } }, fmtClock(e.ts)),
        h('span', panel.chip({ ...(warn ? { borderColor: 'var(--d2d-warn)', color: 'var(--d2d-warn)' } : {}) }), e.kind),
        h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: '0 0 auto', maxWidth: '110px' }, title: `${e.worker} · ring ${e.ring} · ${e.model}` }, e.worker || '—'),
        e.code !== null && e.code !== undefined ? h('span', { ...panel.mono, style: { ...panel.mono.style, color: warn ? 'var(--d2d-sev-high)' : 'inherit', flex: '0 0 auto' } }, String(e.code)) : null,
        e.quota ? h('span', panel.chip({ borderColor: 'var(--d2d-warn)' }), `quota ${e.quota}`) : null,
        h('span', { ...panel.muted(0.6), style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }, title: detail }, detail || '—'))
    }

    /** 工具调用明细 tab 容器: kind chips(服务端词表)+limit 选择+事件流+工具量榜。 */
    function ToolsView({ visible }) {
      const [kind, setKind] = useState('')
      const [limit, setLimit] = useState(200)
      const { tc, err } = useToolCalls(visible, kind, limit)
      return h('div', panel.root, Style(),
        h(Card, {
          title: '工具调用',
          extra: err
            ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, '不可用')
            : h('span', panel.muted(0.45), `${tc?.events?.length ?? 0}`),
        },
          h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
            h('button', { ...panel.btn(!kind ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}), onClick: () => setKind('') }, '全部'),
            (tc?.kinds ?? []).slice(0, 12).map((k) => h('button', {
              key: k, ...panel.btn(kind === k ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}),
              onClick: () => setKind(kind === k ? '' : k),
            }, k)),
            h('span', { ...panel.muted(0.5), style: { marginLeft: 'auto' } }, '行数'),
            TOOLS_LIMITS.map((n) => h('button', {
              key: n, ...panel.btn(limit === n ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}),
              onClick: () => setLimit(n),
            }, String(n)))),
          (tc?.degraded ?? []).map((d, i) => h('div', { key: i, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d)),
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '360px', overflowY: 'auto', paddingRight: '2px' } },
            (tc?.events ?? []).length
              ? tc.events.map((e, i) => h(ToolEventRow, { key: `${e.ts}:${i}`, e }))
              : h('div', panel.muted(0.45), err ? '拉取失败' : '无事件'))),
        h(Card, { title: '工具量榜' },
          (tc?.toolTotals ?? []).length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
              tc.toolTotals.map((t) => h('div', { key: t.worker, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
                h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, t.worker),
                h('span', panel.muted(0.55), `${t.terminals} 终态`),
                h('span', { ...panel.mono, style: { ...panel.mono.style, fontWeight: 600 } }, `${t.tools} 次工具`))))
            : h('div', panel.muted(0.45), '暂无数据')))
    }

    // ══════════ view.chain.js — T3-3-2 探索链路 tab: 三列链路图 + Task 看板(/pentest-tasks 对等) ══════════
    // 数据面: GET /d2d/api/chain(vizRoute 家族, graphd 不可达 503 fail-closed)。
    // CONFIRMS 稀疏注记(拍板 3): 边仅 W3 修复后 verified 闭环逐条补建(scheduler/gates.mjs 唯一写点),
    // 历史存量恒 0 — 视觉稀疏是历史真相不是缺陷, 不造数据不硬凑视觉。
    const CHAIN_POLL_MS = 5000
    const CHAIN_TASK_STATE = { pending: '待认领', claimed: '进行中', done: '完成', failed: '失败', cancelled: '取消' }
    const CHAIN_RENDER = { workers: 30, signals: 60, endpoints: 40, findings: 30, edges: 300 }

    function useChain(visible) {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      useEffect(() => {
        if (!visible) return
        let stop = false
        const tick = async () => {
          try {
            const j = await fetchApi('chain')
            if (!stop) { setData(j); setErr(null) }
          } catch (e) { if (!stop) setErr(e) }
        }
        void tick()
        const poll = setInterval(tick, CHAIN_POLL_MS)
        return () => { stop = true; clearInterval(poll) }
      }, [visible])
      return { chain: data?.chain ?? null, eng: data?.eng ?? '', err }
    }

    /** 链路图(自绘 SVG 纯函数): 三列 工作环→信号→产出(端点+漏洞), 边=三次贝塞尔。
     *  布局确定性: 列 x 固定, 行序=输入序(host 侧已按 ts 降序), y 等距 — 无随机无 useRef。 */
    function ChainChart({ chain }) {
      if (!chain) return h('div', panel.muted(0.45), 'chain 数据不可用')
      const col = {
        w: chain.workers.slice(0, CHAIN_RENDER.workers),
        s: chain.signals.slice(0, CHAIN_RENDER.signals),
        e: chain.endpoints.slice(0, CHAIN_RENDER.endpoints),
        f: chain.findings.slice(0, CHAIN_RENDER.findings),
      }
      const rows = Math.max(col.w.length, col.s.length, col.e.length + col.f.length, 1)
      const height = rows * 24 + 30
      const ROW = 24
      const posOf = (kind, id) => {
        if (kind === 'w') { const i = col.w.findIndex((x) => x.worker_id === id); return i < 0 ? null : { x: 8, y: 18 + i * ROW } }
        if (kind === 's') { const i = col.s.findIndex((x) => x.id === id); return i < 0 ? null : { x: 230, y: 18 + i * ROW } }
        if (kind === 'e') { const i = col.e.findIndex((x) => x.id === id); return i < 0 ? null : { x: 462, y: 18 + i * ROW } }
        const i = col.f.findIndex((x) => x.id === id)
        return i < 0 ? null : { x: 462, y: 18 + (col.e.length + i) * ROW }
      }
      const edge = (a, b, color, key) => {
        const p = posOf(a[0], a[1])
        const q = posOf(b[0], b[1])
        if (!p || !q) return null
        const y1 = p.y + 9
        const y2 = q.y + 9
        const x1 = p.x === 8 ? 142 : p.x === 230 ? 364 : 594
        const x2 = q.x === 230 ? 230 : q.x === 462 ? 462 : 594
        return h('path', { key, d: `M ${x1} ${y1} C ${(x1 + x2) / 2} ${y1}, ${(x1 + x2) / 2} ${y2}, ${x2} ${y2}`, stroke: color, strokeWidth: '1.4', fill: 'none', opacity: '0.55' })
      }
      const nodeBox = (label, p, color, title) => h('g', { key: `${p.x}:${p.y}` },
        h('rect', { x: p.x, y: p.y, width: '134', height: '18', rx: '4', fill: color, opacity: '0.14', stroke: color, strokeWidth: '1' }),
        h('text', { x: p.x + 6, y: p.y + 13, fontSize: '9px', fill: 'inherit', style: { fontFamily: 'var(--dsw-font-mono, monospace)' } }, label),
        h('title', null, title))
      const edges = [
        ...chain.edges.derived.slice(0, CHAIN_RENDER.edges).map((e, i) => edge(['s', e.a], ['s', e.b], 'var(--d2d-ring-discovery)', `d${i}`)),
        ...chain.edges.at.slice(0, CHAIN_RENDER.edges).map((e, i) => edge(['s', e.a], ['e', e.b], 'var(--d2d-line-strong)', `a${i}`)),
        ...chain.edges.confirms.slice(0, CHAIN_RENDER.edges).map((e, i) => edge(['s', e.b], ['f', e.a], 'var(--d2d-ok)', `c${i}`)),
        // SUGGESTS(假设→端点)不画: 图内无假设列, 计数在脚注(不硬凑不造节点)
      ].filter(Boolean)
      const sevDot = (s) => sevColor(s)
      return h('div', null,
        h('svg', { viewBox: `0 0 606 ${height}`, width: '100%', style: { maxHeight: '440px', border: '1px solid var(--d2d-line)', borderRadius: '6px', background: 'rgba(128,140,165,.06)' } },
          edges,
          col.w.map((w, i) => nodeBox(String(w.worker_id ?? '').slice(0, 20), { x: 8, y: 18 + i * ROW }, 'var(--d2d-ring-verify)', `worker ${w.worker_id} · ring ${w.ring} · ${w.status}`)),
          col.s.map((s, i) => nodeBox(`${s.type || '?'}·${String(s.id).slice(0, 14)}`, { x: 230, y: 18 + i * ROW }, 'var(--d2d-ring-discovery)', `信号 ${s.id} · ${s.host || '(无 host)'} · w=${s.weight}`)),
          col.e.map((e, i) => nodeBox(`${(e.method || '?').toUpperCase()} ${String(e.url || '').replace(/^https?:\/\//, '').slice(0, 18)}`, { x: 462, y: 18 + i * ROW }, 'var(--d2d-line-strong)', `端点 ${e.url || e.id}`)),
          col.f.map((f, i) => nodeBox(`⚠ ${String(f.title || f.id).slice(0, 20)}`, { x: 462, y: 18 + (col.e.length + i) * ROW }, sevDot(f.severity), `${f.severity} · ${f.state} · ${f.title || f.id}`))),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' } },
          h('span', { ...panel.muted(0.45) }, `worker ${col.w.length} · 信号 ${col.s.length} · 端点 ${col.e.length} · 漏洞 ${col.f.length} · 边 ${edges.length}`),
          h('span', { ...panel.muted(0.45) }, `SUGGESTS ${chain.edges.suggests.length}(假设→端点, 图内无假设列不画)`)),
        h('div', { ...panel.muted(0.5), style: { marginTop: '3px', fontSize: '10px' } },
          'CONFIRMS 边仅 W3 修复后 verified 闭环逐条补建, 历史存量恒 0 — 视觉稀疏是历史真相不是缺陷(不造数据)。'))
    }

    /** Task 看板(对等 /pentest-tasks): 状态/kind/认领人/链路锚点(link_id)。 */
    function ChainTaskBoard({ chain }) {
      const tasks = chain?.tasks ?? []
      return h(Card, { title: `任务看板 · ${tasks.length}`, extra: h('span', panel.muted(0.45), 'Task 表 · 认领环按 link_id 关联产物') },
        tasks.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto', paddingRight: '2px' } },
            tasks.map((t) => h('div', { key: t.id, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
              h('span', panel.chip({ ...(t.status === 'claimed' ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}) }) , CHAIN_TASK_STATE[t.status] ?? t.status),
              h('span', panel.chip(), t.kind || '?'),
              h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: `${t.id} · link ${t.link_id || '—'}` }, `${t.id} → ${t.link_id || '—'}`),
              h('span', panel.muted(0.5), t.claimed_by || '未认领'))))
          : h('div', panel.muted(0.45), '当前 engagement 无任务记录'))
    }

    /** 探索链路 tab 容器。 */
    function ChainView({ visible }) {
      const { chain, eng, err } = useChain(visible)
      return h('div', panel.root, Style(),
        h(Card, {
          title: '探索链路',
          extra: err
            ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, `不可用: ${String(err?.message ?? err).slice(0, 60)}`)
            : h('span', panel.muted(0.45), `eng ${eng || '—'} · worker→信号→产出 三列, 边=DERIVED_FROM/AT/CONFIRMS`),
        },
          err && !chain ? h('div', panel.muted(0.45), '图服务不可达 — fail-closed 不显示过期链路(重试随轮询自动进行)') : h(ChainChart, { chain })),
        h(ChainTaskBoard, { chain }))
    }

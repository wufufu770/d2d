    // ══════════ view.viz.js — T3-3-1 可视化: 星图+覆盖热力+假设泳道+能力看板 ══════════
    // 图形纪律(拍板 2): 自绘 SVG/CSS grid 零图表库; 图表组件纯函数化(数据进→vnode 出,
    // 零请求副作用 — 取数归 VizView 容器层 useViz)。护栏(拍板 3): 星图渲染 200 节点/300 边
    // (超限截断+计数提示)/热力 21 格天然封顶/泳道时间窗 chips+localStorage 记忆+服务端钳位。
    const VIZ_RENDER_NODES = 200
    const VIZ_RENDER_EDGES = 300
    const VIZ_POLL_MS = 5000 // viz 低频变化, 独立轮询(与主快照 2s 互不牵动; visible 门控同款)
    const VIZ_LANES = ['open', 'claimed', 'confirmed', 'refuted', 'suspected']
    const VIZ_LANE_LABEL = { open: 'Open', claimed: 'Claimed', confirmed: 'Confirmed', refuted: 'Refuted', suspected: 'Suspected' }
    const VIZ_WINDOWS = [3, 7, 14, 30]
    const VIZ_WINDOW_KEY = 'd2d-viz-window-days'

    async function fetchVizMethod(method, { signal } = {}) {
      const r = await fetch(`/d2d/api/${method}`, { signal, headers: { accept: 'application/json' } })
      const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }))
      if (!r.ok || !j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? `HTTP ${r.status}`))
      return j
    }

    /** viz 容器层取数: 五路由 Promise.allSettled — 单路由 503 只降级该卡, 不炸整个 tab。
     *  B11: AbortSignal 五路全接(abort 真正生效) + setTimeout 链式(不堆积)。 */
    function useViz(visible) {
      const [data, setData] = useState(null)
      const [errs, setErrs] = useState({})
      useEffect(() => {
        if (!visible) return
        const ac = new AbortController()
        let stop = false
        let poll = null
        const tick = async () => {
          const days = localStorage.getItem(VIZ_WINDOW_KEY) ?? '14'
          const names = [`starmap`, `coverage`, `hypotheses?days=${encodeURIComponent(days)}`, `capability`, `transition-flows?days=${encodeURIComponent(days)}`]
          const rs = await Promise.allSettled(names.map((n) => fetchVizMethod(n, { signal: ac.signal })))
          if (stop) return
          const next = {}
          const nextErrs = {}
          names.forEach((n, i) => {
            const key = n.split('?')[0]
            if (rs[i].status === 'fulfilled') next[key] = rs[i].value
            else if (rs[i].reason?.name !== 'AbortError') nextErrs[key] = rs[i].reason
          })
          setData(next)
          setErrs(nextErrs)
          if (!stop && !ac.signal.aborted) poll = setTimeout(tick, VIZ_POLL_MS)
        }
        void tick()
        return () => { stop = true; ac.abort(); if (poll) clearTimeout(poll) }
      }, [visible])
      return { data, errs }
    }

    /** 确定性极角布局(E44 已退役: echarts force 布局接管, 保留注释作迁移记忆)。 */

    /** 星图(E44-V 重构: reArtex exploration-graph 模式移植——节点即信息载体):
     *  双层图 = Endpoint 资产节点(蓝, exhausted 暗灰) + open 信号节点(按 type 着色,
     *  weight<2 折叠为类型聚合点) + AT 关联边(灰) + DERIVED_FROM 意图链边(indigo)。
     *  节点带短标签(labelLayout hideOverlap 防重叠)+富 tooltip+点击 → DetailSheet 抽屉
     *  (evidence 头/weight/tries/tech/chain 全量)。护栏: ≤200 节点/≤300 边; roam 缩放。 */
    const STARMAP_LEGEND = [
      { hex: '#4d6bfe', label: '端点' },
      { hex: '#9b7bff', label: '高权重信号' },
      { hex: '#71717a', label: '低权重聚合' },
      { hex: '#6366f1', label: '意图链边' },
    ]
    function StarMapChart({ starmap, onPick }) {
      if (!starmap) return h('div', panel.muted(0.45), '星图数据不可用')
      if (!starmap.nodes?.length) return h('div', panel.muted(0.45), '星图空')
      const nodes = starmap.nodes.slice(0, VIZ_RENDER_NODES)
      const ids = new Set(nodes.map((n) => n.id))
      const edges = (starmap.edges ?? []).filter((e) => ids.has(e.a) && ids.has(e.b)).slice(0, VIZ_RENDER_EDGES)
      const typeHex = (t) => (String(t ?? '').includes('asset') ? '#4d6bfe' : String(t ?? '').includes('js') || String(t ?? '').includes('api') ? '#f5a623' : '#9b7bff')
      const nodeColor = (n) => (n.kind === 'endpoint' ? (n.exhausted ? '#3f3f46' : '#4d6bfe')
        : n.kind === 'group' ? '#71717a' : typeHex(n.type))
      const nodeLabel = (n) => (n.kind === 'endpoint' ? String(n.label || n.host || '端点').slice(0, 26)
        : n.kind === 'group' ? `${n.type} ×${n.count}` : `${n.type}·${String(n.id).slice(-4)}`)
      const nodeTip = (n) => (n.kind === 'endpoint'
        ? `<b>端点</b>${n.firstSeenElsewhere ? ' <span style="color:#f5a623">(首见于其他项目·共享资产)</span>' : ''}<br/>${n.url || n.id}<br/>tech: ${n.tech || '—'} · 链: ${n.chain || '—'}<br/>覆盖票 ${n.votes ?? 0} · ${n.exhausted ? '已穷尽' : '在测'}`
        : n.kind === 'group'
          ? `<b>${n.type} · 低权重聚合</b><br/>${n.count} 条 weight&lt;2 open 信号<br/>(点开看成员请提高信号权重或查信号表)`
          : `<b>${n.type}</b> · w${n.weight ?? 1} · 重验 ${n.tries ?? 0} 次<br/>${n.host || '(无 host)'} · ${n.ts}<br/>${n.evHead || ''}`)
      const nodeSize = (n) => (n.kind === 'endpoint' ? Math.min(18, 8 + (n.votes ?? 0) * 1.5)
        : n.kind === 'group' ? Math.min(20, 12 + (n.count ?? 1)) : (n.weight >= 2 ? 11 : 7))
      const option = {
        backgroundColor: 'transparent',
        tooltip: { backgroundColor: 'rgba(9,9,11,.92)', borderColor: 'rgba(63,63,70,.6)', textStyle: { color: '#e4e4e7', fontSize: 11, width: 340, overflow: 'break' } },
        series: [{
          type: 'graph', layout: 'force', roam: true,
          force: { repulsion: 260, edgeLength: [50, 130], gravity: 0.14 },
          data: nodes.map((n) => ({ id: n.id, name: n.id, value: n.weight ?? n.count ?? 0,
            symbolSize: nodeSize(n), itemStyle: { color: nodeColor(n), opacity: 0.92 },
            label: { show: true, formatter: nodeLabel(n), fontSize: 10, color: '#a1a1aa' },
            tooltip: { formatter: nodeTip(n) },
            __pick: n })),
          links: edges.map((e) => ({ source: e.a, target: e.b,
            lineStyle: e.kind === 'derived' ? { color: '#6366f1', width: 1.2 } : { color: 'rgba(63,63,70,.4)', width: 0.8 } })),
          lineStyle: { color: 'rgba(63,63,70,.4)', width: 0.8 },
          emphasis: { focus: 'adjacency', label: { show: true, fontSize: 11, color: '#f4f4f5' } },
          labelLayout: { hideOverlap: true },
          draggable: true,
        }],
      }
      const onEvents = { click: (p) => { if (p.dataType === 'node' && onPick && p.data?.__pick) onPick(p.data.__pick) } }
      return h('div', null,
        h(EChart, { option, height: '380px', onEvents }),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px', alignItems: 'center' } },
          STARMAP_LEGEND.map((l) => h('span', { key: l.label, style: { display: 'inline-flex', alignItems: 'center', gap: '4px', ...panel.muted(0.55), fontSize: '10px' } },
            h('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: l.hex, display: 'inline-block' } }), l.label)),
          h('span', { ...panel.muted(0.45) }, `节点 ${nodes.length}/${(starmap.total ?? 0) + (starmap.epTotal ?? 0)} · 边 ${edges.length}${starmap.folded ? ` · 折叠 ${starmap.folded}` : ''}`),
          nodes.length >= VIZ_RENDER_NODES || edges.length >= VIZ_RENDER_EDGES ? h('span', { ...panel.chip({ borderColor: 'var(--d2d-warn)' }), title: '超渲染上限' }, '已截断') : null,
          (starmap.candidates ?? []).slice(0, 4).map((c, i) => h('span', { key: i, ...panel.chip({ borderColor: 'var(--d2d-brand)' }), title: `${c.a} ~ ${c.b}` }, `${c.aType}~${c.bType}@${c.host}`))))
    }

    /** 覆盖热力(B13 echarts heatmap 重绘): 7 面 × 3 周界, 色阶=翡翠梯度(零值暗格)。 */
    function CoverageHeat({ coverage }) {
      if (!coverage) return h('div', panel.muted(0.45), 'coverage 数据不可用')
      const max = Math.max(...coverage.cells.map((c) => c.n), 1)
      const data = coverage.cells.map((c) => [c.bo, c.su, c.n])
      const option = {
        backgroundColor: 'transparent',
        tooltip: { position: 'top' },
        grid: { left: 8, right: 8, top: 4, bottom: 4, containLabel: true },
        xAxis: { type: 'category', data: coverage.boundaries, axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' } },
        yAxis: { type: 'category', data: coverage.surfaces, axisLine: { show: false }, axisTick: { show: false },
          axisLabel: { color: '#a1a1aa', fontSize: 10, fontFamily: 'monospace' } },
        visualMap: { min: 0, max, show: false, inRange: { color: ['#1b1b20', '#14532d', '#16a34a', '#4ade80'] } },
        series: [{
          type: 'heatmap',
          data,
          itemStyle: { borderColor: '#09090b', borderWidth: 2, borderRadius: 5 },
          label: { show: true, formatter: (p) => (p.value[2] > 0 ? String(p.value[2]) : ''), color: '#f4f4f5', fontSize: 10, fontFamily: 'monospace' },
        }],
      }
      return h('div', null,
        h(EChart, { option, height: `${Math.max(coverage.surfaces.length * 74 + 30, 220)}px` }),
        // E40-C1: 解释性注记收敛进 title(降噪 — 悬停可见, 不占版面)
        h('div', { ...panel.muted(0.45), style: { marginTop: '4px' }, title: '坐标空串的存量旧信号不计入 — 非真空白象限' }, `带坐标信号共 ${coverage.total}`))
    }

    /** 假设泳道: 生命周期五列(open→claimed→confirmed|refuted|suspected, app.py:849 口径)
     *  + 时间窗 chips(localStorage 记忆; 服务端钳位 1..90 天)。 */
    function HypLaneSwim({ hypotheses, onWindow }) {
      if (!hypotheses) return h('div', panel.muted(0.45), 'hypotheses 数据不可用')
      const byLane = new Map(VIZ_LANES.map((l) => [l, (hypotheses.items ?? []).filter((it) => it.status === l)]))
      return h('div', null,
        h('div', { style: { display: 'flex', gap: '5px', marginBottom: '6px', alignItems: 'center' } },
          h('span', { ...panel.muted(0.55), style: { fontSize: '10px' } }, '时间窗'),
          VIZ_WINDOWS.map((d) => h('button', {
            key: d, ...panel.btn(Number(localStorage.getItem(VIZ_WINDOW_KEY) ?? '14') === d ? { borderColor: 'var(--d2d-brand)' } : {}),
            onClick: () => { localStorage.setItem(VIZ_WINDOW_KEY, String(d)); onWindow?.() },
          }, `${d}d`))),
        h('div', { style: { display: 'grid', gridTemplateColumns: `repeat(${VIZ_LANES.length}, 1fr)`, gap: '5px' } },
          VIZ_LANES.map((lane) => h('div', { key: lane, style: { border: '1px solid var(--d2d-line)', borderRadius: '6px', padding: '5px', minHeight: '60px' } },
            h('div', { ...panel.muted(0.6), style: { fontSize: '10px', marginBottom: '4px' } }, `${VIZ_LANE_LABEL[lane]} · ${hypotheses.byStatus?.[lane] ?? 0}`),
            (byLane.get(lane) ?? []).slice(0, 6).map((it) => h('div', {
              key: it.id, ...panel.muted(0.8), title: `${it.id} · ${it.ts}`,
              style: { fontSize: '10px', marginBottom: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
            }, it.text || '(无文本)')))),
        ),
        // E40-C1: 注记收敛进 title(claimed 租约 15min 回流的解释悬停可见)
        h('div', { ...panel.muted(0.45), style: { marginTop: '4px' }, title: 'claimed 租约 15min 回流为已知视觉抖动' }, `窗口 ${hypotheses.windowDays} 天 · 明细上限 200`))
    }

    /** 能力看板卡(manifest 消费, 静态读零查询): 6 形态导出清单+基线键数+注册工具清单。 */
    function CapabilityCard({ capability }) {
      if (!capability) return h('div', panel.muted(0.45), 'capability 数据不可用')
      const byStatus = (s) => (capability.manifest?.exports ?? []).filter((e) => e.status === s)
      return h('div', null,
        h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '5px' } },
          ['live', 'declared', 'skeleton'].map((s) => h('span', { key: s, ...panel.chip({ ...(s === 'live' ? { borderColor: 'var(--d2d-ok)' } : {}) }) }, `${s} ${byStatus(s).length}`)),
          h('span', { ...panel.chip() }, `基线 ${capability.baselines?.keys ?? '?'} 键 / ${capability.baselines?.tools?.length ?? '?'} 工具`)),
        (capability.manifest?.exports ?? []).map((e) => h('div', { key: e.id, style: { display: 'flex', gap: '6px', alignItems: 'baseline', marginBottom: '2px' } },
          h('span', { ...panel.dot(e.status === 'live' ? 'var(--d2d-ok)' : 'var(--d2d-line-strong)') }),
          h('span', { ...panel.mono, style: { fontSize: '10px', minWidth: '150px' } }, e.id),
          h('span', { ...panel.muted(0.5), style: { fontSize: '10px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `${e.form} · ${e.note}`))),
        (capability.degraded ?? []).length ? h('div', { ...panel.muted(0.5), style: { fontSize: '10px', marginTop: '3px' } }, `降级: ${capability.degraded.join('; ')}`) : null)
    }

    // ---- T3-3-2 状态迁移桑基: transition-flows(fail-soft 文件面; 家族过滤 client 侧零重取) ----
    // 数据 = transition-log.jsonl 合法迁移事件聚合(host 半 readTransitionFlows; 非法迁移在审计 tab)。
    // 拍板 3 预期管理: 流量按历史事件聚合, 稀疏即真相 — 空态/注记直说, 不造数据不硬凑视觉。
    const FLOW_FAMILIES = ['all', 'finding', 'experience', 'frontier']
    const FLOW_FAMILY_LABEL = { all: '全部', finding: '漏洞', experience: '经验', frontier: '前沿', other: '其他' }
    // E44 清理: FLOW_FAMILY_COLOR/FLOW_RENDER_NODES 已随 B13 echarts sankey 重绘退役(渐变缎带自着色)

    /** 桑基(B13 echarts sankey 重绘): 渐变缎带(源→汇家族色)+邻接 hover 高亮+节点点击跨页。
     *  canvas 面 — CSS 变量不可用, 全部具体色值(家族色 HEX 映射)。 */
    const FLOW_FAMILY_HEX = { finding: '#4d6bfe', experience: '#9b7bff', frontier: '#f5a623', other: '#8e97a8' }
    function SankeyChart({ flows, family, onNodeClick }) {
      const links = (flows?.links ?? []).filter((l) => family === 'all' || l.family === family)
      if (!flows) return h('div', panel.muted(0.45), 'transition-flows 数据不可用')
      if (!links.length) return h('div', panel.muted(0.45), `${flows?.windowDays ?? '?'} 天窗口内无迁移事件`)
      const names = []
      const seen = new Set()
      const famOf = new Map()
      for (const l of links) {
        if (!seen.has(l.from)) { seen.add(l.from); names.push(l.from) }
        if (!seen.has(l.to)) { seen.add(l.to); names.push(l.to) }
        famOf.set(l.from, l.family); famOf.set(l.to, l.family)
      }
      const hex = (f) => FLOW_FAMILY_HEX[f] ?? '#60a5fa'
      const option = {
        backgroundColor: 'transparent',
        series: [{
          type: 'sankey',
          left: 8, right: 140, top: 8, bottom: 8,
          nodeWidth: 14, nodeGap: 12, nodeAlign: 'justify',
          emphasis: { focus: 'adjacency', lineStyle: { opacity: 0.85 } },
          data: names.map((s) => ({ name: s,
            itemStyle: { color: 'rgba(9,9,11,.4)', borderColor: hex(famOf.get(s)), borderWidth: 1.5, borderRadius: 4 } })),
          links: links.slice(0, 120).map((l) => ({ source: l.from, target: l.to, value: l.count })),
          lineStyle: { color: 'gradient', opacity: 0.45, curveness: 0.5, width: 2 },
          // E40-C1: 标签中段截断(14 字符, canvas 面不支持 DOM ellipsis)+全名进 title 提示
          label: { color: '#f4f4f5', fontSize: 11, fontFamily: 'monospace',
            formatter: (p) => (String(p.name).length > 16 ? `${String(p.name).slice(0, 7)}…${String(p.name).slice(-7)}` : String(p.name)) },
          labelLayout: { hideOverlap: true },
        }],
        tooltip: { trigger: 'item', formatter: (p) => (p.dataType === 'edge' ? `${p.data.source} → ${p.data.target}: ${p.data.value}` : `${p.name}<br/>迁移 ${p.value ?? '—'}`) },
      }
      const onEvents = {}
      if (onNodeClick) onEvents.click = (p) => { if (p.dataType === 'node') onNodeClick(p.name) }
      return h('div', null,
        h(EChart, { option, height: `${Math.max(names.length * 30 + 40, 220)}px`, onEvents }),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' } },
          h('span', { ...panel.muted(0.45) }, `${flows.windowDays} 天 · 边 ${Math.min(links.length, 120)}/${links.length}`),
          (flows.degraded ?? []).map((d, i) => h('span', { key: i, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d))))
    }

    /** 桑基卡(容器): 家族 chips(client 侧过滤, 不重取)+纯函数图+侧标注(布局即图例)。
     *  B12: onNodeClick 透传(节点点击 → 跨页过滤 findings state)。 */
    function SankeyCard({ flows, errs, onNodeClick }) {
      const [family, setFamily] = useState('all')
      return h(Card, {
        title: '状态迁移',
        icon: 'merge',
        extra: errs['transition-flows']
          ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, '不可用')
          : null,
      },
        h('div', { style: { display: 'flex', gap: '5px', marginBottom: '6px', flexWrap: 'wrap' } },
          FLOW_FAMILIES.map((f) => h('button', {
            key: f, ...panel.btn(family === f ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}),
            onClick: () => setFamily(f),
          }, FLOW_FAMILY_LABEL[f]))),
        h(SankeyChart, { flows, family, onNodeClick }))
    }

    /** viz tab 容器: useViz 五路取数(allSettled 单卡降级) + 四图 + 桑基 + 看板卡装配。
     *  E44-V: 星图节点点击 → DetailSheet 抽屉(evidence 头/weight/tries/tech/chain)。 */
    function VizView({ visible, navigate, routeParams }) {
      const { data, errs } = useViz(visible)
      const [detail, setDetail] = useState(null)
      // B12 跨页过滤: 桑基节点点击 → findings 页 state 筛选(hash 路由携带)
      const onNodeClick = navigate ? (state) => navigate('findings', { state }) : null
      const card = (title, key, extra, body, icon) => h(Card, { title, icon, extra: extra ?? (errs[key] ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, '不可用') : null) }, body)
      return h('div', panel.root, Style(),
        card(`覆盖热力`, 'coverage', null, h(CoverageHeat, { coverage: data?.coverage?.coverage }), 'dashboard'),
        card(`假设泳道`, 'hypotheses', null, h(HypLaneSwim, { hypotheses: data?.hypotheses?.hypotheses }), 'filter'),
        card(`资产信号星图`, 'starmap', null, h(StarMapChart, { starmap: data?.starmap?.starmap, onPick: setDetail }), 'activity'),
        h(SankeyCard, { flows: data?.['transition-flows']?.flows, errs, onNodeClick }),
        card(`能力看板`, 'capability', null, h(CapabilityCard, { capability: data?.capability?.capability }), 'box'),
        detail ? h(DetailSheet, { item: detail, title: detail?.kind === 'endpoint' ? '端点详情' : detail?.kind === 'group' ? '信号聚合' : '信号详情', onClose: () => setDetail(null) }) : null)
    }

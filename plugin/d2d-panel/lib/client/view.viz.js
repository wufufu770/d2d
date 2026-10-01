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

    async function fetchVizMethod(method) {
      const r = await fetch(`/d2d/api/${method}`, { headers: { accept: 'application/json' } })
      const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }))
      if (!r.ok || !j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? `HTTP ${r.status}`))
      return j
    }

    /** viz 容器层取数: 四路由 Promise.allSettled — 单路由 503 只降级该卡, 不炸整个 tab。 */
    function useViz(visible) {
      const [data, setData] = useState(null)
      const [errs, setErrs] = useState({})
      useEffect(() => {
        if (!visible) return
        const ac = new AbortController()
        let stop = false
        const tick = async () => {
          const days = localStorage.getItem(VIZ_WINDOW_KEY) ?? '14'
          const names = [`starmap`, `coverage`, `hypotheses?days=${encodeURIComponent(days)}`, `capability`]
          const rs = await Promise.allSettled(names.map((n) => fetchVizMethod(n)))
          if (stop) return
          const next = {}
          const nextErrs = {}
          names.forEach((n, i) => {
            const key = n.split('?')[0]
            if (rs[i].status === 'fulfilled') next[key] = rs[i].value
            else nextErrs[key] = rs[i].reason
          })
          setData(next)
          setErrs(nextErrs)
        }
        void tick()
        const poll = setInterval(tick, VIZ_POLL_MS)
        return () => { stop = true; ac.abort(); clearInterval(poll) }
      }, [visible])
      return { data, errs }
    }

    /** 确定性极角布局: id 哈希 → 角度(无 useRef, 纯计算天然稳定 — 同 id 每轮同位置)。 */
    function vizNodePos(id, i, total) {
      let hsh = 0
      for (let k = 0; k < String(id).length; k++) hsh = (hsh * 31 + String(id).charCodeAt(k)) >>> 0
      const angle = ((hsh % 3600) / 3600) * Math.PI * 2
      const ring = 70 + ((hsh >>> 8) % 3) * 45
      return { x: 300 + ring * Math.cos(angle), y: 200 + ring * 0.72 * Math.sin(angle) }
    }

    /** 星图(自绘 SVG): open 信号节点(按 type 着色)+DERIVED_FROM 边+候选连线虚线提示。
     *  护栏: 渲染 ≤200 节点/≤300 边, 超限 Card extra 计数提示(数据不丢——服务端 total)。 */
    function StarMapChart({ starmap }) {
      if (!starmap) return h('div', panel.muted(0.45), 'starmap 数据不可用')
      if (!starmap.nodes?.length) return h('div', panel.muted(0.45), '当前 engagement 无 open 信号 — 星图空')
      const nodes = starmap.nodes.slice(0, VIZ_RENDER_NODES)
      const ids = new Set(nodes.map((n) => n.id))
      const edges = (starmap.edges ?? []).filter((e) => ids.has(e.a) && ids.has(e.b)).slice(0, VIZ_RENDER_EDGES)
      const pos = new Map(nodes.map((n, i) => [n.id, vizNodePos(n.id, i, nodes.length)]))
      const typeColor = (t) => (String(t ?? '').includes('asset') ? 'var(--d2d-ring-discovery)' : String(t ?? '').includes('js') || String(t ?? '').includes('api') ? 'var(--d2d-ring-creative)' : 'var(--d2d-ring-deep)')
      const hidden = starmap.total - nodes.length
      return h('div', null,
        h('svg', { viewBox: '0 0 600 400', width: '100%', style: { maxHeight: '380px', border: '1px solid var(--d2d-line)', borderRadius: '6px', background: 'rgba(128,140,165,.06)' } },
          edges.map((e) => {
            const p = pos.get(e.a); const q = pos.get(e.b)
            return h('line', { key: `${e.a}->${e.b}`, x1: p.x, y1: p.y, x2: q.x, y2: q.y, stroke: 'var(--d2d-line-strong)', strokeWidth: '1', opacity: '0.55' })
          }),
          nodes.map((n) => {
            const p = pos.get(n.id)
            return h('circle', { key: n.id, cx: p.x, cy: p.y, r: n.weight >= 2 ? 5 : 3.5, fill: typeColor(n.type), opacity: '0.85', title: `${n.type} · ${n.host || '(无 host)'} · ${n.ts}` })
          })),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '4px' } },
          h('span', { ...panel.muted(0.45) }, `节点 ${nodes.length} / 共 ${starmap.total} · 边 ${edges.length}${starmap.candidates?.length ? ` · 候选连线 ${starmap.candidates.length} 对` : ''}`),
          hidden > 0 ? h('span', { ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, `+${hidden} 未显示(超渲染上限)`) : null,
          (starmap.candidates ?? []).slice(0, 4).map((c, i) => h('span', { key: i, ...panel.chip({ borderColor: 'var(--d2d-brand)' }), title: `${c.a} ~ ${c.b}` }, `${c.aType}~${c.bType}@${c.host}`))))
    }

    /** 覆盖热力(21 格 CSS grid): 7 面 × 3 周界, count→透明度爬坡(零=线色低透明)。
     *  21 格天然封顶(拍板 3), 无截断参数。 */
    function CoverageHeat({ coverage }) {
      if (!coverage) return h('div', panel.muted(0.45), 'coverage 数据不可用')
      const max = Math.max(...coverage.cells.map((c) => c.n), 1)
      const cell = (c) => h('div', {
        key: `${c.su}|${c.bo}`,
        title: `${c.su} × ${c.bo} = ${c.n}`,
        style: {
          aspectRatio: '1.6', borderRadius: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '10px', ...panel.mono.style,
          border: '1px solid var(--d2d-line)',
          background: c.n === 0 ? 'var(--d2d-line)' : 'var(--d2d-brand)',
          opacity: c.n === 0 ? '0.25' : String(0.3 + 0.7 * (c.n / max)),
          color: c.n === 0 ? 'inherit' : '#fff',
        },
      }, String(c.n))
      return h('div', null,
        h('div', { style: { display: 'grid', gridTemplateColumns: `56px repeat(${coverage.boundaries.length}, 1fr)`, gap: '3px' } },
          h('div', null),
          coverage.boundaries.map((b) => h('div', { key: b, ...panel.muted(0.55), style: { textAlign: 'center', fontSize: '10px' } }, b)),
          coverage.surfaces.flatMap((su) => [
            h('div', { key: su, ...panel.muted(0.55), style: { fontSize: '10px', alignSelf: 'center' } }, su),
            coverage.boundaries.map((bo) => cell(coverage.cells.find((c) => c.su === su && c.bo === bo) ?? { su, bo, n: 0 })),
          ])),
        h('div', { ...panel.muted(0.45), style: { marginTop: '4px' } }, `带坐标信号共 ${coverage.total}(坐标空串的存量旧信号不计入 — 非真空白象限)`))
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
        h('div', { ...panel.muted(0.45), style: { marginTop: '4px' } }, `窗口 ${hypotheses.windowDays} 天 · 明细上限 200(claimed 租约 15min 回流为已知视觉抖动)`))
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

    /** viz tab 容器: useViz 四路取数(allSettled 单卡降级) + 三图 + 看板卡装配。 */
    function VizView({ visible }) {
      const { data, errs } = useViz(visible)
      const card = (title, key, extra, body) => h(Card, { title, extra: extra ?? (errs[key] ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, `不可用: ${String(errs[key]?.message ?? '').slice(0, 60)}`) : null) }, body)
      return h('div', panel.root, Style(),
        card(`覆盖象限热力(21 格)`, 'coverage', null, h(CoverageHeat, { coverage: data?.coverage?.coverage })),
        card(`假设泳道`, 'hypotheses', null, h(HypLaneSwim, { hypotheses: data?.hypotheses?.hypotheses })),
        card(`信号星图`, 'starmap', null, h(StarMapChart, { starmap: data?.starmap?.starmap })),
        card(`能力看板(导出登记面)`, 'capability', null, h(CapabilityCard, { capability: data?.capability?.capability })))
    }

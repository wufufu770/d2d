    // ══════════ view.ops.js — d2d:ops tab(运营观测页 · 可交互): 漏斗/缺口/经验库卡 + 模块开关 + 页面装配 ══════════
    // ---- 漏斗卡: 七态条形, 点击聚焦该状态 findings 迷你列表 ----
    function FunnelCard({ snap }) {
      const [focus, setFocus] = useState(null)
      const byState = snap.findings.byState
      const states = Object.keys(byState).filter((s) => s !== 'rejected')
    const rows = [...states, 'rejected']
      const max = Math.max(...rows.map((s) => byState[s] ?? 0), 1)
      const focusList = focus ? snap.findings.list.filter((f) => f.state === focus).slice(0, 8) : []
      return h(Card, { title: '漏斗', icon: 'filter' },
        rows.map((s) => h('button', {
          key: s,
          onClick: () => setFocus(focus === s ? null : s),
          style: { display: 'grid', gridTemplateColumns: 'minmax(56px, 30%) 1fr auto', gap: '6px', alignItems: 'center', border: 'none', background: 'transparent', color: 'inherit', padding: '1px 0', textAlign: 'left', minWidth: 0 },
        },
          h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: focus && focus !== s ? '.4' : '.75', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s),
          h('div', { style: { height: '8px', borderRadius: '4px', background: 'var(--d2d-line)', overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.round(((byState[s] ?? 0) / max) * 100)}%`, borderRadius: '4px', background: s === 'rejected' ? 'var(--d2d-sev-info)' : focus === s ? 'var(--d2d-brand)' : 'var(--d2d-brand)', opacity: focus && focus !== s ? 0.35 : 0.8 } })),
          h('span', { ...panel.mono, style: { ...panel.mono.style, fontWeight: 600 } }, String(byState[s] ?? 0)))),
        focus ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
          focusList.length ? focusList.map((f) => h('div', { key: f.id, style: { display: 'flex', gap: '5px', alignItems: 'baseline', minWidth: 0 } },
            h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: sevColor(f.severity), flex: '0 0 auto', alignSelf: 'center' } }),
            h('span', { style: { fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, f.title || f.id),
            f.cvss > 0 ? h('span', { ...panel.mono, style: { ...panel.mono.style, color: sevColor(f.severity) } }, f.cvss.toFixed(1)) : null))
            : h('div', panel.muted(0.4), `${focus} 无记录`)) : null)
    }

    // ---- 缺口卡: 未覆盖业务链(scheduler 同款口径查询) ----
    function GapsCard({ snap }) {
      const gaps = snap.gaps ?? []
      return h(Card, { title: '缺口', icon: 'shield' },
        gaps.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '240px', overflowY: 'auto', paddingRight: '2px' } },
            gaps.map((g, i) => h('div', { key: i, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
              h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--d2d-warn)', flex: '0 0 auto', alignSelf: 'center' } }),
              h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, g || '(无链名)'))))
          : h('div', panel.muted(0.45), '无未覆盖链'))
    }

    // ---- 经验库卡: top ExperienceWeight(prior 权重排序) ----
    function ExperienceCard({ snap }) {
      const list = snap.experience ?? []
      const total = snap.counts?.experience ?? list.length
      return h(Card, { title: '经验库', icon: 'book', extra: h('span', panel.muted(0.45), `${total}`) },
        list.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' } },
            list.map((x) => h('div', { key: x.id, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
              h('span', { ...panel.mono, style: { ...panel.mono.style, color: 'var(--d2d-ring-deep)', fontWeight: 600, flex: '0 0 auto' } }, `w=${x.prior}`),
              h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: `${x.pattern} @ ${x.stack}` }, x.pattern || x.id),
              h('span', panel.muted(0.5), `${x.hits}命中/${x.wins}胜`))))
          : h('div', panel.muted(0.45), '暂无经验卡'))
    }

    function ModuleToggles({ off, toggle }) {
      // 单行横向滚动(不折行): 模块再多/标签再长也只占一行, 超宽省略号截断, 悬停 title 看全名
      // B10: pill 形态(chipTone info=显示中 / neutral 虚线半透明=已隐藏), hover 提亮(.d2d-pill)
      return h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', minWidth: 0 } },
        h('span', { style: { ...panel.muted(0.5).style, flexShrink: 0 } }, '模块'),
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'nowrap', alignItems: 'center', overflowX: 'auto', minWidth: 0, maxWidth: '100%', padding: '2px', scrollbarWidth: 'thin' } },
          MODULES.map((m) => {
            const on = !off.has(m.key)
            return h('button', {
              key: m.key,
              className: 'd2d-pill',
              title: `${m.label} — 点击显示/隐藏该卡片`,
              onClick: () => toggle(m.key),
              style: { ...panel.chipTone(on ? 'info' : 'neutral').style, borderRadius: '999px',
                fontFamily: 'var(--dsw-font-mono, monospace)', cursor: 'pointer', flexShrink: 0,
                maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis',
                ...(on ? {} : { opacity: .45, borderStyle: 'dashed' }) },
            }, m.label)
          })))
    }

    // ---- T3-3-2 探索前沿补全: 提案池列表 + 评审操作(POST frontier-transition 代理, reviewer=panel) ----
    // 数据面: GET /d2d/api/frontier(vizRoute 家族 fail-closed)+POST /d2d/api/frontier-transition
    // (迁移门/审计在 graphd, 面板只透传)。评审理由单行输入, 缺省 'panel review'。
    const FRONTIER_POLL_MS = 5000
    const FRONTIER_STATE = { proposed: '待评审', accepted: '已采纳', rejected: '已驳回', explored: '已探索' }

    function useFrontier(visible) {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      const [rev, setRev] = useState(0)
      useEffect(() => {
        if (!visible) return undefined
        // E40-C1: setTimeout 链式(不堆积) + AbortSignal — 与 useSnapshot/useViz 同形态
        const ac = new AbortController()
        let alive = true
        let t = null
        const tick = async () => {
          try {
            const j = await fetchApi('frontier', { signal: ac.signal })
            if (alive) { setData(j); setErr(null) }
          } catch (e) {
            if (alive && e?.name !== 'AbortError') setErr(e)
          } finally {
            if (alive && !ac.signal.aborted) t = setTimeout(tick, FRONTIER_POLL_MS)
          }
        }
        void tick()
        return () => { alive = false; ac.abort(); if (t) clearTimeout(t) }
      }, [visible, rev])
      return { pool: data?.frontier?.pool ?? null, byStatus: data?.frontier?.byStatus ?? {}, err, refresh: () => setRev((r) => r + 1) }
    }

    function FrontierPoolCard({ visible }) {
      const { pool, byStatus, err, refresh } = useFrontier(visible)
      const [note, setNote] = useState('')
      const [busyId, setBusyId] = useState('')
      const [msg, setMsg] = useState(null) // {ok, text}
      // E44-F8: 状态计数条补渲染(byStatus wire 一直有, 渲染面漏接 — 解构未用即其证)
      const statusChips = Object.keys(FRONTIER_STATE).map((s) => h('span', {
        key: s,
        ...panel.chip({ ...(byStatus?.[s] ? { borderColor: s === 'accepted' ? 'var(--d2d-ok)' : s === 'proposed' ? 'var(--d2d-warn)' : 'var(--d2d-line-strong)' } : { opacity: '.5' }) }),
      }, `${FRONTIER_STATE[s] ?? s} ${byStatus?.[s] ?? 0}`))
      const decide = async (id, to) => {
        setBusyId(`${id}:${to}`); setMsg(null)
        try {
          await postJson('frontier-transition', { frontier_id: id, target_status: to, review_note: note.trim() || 'panel review' })
          setMsg({ ok: true, text: `已${to === 'accepted' ? '采纳' : to === 'rejected' ? '驳回' : '标记探索'} ${String(id).slice(0, 12)}` })
          refresh()
        } catch (e) { setMsg({ ok: false, text: String(e?.message ?? e) }) } finally { setBusyId('') }
      }
      const row = (p) => h('div', { key: p.id, style: { display: 'flex', flexDirection: 'column', gap: '2px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '4px' } },
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
          h('span', panel.chip({ ...(p.status === 'proposed' ? { borderColor: 'var(--d2d-warn)' } : p.status === 'accepted' ? { borderColor: 'var(--d2d-ok)' } : {}) }), FRONTIER_STATE[p.status] ?? p.status),
          h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: p.direction }, p.direction || '(无方向文本)'),
          p.value_score > 0 ? h('span', { ...panel.mono, style: { ...panel.mono.style, color: 'var(--d2d-ring-creative)' } }, `v=${Number(p.value_score).toFixed(2)}`) : null),
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', panel.muted(0.5), `${p.proposed_by || '?'} · ${String(p.created_at ?? '').slice(0, 16).replace('T', ' ')}`),
          p.review_note ? h('span', panel.muted(0.55), `评审: ${p.review_note}`) : null,
          p.hypothesis_ref ? h('span', panel.chip({ borderColor: 'var(--d2d-brand)' }), `→ ${String(p.hypothesis_ref).slice(0, 14)}`) : null,
          p.status === 'proposed' ? h('span', { style: { marginLeft: 'auto', display: 'flex', gap: '4px' } },
            h('button', { ...panel.btn({ borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' }), disabled: Boolean(busyId), onClick: () => decide(p.id, 'accepted') }, busyId === `${p.id}:accepted` ? '…' : '采纳'),
            h('button', { ...panel.btn({ borderColor: 'var(--d2d-sev-high)', color: 'var(--d2d-sev-high)' }), disabled: Boolean(busyId), onClick: () => decide(p.id, 'rejected') }, busyId === `${p.id}:rejected` ? '…' : '驳回')) : null))
      return h(Card, {
        title: '前沿池',
        icon: 'merge',
        extra: err
          ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, '不可用')
          : h('span', panel.muted(0.45), `${pool?.length ?? 0}`),
      },
        h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginBottom: '6px' } }, statusChips),
        h('input', { ...panel.input(), placeholder: '评审理由', value: note, onChange: (ev) => setNote(ev.target.value) }),
        err && !pool ? h('div', panel.muted(0.45), '图服务不可达') : null,
        !err && pool && !pool.length ? h('div', panel.muted(0.45), '暂无提案') : null,
        (pool ?? []).map(row),
        msg ? h('div', { style: { fontSize: '10px', color: msg.ok ? 'var(--d2d-ok)' : 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, msg.text) : null)
    }

    function OpsView(props) {
      const { visible } = props
      const { snap, err, now, refresh } = useSnapshot(visible)
      const { off, toggle } = useModules()
      if (err && !snap) {
        return h(FailClosedBanner, { err, onRetry: refresh })
      }
      if (!snap) return h(Skeleton, null)
      // E44-F9: fail-honest 的诚实显示闭环 — snap.stale 非空(本拍有查询回落上拍缓存)时
      // 明示 STALE 徽标(hover 列出回落键), 不再让用户把陈值当实时
      const stalePill = (snap.stale?.length)
        ? h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', marginBottom: '8px' } },
          h('span', {
            ...panel.chip({ borderColor: 'var(--d2d-warn)', color: 'var(--d2d-warn)' }),
            title: `以下查询本拍失败, 显示为上拍缓存值: ${(snap.stale ?? []).join(', ')}`,
          }, `STALE ×${snap.stale.length}`),
          h('span', panel.muted(0.5), '部分数据为上拍缓存(graphd 抖动), 下一拍自动恢复'))
        : null
      return h('div', panel.root, Style(),
        stalePill,
        h(ModuleToggles, { off, toggle }),
        // B13: 两列自适应网格(参考 dashboard 双列——窄槽自动回落单列)
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '10px', alignItems: 'start' } },
        !off.has('eng') ? h(EngagementCard, { snap, refresh }) : null,
        !off.has('denylist') ? h(DenylistCard, { snap, refresh }) : null,
        !off.has('caps') ? h(CapsCard, { snap, refresh }) : null,
        !off.has('fleet') ? h(FleetCard, { fleet: snap.fleet, run: snap.run, refresh }) : null,
        !off.has('usage') ? h(UsageCard, { run: snap.run }) : null,
        !off.has('cost') ? h(CostCard, { snap }) : null,
        h(ConversionCard, { snap }), // T2-1-2 转化率卡(只读, 性价比卡之后; 纯展示无交互)
        !off.has('frontier') ? h(FrontierPoolCard, { visible }) : null, // T3-3-2 探索前沿补全(提案池+评审)
        !off.has('workers') ? h(WorkersCard, { snap, now }) : null,
        !off.has('funnel') ? h(FunnelCard, { snap }) : null,
        !off.has('gaps') ? h(GapsCard, { snap }) : null,
        !off.has('exp') ? h(ExperienceCard, { snap }) : null,
        off.has('strategies') || !snap.strategies?.length ? null : h(StrategiesCard, { strategies: snap.strategies }),
        h(Card, { title: '信号', icon: 'activity', extra: h('span', panel.muted(0.45), `${snap.counts.signals_open}`) },
          snap.signals.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' } },
              snap.signals.map((s) =>
                h('div', { key: s.id, style: { display: 'flex', gap: '7px', alignItems: 'baseline', minWidth: 0 } },
                  h('span', panel.chip(), s.type || '?'),
                  h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, s.id),
                  h('span', panel.muted(0.5), `w=${s.weight}`))))
            : h('div', panel.muted(), '无开放信号'))))
    }


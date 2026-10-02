    // ══════════ view.ops.js — d2d:ops tab(运营观测页 · 可交互): 漏斗/缺口/经验库卡 + 模块开关 + 页面装配 ══════════
    // ---- 漏斗卡: 七态条形, 点击聚焦该状态 findings 迷你列表 ----
    function FunnelCard({ snap }) {
      const [focus, setFocus] = useState(null)
      const byState = snap.findings.byState
      const states = Object.keys(byState).filter((s) => s !== 'rejected')
    const rows = [...states, 'rejected']
      const max = Math.max(...rows.map((s) => byState[s] ?? 0), 1)
      const focusList = focus ? snap.findings.list.filter((f) => f.state === focus).slice(0, 8) : []
      return h(Card, { title: 'Findings 漏斗', extra: h('span', panel.muted(0.45), focus ? '再点取消聚焦' : '点击状态聚焦') },
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
      return h(Card, { title: '覆盖缺口', extra: h('span', panel.muted(0.45), 'coverage_votes<2') },
        gaps.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '240px', overflowY: 'auto', paddingRight: '2px' } },
            gaps.map((g, i) => h('div', { key: i, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
              h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--d2d-warn)', flex: '0 0 auto', alignSelf: 'center' } }),
              h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, g || '(无链名)'))))
          : h('div', panel.muted(0.45), '无未覆盖链 — 端点全部 exhausted/双投票'))
    }

    // ---- 经验库卡: top ExperienceWeight(prior 权重排序) ----
    function ExperienceCard({ snap }) {
      const list = snap.experience ?? []
      const total = snap.counts?.experience ?? list.length
      return h(Card, { title: `经验库 · ${total}`, extra: h('span', panel.muted(0.45), `显示 ${list.length} / 共 ${total} · prior 权重序`) },
        list.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' } },
            list.map((x) => h('div', { key: x.id, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
              h('span', { ...panel.mono, style: { ...panel.mono.style, color: 'var(--d2d-ring-deep)', fontWeight: 600, flex: '0 0 auto' } }, `w=${x.prior}`),
              h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: `${x.pattern} @ ${x.stack}` }, x.pattern || x.id),
              h('span', panel.muted(0.5), `${x.hits}命中/${x.wins}胜`))))
          : h('div', panel.muted(0.45), '暂无经验卡(ExperienceWeight 为空) — verify 环验证后沉淀'))
    }

    function ModuleToggles({ off, toggle }) {
      // 单行横向滚动(不折行): 模块再多/标签再长也只占一行, 超宽省略号截断, 悬停 title 看全名
      return h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', minWidth: 0 } },
        h('span', { style: { ...panel.muted(0.5).style, flexShrink: 0 } }, '模块'),
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'nowrap', alignItems: 'center', overflowX: 'auto', minWidth: 0, maxWidth: '100%', padding: '2px', scrollbarWidth: 'thin' } },
          MODULES.map((m) => {
            const st = off.has(m.key) ? { opacity: '.4', borderStyle: 'dashed' } : { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }
            return h('button', {
              key: m.key,
              title: `${m.label} — 点击显示/隐藏该卡片`,
              onClick: () => toggle(m.key),
              ...panel.btn(st),
              style: { ...panel.btn(st).style, flexShrink: 0, maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis' },
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
        if (!visible) return
        let stop = false
        const tick = async () => {
          try {
            const j = await fetchApi('frontier')
            if (!stop) { setData(j); setErr(null) }
          } catch (e) { if (!stop) setErr(e) }
        }
        void tick()
        const poll = setInterval(tick, FRONTIER_POLL_MS)
        return () => { stop = true; clearInterval(poll) }
      }, [visible, rev])
      return { pool: data?.frontier?.pool ?? null, byStatus: data?.frontier?.byStatus ?? {}, err, refresh: () => setRev((r) => r + 1) }
    }

    function FrontierPoolCard({ visible }) {
      const { pool, byStatus, err, refresh } = useFrontier(visible)
      const [note, setNote] = useState('')
      const [busyId, setBusyId] = useState('')
      const [msg, setMsg] = useState(null) // {ok, text}
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
        title: `前沿提案池 · ${pool?.length ?? 0}`,
        extra: err
          ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, `不可用: ${String(err?.message ?? err).slice(0, 50)}`)
          : h('span', panel.muted(0.45), `待评审 ${byStatus.proposed ?? 0} · 已采纳 ${byStatus.accepted ?? 0} · 已驳回 ${byStatus.rejected ?? 0}`),
      },
        h('input', { ...panel.input(), placeholder: '评审理由(缺省 panel review, 随转态入 graphd 审计)', value: note, onChange: (ev) => setNote(ev.target.value) }),
        err && !pool ? h('div', panel.muted(0.45), '图服务不可达 — fail-closed 不显示过期提案池') : null,
        !err && pool && !pool.length ? h('div', panel.muted(0.45), '暂无前沿提案 — worker 经 propose_direction 提案后入池') : null,
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
      return h('div', panel.root, Style(),
        h(ModuleToggles, { off, toggle }),
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
        h(Card, { title: `开放信号 tail · ${snap.counts.signals_open}`, extra: h('span', panel.muted(0.45), `显示最近 ${snap.signals.length} 条`) },
          snap.signals.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' } },
              snap.signals.map((s) =>
                h('div', { key: s.id, style: { display: 'flex', gap: '7px', alignItems: 'baseline', minWidth: 0 } },
                  h('span', panel.chip(), s.type || '?'),
                  h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, s.id),
                  h('span', panel.muted(0.5), `w=${s.weight}`))))
            : h('div', panel.muted(), '无开放信号 — discovery 环产出后自动入列')))
    }

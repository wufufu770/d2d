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

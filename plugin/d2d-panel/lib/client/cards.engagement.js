    // ══════════ cards.engagement.js — Engagement 管理卡(W5) + CountStrip(选中项目计数条) ══════════
    function CountStrip({ counts }) {
      const items = [
        ['端点', counts.endpoints], ['开放信号', counts.signals_open],
        ['findings', counts.findings], ['经验', counts.experience], ['假设', counts.hypotheses_open],
      ]
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
        items.map(([k, v]) => h('span', { key: k, ...panel.chip() }, h('b', null, String(v ?? 0)), h('span', panel.muted(), k))))
    }

    // ---- Engagement 管理卡(W5): 多 src 项目并行/切换/回看 ----
    // 列表 = 全部 engagement + 战果漏斗进度; 行操作: 选中(视图切换)/启动/续跑/停止。
    // 其余卡片(finds/信号/端点/worker/轨迹)全部跟随选中 engagement(host 快照按 eng 过滤)。
    const ENG_STATE_LABEL = {
      active: '运行中', requested: '排队中', frozen: '已冻结',
      completed: '已收工', exhausted: '已收工', superseded: '已过期',
    }
    function EngStartForm({ onDone }) {
      const [open, setOpen] = useState(false)
      const [target, setTarget] = useState('')
      const [scope, setScope] = useState('')
      const [instances, setInstances] = useState('2')
      const [objective, setObjective] = useState('')
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState(null) // {ok, text}
      if (!open) {
        return h('button', { ...panel.btn({ borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)', alignSelf: 'flex-start' }), onClick: () => setOpen(true) }, '+ 新建 src 项目')
      }
      const submit = async () => {
        setBusy(true); setMsg(null)
        try {
          const r = await postJson('start', { target, scope, instances, objective })
          setMsg({ ok: true, text: r.note ?? '已入队' })
          setTarget(''); setScope(''); setObjective('')
          onDone?.()
        } catch (e) { setMsg({ ok: false, text: String(e?.message ?? e) }) } finally { setBusy(false) }
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '6px' } },
        h('input', { ...panel.input(), placeholder: '目标 URL, 如 https://src.example.com', value: target, onChange: (ev) => setTarget(ev.target.value) }),
        h('input', { ...panel.input(), placeholder: '授权 scope(逗号分隔域名/IP 段, `!` 前缀=排除; 留空取目标域名)', value: scope, onChange: (ev) => setScope(ev.target.value) }),
        h('div', { style: { display: 'flex', gap: '5px' } },
          h('input', { ...panel.input({ maxWidth: '64px' }), title: 'discovery 并行实例数(1-4)', value: instances, onChange: (ev) => setInstances(ev.target.value) }),
          h('input', { ...panel.input({ flex: 1 }), placeholder: '本次目标(可选, 如 SRC 漏洞挖掘/重点资产)', value: objective, onChange: (ev) => setObjective(ev.target.value) })),
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          h('button', { ...panel.btn({ borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }), disabled: busy || !target.trim(), onClick: submit }, busy ? '入队中…' : '启动(入队)'),
          h('button', { ...panel.btn(), disabled: busy, onClick: () => setOpen(false) }, '收起')),
        msg ? h('div', { style: { fontSize: '10px', color: msg.ok ? 'var(--d2d-ok)' : 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, msg.text) : null)
    }
    function EngRow({ e, refresh }) {
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState('')
      const act = async (fn) => { setBusy(true); setErr(''); try { await fn() ; refresh() } catch (ex) { setErr(String(ex?.message ?? ex)) } finally { setBusy(false) } }
      const doSelect = () => act(() => postJson('eng', { op: 'select', name: e.name }))
      const doStop = () => act(() => postJson('stop', { name: e.name }))
      const doResume = () => act(() => postJson('eng', { op: 'resume', name: e.name }))
      const running = e.status === 'active'
      const queued = e.status === 'requested'
      const terminal = ['frozen', 'completed', 'exhausted', 'superseded'].includes(e.status)
      const p = e.progress ?? {}
      return h('div', {
        key: e.name,
        onClick: e.selected ? undefined : doSelect,
        title: e.selected ? '当前选中 — 其余卡片显示该项目的数据' : `点击切换到该项目(${e.name})`,
        style: {
          display: 'flex', flexDirection: 'column', gap: '3px', padding: '6px 8px', borderRadius: '6px', minWidth: 0,
          border: `1px solid ${e.selected ? 'var(--d2d-brand)' : 'var(--d2d-line)'}`,
          ...(e.selected ? { background: 'rgba(77,107,254,.06)' } : {}),
          ...(e.selected ? {} : { cursor: 'pointer' }),
        },
      },
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
          h('span', panel.dot(running ? 'var(--d2d-ok)' : queued ? 'var(--d2d-warn)' : 'rgba(128,140,165,.6)', running)),
          h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '11px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, e.name),
          h('span', panel.chip({ borderColor: running ? 'var(--d2d-ok)' : 'var(--d2d-line-strong)' }), ENG_STATE_LABEL[e.status] ?? e.status),
          e.selected ? h('span', panel.chip({ borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }), '◆ 当前') : null),
        h('div', { style: { display: 'flex', gap: '8px', alignItems: 'baseline', flexWrap: 'wrap', minWidth: 0 } },
          h('span', panel.muted(0.55), `${e.target || '?'}`),
          h('span', panel.muted(0.5), `活跃 ${p.active ?? 0} · 已验证 ${p.verified ?? 0} · 已交付 ${p.delivered ?? 0}`),
          p.workers ? h('span', panel.muted(0.6), `⚙ ${p.workers}`) : null),
        h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' }, onClick: (ev) => ev.stopPropagation() },
          !e.selected ? h('button', { ...panel.btn(), disabled: busy, onClick: doSelect, title: '面板/dsh 视图切换到该项目' }, '选中') : null,
          running || queued ? h('button', { ...panel.btn({ borderColor: 'var(--d2d-sev-high)', color: 'var(--d2d-sev-high)' }), disabled: busy, onClick: doStop }, '停止') : null,
          terminal ? h('button', { ...panel.btn({ borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' }), disabled: busy, onClick: doResume, title: '同 engagement 续挖 — 历史记录全保留' }, '续跑') : null,
          err ? h('span', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)', alignSelf: 'center', wordBreak: 'break-all' } }, err) : null))
    }
    function EngagementCard({ snap, refresh }) {
      const e = snap.engagement
      const cov = snap.coverage ?? { total: 0, covered: 0 }
      const pct = cov.total > 0 ? Math.round((cov.covered / cov.total) * 100) : null
      const [hoverMs, setHoverMs] = useState(null)
      const list = snap.engagements ?? []
      return h(Card, {
        title: 'Engagement · 项目管理',
        extra: h('span', panel.muted(0.5), `${list.length} 个项目 · 多开并行`),
      },
        // 全部项目列表(含进度 + 操作)
        list.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto', paddingRight: '2px' } },
            list.map((x) => h(EngRow, { e: x, refresh })))
          : h('div', panel.muted(), '尚无项目 — 用下方表单发起第一个 src 项目'),
        h(EngStartForm, { onDone: refresh }),
        // 选中项目详情(覆盖大数字 + 里程碑 + 计数) — 其余卡片同源跟随
        e ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '6px' } },
          h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `◆ ${e.name}`),
          h('div', panel.muted(0.55), `${e.target || '?'} · scope: ${e.scope || '?'}`),
          (snap.denylist?.domains?.length || snap.denylist?.cidr_prefix?.length)
            ? h('div', panel.muted(0.55), `⛔ 黑名单 ${(snap.denylist.domains?.length ?? 0) + (snap.denylist.cidr_prefix?.length ?? 0)} 条(独立卡片内可增删改)`) : null,
          h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px' } },
            h('span', { style: { fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } },
              pct === null ? '—' : `${pct}%`),
            h('span', panel.muted(0.55), `覆盖 ${cov.covered}/${cov.total} 端点`)),
          snap.milestones?.length ? h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '3px', position: 'relative', flexWrap: 'wrap' } },
            snap.milestones.map((m, i) => {
              const isLast = i === snap.milestones.length - 1
              return h('button', {
                key: m.id,
                title: `${m.created_at} · ${m.digest.slice(0, 120)}`,
                onMouseEnter: () => setHoverMs(m.id),
                onMouseLeave: () => setHoverMs(null),
                style: {
                  border: 'none', background: 'transparent', padding: '1px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '16px',
                },
              },
                h('span', { style: { width: '8px', height: `${8 + (i % 3) * 3}px`, borderRadius: '2px', background: isLast ? 'var(--d2d-brand)' : 'var(--d2d-line-strong)', opacity: isLast ? 1 : 0.7 } }),
                h('span', { style: { fontSize: '8px', opacity: hoverMs === m.id ? 1 : 0.5 } }, `m${i + 1}`))
            }),
            h('span', { ...panel.muted(0.45), style: { marginLeft: '4px' } }, '· 里程碑(handoff)')) : null,
          hoverMs ? h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.6', wordBreak: 'break-all' } },
            (snap.milestones.find((m) => m.id === hoverMs)?.digest ?? '').slice(0, 160)) : null,
          h(CountStrip, { counts: snap.counts }))
          : null)
    }

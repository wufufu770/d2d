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
        title: e.selected ? '当前选中' : `切换到 ${e.name}`,
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
        // T3-3-2 总览补全: severity 计数列(有记录才渲染) + per-eng token 总耗(活跃优先 ≤8, 其余 '—')
        h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'baseline' } },
          Object.entries(e.sev ?? {}).filter(([, n]) => n > 0).map(([k, n]) =>
            h('span', { key: `sev:${k}`, ...panel.chip({ borderColor: sevColor(k) }), title: `severity ${k}` }, `${k} ${n}`)),
          e.cost ? h('span', { ...panel.muted(0.5), title: `账本来源 ${e.cost.source}` }, `Σ ${((e.cost.inputTokens ?? 0) + (e.cost.outputTokens ?? 0)).toLocaleString()} tok`) : null),
        h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' }, onClick: (ev) => ev.stopPropagation() },
          !e.selected ? h('button', { ...panel.btn(), disabled: busy, onClick: doSelect, title: '面板/dsh 视图切换到该项目' }, '选中') : null,
          running || queued ? h('button', { ...panel.btn({ borderColor: 'var(--d2d-sev-high)', color: 'var(--d2d-sev-high)' }), disabled: busy, onClick: doStop }, '停止') : null,
          terminal ? h('button', { ...panel.btn({ borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' }), disabled: busy, onClick: doResume, title: '同 engagement 续挖 — 历史记录全保留' }, '续跑') : null,
          err ? h('span', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)', alignSelf: 'center', wordBreak: 'break-all' } }, err) : null))
    }
    function EngagementCard({ snap, refresh }) {
      const e = snap.engagement
      const p = e?.progress ?? {} // B13 修: 计数网格引用 p.* — 此前 p 只在 EngRow 作用域(ReferenceError → 整槽崩溃白屏)
      const cov = snap.coverage ?? { total: 0, covered: 0 }
      const pct = cov.total > 0 ? Math.round((cov.covered / cov.total) * 100) : null
      const [hoverMs, setHoverMs] = useState(null)
      const list = snap.engagements ?? []
      return h(Card, {
        title: '项目',
        icon: 'folder',
        extra: h('span', panel.muted(0.5), `${list.length}`),
      },
        // 全部项目列表(含进度 + 操作)
        list.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto', paddingRight: '2px' } },
            list.map((x) => h(EngRow, { e: x, refresh })))
          : h('div', panel.muted(), '尚无项目'),
        h(EngStartForm, { onDone: refresh }),
        // 选中项目详情(覆盖大数字 + 里程碑 + 计数) — 其余卡片同源跟随
        e ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '6px' } },
          h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, `◆ ${e.name}`),
          h('div', panel.muted(0.55), `${e.target || '?'} · scope: ${e.scope || '?'}`),
          // B13: 覆盖进度环(mockup 里程碑环形态)+活跃/交付计数网格(环右)
          h('div', { style: { display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' } },
            h('svg', { width: 64, height: 64, viewBox: '0 0 64 64', style: { flex: '0 0 auto' } },
              h('circle', { cx: 32, cy: 32, r: 27, fill: 'none', stroke: 'var(--d2d-bg-2)', strokeWidth: 6 }),
              h('circle', { cx: 32, cy: 32, r: 27, fill: 'none', stroke: 'var(--d2d-ok)', strokeWidth: 6, strokeLinecap: 'round',
                strokeDasharray: `${((pct ?? 0) / 100) * 169.6} 169.6`, transform: 'rotate(-90 32 32)' }),
              h('text', { x: 32, y: 36, textAnchor: 'middle', fontSize: 13, fontWeight: 700, fill: 'var(--d2d-text-hi)' }, pct === null ? '—' : `${pct}%`)),
            h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(3, auto)', gap: '4px 14px', alignItems: 'baseline' } },
              // E44-F6: 口径明示(hover title) — "活跃"与"开放信号"是两种计数(findings vs signals),
              // 覆盖口径=coverage_votes≥2 或 exhausted, 无标注时用户读作矛盾(2026-11-18 调研实证)
              [['覆盖端点', `${cov.covered}/${cov.total}`, 'covered/total — coverage_votes≥2 或 exhausted 计为 covered'],
                ['活跃', String(p.active ?? 0), '活跃 findings(candidate+triaged) — 与「开放信号」(signals)是两种口径'],
                ['已验证', String(p.verified ?? 0), 'verified+isolated findings'],
                ['已交付', String(p.delivered ?? 0), 'reported+accepted findings'],
                ['开放信号', String(snap.counts?.signals_open ?? 0), 'status=open 的信号数(发现线索, 非漏洞结论)'],
                ['workers', String(p.workers ?? 0), 'status=running 的 worker 数(本查询失败时回落上拍值, 见快照 stale 标记)']]
                .flatMap(([label, v, tip]) => [
                  h('span', { ...panel.muted(0.55), style: { fontSize: '10px' }, title: tip }, label),
                  h('span', { style: { fontSize: '13px', fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: 'var(--d2d-text-hi)' }, title: tip }, v)]))),
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
            h('span', { ...panel.muted(0.45), style: { marginLeft: '4px' } }, '里程碑')) : null,
          hoverMs ? h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.6', wordBreak: 'break-all' } },
            (snap.milestones.find((m) => m.id === hoverMs)?.digest ?? '').slice(0, 160)) : null,
          h(CountStrip, { counts: snap.counts }))
          : null)
    }

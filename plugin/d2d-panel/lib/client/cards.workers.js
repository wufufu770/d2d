    // ══════════ cards.workers.js — Workers 卡 + 鱼骨抽屉(执行轨迹) ══════════
    // ---- Worker 鱼骨抽屉: 执行轨迹(run-log.jsonl 事件 + checkpoint/todo 折叠) ----
    const EV_KIND = {
      dispatch: { label: 'DISPATCH', color: 'var(--d2d-ring-discovery)' },
      terminal: { label: 'TERMINAL', color: 'var(--d2d-ring-verify)' },
      'zero-write': { label: 'ZERO-WRITE', color: 'var(--d2d-warn)' },
      handoff: { label: 'HANDOFF', color: 'var(--d2d-ring-deep)' },
    }

    function WorkerDrawer({ a, events, now }) {
      const mine = events.filter((e) => e.worker === a.worker_id)
      const dispatch = mine.findLast?.((e) => e.kind === 'dispatch') ?? [...mine].reverse().find((e) => e.kind === 'dispatch')
      const [openEv, setOpenEv] = useState(null)
      const [showCp, setShowCp] = useState(false)
      const model = dispatch?.model || ''
      const [copied, setCopied] = useState(false)
      const beatTs = Date.parse(a.updated_at) || 0
      const copyTraj = () => {
        try {
          const txt = JSON.stringify({ worker: a, events: mine }, null, 2)
          void navigator?.clipboard?.writeText?.(txt)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {}
      }
      return h('div', {
        style: { border: '1px solid var(--d2d-line)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--dsw-alias-bg-layer-2, transparent)' },
      },
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { ...panel.mono, style: { ...panel.mono.style, fontWeight: 600 } }, a.worker_id),
          h('span', { ...panel.chip({ borderColor: ringColor(a.ring), color: ringColor(a.ring) }) }, a.ring || '?'),
          a.chain ? h('span', panel.chip(), a.chain) : null,
          model ? h('span', panel.chip(), shortModel(model)) : null,
          h('span', { style: { fontSize: '10px', opacity: '.65', marginLeft: 'auto' } },
            a.zombie ? `失联 ${fmtAge(now - beatTs)}` : `${a.status || '?'}${beatTs ? ` · ${fmtAge(now - beatTs)} 前` : ''}`)),
        mine.length ? h('div', { style: { display: 'flex', flexDirection: 'column' } },
          mine.map((e, i) => {
            const meta = EV_KIND[e.kind] ?? { label: String(e.kind).toUpperCase(), color: 'var(--d2d-line-strong)' }
            const open = openEv === i
            return h('div', { key: i, style: { display: 'flex', gap: '6px' } },
              h('div', panel.rail(meta.color)),
              h('button', {
                onClick: () => setOpenEv(open ? null : i),
                style: { flex: 1, display: 'flex', gap: '6px', alignItems: 'baseline', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', padding: '2px 0', minWidth: 0 },
              },
                h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: '.55', flex: '0 0 auto' } }, fmtClock(e.ts)),
                h('span', { ...panel.mono, style: { ...panel.mono.style, color: meta.color, fontSize: '9px', letterSpacing: '.05em', flex: '0 0 auto' } }, meta.label),
                h('span', { style: { fontSize: '10px', opacity: '.8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } },
                  e.kind === 'dispatch' ? `派发 · ${e.ring || ''}${e.role ? ` · ${e.role}` : ''}`
                    : e.kind === 'terminal' ? `退出 code=${e.code ?? '?'}${e.quota ? ` · 额度:${e.quota}` : ''}`
                      : e.kind === 'zero-write' ? '零图写入 · 自动补写重派'
                        : e.reason ? `handoff · ${e.reason}` : 'handoff 里程碑'),
                h('span', { style: { fontSize: '9px', opacity: '.4', flex: '0 0 auto' } }, open ? '▾' : '▸')),
              open ? h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px', opacity: '.6', wordBreak: 'break-all', border: '1px dashed var(--d2d-line)', borderRadius: '6px', padding: '4px 6px', margin: '2px 0 4px' } },
                `ts=${e.ts}`, e.model ? ` model=${e.model}` : '', e.role ? ` role=${e.role}` : '', e.worker ? ` worker=${e.worker}` : '') : null)
          })) : h('div', panel.muted(0.45), '无轨迹事件(run-log.jsonl 该 worker 无记录)'),
        (a.checkpoint || a.todo) ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
          h('button', { ...panel.btn({ alignSelf: 'flex-start' }), onClick: () => setShowCp(!showCp) },
            showCp ? '收起 checkpoint / todo' : '展开 checkpoint / todo'),
          showCp ? h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px', opacity: '.7', whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px dashed var(--d2d-line)', borderRadius: '6px', padding: '5px 7px' } },
            a.checkpoint ? `checkpoint:\n${a.checkpoint}` : '',
            a.todo ? `\ntodo:\n${a.todo}` : '') : null) : null,
        h('div', { style: { display: 'flex', gap: '5px' } },
          h('button', { ...panel.btn(), onClick: copyTraj }, copied ? '已复制 ✓' : '复制轨迹 JSON')))
    }

    function WorkersCard({ snap, now }) {
      const [openId, setOpenId] = useState(null)
      const agents = snap.agents ?? []
      const alive = agents.filter((a) => a.status === 'running' && !a.zombie).length
      // R5.1: 运行中的排前面, 全量渲染进固定高度滚动容器(替代展开/收起)
      const sorted = [...agents].sort((a, b) => (a.status === 'running' ? 0 : 1) - (b.status === 'running' ? 0 : 1))
      return h(Card, {
        title: `Workers · 存活 ${alive}/${agents.length}`,
        extra: h('span', panel.muted(0.45), `${agents.length} 条 · 滚轮查看`),
      },
        sorted.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '320px', overflowY: 'auto', paddingRight: '2px' } },
            sorted.map((a) => h('div', { key: a.worker_id, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('button', {
              onClick: () => setOpenId(openId === a.worker_id ? null : a.worker_id),
              style: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, border: 'none', background: 'transparent', color: 'inherit', padding: 0, textAlign: 'left' },
            },
              h('span', panel.dot(a.zombie ? 'var(--d2d-warn)' : a.status === 'running' ? 'var(--d2d-ok)' : a.status === 'done' ? 'var(--d2d-sev-info)' : 'var(--d2d-line-strong)', a.status === 'running' && !a.zombie)),
              h('span', { ...panel.chip({ borderColor: ringColor(a.ring), color: ringColor(a.ring) }) }, a.ring || '?'),
              h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, a.worker_id),
              a.chain ? h('span', panel.muted(0.5), a.chain) : null,
              h('span', { style: { fontSize: '10px', color: a.zombie ? 'var(--d2d-warn)' : 'inherit', opacity: '.7', whiteSpace: 'nowrap', flex: '0 0 auto' } },
                (a.zombie ? `失联 ${fmtAge(now - (Date.parse(a.updated_at) || 0))}` : (a.status || '?')), ' ▸')),
            openId === a.worker_id ? h(WorkerDrawer, { a, events: snap.run?.events ?? [], now }) : null)))
          : h('div', panel.muted(), '暂无 worker 心跳(AgentIdentity 为空)'),
        agents.length ? h('div', panel.muted(0.4), '运行中置顶 · 点击行展开执行轨迹') : null)
    }

    // ══════════ view.xring.js — XR-P2 X-Ring tab: 旁路探索通道投影(过程可见, M6) ══════════
    // 数据面: snapshot.xring 节(host 侧 readXringRuns 只读聚合记录面, fail-soft) —— view 不直读
    // 文件系统。红线(拍板 1, **2026-11-18 用户拍板修订**: 手动启动入口开放——仅新增"启动",
    // 停止仍走 CLI node scripts/xring/cli.mjs stop <runDir>): 启动 = postJson('xring-start')
    // (host 校验目标政策+单活跃守卫+detached spawn first-run.mjs), 表单默认值跟随选中项目。

    /** 秒 → 人读时长(smoke 实测 36.5s ~ 预算上限 6h 全覆盖)。 */
    function xringElapsed(sec) {
      if (sec == null) return '—'
      if (sec < 90) return `${sec}s`
      if (sec < 5400) return `${Math.round(sec / 60)}m`
      return `${(sec / 3600).toFixed(1)}h`
    }

    /** E46-XR: 手动启动表单(目标/范围/预算小时——默认值跟随选中 engagement; 单活跃由 host 守卫)。 */
    function XRingStartForm({ snap, refresh }) {
      const eng = snap?.engagement ?? {}
      const [target, setTarget] = useState(eng.target ?? '')
      const [scope, setScope] = useState(eng.scope ?? '')
      const [hours, setHours] = useState('1')
      const [busy, setBusy] = useState(false)
      const [msg, setMsg] = useState(null) // {ok, text}
      const submit = async () => {
        setBusy(true); setMsg(null)
        try {
          const r = await postJson('xring-start', { target, scope, maxHours: Number(hours) })
          setMsg({ ok: true, text: r.note ?? '已拉起' })
          refresh?.()
        } catch (e) { setMsg({ ok: false, text: String(e?.message ?? e) }) } finally { setBusy(false) }
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '6px' } },
        h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } },
          h('input', { ...panel.input(), style: { ...panel.input().style, flex: '1 1 220px', minWidth: 0 }, placeholder: '目标 URL(如 https://src.example.com)', value: target, onChange: (ev) => setTarget(ev.target.value) }),
          h('input', { ...panel.input(), style: { ...panel.input().style, flex: '1 1 160px', minWidth: 0 }, placeholder: 'scope(逗号分隔, 留空取目标域名)', value: scope, onChange: (ev) => setScope(ev.target.value) }),
          h('input', { ...panel.input(), style: { ...panel.input().style, width: '90px' }, title: '预算小时(0-6, BUDGET_LIMITS 硬上限 6h)', value: hours, onChange: (ev) => setHours(ev.target.value) }),
          h('button', { ...panel.btn({ borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }), disabled: busy, onClick: submit, title: '手动启动 X-Ring 旁路探索(first-run 编排: runner+预算监控+回流)' }, busy ? '启动中…' : '启动')),
        msg ? h('div', { style: { fontSize: '10px', color: msg.ok ? 'var(--d2d-ok)' : 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, msg.text) : null,
        h('div', panel.muted(0.45), '启动 = first-run 编排(detached) — 单活跃; 停止: node scripts/xring/cli.mjs stop <runDir>'))
    }

    /** 历史 run 行(也用于当前 run 首行): 时间/状态/标识/耗时/工件计数。 */
    function XRingRunRow({ r }) {
      const running = r?.status === 'running'
      return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
        h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.55, flex: '0 0 auto' } }, String(r?.startedAt ?? '').slice(5, 16).replace('T', ' ')),
        h('span', panel.chip({ ...(running ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}) }),
          running ? 'running' : `stopped${r?.stopReason ? `·${r.stopReason}` : ''}`),
        h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.7, flex: '0 0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: `${r?.eng}/${r?.runId}` }, `${r?.eng}/${r?.runId}`),
        h('span', panel.muted(0.6), xringElapsed(r?.elapsedSec)),
        h('span', panel.muted(0.5), r?.artifacts ? `A:${r.artifacts.A ?? '?'} B:${r.artifacts.B ?? '?'} C:${r.artifacts.C ?? '?'}` : '—'))
    }

    /** X-Ring tab 容器: 启动表单 + 当前 run/预算/工件计数/事件尾窗/历史列表。
     *  E46-XR: 空态不再只是"无 run 记录"——带启动表单; 活跃 run 存在时表单隐藏(单活跃)。 */
    function XRingView({ visible }) {
      const { snap, err, refresh } = useSnapshot(visible)
      if (err && !snap) return h('div', panel.root, Style(), h(FailClosedBanner, { err, onRetry: refresh }))
      if (!snap) return h('div', panel.root, Style(), h(Skeleton, null))
      const x = snap?.xring
      if (!x?.available || !(x.runs ?? []).length) {
        return h('div', panel.root, Style(),
          h(Card, { title: 'X-Ring', icon: 'cpu' },
            h('div', panel.muted(0.45), '无 run 记录 — 手动启动旁路探索:'),
            h(XRingStartForm, { key: snap?.engagement?.name ?? 'x', snap, refresh })))
      }
      const cur = x.runs[0]
      const kids = [
        !x.activeCount ? h(XRingStartForm, { key: `f-${snap?.engagement?.name ?? 'x'}`, snap, refresh }) : null,
        h('div', { key: 'chips', style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'baseline' } },
          h('span', panel.chip({ ...(x.activeCount ? { borderColor: 'var(--d2d-brand)' } : {}) }), `活跃 run ${x.activeCount}`),
          h('span', panel.chip(), `历史 ${x.runs.length}`)),
        ...((x.degraded ?? []).map((d, i) => h('div', { key: `dg${i}`, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d))),
        h('div', { key: 'cur', style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px', display: 'flex', flexDirection: 'column', gap: '3px' } },
          h(XRingRunRow, { r: cur }),
          h('div', panel.muted(0.5), `${cur.mode ? `档位 ${cur.mode} · ` : ''}${cur.budget ? `预算 ${cur.budget.maxHours ?? '?'}h / ${Number(cur.budget.maxTokens ?? 0).toLocaleString()} token` : ''}${cur.mode === 'bypass' ? ' · bypass' : ''}`),
          h('div', panel.muted(0.5), cur.lastTick ? `预算判定 ${cur.lastTick.ok ? 'ok' : '超限'} · ${cur.lastTick.detail}` : null),
          cur.lastTick?.tokens != null
            ? h('div', panel.muted(0.5), `token ${Number(cur.lastTick.tokens).toLocaleString()}`)
            : null,
          cur.lastTick?.idleMs != null
            ? h('div', panel.muted(0.5), `转录静默 ${(cur.lastTick.idleMs / 1000).toFixed(0)}s`)
            : null,
          cur.stale
            ? h('div', { ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, `⚠ 心跳失联 ${(cur.stale.idleMs / 1000).toFixed(0)}s`)
            : null,
          cur.artifacts
            ? h('div', panel.muted(0.5), `回流 ${cur.artifacts.reflow?.written ?? 0} / 留验 ${cur.artifacts.reflow?.held ?? 0} / 错误 ${cur.artifacts.reflow?.errors ?? 0}`)
            : null),
        ...(x.runs.length > 1
          ? [h('div', { key: 'hist', style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' } },
            x.runs.slice(1).map((r, i) => h(XRingRunRow, { key: i, r })))]
          : []),
        h('div', { key: 'events', style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '220px', overflowY: 'auto' } },
          (cur.events ?? []).length
            ? cur.events.slice().reverse().map((e, i) => h('div', { key: i, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
              h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.55, flex: '0 0 auto' } }, String(e.ts ?? '').slice(5, 19).replace('T', ' ')),
              h('span', panel.chip(), e.event),
              h('span', { ...panel.muted(0.6), style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: [e.reason, e.detail].filter(Boolean).join(' · ') }, [e.reason, e.detail].filter(Boolean).join(' · '))))
            : h('div', panel.muted(0.45), '无事件')),
        h('div', { key: 'note', ...panel.muted(0.45), style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
          '停止: node scripts/xring/cli.mjs stop <runDir>'),
      ]
      return h('div', panel.root, Style(),
        h(Card, { title: 'X-Ring' }, ...kids))
    }

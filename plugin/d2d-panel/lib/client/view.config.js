    // ══════════ view.config.js — T3-3-2 配置 tab: 配置卡集中 + 只读总览区(通知/暂停/模式) ══════════
    // 数据面: snapshot(既有写面卡的数据源)+ GET /d2d/api/configx(fail-soft 只读)。
    // 写面(fleet/凭据/容量/黑名单)复用既有卡片组件 — 零重复实现; 通知通道只读(webhook 内嵌
    // token, host 侧已脱敏, wire 只出 configured/method/has_webhook)。
    const CONFIG_POLL_MS = 5000

    function useConfigx(visible) {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      useEffect(() => {
        if (!visible) return
        let stop = false
        const tick = async () => {
          try {
            const j = await fetchApi('configx')
            if (!stop) { setData(j); setErr(null) }
          } catch (e) { if (!stop) setErr(e) }
        }
        void tick()
        const poll = setInterval(tick, CONFIG_POLL_MS)
        return () => { stop = true; clearInterval(poll) }
      }, [visible])
      return { config: data?.config ?? null, err }
    }

    /** 配置 tab 容器: 只读总览区 + 既有配置写面卡集中(对等: ops 卡的配置子集不再散落)。 */
    function ConfigView({ visible }) {
      const { snap, err, refresh } = useSnapshot(visible)
      const { config, err: cfgErr } = useConfigx(visible)
      if (err && !snap) return h(FailClosedBanner, { err, onRetry: refresh })
      if (!snap) return h(Skeleton, null)
      const paused = config?.paused ?? []
      return h('div', panel.root, Style(),
        h(Card, {
          title: '总览',
          extra: cfgErr
            ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, '不可用')
            : null,
        },
          h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'baseline' } },
            h('span', panel.chip({ ...(config?.notify?.configured ? { borderColor: 'var(--d2d-ok)' } : {}) }),
              `通知 ${config?.notify?.configured ? `已配置 · ${config.notify.method || 'POST'}` : '未配置'}`),
            h('span', panel.chip(), `审批 ${snap.approvals?.mode ?? '?'}`),
            h('span', panel.chip({ ...(paused.length ? { borderColor: 'var(--d2d-warn)' } : {}) }), `暂停 ${paused.length}`)),
          paused.length
            ? h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
              paused.slice(0, 12).map((p) => h('span', { key: p, ...panel.chip() }, p)),
              paused.length > 12 ? h('span', panel.muted(0.45), `+${paused.length - 12}`) : null)
            : null,
          (config?.degraded ?? []).map((d, i) => h('div', { key: i, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d))),
        h(DenylistCard, { snap, refresh }),
        h(CapsCard, { snap, refresh }),
        h(FleetCard, { fleet: snap.fleet, run: snap.run, refresh }),
        h(ExportCard, {}))
    }

    // ══════════ E39-B5-2: SRC 报告导出卡(前端↔后端对齐: /d2d/api/report-export 代理
    // scripts/report/src-export.mjs CLI——host 半进程包裹, 输出截 4k 展示面) ══════════
    function ExportCard() {
      const [sev, setSev] = useState('high')
      const [out, setOut] = useState(null)
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const run = async () => {
        setBusy(true); setErr(null); setOut(null)
        try {
          const j = await postJson('report-export', { minSeverity: sev })
          setOut(j.output ?? '')
        } catch (e) { setErr(String(e.message ?? e).slice(0, 160)) }
        setBusy(false)
      }
      return h(Card, { title: '报告导出' },
        h('div', { style: { display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' } },
          h('select', { ...panel.input(), value: sev, onChange: (ev) => setSev(ev.target.value) },
            ['critical', 'high', 'medium', 'low'].map((s) => h('option', { key: s, value: s }, `≥ ${s}`))),
          h('button', { ...panel.btn(), disabled: busy, onClick: run }, busy ? '导出中…' : '导出报告'),
          err ? h('span', { style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, err) : null),
        out ? h('pre', { ...panel.mono, style: { ...panel.mono.style, maxHeight: '220px', overflowY: 'auto', whiteSpace: 'pre-wrap', margin: 0, padding: '6px', border: '1px solid var(--d2d-line)', borderRadius: '6px' } }, out) : null)
    }

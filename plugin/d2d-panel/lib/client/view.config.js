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
          title: '配置总览(只读)',
          extra: cfgErr
            ? h('span', { ...panel.muted(0.5), style: { color: 'var(--d2d-sev-high)', fontSize: '10px' } }, `configx 不可用: ${String(cfgErr?.message ?? cfgErr).slice(0, 50)}`)
            : h('span', panel.muted(0.45), '通知通道值面不出 host(webhook 内嵌 token) · 写面在下方卡片'),
        },
          h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'baseline' } },
            h('span', panel.chip({ ...(config?.notify?.configured ? { borderColor: 'var(--d2d-ok)' } : {}) }),
              `通知通道 ${config?.notify?.configured ? `已配置 · ${config.notify.method || 'POST'}` : '未配置(模板 config/notify.example.json)'}`),
            h('span', panel.chip(), `审批模式 ${snap.approvals?.mode ?? '?'}`),
            h('span', panel.chip({ ...(paused.length ? { borderColor: 'var(--d2d-warn)' } : {}) }), `暂停项目 ${paused.length}`)),
          paused.length
            ? h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
              paused.slice(0, 12).map((p) => h('span', { key: p, ...panel.chip(), title: '停止时冻结快照(config/paused-<eng>.json) — 续跑入口在总览 tab' }, p)),
              paused.length > 12 ? h('span', panel.muted(0.45), `+${paused.length - 12} …`) : null)
            : null,
          (config?.degraded ?? []).map((d, i) => h('div', { key: i, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d))),
        h(DenylistCard, { snap, refresh }),
        h(CapsCard, { snap, refresh }),
        h(FleetCard, { fleet: snap.fleet, run: snap.run, refresh }))
    }

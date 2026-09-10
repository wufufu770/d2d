    // ══════════ ui.js — DSW 令牌样式 / 语义色 / 轮询 hook / 原语 ══════════
    const POLL_MS = 2000
    const SEMANTIC_CSS = [
      '.d2d-panel{--d2d-sev-critical:#e5484d;--d2d-sev-high:#f0773c;--d2d-sev-medium:#d8a021;--d2d-sev-low:#58a36a;--d2d-sev-info:#8e97a8;',
      '--d2d-ring-discovery:#4d6bfe;--d2d-ring-deep:#9b7bff;--d2d-ring-creative:#f5a623;--d2d-ring-verify:#2fb6a3;--d2d-ring-study:#8e97a8;',
      '--d2d-ok:#58a36a;--d2d-warn:#d8a021;--d2d-line:rgba(128,140,165,.32);--d2d-line-strong:rgba(128,140,165,.5);--d2d-brand:#4d6bfe}',
      '@keyframes d2d-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '@keyframes d2d-shimmer{0%{opacity:.45}50%{opacity:.9}100%{opacity:.45}}',
      '.d2d-panel button{cursor:pointer}',
      '@media (prefers-reduced-motion: no-preference){',
      '.d2d-dot-running{animation:d2d-pulse 2s ease-in-out infinite}',
      '.d2d-skel{animation:d2d-shimmer 1.6s ease-in-out infinite}}',
    ].join('\n')

    const sevColor = (s) => `var(--d2d-sev-${String(s || 'info').toLowerCase()}, var(--d2d-sev-info))`
    const ringColor = (r) => `var(--d2d-ring-${String(r || '').toLowerCase()}, var(--d2d-sev-info))`

    const panel = {
      root: {
        className: 'd2d-panel',
        style: {
          background: 'var(--dsw-alias-bg-layer-1, transparent)', // 接入指南 §12.1: 面板表面唯一正确令牌
          color: 'inherit', font: 'inherit', padding: '10px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          overflowY: 'auto', height: '100%', boxSizing: 'border-box', minWidth: 0,
        },
      },
      card: { style: { border: '1px solid var(--d2d-line)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 } },
      cardTitle: { style: { fontSize: '11px', opacity: '.65', letterSpacing: '.04em', textTransform: 'uppercase', margin: 0 } },
      mono: { style: { fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', fontSize: '11px' } },
      muted: (o = 0.65) => ({ style: { opacity: String(o), fontSize: '11px' } }),
      chip: (extra = {}) => ({ style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--d2d-line)', borderRadius: '999px', padding: '1px 7px', fontSize: '10px', whiteSpace: 'nowrap', ...extra } }),
      dot: (color, pulse) => ({ className: pulse ? 'd2d-dot-running' : undefined, style: { width: '7px', height: '7px', borderRadius: '50%', background: color, flex: '0 0 auto' } }),
      btn: (extra = {}) => ({ style: { fontSize: '10px', border: '1px solid var(--d2d-line-strong)', borderRadius: '999px', padding: '2px 9px', background: 'transparent', color: 'inherit', whiteSpace: 'nowrap', ...extra } }),
      input: (extra = {}) => ({ style: { fontSize: '11px', border: '1px solid var(--d2d-line-strong)', borderRadius: '6px', padding: '3px 6px', background: 'transparent', color: 'inherit', minWidth: 0, ...extra } }),
      rail: (color) => ({ style: { width: '3px', borderRadius: '2px', background: color, flex: '0 0 auto', alignSelf: 'stretch' } }),
    }

    function Style() { return h('style', null, SEMANTIC_CSS) }

    function Card({ title, children, extra, onClick, highlight }) {
      return h('div', {
        ...panel.card,
        onClick,
        style: { ...panel.card.style, ...(onClick ? { cursor: 'pointer' } : {}), ...(highlight ? { borderColor: 'var(--d2d-brand)' } : {}) },
      },
        title ? h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' } },
          h('span', panel.cardTitle, title), extra ?? null) : null,
        children)
    }

    // 轮询 hook: visible 门控(tab 不可见完全静默) + 前端时钟(zombie 走字不占轮询)
    function useSnapshot(visible) {
      const [snap, setSnap] = useState(null)
      const [err, setErr] = useState(null)
      const [now, setNow] = useState(() => Date.now())
      const [rev, setRev] = useState(0) // 写操作后立即强制刷新
      useEffect(() => {
        if (!visible) return
        const ac = new AbortController()
        let stop = false
        const tick = async () => {
          try {
            const s = await fetchSnapshot(ac.signal)
            if (!stop) { setSnap(s); setErr(null) }
          } catch (e) {
            if (!stop && e?.name !== 'AbortError') setErr(e)
          }
        }
        void tick()
        const poll = setInterval(tick, POLL_MS)
        const clock = setInterval(() => setNow(Date.now()), 1000)
        return () => { stop = true; ac.abort(); clearInterval(poll); clearInterval(clock) }
      }, [visible, rev])
      const refresh = useCallback(() => setRev((r) => r + 1), [])
      return { snap, err, now, refresh }
    }

    /** localStorage 模块开关(设置卡范式): 默认全开, 记忆用户取舍。 */
    const MODULES = [
      { key: 'eng', label: 'engagement' },
      { key: 'caps', label: '容量' },
      { key: 'denylist', label: '黑名单' },
      { key: 'fleet', label: 'fleet' },
      { key: 'strategies', label: '策略库' },
      { key: 'usage', label: '用量' },
      { key: 'cost', label: '性价比' },
      { key: 'workers', label: 'workers' },
      { key: 'funnel', label: '漏斗' },
      { key: 'gaps', label: '缺口' },
      { key: 'exp', label: '经验库' },
    ]
    function useModules() {
      const [off, setOff] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem('d2d-ops-modules-off') ?? '[]')) } catch { return new Set() }
      })
      const toggle = useCallback((key) => {
        setOff((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key); else next.add(key)
          try { localStorage.setItem('d2d-ops-modules-off', JSON.stringify([...next])) } catch {}
          return next
        })
      }, [])
      return { off, toggle }
    }

    function Skeleton({ rows = 4 }) {
      return h('div', panel.root, Style(),
        h('div', panel.card,
          Array.from({ length: rows }, (_, i) =>
            h('div', { key: i, className: 'd2d-skel', style: { height: '14px', borderRadius: '4px', background: 'var(--d2d-line)' } }))))
    }

    function FailClosedBanner({ err, onRetry }) {
      return h('div', panel.root, Style(),
        h('div', { ...panel.card, style: { ...panel.card.style, borderColor: 'var(--d2d-sev-high)' } },
          h('div', { style: { fontSize: '12px', fontWeight: 600 } }, '图服务不可达 · 轮询已暂停'),
          h('div', panel.muted(), 'fail-closed: 不展示过期快照'),
          h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.55', wordBreak: 'break-all' } }, String(err?.message ?? err)),
          h('button', { onClick: onRetry, style: { alignSelf: 'flex-start', marginTop: '2px' } }, '立即重试')))
    }

    function fmtAge(ms) {
      if (ms < 0 || !Number.isFinite(ms)) return '?'
      if (ms < 60000) return `${Math.floor(ms / 1000)}s`
      if (ms < 3600000) return `${Math.floor(ms / 60000)}m`
      return `${Math.floor(ms / 3600000)}h`
    }
    function fmtClock(iso) {
      const t = Date.parse(iso || '')
      if (!t) return '--:--'
      const d = new Date(t)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    function shortModel(m) {
      const s = String(m ?? '')
      const slash = s.indexOf('/')
      return slash >= 0 ? s.slice(slash + 1) : s
    }

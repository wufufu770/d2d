    // ══════════ ui.js — DSW 令牌样式 / 语义色 / 轮询 hook / 原语 ══════════
    const POLL_MS = 2000
    const SEMANTIC_CSS = [
      // 语义色(sev 五级/ring 五环)—— FindingCard 色轨/环徽章等语义面专用, B10 不动
      '.d2d-panel{--d2d-sev-critical:#e5484d;--d2d-sev-high:#f0773c;--d2d-sev-medium:#d8a021;--d2d-sev-low:#58a36a;--d2d-sev-info:#8e97a8;',
      '--d2d-ring-discovery:#4d6bfe;--d2d-ring-deep:#9b7bff;--d2d-ring-creative:#f5a623;--d2d-ring-verify:#2fb6a3;--d2d-ring-study:#8e97a8;',
      // B10-A 形态令牌层: DSW alias 恒首选, zinc 只作 fallback(宿主换主题面板跟随)
      '--d2d-bg-0:var(--dsw-alias-bg-base,#09090b);--d2d-bg-1:var(--dsw-alias-bg-layer-1,#131316);--d2d-bg-2:var(--dsw-alias-bg-layer-2,#1b1b1f);',
      '--d2d-text-hi:var(--dsw-alias-label-primary,#f4f4f5);--d2d-text-mid:var(--dsw-alias-label-secondary,#a1a1aa);--d2d-text-lo:var(--dsw-alias-label-tertiary,#6b6b74);',
      '--d2d-line:var(--dsw-alias-border-l,rgba(63,63,70,.55));--d2d-line-strong:rgba(82,82,91,.75);--d2d-brand:#4d6bfe;',
      // 四状态 tone 对色(bg/line=500 色系分量, 文字=400 色; mockup 对齐)
      '--d2d-ok:#34d399;--d2d-ok-bg:rgba(16,185,129,.1);--d2d-ok-line:rgba(16,185,129,.22);',
      '--d2d-warn:var(--dsw-alias-state-warn-primary,#fbbf24);--d2d-warn-bg:rgba(245,158,11,.1);--d2d-warn-line:rgba(245,158,11,.22);',
      '--d2d-danger:var(--dsw-alias-state-error-primary,#fb7185);--d2d-danger-bg:rgba(244,63,94,.1);--d2d-danger-line:rgba(244,63,94,.22);',
      '--d2d-info:#60a5fa;--d2d-info-bg:rgba(59,130,246,.1);--d2d-info-line:rgba(59,130,246,.22)}',
      // B10 行为类(内联 style 写不了 :hover —— hover/focus 态收敛此处; 白系透明=mockup 风格)
      '.d2d-formrow{transition:border-color .15s ease,background-color .15s ease,transform .15s ease}',
      '.d2d-formrow:hover{border-color:color-mix(in srgb,var(--d2d-text-hi) 16%,transparent);background:color-mix(in srgb,var(--d2d-text-hi) 3.5%,transparent)}',
      '.d2d-iconbtn{display:inline-flex;align-items:center;justify-content:center;border-radius:6px;opacity:.65;transition:opacity .15s ease,background-color .15s ease,color .15s ease}',
      '.d2d-iconbtn:hover{opacity:1;background:color-mix(in srgb,var(--d2d-text-hi) 8%,transparent)}',
      '.d2d-iconbtn[disabled]{opacity:.35;cursor:default}',
      '.d2d-tablerow{transition:background-color .12s ease;cursor:pointer}',
      '.d2d-tablerow:hover{background:color-mix(in srgb,var(--d2d-bg-1) 50%,transparent)}',
      '.d2d-codeid{font-family:var(--dsw-font-mono,monospace);font-size:10px;background:var(--d2d-bg-2);border:1px solid var(--d2d-line);border-radius:4px;padding:1px 5px;cursor:copy;display:inline-flex;align-items:center;gap:4px}',
      '.d2d-codeid:hover{border-color:color-mix(in srgb,var(--d2d-text-hi) 16%,transparent);color:var(--d2d-ok)}',
      '.d2d-pill:hover{filter:brightness(1.25)}',
      // B10 面板内滚动条(mockup 风格; 作用域限 .d2d-panel 后代不污染宿主)
      '.d2d-panel ::-webkit-scrollbar,.d2d-panel::-webkit-scrollbar{width:6px;height:6px}',
      '.d2d-panel ::-webkit-scrollbar-track,.d2d-panel::-webkit-scrollbar-track{background:transparent}',
      '.d2d-panel ::-webkit-scrollbar-thumb,.d2d-panel::-webkit-scrollbar-thumb{background:var(--d2d-bg-2);border-radius:9999px}',
      '.d2d-panel ::-webkit-scrollbar-thumb:hover,.d2d-panel::-webkit-scrollbar-thumb:hover{background:var(--d2d-line-strong)}',
      '@keyframes d2d-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '@keyframes d2d-shimmer{0%{opacity:.45}50%{opacity:.9}100%{opacity:.45}}',
      '@keyframes d2d-ping{75%,100%{transform:scale(2);opacity:0}}',
      '@keyframes d2d-fade-in{from{opacity:0}}',
      '@keyframes d2d-slide-in{from{transform:translateX(24px);opacity:0}}',
      '.d2d-panel button{cursor:pointer}',
      '@media (prefers-reduced-motion: no-preference){',
      '.d2d-dot-running{animation:d2d-pulse 2s ease-in-out infinite}',
      '.d2d-ping{animation:d2d-ping 1.6s cubic-bezier(0,0,.2,1) infinite}',
      '.d2d-skel{animation:d2d-shimmer 1.6s ease-in-out infinite}}',
    ].join('\n')

    const sevColor = (s) => `var(--d2d-sev-${String(s || 'info').toLowerCase()}, var(--d2d-sev-info))`
    const ringColor = (r) => `var(--d2d-ring-${String(r || '').toLowerCase()}, var(--d2d-sev-info))`

    const panel = {
      root: {
        className: 'd2d-panel',
        style: {
          background: 'var(--dsw-alias-bg-layer-1, transparent)', // 接入指南 §12.1: 面板表面唯一正确令牌
          color: 'inherit', font: 'inherit', padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          overflowY: 'auto', height: '100%', boxSizing: 'border-box', minWidth: 0,
        },
      },
      card: { style: { border: '1px solid color-mix(in srgb, var(--d2d-text-hi) 8%, transparent)', borderRadius: '12px', padding: '14px', display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0,
        background: 'color-mix(in srgb, var(--d2d-bg-1) 65%, transparent)', backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)' } },
      cardTitle: { style: { fontSize: '12px', fontWeight: 500, opacity: '.8', margin: 0 } },
      mono: { style: { fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', fontSize: '11px' } },
      muted: (o = 0.65) => ({ style: { opacity: String(o), fontSize: '11px' } }),
      chip: (extra = {}) => ({ style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--d2d-line)', borderRadius: '5px', padding: '1px 6px', fontSize: '11px', whiteSpace: 'nowrap', ...extra } }),
      // B10-A 五态半透明 badge(ok/warn/danger/info/neutral)——bg@10%+line@22% 对色
      chipTone: (tone, extra = {}) => {
        const t = { ok: ['--d2d-ok-bg', '--d2d-ok-line', '--d2d-ok'],
          warn: ['--d2d-warn-bg', '--d2d-warn-line', '--d2d-warn'],
          danger: ['--d2d-danger-bg', '--d2d-danger-line', '--d2d-danger'],
          info: ['--d2d-info-bg', '--d2d-info-line', '--d2d-info'] }[tone]
          ?? ['var(--d2d-bg-2)', '--d2d-line', '--d2d-text-mid']
        return { style: { display: 'inline-flex', alignItems: 'center', gap: '4px', background: `var(${t[0]})`, border: `1px solid var(${t[1]})`, color: `var(${t[2]})`, borderRadius: '5px', padding: '1px 7px', fontSize: '11px', whiteSpace: 'nowrap', ...extra } }
      },
      dot: (color, pulse) => ({ className: pulse ? 'd2d-dot-running' : undefined, style: { width: '7px', height: '7px', borderRadius: '50%', background: color, flex: '0 0 auto' } }),
      btn: (extra = {}) => ({ style: { fontSize: '11px', border: '1px solid var(--d2d-line)', borderRadius: '6px', padding: '3px 10px', background: 'var(--d2d-bg-2)', color: 'var(--d2d-text-mid)', whiteSpace: 'nowrap', ...extra } }),
      input: (extra = {}) => ({ style: { fontSize: '11px', border: '1px solid var(--d2d-line)', borderRadius: '6px', padding: '3px 8px', background: 'var(--d2d-bg-2)', color: 'var(--d2d-text-hi)', minWidth: 0, ...extra } }),
      rail: (color) => ({ style: { width: '3px', borderRadius: '2px', background: color, flex: '0 0 auto', alignSelf: 'stretch' } }),
    }

    function Style() { return h('style', null, SEMANTIC_CSS) }

    function Card({ title, children, extra, onClick, highlight, icon }) {
      return h('div', {
        ...panel.card,
        onClick,
        style: { ...panel.card.style, ...(onClick ? { cursor: 'pointer' } : {}), ...(highlight ? { borderColor: 'var(--d2d-brand)' } : {}) },
      },
        title ? h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '6px', borderBottom: '1px solid var(--d2d-line)', paddingBottom: '8px' } },
          h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px', ...panel.cardTitle.style } },
            icon ? h(TabIcon, { name: icon, size: 15 }) : null, title),
          extra ?? null) : null,
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
      { key: 'frontier', label: '前沿池' },
    ]
    function useModules() {
      const [off, setOff] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem('d2d-ops-modules-off') ?? '[]')) } catch { return new Set() }
      })
      const toggle = useCallback((key) => {
        setOff((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key); else next.add(key)
          try { localStorage.setItem('d2d-ops-modules-off', JSON.stringify([...next])) } catch { /* 已记因: 降级路径——localStorage 不可用时模块开关仅内存态生效 */ }
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
          h('div', { style: { fontSize: '12px', fontWeight: 600 } }, '图服务不可达'),
          h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.55', wordBreak: 'break-all' } }, String(err?.message ?? err)),
          h('button', { onClick: onRetry, style: { alignSelf: 'flex-start', marginTop: '2px' } }, '重试')))
    }

    // ── B10 内联图标(lucide 路径数据内联, 零依赖纪律; 与 PanelIcon 同壳) ──
    function _iconShell(size, children) {
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, children)
    }
    function IconSave(p) { return _iconShell(p?.size ?? 14, h('path', { d: 'M20 6 9 17l-5-5' })) }
    function IconTrash(p) { return _iconShell(p?.size ?? 14, h('path', { d: 'M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' })) }
    function IconSearch(p) { return _iconShell(p?.size ?? 14, [h('circle', { cx: 11, cy: 11, r: 8 }), h('path', { d: 'm21 21-4.35-4.35' })]) }
    function IconCopy(p) { return _iconShell(p?.size ?? 14, [h('rect', { x: 9, y: 9, width: 13, height: 13, rx: 2, ry: 2 }), h('path', { d: 'M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1' })]) }
    function IconChevron(p) { return _iconShell(p?.size ?? 16, h('path', { d: 'M9 5l7 7-7 7' })) }
    function IconX(p) { return _iconShell(p?.size ?? 16, h('path', { d: 'M18 6 6 18M6 6l12 12' })) }
    function IconPlus(p) { return _iconShell(p?.size ?? 14, h('path', { d: 'M12 5v14M5 12h14' })) }
    function IconJson(p) { return _iconShell(p?.size ?? 15, [h('path', { d: 'M10 4.5 6 12l4 7.5M14 4.5l4 7.5-4 7.5' })]) }

    // B10 页签/卡头图标(mockup: layout-dashboard/user-check/shield-alert/activity/file-check/git-merge/terminal/history/sliders/cpu)
    function TabIcon({ name, size = 14 }) {
      const P = (d) => h('path', { d })
      const paths = {
        dashboard: [h('rect', { x: 3, y: 3, width: 7, height: 9, rx: 1 }), h('rect', { x: 14, y: 3, width: 7, height: 5, rx: 1 }), h('rect', { x: 14, y: 12, width: 7, height: 9, rx: 1 }), h('rect', { x: 3, y: 16, width: 7, height: 5, rx: 1 })],
        usercheck: [P('M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2'), h('circle', { cx: 9, cy: 7, r: 4 }), P('m16 11 2 2 4-4')],
        shield: [P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'), P('M12 8v4M12 16h.01')],
        activity: [P('M22 12h-4l-3 9L9 3l-3 9H2')],
        filecheck: [P('M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7z'), P('M14 2v4a2 2 0 0 0 2 2h4'), P('m9 15 2 2 4-4')],
        merge: [h('circle', { cx: 18, cy: 18, r: 3 }), h('circle', { cx: 6, cy: 6, r: 3 }), P('M6 21V9a9 9 0 0 0 9 9')],
        terminal: [P('m4 17 6-6-6-6'), P('M12 19h8')],
        history: [P('M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8'), P('M3 3v5h5'), P('M12 7v5l4 2')],
        sliders: [h('line', { x1: 21, y1: 4, x2: 14, y2: 4 }), h('line', { x1: 10, y1: 4, x2: 3, y2: 4 }), h('line', { x1: 21, y1: 12, x2: 12, y2: 12 }), h('line', { x1: 8, y1: 12, x2: 3, y2: 12 }), h('line', { x1: 21, y1: 20, x2: 16, y2: 20 }), h('line', { x1: 12, y1: 20, x2: 3, y2: 20 }), h('line', { x1: 14, y1: 2, x2: 14, y2: 6 }), h('line', { x1: 8, y1: 10, x2: 8, y2: 14 }), h('line', { x1: 16, y1: 18, x2: 16, y2: 22 })],
        cpu: [h('rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }), h('rect', { x: 9, y: 9, width: 6, height: 6 }), P('M15 2v2M15 20v2M2 15h2M2 9h2M20 15h2M20 9h2M9 2v2M9 20v2')],
        folder: [P('M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16')],
        shieldban: [P('M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10'), P('m9.5 9.5 5 5M14.5 9.5l-5 5')],
        book: [P('M4 19.5A2.5 2.5 0 0 1 6.5 17H20'), P('M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z')],
        filter: [h('polygon', { points: '22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3' })],
        chart: [h('line', { x1: 12, y1: 20, x2: 12, y2: 10 }), h('line', { x1: 18, y1: 20, x2: 18, y2: 4 }), h('line', { x1: 6, y1: 20, x2: 6, y2: 16 })],
        box: [P('M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z'), P('m3.3 7 8.7 5 8.7-5M12 22V12')],
      }
      return _iconShell(size, paths[name] ?? paths.box)
    }

    // ── B10 DetailSheet 侧滑抽屉(mockup 风格; fixed 相对 viewport 不受 overflowY 裁切——
    // 面板祖先无 transform, 免 portal/react-dom 依赖; 内容=打开时刻快照, append-only 日志
    // 语义下快照即终值) ──
    function DetailSheet({ item, onClose, title }) {
      useEffect(() => {
        if (!item) return undefined
        const onKey = (ev) => { if (ev.key === 'Escape') onClose() }
        window.addEventListener('keydown', onKey)
        return () => window.removeEventListener('keydown', onKey)
      }, [item, onClose])
      if (!item) return null
      const json = JSON.stringify(item, null, 2)
      const copy = () => { try { navigator.clipboard?.writeText(json).catch(() => { /* 拒绝静默 */ }) } catch { /* 无 API 静默 */ } }
      return h('div', {
        className: 'd2d-panel',
        style: { position: 'fixed', inset: '0', zIndex: 50, background: 'rgba(0,0,0,.6)',
          display: 'flex', justifyContent: 'flex-end', animation: 'd2d-fade-in .18s ease' },
        onClick: onClose },
        h('div', { role: 'dialog', 'aria-modal': true, onClick: (ev) => ev.stopPropagation(),
          style: { width: '440px', maxWidth: '92vw', height: '100%', display: 'flex', flexDirection: 'column',
            background: 'var(--d2d-bg-0)', borderLeft: '1px solid var(--d2d-line)',
            boxShadow: '-24px 0 48px rgba(0,0,0,.45)', animation: 'd2d-slide-in .2s ease', boxSizing: 'border-box' } },
          h('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--d2d-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--d2d-bg-1)', flex: '0 0 auto' } },
            h('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '8px', fontWeight: 600, fontSize: '13px', color: 'var(--d2d-text-hi)', ...panel.mono.style } },
              h(IconJson, { size: 15 }), title ?? 'Event Detail'),
            h('button', { className: 'd2d-iconbtn', autoFocus: true, title: '关闭(Esc)', onClick: onClose,
              style: { width: '26px', height: '26px', border: 'none', background: 'transparent', color: 'var(--d2d-text-mid)' } }, h(IconX, { size: 15 }))),
          h('div', { style: { flex: 1, padding: '14px 16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px', minHeight: 0 } },
            h('button', { ...panel.btn(), onClick: copy,
              style: { ...panel.btn().style, alignSelf: 'flex-start', display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--d2d-ok)' } },
              h(IconCopy, { size: 12 }), 'Copy JSON'),
            h('pre', { ...panel.mono, style: { ...panel.mono.style, fontSize: '11px', lineHeight: 1.6,
              whiteSpace: 'pre-wrap', wordBreak: 'break-all', background: 'var(--d2d-bg-1)',
              border: '1px solid var(--d2d-line)', borderRadius: '8px', padding: '10px',
              margin: 0, color: 'var(--d2d-text-mid)' } }, json)),
          h('div', { style: { padding: '12px 16px', borderTop: '1px solid var(--d2d-line)', display: 'flex', justifyContent: 'flex-end', background: 'var(--d2d-bg-1)', flex: '0 0 auto' } },
            h('button', { ...panel.btn(), onClick: onClose }, '关闭 (Esc)'))))
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

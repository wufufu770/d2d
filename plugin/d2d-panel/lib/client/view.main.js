    // ══════════ view.main.js — d2d 工作台(1.6.0 Phase C 全页 + E38 DSW 工作台重构) ══════════
    // 形态: dsh workspace 主面板全页 = App Bar(品牌+KPI 带) + 分段控件页签 + 画布容器。
    // 风格=DeepSeek Harness 设计语言: 全程 --dsw-alias-*/--dsw-font-* 令牌(与 better-sidebar
    // 同源, grep 实证 top 令牌族), 零硬编码色值(语义色沿用 d2d panel 自有 CSS 变量)。
    // 工作台交互: KPI chip 即导航(点「待人工」跳待人工页)——"只显示需要人的事项"优先原则。
    const MAIN_TABS = [
      { id: 'ops', label: '态势', comp: OpsView, badge: () => badgeState.workers, icon: 'dashboard' },
      { id: 'workitems', label: '待人工', comp: WorkItemsView, kpi: 'wi', icon: 'usercheck' },
      { id: 'findings', label: 'Findings', comp: FindingsView, badge: () => badgeState.verified, icon: 'shield' },
      { id: 'viz', label: '可视化', comp: VizView, icon: 'activity' },
      { id: 'approval', label: '审批', comp: ApprovalView, badge: () => badgeState.approvals, icon: 'filecheck' },
      { id: 'chain', label: '链路', comp: ChainView, icon: 'merge' },
      { id: 'tools', label: '工具', comp: ToolsView, icon: 'terminal' },
      { id: 'audit', label: '审计', comp: AuditView, icon: 'history' },
      { id: 'config', label: '配置', comp: ConfigView, icon: 'sliders' },
      { id: 'xring', label: 'XRing', comp: XRingView, icon: 'cpu' },
    ]

    function PanelIcon(props) {
      const size = props?.size ?? 18
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('circle', { cx: 12, cy: 12, r: 8 }),
        h('circle', { cx: 12, cy: 12, r: 3.5 }),
        h('path', { d: 'M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4' }))
    }

    const WB = {
      bar: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--d2d-bg-1)', borderBottom: '1px solid var(--d2d-line)', flexWrap: 'wrap' },
      brand: { fontWeight: 600, letterSpacing: '.02em', fontSize: 'var(--dsw-font-xs-13, 13px)', color: 'var(--d2d-text-hi)', display: 'flex', alignItems: 'center', gap: '7px', flex: '0 0 auto' },
      // B10 ping 双圈状态点(mockup: 外圈扩散+实心内圈); LIVE pill 消费 badge-ok 对色
      live: (on) => ({ className: on ? 'd2d-ping' : undefined, style: { position: 'absolute', inset: 0, borderRadius: '50%', background: on ? 'var(--d2d-ok)' : 'transparent', opacity: on ? .75 : 0 } }),
      liveCore: (on) => ({ style: { position: 'relative', display: 'inline-flex', width: '10px', height: '10px', borderRadius: '50%', background: on ? 'var(--d2d-ok)' : 'var(--d2d-text-lo)', flex: '0 0 auto' } }),
      // B10 KPI 容器统一 neutral(mockup: zinc-900 底+彩色数值)
      kpi: {
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '6px',
        border: '1px solid var(--d2d-line)', background: 'var(--d2d-bg-1)', color: 'var(--d2d-text-mid)',
        fontSize: 'var(--dsw-font-xxs-11, 11px)', cursor: 'pointer', whiteSpace: 'nowrap',
      },
      kpiVal: (tone) => ({ fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: `var(--d2d-${{ ok: 'ok', danger: 'danger', warn: 'warn', info: 'info' }[tone] ?? 'text-mid'})` }),
      // B10 tab: 底部 2px 线激活=emerald(mockup border-emerald-500)+激活底 zinc-900/40+图标
      tab: (on) => ({
        padding: '9px 14px', fontSize: 'var(--dsw-font-xxs-12, 12px)', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
        border: 'none', borderBottom: `2px solid ${on ? 'var(--d2d-ok)' : 'transparent'}`,
        background: on ? 'color-mix(in srgb, var(--d2d-bg-1) 40%, transparent)' : 'transparent', borderRadius: 0,
        color: on ? 'var(--d2d-text-hi)' : 'var(--d2d-text-mid)',
      }),
      canvas: { flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--dsw-alias-bg-base, transparent)', padding: '10px 14px' },
    }

    /** KPI 轮询: WorkItems 摘要(待人工+影子)独立 6s 档 — 与页签内 4s 轮询互不牵动。 */
    function useWiSummary(visible) {
      const [s, setS] = useState(null)
      useEffect(() => {
        if (!visible) return undefined
        let alive = true
        const load = () => { fetchApi('workitems').then((j) => { if (alive) setS(j?.summary ?? null) }).catch(() => {}) }
        load()
        const t = setInterval(load, 6000)
        return () => { alive = false; clearInterval(t) }
      }, [visible])
      return s
    }

    function MainPanelView() {
      const [active, setActive] = useState('ops')
      const wi = useWiSummary(true)
      const tab = MAIN_TABS.find((t) => t.id === active) ?? MAIN_TABS[0]
      const badge = (t) => { try { const v = t.badge?.(); return v == null ? null : v } catch { return null } }
      const wiPending = (wi?.needs_human ?? 0) + (wi?.shadowed ?? 0)
      // E39-B5-3: KPI 分显细化——待人工(needs_human)与影子(shadowed)分色分显(注意力优先序)
      const kpis = [
        { id: 'ops', label: '在办', val: badgeState.workers, tone: 'ok' },
        { id: 'workitems', label: '待人工', val: wi?.needs_human || 0, tone: 'danger' },
        { id: 'workitems', label: '影子', val: wi?.shadowed || 0, tone: 'neutral' },
        { id: 'findings', label: 'Findings', val: badgeState.verified, tone: 'info' },
        { id: 'approval', label: '审批', val: badgeState.approvals, tone: 'warn' },
      ]
      return h('div', {
        className: 'd2d-panel d2d-main',
        style: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', font: 'inherit' },
      },
        Style(),
        // App Bar: 品牌(ping 双圈+LIVE pill) + 工作台 KPI 带(彩色数值 — 点击直达对应页签)
        h('div', { style: WB.bar },
          h('span', { style: WB.brand },
            h('span', { style: { position: 'relative', display: 'inline-flex', width: '10px', height: '10px', flex: '0 0 auto' } },
              h('span', WB.live(badgeState.workers > 0)),
              h('span', WB.liveCore(badgeState.workers > 0))),
            PanelIcon({ size: 17 }), 'd2d',
            h('span', { ...panel.chipTone(badgeState.workers > 0 ? 'ok' : 'neutral'), style: { ...panel.chipTone(badgeState.workers > 0 ? 'ok' : 'neutral').style, borderRadius: '999px', fontFamily: 'var(--dsw-font-mono, monospace)', marginLeft: '2px' } },
              badgeState.workers > 0 ? `LIVE · ${badgeState.workers} Workers` : 'IDLE')),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, minWidth: 0, justifyContent: 'flex-end' } },
            kpis.map((k) => h('button', {
              key: k.label, style: WB.kpi, onClick: () => setActive(k.id), title: `查看${k.label}`,
            }, k.label, h('b', { style: WB.kpiVal(k.tone) }, k.val == null ? '—' : String(k.val)))))),
        // 底线页签行(B10: 图标+文字, 激活=emerald 底线+微底色)
        h('div', { style: { display: 'flex', gap: '2px', alignItems: 'center', padding: '0 14px', overflowX: 'auto', borderBottom: '1px solid var(--d2d-line)', background: 'var(--d2d-bg-1)' } },
          MAIN_TABS.map((t) => {
            const b = badge(t)
            const on = t.id === active
            return h('button', {
              key: t.id, style: { ...WB.tab(on), flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }, onClick: () => setActive(t.id),
            }, h(TabIcon, { name: t.icon, size: 13 }), t.label,
              b != null && b > 0 ? h('span', { style: { marginLeft: '2px', display: 'inline-flex', minWidth: '15px', height: '15px', padding: '0 3px', borderRadius: '999px', background: 'var(--d2d-danger-bg)', border: '1px solid var(--d2d-danger-line)', color: 'var(--d2d-danger)', fontSize: '9px', alignItems: 'center', justifyContent: 'center' } }, b > 99 ? '99+' : b) : null)
          })),
        // 画布: 仅挂激活视图(visible=true 驱动轮询; 未激活不占请求与注意力)
        h('div', { style: WB.canvas },
          h('div', { style: { maxWidth: '1700px', margin: '0 auto' } },
            h(tab.comp, { visible: true, key: tab.id }))))
    }

    // ══════════ d2d 图谱独立页(E39 用户需求): 星图/热力/泳道直开不经工作台页签 ══════════
    // 独立 main 槽位(sidebar.panellist 第二入口)——VizView 同一组件(轮询/护栏/Style 全复用),
    // 仅容器形态不同: 全宽画布去 1280 居中限宽, 图看的是面不是列。
    function GraphIcon(props) {
      const size = props?.size ?? 18
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('circle', { cx: 6, cy: 6, r: 2.5 }),
        h('circle', { cx: 18, cy: 5, r: 2.5 }),
        h('circle', { cx: 12, cy: 13, r: 2.5 }),
        h('circle', { cx: 5, cy: 19, r: 2.5 }),
        h('circle', { cx: 19, cy: 18, r: 2.5 }),
        h('path', { d: 'M7.8 7.4 10.3 11.1M16.3 6.9 13.7 11.2M9.8 14.2 6.9 17.4M14.2 14.3 17.3 16.9M8.5 6 15.5 5.4' }))
    }

    function GraphPageView() {
      return h('div', {
        className: 'd2d-panel d2d-graph',
        style: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', font: 'inherit' },
      },
        Style(),
        h('div', { style: WB.bar },
          h('span', { style: WB.brand }, GraphIcon({ size: 17 }), 'd2d 图谱')),
        h('div', { style: { ...WB.canvas, padding: '12px 14px' } },
          h(VizView, { visible: true })))
    }

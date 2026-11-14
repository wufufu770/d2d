    // ══════════ view.main.js — d2d 工作台(1.6.0 Phase C 全页 + E38 DSW 工作台重构) ══════════
    // 形态: dsh workspace 主面板全页 = App Bar(品牌+KPI 带) + 分段控件页签 + 画布容器。
    // 风格=DeepSeek Harness 设计语言: 全程 --dsw-alias-*/--dsw-font-* 令牌(与 better-sidebar
    // 同源, grep 实证 top 令牌族), 零硬编码色值(语义色沿用 d2d panel 自有 CSS 变量)。
    // 工作台交互: KPI chip 即导航(点「待人工」跳待人工页)——"只显示需要人的事项"优先原则。
    const MAIN_TABS = [
      { id: 'ops', label: '态势', comp: OpsView, badge: () => badgeState.workers },
      { id: 'workitems', label: '待人工', comp: WorkItemsView, kpi: 'wi' },
      { id: 'findings', label: 'Findings', comp: FindingsView, badge: () => badgeState.verified },
      { id: 'viz', label: '可视化', comp: VizView },
      { id: 'approval', label: '审批', comp: ApprovalView, badge: () => badgeState.approvals },
      { id: 'chain', label: '链路', comp: ChainView },
      { id: 'tools', label: '工具', comp: ToolsView },
      { id: 'audit', label: '审计', comp: AuditView },
      { id: 'config', label: '配置', comp: ConfigView },
      { id: 'xring', label: 'XRing', comp: XRingView },
    ]

    function PanelIcon(props) {
      const size = props?.size ?? 18
      return h('svg', { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true },
        h('circle', { cx: 12, cy: 12, r: 8 }),
        h('circle', { cx: 12, cy: 12, r: 3.5 }),
        h('path', { d: 'M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4' }))
    }

    const WB = {
      bar: { display: 'flex', alignItems: 'center', gap: '10px', padding: '8px 14px', background: 'var(--dsw-alias-bg-layer-2, var(--dsw-alias-bg-layer-1, transparent))', borderBottom: '1px solid var(--dsw-alias-border-l, var(--d2d-line))', flexWrap: 'wrap' },
      brand: { fontWeight: 600, letterSpacing: '.02em', fontSize: 'var(--dsw-font-xs-13, 13px)', color: 'var(--dsw-alias-label-primary, inherit)', display: 'flex', alignItems: 'center', gap: '7px', flex: '0 0 auto' },
      kpi: (accent) => ({
        display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', borderRadius: '999px',
        border: `1px solid ${accent === 'high' ? 'var(--dsw-alias-state-error-primary, var(--d2d-sev-high))' : accent === 'warn' ? 'var(--dsw-alias-state-warn-primary, var(--d2d-warn))' : 'var(--dsw-alias-border-l, var(--d2d-line))'}`,
        background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'var(--dsw-alias-label-secondary, inherit)',
        fontSize: 'var(--dsw-font-xxxs-11, 11px)', cursor: 'pointer', whiteSpace: 'nowrap',
      }),
      kpiVal: { fontWeight: 600, color: 'var(--dsw-alias-label-primary, inherit)', fontVariantNumeric: 'tabular-nums' },
      tab: (on) => ({
        padding: '4px 14px', borderRadius: '999px', fontSize: 'var(--dsw-font-xxs-12, 12px)', cursor: 'pointer', whiteSpace: 'nowrap',
        border: `1px solid ${on ? 'var(--dsw-alias-interactive-bg-hover-accent, var(--d2d-brand))' : 'transparent'}`,
        background: on ? 'var(--dsw-alias-interactive-bg-hover-accent, var(--d2d-brand))' : 'transparent',
        color: on ? 'var(--dsw-alias-label-primary, #fff)' : 'var(--dsw-alias-label-tertiary, inherit)',
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
        { id: 'ops', label: '在办', val: badgeState.workers },
        { id: 'workitems', label: '待人工', val: wi?.needs_human || null, accent: wi?.needs_human ? 'high' : undefined },
        { id: 'workitems', label: '影子', val: wi?.shadowed || null, accent: wi?.shadowed ? 'warn' : undefined },
        { id: 'findings', label: 'Findings', val: badgeState.verified },
        { id: 'approval', label: '审批', val: badgeState.approvals, accent: badgeState.approvals ? 'warn' : undefined },
      ]
      return h('div', {
        className: 'd2d-panel d2d-main',
        style: { display: 'flex', flexDirection: 'column', height: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', font: 'inherit' },
      },
        Style(),
        // App Bar: 品牌 + 工作台 KPI 带(chip 即导航 — 点击直达对应页签)
        // E39-B7-2: 砍"影子 on"chip(次要标签——影子状态在待人工页 summary 分显已可见)
        h('div', { style: WB.bar },
          h('span', { style: WB.brand }, PanelIcon({ size: 17 }), 'd2d'),
          h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', flex: 1, minWidth: 0, justifyContent: 'flex-end' } },
            kpis.map((k) => h('button', {
              key: k.id, style: WB.kpi(k.accent), onClick: () => setActive(k.id), title: `查看${k.label}`,
            }, k.label, h('b', { style: WB.kpiVal }, k.val == null ? '—' : String(k.val)))))),
        // 分段控件页签行
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '7px 14px', overflowX: 'auto', borderBottom: '1px solid var(--dsw-alias-border-l, var(--d2d-line))' } },
          MAIN_TABS.map((t) => {
            const b = badge(t)
            const on = t.id === active
            return h('button', {
              key: t.id, style: { ...WB.tab(on), flex: '0 0 auto' }, onClick: () => setActive(t.id),
            }, t.label,
              b != null && b > 0 ? h('span', { style: { marginLeft: '6px', display: 'inline-flex', minWidth: '15px', height: '15px', padding: '0 3px', borderRadius: '999px', background: 'var(--dsw-alias-state-error-primary, var(--d2d-brand))', color: '#fff', fontSize: '9px', alignItems: 'center', justifyContent: 'center' } }, b > 99 ? '99+' : b) : null)
          })),
        // 画布: 仅挂激活视图(visible=true 驱动轮询; 未激活不占请求与注意力)
        h('div', { style: WB.canvas },
          h('div', { style: { maxWidth: '1280px', margin: '0 auto' } },
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

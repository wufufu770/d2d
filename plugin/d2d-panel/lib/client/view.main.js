    // ══════════ view.main.js — d2d 工作台(1.6.0 Phase C 全页 + E38 DSW 工作台重构) ══════════
    // 形态: dsh workspace 主面板全页 = App Bar(品牌+KPI 带) + 分段控件页签 + 画布容器。
    // 风格=DeepSeek Harness 设计语言: 全程 --dsw-alias-*/--dsw-font-* 令牌(与 better-sidebar
    // 同源, grep 实证 top 令牌族), 零硬编码色值(语义色沿用 d2d panel 自有 CSS 变量)。
    // 工作台交互: KPI chip 即导航(点「待人工」跳待人工页)——"只显示需要人的事项"优先原则。
    // B12: hash 路由(#d2d?tab=..&k=v) + 三层分组导航(Operations/Triage & Viz/System 两行)。

    // B12 三层分组(信息架构: 运行操作 / 分诊与可视化 / 系统)
    const NAV_GROUPS = [
      { id: 'ops', label: '运行' },
      { id: 'triage', label: '分诊' },
      { id: 'system', label: '系统' },
    ]
    const MAIN_TABS = [
      { id: 'ops', label: '态势', comp: OpsView, badge: (b) => b.workers, icon: 'dashboard', group: 'ops' },
      { id: 'workitems', label: '待人工', comp: WorkItemsView, kpi: 'wi', icon: 'usercheck', group: 'ops' },
      { id: 'findings', label: 'Findings', comp: FindingsView, badge: (b) => b.verified, icon: 'shield', group: 'triage' },
      { id: 'viz', label: '可视化', comp: VizView, icon: 'activity', group: 'triage' },
      { id: 'approval', label: '审批', comp: ApprovalView, badge: (b) => b.approvals, icon: 'filecheck', group: 'triage' },
      { id: 'chain', label: '链路', comp: ChainView, icon: 'merge', group: 'ops' },
      { id: 'tools', label: '工具', comp: ToolsView, icon: 'terminal', group: 'system' },
      { id: 'audit', label: '审计', comp: AuditView, icon: 'history', group: 'system' },
      { id: 'config', label: '配置', comp: ConfigView, icon: 'sliders', group: 'system' },
      { id: 'xring', label: 'XRing', comp: XRingView, icon: 'cpu', group: 'ops' },
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
      // B13 KPI 数据卡(参考: 顶部中央圆角矩形概览卡——图标+大数字+标签)
      kpi: {
        display: 'inline-flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderRadius: '12px',
        border: '1px solid var(--d2d-line)', background: 'var(--d2d-bg-1)', cursor: 'pointer', whiteSpace: 'nowrap',
      },
      kpiIconBox: (tone) => ({ width: '34px', height: '34px', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        background: `var(--d2d-${{ ok: 'ok', danger: 'danger', warn: 'warn', info: 'info' }[tone] ?? 'info'}-bg)`,
        color: `var(--d2d-${{ ok: 'ok', danger: 'danger', warn: 'warn', info: 'info' }[tone] ?? 'info'})`, flex: '0 0 auto' }),
      // E40-C1: KPI 数字 clamp — 窄槽(viewport 小)自动降字号, 宽槽保持 20px 大数字
      kpiNum: (tone) => ({ fontSize: 'clamp(15px, 1.6vw, 20px)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', lineHeight: 1, color: 'var(--d2d-text-hi)' }),
      kpiLabel: { fontSize: '11px', color: 'var(--d2d-text-mid)', marginTop: '2px' },
      // B10 tab: 底部 2px 线激活=emerald(mockup border-emerald-500)+激活底 zinc-900/40+图标
      tab: (on) => ({
        padding: '9px 14px', fontSize: 'var(--dsw-font-xxs-12, 12px)', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap',
        border: 'none', borderBottom: `2px solid ${on ? 'var(--d2d-ok)' : 'transparent'}`,
        background: on ? 'color-mix(in srgb, var(--d2d-bg-1) 40%, transparent)' : 'transparent', borderRadius: 0,
        color: on ? 'var(--d2d-text-hi)' : 'var(--d2d-text-mid)',
      }),
      canvas: { flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--dsw-alias-bg-base, transparent)', padding: '10px 14px' },
    }

    /** KPI 轮询: WorkItems 摘要(待人工+影子)独立 6s 档 — 与页签内 4s 轮询互不牵动。
     *  B11: setTimeout 链式(不堆积) + AbortSignal 接线 + 错误态上浮(不再静默吞错)。 */
    function useWiSummary(visible) {
      const [s, setS] = useState(null)
      const [err, setErr] = useState(null)
      useEffect(() => {
        if (!visible) return undefined
        const ac = new AbortController()
        let alive = true
        let t = null
        const load = async () => {
          try {
            const j = await fetchApi('workitems', { signal: ac.signal })
            if (alive) { setS(j?.summary ?? null); setErr(null) }
          } catch (e) {
            if (alive && e?.name !== 'AbortError') setErr(e)
          } finally {
            if (alive && !ac.signal.aborted) t = setTimeout(load, 6000)
          }
        }
        void load()
        return () => { alive = false; ac.abort(); if (t) clearTimeout(t) }
      }, [visible])
      return { summary: s, err }
    }

    function MainPanelView() {
      const validIds = MAIN_TABS.map((t) => t.id)
      const { tab: active, params: routeParams, navigate } = useD2dRoute(validIds, 'ops')
      const [badges, setBadges] = useState(() => ({ ...badgeState }))
      useEffect(() => subscribeBadges(setBadges), [])
      const { summary: wi, err: wiErr } = useWiSummary(true)
      const tab = MAIN_TABS.find((t) => t.id === active) ?? MAIN_TABS[0]
      const badge = (t) => { try { const v = t.badge?.(badges); return v == null ? null : v } catch { return null } }
      const activeGroup = tab.group ?? 'ops'
      const groupTabs = MAIN_TABS.filter((t) => (t.group ?? 'ops') === activeGroup)
      // E44 清理: wiPending 死变量退役(KPI 分显后待人工/影子分列直读, 合计不再需要)
      // E39-B5-3: KPI 分显细化——待人工(needs_human)与影子(shadowed)分色分显(注意力优先序)
      const kpis = [
        { id: 'ops', label: '在办', val: badges.workers, tone: 'ok', icon: 'cpu' },
        { id: 'workitems', label: '待人工', val: wi?.needs_human || 0, tone: 'danger', icon: 'usercheck' },
        { id: 'findings', label: 'Findings', val: badges.verified, tone: 'info', icon: 'shield' },
        { id: 'approval', label: '审批', val: badges.approvals, tone: 'warn', icon: 'filecheck' },
      ]
      // ── E40 修: 渲染尾段显式命名组装(原内联四层嵌套曾因闭合层数错位把 canvas 塞进 nav
      // 包裹层 → nav 被 2500px 画布垂直居中推到页中 + 整页 2722px 溢出被宿主 overflow:hidden
      // 裁掉 = 右半列+不能下滑)。每段单一语句, 结构错误局部化不可能静默错挂层级。
      const brandPill = h('span', { style: WB.brand },
        h('span', { style: { position: 'relative', display: 'inline-flex', width: '10px', height: '10px', flex: '0 0 auto' } },
          h('span', WB.live(badges.workers > 0)),
          h('span', WB.liveCore(badges.workers > 0))),
        PanelIcon({ size: 17 }), 'd2d',
        h('span', { ...panel.chipTone(badges.workers > 0 ? 'ok' : 'neutral'), style: { ...panel.chipTone(badges.workers > 0 ? 'ok' : 'neutral').style, borderRadius: '999px', fontFamily: 'var(--dsw-font-mono, monospace)', marginLeft: '2px' } },
          badges.workers > 0 ? `LIVE · ${badges.workers} Workers` : 'IDLE'),
        wiErr ? h('span', { ...panel.chipTone('danger'), title: String(wiErr?.message ?? wiErr).slice(0, 120), style: { ...panel.chipTone('danger').style, borderRadius: '999px', fontFamily: 'var(--dsw-font-mono, monospace)', marginLeft: '2px' } }, 'LINK DOWN') : null)
      const kpiBand = h('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', flex: 1, minWidth: 0, justifyContent: 'center' } },
        kpis.map((k) => h('button', {
          key: k.label, style: WB.kpi, onClick: () => navigate(k.id), title: `查看${k.label}`,
        },
          h('span', WB.kpiIconBox(k.tone), h(TabIcon, { name: k.icon, size: 17 })),
          h('span', { style: { display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start' } },
            h('span', WB.kpiNum(k.tone), k.val == null ? '—' : String(k.val)),
            h('span', WB.kpiLabel, k.label)))))
      const rightSide = h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flex: '0 0 auto' } },
        h('a', { href: 'https://github.com/wufufu770/d2d', target: '_blank', rel: 'noreferrer', title: 'GitHub — wufufu770/d2d',
          style: { display: 'inline-flex', alignItems: 'center', gap: '5px', color: 'var(--d2d-text-mid)', textDecoration: 'none', fontSize: '11px', border: '1px solid var(--d2d-line)', borderRadius: '999px', padding: '3px 10px', background: 'var(--d2d-bg-1)' } },
          h(IconGithub, { size: 14 }), 'wufufu770/d2d'),
        h('span', { title: 'd2d 操作员', style: { display: 'inline-flex', width: '28px', height: '28px', borderRadius: '50%', background: 'var(--d2d-bg-2)', border: '1px solid var(--d2d-line)', alignItems: 'center', justifyContent: 'center', color: 'var(--d2d-text-mid)' } }, h(TabIcon, { name: 'usercheck', size: 15 })))
      const appBar = h('div', { style: WB.bar }, brandPill, kpiBand, rightSide)
      // 两行导航(B12): Row2 = 组切换(三层) + 组内子页签(仅激活组)
      const navRow = h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', padding: '6px 14px', borderBottom: '1px solid var(--d2d-line)', background: 'var(--d2d-bg-1)', flexWrap: 'wrap' } },
        h('div', { style: { display: 'flex', gap: '4px', flex: '0 0 auto' } },
          NAV_GROUPS.map((g) => h('button', {
            key: g.id,
            onClick: () => navigate((MAIN_TABS.find((t) => (t.group ?? 'ops') === g.id) ?? MAIN_TABS[0]).id),
            style: { ...panel.btn({ fontWeight: g.id === activeGroup ? '600' : '400',
              borderColor: g.id === activeGroup ? 'var(--d2d-info)' : 'var(--d2d-line)',
              color: g.id === activeGroup ? 'var(--d2d-text-hi)' : 'var(--d2d-text-mid)' }).style, fontSize: '11px' },
          }, g.label))),
        h('div', { style: { display: 'flex', gap: '2px', alignItems: 'center', overflowX: 'auto', flex: 1, minWidth: 0 } },
          groupTabs.map((t) => {
            const b = badge(t)
            const on = t.id === active
            return h('button', {
              key: t.id, style: { ...WB.tab(on), flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: '6px' }, onClick: () => navigate(t.id),
            }, h(TabIcon, { name: t.icon, size: 13 }), t.label,
              b != null && b > 0 ? h('span', { style: { marginLeft: '2px', display: 'inline-flex', minWidth: '15px', height: '15px', padding: '0 3px', borderRadius: '999px', background: 'var(--d2d-danger-bg)', border: '1px solid var(--2d-danger-line)', color: 'var(--d2d-danger)', fontSize: '9px', alignItems: 'center', justifyContent: 'center' } }, b > 99 ? '99+' : b) : null)
          })))
      // 画布: 仅挂激活视图(visible=true 驱动轮询; 未激活不占请求与注意力)。
      // B12: 透传 navigate/routeParams(跨页过滤——桑基节点→findings state 筛选)。
      const canvas = h('div', { style: WB.canvas },
        h('div', { style: { maxWidth: '1700px', margin: '0 auto' } },
          h(tab.comp, { visible: true, key: tab.id, navigate, routeParams })))
      return h('div', {
        className: 'd2d-panel d2d-main',
        style: { display: 'flex', flexDirection: 'column', height: '100%', width: '100%', minWidth: 0, boxSizing: 'border-box', background: 'var(--dsw-alias-bg-layer-1, transparent)', color: 'var(--dsw-alias-label-primary, inherit)', font: 'inherit' },
      },
        Style(),
        appBar,
        navRow,
        canvas)
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

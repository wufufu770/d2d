    // ══════════ router.js — 插件入口: better-sidebar tab 注册(软依赖) ══════════
    // 软依赖: cordis inject=['betterSidebar'] 保证服务就绪才激活; 未安装 better-sidebar
    // 时本 client 恒 pending(dsh-sentinel 模式), host 半路由不受影响。
    const inject = ['betterSidebar']

    function apply(ctx) {
      const svc = ctx.betterSidebar
      if (!svc) {
        ctx.log?.('d2d-panel: betterSidebar 服务不可用, tab 注册跳过')
        return
      }
      const cap = (f) => !svc.features || svc.features.includes(f) // 能力探测(老版本降级)

      ctx.effect(() => svc.registerTab({
        id: 'd2d:ops', // 包前缀; 内置区 10-50, 三方区 60 起
        title: () => 'd2d',
        order: 60,
        single: true, // ≡ dedupeKey: () => id
        ...(cap('badge') ? { badge: () => badgeState.workers ?? null } : {}), // 同步缓存读, 不发请求
        component: (props) => h(OpsView, props),
      }), 'd2d-panel: ops tab')

      ctx.effect(() => svc.registerTab({
        id: 'd2d:findings',
        title: () => 'd2d Findings',
        order: 61,
        single: true,
        ...(cap('badge') ? { badge: () => badgeState.verified ?? null } : {}),
        component: (props) => h(FindingsView, props),
      }), 'd2d-panel: findings tab')

      // T3-3-1 可视化 tab(星图+热力+泳道+桑基+能力看板; 独立 useViz 轮询, 无 badge 语义)
      ctx.effect(() => svc.registerTab({
        id: 'd2d:viz',
        title: () => 'd2d Viz',
        order: 62,
        single: true,
        component: (props) => h(VizView, props),
      }), 'd2d-panel: viz tab')

      // ---- T3-3-2 收官批: 9 标签页补全(五新 tab, order 63-67) ----
      ctx.effect(() => svc.registerTab({
        id: 'd2d:approval',
        title: () => 'd2d Approval',
        order: 63,
        single: true,
        ...(cap('badge') ? { badge: () => badgeState.approvals ?? null } : {}),
        component: (props) => h(ApprovalView, props),
      }), 'd2d-panel: approval tab')

      ctx.effect(() => svc.registerTab({
        id: 'd2d:chain',
        title: () => 'd2d Chain',
        order: 64,
        single: true,
        component: (props) => h(ChainView, props),
      }), 'd2d-panel: chain tab')

      ctx.effect(() => svc.registerTab({
        id: 'd2d:tools',
        title: () => 'd2d Tools',
        order: 65,
        single: true,
        component: (props) => h(ToolsView, props),
      }), 'd2d-panel: tools tab')

      ctx.effect(() => svc.registerTab({
        id: 'd2d:audit',
        title: () => 'd2d Audit',
        order: 66,
        single: true,
        component: (props) => h(AuditView, props),
      }), 'd2d-panel: audit tab')

      ctx.effect(() => svc.registerTab({
        id: 'd2d:config',
        title: () => 'd2d Config',
        order: 67,
        single: true,
        component: (props) => h(ConfigView, props),
      }), 'd2d-panel: config tab')
    }

    exports.apply = apply
    exports.inject = inject

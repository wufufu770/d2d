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
    }

    exports.apply = apply
    exports.inject = inject

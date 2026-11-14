    // ══════════ main.register.js — dsh 主面板槽位注册(1.6.0 Phase C) ══════════
    // 机制参照 dsh-superagent-prototype src/client/index.tsx: ctx.slots.inject('main'|'sidebar.panellist')
    // 注册主内容区全页 + 左栏图标(点击切换主面板)。'slots'/'locale' 服务由宿主 client-ui 注入面提供
    // (package.json dsh.client.inject 增加 layout/workspace/renderer/sidebar 四包 — superagent 同款清单)。
    // 注入面契约: betterSidebar 仍在 inject(既有 tab 快捷入口依赖); 三服务就绪后一次性注册。
    const MAIN_PANEL_ID = 'd2d-main'
    const LOCALE_NS = 'd2dPanel'

    function applyMain(ctx) {
      if (!ctx.slots?.inject) {
        ctx.log?.('d2d-panel: slots 服务不可用, 主面板注册跳过')
        return
      }
      try {
        ctx.effect(() => ctx.locale.register(LOCALE_NS, { zh: { panel: 'd2d 控制台' }, en: { panel: 'd2d Console' } }), 'd2d-panel: locale dict')
      } catch { /* 已记因: locale 不可用则用静态 label — 尽力而为不阻断主面板 */ }
      let t = () => 'd2d'
      try { const bind = ctx.locale?.bind?.(LOCALE_NS); if (bind) t = bind } catch { /* 同上 */ }

      ctx.effect(() => ctx.slots.inject('main', () => ctx.slots.register(
        { name: 'main', key: MAIN_PANEL_ID, locale: LOCALE_NS, inject: () => ({}) },
        () => h(MainPanelView, null),
      )), 'd2d-panel: main page')

      ctx.effect(() => ctx.slots.inject('sidebar.panellist', () => ctx.slots.register(
        { name: 'sidebar.panellist', id: MAIN_PANEL_ID, order: 10, label: () => t('panel'), locale: LOCALE_NS },
        PanelIcon,
      )), 'd2d-panel: main icon')
    }

    // 包装既有 apply(router.js 的 better-sidebar tabs), 主面板与快捷 tab 一次注册
    const __d2dBaseApply = exports.apply
    exports.apply = function (ctx) {
      __d2dBaseApply(ctx)
      applyMain(ctx)
    }
    exports.inject = ['betterSidebar', 'slots', 'locale']

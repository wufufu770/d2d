// index.js — d2d-panel client 半: better-sidebar tab 注册(软依赖)
// 规范依据: DSH-better-sidebar docs/external-plugin-guide.md (v0.12.0)
//  - inject = ['betterSidebar'] → Cordis 保证服务就绪后才激活本插件
//  - 注册必须包 ctx.effect(...) → fiber 卸载(HMR/禁用)时自动撤销, 否则 "already registered"
//  - 未安装 better-sidebar 时 ctx.betterSidebar === undefined → 静默跳过(dsh-sentinel 模式),
//    standalone 观测服务不受影响
//  - badge 是同步回调且须廉价 → 读 api.badgeState 缓存(轮询成功时更新), 不发请求
import { createElement as h } from 'react'
import { OpsView } from './OpsView.js'
import { FindingsView } from './FindingsView.js'
import { badgeState } from './api.js'

export const inject = ['betterSidebar']

export function apply(ctx) {
  const svc = ctx.betterSidebar
  if (!svc) {
    ctx.log?.('d2d-panel: betterSidebar 服务不可用, tab 注册跳过(不影响 standalone 观测服务)')
    return
  }
  // 能力探测(§7): features 只增不删; 老版本无 badge 时不传该字段
  const cap = (f) => !svc.features || svc.features.includes(f)

  ctx.effect(() => svc.registerTab({
    id: 'd2d:ops', // 包前缀 id(§10); 内置 explorer=10/git=20/subagent=30/terminal=40/browser=50, 60 起为三方区
    title: () => 'd2d',
    order: 60,
    single: true, // ≡ dedupeKey: () => id, 打开时聚焦既有 tab
    ...(cap('badge') ? { badge: () => badgeState.workers ?? null } : {}),
    component: (props) => h(OpsView, props),
  }))

  ctx.effect(() => svc.registerTab({
    id: 'd2d:findings',
    title: () => 'd2d Findings',
    order: 61,
    single: true,
    ...(cap('badge') ? { badge: () => badgeState.verified ?? null } : {}),
    component: (props) => h(FindingsView, props),
  }))
}

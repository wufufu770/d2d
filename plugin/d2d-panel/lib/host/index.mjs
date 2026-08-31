// index.mjs — d2d-panel host 半宿主装载器(cordis 插件入口)
// 职责单一: 起 loopback 观测服务(standalone), fiber 卸载时关停。
// P1(待实机验证): dsh web 若提供插件路由服务(参照 dsh-sidebar-leap 的
//   /sidebar-leap/api/* 同源挂载), 把 snapshot 挂到同源 /d2d/api/snapshot,
//   浏览器零跨域; 本版 standalone 已覆盖全部能力, 客户端按「同源优先 →
//   loopback 回退」自动探测(lib/client/api.js), 挂载后无需改客户端。
import { startStandalone } from './standalone.mjs'

export const name = 'd2d-panel'
export const inject = [] // 不依赖宿主服务: 直连 graphd, 与 pentest-dsh 平行

export function apply(ctx, config = {}) {
  const log = (...a) => { try { ctx?.log?.(...a) } catch { /* 宿主日志面可选 */ } }
  if (config.standalone === false) {
    log('d2d-panel: standalone 显式关闭(预期由同源路由服务供数)')
    return
  }
  let disposed = false
  let handle = null
  startStandalone({
    graphdUrl: config.graphdUrl,
    port: config.standalonePort,
    log,
  }).then((s) => {
    if (disposed) s.close() // fiber 在 listen 完成前就卸载
    else handle = s
  }).catch((e) => log(`d2d-panel: standalone 启动失败: ${e?.message ?? e}`))
  // ctx.effect: 注册副作用并返回清理函数, Cordis fiber 卸载(HMR/禁用)时自动调用
  ctx.effect(() => () => {
    disposed = true
    handle?.close()
  })
}

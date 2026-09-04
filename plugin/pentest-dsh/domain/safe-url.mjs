// A-2 出站 URL 门禁: 非破坏边界在出口侧的延伸 —— 通知 webhook 是"配置驱动的出站请求",
// 配置被污染时不得转成对云元数据/内网探面的跳板。仅允许 http(s)、禁内嵌凭据、禁元数据与
// link-local 目标。graphd 目标不在此列 — scheduler 已有独立回环门(graphdUrl 必须回环)。
const METADATA_HOST = /^(169\.254\.|fe80:|metadata$|metadata\.google\.internal$)/i

export function assertNotifyUrl(raw) {
  let u
  try { u = new URL(String(raw ?? '')) } catch { throw new Error('notify webhook 不是合法 URL') }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error(`webhook 仅允许 http/https(得到 ${u.protocol})`)
  }
  if (u.username || u.password) throw new Error('webhook 禁止内嵌凭据(user:pass@) — 凭据走 header 由接收方约定')
  if (METADATA_HOST.test(u.hostname)) throw new Error(`webhook 禁止元数据/link-local 目标: ${u.hostname}`)
  return u
}

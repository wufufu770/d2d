// 面板 start 请求政策(纯函数单测真源) — POST /d2d/api/start 的目标准入。
// 0906 engagement 启动 API 化(图队列: status='requested' → web 宿主调度器 ≤15s 采纳)。
// 外露控制面 fail-closed: 仅 http/https 公网域名 — 环回/私有/保留段一律拒绝(本地靶场走
// /pentest 聊天命令), 单段主机名(=本地别名)拒绝, instances 收敛 1..4, 文本字段截断。

// 环回/私有/保留段: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16(link-local),
// 0.0.0.0, 100.64/10(CGNAT), ::1, fc00::/7(ULA)
const FORBIDDEN_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|100\.6[4-9]\.|100\.7[01]\.|172\.(1[6-9]|2\d|3[01])\.|::1|f[cd][0-9a-f]{2}:)/i

export function validateStartRequest(body = {}) {
  const raw = String(body.target ?? '').trim()
  if (!raw) return { ok: false, error: 'target required' }
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let u
  try { u = new URL(withScheme) } catch { return { ok: false, error: 'target 不是合法 URL' } }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return { ok: false, error: '仅允许 http/https' }
  const host = String(u.hostname ?? '').toLowerCase()
  if (!host || !host.includes('.')) return { ok: false, error: `target 必须是含点分的公网域名/IP(得到 "${host || '空'}")` }
  if (FORBIDDEN_HOST_RE.test(host)) return { ok: false, error: `拒绝环回/私有/保留地址: ${host} — 本地靶场请走 /pentest 聊天命令` }
  const instances = Math.min(Math.max(Number.parseInt(String(body.instances ?? '2'), 10) || 2, 1), 4)
  const scope = String(body.scope ?? '').trim().slice(0, 2000)
  const objective = String(body.objective ?? '').trim().slice(0, 1200)
  const _p2 = (v) => String(v).padStart(2, '0')
  const _nm = new Date()
  const name = `eng-${_p2(_nm.getMonth() + 1)}${_p2(_nm.getDate())}-${_p2(_nm.getHours())}${_p2(_nm.getMinutes())}-${host.replace(/^www\./, '').split('.')[0]}-${Math.random().toString(36).slice(2, 4)}`
  return { ok: true, target: withScheme, host, scope: scope || `${host}`, instances, objective, name }
}

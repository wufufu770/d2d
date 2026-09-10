// 面板 start 请求政策(纯函数单测真源) — POST /d2d/api/start 的目标准入。
// 0906 engagement 启动 API 化(图队列: status='requested' → web 宿主调度器 ≤15s 采纳)。
// 外露控制面 fail-closed: 仅 http/https 公网域名 — 环回/私有/保留段一律拒绝(本地靶场走
// /pentest 聊天命令), 单段主机名(=本地别名)拒绝, instances 收敛 1..4, 文本字段截断。

// 环回/私有/保留段: 127/8, 10/8, 172.16/12, 192.168/16, 169.254/16(link-local),
// 0.0.0.0, 100.64/10(CGNAT), ::1, fc00::/7(ULA)
const FORBIDDEN_HOST_RE = /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.0\.0\.0|100\.6[4-9]\.|100\.7[01]\.|172\.(1[6-9]|2\d|3[01])\.|::1|f[cd][0-9a-f]{2}:)/i

// ── C6(审计 0910): scope 逐条目与 target 同级 FORBIDDEN 校验 ──
// 旧版 scope 只有 trim+截断, 攻击者可 POST scope:'0.0.0.0/0,localhost,169.254.169.254' 直接入图;
// egress 网关动态 scope 与白名单取并集 → 内网/云元数据(169.254.169.254)被放行。此处入库前逐条拒。
// 与 target 的正则不同, 条目还可能是 IP/CIDR/IPv6 → 用区间重叠判定(一条正则盖不住 0.0.0.0/1 这类
// "base 看似公网、覆盖面吞掉保留段"的 CIDR)。
const _ip4 = (s) => {
  const p = String(s ?? '').split('.')
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x))) return null
  const v = p.map(Number)
  if (v.some((x) => x > 255)) return null
  return (((v[0] << 24) >>> 0) + (v[1] << 16) + (v[2] << 8) + v[3]) >>> 0
}
// 0/8 本网络, 10/8, 100.64/10 CGNAT, 127/8 环回, 169.254/16 链路本地(含云元数据), 172.16/12,
// 192.168/16, 192.0.0/24, 192.0.2/24 与 198.51.100/24 文档段, 198.18/15 基准测试, 224/4 组播, 240/4 保留
const _FORBIDDEN_CIDRS = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16', '172.16.0.0/12',
  '192.168.0.0/16', '192.0.0.0/24', '192.0.2.0/24', '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24',
  '224.0.0.0/4', '240.0.0.0/4',
]
const _rangeOf = (cidr) => {
  const [base, bitsStr] = String(cidr).split('/')
  const b = _ip4(base)
  if (b === null) return null
  const bits = bitsStr === undefined || bitsStr === '' ? 32 : Number(bitsStr)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return null
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  const lo = (b & mask) >>> 0
  return [lo, (lo | (~mask >>> 0)) >>> 0]
}
const _inForbiddenV4 = (ip) => {
  const v = _ip4(ip)
  if (v === null) return false
  return _FORBIDDEN_CIDRS.some((c) => { const r = _rangeOf(c); return v >= r[0] && v <= r[1] })
}
const _cidrOverlapsForbidden = (cidr) => {
  const r = _rangeOf(cidr)
  if (r === null) return true // 解不动 → 保守按冲突拒
  return _FORBIDDEN_CIDRS.some((c) => { const f = _rangeOf(c); return r[0] <= f[1] && f[0] <= r[1] })
}
// IPv6: 环回 ::/::1、ULA fc00::/7、链路本地 fe80::/10、组播 ff00::/8、IPv4-mapped(归一成 v4 后按段判;
// 解不动的 mapped 形态保守拒)。Node/URL 会把 [::ffff:127.0.0.1] 规范化为 ::ffff:7f00:1, 两种形态都收。
const _v6Forbidden = (h) => {
  const s = h.replace(/^\[/, '').replace(/\]$/, '')
  if (s === '::' || s === '::1') return true
  const mapped = s.match(/^::ffff:(.+)$/)
  if (mapped) {
    if (/^\d+\.\d+\.\d+\.\d+$/.test(mapped[1])) return _inForbiddenV4(mapped[1])
    const g = mapped[1].split(':')
    if (g.length === 2 && g.every((x) => /^[0-9a-f]{1,4}$/.test(x))) {
      const hi = parseInt(g[0], 16), lo = parseInt(g[1], 16)
      return _inForbiddenV4(`${(hi >> 8) & 255}.${hi & 255}.${(lo >> 8) & 255}.${lo & 255}`)
    }
    return true // 残缺 mapped → 保守拒
  }
  if (/^f[cd][0-9a-f]{2}:/.test(s)) return true // fc00::/7 ULA
  if (/^fe[89ab][0-9a-f]:/.test(s)) return true // fe80::/10 链路本地
  if (/^ff[0-9a-f]{2}:/.test(s)) return true // ff00::/8 组播
  return false
}
// 单个 scope 条目校验: 返回拒绝原因(字符串)或 null(通过)。`!` 前缀(排除清单语法)剥掉后同规校验。
function _scopeEntryError(rawEntry) {
  let e = String(rawEntry ?? '').trim().toLowerCase()
  if (!e) return null
  if (e.startsWith('!')) e = e.slice(1).trim()
  if (!e) return null
  if (e === 'localhost' || e.endsWith('.localhost')) return '环回地址'
  if (e.includes('/')) {
    if (e.includes(':')) return '暂不支持 IPv6 CIDR'
    if (_rangeOf(e) === null) return '非法 CIDR'
    return _cidrOverlapsForbidden(e) ? 'CIDR 覆盖环回/私有/保留段' : null
  }
  if (/^\d+\.\d+\.\d+\.\d+$/.test(e)) return _inForbiddenV4(e) ? '环回/私有/保留 IP' : (_ip4(e) === null ? '非法 IPv4' : null)
  if (e.includes(':')) return _v6Forbidden(e) ? '环回/私有/链路本地 IPv6' : null
  if (e.includes('*') || e.includes('/') || e.includes(' ') || e.includes(':')) return '非法条目字符'
  if (!e.includes('.')) return '单段主机名(本地别名)'
  return null
}

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
  // C6: 先截断再逐条校验(校验对象=入库字符串本身), 任一条目命中环回/私有/保留/链路本地/CGNAT 即整体拒绝
  const scope = String(body.scope ?? '').trim().slice(0, 2000)
  for (const entry of scope.split(',')) {
    const why = _scopeEntryError(entry)
    if (why) return { ok: false, error: `scope 条目 "${String(entry).trim().slice(0, 60)}" 被拒(${why}) — 环回/私有/保留/链路本地/CGNAT 不得进入授权范围` }
  }
  const objective = String(body.objective ?? '').trim().slice(0, 1200)
  const _p2 = (v) => String(v).padStart(2, '0')
  const _nm = new Date()
  const name = `eng-${_p2(_nm.getMonth() + 1)}${_p2(_nm.getDate())}-${_p2(_nm.getHours())}${_p2(_nm.getMinutes())}-${host.replace(/^www\./, '').split('.')[0]}-${Math.random().toString(36).slice(2, 4)}`
  return { ok: true, target: withScheme, host, scope: scope || `${host}`, instances, objective, name }
}

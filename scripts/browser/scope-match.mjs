// scope-match.mjs — 域名白名单纯函数(P2/M5 cdp-proxy 用, 与 egress-gateway 子域通配同语义):
//   匹配 = 静态集合 ∪ 动态 scope; '.域' 形态含全部子域; 其余精确相等; CIDR 形态不在这里判
//   (cdp 面只放行域名目标, IP 段目标走 egress-gateway 的 curl 通道)。
// 全部纯函数 — cdp-proxy 的导航闸门锁单测(放行/拦截语义是安全边界, 不允许无测试改动)。
export function buildMatcher(staticAllow = [], dynScope = []) {
  const statics = staticAllow.map((a) => String(a).trim().toLowerCase()).filter(Boolean)
  const getDyn = typeof dynScope === 'function' ? dynScope : () => dynScope
  return (url) => {
    let u
    try { u = new URL(String(url)) } catch { return false }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false
    const h = u.hostname.toLowerCase()
    for (const a of [...statics, ...[...(getDyn() ?? [])].map((x) => String(x).trim().toLowerCase())]) {
      if (a === '127.0.0.1' || a === 'localhost') { if (h === a) return true; continue } // 回环只精确匹配, 不吃子域通配
      if (a.startsWith('.')) { if (h.endsWith(a) || h === a.slice(1)) return true }
      else if (!a.includes('/') && h === a) return true
    }
    return false
  }
}

export function isScopeUrl(url) {
  return /^https?:\/\//i.test(String(url ?? ''))
}

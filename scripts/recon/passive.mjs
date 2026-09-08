// passive.mjs — 被动子域源(P1/M2): 证书透明日志(crt.sh) — 公开只读源, 不碰目标。
// 固定 https host; 响应可能极慢/超大, 20s 超时 + 上限 5000 条; 输出去重子域列表(小写)。
export async function crtshSubs(domain, { fetchImpl = fetch, timeoutMs = 20000, limit = 5000 } = {}) {
  const base = String(domain ?? '').trim().toLowerCase().replace(/\.$/, '')
  if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(base)) throw new Error(`domain 非法: ${base}`)
  const url = `https://crt.sh/?q=%25.${encodeURIComponent(base)}&output=json`
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(timeoutMs) })
  if (!res.ok) throw new Error(`crt.sh http ${res.status}`)
  const rows = await res.json().catch(() => [])
  const out = new Set()
  for (const r of Array.isArray(rows) ? rows : []) {
    const names = String(r?.name_value ?? '').split(/\n/)
    for (let n of names) {
      n = n.trim().toLowerCase().replace(/^\*\./, '')
      if (!n || n.includes(' ') || !n.endsWith(`.${base}`)) continue
      if (n === base) continue
      if (!/^[a-z0-9][a-z0-9.-]*$/.test(n)) continue
      out.add(n)
      if (out.size >= limit) return [...out]
    }
  }
  return [...out]
}

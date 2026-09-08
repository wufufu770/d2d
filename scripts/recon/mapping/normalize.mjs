// normalize.mjs — 测绘响应行归一(P1/M1): 四家平台各自的行结构 → 统一资产记录。
// 统一结构: { source, host, ip, port, protocol, title, server, finger[], url, icp }
// 缺失字段一律 ''/[]/0(下游渲染与去重不判空异形)。全部纯函数, 各家字段名与响应实证锁单测。
export const FOFA_FIELDS = 'host,ip,port,protocol,title,server,icp,cert'
export const ZOOMEYE_FIELDS = 'ip,port,hostname,domain,title,update_time'

const str = (v) => String(v ?? '').trim()
const portOf = (v) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n < 65536 ? n : 0 }

// FOFA: fields 顺序即 results 二维数组顺序(FOFA_FIELDS)
export function fofaRow(row) {
  const [host, ip, port, protocol, title, server, icp, cert] = Array.isArray(row) ? row : []
  return { source: 'fofa', host: str(host).toLowerCase(), ip: str(ip), port: portOf(port), protocol: str(protocol).toLowerCase(), title: str(title), server: str(server), finger: [], url: '', icp: str(icp), cert: str(cert) }
}

// 鹰图 openApi search: data.arr[] — port/protocol 嵌在 port 对象里
export function hunterRow(item) {
  const proto = str(item?.port?.protocol).toLowerCase()
  return {
    source: 'hunter',
    host: (str(item?.domain) || str(item?.hostname)).toLowerCase(),
    ip: str(item?.ip),
    port: portOf(item?.port?.port),
    protocol: proto === 'http' || proto === 'https' ? proto : proto ? `tcp/${proto}` : '',
    title: '',
    server: '',
    finger: [],
    url: str(item?.url),
    icp: '',
    lastseen: str(item?.timestamp),
  }
}

// Quake v3 search/quake_service: include 指定的嵌套字段(service.http.host/title, service.name)
export function quakeRow(item) {
  const svc = item?.service ?? {}
  const finger = [str(svc?.name), str(svc?.http?.name)].filter(Boolean)
  return {
    source: 'quake',
    host: (str(svc?.http?.host) || str(item?.hostname)).toLowerCase(),
    ip: str(item?.ip),
    port: portOf(item?.port),
    protocol: str(svc?.transport).toLowerCase() === 'tcp' && str(svc?.name).includes('http') ? 'http' : str(svc?.name).toLowerCase(),
    title: str(svc?.http?.title),
    server: '',
    finger,
    url: '',
    icp: '',
    lastseen: str(item?.timestamp),
  }
}

// ZoomEye v2 search: fields=ZOOMEYE_FIELDS, product 等字段未请求时不出现
export function zoomeyeRow(item) {
  const port = portOf(item?.port)
  return {
    source: 'zoomeye',
    host: (str(item?.hostname) || str(item?.domain)).toLowerCase(),
    ip: str(item?.ip),
    port,
    protocol: port === 443 || port === 8443 ? 'https' : port === 80 || port === 8080 ? 'http' : '',
    title: Array.isArray(item?.title) ? item.title.filter(Boolean).join(' ') : str(item?.title),
    server: '',
    finger: Array.isArray(item?.product) ? item.product.filter(Boolean).map(String) : [],
    url: '',
    icp: '',
    lastseen: str(item?.update_time),
  }
}

// 去重键: host+port 优先(站点), 无 host 用 ip:port
export function assetKey(a) {
  if (a?.host) return `${a.host}:${a.port || 0}`
  if (a?.ip) return `${a.ip}:${a.port || 0}`
  return ''
}

// 跨平台聚合去重: 同键合并 — finger 取并集, 非空字段先到先得(source 顺序即可信顺序)
export function mergeAssets(assets) {
  const byKey = new Map()
  for (const a of assets) {
    const key = assetKey(a)
    if (!key) continue
    const prev = byKey.get(key)
    if (!prev) { byKey.set(key, { ...a, finger: [...(a.finger ?? [])] }); continue }
    for (const f of a.finger ?? []) if (!prev.finger.includes(f)) prev.finger.push(f)
    for (const k of ['ip', 'port', 'protocol', 'title', 'server', 'url', 'icp']) {
      if (!prev[k] && a[k]) prev[k] = a[k]
    }
  }
  return [...byKey.values()]
}

// 从资产集提取唯一子域(测绘子域反哺: collect.mjs 把它们并入子域数据集, source=mapping)
export function subdomainsOf(assets, baseDomain = '') {
  const base = baseDomain.toLowerCase()
  const out = new Set()
  for (const a of assets) {
    let h = a.host || ''
    if (!h.includes('.')) continue
    if (h.startsWith('http')) { try { h = new URL(h).hostname } catch { continue } }
    if (base && !h.endsWith(`.${base}`) && h !== base) continue
    out.add(h)
  }
  return [...out]
}

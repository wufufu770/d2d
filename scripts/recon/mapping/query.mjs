// query.mjs — 测绘查询翻译层(P1/M1): d2d 内部 DSL → FOFA/鹰图/Quake/ZoomEye 各自语法。
// DSL: { domain } 主域含全部子域 | { icp } 备案主体 | { ip } | { cidr } | { cert } 证书关键字,
//      多键并存 = AND。取值禁双引号/反斜杠/换行(平台 DSL 注入面), domain 形态做宽松格式校验。
// 纯函数零 IO — 翻译规则与各平台语法差异全部锁单测(四家字段名实证见 mapping/README)。
export const PLATFORMS = ['fofa', 'hunter', 'quake', 'zoomeye']

const clean = (v) => {
  const s = String(v ?? '').trim()
  if (!s) return ''
  if (/["\\\r\n]/.test(s)) throw new Error(`DSL 取值含非法字符(禁 " \\ 换行): ${s.slice(0, 40)}`)
  return s
}

// domain: 域名/主机名宽松校验(IDN 转码后逐段字母数字连字符; 允许通配不入 — 通配是平台语法面)
function cleanDomain(v) {
  const s = clean(v).replace(/\.$/, '').toLowerCase()
  if (s.includes('/')) throw new Error(`domain 不接受路径: ${s}`)
  for (const label of s.split('.')) {
    if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(label)) throw new Error(`domain 段非法: ${label}`)
  }
  return s
}

function cleanIp(v) {
  const s = clean(v)
  const oct = '(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)'
  if (!new RegExp(`^${oct}(\\.${oct}){3}$`).test(s)) throw new Error(`ip 非法: ${s}`)
  return s
}

function cleanCidr(v) {
  const s = clean(v)
  const m = s.match(/^([\d.]+)\/(\d{1,2})$/)
  if (!m) throw new Error(`cidr 非法(应为 a.b.c.d/nn): ${s}`)
  cleanIp(m[1])
  if (Number(m[2]) > 32) throw new Error(`cidr 掩码非法: ${s}`)
  return s
}

// 归一 DSL: 只认白名单键, 全空报错。返回 {domain,icp,ip,cidr,cert} 的 string 集合。
export function parseDsl(dsl) {
  const out = {}
  if (dsl?.domain) out.domain = cleanDomain(dsl.domain)
  if (dsl?.icp) out.icp = clean(dsl.icp)
  if (dsl?.ip) out.ip = cleanIp(dsl.ip)
  if (dsl?.cidr) out.cidr = cleanCidr(dsl.cidr)
  if (dsl?.cert) out.cert = clean(dsl.cert)
  if (!Object.keys(out).length) throw new Error('DSL 至少要一个查询键(domain/icp/ip/cidr/cert)')
  return out
}

const clausesOf = (dsl) => Object.entries(parseDsl(dsl))

// FOFA: domain="x" / icp="x" / ip="x" / cidr="x" / cert="x" — AND 用 && 整串 base64 走 qbase64
export function toFofa(dsl) {
  const parts = clausesOf(dsl).map(([k, v]) => `${k}="${v}"`)
  return parts.join(' && ')
}

// 鹰图: 子域聚合键是 domain.suffix="(含子域)"; icp 走 icp.name; 其余同名
export function toHunter(dsl) {
  return clausesOf(dsl).map(([k, v]) => `${k === 'domain' ? 'domain.suffix' : k === 'icp' ? 'icp.name' : k}="${v}"`).join(' && ')
}

// Quake: 与 FOFA 同形, icp 走 icp.name
export function toQuake(dsl) {
  return clausesOf(dsl).map(([k, v]) => `${k === 'icp' ? 'icp.name' : k}="${v}"`).join(' && ')
}

// ZoomEye v2: domain= 即含子域; icp 走 icp.name
export function toZoomEye(dsl) {
  return clausesOf(dsl).map(([k, v]) => `${k === 'icp' ? 'icp.name' : k}="${v}"`).join(' && ')
}

export function translateQuery(dsl, platform) {
  switch (platform) {
    case 'fofa': return toFofa(dsl)
    case 'hunter': return toHunter(dsl)
    case 'quake': return toQuake(dsl)
    case 'zoomeye': return toZoomEye(dsl)
    default: throw new Error(`未知平台: ${platform}(支持 ${PLATFORMS.join('/')})`)
  }
}

// query.mjs — 测绘查询翻译层(P1/M1): d2d 内部 DSL → FOFA/鹰图/Quake/ZoomEye 各自语法。
// DSL: { domain } 主域含全部子域 | { icp } 备案主体 | { ip } | { cidr } | { cert } 证书关键字,
//      多键并存 = AND。取值禁双引号/反斜杠/换行(平台 DSL 注入面), domain 形态做宽松格式校验。
// 特征面(P2 测绘放宽, 指纹规则反查共用): { title } | { body } | { header } | { framework }
//      产品特征键 — 供 relaxLadder 五轮放宽(完整特征组合→仅title→仅body→仅header→框架名)。
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

// 归一 DSL: 只认白名单键, 全空报错。返回 {domain,icp,ip,cidr,cert,title,body,header,framework} 的 string 集合。
export function parseDsl(dsl) {
  const out = {}
  if (dsl?.domain) out.domain = cleanDomain(dsl.domain)
  if (dsl?.icp) out.icp = clean(dsl.icp)
  if (dsl?.ip) out.ip = cleanIp(dsl.ip)
  if (dsl?.cidr) out.cidr = cleanCidr(dsl.cidr)
  if (dsl?.cert) out.cert = clean(dsl.cert)
  // 特征面键(五轮放宽/指纹反查): 自由文本特征, 同样只禁注入字符
  for (const k of ['title', 'body', 'header', 'framework']) if (dsl?.[k]) out[k] = clean(dsl[k])
  if (!Object.keys(out).length) throw new Error('DSL 至少要一个查询键(domain/icp/ip/cidr/cert/title/body/header/framework)')
  return out
}

const clausesOf = (dsl) => Object.entries(parseDsl(dsl))

// 特征面字段名(指纹反查联动): 各家 title/body/header 字段差异; framework 无统一产品字段 —
// 统一走各家全文关键词(裸引号串)兜底。与既有 base 面(=)同风格渲染。
const FEATURE_FIELDS = {
  fofa: { title: 'title', body: 'body', header: 'header' },
  hunter: { title: 'web.title', body: 'web.body', header: 'web.header' },
  quake: { title: 'title', body: 'body', header: 'header' },
  zoomeye: { title: 'title', body: 'webbody', header: 'webheader' },
}

const clauseOf = (platform, k, v) => {
  if (k === 'framework') return `"${v}"` // 框架名兜底: 平台无关全文关键词
  const field = FEATURE_FIELDS[platform]?.[k] ?? BASE_FIELDS[platform]?.[k] ?? k
  return `${field}="${v}"`
}

// base 面(限定键)各家字段重命名: 鹰图子域聚合走 domain.suffix, icp 除 FOFA 外走 icp.name
const BASE_FIELDS = {
  fofa: { domain: 'domain', icp: 'icp' },
  hunter: { domain: 'domain.suffix', icp: 'icp.name' },
  quake: { domain: 'domain', icp: 'icp.name' },
  zoomeye: { domain: 'domain', icp: 'icp.name' },
}

// FOFA: domain="x" / icp="x" / ip="x" / cidr="x" / cert="x" — AND 用 && 整串 base64 走 qbase64
export function toFofa(dsl) {
  return clausesOf(dsl).map(([k, v]) => clauseOf('fofa', k, v)).join(' && ')
}

// 鹰图: 子域聚合键是 domain.suffix="(含子域)"; icp 走 icp.name; 其余同名
export function toHunter(dsl) {
  return clausesOf(dsl).map(([k, v]) => clauseOf('hunter', k, v)).join(' && ')
}

// Quake: 与 FOFA 同形, icp 走 icp.name
export function toQuake(dsl) {
  return clausesOf(dsl).map(([k, v]) => clauseOf('quake', k, v)).join(' && ')
}

// ZoomEye v2: domain= 即含子域; icp 走 icp.name
export function toZoomEye(dsl) {
  return clausesOf(dsl).map(([k, v]) => clauseOf('zoomeye', k, v)).join(' && ')
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

// ---- 搜索预算(P2): 单次搜索结果上限, 四家客户端与聚合默认 — 调用方以 size 参数覆盖 ----
export const SEARCH_BUDGET = 50

// ---- 蜜罐/诈骗结果过滤(P2): 仅 FOFA 提供官方 is_honeypot/is_fraud 字段, 查询尾自动附加;
// Hunter/Quake/ZoomEye 无等价公开字段 — 按平台旁路返回原查询(各客户端留注释)。幂等: 已含不重复加。
export const FOFA_HONEYPOT_GUARD = '(is_honeypot=false && is_fraud=false)'
export function withHoneypotFilter(query, platform) {
  if (platform !== 'fofa') return query // Hunter/Quake/ZoomEye: 无等价字段, 跳过
  const q = String(query ?? '')
  return q.includes('is_honeypot') ? q : `${q} && ${FOFA_HONEYPOT_GUARD}`
}

// ---- 五轮放宽阶梯(P2 测绘放宽): 指纹特征查询失败/零命中时逐级放宽, 最多 5 轮, 命中即停(见 searchRelaxed):
// ① 完整特征组合(title+body+header+framework) → ② 仅 title → ③ 仅 body → ④ 仅 header → ⑤ 框架名(全文兜底)。
// spec: parseDsl 可解析的 DSL — 限定面(domain/icp/ip/cidr/cert)每轮保留, 特征面逐轮放宽。
// render(dsl)→平台查询串, 默认 FOFA 语法。返回去重后的查询串序列(退化输入自动收缩轮数)。
export function relaxLadder(spec, render = toFofa) {
  const dsl = parseDsl(spec)
  const base = {}
  for (const k of ['domain', 'icp', 'ip', 'cidr', 'cert']) if (dsl[k]) base[k] = dsl[k]
  const build = (feats) => render({ ...base, ...Object.fromEntries(feats.filter((f) => dsl[f]).map((f) => [f, dsl[f]])) })
  const rungs = [build(['title', 'body', 'header', 'framework'])]
  for (const k of ['title', 'body', 'header']) if (dsl[k]) rungs.push(build([k]))
  if (dsl.framework) rungs.push(build(['framework']))
  return [...new Set(rungs)]
}

// ---- 放宽搜索执行器: 沿阶梯逐轮调 doSearch(查询串 → {assets,...}), 有资产命中即停;
// 零命中/单轮失败继续放宽; 全轮失败抛最后一个错误(不吞错误), 全轮零命中返回末轮结果。
// 返回附 relaxRound(命中轮,从 1 起)与 relaxQueries(实际执行的查询序列)。
export async function searchRelaxed(rungs, doSearch) {
  const ladder = [...(rungs ?? [])]
  if (!ladder.length) throw new Error('放宽阶梯为空')
  const queries = []
  let lastErr = null
  let last = null
  for (const [i, query] of ladder.entries()) {
    queries.push(query)
    try {
      const r = await doSearch(query)
      if ((r?.assets?.length ?? 0) > 0) return { ...r, relaxRound: i + 1, relaxQueries: [...queries] }
      last = r
    } catch (e) { lastErr = e }
  }
  if (lastErr && !last) throw lastErr
  return { ...(last ?? {}), relaxRound: queries.length, relaxQueries: [...queries] }
}

#!/usr/bin/env node
// egress-gateway — V-08 完整修复: 出网治理网关(连接层 scope 强制)
// 职责: ①动态 scope(每 30s 从 control graphd 读活跃 Engagement.scope, 与静态白名单取并集)
//       ②子域通配 ③per-host 令牌桶限速 ④全量请求审计 JSONL
//       ⑤H14(审计 0910): 目标硬黑面(IPv4-mapped IPv6 归一 / fe80 / 0/8 / CGNAT / 云元数据) + DNS 解析后校验
//       ⑥4.5-1 解密面(opt-in, D2D_EGRESS_MITM=1, 默认不设=直通): CONNECT 隧道回环到内部 TLS 服务
//         (共享模块 scripts/gateway/tls-intercept.mjs: 自签 CA ~/.d2d-data/mitm/ca.key 0600+ca.crt,
//         按 SNI 动态签叶子) → 解密后的明文 HTTP 进 mitmHandle: 跑同一判定链(硬黑面/scope/限速/DNS 校验,
//         与主 handler 同序) + 路径级 scope(P2P_PATH_DENY 与 scope '!host/path' 条目; 仅解密模式生效 —
//         直通模式下路径在 TLS 密文里不可见) → https 转发上游、响应透传。审计 event='mitm-http' 只记
//         元数据 {ts,host,method,path,status,reqContentType,reqBytes,resBytes} — 除 content-type 外不含
//         任何请求头值(头值面留给证据加密交付)。默认(env 不设/0)与合并前完全一致: CONNECT 纯隧道直通。
// 用法: P2P_PROXY_PORT=8888 P2P_GRAPHD=http://127.0.0.1:8766 P2P_PROXY_ALLOW="127.0.0.1,localhost,.vulnweb.com" node egress-gateway.mjs
// worker 侧: export http_proxy=http://127.0.0.1:8888 https_proxy=... NO_PROXY=127.0.0.1,localhost
import http from 'node:http'
import https from 'node:https'
import os from 'node:os'
import dns from 'node:dns'
import path from 'node:path'
import { mkdirSync, appendFileSync, readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
// 4.5-1: 解密面的 CA/叶子签发/内部 TLS 服务在共享模块(自包含, 无反向依赖)
import { startTlsIntercept } from './tls-intercept.mjs'
// T2-2b-1: 证据存储加密壳(密钥=SHA-256(host-token), aes-256-gcm) — 解密分支事务捕获走同一 sink
import { createEvidenceSink, keyFromFile } from './evidence-crypto.mjs'

// 中危审计修复(13): env 解析 NaN 兜底 — 旧版 parseInt/parseFloat 无回退, env 填垃圾 →
// listen(NaN) 启动即崩 / RATE=NaN 使 allowRate 恒 false(全限死)。非法值一律回退默认。
const _envInt = (v, dflt) => { const n = parseInt(v ?? '', 10); return Number.isFinite(n) && n > 0 && n <= 65535 ? n : dflt }
const _envFloat = (v, dflt) => { const n = parseFloat(v ?? ''); return Number.isFinite(n) && n > 0 ? n : dflt }
const PORT = _envInt(process.env.P2P_PROXY_PORT, 8888)
const GRAPHS = (process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766,http://127.0.0.1:8767,http://127.0.0.1:8768').split(',').map(s => s.trim()).filter(Boolean)
const TOKEN_FILE = process.env.P2P_HOST_TOKEN_FILE ?? `${process.env.HOME}/.config/d2d/host-token`
const STATIC_ALLOW = new Set((process.env.P2P_PROXY_ALLOW ?? '127.0.0.1,localhost')
  .split(',').map(s => s.trim().toLowerCase()).filter(Boolean))
const RATE = _envFloat(process.env.P2P_PROXY_RATE, 5)
// 0911: 模型 API 主机豁免(scope 过滤外, 硬黑面内)——worker 的 LLM 调用是基础设施不是目标流量;
// 默认覆盖常见 LLM 端点, D2D_EGRESS_MODEL_HOSTS 逗号分隔可增补。
const MODEL_HOSTS = new Set([
  'api.minimaxi.com', 'api.minimax.io', 'api.minimax.chat', 'api.opencode.ai',
  'api.deepseek.com', 'api.openai.com', 'api.anthropic.com', 'open.bigmodel.cn',
  'api.moonshot.cn', 'dashscope.aliyuncs.com',
  ...(process.env.D2D_EGRESS_MODEL_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
])
// T3-2-1: osint 情报源豁免(基础设施, 非目标流量) — 被动源(crt.sh/Hackertarget)查询经本网关时
// 免 scope 门(scope 只约束目标侧; 情报源主机不在任何 engagement scope 内, 不豁免会被全拦)。
// 硬黑面仍优先于本豁免; 令牌桶限速与审计对豁免主机照常生效(豁免≠免治理)。
// D2D_EGRESS_OSINT_HOSTS 逗号分隔可增补。
const OSINT_HOSTS = new Set([
  'crt.sh', 'api.hackertarget.com', 'www.hackertarget.com',
  ...(process.env.D2D_EGRESS_OSINT_HOSTS ?? '').split(',').map((s) => s.trim()).filter(Boolean),
])
// 中危审计修复(9): 上游请求/隧道超时 — 旧版 http.request/net.connect 无任何超时, 上游挂住 =
// worker 连接与 socket 永久悬挂。默认 30s, P2P_PROXY_TIMEOUT_MS 可调(非法/非正值回退默认)。
const UPSTREAM_TIMEOUT_MS = _envInt(process.env.P2P_PROXY_TIMEOUT_MS, 30_000)
// 中危审计修复(9): 审计 bucket/DNS 缓存容量上限 — 旧版 Map 无限增长(每 host 一条, 永不回收)。
// 超上限时按插入序淘汰最旧条目(Map 迭代序=插入序, 等效 LRU 粗版; 刷新由令牌桶 last/DNS ts 自带)。
const MAP_CAP = 4096
const _capMap = (m) => { while (m.size >= MAP_CAP) { const oldest = m.keys().next().value; if (oldest === undefined) break; m.delete(oldest) } }
// M6 企业代理链: 企业网出网走公司代理(形态 host:port)。scope/限速/审计仍在本网关强制;
// 回环/私有目标绕过上游直连(CDP proxy/graphd 等本地面)。
const UPSTREAM = (() => {
  const raw = String(process.env.D2D_UPSTREAM_PROXY ?? '').trim()
  if (!raw) return null
  const m = raw.replace(/^https?:\/\//i, '').match(/^([^:]+)(?::(\d+))?$/)
  return m ? { host: m[1], port: Number(m[2] ?? 8080) } : null
})()
const isLocalHost = (h) => h === 'localhost' || h === '127.0.0.1' || h === '::1' || /^(10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h)
// ---- 4.5-1 路径级 scope(仅解密模式生效): ①P2P_PATH_DENY 逗号分隔路径前缀(如 '/admin,/internal', 默认空=关闭);
// ②scope 的 '!' 排除条目解析出 path 形态('!host/path')后同样前缀 deny — 解析在本文件做, scope.mjs 零改动。
// 边界: CONNECT 直通模式下路径在 TLS 密文里不可见 → path-deny 不可能生效; 明文 http 代理面走既有主 handler
// (零改动) → 也不查 path。比对口径: 规则与请求 path 双方 lowercase 后 startsWith(字面前缀, 偏 fail-closed —
// '/admin' 也拦 '/adminx'); 规则必须以 '/' 开头(防裸词误伤任意子串)。
const PATH_DENY = new Set((process.env.P2P_PATH_DENY ?? '').split(',')
  .map((s) => s.trim().toLowerCase()).filter((s) => s.startsWith('/')))
let dynPathDeny = new Set() // refreshScope 从活跃 Engagement 的 '!host/path' 条目解析而来(30s 刷新)
// '!host/path' → '/path'; 非 '!' 条目/纯 host 排除(无 path 形态) → ''
export function pathDenyFromScopeEntry(v) {
  const s = String(v ?? '').trim().toLowerCase()
  if (!s.startsWith('!')) return ''
  const i = s.indexOf('/', 1)
  return i > 0 ? s.slice(i) : ''
}
// 命中返回规则前缀(审计用), 未命中返回 ''。仅解密面(mitmHandle)调用。
export function pathDenied(p) {
  const s = String(p ?? '').toLowerCase()
  if (!s) return ''
  for (const pre of PATH_DENY) if (s.startsWith(pre)) return pre
  for (const pre of dynPathDeny) if (s.startsWith(pre)) return pre
  return ''
}
// 测试注入口(mocha 直接 import 本模块, 不走 main; 同 _setDynScope 口径)
export const _setPathDeny = (s) => { dynPathDeny = s instanceof Set ? new Set([...s].map((x) => String(x).toLowerCase()).filter((x) => x.startsWith('/'))) : new Set() }
// 4.5-1 解密面: 内部 TLS 服务句柄(首次解密 CONNECT 时懒初始化; null=未启用/初始化失败回退直通)
let _mitm = null
let _mitmP = null // 初始化单飞 Promise(并发 CONNECT 只 init 一次; 失败复位允许重试)
// R3: 数据外置 D2D_DATA_DIR(默认 ~/.d2d-data)
const EVIDENCE_DIR = process.env.P2P_PROXY_EVIDENCE ?? `${process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/evidence/proxy`
try { mkdirSync(EVIDENCE_DIR, { recursive: true }) } catch { /* 已记因: 尽力而为——证据目录已存在或创建失败, 不阻断网关启动 */ }
const logFile = `${EVIDENCE_DIR}/proxy-${Date.now()}.jsonl`
const audit = (e) => { try { appendFileSync(logFile, JSON.stringify({ ts: new Date().toISOString(), ...e }) + '\n') } catch { /* 已记因: 尽力而为——审计行写盘失败静默, 不阻断代理判定与转发 */ } }
// T2-2b-1: 解密分支加密事务捕获目录(mitm-http 元数据审计旁) — 只落密文, 不落明文
const MITM_ENC_DIR = path.join(EVIDENCE_DIR, 'mitm-enc')
try { mkdirSync(MITM_ENC_DIR, { recursive: true }) } catch { /* 已记因: 尽力而为——加密捕获目录创建失败不阻断网关, 写入侧另有审计兜底 */ }
// 事务体捕获上限(与 mitm-capture BODY_CAP 缺省同量级): 头必全量, 体截断记 truncated 标记
const MITM_TXN_BODY_CAP = 256 * 1024

// ---- H14(审计 0910): 主机归一 + 目标硬黑面(与 plugin/d2d-panel/lib/host/start-policy.mjs 同源口径) ----
// C6 修复后面板侧已拒保留段 scope, 此处兜底 /pentest 命令创建的 engagement 与图内直改:
//   ①IPv4-mapped IPv6 归一: `http://[::ffff:169.254.169.254]/` 被 Node 规范化为 hostname "[::ffff:a9fe:a9fe]",
//     旧版字符串比对既不命中 scope 也从不怀疑 → 按十六进制映射还原成 v4 再过黑面;
//   ②硬黑面(即使被 scope 声明也不放): 0.0.0.0/8、100.64/10(CGNAT)、169.254/16(链路本地, 含云元数据
//     169.254.169.254)、fe80::/10(v6 链路本地)。环回/私有段(127/8, 10/8, 172.16/12, 192.168/16)不进硬黑面
//     — 本地靶场(NoProxy 直连 DVLA 等)是合法目标, 仍走 scope 判定。
// CIDR: 与保留段任一重叠即拒(`0.0.0.0/0` 在此被拦, 字符串后缀/IP 精确比对都挡不住它)。
// GW-2 (gap #16): 判定逻辑平移至 plugin/pentest-dsh/domain/forbidden-target.mjs(单一事实源,
// tool-gate web_fetch 分类层同源消费) — 此处 import + 原样 re-export(导出面不变, 行为零改动)。
import { FORBIDDEN_CIDRS as _FORBIDDEN_CIDRS, _ip4ToInt, _rangeOf, normalizeHost, isForbiddenTarget } from '../../plugin/pentest-dsh/domain/forbidden-target.mjs'
const FORBIDDEN_CIDRS = _FORBIDDEN_CIDRS

// ---- 动态 scope: control 图的活跃 Engagement.scope, 30s 刷新 ----
let dynScope = new Set()
let token = ''
try { token = readFileSync(TOKEN_FILE, 'utf8').trim() } catch { /* 已记因: 降级路径——token 文件缺失时空令牌启动, scope 取不到按拒处理 */ }
async function refreshScope() {
  const next = new Set()
  const nextPathDeny = new Set() // 4.5-1: 本轮 '!host/path' 条目解析出的 path deny 集(与 dynScope 同生命周期)
  const activeEngs = [] // T3-3-3: active engagement 的 {name,target,scope}(授权契约整集校验用)
  for (const G of GRAPHS) {
    try {
      const res = await fetch(`${G}/query`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': token },
        body: JSON.stringify({ cypher: "MATCH (e:Engagement) WHERE e.status='active' RETURN e.scope AS s, e.target AS t, e.name AS n" }),
        signal: AbortSignal.timeout(5000),
      })
      const data = await res.json()
      for (const r of data.rows ?? []) {
        activeEngs.push({ name: String(r.n ?? ''), target: String(r.t ?? ''), scope: String(r.s ?? '') }) // T3-3-3
        for (const s of String(r.s ?? '').split(',')) {
          const v = s.trim().toLowerCase()
          if (!v) continue
          // H14: 图内 scope 条目同样过硬黑面(0.0.0.0/0、169.254.169.254、100.64/10 等不进 allow 集);
          // `!` 前缀是排除清单语法(allow 侧无意义, 旧版当死条目原样放入从不匹配) → 直接不收, 防解析歧义。
          const pd = pathDenyFromScopeEntry(v) // 4.5-1: '!host/path' 的 path 形态进路径 deny 集(仅解密模式消费)
          if (pd) nextPathDeny.add(pd)
          if (v.startsWith('!')) continue
          if (isForbiddenTarget(v)) { audit({ event: 'scope-entry-rejected', entry: v.slice(0, 60) }); continue }
          // 保留原文(IP/CIDR 精确匹配用); 域名形态额外记一条 ".域" 供子域通配
          next.add(v)
          if (!v.includes('/') && !/^\d+\.\d+\.\d+\.\d+$/.test(v)) next.add(`.${v}`)
        }
      }
    } catch { /* 单图抖动保留其余 */ }
  }
  // [T3-3-3 纯新增] 授权契约整集校验(挂接点 4; H14 同位数据组装区 — 判定原语 hostAllowed/三条
  // 判定链/audit 拒绝形态零触碰)。矩阵: 任一 active eng 契约 deny(invalid/expired 或 missing+on)
  // → 本轮 allow 集收窄为空(fail-closed, 与全图不可达同方向) + audit; vanished/missing+off → 放行
  // + audit warn; 验签通道自身故障(import 失败等基础设施) → 放行 + audit warn(验签通道不可达不得
  // scope 全灭 — t3-3-plan 审计定稿②)。
  try {
    const { authContractGate } = await import('../../plugin/pentest-dsh/domain/auth-contract.mjs')
    for (const eng of activeEngs) {
      const g = await authContractGate({ target: eng.target, scope: eng.scope })
      if (g.decision === 'deny') {
        audit({ event: 'scope-contract-rejected', eng: eng.name.slice(0, 40), state: g.state, reason: String(g.reason ?? '').slice(0, 100) })
        next.clear()
        nextPathDeny.clear()
        break
      }
      if (g.decision === 'allow-warn') audit({ event: `scope-contract-${g.state}`, eng: eng.name.slice(0, 40), reason: String(g.reason ?? '').slice(0, 100) })
    }
  } catch (e) {
    audit({ event: 'scope-contract-channel-error', reason: String(e?.message ?? e).slice(0, 100) }) // 放行 + warn
  }
  dynScope = next
  dynPathDeny = nextPathDeny // 4.5-1: 与 dynScope 同步生效(全图不可达 → 空集, path-deny 退回 P2P_PATH_DENY 静态集)
}
// scope 是 CIDR(如 192.168.1.0/24)时按位匹配 — 字符串后缀匹配会误杀段内主机(2026-09-01 接线时实证)
function ipToInt(ip) {
  const p = String(ip).split('.').map(Number)
  if (p.length !== 4 || p.some((x) => !Number.isInteger(x) || x < 0 || x > 255)) return null
  return (((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3]) >>> 0
}
function ipInCidr(ip, cidr) {
  const [base, bitsStr] = String(cidr).split('/')
  const b = ipToInt(base), v = ipToInt(ip)
  if (b === null || v === null) return false
  const bits = bitsStr === undefined || bitsStr === '' ? 32 : Number(bitsStr)
  if (!Number.isInteger(bits) || bits < 0 || bits > 32) return false
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
  return (v & mask) === (b & mask)
}
function hostAllowed(host) {
  const h = normalizeHost(host)
  if (isForbiddenTarget(h)) return false // 硬黑面双保险(处理器层已先拒一次)
  // 0911: 模型 API 豁免(基础设施, 非目标流量)——scope 只约束目标侧; LLM 端点不豁免会被
  // engagement scope 全拦(worker 模型调用全部 TRANSPORT error)。硬黑面仍优先于本豁免。
  if (MODEL_HOSTS.has(h)) return true
  if (OSINT_HOSTS.has(h)) return true // T3-2-1: osint 情报源豁免(令牌桶/审计照常)
  if (STATIC_ALLOW.has(h)) return true
  for (const a of [...STATIC_ALLOW, ...dynScope]) {
    if (a.includes('/')) { if (ipInCidr(h, a)) return true }
    else if (a.startsWith('.')) { if (h.endsWith(a) || h === a.slice(1)) return true }
    else if (h === a) return true
  }
  return false
}
// ---- H14: DNS 解析后校验 — scope 内域名可被(被挟持的)权威 DNS 解到元数据/链路本地等保留段,
// host 字符串比对防不住; 放行前先解一层, 解析失败或任一解析结果命中硬黑面 → fail-closed 拒绝。
const _dnsCache = new Map()
const _dnsLookupAll = (h) => dns.promises.lookup(h, { all: true, verbatim: true })
// FIX-2 A4: resolve once / connect validated —— 校验解析与建连绑定合一。旧形态两步:
// resolvedIpsAllowed(host) 校验(解析+保留段判定) → 转发点 net.connect(port, host)/
// http.request({host}) 再对域名二次解析 —— 两次解析之间 DNS 记录可被切换(TOCTOU rebinding
// 窗口, 冷读 A4 三转发点逐点定位)。修法: 校验通过时把**已校验的合法 IP**返回给调用方直接
// 用于建连(转发点只解一次), 二次解析窗口消除; 企业代理转发点建连对象是代理本身(目标 DNS
// 在代理侧), 绑定目标 IP 无意义 → 该点保持校验+登记(拍板边界: hosts 级绑定可行即做)。
// 缓存语义保留(30s 窗, gap GW-GW23-D-001 的既有登记面不变): 缓存条目加 ips, 命中时返回
// 与校验同源的 IP —— 校验与建连共用一次解析结果, 缓存窗内也不产生第二次解析。
async function resolveValidatedIp(host, resolve = _dnsLookupAll) {
  const h = normalizeHost(host)
  if (!h) return { ok: false, ip: '' }
  const c = _dnsCache.get(h)
  if (c && Date.now() - c.ts < 30_000) return { ok: c.ok, ip: c.ok ? (c.ips?.[0] ?? '') : '' }
  let ok = false
  let ips = []
  try {
    const addrs = await resolve(h)
    ips = (Array.isArray(addrs) ? addrs : []).map((a) => a?.address ?? a).filter((a) => typeof a === 'string' && a)
    ok = ips.length > 0 && ips.every((a) => !isForbiddenTarget(a))
  } catch { ok = false; ips = [] } // 解析失败/超时 → fail-closed
  _capMap(_dnsCache) // 中危审计修复(9): 容量上限(旧版过期条目也永不回收)
  _dnsCache.set(h, { ts: Date.now(), ok, ips })
  return { ok, ip: ok ? (ips[0] ?? '') : '' }
}
async function resolvedIpsAllowed(host, resolve = _dnsLookupAll) {
  const h = normalizeHost(host)
  if (!h) return false
  const r = await resolveValidatedIp(h, resolve)
  return r.ok
}
const _clearDnsCache = () => _dnsCache.clear()
// 测试注入口(mocha 直接 import 本模块, 不走 main)
const _setDynScope = (s) => { dynScope = s instanceof Set ? s : new Set() }

const buckets = new Map()
// T2-2b-1 目标限速回灌: 桶结构加 penalty 维度(有效速率 = RATE/penalty)。上游 429/503 → penalty
// 翻倍(封顶 16, 首次即减半); 2xx → 逐步恢复(floor 减半至 1); Retry-After → 冻结窗内 tokens 归零
// 等效(不回填不消费)。回灌点在响应透传处统一(noteUpstreamStatus), 直通与解密两条路径都生效。
function allowRate(host) {
  _capMap(buckets) // 中危审计修复(9): 容量上限, 防海量 host 撑爆内存
  const now = Date.now()
  let b = buckets.get(host)
  if (!b) { b = { tokens: RATE, last: now, penalty: 1 }; buckets.set(host, b) }
  if (b.frozenUntil && now < b.frozenUntil) { b.last = now; return false } // Retry-After 冻结窗: 不回填(等效 tokens 归零), 到期自然解冻
  const eff = RATE / (b.penalty || 1) // 有效速率(容 penalty 缺省: 兼容外部塞进来的旧形态桶)
  b.tokens = Math.min(eff, b.tokens + ((now - b.last) / 1000) * eff); b.last = now
  if (b.tokens < 1) return false
  b.tokens -= 1
  return true
}
// Retry-After 解析: 秒数形态或 HTTP-date 形态 → 毫秒; 缺失/不可解析 → null(不冻结)
function parseRetryAfter(v) {
  if (v === undefined || v === null) return null
  const s = String(v).trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return Number(s) * 1000
  const d = Date.parse(s)
  return Number.isNaN(d) ? null : Math.max(0, d - Date.now())
}
// T2-2b-1: 上游响应状态回灌(统一回灌点 — 主 handler 明文透传回调与 mitmHandle 解密透传回调都调它)。
// 429/503 → penalty = min(penalty*2, 16)(首次即减半) + audit event='rate-backoff' {host,code,penalty};
// 2xx → penalty = max(1, floor(penalty/2))(逐步恢复, 不审计防噪声)。Retry-After 头存在 → 额外冻结
// bucket 到 now()+min(retryAfter, 60s)(tokens 归零等效)。无桶(理论上 allowRate 先行建桶) → 兜底跳过。
function noteUpstreamStatus(host, statusCode, headers) {
  const b = buckets.get(host)
  if (!b) return
  const code = Number(statusCode)
  if (code === 429 || code === 503) {
    b.penalty = Math.min((b.penalty || 1) * 2, 16)
    const ra = parseRetryAfter(headers?.['retry-after'])
    if (ra !== null) { b.tokens = 0; b.frozenUntil = Date.now() + Math.min(ra, 60_000) }
    audit({ event: 'rate-backoff', host, code, penalty: b.penalty, ...(ra !== null ? { retryAfterMs: Math.min(ra, 60_000) } : {}) })
  } else if (code >= 200 && code < 300) {
    b.penalty = Math.max(1, Math.floor((b.penalty || 1) / 2))
  }
}
function deny(res, host, why, code = 403) {
  audit({ event: 'deny', host, why })
  res.writeHead(code, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({ ok: false, error: `egress-gateway: ${why} (${host})` }))
}
const _sockDeny = (sock, host, why, code = 403) => {
  audit({ event: 'deny', host, why })
  try { sock.end(`HTTP/1.1 ${code} Forbidden\r\n\r\n`) } catch { /* 已记因: 另面留痕——deny 决定已审计, 对端已断时 403 写回失败静默 */ }
}
const server = http.createServer(async (req, res) => {
  // 0906 修复: worker 被杀/客户端半途断连时 req/res 的 'error'(ECONNRESET) 无监听 → 整进程退出(12:15 实证)
  req.on('error', () => {})
  res.on('error', () => {})
  let u
  try { u = new URL(req.url, `http://${req.headers.host ?? 'unknown'}`) } catch { return deny(res, '', 'bad request url') }
  const host = normalizeHost(u.hostname)
  if (req.url === '/health' || u.pathname === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: true, dynScope: [...dynScope], rate: RATE, upstream: UPSTREAM ? 'configured' : null }))
  }
  // H14 顺序: 硬黑面 → scope → 限速 → DNS 解析校验(逐请求逐 host, prompt 注入改 URL 也逃不过)
  if (isForbiddenTarget(host)) return deny(res, host, 'metadata/link-local/CGNAT/0-net 硬黑面(H14), scope 声明也不放行')
  if (!hostAllowed(host)) return deny(res, host, 'host not in scope (V-08 egress enforcement)')
  if (!allowRate(host)) return deny(res, host, 'rate limit', 429)
  // FIX-2 A4: resolve once / connect validated —— 校验解析返回的合法 IP 直接用于建连,
  // 消除「校验解析→建连二次解析」的 rebinding TOCTOU 窗口(三转发点统一形态)。
  const _rv = await resolveValidatedIp(host)
  if (!_rv.ok) return deny(res, host, 'DNS 解析失败或解析到保留/元数据地址(H14 fail-closed)')
  audit({ event: 'http', host, path: u.pathname, method: req.method })
  try {
    // M6 企业代理链: D2D_UPSTREAM_PROXY 配置时经企业代理转发(http 代理语义 = 绝对 URL 打到代理);
    // 回环/私有目标直连(CDP proxy/graphd 等本地面不过企业网)。scope/限速/审计仍在本网关强制 —
    // 企业代理只是传输通道, 不构成策略旁路。
    const upstreamFor = UPSTREAM && !isLocalHost(host) ? UPSTREAM : null
    // 连接用归一化 host(去方括号/mapped 还原后的 v4) — net.connect 不吃 "[::ffff:..]" 带括号字面量;
    // Host 头保持 u.host(URL 规范形态, v6 带方括号)。
    // FIX-2 A4: 直连分支绑定已校验 IP(_rv.ip); 企业代理分支建连对象是代理本身(目标 DNS 在
    // 代理侧解析, 绑定目标 IP 无意义)——该点保持校验+登记, 不构成窗口收紧缺口(代理侧有自己的
    // 解析时刻, 本网关可见性止于 CONNECT/绝对 URL——边界登记)。
    const reqOpts = upstreamFor
      ? { host: upstreamFor.host, port: upstreamFor.port, path: `http://${u.host}${u.pathname}${u.search}`, method: req.method, headers: { ...req.headers, host: u.host } }
      : { host: _rv.ip || host, port: u.port || 80, path: u.pathname + u.search, method: req.method, headers: { ...req.headers, host: u.host } }
    // 中危审计修复(9): 上游超时 — timeout 只报警不销毁, 必须显式 destroy → 走 error → 502
    reqOpts.timeout = UPSTREAM_TIMEOUT_MS
    const up = http.request(reqOpts, (r) => {
      noteUpstreamStatus(host, r.statusCode, r.headers) // T2-2b-1: 直通路径回灌点(状态码→令牌桶 penalty/冻结)
      res.writeHead(r.statusCode, r.headers); r.pipe(res)
    })
    up.on('timeout', () => up.destroy(new Error(`upstream timeout ${UPSTREAM_TIMEOUT_MS}ms`)))
    up.on('error', () => { try { res.writeHead(502); res.end() } catch { /* 已记因: 尽力而为——上游错误回 502 时响应已发出/客户端已断, 写回失败静默 */ } })
    req.pipe(up)
  } catch { deny(res, host, 'bad upstream') }
})
// WRAP-3 gap 24: CONNECT 端口 pin —— host 级 scope 通过 ≠ 任意端口隧道授权(登记原文:
// scope http:80 host 可 CONNECT :6379)。缺省 pin 443(TLS 隧道本义); env P2P_PROXY_CONNECT_PORTS
// 逗号白名单扩展。**环回内部服务豁免**(127.0.0.1/localhost/::1): 4.5-1 MITM 解密与直通非标
// TLS 的内部服务端口多样性是功能前提——pin 治理外部隧道面, 环回面残余登记(非 TLS 内部服务
// 探测面留 open, 由 sandbox/宿主边界兜底)。非 pin 端口 → 403 + audit deny(port-not-pinned);
// host 级 scope 门仍是第一道(本门为端口第二道)。
const CONNECT_PORTS = new Set((process.env.P2P_PROXY_CONNECT_PORTS ?? '443').split(',').map((x) => _envInt(x.trim(), -1)).filter((x) => x > 0))
const CONNECT_LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1'])
const connectPortAllowed = (p, host = '') => CONNECT_PORTS.has(p) || CONNECT_LOOPBACK.has(String(host ?? '').toLowerCase())
const _setConnectPorts = (ports) => { CONNECT_PORTS.clear(); for (const p of (ports ?? [])) { const v = _envInt(p, -1); if (v > 0) CONNECT_PORTS.add(v) } } // 测试注入口(_setDynScope 口径)
const _connectPortsView = () => new Set(CONNECT_PORTS)

server.on('connect', async (req, sock, head) => { // HTTPS CONNECT: host 级 scope 强制 + 端口 pin(gap 24)
  sock.on('error', () => {}) // 0906 修复: 隧道对端 RST(step-limit 杀 worker 等)无监听 → 崩进程(12:15 实证)
  // H14: CONNECT 目标可能是 [v6]:port 形态 — 旧版 split(':')[0] 会把它截成 "[::ffff"(比对必然失真)
  const cm = String(req.url ?? '').match(/^(?:\[([^\]]+)\]|([^:]+))(?::(\d+))?$/)
  const host = normalizeHost(cm?.[1] ?? cm?.[2] ?? '')
  const port = _envInt(cm?.[3], 443) // 中危审计修复(13): 端口 NaN/越界兜底(旧版 parseInt 原样透传给 net.connect)
  if (isForbiddenTarget(host)) return _sockDeny(sock, host, 'metadata/link-local/CGNAT/0-net 硬黑面(H14), scope 声明也不放行')
  if (!hostAllowed(host)) { audit({ event: 'deny', host, why: 'CONNECT not in scope' }); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
  if (!connectPortAllowed(port, host)) { audit({ event: 'deny', host, port, why: 'CONNECT port not pinned (gap 24)' }); sock.end('HTTP/1.1 403 Forbidden\r\n\r\n'); return }
  if (!allowRate(host)) { sock.end('HTTP/1.1 429 Too Many Requests\r\n\r\n'); return }
  // FIX-2 A4: resolve once / connect validated —— 校验通过即持有已校验 IP, 直连分支绑定建连
  // (企业代理分支建连对象是代理本身, 目标 DNS 在代理侧——保持校验+登记)。
  const _rv = await resolveValidatedIp(host)
  if (!_rv.ok) return _sockDeny(sock, host, 'DNS 解析失败或解析到保留/元数据地址(H14 fail-closed)')
  audit({ event: 'connect', host })
  // ---- 4.5-1 解密分支(D2D_EGRESS_MITM=1; 每连接读取 env 便于运行时切换/回归, 默认不设=不走此处) ----
  // 隧道回环到内部 TLS 服务(tls-intercept: 自签 CA + 按 SNI 动态签叶子), worker 侧 TLS 在此终结,
  // 解密后的明文 HTTP 进 mitmHandle — host 级判定链已在上(硬黑面/scope/限速/DNS, 与直通分支完全同序),
  // mitmHandle 再跑同链并加路径级 scope + mitm-http 元数据审计后 https 转发上游。初始化失败(无 openssl
  // 等) → 审计后落回下方既有直通分支(可用性优先, 不吞连接; _mitmP 复位允许下次重试)。
  // 以下为纯新增分支, 直通分支零改动。单飞守卫: 并发首个 CONNECT 只初始化一次。
  if (process.env.D2D_EGRESS_MITM === '1') {
    if (!_mitmP) {
      _mitmP = startTlsIntercept({
        dataDir: process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`,
        handler: (req, res) => { mitmHandle(req, res).catch(() => { try { res.writeHead(500); res.end() } catch { /* 已记因: 尽力而为——解密请求处理异常回 500, 客户端已断时写回失败静默 */ } }) },
        onAudit: audit,
      }).then((h) => { _mitm = h; return h }).catch((e) => {
        audit({ event: 'mitm-init-error', host, error: String(e?.message ?? e).slice(0, 120) })
        _mitm = null; _mitmP = null
        return null
      })
    }
    if (await _mitmP) {
      import('node:net').then(({ default: net }) => {
        const up = net.connect(_mitm.port(), '127.0.0.1', () => {
          up.setTimeout(0) // 隧道已建立: 解除握手超时(与直通分支同口径)
          sock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
          if (head.length) up.write(head)
          sock.pipe(up); up.pipe(sock)
        })
        up.setTimeout(UPSTREAM_TIMEOUT_MS, () => { try { up.destroy(); sock.end() } catch { /* 已记因: 尽力而为——隧道上游超时拆除, 对端已断时写回失败静默 */ } })
        up.on('error', () => sock.end())
        sock.on('close', () => { try { up.destroy() } catch { /* 已记因: 尽力而为——客户端断开拆回环侧, 已销毁时重复 destroy 空过 */ } }) // 客户端断开 → 拆回环侧, 防半开隧道残留
      }).catch(() => sock.end())
      return
    }
  }
  import('node:net').then(({ default: net }) => {
    // M6 企业代理链: CONNECT 经企业代理二次 CONNECT 隧道(握手 200 才放行), 否则直连
    // 中危审计修复(9): 隧道两侧都挂超时 — 上游挂住/握手不回时销毁, socket 不再永久悬挂
    const upstreamFor = UPSTREAM && !isLocalHost(host) ? UPSTREAM : null
    if (!upstreamFor) {
      // FIX-2 A4: 绑定已校验 IP 建连(_rv.ip) —— 建连不再对域名二次解析, rebinding TOCTOU 窗消除
      const up = net.connect(port, _rv.ip || host, () => {
        up.setTimeout(0) // 隧道已建立: 解除握手超时(长连接空闲属正常, 挂死风险只在握手窗口)
        sock.write('HTTP/1.1 200 Connection Established\r\n\r\n'); up.write(head); up.pipe(sock); sock.pipe(up)
      })
      up.setTimeout(UPSTREAM_TIMEOUT_MS, () => { try { up.destroy(); sock.end() } catch { /* 已记因: 尽力而为——直连隧道上游超时拆除, 对端已断时失败静默 */ } })
      up.on('error', () => sock.end())
      return
    }
    const up = net.connect(upstreamFor.port, upstreamFor.host, () => {
      up.write(`CONNECT ${host}:${port} HTTP/1.1\r\nHost: ${host}:${port}\r\n\r\n`)
    })
    up.setTimeout(UPSTREAM_TIMEOUT_MS, () => { try { up.destroy(); sock.end() } catch { /* 已记因: 尽力而为——企业代理隧道超时拆除, 对端已断时失败静默 */ } })
    let buf = ''
    up.on('data', function onData(d) {
      buf += d.toString('latin1')
      if (!buf.includes('\r\n\r\n')) return
      up.removeListener('data', onData)
      if (/^HTTP\/1\.[01] 200/.test(buf)) {
        up.setTimeout(0) // 隧道已建立: 解除握手超时(同直连路径)
        sock.write('HTTP/1.1 200 Connection Established\r\n\r\n')
        if (head.length) up.write(head)
        up.pipe(sock); sock.pipe(up)
      } else {
        audit({ event: 'upstream-refused', host, status: buf.split('\r\n')[0].slice(0, 60) })
        sock.end('HTTP/1.1 502 Bad Gateway\r\n\r\n')
      }
    })
    up.on('error', () => sock.end())
  }).catch(() => sock.end())
})
server.on('clientError', (err, socket) => { try { socket.end('HTTP/1.1 400 Bad Request\r\n\r\n') } catch { /* 已记因: 尽力而为——畸形请求回 400, 连接已坏时写回失败静默 */ } })

// ---- 4.5-1 解密面: 内部 TLS 服务解密出的明文 HTTP 进这里(同一判定链 → https 转发上游 → 响应透传) ----
// 转发用 https: CONNECT 语义 = 上游是 TLS(与直通裸隧道可达性一致 — 直通从不校验上游证书, 这里同样
// rejectUnauthorized:false, 实验室自签证书可达)。M6 企业代理链不接解密面(仅明文 http 面与 CONNECT 直通面),
// scope/硬黑面/限速/DNS/审计仍全在本网关强制, 不构成策略旁路。上游 host:port 取解密请求的 Host 头
// (worker 经 CONNECT 隧道发的请求 Host 必带目标:端口), 端口缺省 443。
// 审计 event='mitm-http' 只记元数据 {ts,host,method,path,status,reqContentType,reqBytes,resBytes} —
// 除 content-type 外不含任何请求头值(头值面由 T2-2b-1 加密事务文件承接, 见 mitmEncCapture)。
// ---- T2-2b-1: 解密分支加密事务捕获(evidence/mitm-enc/<ts>.json, 走 evidence-crypto 同一 sink) ----
// 头值面(Cookie/Authorization 等)只进密文: D2D_EVIDENCE_ENC=0 → 整体跳过(明文面永不新增);
// 密钥缺文件/形态不对 → fail-closed 拒写(只审计 mitm-enc-error, 绝不降级明文)。尽力而为: 捕获
// 失败不影响转发。默认密钥文件 = host-token(64-hex), D2D_EVIDENCE_KEY_FILE 可重定向。
const headOut = (h) => { const o = {}; for (const [k, v] of Object.entries(h ?? {})) o[k] = Array.isArray(v) ? v.join(', ') : String(v); return o }
let encSeq = 0
function mitmEncCapture(txn) {
  if (process.env.D2D_EVIDENCE_ENC === '0') return // 加密开关关 → 新捕获面不落盘(无明文降级路)
  try {
    txn.ts = txn.ts ?? new Date().toISOString() // 与 mitm-capture captureTxn 同口径: 缺 ts 自动补 ISO
    const keyFile = process.env.D2D_EVIDENCE_KEY_FILE ?? `${os.homedir()}/.config/d2d/host-token`
    const sink = createEvidenceSink({ keyHex: keyFromFile(keyFile), dir: MITM_ENC_DIR })
    sink.write(txn, path.join(MITM_ENC_DIR, `${Date.now()}-${++encSeq}.json`))
  } catch (e) { audit({ event: 'mitm-enc-error', error: String(e?.message ?? e).slice(0, 120) }) }
}
async function mitmHandle(req, res) {
  req.on('error', () => {})
  res.on('error', () => {})
  let u
  try { u = new URL(req.url, `http://${req.headers.host ?? 'unknown'}`) } catch { return deny(res, '', 'bad request url') }
  const host = normalizeHost(u.hostname)
  const path = u.pathname + u.search
  // 路径级 scope(仅解密模式可达此处 — path 只在解密后可见): P2P_PATH_DENY / scope '!host/path' 命中
  // → 403 + path-deny 审计, 不触上游、不耗令牌桶。
  const denyRule = pathDenied(path)
  if (denyRule) {
    audit({ event: 'path-deny', host, path, method: req.method, rule: denyRule })
    res.writeHead(403, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify({ ok: false, error: `egress-gateway: path denied by scope (${denyRule})` }))
  }
  // 同一判定链(与主 handler 逐条同序同义): 硬黑面 → scope → 限速 → DNS 解析校验
  if (isForbiddenTarget(host)) return deny(res, host, 'metadata/link-local/CGNAT/0-net 硬黑面(H14), scope 声明也不放行')
  if (!hostAllowed(host)) return deny(res, host, 'host not in scope (V-08 egress enforcement)')
  if (!allowRate(host)) return deny(res, host, 'rate limit', 429)
  // FIX-2 A4: resolve once / connect validated(解密面第三转发点) —— 校验 IP 直接用于 https
  // 转发, servername 保持目标 host(TLS SNI 由 host 名驱动, 证书校验语义零变化)。
  const _rv = await resolveValidatedIp(host)
  if (!_rv.ok) return deny(res, host, 'DNS 解析失败或解析到保留/元数据地址(H14 fail-closed)')
  let reqBytes = 0, resBytes = 0
  const started = Date.now()
  // T2-2b-1: 头+体捕获(体上限 MITM_TXN_BODY_CAP, 只多记 truncated 标记) — 仅进加密事务文件,
  // 不进 mitm-http 元数据审计(该审计面保持只记元数据)。
  const reqChunks = []; let reqStored = 0
  const resChunks = []; let resStored = 0
  req.on('data', (c) => {
    reqBytes += c.length
    if (reqStored < MITM_TXN_BODY_CAP) { const room = MITM_TXN_BODY_CAP - reqStored; reqChunks.push(room >= c.length ? c : c.subarray(0, room)); reqStored += Math.min(room, c.length) }
  })
  const audited = (status) => audit({ event: 'mitm-http', host, method: req.method, path, status, reqContentType: String(req.headers['content-type'] ?? ''), reqBytes, resBytes })
  try {
    // FIX-2 A4: host=已校验 IP(建连不二次解析); servername=目标 host(TLS SNI 保真——证书
    // 校验/虚拟主机路由语义与域名建连完全一致, 仅解析时刻收敛为校验那一次)。
    const reqOpts = { host: _rv.ip || host, servername: host, port: u.port || 443, path, method: req.method, headers: { ...req.headers, host: u.host }, rejectUnauthorized: false }
    // 中危审计修复(9)同口径: 上游超时 — timeout 只报警不销毁, 必须显式 destroy → 走 error → 502
    reqOpts.timeout = UPSTREAM_TIMEOUT_MS
    const up = https.request(reqOpts, (r) => {
      noteUpstreamStatus(host, r.statusCode, r.headers) // T2-2b-1: 解密路径回灌点(与直通同一 noteUpstreamStatus)
      res.writeHead(r.statusCode, r.headers)
      r.on('data', (c) => {
        resBytes += c.length
        if (resStored < MITM_TXN_BODY_CAP) { const room = MITM_TXN_BODY_CAP - resStored; resChunks.push(room >= c.length ? c : c.subarray(0, room)); resStored += Math.min(room, c.length) }
      })
      r.pipe(res)
      r.on('end', () => {
        audited(r.statusCode)
        // T2-2b-1: 加密事务捕获(含 req/res 头与体) — 走与 mitm-capture 同一 evidence sink; 捕获失败
        // 只审计不碍转发(证据是尽力而为, 明文永不落盘)。明文 chunk 局部量, 写后即弃。
        try {
          mitmEncCapture({
            eng: '', durMs: Date.now() - started,
            req: { method: req.method, host, port: u.port || 443, path, httpVersion: req.httpVersion, headers: headOut(req.headers) },
            reqBody: { size: reqBytes, truncated: reqBytes > MITM_TXN_BODY_CAP, text: reqChunks.length ? Buffer.concat(reqChunks).toString('utf8') : '' },
            res: { status: r.statusCode, headers: headOut(r.headers) },
            resBody: { size: resBytes, truncated: resBytes > MITM_TXN_BODY_CAP, text: resChunks.length ? Buffer.concat(resChunks).toString('utf8') : '' },
          })
        } catch { /* 已记因: 另面留痕——事务组包失败静默, sink 侧错误已走 mitm-enc-error 审计 */ }
      })
    })
    up.on('timeout', () => up.destroy(new Error(`upstream timeout ${UPSTREAM_TIMEOUT_MS}ms`)))
    up.on('error', () => { audited(502); try { res.writeHead(502); res.end() } catch { /* 已记因: 另面留痕——502 已审计留痕, 客户端已断时写回失败静默 */ } })
    req.pipe(up)
  } catch { deny(res, host, 'bad upstream') }
}
// 测试钩子: 解密面内部 TLS 服务句柄(mocha 清理用; 生产路径不使用)
export const _mitmServer = () => _mitm?.server ?? null

// main 守卫: 直接 `node egress-gateway.mjs` 才起服务/刷 scope; mocha 等纯 import 只取纯函数
const IS_MAIN = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (IS_MAIN) {
  refreshScope(); setInterval(refreshScope, 30_000)
  server.listen(PORT, '127.0.0.1', () => console.log(`[egress-gateway] :${PORT} allow=${[...STATIC_ALLOW]} + dynamic scope from ${GRAPHS.join(',')}`))
}

export { normalizeHost, isForbiddenTarget, hostAllowed, allowRate, resolvedIpsAllowed, resolveValidatedIp, refreshScope, server, _setDynScope, _clearDnsCache, UPSTREAM_TIMEOUT_MS, MAP_CAP, buckets as _buckets, _dnsCache, noteUpstreamStatus, parseRetryAfter, mitmHandle, logFile as _auditLog, MITM_ENC_DIR as _mitmEncDir, MITM_TXN_BODY_CAP, connectPortAllowed, _setConnectPorts, _connectPortsView }

// snapshot/graphd-client.mjs — graphd 客户端(拆分自 snapshot.mjs: 244-305 + 734-782, 逻辑零改动)
// host token: 环境变量优先, 其次 scheduler 同款 token 文件(I-017 路径)。
import fs from 'node:fs'
import os from 'node:os'

/** host token: 环境变量优先, 其次 scheduler 同款 token 文件(I-017 路径)。 */
export function readHostToken(env = process.env) {
  if (env.P2P_HOST_TOKEN) return String(env.P2P_HOST_TOKEN).trim()
  const f = env.P2P_HOST_TOKEN_FILE ?? `${os.homedir()}/.config/d2d/host-token`
  try { return fs.readFileSync(f, 'utf8').trim() } catch { return '' }
}

/** R6.1: 全局黑名单(denylist.json) — 与白名单对应, 面板 ENGAGEMENT 卡展示 + 门控同源。 */
export function readDenylist(env = process.env) {
  try {
    const p = env.P2P_DENYLIST_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/denylist.json`
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    return { domains: (d.domains ?? []).map(String), cidr_prefix: (d.cidr_prefix ?? []).map(String) }
  } catch { return { domains: [], cidr_prefix: [] } }
}

const _normDomain = (v) => String(v ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '')
const _validDomain = (v) => /^[a-z0-9.*-]+(\.[a-z0-9.*-]+)+$/.test(v)
const _validCidr = (v) => /^\d{1,3}(\.\d{1,3}){2,3}\.$/.test(v)

/** R6.3: 黑名单 CRUD(面板增删改) — 改 denylist.json 后热重载 graphd 写门(免重启即时生效)。
 *  op: 'add'{kind,value} | 'del'{kind,value} | 'update'{kind,from,to}; kind: 'domains'|'cidr_prefix'。
 *  热重载失败不回滚文件(下次 engagement/重启亦生效), 以 warn 字段提示。 */
export async function writeDenylist({ op, kind, value, from, to, graphdUrl, token, env = process.env }) {
  const kinds = ['domains', 'cidr_prefix']
  if (!kinds.includes(String(kind))) throw new Error(`kind 必须是 ${kinds.join('/')}`)
  const p = env.P2P_DENYLIST_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/denylist.json`
  const cur = readDenylist(env)
  const items = cur[kind]
  const check = (v) => {
    if (kind === 'cidr_prefix') { if (!_validCidr(v)) throw new Error(`IP 段必须以点结尾(如 203.0.113.): ${v}`); return v }
    if (!_validDomain(v)) throw new Error(`非法域名(纯 host, 不带协议/路径): ${v}`)
    return v
  }
  if (op === 'add') {
    const v = check(_normDomain(value))
    if (items.includes(v)) throw new Error(`已存在: ${v}`)
    items.push(v)
  } else if (op === 'del') {
    const v = String(value ?? '').trim().toLowerCase()
    const i = items.indexOf(v)
    if (i < 0) throw new Error(`不存在: ${v}`)
    items.splice(i, 1)
  } else if (op === 'update') {
    const f = String(from ?? '').trim().toLowerCase()
    const i = items.indexOf(f)
    if (i < 0) throw new Error(`不存在: ${f}`)
    const t = check(_normDomain(to))
    if (items.includes(t) && t !== f) throw new Error(`已存在: ${t}`)
    items[i] = t
  } else throw new Error('op 必须是 add/del/update')
  fs.writeFileSync(p, JSON.stringify({ domains: cur.domains, cidr_prefix: cur.cidr_prefix }, null, 2) + '\n')
  let warn = ''
  try {
    const r = await fetch(`${graphdUrl}/reload/denylist`, {
      method: 'POST', headers: token ? { 'X-Auth': token } : {}, signal: AbortSignal.timeout(4000),
    })
    if (!r.ok) warn = `文件已保存, graphd 热重载失败(HTTP ${r.status}) — 下个 engagement 起生效`
  } catch { warn = '文件已保存, graphd 不可达 — graphd 恢复后生效' }
  return { domains: cur.domains, cidr_prefix: cur.cidr_prefix, warn }
}

export function createGraphdQuery({ graphdUrl, token, fetchImpl = fetch, timeoutMs = 5000 }) {
  return async function query(cypher, params = {}) {
    const res = await fetchImpl(`${graphdUrl}/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
      body: JSON.stringify({ cypher, params }),
      signal: AbortSignal.timeout(timeoutMs),
    })
    const data = await res.json().catch(() => null)
    if (!res.ok || !data?.ok) throw new Error(`graphd: ${data?.error ?? `http ${res.status}`}`)
    return data.rows ?? []
  }
}

/** 面板侧人工裁决: 代理 graphd /write/transition(host token 通道, 七态门 + actor/reason 审计在 graphd 校验)。 */
export async function transitionFinding({ graphdUrl, token, id, to, actor, reason }, fetchImpl = fetch, timeoutMs = 8000) {
  const res = await fetchImpl(`${graphdUrl}/write/transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
    body: JSON.stringify({ id: String(id ?? ''), to: String(to ?? ''), actor: String(actor ?? ''), reason: String(reason ?? '') }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) throw new Error(String(data?.error ?? `graphd http ${res.status}`))
  return data
}

/** WRAP-2 面板侧裁决回灌: 代理 graphd /write/adjudicate(host token 通道; 两路分流+审计+403 门在 graphd 校验)。 */
export async function adjudicate({ graphdUrl, token, kind, action, id, operator, reason }, fetchImpl = fetch, timeoutMs = 8000) {
  const res = await fetchImpl(`${graphdUrl}/write/adjudicate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
    body: JSON.stringify({ kind: String(kind ?? ''), action: String(action ?? ''), id: String(id ?? ''), operator: String(operator ?? ''), reason: String(reason ?? '') }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) throw new Error(String(data?.error ?? `graphd http ${res.status}`))
  return data
}

// ---------- 4-4 子批次 A: 通道①审批队列 pending 计数(快照暴露, 缺席降级 null) ----------
// 复用 pentest-dsh/scheduler/approvals.mjs(同仓库兄弟包链接部署, 单一格式源); 动态导入 +
// 失败返 null —— 面板核心快照不因审批队列缺席而降级(fail-soft 只作用这个附加字段)。
export async function readApprovalSummary() {
  try {
    // E40-D1: 拆分后本模块位于 lib/host/snapshot/ — 相对深度 +1(原 snapshot.mjs 同款动态导入)
    const ap = await import('../../../../pentest-dsh/scheduler/approvals.mjs')
    return { mode: ap.approvalMode(), pending: ap.pendingCount() }
  } catch { return null }
}

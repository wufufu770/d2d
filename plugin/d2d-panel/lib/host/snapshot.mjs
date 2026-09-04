// snapshot.mjs — 快照聚合(host 半核心, 纯逻辑可单测)
// 数据流: graphd /query(host token 合法读通道, app.py:436-445) → 一条聚合 JSON → 浏览器
// 字段名与 graphd/app.py:51-65 schema 逐字对齐; 七态与 app.py:110 FINDING_STATES 一致。
// 契约见 docs/PANEL-UI-SPEC.md §5: 浏览器永不碰凭证; wire 不带 evidence 全文与 repro。

import fs from 'node:fs'
import os from 'node:os'

export const FINDING_STATES = ['candidate', 'triaged', 'verified', 'isolated', 'reported', 'accepted', 'rejected']
export const MACRO_GROUPS = [
  { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
  { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
  { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
  { key: 'rejected', label: '已驳回', states: ['rejected'] },
]
export const ZOMBIE_MS = 30_000
const MAX = { title: 200, scope: 200, target: 200, workers: 50, findings: 200, signals: 50, exp: 100, checkpoint: 400, todo: 400, traj: 400, digest: 160, usageLines: 2000, runLogLines: 400, sigEvidence: 0 }

// 全部只读 MATCH; host token 通道下不触发 worker 只读白名单(本就放行)
const Q = {
  engActive: `MATCH (e:Engagement) WHERE e.status = 'active' RETURN e.name AS name, e.target AS target, e.scope AS scope, e.status AS status, e.created_at AS created_at ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`,
  engLast: `MATCH (e:Engagement) RETURN e.name AS name, e.target AS target, e.scope AS scope, e.status AS status, e.created_at AS created_at ORDER BY coalesce(e.created_at, '') DESC LIMIT 1`,
  agents: `MATCH (a:AgentIdentity) RETURN a.worker_id AS worker_id, a.ring AS ring, a.chain AS chain, a.status AS status, a.checkpoint AS checkpoint, a.todo AS todo, a.updated_at AS updated_at ORDER BY coalesce(a.updated_at, '') DESC LIMIT ${MAX.workers}`,
  findingsByState: `MATCH (f:Finding) RETURN f.gate_status AS state, count(f) AS n`,
  findingsList: `MATCH (f:Finding) RETURN f.id AS id, f.title AS title, f.severity AS severity, f.cvss AS cvss, f.gate_status AS state, f.category AS category, f.ts AS ts, f.verified_at AS verified_at, f.last_transition AS last_transition ORDER BY coalesce(f.ts, '') DESC LIMIT ${MAX.findings}`,
  experienceTail: `MATCH (x:ExperienceWeight) RETURN x.id AS id, x.pattern AS pattern, x.stack AS stack, x.prior AS prior, x.hits AS hits, x.wins AS wins, x.target_type AS target_type ORDER BY coalesce(x.prior, 1.0) DESC, coalesce(x.hits, 0) DESC LIMIT ${MAX.exp}`,
  signalsTail: `MATCH (s:Signal_) WHERE s.status = 'open' RETURN s.id AS id, s.type AS type, s.weight AS weight, s.ts AS ts ORDER BY coalesce(s.ts, '') DESC LIMIT ${MAX.signals}`,
  coverage: `MATCH (e:Endpoint) RETURN count(e) AS total, sum(CASE WHEN e.exhausted = true OR e.coverage_votes >= 2 THEN 1 ELSE 0 END) AS covered`,
  gaps: `MATCH (e:Endpoint) WHERE e.exhausted = false AND e.coverage_votes < 2 RETURN DISTINCT e.business_chain AS bc LIMIT 3`,
  handoffs: `MATCH (h:Handoff) RETURN h.id AS id, h.digest AS digest, h.model AS model, h.created_at AS created_at ORDER BY coalesce(h.created_at, '') DESC LIMIT 6`,
  cntEndpoints: `MATCH (e:Endpoint) RETURN count(e) AS n`,
  cntSignalsOpen: `MATCH (s:Signal_) WHERE s.status = 'open' RETURN count(s) AS n`,
  cntHypsOpen: `MATCH (h:Hypothesis) WHERE h.status = 'open' RETURN count(h) AS n`,
  cntExperience: `MATCH (x:ExperienceWeight) RETURN count(x) AS n`,
}

// ---------- 纯工具 ----------
function cap(v, n) {
  const t = String(v ?? '')
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
function fnum(v, digits = 1) {
  const n = num(v)
  return Math.round(n * 10 ** digits) / 10 ** digits
}

/** 七态计数 → 4 宏观列(PANEL-UI-SPEC §4.4)。未知态忽略。 */
export function groupStates(byState) {
  const out = {}
  for (const g of MACRO_GROUPS) out[g.key] = g.states.reduce((a, s) => a + num(byState?.[s]), 0)
  return out
}

/** worker 心跳 → 前端可复用的 zombie 判定(PANEL-UI-SPEC §4.6: 纯时钟, >30s)。
 *  ageMs = -1 表示无心跳时间戳(不判 zombie, 视图按未知渲染)。 */
export function markZombie(agents, nowMs) {
  return (agents ?? []).map((a) => {
    const ts = Date.parse(String(a.updated_at ?? '')) || 0
    const ageMs = ts ? Math.max(0, nowMs - ts) : -1
    const running = String(a.status ?? '') === 'running'
    return { ...a, ageMs, zombie: running && ageMs > ZOMBIE_MS }
  })
}

// ---------- graphd 客户端 ----------
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
    if (kind === 'cidr_prefix') { if (!_validCidr(v)) throw new Error(`IP 段必须以点结尾(如 222.73.243.): ${v}`); return v }
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

/** W4: 环容量热调(caps.json) — 面板容量卡片的读写源; 调度器每 tick 热读同一文件, 免重启生效。 */
export function readCaps(env = process.env) {
  try {
    const p = env.P2P_CAPS_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/caps.json`
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    return {
      caps: (d.caps && typeof d.caps === 'object') ? d.caps : {},
      deepParallel: d.deepParallel ?? null,
      maxAgents: d.maxAgents ?? null,
      backlogWatermark: d.backlogWatermark ?? null,
      updated_at: String(d.updated_at ?? ''),
    }
  } catch { return { caps: {}, deepParallel: null, maxAgents: null, backlogWatermark: null, updated_at: '' } }
}

const _CAP_KINDS = ['recon', 'deep-dive', 'chain', 'verify', 'creative', 'link']
const _CAP_RANGE = { kind: [1, 8], deepParallel: [1, 8], maxAgents: [1, 8], backlogWatermark: [5, 500] }
const _capInt = (v, [lo, hi]) => {
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`须为 ${lo}-${hi} 的整数, 得到 "${v}"`)
  return n
}

/** W4: 容量卡片写侧 — updates = { caps?:{kind:n}, deepParallel?, maxAgents?, backlogWatermark? };
 *  值 '' / null = 清除该覆盖(调度器回落 env); 钳位与 domain/caps.mjs 读侧一致, 越界直接报错。 */
export function writeCaps({ updates }, env = process.env) {
  const p = env.P2P_CAPS_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/caps.json`
  const cur = readCaps(env)
  const next = { caps: { ...cur.caps }, deepParallel: cur.deepParallel, maxAgents: cur.maxAgents, backlogWatermark: cur.backlogWatermark }
  const u = updates && typeof updates === 'object' ? updates : {}
  if (u.caps !== undefined && typeof u.caps !== 'object') throw new Error('caps 必须是对象')
  for (const [k, v] of Object.entries(u.caps ?? {})) {
    if (!_CAP_KINDS.includes(k)) throw new Error(`未知环节 "${k}"(可选: ${_CAP_KINDS.join('/')})`)
    if (v === '' || v === null) delete next.caps[k]
    else next.caps[k] = _capInt(v, _CAP_RANGE.kind)
  }
  for (const key of ['deepParallel', 'maxAgents', 'backlogWatermark']) {
    if (u[key] === undefined) continue
    next[key] = (u[key] === '' || u[key] === null) ? null : _capInt(u[key], _CAP_RANGE[key])
  }
  if (!Object.keys(next.caps).length) delete next.caps
  next.updated_at = new Date().toISOString()
  fs.mkdirSync(`${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config`, { recursive: true })
  const tmp = `${p}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2) + '\n')
  fs.renameSync(tmp, p)
  return readCaps(env)
}

/** 模型策略(A-2 外置): DATA_DIR/config/model-policies.json, 缺失返回 null(fleet 卡降级)。*/
export function readFleet(env = process.env) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  try {
    const p = JSON.parse(fs.readFileSync(`${dir}/config/model-policies.json`, 'utf8'))
    const roles = {}
    for (const [k, v] of Object.entries(p?.roles ?? {})) {
      roles[k] = { primary: String(v?.primary ?? ''), backup: String(v?.backup ?? '') }
    }
    const fleet = { default: { primary: String(p?.default?.primary ?? ''), backup: String(p?.default?.backup ?? '') }, roles, models: [], catalog: [] }
    // 候选模型并集: 已被引用过的模型 + dsh 已注册供应商/模型(issue: 换槽选择器此前只有已用模型, 其余全靠手填)
    const seen = new Set()
    for (const m of [fleet.default.primary, fleet.default.backup, ...Object.values(roles).flatMap((r) => [r.primary, r.backup])]) {
      if (m && !seen.has(m)) { seen.add(m); fleet.models.push(m) }
    }
    let catalog = []
    try { catalog = loadDshCatalog(env) } catch {}
    fleet.catalog = catalog
    for (const { provider, models } of catalog) {
      for (const id of models) {
        const m = `${provider}/${id}`
        if (m && !seen.has(m)) { seen.add(m); fleet.models.push(m) }
      }
    }
    return fleet
  } catch { return null }
}

/** issue: Fleet 换槽候选只有已用模型 — 从 dsh 配置枚举已注册供应商/模型(零依赖缩进解析)。
 * 兼容两种缩进形态: ~/.dsh/settings.yaml(providers@2) 与 profiles/<profile>/cordis.patch.yml(providers@4)。
 * provider 行 = providers: 块内下一级的 `name:`; 模型 = 块内 `- id: <id>` 列表项; 缩出块即结束。*/
export function parseProviderModels(text) {
  const out = []
  const lines = String(text ?? '').split(/\r?\n/)
  let block = -1
  let prov = null
  for (const raw of lines) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue
    const indent = raw.length - raw.replace(/^\s+/, '').length
    const body = raw.trim()
    if (prov !== null && (indent <= block || (indent === block + 2 && /^[A-Za-z0-9_-]+:\s*$/.test(body)))) {
      out.push(prov); prov = null // 出块 / 同级下一个 provider
    }
    if (prov === null && /^providers:\s*$/.test(body)) { block = indent; continue }
    if (prov === null && block >= 0 && indent === block + 2) {
      const m = body.match(/^([A-Za-z0-9_-]+):\s*$/)
      if (m) { prov = { provider: m[1], models: [] }; continue }
    }
    if (prov !== null) {
      const idm = body.match(/^-\s*id:\s*(.+?)\s*$/)
      if (idm) {
        const id = idm[1].replace(/^["']|["']$/g, '')
        if (id) prov.models.push(id)
      }
      const kem = body.match(/^apiKeyEnv:\s*(.+?)\s*$/)
      if (kem) prov.apiKeyEnv = kem[1].replace(/^["']|["']$/g, '')
    }
  }
  if (prov !== null) out.push(prov)
  return out
}

/** 凭据状态: dsh credentials 文件 refs 段的环境变量名集合(只取名字, 值不读不外传) + 进程环境兜底。*/
export function credentialEnvNames(env = process.env) {
  const home = env.DSH_HOME ?? `${os.homedir()}/.dsh`
  const names = new Set()
  try {
    let inRefs = false
    for (const raw of fs.readFileSync(`${home}/.credentials.yaml`, 'utf8').split(/\r?\n/)) {
      if (!raw.trim() || raw.trim().startsWith('#')) continue
      const indent = raw.length - raw.replace(/^\s+/, '').length
      const body = raw.trim()
      if (indent === 0) { inRefs = /^refs:\s*$/.test(body); continue }
      if (inRefs) {
        const m = body.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
        if (m) names.add(m[1])
      }
    }
  } catch {}
  for (const k of Object.keys(env)) if (/API_KEY/.test(k)) names.add(k)
  return names
}

/** 凭据 refs 合并(纯函数供 pytest/node test) — dsh 管理的 {version, refs:{ENV: key}} 平文本形态:
 * 已有 refs: 段 → 在段尾插入新条目; 无 → 文件尾新建 refs: 段。env 名白名单校验。*/
export function mergeCredentialRefs(text, envName, value) {
  if (!/^[A-Za-z0-9_]+$/.test(String(envName || ''))) throw new Error('invalid credential env name')
  const lines = String(text ?? '').split(/\r?\n/)
  let refsStart = -1, refsEnd = -1
  lines.forEach((l, i) => {
    if (i === 0) return
    const m = l.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (!m) return
    if (m[1] === '' && m[2] === 'refs') refsStart = i
    else if (refsStart >= 0 && m[1].startsWith('  ')) refsEnd = i
  })
  const entry = `  ${envName}: ${value}`
  if (refsStart >= 0) lines.splice((refsEnd >= refsStart ? refsEnd : refsStart) + 1, 0, entry)
  else lines.push('refs:', entry)
  return lines.join('\n')
}

/** 汇总 dsh 配置里的供应商/模型(settings.yaml + profiles/<profile>/cordis.patch.yml), 按供应商排序去重。*/
export function loadDshCatalog(env = process.env) {
  const home = env.DSH_HOME ?? `${os.homedir()}/.dsh`
  const files = [`${home}/settings.yaml`]
  try {
    for (const e of fs.readdirSync(`${home}/profiles`)) {
      const p = `${home}/profiles/${e}/cordis.patch.yml`
      if (fs.existsSync(p)) files.push(p)
    }
  } catch {}
  const refs = credentialEnvNames(env)
  const byProv = new Map() // provider → {models:Set, apiKeyEnv}
  for (const f of files) {
    try {
      for (const { provider, models, apiKeyEnv } of parseProviderModels(fs.readFileSync(f, 'utf8'))) {
        const cur = byProv.get(provider) ?? { models: new Set(), apiKeyEnv: '' }
        for (const m of models) cur.models.add(m)
        if (apiKeyEnv) cur.apiKeyEnv = apiKeyEnv
        byProv.set(provider, cur)
      }
    } catch {}
  }
  return [...byProv.entries()]
    .map(([provider, cur]) => ({ provider, models: [...cur.models].sort(), apiKeyEnv: cur.apiKeyEnv || '',
      hasKey: cur.apiKeyEnv ? (refs.has(cur.apiKeyEnv) || Boolean(env[cur.apiKeyEnv])) : false }))
    .sort((a, b) => a.provider.localeCompare(b.provider))
}

/** 策略库(#89 吸纳竞品策略库浏览面): 知识卡全量(现役+影子) + verify 命中战果(wins/hits)。
 * source: current=confirmed(现役, 过三门禁) / shadow=default(影子待实战)。数据源=本地 brain 文件 + 图内战果。*/
export async function loadStrategies(env = process.env, query) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const out = []
  const seen = new Set()
  const pools = [
    ['confirmed', `${dir}/brain/current/techniques.json`],
    ['default', `${dir}/brain/shadow/techniques.json`],
  ]
  for (const [source, p] of pools) {
    try {
      for (const c of JSON.parse(fs.readFileSync(p, 'utf8')).cards ?? []) {
        if (seen.has(c.id)) continue
        seen.add(c.id)
        out.push({ id: c.id, title: c.title, category: c.category || 'general',
          applies_to: c.applies_to ?? [], source: source === 'current' ? 'confirmed' : source })
      }
    } catch (e) { console.error('[d2d-panel] loadStrategies pool:', source, e.message) }
  }
  let winsMap = {}
  try {
    const rows = await query(`MATCH (e:ExperienceWeight) WHERE e.id STARTS WITH 'card:' RETURN e.id AS id, e.wins AS w, e.hits AS h`)
    for (const r of rows ?? []) winsMap[String(r.id)] = { wins: Number(r.w) || 0, hits: Number(r.h) || 0 }
  } catch {}
  for (const s of out) s.stats = winsMap[s.id] ?? { wins: 0, hits: 0 }
  return out
}

const MODEL_RE = /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/

/** 面板侧模型切换: 只改写 role 的 primary/backup 槽(默认槽与角色集合不动, 与 scheduler 口径一致)。
 *  原子写(tmp+rename); 空 model = 清除 backup(回到「无备·暂停」)。返回新 fleet。 */
export function writeFleet({ role, slot, model }, env = process.env) {
  const role_ = String(role ?? '').trim()
  const slot_ = String(slot ?? '') === 'backup' ? 'backup' : 'primary'
  const model_ = String(model ?? '').trim()
  if (!role_) throw new Error('role required')
  if (model_ && !MODEL_RE.test(model_)) throw new Error(`bad model id "${model_}" (expect provider/model)`)
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const file = `${dir}/config/model-policies.json`
  let p = {}
  try { p = JSON.parse(fs.readFileSync(file, 'utf8')) } catch (e) { throw new Error(`model-policies.json unreadable: ${e?.message ?? e}`) }
  if (!p.roles || typeof p.roles !== 'object') p.roles = {}
  const cur = p.roles[role_] ?? { primary: '', backup: '' }
  cur[slot_] = model_
  p.roles[role_] = { primary: String(cur.primary ?? ''), backup: String(cur.backup ?? '') }
  fs.mkdirSync(`${dir}/config`, { recursive: true })
  const tmp = `${file}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify(p, null, 2))
  fs.renameSync(tmp, file)
  return readFleet(env)
}

/** 运行事件(scheduler run-log.jsonl + model-usage.jsonl 的面板投影) — 只读 tail, 任意一行坏行跳过。
 *  产出: { events: 轨迹事件(升序), usage: {model: 调度次数}, quotaHits: [model...] } */
export function readRunEvents({ engName, dataDir }, fsImpl = fs, env = process.env) {
  const out = { events: [], usage: {}, quotaHits: [], cost: { dispatches24h: 0, terminals24h: 0, workerMin24h: 0, steps24h: 0, quotaEvents24h: 0 } }
  const dir = env.D2D_DATA_DIR ?? dataDir ?? `${os.homedir()}/.d2d-data`
  // 与 scheduler.js RUNS_BASE 同口径: P2P_RUNS_DIR/D2D_RUNS_DIR 优先, 否则 DATA_DIR/runs
  const runs = env.D2D_RUNS_DIR ?? env.P2P_RUNS_DIR ?? `${dir}/runs`
  // model-usage.jsonl: 每 worker 派发一行 {ts, worker, role, model}
  // P2-10 起终态行还带 {event:'terminal', code, ms, quota, steps, tools, compactions} — 这里顺带算 24h 烧速
  const cutoff = Date.now() - 86_400_000
  try {
    const lines = fsImpl.readFileSync(`${runs}/model-usage.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.usageLines)
    for (const ln of lines) {
      try {
        const r = JSON.parse(ln)
        const m = String(r?.model ?? '')
        if (m && !r?.event) out.usage[m] = (out.usage[m] ?? 0) + 1
        const t = r?.ts ? Date.parse(r.ts) : NaN
        if (Number.isFinite(t) && t >= cutoff) {
          if (!r?.event || r.event === 'dispatch') out.cost.dispatches24h++
          else if (r.event === 'terminal') {
            out.cost.terminals24h++
            out.cost.workerMin24h += Number(r.ms ?? 0) / 60_000
            out.cost.steps24h += Number(r.steps ?? 0) || 0
            if (r.quota) out.cost.quotaEvents24h++
          }
        }
      } catch {}
    }
    out.cost.workerMin24h = Math.round(out.cost.workerMin24h)
  } catch {}
  // run-log.jsonl: dispatch/terminal/zero-write/handoff 事件(轨迹主线)
  if (engName) {
    try {
      const lines = fsImpl.readFileSync(`${runs}/${engName}/run-log.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.runLogLines)
      for (const ln of lines) {
        try {
          const r = JSON.parse(ln)
          const ev = {
            ts: String(r?.ts ?? ''),
            kind: String(r?.event ?? ''),
            worker: String(r?.worker_id ?? ''),
            ring: String(r?.ring ?? ''),
            role: String(r?.role ?? ''),
            model: String(r?.model ?? ''),
            code: r?.code ?? null,
            quota: r?.quota ? String(r.quota) : '',
            reason: String(r?.reason ?? ''),
          }
          if (ev.kind) out.events.push(ev)
          if (ev.kind === 'terminal' && ev.quota && ev.model && !out.quotaHits.includes(ev.model)) out.quotaHits.push(ev.model)
        } catch {}
      }
    } catch {}
  }
  return out
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

// ---------- 聚合 ----------
function projectEngagement(row) {
  if (!row) return null
  return {
    name: cap(row.name, MAX.title),
    target: cap(row.target, MAX.target),
    scope: cap(row.scope, MAX.scope),
    status: String(row.status ?? ''),
    created_at: String(row.created_at ?? ''),
  }
}

/**
 * buildSnapshot(query, { fleet, runEvents }) → 聚合快照(一条响应, PANEL-UI-SPEC §5)。
 * query: async (cypher, params) => rows —— 任何一次图读取失败整体抛错(fail-closed,
 * 不下发过期/半截快照); 由 HTTP 层转 503。
 * runEvents: readRunEvents 产物(可选; 缺省时轨迹/用量区降级为空)。
 */
export async function buildSnapshot(query, { fleet = null, runEvents = null } = {}) {
  const strategies = await loadStrategies(process.env, query).catch(() => [])
  const [engActiveRows, agents, byStateRows, findings, signals, endpoints, signalsOpen, hypsOpen, experience, experienceTail, coverageRows, gapRows, handoffRows] = await Promise.all([
    query(Q.engActive),
    query(Q.agents),
    query(Q.findingsByState),
    query(Q.findingsList),
    query(Q.signalsTail),
    query(Q.cntEndpoints),
    query(Q.cntSignalsOpen),
    query(Q.cntHypsOpen),
    query(Q.cntExperience),
    query(Q.experienceTail),
    query(Q.coverage),
    query(Q.gaps),
    query(Q.handoffs),
  ])
  // 无 active 时带出最近终态供上下文(PANEL-UI-SPEC §7: 不做历史切换)
  const engRows = engActiveRows?.length ? engActiveRows : await query(Q.engLast)

  const byState = {}
  for (const s of FINDING_STATES) byState[s] = 0
  for (const r of byStateRows ?? []) {
    const k = String(r?.state ?? '')
    if (k in byState) byState[k] = num(r?.n)
  }

  const now = new Date()
  const covTotal = num(coverageRows?.[0]?.total)
  const covCovered = num(coverageRows?.[0]?.covered)
  // R6.1: 黑名单可视 —— 全局 denylist.json + 当前 engagement scope 的 `!` 条目合并展示
  const scopeStr = String(engRows?.[0]?.scope ?? '')
  const denyFromScope = scopeStr.split(',').map((s) => s.trim()).filter((s) => s.startsWith('!')).map((s) => s.slice(1))
  const gd = readDenylist()
  const denylist = {
    domains: [...new Set([...gd.domains, ...denyFromScope])],
    cidr_prefix: [...gd.cidr_prefix],
  }
  return {
    ok: true,
    now: now.toISOString(),
    engagement: projectEngagement(engRows?.[0] ?? null),
    denylist,
    caps: readCaps(),
    counts: {
      endpoints: num(endpoints?.[0]?.n),
      signals_open: num(signalsOpen?.[0]?.n),
      hypotheses_open: num(hypsOpen?.[0]?.n),
      findings: FINDING_STATES.reduce((a, s) => a + byState[s], 0),
      experience: num(experience?.[0]?.n),
    },
    coverage: { total: covTotal, covered: covCovered },
    gaps: (gapRows ?? []).map((g) => String(g?.bc ?? '')).filter(Boolean),
    milestones: (handoffRows ?? []).map((h) => ({
      id: String(h?.id ?? ''),
      digest: cap(h?.digest, MAX.digest),
      model: String(h?.model ?? ''),
      created_at: String(h?.created_at ?? ''),
    })).reverse(), // 升序: 里程碑刻度按时间从左到右
    findings: {
      byState,
      macro: groupStates(byState),
      list: (findings ?? []).map((f) => ({
        id: String(f?.id ?? ''),
        title: cap(f?.title, MAX.title),
        severity: String(f?.severity ?? 'info'),
        cvss: fnum(f?.cvss),
        state: String(f?.state ?? 'candidate'),
        category: String(f?.category ?? ''),
        ts: String(f?.ts ?? ''),
        verified_at: String(f?.verified_at ?? ''),
        last_transition: cap(f?.last_transition, MAX.traj),
      })),
    },
    agents: markZombie((agents ?? []).map((a) => ({
      worker_id: String(a?.worker_id ?? ''),
      ring: String(a?.ring ?? ''),
      chain: String(a?.chain ?? ''),
      status: String(a?.status ?? ''),
      checkpoint: cap(a?.checkpoint, MAX.checkpoint),
      todo: cap(a?.todo, MAX.todo),
      updated_at: String(a?.updated_at ?? ''),
    })), now.getTime()),
    signals: (signals ?? []).map((s) => ({
      id: String(s?.id ?? ''),
      type: String(s?.type ?? ''),
      weight: fnum(s?.weight),
      ts: String(s?.ts ?? ''),
    })),
    experience: (experienceTail ?? []).map((x) => ({
      id: String(x?.id ?? ''),
      pattern: String(x?.pattern ?? ''),
      stack: String(x?.stack ?? ''),
      prior: fnum(x?.prior),
      hits: num(x?.hits),
      wins: num(x?.wins),
      target_type: String(x?.target_type ?? ''),
    })),
    fleet, // null = 未配置模型策略(fleet 卡降级为空态)
    strategies, // 策略库(#89 吸纳): 知识卡全量 + wins/hits 战果, 面板策略库浏览卡数据源
    run: {
      events: runEvents?.events ?? [],
      usage: runEvents?.usage ?? {},
      quotaHits: runEvents?.quotaHits ?? [],
    },
  }
}

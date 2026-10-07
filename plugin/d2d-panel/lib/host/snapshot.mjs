// snapshot.mjs — 快照聚合(host 半核心, 纯逻辑可单测)
// 数据流: graphd /query(host token 合法读通道, app.py:436-445) → 一条聚合 JSON → 浏览器
// 字段名与 graphd/app.py:51-65 schema 逐字对齐; 七态与 app.py:110 FINDING_STATES 一致。
// 契约见 docs/PANEL-UI-SPEC.md §5: 浏览器永不碰凭证; wire 不带 evidence 全文与 repro。

import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export const FINDING_STATES = ['candidate', 'triaged', 'verified', 'isolated', 'reported', 'accepted', 'rejected', 'needs-scope']
export const MACRO_GROUPS = [
  { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
  { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
  { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
  { key: 'needs-scope', label: '边界待澄清', states: ['needs-scope'] },
  { key: 'rejected', label: '已驳回', states: ['rejected'] },
]
export const ZOMBIE_MS = 30_000
const MAX = { title: 200, scope: 200, target: 200, workers: 50, findings: 200, signals: 50, exp: 100, checkpoint: 400, todo: 400, traj: 400, digest: 160, usageLines: 2000, runLogLines: 400, sigEvidence: 0 }
// T3-3-2 收官批护栏(t3-3-plan §6 定稿): 文件尾读类路由全部 tail-N + 服务端钳位 —
// transition-log/audit.log 无轮转(transition_log.py/audit.py 只追加), 线性增长, 严禁整文件进热路径。
Object.assign(MAX, {
  sankeyLines: 20000, // 桑基: transition-log.jsonl 尾读上限(现量 1652 行/6 天, 上限≈一年量级)
  auditLines: 3000, // 审计时间线: audit.log 尾读上限
  auditTransLines: 2000, // 审计时间线: transition-log.jsonl 合并尾读上限
  toolLines: 600, // 工具调用明细: run-log 尾读上限(明细页比快照轨迹区 400 行略宽)
})

// ---------- T3-3-2: 9 标签页数据面(桑基/审计/工具调用/链路/前沿/配置) ----------
// 图依赖路由(chain/frontier)复用 vizRoute fail-closed; 文件尾读路由(桑基/审计/工具调用/configx)
// fail-soft 恒 200+degraded 记因 — 与 T3-3-1 capability 同款语义。
export const FLOWS = {
  daysDefault: 7,
  daysMax: 90,
  families: ['finding', 'experience', 'frontier', 'other'],
  // node_id 前缀 → 迁移族(transition_log.py 写入方实锚: f-* Finding / exp-* Experience / fr-* Frontier)
  familyOf: (nodeId) => {
    const s = String(nodeId ?? '')
    if (s.startsWith('f-')) return 'finding'
    if (s.startsWith('exp-')) return 'experience'
    if (s.startsWith('fr-')) return 'frontier'
    return 'other'
  },
}
export const CHAIN = { tasks: 50, findings: 100, endpoints: 200, edges: 300 }
export const FRONTIER_POOL_LIMIT = 100

const Q_CHAIN = {
  tasks: `MATCH (t:Task) WHERE t.eng = $eng RETURN t.id AS id, t.kind AS kind, t.status AS status, t.link_id AS link_id, t.claimed_by AS claimed_by, t.created_at AS created_at ORDER BY coalesce(t.created_at, '') DESC LIMIT ${CHAIN.tasks}`,
  confirms: `MATCH (f:Finding)-[:CONFIRMS]->(s:Signal_) WHERE f.eng = $eng RETURN f.id AS a, s.id AS b LIMIT ${CHAIN.edges}`,
  at: `MATCH (s:Signal_)-[:AT]->(e:Endpoint) WHERE s.eng = $eng RETURN s.id AS a, e.id AS b LIMIT ${CHAIN.edges}`,
  suggests: `MATCH (h:Hypothesis)-[:SUGGESTS]->(e:Endpoint) WHERE h.eng = $eng RETURN h.id AS a, e.id AS b LIMIT ${CHAIN.edges}`,
  endpoints: `MATCH (e:Endpoint) WHERE e.eng = $eng RETURN e.id AS id, e.url AS url, e.method AS method LIMIT ${CHAIN.endpoints}`,
  findings: `MATCH (f:Finding) WHERE f.eng = $eng RETURN f.id AS id, f.title AS title, f.severity AS severity, f.gate_status AS state ORDER BY coalesce(f.ts, '') DESC LIMIT ${CHAIN.findings}`,
}
const Q_FRONTIER_POOL = `MATCH (x:Frontier) WHERE x.eng_id = $eng RETURN x.id AS id, x.direction AS direction, x.status AS status, x.proposed_by AS proposed_by, x.created_at AS created_at, x.value_score AS value_score, x.review_note AS review_note, x.accepted_to_hypothesis_ref AS hypothesis_ref ORDER BY x.created_at DESC LIMIT ${FRONTIER_POOL_LIMIT}`
// 总览补全(拍板 1): 每 engagement severity 计数 — 一条聚合查询喂全列表(逐 eng 循环查询会放大图读)
const Q_FINDINGS_SEV = `MATCH (f:Finding) RETURN f.eng AS eng, f.severity AS severity, count(f) AS n`

// 全部只读 MATCH; host token 通道下不触发 worker 只读白名单(本就放行)
// W5: 池子查询全部按 $eng 过滤(engagement 池子隔离) — 面板只显示选中 engagement 的项目数据;
// ExperienceWeight(经验)/模型策略跨项目共享, 不过滤。eng 列缺失的旧库行由 graphd 启动回填归属。
const Q = {
  engList: `MATCH (e:Engagement) RETURN e.name AS name, e.target AS target, e.scope AS scope, e.status AS status, e.created_at AS created_at, e.instances AS instances, e.objective AS objective ORDER BY coalesce(e.created_at, '') DESC LIMIT 50`,
  findingsByEng: `MATCH (f:Finding) RETURN f.eng AS eng, f.gate_status AS state, count(f) AS n`,
  workersByEng: `MATCH (a:AgentIdentity) WHERE a.status = 'running' RETURN a.eng AS eng, count(a) AS n`,
  agents: `MATCH (a:AgentIdentity) WHERE a.eng = $eng RETURN a.worker_id AS worker_id, a.ring AS ring, a.chain AS chain, a.status AS status, a.checkpoint AS checkpoint, a.todo AS todo, a.updated_at AS updated_at ORDER BY coalesce(a.updated_at, '') DESC LIMIT ${MAX.workers}`,
  findingsByState: `MATCH (f:Finding) WHERE f.eng = $eng RETURN f.gate_status AS state, count(f) AS n`,
  findingsList: `MATCH (f:Finding) WHERE f.eng = $eng RETURN f.id AS id, f.title AS title, f.severity AS severity, f.cvss AS cvss, f.gate_status AS state, f.category AS category, f.ts AS ts, f.verified_at AS verified_at, f.last_transition AS last_transition, f.dual_sign AS dual_sign ORDER BY coalesce(f.ts, '') DESC LIMIT ${MAX.findings}`,
  // WRAP-2 #18: 幻觉抽检人口=Experience 表 quarantined 隔离池(与 ExperienceWeight 先验表异表)——
  // 面板抽检浏览面数据源; 裁决回流经 /write/adjudicate(experience revoke)。
  quarantine: `MATCH (x:Experience) WHERE x.status='quarantined' RETURN x.id AS id, x.title AS title, x.created_at AS created_at ORDER BY coalesce(x.created_at, '') DESC LIMIT 12`,
  experienceTail: `MATCH (x:ExperienceWeight) RETURN x.id AS id, x.pattern AS pattern, x.stack AS stack, x.prior AS prior, x.hits AS hits, x.wins AS wins, x.target_type AS target_type ORDER BY coalesce(x.prior, 1.0) DESC, coalesce(x.hits, 0) DESC LIMIT ${MAX.exp}`,
  signalsTail: `MATCH (s:Signal_) WHERE s.status = 'open' AND s.eng = $eng RETURN s.id AS id, s.type AS type, s.weight AS weight, s.ts AS ts ORDER BY coalesce(s.ts, '') DESC LIMIT ${MAX.signals}`,
  coverage: `MATCH (e:Endpoint) WHERE e.eng = $eng RETURN count(e) AS total, sum(CASE WHEN e.exhausted = true OR e.coverage_votes >= 2 THEN 1 ELSE 0 END) AS covered`,
  gaps: `MATCH (e:Endpoint) WHERE e.exhausted = false AND e.coverage_votes < 2 AND e.eng = $eng RETURN DISTINCT e.business_chain AS bc LIMIT 3`,
  handoffs: `MATCH (h:Handoff) WHERE h.eng = $eng RETURN h.id AS id, h.digest AS digest, h.model AS model, h.created_at AS created_at ORDER BY coalesce(h.created_at, '') DESC LIMIT 6`,
  cntEndpoints: `MATCH (e:Endpoint) WHERE e.eng = $eng RETURN count(e) AS n`,
  cntSignalsOpen: `MATCH (s:Signal_) WHERE s.status = 'open' AND s.eng = $eng RETURN count(s) AS n`,
  cntHypsOpen: `MATCH (h:Hypothesis) WHERE h.status = 'open' AND h.eng = $eng RETURN count(h) AS n`,
  cntExperience: `MATCH (x:ExperienceWeight) RETURN count(x) AS n`,
  // T2-1-2 转化率卡(看板 8.5-2): Frontier 两闭环锚点列按 selected eng 直读 — /query/frontier 不返回
  // ref 列, 直发只读 MATCH 最省; 列名是 eng_id(Frontier 表专用, 非 Finding/Hypothesis 的 eng)。
  // 口径真源 = graphd/gd/gates.py:1003-1028 frontier_conversion_rate, 计算抽在 computeConversion。
  frontierConversion: `MATCH (x:Frontier) WHERE x.eng_id = $eng RETURN x.accepted_to_hypothesis_ref AS accepted_to_hypothesis_ref, x.hypothesis_to_confirmed_ref AS hypothesis_to_confirmed_ref`,
}

// ---------- T3-3-1 viz 数据面(三图; 桑基归批 2) ----------
// 护栏参数(t3-3-plan §1 定稿): 星图服务端取数 LIMIT 500 / 泳道明细 LIMIT 200 / 文本截断。
// 渲染上限(节点 200/边 300)是 client 侧职责, 服务端只给 total 供截断提示。
export const VIZ = {
  starmapNodes: 500,
  hypItems: 200,
  hypLaneDaysDefault: 14,
  hypLaneDaysMax: 90,
  textCap: 160,
}
// 覆盖象限 21 格枚举(与 plugin/pentest-dsh/domain/allocator.mjs:363-364 同源 — 面板侧
// 静态副本, 避免跨包 import 连坐; 枚举由 graphd 写入侧软校验钉死, 漂移即失真)。
export const COVERAGE_SURFACES = ['request', 'response', 'js', 'business', 'flow', 'apk', 'mini']
export const COVERAGE_BOUNDARIES = ['outer', 'inner', 'cross']

const Q_VIZ = {
  starmapSignals: `MATCH (s:Signal_) WHERE s.eng = $eng AND s.status = 'open' RETURN s.id AS id, s.type AS type, s.weight AS weight, s.ts AS ts, s.evidence AS evidence ORDER BY coalesce(s.ts, '') DESC LIMIT ${VIZ.starmapNodes}`,
  starmapDerived: `MATCH (a:Signal_)-[:DERIVED_FROM]->(b:Signal_) WHERE a.eng = $eng RETURN a.id AS a, b.id AS b LIMIT 1000`,
  covHeat: `MATCH (s:Signal_) WHERE s.eng = $eng AND s.surface <> '' AND s.boundary <> '' RETURN s.surface AS su, s.boundary AS bo, count(s) AS n`,
  hypByStatus: `MATCH (h:Hypothesis) WHERE h.eng = $eng RETURN h.status AS status, count(h) AS n`,
  hypItems: `MATCH (h:Hypothesis) WHERE h.eng = $eng AND coalesce(h.ts, '') > $since RETURN h.id AS id, h.text AS text, h.strategy AS strategy, h.status AS status, h.ts AS ts ORDER BY coalesce(h.ts, '') DESC LIMIT ${VIZ.hypItems}`,
}

/** evidence 文本提 hostname(starmap-tick.mjs:25 同款; wire 不带 evidence 全文, 只外传 host)。 */
function vizHostOf(ev) {
  try { return new URL((String(ev ?? '').match(/https?:\/\/[^\s"']+/) ?? [''])[0]).hostname.toLowerCase() } catch { return '' }
}

/** runLog candidate-links 事件 pairs 解析('aId(aType)~bId(bType)@host' 字符串数组 → 结构化;
 *  解析失败整条丢弃不中断 — starmap-tick.mjs:58 产出, 候选连线唯一持久源[内存态重启即丢])。 */
export function parseCandidatePairs(pairs) {
  const out = []
  for (const p of Array.isArray(pairs) ? pairs : []) {
    const m = /^(.+)\(([^)]*)\)~(.+)\(([^)]*)\)@(.+)$/.exec(String(p ?? ''))
    if (m) out.push({ a: m[1], aType: m[2], b: m[3], bType: m[4], host: m[5] })
  }
  return out
}

/** 泳道时间窗钳位(1..VIZ.hypLaneDaysMax; 非法回缺省 — writeCaps 钳位先例)。 */
export function clampLaneDays(v) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n <= 0) return VIZ.hypLaneDaysDefault
  return Math.min(n, VIZ.hypLaneDaysMax)
}

/** viz 星图数据(纯函数): 节点(host 半提 hostname, evidence 不出 host)+DERIVED_FROM 边
 *  (两端均在取数集内)+runLog 候选连线合成。查询抛错整体上抛(路由层 503 fail-closed)。 */
export async function buildStarmap(q, { eng, runEvents = { events: [] } } = {}) {
  const [sigRows, derivedRows] = await Promise.all([
    q(Q_VIZ.starmapSignals, { eng }),
    q(Q_VIZ.starmapDerived, { eng }),
  ])
  const nodes = (sigRows ?? []).map((r) => ({
    id: String(r.id ?? ''), type: String(r.type ?? ''), weight: num(r.weight),
    ts: String(r.ts ?? ''), host: vizHostOf(r.evidence),
  }))
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = (derivedRows ?? [])
    .map((r) => ({ a: String(r.a ?? ''), b: String(r.b ?? '') }))
    .filter((e) => nodeIds.has(e.a) && nodeIds.has(e.b))
  // 候选连线(runLog 事件流; 内存态重启即丢 — tail 窗口内至多数条、每条 ≤5 对)
  const candidates = (runEvents?.events ?? [])
    .filter((e) => String(e?.kind ?? e?.event ?? '') === 'candidate-links')
    .flatMap((e) => parseCandidatePairs(e.pairs))
  return { nodes, edges, total: nodes.length, truncated: nodes.length >= VIZ.starmapNodes, candidates }
}

/** viz 覆盖热力(纯函数): 21 格填充(枚举外坐标已在服务端 WHERE 剔除; 格序按枚举稳定)。 */
export async function buildCoverage(q, { eng } = {}) {
  const heatRows = await q(Q_VIZ.covHeat, { eng })
  const heatMap = new Map((heatRows ?? []).map((r) => [`${String(r.su)}|${String(r.bo)}`, num(r.n)]))
  const cells = []
  for (const su of COVERAGE_SURFACES) for (const bo of COVERAGE_BOUNDARIES) cells.push({ su, bo, n: heatMap.get(`${su}|${bo}`) ?? 0 })
  return { surfaces: COVERAGE_SURFACES, boundaries: COVERAGE_BOUNDARIES, cells, total: cells.reduce((a, c) => a + c.n, 0) }
}

/** viz 假设泳道(纯函数): 生命周期 open→claimed→confirmed|refuted|suspected(app.py:849);
 *  时间窗 $since 参数绑定(钳位 clampLaneDays)。 */
export async function buildHypLane(q, { eng, days = VIZ.hypLaneDaysDefault, nowMs = Date.now() } = {}) {
  const since = new Date(Math.max(0, nowMs - clampLaneDays(days) * 86_400_000)).toISOString()
  const [statusRows, itemRows] = await Promise.all([
    q(Q_VIZ.hypByStatus, { eng }),
    q(Q_VIZ.hypItems, { eng, since }),
  ])
  const byStatus = { open: 0, claimed: 0, confirmed: 0, refuted: 0, suspected: 0 }
  for (const r of statusRows ?? []) { const k = String(r.status ?? ''); if (k in byStatus) byStatus[k] = num(r.n) }
  const items = (itemRows ?? []).map((r) => ({
    id: String(r.id ?? ''), text: cap(r.text, VIZ.textCap), strategy: cap(r.strategy, 60),
    status: String(r.status ?? 'open'), ts: String(r.ts ?? ''),
  }))
  return { byStatus, items, windowDays: clampLaneDays(days) }
}

/** 能力看板数据(纯静态读: manifest 符号 + baselines 键计数 + 工具清单推导; 零 graphd 查询)。
 *  缺席降级: 各源独立 try/catch, 缺什么 degraded 记什么(看板卡非关键路径, fail-soft)。 */
export function buildCapability({ manifest, baselinesRaw } = {}) {
  const degraded = []
  let exports = null, forms = null, manifestValid = null
  try {
    if (!manifest || !Array.isArray(manifest.exports)) throw new Error('manifest 形态非法')
    forms = Array.isArray(manifest.forms) ? manifest.forms : null
    manifestValid = true
    exports = manifest.exports.map((e) => ({ form: String(e.form ?? ''), id: String(e.id ?? ''), status: String(e.status ?? ''), impl: String(e.impl ?? ''), note: String(e.note ?? '') }))
  } catch (e) { degraded.push(`manifest: ${String(e?.message ?? e).slice(0, 80)}`) }
  let baselineKeys = null, baselineVersion = null, tools = null
  try {
    const j = typeof baselinesRaw === 'string' ? JSON.parse(baselinesRaw) : baselinesRaw
    if (!j || !Array.isArray(j.baselines)) throw new Error('baselines 形态非法')
    baselineVersion = String(j.version ?? '')
    baselineKeys = j.baselines.length
    tools = [...new Set(j.baselines.map((b) => String(b.tool ?? '').split('.')[0]))].filter(Boolean).sort()
  } catch (e) { degraded.push(`baselines: ${String(e?.message ?? e).slice(0, 80)}`) }
  return {
    manifest: exports ? { generated: String(manifest.generated ?? ''), forms, exports } : null,
    manifestValid,
    baselines: baselineKeys === null ? null : { version: baselineVersion, keys: baselineKeys, tools },
    degraded,
  }
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

// ── W5: 当前选中 engagement(面板/dsh 会话共享的"项目视图"开关) ──
// 纯视图概念: 切换只改本文件, 不启停任何 worker; 面板全部池子查询按它过滤, 切回旧项目记录全在。
export const selectedFile = (env = process.env) =>
  `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/selected-engagement.json`

export function readSelectedEngagement(env = process.env) {
  try { return String(JSON.parse(fs.readFileSync(selectedFile(env), 'utf8')).name ?? '').trim() } catch { return '' }
}

export function writeSelectedEngagement(name, env = process.env) {
  const n = String(name ?? '').trim()
  if (!n) throw new Error('engagement name required')
  fs.mkdirSync(`${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config`, { recursive: true })
  const tmp = `${selectedFile(env)}.tmp-${process.pid}-${Date.now()}`
  fs.writeFileSync(tmp, JSON.stringify({ name: n, updated_at: new Date().toISOString() }, null, 2) + '\n')
  fs.renameSync(tmp, selectedFile(env))
  return n
}

/** W4: 容量热调(caps.json) — 面板容量卡片的读写源; 调度器每 tick 热读同一文件, 免重启生效。 */
export function readCaps(env = process.env) {
  try {
    const p = env.P2P_CAPS_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/caps.json`
    const d = JSON.parse(fs.readFileSync(p, 'utf8'))
    return {
      caps: (d.caps && typeof d.caps === 'object') ? d.caps : {},
      deepParallel: d.deepParallel ?? null,
      maxAgents: d.maxAgents ?? null,
      backlogWatermark: d.backlogWatermark ?? null,
      // 0916: engagement 三门收敛节原样透传(读侧白名单解析在 domain/allocator.mjs parseRingTuning)
      engConverge: (d.engConverge && typeof d.engConverge === 'object' && !Array.isArray(d.engConverge)) ? d.engConverge : null,
      updated_at: String(d.updated_at ?? ''),
    }
  } catch { return { caps: {}, deepParallel: null, maxAgents: null, backlogWatermark: null, engConverge: null, updated_at: '' } }
}

const _CAP_KINDS = ['recon', 'deep-dive', 'chain', 'verify', 'creative', 'link']
const _CAP_RANGE = { kind: [1, 8], deepParallel: [1, 8], maxAgents: [1, 8], backlogWatermark: [5, 500] }
// 0916: engConverge 键表与 domain/allocator.mjs _ENG_CONVERGE_RANGE 同源(白名单+钳位)
const _ENG_CONVERGE_RANGE = {
  findingStableRounds: [1, 20], minVerified: [0, 1000], maxOpenFrontier: [0, 1000], noveltyFloor: [0, 1000],
  staleSignalTtlMin: [5, 240], softDeadlineMin: [10, 720], hardDeadlineMin: [15, 1440],
}
const _capInt = (v, [lo, hi]) => {
  const n = Number.parseInt(v, 10)
  if (!Number.isFinite(n) || n < lo || n > hi) throw new Error(`须为 ${lo}-${hi} 的整数, 得到 "${v}"`)
  return n
}

/** W4: 容量卡片写侧 — updates = { caps?:{kind:n}, deepParallel?, maxAgents?, backlogWatermark?, engConverge? };
 *  值 '' / null = 清除该覆盖(调度器回落 env); 钳位与 domain/caps.mjs 读侧一致, 越界直接报错。 */
export function writeCaps({ updates }, env = process.env) {
  const p = env.P2P_CAPS_FILE ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/config/caps.json`
  const cur = readCaps(env)
  const next = { caps: { ...cur.caps }, deepParallel: cur.deepParallel, maxAgents: cur.maxAgents, backlogWatermark: cur.backlogWatermark }
  if (cur.engConverge) next.engConverge = { ...cur.engConverge }   // 非本次写入的节原样保留(原实现会整节点丢失)
  const u = updates && typeof updates === 'object' ? updates : {}
  if (u.caps !== undefined && typeof u.caps !== 'object') throw new Error('caps 必须是对象')
  if (u.engConverge !== undefined && (typeof u.engConverge !== 'object' || u.engConverge === null || Array.isArray(u.engConverge))) throw new Error('engConverge 必须是对象')
  for (const [k, v] of Object.entries(u.caps ?? {})) {
    if (!_CAP_KINDS.includes(k)) throw new Error(`未知环节 "${k}"(可选: ${_CAP_KINDS.join('/')})`)
    if (v === '' || v === null) delete next.caps[k]
    else next.caps[k] = _capInt(v, _CAP_RANGE.kind)
  }
  for (const [k, v] of Object.entries(u.engConverge ?? {})) {
    const range = _ENG_CONVERGE_RANGE[k]
    if (!range) throw new Error(`未知 engConverge 键 "${k}"(可选: ${Object.keys(_ENG_CONVERGE_RANGE).join('/')})`)
    if (!next.engConverge) next.engConverge = {}
    if (v === '' || v === null) delete next.engConverge[k]
    else next.engConverge[k] = _capInt(v, range)
  }
  if (next.engConverge && !Object.keys(next.engConverge).length) delete next.engConverge
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
      // 中危审计修复(0910): roles 键并入对象前过滤危险键(手改文件可带 __proto__/constructor)
      if (/^(?:__proto__|constructor|prototype)$/i.test(String(k))) continue
      roles[k] = { primary: String(v?.primary ?? ''), backup: String(v?.backup ?? '') }
    }
    const fleet = { default: { primary: String(p?.default?.primary ?? ''), backup: String(p?.default?.backup ?? '') }, roles, models: [], catalog: [] }
    // 候选模型并集: 已被引用过的模型 + dsh 已注册供应商/模型(issue: 换槽选择器此前只有已用模型, 其余全靠手填)
    const seen = new Set()
    for (const m of [fleet.default.primary, fleet.default.backup, ...Object.values(roles).flatMap((r) => [r.primary, r.backup])]) {
      if (m && !seen.has(m)) { seen.add(m); fleet.models.push(m) }
    }
    let catalog = []
    try { catalog = loadDshCatalog(env) } catch { /* 已记因: 降级路径——dsh 目录枚举失败时 catalog 置空，fleet 卡降级 */ }
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
  } catch { /* 已记因: 降级路径——凭据文件缺失/不可读时跳过 refs 收集，仅用进程环境兜底 */ }
  for (const k of Object.keys(env)) if (/API_KEY/.test(k)) names.add(k)
  return names
}

/** 凭据 refs 合并(纯函数供 pytest/node test) — dsh 管理的 {version, refs:{ENV: key}} 平文本形态:
 * 已有 refs: 段 → 在段尾插入新条目; 无 → 文件尾新建 refs: 段。env 名白名单校验。
 * 中危审计修复(0910): value 旧版原样插入 — 含 `: `/换行/` #` 时可注入任意 YAML 键(注入面)。
 * 现统一双引号包裹 + YAML 双引号转义(`\ " \r \n \t`), 值永远解析为单个标量字符串。*/
export function mergeCredentialRefs(text, envName, value) {
  if (!/^[A-Za-z0-9_]+$/.test(String(envName || ''))) throw new Error('invalid credential env name')
  const yq = String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t')
  const lines = String(text ?? '').split(/\r?\n/)
  let refsStart = -1, refsEnd = -1
  lines.forEach((l, i) => {
    if (i === 0) return
    const m = l.match(/^(\s*)([A-Za-z0-9_.-]+):\s*(.*)$/)
    if (!m) return
    if (m[1] === '' && m[2] === 'refs') refsStart = i
    else if (refsStart >= 0 && m[1].startsWith('  ')) refsEnd = i
  })
  const entry = `  ${envName}: "${yq}"`
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
  } catch { /* 已记因: 降级路径——profiles 目录缺失/不可读时仅读 settings.yaml */ }
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
    } catch { /* 已记因: 解析容错——单个配置文件缺失/损坏时跳过，继续枚举其余文件 */ }
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
  } catch { /* 已记因: 降级路径——战果图查询失败时 wins/hits 置零，策略卡照常返回 */ }
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
  // 中危审计修复(0910): 原型污染 — role 直接作 p.roles 的键, `__proto__` 会把 {primary,backup}
  // 写进 Object.prototype(污染宿主进程全局), `constructor` 会命中函数对象。键限安全字符集 +
  // 显式黑名单(role 词形=模型角色 id: default/discovery/deep/creative/verify/study 等)。
  if (!/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(role_) || /^(?:__proto__|constructor|prototype)$/i.test(role_)) {
    throw new Error(`bad role id "${role_.slice(0, 40)}"`)
  }
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
  // 0913 审查 H19: engName 未消毒拼路径 — 白名单字符外的全部剥除(防 ../ 路径穿越读任意 jsonl)
  engName = String(engName ?? '').replace(/[^A-Za-z0-9._-]/g, '')
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
      } catch { /* 已记因: 解析容错——model-usage 坏行跳过，不中断其余行烧速统计 */ }
    }
    out.cost.workerMin24h = Math.round(out.cost.workerMin24h)
  } catch { /* 已记因: 降级路径——账本文件缺失/不可读时烧速口径留零值 */ }
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
        } catch { /* 已记因: 解析容错——run-log 坏行跳过，不影响其余轨迹事件 */ }
      }
    } catch { /* 已记因: 降级路径——轨迹文件缺失/不可读时事件列表留空 */ }
  }
  return out
}

// ── 阶段2: 性价比卡 — per-engagement token 账本聚合(runs/<eng>/model-usage.jsonl) ──
// 账本行是超集兼容形态(scheduler 既有 dispatch/terminal 行不含 token, 坏行跳过):
//   {ts, worker, role, model, event?, input_tokens?, output_tokens?}
// per-eng 账本缺失 → 回落全局 runs/model-usage.jsonl 按 worker 前缀过滤(worker id =
// '<eng>-<ring>-<suffix>', scheduler 同名口径); source 标账本来源, 卡片展示口径防误读。
export function readModelUsage({ engName, dataDir }, fsImpl = fs, env = process.env) {
  const out = { inputTokens: 0, outputTokens: 0, dispatches: 0, source: 'none' }
  const eng = String(engName ?? '').trim()
  if (!eng) return out
  const dir = env.D2D_DATA_DIR ?? dataDir ?? `${os.homedir()}/.d2d-data`
  const runs = env.D2D_RUNS_DIR ?? env.P2P_RUNS_DIR ?? `${dir}/runs`
  const posTok = (r, keys) => {
    for (const k of keys) {
      const n = Number(r?.[k])
      if (Number.isFinite(n) && n > 0) return n
    }
    return 0
  }
  const safeRead = (p) => {
    try { return fsImpl.readFileSync(p, 'utf8').split('\n').filter(Boolean).slice(-MAX.usageLines) } catch { return null }
  }
  let lines = safeRead(`${runs}/${eng.replace(/[/\\]/g, '_')}/model-usage.jsonl`)
  if (lines) out.source = 'per-eng'
  else {
    lines = safeRead(`${runs}/model-usage.jsonl`)
    if (lines) {
      out.source = 'global-filtered'
      const prefix = `${eng}-`
      lines = lines.filter((ln) => {
        try { return String(JSON.parse(ln)?.worker ?? '').startsWith(prefix) } catch { return false }
      })
    }
  }
  for (const ln of lines ?? []) {
    try {
      const r = JSON.parse(ln)
      if (r?.model && !r?.event) out.dispatches++
      out.inputTokens += posTok(r, ['input_tokens', 'inputTokens'])
      out.outputTokens += posTok(r, ['output_tokens', 'outputTokens'])
    } catch { /* 已记因: 解析容错——token 账本坏行跳过，不计入聚合 */ }
  }
  return out
}

/** 性价比纯计算(阶段2公式): 每 10 万 input tokens 的产出。tokens=0 → null(卡片渲染 '—',
 *  免除以零出假高效); 保留两位小数。总消耗 = input+output 原始 token 数(前端格式化)。 */
export function costEfficiency({ findingsTotal = 0, triagedTotal = 0, inputTokens = 0, outputTokens = 0, dispatches = 0, source = 'none' } = {}) {
  const per100k = (n) => (inputTokens > 0 ? Math.round(((n * 100_000) / inputTokens) * 100) / 100 : null)
  return {
    findings: Math.max(0, Math.round(Number(findingsTotal) || 0)),
    triaged: Math.max(0, Math.round(Number(triagedTotal) || 0)),
    inputTokens: Math.max(0, Math.round(Number(inputTokens) || 0)),
    outputTokens: Math.max(0, Math.round(Number(outputTokens) || 0)),
    dispatches: Math.max(0, Math.round(Number(dispatches) || 0)),
    source,
    findingsPer100k: per100k(findingsTotal),
    triagedPer100k: per100k(triagedTotal),
  }
}

/** 转化率度量(纯函数) — 与 graphd/gd/gates.py:1003-1028 frontier_conversion_rate 同名同义:
 *  两个闭环锚点列各自非空行数 / 总行数(空串/空白串 ref 记空, `v || ''` 与 gates str(v or '') 同义);
 *  空池三值全零(total=0, 两比率 0.0 — 无分母不产 NaN)。
 *  行形态: dict(按列名取, graphd /query 返回形态)或二元组 [a2h, h2c](gates 二元组支同义)。
 *  读侧消费(T2-1-2): 行来自 Q.frontierConversion(Frontier 按 selected eng 过滤); pytest 与本测试同锚。 */
export function computeConversion(rows) {
  let total = 0, a2h = 0, h2c = 0
  for (const r of rows ?? []) {
    const va = Array.isArray(r) ? r[0] : r?.accepted_to_hypothesis_ref
    const vc = Array.isArray(r) ? r[1] : r?.hypothesis_to_confirmed_ref
    total += 1
    if (String(va || '').trim()) a2h += 1
    if (String(vc || '').trim()) h2c += 1
  }
  return { total,
    accepted_to_hypothesis: total > 0 ? a2h / total : 0.0,
    hypothesis_to_confirmed: total > 0 ? h2c / total : 0.0 }
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
    const ap = await import('../../../pentest-dsh/scheduler/approvals.mjs')
    return { mode: ap.approvalMode(), pending: ap.pendingCount() }
  } catch { return null }
}

// ---------- T3-3-2: 桑基数据面 — transition-log.jsonl host 侧聚合(graphd 零改动) ----------
// 写入方实锚: graphd/gd/transition_log.py 恒 8 字段 append-only, 无轮转 — 尾读+时间窗,
// 严禁整文件进面板热路径(先例 10: 写新面先想「CI/他机没有这个文件会怎样」→ fail-soft)。

/** 整数钳位(非数值回缺省 — clampLaneDays 泛化)。 */
function clampInt(v, min, max, dflt) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n)) return dflt
  return Math.min(max, Math.max(min, n))
}

/** 时间窗钳位(1..FLOWS.daysMax)。 */
export function clampFlowDays(v) {
  const n = parseInt(v, 10)
  if (!Number.isFinite(n) || n <= 0) return FLOWS.daysDefault
  return Math.min(n, FLOWS.daysMax)
}

/** 逐节点流量聚合(纯函数): from→to 对计数, 族按 node_id 前缀分(f-/exp-/fr-);
 *  from===to 防御性跳过(FSM 不产生, 手动通道 /write/transition-log 脏行不硬凑视觉)。 */
export function aggregateTransitions(rows, { family = 'all' } = {}) {
  const links = []
  const index = new Map()
  for (const r of rows ?? []) {
    const from = String(r?.from_status ?? '')
    const to = String(r?.to_status ?? '')
    if (!from || !to || from === to) continue
    const fam = FLOWS.familyOf(r?.node_id)
    if (family !== 'all' && fam !== family) continue
    const key = `${fam}|${from}|${to}`
    let l = index.get(key)
    if (!l) { l = { family: fam, from, to, count: 0 }; index.set(key, l); links.push(l) }
    l.count++
  }
  return links.sort((a, b) => b.count - a.count)
}

/** 桑基数据(尾读+窗口+族过滤+聚合): 文件缺失/不可读 → 200 空态+degraded 记因(fail-soft),
 *  坏行跳过(readRunEvents 同款纪律)。rows 均为合法迁移事件(非法迁移走 audit.log)。 */
export function readTransitionFlows({ days = FLOWS.daysDefault, family = 'all', nowMs = Date.now() } = {}, fsImpl = fs, env = process.env) {
  const windowDays = clampFlowDays(days)
  const fam = FLOWS.families.includes(family) || family === 'all' ? String(family) : 'all'
  const out = { links: [], linesRead: 0, matched: 0, windowDays, family: fam, degraded: [] }
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const file = env.P2P_TRANSITION_LOG ?? `${dir}/logs/transition-log.jsonl`
  const since = nowMs - windowDays * 86_400_000
  let lines
  try {
    lines = fsImpl.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-MAX.sankeyLines)
  } catch (e) {
    out.degraded.push(`transition-log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`)
    return out
  }
  out.linesRead = lines.length
  const rows = []
  for (const ln of lines) {
    try {
      const r = JSON.parse(ln)
      const t = Date.parse(r?.timestamp ?? '')
      if (Number.isFinite(t) && t < since) continue
      rows.push(r)
    } catch { /* 坏行跳过 */ }
  }
  out.matched = rows.length
  out.links = aggregateTransitions(rows, { family: fam })
  return out
}

/** 审计时间线(双源合并尾读): audit.log({ts,kind,detail} — auth-fail/transition-illegal/
 *  denylist-hit/frontier-* 等)+ transition-log.jsonl(转态成功) — 非法迁移只进 audit.log,
 *  合流才是完整审计面。kind 过滤精确匹配; 降序取尾 limit。文件面 fail-soft。 */
export function readAuditTail({ limit = 200, kind = '' } = {}, fsImpl = fs, env = process.env) {
  const lim = clampInt(limit, 1, 500, 200)
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const events = []
  const degraded = []
  try {
    const file = env.P2P_AUDIT_LOG ?? `${dir}/logs/audit.log`
    const lines = fsImpl.readFileSync(file, 'utf8').split('\n').filter(Boolean).slice(-MAX.auditLines)
    for (const ln of lines) {
      try {
        const r = JSON.parse(ln)
        if (!r?.ts || !r?.kind) continue
        events.push({ ts: String(r.ts), source: 'audit', kind: String(r.kind), detail: r?.detail ?? null })
      } catch { /* 坏行跳过 */ }
    }
  } catch (e) { degraded.push(`audit.log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`) }
  try {
    const tfile = env.P2P_TRANSITION_LOG ?? `${dir}/logs/transition-log.jsonl`
    const lines = fsImpl.readFileSync(tfile, 'utf8').split('\n').filter(Boolean).slice(-MAX.auditTransLines)
    for (const ln of lines) {
      try {
        const r = JSON.parse(ln)
        if (!r?.timestamp) continue
        events.push({
          ts: String(r.timestamp), source: 'transition', kind: 'transition',
          detail: { node_id: String(r?.node_id ?? ''), from_status: String(r?.from_status ?? ''), to_status: String(r?.to_status ?? ''), actor: String(r?.actor ?? ''), reason: cap(r?.reason, 160) },
        })
      } catch { /* 坏行跳过 */ }
    }
  } catch (e) { degraded.push(`transition-log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`) }
  const kinds = [...new Set(events.map((e) => e.kind))].sort()
  const filtered = kind ? events.filter((e) => e.kind === String(kind)) : events
  filtered.sort((a, b) => String(b.ts).localeCompare(String(a.ts)))
  return { events: filtered.slice(0, lim), kinds, total: filtered.length, degraded }
}

/** run-log 其余键序列化截尾(事件词表非穷尽 — kind 白名单外的字段兜底渲染, 不丢关键线索)。 */
function extraOf(r) {
  const known = new Set(['ts', 'event', 'worker_id', 'ring', 'role', 'model', 'code', 'quota', 'reason', 'tool', 'command', 'cmd'])
  const rest = {}
  for (const k of Object.keys(r ?? {})) if (!known.has(k)) rest[k] = r[k]
  const s = JSON.stringify(rest)
  return s && s !== '{}' ? cap(s, 200) : ''
}

/** 工具调用明细(run-log 全事件投影 + per-worker 工具量): readRunEvents 同款尾读纪律 +
 *  H19 同款 engName 消毒; 明细投影放宽(kind 全集/tool/command/extra), 坏行跳过。fail-soft。 */
export function readToolCalls({ engName, limit = 200, kind = '' } = {}, fsImpl = fs, env = process.env) {
  const out = { eng: '', events: [], kinds: [], toolTotals: [], truncated: false, degraded: [] }
  const eng = String(engName ?? '').replace(/[^A-Za-z0-9._-]/g, '')
  out.eng = eng
  if (!eng) return out
  const lim = clampInt(limit, 1, MAX.toolLines, 200)
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const runs = env.D2D_RUNS_DIR ?? env.P2P_RUNS_DIR ?? `${dir}/runs`
  let lines
  try {
    lines = fsImpl.readFileSync(`${runs}/${eng}/run-log.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.toolLines)
  } catch (e) {
    out.degraded.push(`run-log 不可读: ${String(e?.code ?? e?.message ?? e).slice(0, 80)}`)
    return out
  }
  const all = []
  for (const ln of lines) {
    try {
      const r = JSON.parse(ln)
      const evKind = String(r?.event ?? '')
      if (!evKind) continue
      all.push({
        ts: String(r?.ts ?? ''), kind: evKind,
        worker: String(r?.worker_id ?? ''), ring: String(r?.ring ?? ''), role: String(r?.role ?? ''), model: String(r?.model ?? ''),
        code: r?.code ?? null, quota: r?.quota ? String(r.quota) : '', reason: cap(r?.reason, 160),
        tool: String(r?.tool ?? ''), command: cap(r?.command ?? r?.cmd, 160), extra: extraOf(r),
      })
    } catch { /* 坏行跳过 */ }
  }
  out.kinds = [...new Set(all.map((e) => e.kind))].sort()
  const filtered = kind ? all.filter((e) => e.kind === String(kind)) : all
  out.truncated = filtered.length > lim
  out.events = filtered.slice(-lim)
  // per-worker 工具量(model-usage.jsonl terminal 行 tools 字段 — scheduler.js 终态行实锚)
  const totals = new Map()
  try {
    const ml = fsImpl.readFileSync(`${runs}/${eng}/model-usage.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.usageLines)
    for (const ln of ml) {
      try {
        const r = JSON.parse(ln)
        if (r?.event !== 'terminal') continue
        const w = String(r?.worker ?? '')
        if (!w) continue
        const cur = totals.get(w) ?? { worker: w, tools: 0, terminals: 0 }
        cur.tools += Number(r?.tools) || 0
        cur.terminals += 1
        totals.set(w, cur)
      } catch { /* 坏行跳过 */ }
    }
  } catch { /* 账本缺失 → toolTotals 空(降级不记因: 明细主源不受影响) */ }
  out.toolTotals = [...totals.values()].sort((a, b) => b.tools - a.tools).slice(0, 20)
  return out
}

/** 探索链路(纯函数): Task 看板(/pentest-tasks 对等)+ worker/信号/端点/漏洞节点 + 四族边。
 *  查询抛错整体上抛(路由层 503 fail-closed) — buildStarmap 同款; 边两端不在取数集内则不画。 */
export async function buildChain(q, { eng } = {}) {
  const [taskRows, agentRows, sigRows, derivedRows, atRows, confirmsRows, suggestsRows, epRows, findingRows] = await Promise.all([
    q(Q_CHAIN.tasks, { eng }),
    q(Q.agents, { eng }),
    q(Q_VIZ.starmapSignals, { eng }),
    q(Q_VIZ.starmapDerived, { eng }),
    q(Q_CHAIN.at, { eng }),
    q(Q_CHAIN.confirms, { eng }),
    q(Q_CHAIN.suggests, { eng }),
    q(Q_CHAIN.endpoints, { eng }),
    q(Q_CHAIN.findings, { eng }),
  ])
  const pair = (rows) => {
    const seen = new Set()
    const out = []
    for (const r of rows ?? []) {
      const a = String(r?.a ?? ''), b = String(r?.b ?? '')
      if (!a || !b) continue
      const k = `${a}->${b}`
      if (seen.has(k)) continue
      seen.add(k)
      out.push({ a, b })
    }
    return out
  }
  return {
    tasks: (taskRows ?? []).map((r) => ({
      id: String(r?.id ?? ''), kind: String(r?.kind ?? ''), status: String(r?.status ?? ''),
      link_id: String(r?.link_id ?? ''), claimed_by: String(r?.claimed_by ?? ''), created_at: String(r?.created_at ?? ''),
    })),
    workers: (agentRows ?? []).map((r) => ({ worker_id: String(r?.worker_id ?? ''), ring: String(r?.ring ?? ''), chain: String(r?.chain ?? ''), status: String(r?.status ?? '') })),
    signals: (sigRows ?? []).map((r) => ({ id: String(r?.id ?? ''), type: String(r?.type ?? ''), weight: num(r?.weight), ts: String(r?.ts ?? ''), host: vizHostOf(r?.evidence) })),
    endpoints: (epRows ?? []).map((r) => ({ id: String(r?.id ?? ''), url: cap(r?.url, 160), method: String(r?.method ?? '') })),
    findings: (findingRows ?? []).map((r) => ({ id: String(r?.id ?? ''), title: cap(r?.title, MAX.title), severity: String(r?.severity ?? 'info'), state: String(r?.state ?? 'candidate') })),
    edges: { derived: pair(derivedRows), at: pair(atRows), confirms: pair(confirmsRows), suggests: pair(suggestsRows) },
    caps: { tasks: CHAIN.tasks, findings: CHAIN.findings, endpoints: CHAIN.endpoints, edges: CHAIN.edges },
  }
}

/** 前沿提案池(纯函数): Frontier 按 eng_id 全态列表(评审态/提案人/价值分/闭环 ref)。
 *  评审操作走 frontierTransition 代理(graphd FSM 门在服务端, 面板只透传)。 */
export async function buildFrontierPool(q, { eng } = {}) {
  const rows = await q(Q_FRONTIER_POOL, { eng })
  const pool = (rows ?? []).map((r) => ({
    id: String(r?.id ?? ''),
    direction: cap(r?.direction, MAX.title),
    status: String(r?.status ?? 'proposed'),
    proposed_by: String(r?.proposed_by ?? ''),
    created_at: String(r?.created_at ?? ''),
    value_score: fnum(r?.value_score),
    review_note: cap(r?.review_note, 160),
    hypothesis_ref: String(r?.hypothesis_ref ?? ''),
  }))
  const byStatus = {}
  for (const p of pool) byStatus[p.status] = (byStatus[p.status] ?? 0) + 1
  return { pool, total: pool.length, byStatus }
}

/** 面板侧前沿评审: 代理 graphd /write/frontier-transition(host token 通道, 迁移门+review_note
 *  审计在 graphd 校验)。transitionFinding 同款形态; reviewer 由 host 半钉死 'panel'。 */
export async function frontierTransition({ graphdUrl, token, frontierId, targetStatus, reviewNote }, fetchImpl = fetch, timeoutMs = 8000) {
  const res = await fetchImpl(`${graphdUrl}/write/frontier-transition`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Auth': token } : {}) },
    body: JSON.stringify({ frontier_id: String(frontierId ?? ''), target_status: String(targetStatus ?? ''), reviewer: 'panel', review_note: String(reviewNote ?? '') }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) throw new Error(String(data?.error ?? `graphd http ${res.status}`))
  return data
}

/** 配置总览(只读本地文件面): 通知通道(configured/method — webhook_url 内嵌推送 token,
 *  wire 纪律绝不回显值)+ 暂停清单(paused-<eng>.json)。fail-soft: 缺失=未配置不记因。 */
export function readConfigOverview(fsImpl = fs, env = process.env) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  const out = { notify: { configured: false, method: '', has_webhook: false }, paused: [], degraded: [] }
  try {
    const raw = JSON.parse(fsImpl.readFileSync(`${dir}/config/notify.json`, 'utf8'))
    out.notify = { configured: true, method: String(raw?.method ?? 'POST'), has_webhook: Boolean(raw?.webhook_url) }
  } catch (e) {
    if (e?.code !== 'ENOENT') out.degraded.push(`notify.json 不可读: ${String(e?.message ?? e).slice(0, 80)}`)
  }
  try {
    out.paused = fsImpl.readdirSync(`${dir}/config`)
      .filter((f) => f.startsWith('paused-') && f.endsWith('.json'))
      .map((f) => f.slice('paused-'.length, -'.json'.length))
  } catch { /* 目录缺失 = 无暂停项 */ }
  return out
}

/** 总览补全(拍板 1): 每 engagement 性价比(活跃优先取 ≤8 — 逐 eng 文件尾读有成本, 不放大;
 *  其余行 cost=null 前端渲染 '—')。原地标注(列表既有顺序不动 — 排序仅用于挑选 ≤8 名单)。 */
export function attachEngCosts(engagements, readImpl = readModelUsage, max = 8) {
  const rows = engagements ?? []
  for (const e of rows) e.cost = null
  const order = [...rows].sort((a, b) => (b.status === 'active' ? 1 : 0) - (a.status === 'active' ? 1 : 0))
  for (const e of order.slice(0, max)) {
    const mu = readImpl({ engName: e.name })
    e.cost = { inputTokens: mu.inputTokens, outputTokens: mu.outputTokens, dispatches: mu.dispatches, source: mu.source }
  }
  return rows
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

// ---------- XR-P2: X-Ring 只读聚合面(过程可见, M6) ----------
// 记录面外置红线(方案 §3⑦): xring/<eng>/<run-id>/events.jsonl 宿主监控进程独占写 —— 本函数纯读,
// worker 对该树不可达。fail-soft 恒不抛(xring 数据缺 = snapshot 该节缺省形态 available:false,
// 不炸面板 —— 与图查询 fail-closed 整体 503 语义刻意区分: 文件面邻居缺失是合法常态)。
export const XRING = Object.freeze({
  eventTail: 50, // 事件尾窗(拍板 2: 轮询快照即可, 不做 SSE)
  maxRuns: 20, // 历史 run 列表上限(新→旧; 活跃计数在截断前统计)
  maxScan: 40, // 扫描上限(XR-P3 拍板 7 成本上界: 按 mtime 新→旧扫描, 超出部分不解析——记录树积累不拖垮轮询)
  deriveLines: 2000, // 状态推导读尾上限(预算 tick 30s/条 ≈ 一天量级; 超长 run 的 monitor-start 可能落出窗 → budget:null 降级)
  staleAfterMs: 120_000, // 心跳失联阈(budget-tick 即心跳; env P2P_XRING_STALE_MS 可调——拍板 6)
})

/** X-Ring 记录面根目录(env 可注入; 与 cli.mjs DATA_DIR 同序)。 */
export function xringRecordBase(env = process.env) {
  return env.P2P_XRING_RECORD ?? `${env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`}/xring`
}

/** events.jsonl 单行 → wire 投影(封闭形态; 长字段截尾)。tokens/idleMs=XR-P3 运行中代理+停滞遥测。 */
function xringEventOf(r) {
  const e = { ts: String(r.ts ?? ''), event: String(r.event ?? '') }
  if (r.ok !== undefined) e.ok = r.ok === true
  if (r.reason !== undefined) e.reason = cap(r.reason, 60)
  if (r.detail !== undefined) e.detail = cap(r.detail, 160)
  if (Number.isFinite(r.tokens)) e.tokens = r.tokens
  if (Number.isFinite(r.idleMs)) e.idleMs = r.idleMs
  if (Number.isFinite(r.transcripts)) e.transcripts = r.transcripts
  return e
}

/** 单个 run 目录 → 投影(任何局部读失败 = degraded 记因继续, 不抛)。 */
function xringRunOf(eng, runId, runDir, fsImpl, nowMs, degraded, env = process.env) {
  const run = {
    eng: String(eng), runId: String(runId),
    status: 'unknown', stopReason: null, startedAt: null, elapsedSec: null,
    mode: null, budget: null, lastTick: null, artifacts: null, events: [],
  }
  let lines = []
  try {
    lines = fsImpl.readFileSync(path.join(runDir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean).slice(-XRING.deriveLines)
  } catch (e) {
    degraded.push(`${eng}/${runId}: events.jsonl 不可读(${String(e?.code ?? e?.message ?? e).slice(0, 60)})`)
    return run
  }
  const events = []
  for (const ln of lines) {
    try { events.push(JSON.parse(ln)) } catch { /* 坏行跳过(audit 同款语义) */ }
  }
  if (!events.length) {
    degraded.push(`${eng}/${runId}: 无可解析事件行`)
    return run
  }
  run.events = events.slice(-XRING.eventTail).map(xringEventOf)
  const start = events.find((e) => e.event === 'monitor-start')
  if (start) {
    run.budget = { maxHours: num(start.maxHours) || null, maxTokens: num(start.maxTokens) || null }
    if (start.mode !== undefined) run.mode = cap(start.mode, 20) // U2 三档（XR-P3 首事件落档）
  }
  const firstTs = Date.parse(events[0]?.ts ?? '')
  const startedMs = start ? Date.parse(start.ts ?? '') : (Number.isFinite(firstTs) ? firstTs : NaN)
  if (Number.isFinite(startedMs)) run.startedAt = new Date(startedMs).toISOString()
  const stop = [...events].reverse().find((e) => e.event === 'stop')
  run.status = stop ? 'stopped' : 'running'
  if (stop) run.stopReason = cap(stop.reason ?? '', 60) || null
  const endEv = stop ?? events[events.length - 1]
  const endMs = Date.parse(endEv?.ts ?? '')
  if (Number.isFinite(startedMs) && Number.isFinite(endMs)) {
    run.elapsedSec = +Math.max(0, ((stop ? endMs : nowMs) - startedMs) / 1000).toFixed(1)
  }
  const tick = [...events].reverse().find((e) => e.event === 'budget-tick')
  if (tick) {
    run.lastTick = { ok: tick.ok === true, detail: cap(tick.detail ?? '', 160) }
    if (Number.isFinite(tick.tokens)) run.lastTick.tokens = tick.tokens // 运行中转录尾代理（近精确）
    if (Number.isFinite(tick.idleMs)) run.lastTick.idleMs = tick.idleMs // 停滞遥测
  }
  // 工件计数(A=repro_paths.findings / B=hypotheses / C=lessons): 只在回流发生后可得 ——
  // reflow-start 事件携带 workspace 路径; 无回流 = null(计数不可得的诚实呈现, 不造 0)。
  const rs = [...events].reverse().find((e) => e.event === 'reflow-start')
  if (rs && rs.workspace) {
    const ws = String(rs.workspace)
    const count = (file, key) => {
      try {
        const doc = JSON.parse(fsImpl.readFileSync(path.join(ws, file), 'utf8'))
        return Array.isArray(doc?.[key]) ? doc[key].length : null
      } catch { return null }
    }
    const done = [...events].reverse().find((e) => e.event === 'reflow-done')
    run.artifacts = {
      A: count('repro_paths.json', 'findings'),
      B: count('hypotheses.json', 'hypotheses'),
      C: count('lessons.json', 'lessons'),
      reflow: done ? { written: num(done.written) || 0, held: num(done.held) || 0, errors: num(done.errors) || 0 } : null,
    }
  }
  // 心跳失联（拍板 6）: running 且末事件早于阈值 → stale 标记（面板降级警告+建议 stop;
  // monitor 死亡时 worker 会裸奔到自然退出——检测+警告为必做, 自动耦合杀=调查项登记）
  if (run.status === 'running') {
    const staleMs = Number(env.P2P_XRING_STALE_MS) || XRING.staleAfterMs
    const lastTs = Date.parse(events[events.length - 1]?.ts ?? '')
    if (Number.isFinite(lastTs) && nowMs - lastTs > staleMs) run.stale = { idleMs: nowMs - lastTs, thresholdMs: staleMs }
  }
  return run
}

/**
 * readXringRuns(opts, fsImpl, env) → X-Ring 记录面只读聚合。
 * 布局: <base>/<eng>/<run-id>/events.jsonl(smoke/编排层约定, runner.start recordRoot 同构)。
 * 返回 { available, base, activeCount, runs, degraded }; base 缺失 = available:false 空形态。
 */
export function readXringRuns(opts = {}, fsImpl = fs, env = process.env) {
  const base = opts.base ?? xringRecordBase(env)
  const nowMs = opts.nowMs ?? Date.now()
  const degraded = []
  let engDirs = []
  try {
    engDirs = fsImpl.readdirSync(base, { withFileTypes: true }).filter((d) => d.isDirectory())
  } catch {
    return { available: false, base, activeCount: 0, runs: [], degraded } // 无记录面 = 合法空态(尚未跑过任何 run)
  }
  const runs = []
  const candidates = []
  let scanned = 0
  let skipped = 0
  for (const eng of engDirs) {
    let runDirs = []
    try {
      runDirs = fsImpl.readdirSync(path.join(base, eng.name), { withFileTypes: true }).filter((d) => d.isDirectory())
    } catch (e) {
      degraded.push(`${eng.name}: 不可读(${String(e?.code ?? e?.message ?? e).slice(0, 60)})`)
      continue
    }
    for (const rd of runDirs) candidates.push({ eng: eng.name, runId: rd.name, dir: path.join(base, eng.name, rd.name) })
  }
  // 扫描成本上界（拍板 7）: 按 events.jsonl mtime 新→旧排序, 只解析最近 XRING.maxScan 个——
  // mtime 早退=记录树积累后老 run 不再逐次解析（活跃计数在"已扫描集合"内, cap 外 run 视为
  // 非活跃——上限 40 远大于单活跃守卫语义所需的可见窗口）
  candidates.sort((a, b) => {
    const mt = (c) => {
      try { return fsImpl.statSync(path.join(c.dir, 'events.jsonl')).mtimeMs } catch { return 0 }
    }
    return mt(b) - mt(a)
  })
  for (const c of candidates) {
    if (scanned >= XRING.maxScan) { skipped++; continue }
    scanned++
    runs.push(xringRunOf(c.eng, c.runId, c.dir, fsImpl, nowMs, degraded, env))
  }
  if (skipped > 0) degraded.push(`扫描上限 ${XRING.maxScan}: ${skipped} 个更早 run 未解析（mtime 排序截断）`)
  const activeCount = runs.filter((r) => r.status === 'running').length
  runs.sort((a, b) => String(b.startedAt ?? '').localeCompare(String(a.startedAt ?? '')))
  return { available: true, base, activeCount, runs: runs.slice(0, XRING.maxRuns), degraded }
}

/**
 * buildSnapshot(query, { fleet, runEvents, modelUsage, eng }) → 聚合快照(一条响应, PANEL-UI-SPEC §5)。
 * query: async (cypher, params) => rows —— 任何一次图读取失败整体抛错(fail-closed,
 * 不下发过期/半截快照); 由 HTTP 层转 503。
 * runEvents: readRunEvents 产物(可选; 缺省时轨迹/用量区降级为空)。
 * modelUsage: readModelUsage 产物(可选; 缺省时性价比卡降级为空态)。
 * eng: 当前选中 engagement 名(W5 池子隔离过滤键; 空 = 无选中, 全部池子区为空)。
 */
export async function buildSnapshot(query, { fleet = null, runEvents = null, modelUsage = null, eng = '', approvalSummary } = {}) {
  const strategies = await loadStrategies(process.env, query).catch(() => [])
  const approvals = approvalSummary !== undefined ? approvalSummary : await readApprovalSummary()
  const [engListRows, byEngRows, workersByEngRows, agents, byStateRows, findings, signals, endpoints, signalsOpen, hypsOpen, experience, experienceTail, coverageRows, gapRows, handoffRows, frontierRows, sevRows, quarantineRows] = await Promise.all([
    query(Q.engList),
    query(Q.findingsByEng),
    query(Q.workersByEng).catch(() => []),
    query(Q.agents, { eng }),
    query(Q.findingsByState, { eng }),
    query(Q.findingsList, { eng }),
    query(Q.signalsTail, { eng }),
    query(Q.cntEndpoints, { eng }),
    query(Q.cntSignalsOpen, { eng }),
    query(Q.cntHypsOpen, { eng }),
    query(Q.cntExperience),
    query(Q.experienceTail),
    query(Q.coverage, { eng }),
    query(Q.gaps, { eng }),
    query(Q.handoffs, { eng }),
    query(Q.frontierConversion, { eng }), // T2-1-2: Frontier 两 ref 列按 selected eng(空选中 → 空池全零)
    query(Q_FINDINGS_SEV), // T3-3-2 总览补全: 每 engagement severity 计数(一条聚合喂全列表)
    query(Q.quarantine), // WRAP-2 #18: 幻觉抽检浏览面(隔离池尾 12, 裁决回流经 adjudicate)
  ])

  // W5: 选中 = 显式 selected 文件 > 最新 active > 最新任意(历史回看)。每 engagement 进度聚合。
  const engRows = engListRows ?? []
  const selected = engRows.find((e) => String(e.name ?? '') === eng)
    ?? engRows.find((e) => String(e.status ?? '') === 'active')
    ?? engRows[0] ?? null
  const selName = String(selected?.name ?? '')
  const funnelOf = (name) => {
    const f = { active: 0, verified: 0, delivered: 0, 'needs-scope': 0, rejected: 0 }
    for (const r of byEngRows ?? []) {
      if (String(r.eng ?? '') !== String(name)) continue
      const s = String(r.state ?? '')
      if (s === 'candidate' || s === 'triaged') f.active += num(r.n)
      else if (s === 'verified' || s === 'isolated') f.verified += num(r.n)
      else if (s === 'reported' || s === 'accepted') f.delivered += num(r.n)
      else if (s in f) f[s] += num(r.n)
    }
    return f
  }
  const runningOf = (name) => {
    for (const r of workersByEngRows ?? []) if (String(r.eng ?? '') === String(name)) return num(r.n)
    return 0
  }
  // T3-3-2 总览补全: severity 按 eng 聚合(小写归一; 未知级别原样保留 — 渲染侧 sevColor 兜底)
  const sevOf = (name) => {
    const s = {}
    for (const r of sevRows ?? []) {
      if (String(r.eng ?? '') !== String(name)) continue
      const k = String(r.severity ?? 'info').toLowerCase()
      s[k] = (s[k] ?? 0) + num(r.n)
    }
    return s
  }
  const engagements = engRows.map((e) => ({
    name: cap(e.name, MAX.title),
    target: cap(e.target, MAX.target),
    scope: cap(e.scope, MAX.scope),
    status: String(e.status ?? ''),
    created_at: String(e.created_at ?? ''),
    objective: cap(e.objective, 300),
    instances: num(e.instances) || null,
    selected: String(e.name ?? '') === selName,
    progress: { ...funnelOf(String(e.name ?? '')), workers: runningOf(String(e.name ?? '')) },
    sev: sevOf(String(e.name ?? '')), // T3-3-2: {critical: n, high: n, ...}(总览卡 severity 列)
  }))

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
  const scopeStr = String(selected?.scope ?? '')
  const denyFromScope = scopeStr.split(',').map((s) => s.trim()).filter((s) => s.startsWith('!')).map((s) => s.slice(1))
  const gd = readDenylist()
  const denylist = {
    domains: [...new Set([...gd.domains, ...denyFromScope])],
    cidr_prefix: [...gd.cidr_prefix],
  }
  return {
    ok: true,
    now: now.toISOString(),
    engagement: projectEngagement(selected),
    engagements, // W5: 全部 engagement + 进度(管理卡数据源)
    selected: selName,
    denylist,
    caps: readCaps(),
    counts: {
      endpoints: num(endpoints?.[0]?.n),
      signals_open: num(signalsOpen?.[0]?.n),
      hypotheses_open: num(hypsOpen?.[0]?.n),
      findings: FINDING_STATES.reduce((a, s) => a + byState[s], 0),
      experience: num(experience?.[0]?.n),
    },
    // 阶段2: 性价比卡 — 当前 engagement 产出 ÷ input tokens(产出=全部 findings 与 triaged 两个口径)
    cost: costEfficiency({
      findingsTotal: FINDING_STATES.reduce((a, s) => a + byState[s], 0),
      triagedTotal: byState.triaged ?? 0,
      inputTokens: modelUsage?.inputTokens ?? 0,
      outputTokens: modelUsage?.outputTokens ?? 0,
      dispatches: modelUsage?.dispatches ?? 0,
      source: modelUsage?.source ?? 'none',
    }),
    coverage: { total: covTotal, covered: covCovered },
    // T2-1-2 转化率卡(8.5-2): Frontier 闭环锚点非空比率 — {total, accepted_to_hypothesis,
    // hypothesis_to_confirmed}, 口径同 gates.py frontier_conversion_rate(total = 该 eng Frontier 行数)
    frontier: computeConversion(frontierRows),
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
        // FIX-1 A1: 双签态透出 — disputed 行的仲裁入口显示条件(AdjudicateOps 分流; 其余行
        // 恒 ''/pending/signed 等, 零消费零影响)
        dual_sign: String(f?.dual_sign ?? ''),
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
    // XR-P2: X-Ring 过程可见节(只读聚合, fail-soft 恒不抛 —— 记录面缺失=available:false 空形态)
    xring: (() => { try { return readXringRuns({}, fs, process.env) } catch (e) { return { available: false, base: '', activeCount: 0, runs: [], degraded: [String(e?.message ?? e).slice(0, 80)] } } })(),
    approvals, // 4-4 子批次 A: {mode, pending} | null(队列模块缺席降级) — 审批待办计数
    // WRAP-2 #18: 幻觉抽检浏览面(quarantined 池尾 12)——裁决入口同 tab 抽样浏览形态
    quarantine: (quarantineRows ?? []).map((x) => ({
      id: String(x?.id ?? ''),
      title: cap(x?.title, MAX.title),
      created_at: String(x?.created_at ?? ''),
    })),
  }
}

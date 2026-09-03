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
const MAX = { title: 200, scope: 200, target: 200, workers: 50, findings: 200, signals: 20, exp: 12, checkpoint: 400, todo: 400, traj: 400, digest: 160, usageLines: 2000, runLogLines: 400, sigEvidence: 0 }

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

/** 模型策略(A-2 外置): DATA_DIR/config/model-policies.json, 缺失返回 null(fleet 卡降级)。*/
export function readFleet(env = process.env) {
  const dir = env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
  try {
    const p = JSON.parse(fs.readFileSync(`${dir}/config/model-policies.json`, 'utf8'))
    const roles = {}
    for (const [k, v] of Object.entries(p?.roles ?? {})) {
      roles[k] = { primary: String(v?.primary ?? ''), backup: String(v?.backup ?? '') }
    }
    const fleet = { default: { primary: String(p?.default?.primary ?? ''), backup: String(p?.default?.backup ?? '') }, roles, models: [] }
    // 候选模型并集: 已被引用过的模型(任意厂商, 无中央注册表 — 并集 + 自定义输入)
    const seen = new Set()
    for (const m of [fleet.default.primary, fleet.default.backup, ...Object.values(roles).flatMap((r) => [r.primary, r.backup])]) {
      if (m && !seen.has(m)) { seen.add(m); fleet.models.push(m) }
    }
    return fleet
  } catch { return null }
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
  const out = { events: [], usage: {}, quotaHits: [] }
  const dir = env.D2D_DATA_DIR ?? dataDir ?? `${os.homedir()}/.d2d-data`
  // 与 scheduler.js RUNS_BASE 同口径: P2P_RUNS_DIR/D2D_RUNS_DIR 优先, 否则 DATA_DIR/runs
  const runs = env.D2D_RUNS_DIR ?? env.P2P_RUNS_DIR ?? `${dir}/runs`
  // model-usage.jsonl: 每 worker 派发一行 {ts, worker, role, model}
  try {
    const lines = fsImpl.readFileSync(`${runs}/model-usage.jsonl`, 'utf8').split('\n').filter(Boolean).slice(-MAX.usageLines)
    for (const ln of lines) {
      try {
        const r = JSON.parse(ln)
        const m = String(r?.model ?? '')
        if (m) out.usage[m] = (out.usage[m] ?? 0) + 1
      } catch {}
    }
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
    run: {
      events: runEvents?.events ?? [],
      usage: runEvents?.usage ?? {},
      quotaHits: runEvents?.quotaHits ?? [],
    },
  }
}

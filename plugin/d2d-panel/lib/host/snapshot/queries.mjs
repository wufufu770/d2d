// snapshot/queries.js — 快照 Cypher 查询常量(拆分自 snapshot.mjs: 29-89, 逐字搬移)
import { MAX } from './const.mjs'

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

export const Q_CHAIN = {
  tasks: `MATCH (t:Task) WHERE t.eng = $eng RETURN t.id AS id, t.kind AS kind, t.status AS status, t.link_id AS link_id, t.claimed_by AS claimed_by, t.created_at AS created_at ORDER BY coalesce(t.created_at, '') DESC LIMIT ${CHAIN.tasks}`,
  confirms: `MATCH (f:Finding)-[:CONFIRMS]->(s:Signal_) WHERE f.eng = $eng RETURN f.id AS a, s.id AS b LIMIT ${CHAIN.edges}`,
  at: `MATCH (s:Signal_)-[:AT]->(e:Endpoint) WHERE s.eng = $eng RETURN s.id AS a, e.id AS b LIMIT ${CHAIN.edges}`,
  suggests: `MATCH (h:Hypothesis)-[:SUGGESTS]->(e:Endpoint) WHERE h.eng = $eng RETURN h.id AS a, e.id AS b LIMIT ${CHAIN.edges}`,
  endpoints: `MATCH (e:Endpoint) WHERE e.eng = $eng RETURN e.id AS id, e.url AS url, e.method AS method LIMIT ${CHAIN.endpoints}`,
  findings: `MATCH (f:Finding) WHERE f.eng = $eng RETURN f.id AS id, f.title AS title, f.severity AS severity, f.gate_status AS state ORDER BY coalesce(f.ts, '') DESC LIMIT ${CHAIN.findings}`,
}
export const Q_FRONTIER_POOL = `MATCH (x:Frontier) WHERE x.eng_id = $eng RETURN x.id AS id, x.direction AS direction, x.status AS status, x.proposed_by AS proposed_by, x.created_at AS created_at, x.value_score AS value_score, x.review_note AS review_note, x.accepted_to_hypothesis_ref AS hypothesis_ref ORDER BY x.created_at DESC LIMIT ${FRONTIER_POOL_LIMIT}`
// 总览补全(拍板 1): 每 engagement severity 计数 — 一条聚合查询喂全列表(逐 eng 循环查询会放大图读)
export const Q_FINDINGS_SEV = `MATCH (f:Finding) RETURN f.eng AS eng, f.severity AS severity, count(f) AS n`

// 全部只读 MATCH; host token 通道下不触发 worker 只读白名单(本就放行)
// W5: 池子查询全部按 $eng 过滤(engagement 池子隔离) — 面板只显示选中 engagement 的项目数据;
// ExperienceWeight(经验)/模型策略跨项目共享, 不过滤。eng 列缺失的旧库行由 graphd 启动回填归属。
export const Q = {
  engList: `MATCH (e:Engagement) RETURN e.name AS name, e.target AS target, e.scope AS scope, e.status AS status, e.created_at AS created_at, e.instances AS instances, e.objective AS objective ORDER BY coalesce(e.created_at, '') DESC LIMIT 50`,
  findingsByEng: `MATCH (f:Finding) RETURN f.eng AS eng, f.gate_status AS state, count(f) AS n`,
  workersByEng: `MATCH (a:AgentIdentity) WHERE a.status = 'running' RETURN a.eng AS eng, count(a) AS n`,
  agents: `MATCH (a:AgentIdentity) WHERE a.eng = $eng RETURN a.worker_id AS worker_id, a.ring AS ring, a.chain AS chain, a.status AS status, a.checkpoint AS checkpoint, a.todo AS todo, a.updated_at AS updated_at ORDER BY coalesce(a.updated_at, '') DESC LIMIT ${MAX.workers}`,
  findingsByState: `MATCH (f:Finding) WHERE f.eng = $eng RETURN f.gate_status AS state, count(f) AS n`,
  findingsList: `MATCH (f:Finding) WHERE f.eng = $eng RETURN f.id AS id, f.title AS title, f.severity AS severity, f.cvss AS cvss, f.gate_status AS state, f.category AS category, f.ts AS ts, f.verified_at AS verified_at, f.last_transition AS last_transition, f.dual_sign AS dual_sign, f.repairability AS repairability ORDER BY coalesce(f.ts, '') DESC LIMIT ${MAX.findings}`,
  // WRAP-2 #18: 幻觉抽检人口=Experience 表 quarantined 隔离池(与 ExperienceWeight 先验表异表)——
  // 面板抽检浏览面数据源; 裁决回流经 /write/adjudicate(experience revoke)。
  // E38 修: created_at 在 T4-3-2 迁移后为 TIMESTAMP 列——coalesce 混 '' STRING 触发
  // kuzu Binder exception("Implicit cast is not supported")致 snapshot 整体 503;
  // 空值兜底改 TIMESTAMP 字面量, 与 schema DEFAULT 同值。
  quarantine: `MATCH (x:Experience) WHERE x.status='quarantined' RETURN x.id AS id, x.title AS title, x.created_at AS created_at ORDER BY coalesce(x.created_at, timestamp('1970-01-01 00:00:00')) DESC LIMIT 12`,
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

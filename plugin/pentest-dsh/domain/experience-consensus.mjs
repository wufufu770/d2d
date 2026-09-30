// experience-consensus.mjs — T3-1-2 A-MemGuard 共识验证 v1(纯函数零 IO, 零加列)
// 审计结论(T3-1-0 项2): Experience 现有 14 列足以离线做共识 — 不加列、不改 /write/experience、
// 不碰 3.5-1 表结构禁区。v1 替代信号(拍板): ①结论一致性 = category 三类
// (success | failure | pitfall, graphd 3.5-1 枚举)在"同面"经验间的冲突; ②同面判定 =
// title+content 归一 token Jaccard ≥ 共识阈值(0.15, 保守取低防漏报 — 只报告不阻断);
// ③时间衰减 = 0.5^(龄期天/90) 权重, 分歧中新者胜、旧者标 superseded_candidate(仅标注)。
// 分组键: scope 非空用 scope; scope 为空降级 eng_id(审计实证: 现库 9 条 scope 全空,
// eng 分组是唯一有信息量分组)。孤例组不误报; 同组异面(不同 technique)的 success/failure
// 并存是正常业务现象, 不标分歧。
// 输入行契约(调用方从 /query 只读拉取): {id, eng_id, category, scope, title, content,
// status, retrieval_count, success_count, created_at}

export const CONSENSUS_JACCARD = 0.15
export const HALF_LIFE_DAYS = 90
const NEG = new Set(['failure', 'pitfall'])

/** 归一分词: latin 词(≥2) + CJK 二元组 — 中英混排标题/内容可比 */
export function tokenize(text) {
  const s = String(text ?? '').toLowerCase()
  const out = new Set()
  for (const m of s.matchAll(/[a-z0-9]{2,}/g)) out.add(m[0])
  const cjk = s.match(/[\u4e00-\u9fa5]+/g) ?? []
  for (const run of cjk) {
    if (run.length === 1) { out.add(run); continue }
    for (let i = 0; i < run.length - 1; i++) out.add(run.slice(i, i + 2))
  }
  return out
}

function jaccard(a, b) {
  if (!a.size || !b.size) return 0
  let inter = 0
  for (const t of a) if (b.has(t)) inter++
  return inter / (a.size + b.size - inter)
}

/** 分组: scope 优先, 空降级 eng:${eng_id}(eng_id 也空 → eng:?) */
export function groupKey(row) {
  const scope = String(row?.scope ?? '').trim()
  if (scope) return `scope:${scope}`
  return `eng:${String(row?.eng_id ?? '').trim() || '?'}`
}

export function groupExperiences(rows) {
  const groups = new Map()
  for (const r of rows ?? []) {
    const k = groupKey(r)
    if (!groups.has(k)) groups.set(k, [])
    groups.get(k).push(r)
  }
  return groups
}

/** 时间衰减权重: 0.5^(龄期天/半衰期90天) — created_at 解析失败按 0 龄期(不打折) */
export function decayWeight(createdAt, now = Date.now()) {
  const t = Date.parse(String(createdAt ?? ''))
  if (!Number.isFinite(t)) return 1
  const days = Math.max(0, (now - t) / 86400_000)
  return Math.pow(0.5, days / HALF_LIFE_DAYS)
}

function pairKind(aCat, bCat) {
  const aNeg = NEG.has(aCat), bNeg = NEG.has(bCat)
  if (aCat === bCat) return null // 同类不构成分歧
  if ((aCat === 'success' && bCat === 'failure') || (aCat === 'failure' && bCat === 'success')) return 'success-failure'
  if ((aCat === 'success' && bCat === 'pitfall') || (aCat === 'pitfall' && bCat === 'success')) return 'success-pitfall'
  return null // failure×pitfall 同为阴性, 一致
}

const brief = (r) => ({ id: String(r?.id ?? ''), category: String(r?.category ?? ''), title: String(r?.title ?? ''), created_at: r?.created_at ?? null, eng_id: String(r?.eng_id ?? '') })

/** 共识检查主入口 → {stats, deviations, anomalies}
 * deviations[]: {group, kind, overlap, newer, older, note} — 新者=衰减权重高的一侧
 * anomalies[]: {group, type, ids, note} — duplicate_title 同题重复 / stale_zero_use 零消费滞留(>30天 且 rc=sc=0) */
export function consensusCheck(rows, { now = Date.now(), threshold = CONSENSUS_JACCARD } = {}) {
  const groups = groupExperiences(rows)
  const deviations = []
  const anomalies = []
  const stats = { total: (rows ?? []).length, groups: groups.size, compared: 0, flagged: 0 }
  for (const [key, members] of groups) {
    if (members.length < 2) continue // 孤例组: 不误报
    const toks = members.map((m) => tokenize(`${m?.title ?? ''} ${m?.content ?? ''}`))
    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const a = members[i], b = members[j]
        const kind = pairKind(String(a?.category ?? ''), String(b?.category ?? ''))
        if (!kind) continue
        const ov = jaccard(toks[i], toks[j])
        stats.compared++
        if (ov < threshold) continue // 异面并存: 不同 technique 的成败同组是正常现象
        const wa = decayWeight(a?.created_at, now), wb = decayWeight(b?.created_at, now)
        const [newer, older] = wa >= wb ? [a, b] : [b, a]
        deviations.push({
          group: key, kind, overlap: Math.round(ov * 100) / 100,
          newer: brief(newer), older: brief(older),
          note: `同面分歧(权重 新${Math.max(wa, wb).toFixed(2)}/旧${Math.min(wa, wb).toFixed(2)}): 新侧 ${newer?.category} 为准, 旧侧 ${older?.id} 标 superseded_candidate(仅标注不写库)`,
        })
        stats.flagged++
      }
    }
    if (members.length >= 2) {
      // 同题重复异常: 归一 title 完全一致(去空白标点)
      const norm = (t) => String(t ?? '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')
      const byTitle = new Map()
      for (const m of members) {
        const k = norm(m?.title)
        if (k) byTitle.set(k, [...(byTitle.get(k) ?? []), m])
      }
      for (const [t, ms] of byTitle) {
        if (ms.length >= 2) anomalies.push({ group: key, type: 'duplicate_title', ids: ms.map((m) => String(m?.id ?? '')), note: `同题重复×${ms.length}: ${t.slice(0, 40)}` })
      }
      // 零消费滞留: rc=sc=0 且超 30 天
      for (const m of members) {
        const rc = Number(m?.retrieval_count) || 0, sc = Number(m?.success_count) || 0
        const t = Date.parse(String(m?.created_at ?? ''))
        if (rc === 0 && sc === 0 && Number.isFinite(t) && now - t > 30 * 86400_000) {
          anomalies.push({ group: key, type: 'stale_zero_use', ids: [String(m?.id ?? '')], note: `零消费滞留>30天(rc=0,sc=0): ${String(m?.title ?? '').slice(0, 40)}` })
        }
      }
    }
  }
  return { stats, deviations, anomalies }
}

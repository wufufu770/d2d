// domain/pivot.mjs — 4-4 子批次 C: 转向机制最小版(不依赖 SUGGESTS 边)纯函数域。
//
// 转向语义 = AEV「被阻断就转向」的检测侧: 前线在某 host×缺陷类别上被确定性否决时, 把仍指向
// 该路径的 open 假设在消费排序中降权 — 转向 = 少往墙上撞, 不是硬禁止。阻断判定三源全可查
// (审计 4-4 结论, 逐条核实):
//   ①Finding gate_status='rejected' — verify 裁决 refuted→rejected(verify-verdicts.mjs:25)
//     或 auto-triage 近重复 rejected(triage.mjs:103-116);
//   ②Signal_ status∈['refuted','pruned'] — worker 负结论/剪枝(briefs 指令 + pruneStaleSignals);
//   ③Hypothesis status='refuted' — 假设协议 resolve 反驳(graphd/app.py /write/hypothesis)。
// 与 Gate-V 语义相反侧不混用: Gate-V(纯函数在 domain/verify-verdicts.mjs:147-163, **不在**
// domain/gates.mjs — 审计位置更正)是「缺确定性锚不盖章」(验证准入), 本模块是「已被否决就少投入」。
//
// 不依赖 SUGGESTS 边: 该边全仓零生产写入(creative 简报指令建边 domain/briefs.mjs:97, 但 worker
// /query 是只读门 graphd/gd/gates.py worker_query_allowed、/write/hypothesis 只建节点
// graphd/app.py:798-805 — 跨链因子 sugRows(loop.mjs) 实图恒空)。本模块三源聚合只读既有节点
// 属性; SUGGESTS 写入通道留创意环扩展, 不属本批(docs/approval-channels.md §7)。
//
// 消费点: scheduler/loop.mjs consumeHypotheses 前置步(查询编排 + pivot-detected 事件)与
// domain/hypothesis-aging.mjs applyPivotPenalty(sort_key 追加层降权, 不进 value_score 本体)。

import { URL_RE, hostOf } from './scope.mjs'

// 转向降权常量: blocked 命中的假设在 aging sort_key 上被扣减的惩罚量(消费排序 sort_key 降序
// — hypothesisAgingCandidates, 扣正惩罚 = 排序后移)。量级依据: 价值分上界 3.0 + ε(0.05/h)×龄期
// — 10 把刚被否决的方向压到任何未阻断假设之下; 追加式(不进 value_score 本体)意味着随龄期增长
// 惩罚被 aging 自然稀释(200h 后反超) — 否决不是永久封禁, 转向 = 降优先。
export const HYP_PIVOT_PENALTY = 10

// 三源合法标签(行缺 src/非三源不聚合 — 检测器只认确定性否决源, 不猜)
const PIVOT_SOURCES = new Set(['finding', 'signal', 'hypothesis'])

// ts 归一(与 hypothesis-aging.parseTsMs 同语义: kuzu ' '形与 ISO T 形同源, NaN→0)。
// 本地实现避免 pivot↔hypothesis-aging 循环 import(aging 侧 import 本模块降权函数)。
function _tsMs(v) {
  const t = Date.parse(String(v ?? '').trim().replace(' ', 'T'))
  return Number.isFinite(t) ? t : 0
}

/**
 * 三源否决聚合(C-1 检测器): 图查询行 → 阻断路径集。
 * @param {Array<{src,eng,cat,repro,ts}>|*} rows 三源查询行(编排侧 loop.mjs 三条 MATCH,
 *   统一列形: src='finding'|'signal'|'hypothesis', cat=类别/类型/策略, repro=含 URL 的证据文本;
 *   信号行 evidence→repro, 假设行 text→repro); 非数组/脏行安全。
 * @param {{eng?:string}} opts eng 非空时严格过滤 r.eng(缺 eng 列的行也丢 — fail-closed,
 *   W5 纵深: 跨 engagement 的否决不进本家规划素材; 编排侧查询已带 WHERE x.eng=$e 再拦一次)。
 * @returns {{host, category, sources[], lastTs}[]} 按 host+category 聚合去重: sources=贡献源
 *   去重标签, lastTs=组内最大 ts(ms)。host/category 双空的行不聚合(无从匹配假设关键域)。
 */
export function pivotBlockedPaths(rows, { eng = '' } = {}) {
  const byKey = new Map()
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || typeof r !== 'object') continue
    if (eng && String(r.eng ?? '') !== eng) continue
    const src = String(r.src ?? '').trim().toLowerCase()
    if (!PIVOT_SOURCES.has(src)) continue
    const host = hostOf((String(r.repro ?? '').match(URL_RE) ?? [])[0] ?? '')
    const category = String(r.cat ?? '').trim().toLowerCase()
    if (!host && !category) continue
    const key = `${host}|${category}`
    const g = byKey.get(key) ?? { host, category, sources: [], lastTs: 0 }
    if (!g.sources.includes(src)) g.sources.push(src)
    const ts = _tsMs(r.ts)
    if (ts > g.lastTs) g.lastTs = ts
    byKey.set(key, g)
  }
  return [...byKey.values()]
}

/**
 * 假设转向降权(C-3 惩罚纯函数): blocked 命中(host/category 匹配假设 strategy/text 关键域)
 * → 正惩罚值 HYP_PIVOT_PENALTY(由合并层 applyPivotPenalty 从 sort_key 扣减 — 消费排序
 * sort_key 降序, 扣正惩罚 = 排序后移), 否则 0。
 * 匹配口径(小写归一后): host 出现在假设文本(假设提到被否决主机) ∨ category===strategy
 * (同类策略已被否决) ∨ category 出现在假设文本。子串包含而非 \b 词边界 — 类别词表
 * (sqli/ssrf/越权…) 混有中文词, JS \b 对非 ASCII 词不可靠; 后果仅为降权排序, 无放行面。
 * @returns {number} 0 | HYP_PIVOT_PENALTY; blockedSet 空/缺省/非数组 = 0(查询降级语义)。
 */
export function hypothesisPivotPenalty(hyp, blockedSet) {
  if (!Array.isArray(blockedSet) || blockedSet.length === 0) return 0
  const text = String(hyp?.t ?? hyp?.text ?? '').toLowerCase()
  const strategy = String(hyp?.strategy ?? '').trim().toLowerCase()
  if (!text && !strategy) return 0
  for (const b of blockedSet) {
    if (!b || typeof b !== 'object') continue
    const host = String(b.host ?? '').trim().toLowerCase()
    const cat = String(b.category ?? '').trim().toLowerCase()
    if (host && text.includes(host)) return HYP_PIVOT_PENALTY
    if (cat && (strategy === cat || text.includes(cat))) return HYP_PIVOT_PENALTY
  }
  return 0
}

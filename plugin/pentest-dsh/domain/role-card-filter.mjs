// role-card-filter.mjs — T3-2-2 角色过滤纯函数(裁决 B: 本批纯函数+测试落地, 接线拆 T3-2-2b)
// 裁决依据(docs/skill-design.md §授权申请): 角色过滤的正确实现点 = experience-ref.mjs 选卡阶段
// (rankExperiences, 3.5-3 禁区文件)或 scheduler.js knowledgeBlock 装配既有行 — 均非纯新增行;
// scheduler 侧纯新增只能对已组装 <experience_ref> block 文本做后处理(破坏条目消毒+2KB 自限
// 不变式) → 按拍板 3 宁可拆批不硬做。
// 绑定键(审计项 3 实锚): role.signal_affinity 词面数组 × 卡 applies_to/signals/tech 词面重叠;
// 降级纪律: 无 role / role 无 signal_affinity / 卡无匹配词面字段 → 全量返回(不筛, 行为等价现状)。

/** 词面集: 卡的 applies_to + signals + tech + category 合并小写归一 */
function cardTokens(card) {
  const out = new Set()
  for (const k of ['applies_to', 'signals', 'tech']) {
    for (const t of (card?.[k] ?? [])) {
      const s = String(t ?? '').toLowerCase().trim()
      if (s) out.add(s)
    }
  }
  const cat = String(card?.category ?? '').toLowerCase().trim()
  if (cat) out.add(cat)
  return out
}

/** 角色词面集: signal_affinity 全量小写 */
export function roleTokens(role) {
  const out = new Set()
  for (const t of (role?.signal_affinity ?? [])) {
    const s = String(t ?? '').toLowerCase().trim()
    if (s) out.add(s)
  }
  return out
}

/** 单卡命中: 词面互含(token 级 includes, 仿 knowledge-retrieval keywordScore 口径) ≥1 即命中 */
export function cardMatchesRole(card, rTokens) {
  if (!rTokens || !rTokens.size) return true // 降级: 角色无 affinity → 不筛
  const cTokens = cardTokens(card)
  for (const t of rTokens) {
    for (const c of cTokens) {
      if (c.includes(t) || t.includes(c)) return true
    }
  }
  return false
}

/** 角色过滤: cards × role → {kept, filtered, matched}
 * 降级三态(全量返回): role 缺失 / signal_affinity 空 / cards 非数组。
 * matched=true 时才真正筛选 — 无 role 信息时行为等价现状(T3-2-2 门禁要求)。 */
export function filterCardsByRole(cards, role) {
  if (!Array.isArray(cards)) return { kept: [], filtered: 0, matched: false }
  const rTokens = roleTokens(role)
  if (!rTokens.size) return { kept: cards, filtered: 0, matched: false }
  const kept = cards.filter((c) => cardMatchesRole(c, rTokens))
  return { kept, filtered: cards.length - kept.length, matched: true }
}

/** Experience 条目版(T3-2-2b 面 1 修正形态): 条目字段={title, content, category}(无 applies_to/
 * signals 结构化词面) — 匹配口径=affinity 词面 × title/content 拆词(拉丁词≥2 + CJK 二元组, 照
 * experience-consensus tokenize 思路 — 整串比对会让 'sqli'↔'SQL 注入' 不互含)+category 全串。
 * 降级三态同 filterCardsByRole: role 缺失/affinity 空/entries 非数组 → 全量返回。 */
export function filterExperiencesByRole(entries, role) {
  if (!Array.isArray(entries)) return { kept: [], filtered: 0, matched: false }
  const rTokens = roleTokens(role)
  if (!rTokens.size) return { kept: entries, filtered: 0, matched: false }
  const kept = entries.filter((e) => {
    const toks = new Set()
    for (const k of ['title', 'content']) {
      const s = String(e?.[k] ?? '').toLowerCase()
      for (const w of s.matchAll(/[a-z0-9]{2,}/g)) toks.add(w[0])
      for (const run of (s.match(/[\u4e00-\u9fa5]+/g) ?? [])) {
        if (run.length === 1) { toks.add(run); continue }
        for (let i = 0; i < run.length - 1; i++) toks.add(run.slice(i, i + 2))
      }
    }
    const cat = String(e?.category ?? '').toLowerCase().trim()
    if (cat) toks.add(cat)
    for (const t of rTokens) for (const c of toks) if (c.includes(t) || t.includes(c)) return true
    return false
  })
  return { kept, filtered: entries.length - kept.length, matched: true }
}

// knowledge-gaps.mjs — T3-1-3 misses 月度聚合(纯函数零 IO; 落盘由 scripts/brain/misses-report.mjs 承担)
// 审计结论(T3-1-0 项3): misses 台账已存在且零侵入可得 — memory-store.mjs recordMiss(topMisses
// 同文件)由 scheduler.js:398 在「简报颗粒无收 + queryText 非空」时写入 ${DATA_DIR}/brain/
// memory-usage.json 的 store.misses(签名=查询词前 120 字符, {q,n,first_seen,last_seen})。
// 本模块做月度聚合: 按月切分(锚=last_seen) → 频次排序 → 渲染成 study 选题输入文档
// (投放 knowledge/inbox 即进学习环, --inbox 时由 CLI 代投, 默认只落 reports/)。
// 采集面加固(scheduler.js 本批不改, 见 docs/brain-audit-runbook.md 设计就绪段):
// 现 recordMiss 仅覆盖「整版简报零卡」窄条件, 逐查询级无命中采集点候选在 scheduler.js:398 邻域。

/** 月度键: YYYY-MM(last_seen 锚; 缺失回退 first_seen; 再缺回退 now) */
export function monthKeyOf(e, now = Date.now()) {
  const t = Number(e?.last_seen) || Number(e?.first_seen) || now
  const d = new Date(t)
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

/** 聚合: store.misses 对象({签名: {q,n,first_seen,last_seen}}) → 按月分桶, 桶内频次降序
 * → [{month, totalQueries, totalHits, rows:[{q, n, first_seen, last_seen}]}](月序升序) */
export function aggregateMisses(misses, { now = Date.now() } = {}) {
  const buckets = new Map()
  for (const e of Object.values(misses ?? {})) {
    if (!e || !String(e.q ?? '').trim()) continue
    const m = monthKeyOf(e, now)
    if (!buckets.has(m)) buckets.set(m, { month: m, totalQueries: 0, totalHits: 0, rows: [] })
    const b = buckets.get(m)
    b.totalQueries += 1
    b.totalHits += Number(e.n) || 0
    b.rows.push({ q: String(e.q), n: Number(e.n) || 0, first_seen: Number(e.first_seen) || 0, last_seen: Number(e.last_seen) || 0 })
  }
  for (const b of buckets.values()) b.rows.sort((x, y) => y.n - x.n || y.last_seen - x.last_seen)
  return [...buckets.values()].sort((x, y) => x.month.localeCompare(y.month))
}

/** 渲染 study 选题输入文档(markdown)。headnote 说明用法与人工编辑要求 — 不自动造卡。 */
export function renderMissesDoc(buckets, { month, generatedAt = new Date().toISOString() } = {}) {
  const pick = month ? buckets.filter((b) => b.month === month) : buckets
  const lines = [
    `# 知识缺口选题输入(misses 月度聚合 ${month ?? '全期'})`,
    '',
    `> 生成: ${generatedAt} · 来源: memory-usage.json misses 台账(检索/派单无产出的 query 签名聚合)`,
    `> 用法: 本文档是 study.mjs 的**选题输入**, 不是卡。人工审阅勾选值得补课的方向后, 编辑成 md 投放`,
    `> knowledge/inbox 才会进蒸馏; 未勾选方向留档不自动造卡(防无产出自转)。`,
    '',
  ]
  if (!pick.length) {
    lines.push(`(本期无 misses 记录 — 台账为空属正常: 记录条件为「简报颗粒无收且查询词非空」, 见 docs/brain-audit-runbook.md 采集面设计就绪段)`, '')
    return lines.join('\n')
  }
  for (const b of pick) {
    lines.push(`## ${b.month} — ${b.totalQueries} 个缺口签名 / ${b.totalHits} 次无命中`, '')
    lines.push(`| # | 查询签名(前120字符) | 次数 | 最近无命中 |`)
    lines.push(`|---|---|---|---|`)
    b.rows.forEach((r, i) => {
      const when = r.last_seen ? new Date(r.last_seen).toISOString().slice(0, 10) : '-'
      lines.push(`| ${i + 1} | ${String(r.q).replace(/\|/g, '\\|').replace(/\n/g, ' ')} | ${r.n} | ${when} |`)
    })
    lines.push('')
    lines.push(`### 补卡方向建议(自动候选, 人工勾选)`, '')
    for (const r of b.rows.slice(0, 5)) lines.push(`- [ ] ${r.q.slice(0, 80)}(×${r.n})`)
    lines.push('')
  }
  return lines.join('\n')
}

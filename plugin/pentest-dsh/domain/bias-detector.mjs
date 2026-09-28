// domain/bias-detector.mjs — T2-2a-4(2D) 覆盖偏科检测纯函数(零 IO, 全 mock 可测)。
// 背景(T1.8.1 四维实测): 执行面 7 / 工作流 3 / 参数篡改 0 / 竞态 0 / 界外 8 / 噪音 1 —
// 确认洞可能长期集中于单一维度(经典技术洞易挖, 逻辑面难啃), 调度器需要确定性判定来提示转向。
// 规则风格照 domain/experience.mjs CLASS_RULES(:9-47): 词面正则线性匹配, 兜底 other。
//
// 口径(交付规格):
//   · classifyBiasDim(title, category) → 'param'|'workflow'|'race'|'execution'|'probe'|'other'
//     词面为纲(title), category 仅兼容 Finding 形态透传(预留, 不参与判定 — 规格词面全部落在标题)。
//     规则序即优先级: probe 最前(probe-test 标题含注入词不误归 execution), 再高精度词面
//     (race/execution) → workflow → param(词面最宽, 垫底), 其余 other。
//   · detectBias(findings) 分母 = 非 probe 且非 candidate 的 confirmed 面,
//     gate_status ∈ {verified,triaged,needs-scope,isolated,reported,accepted}。
//     界外(other)单列不并入四维 — 经典洞(SQLi/XSS/信息泄露)占多数不得稀释/误判为偏科维。
//     触发条件: 某四维占比 > 0.8 且该维条数 ≥ 3(双条件防小样本单洞误报)。

// ── 四维词面(规格: param=IDOR/越权/价格/数量/枚举/可预测 id; workflow=步骤/状态机/重置/
//    未鉴权管理操作/CSRF 授权流; race=竞争/并发/锁定; execution=命令注入/RCE/上传执行/
//    反序列化/模板注入; probe=probe-test/探针) — 同族词补齐以稳匹配, 不扩语义 ──
const BIAS_RULES = [
  ['probe', /probe[-_ ]?test|探针/i],
  ['race', /竞争|竞态|并发|锁定|race[-_ ]?condition/i],
  ['execution', /命令注入|command[-_ ]?inject|\brce\b|代码执行|上传执行|反序列化|deserial|模板注入|\bssti\b|template[-_ ]?inject/i],
  ['workflow', /步骤|状态机|重置|未鉴权|管理操作|csrf|授权流|工作流/i],
  ['param', /\bidor\b|\bbola\b|越权|价格|金额|数量|枚举|可预测 ?id|predictable[-_ ]?id/i],
]

// ── 分母口径: confirmed 面 gate_status 白名单(candidate/空/未知一律不进分母) ──
export const CONFIRMED_GATE = new Set(['verified', 'triaged', 'needs-scope', 'isolated', 'reported', 'accepted'])
export const BIAS_DIMS = ['param', 'workflow', 'race', 'execution']
export const BIAS_SHARE_MIN = 0.8   // 严格大于才触发(=0.8 不算)
export const BIAS_DIM_MIN = 3       // 该维至少 3 条

// ── 单条分类: 规则序线性匹配(同 experience.mjs patternClass 形态), 兜底 other ──
export function classifyBiasDim(title, category) {
  const s = String(title ?? '')
  for (const [dim, re] of BIAS_RULES) if (re.test(s)) return dim
  return 'other'
}

// ── 分布统计 + 偏科判定(纯函数): findings=[{title,category,gate_status}] ──
// 返回 {dims:{param,workflow,race,execution}, other, total, bias}
//   dims   = 四维计数; other = 界外单列(不并入四维); total = 分母(非 probe 非 candidate confirmed)。
//   bias   = {dim, share, n, m, pct} | null(触发维取占比最大者; share=n/m, pct 四舍五入百分整数)。
export function detectBias(findings) {
  const dims = { param: 0, workflow: 0, race: 0, execution: 0 }
  let other = 0
  let total = 0
  for (const f of Array.isArray(findings) ? findings : []) {
    if (!f || typeof f !== 'object') continue
    if (!CONFIRMED_GATE.has(String(f.gate_status ?? ''))) continue // candidate/未定态不进分母
    const dim = classifyBiasDim(f.title, f.category)
    if (dim === 'probe') continue                                  // probe 噪音不进分母(T1.8.1 噪音桶)
    total++
    if (dim in dims) dims[dim]++
    else other++                                                   // 界外单列
  }
  let bias = null
  for (const dim of BIAS_DIMS) {
    const n = dims[dim]
    if (n < BIAS_DIM_MIN || total <= 0) continue
    if (n / total > BIAS_SHARE_MIN && (!bias || n > dims[bias.dim])) bias = { dim, share: Math.round((n / total) * 1000) / 1000, n, m: total, pct: Math.round((n / total) * 100) }
  }
  return { dims, other, total, bias }
}

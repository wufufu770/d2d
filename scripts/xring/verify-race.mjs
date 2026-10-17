// verify-race.mjs — E18/P1-1 竞速验证（思想吸收自研实现——多验证策略竞速, 与 #1 机械验证互补）。
// 形态定谳: 非多模型（成本面）——单条 repro 的多策略变体并行重放, 先 pass 者胜、其余结果弃置。
// 取消语义（诚实记录）: 胜者定格后败者请求不中断（弃置其结果）; 请求级 abort 归池（1.2.1 候选）。
// 适用面: A 级 repro 验证（攻验证率线）+ECC 疑似环境可疑时多策略交叉（同答=环境可疑旁证, 涌现语义）。

/**
 * 竞速重放: variants = [stepsArray, ...]（finding.variants, ≤5）; primary steps 恒为参赛者之一。
 * 返回 { winner: {variantIndex, verdict} | null, results: [{variantIndex, verdict}] }——
 * verdict.verdict==='pass' 的最先 settle 者为胜者; 全员无 pass → winner=null（调用方回落 fail/manual 语义）。
 */
export async function raceVerify(runner, { primary, variants = [], timeoutMs = 30000 } = {}) {
  const contestants = [{ index: 0, steps: primary }, ...(variants ?? []).map((v, i) => ({ index: i + 1, steps: v }))]
  let settled = false
  const results = []
  const attempts = contestants.map((c) =>
    runner.verify({ steps: c.steps }).then((verdict) => {
      results.push({ variantIndex: c.index, verdict })
      if (!settled && verdict.verdict === 'pass') {
        settled = true
        return { variantIndex: c.index, verdict }
      }
      return null
    }, () => {
      results.push({ variantIndex: c.index, verdict: { verdict: 'error' } })
      return null
    }),
  )
  const raced = await Promise.race([
    (async () => {
      const found = []
      for (const a of attempts) {
        const w = await a
        if (w && !settled) return w
        if (w) found.push(w)
      }
      return found[0] ?? null
    })(),
    new Promise((r) => setTimeout(() => r(null), timeoutMs)),
  ])
  settled = true
  return { winner: raced, results }
}

/** 竞速证据行（reflow evidence 拼接用——胜者+败者计数的可追溯形态）。 */
export function raceEvidence(race, { primarySteps } = {}) {
  if (!race) return ''
  const w = race.winner
  const losers = race.results.filter((r) => !w || r.variantIndex !== w.variantIndex).length
  if (w) return `race✓(variant#${w.variantIndex}${primarySteps && w.variantIndex === 0 ? '=primary' : ''} 胜出, ${losers} 变体弃置)`
  return `race✗(${race.results.length} 变体无 pass)`
}

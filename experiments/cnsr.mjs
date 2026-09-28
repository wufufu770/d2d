#!/usr/bin/env node
// experiments/cnsr.mjs — CNSR 指标定义与计算(T2-1-3, 纯函数零 IO)。
//
// 定义(本批首次落码; 此前仓内零定义): CNSR = verified findings 数 ÷ 总 token 消耗 × 1,000,000
//   —— 每百万 token 的 verified 产出, 衡量"钱烧出了多少真货"。
// 不造假语义沿 collect-results.mjs:115-122 tokenNote 先例: token 总量为 0/缺失 → cnsr=null +
// note='n/a: 无 token 数据', 绝不用编造的分母凑出数值。
//
// 纯函数: 不读文件不发请求; 输入非法(负数/NaN/非数值)直接抛错拒绝 —— 宁可失败不可静默造数。
export function computeCnsr({ verifiedFindings, inputTokens, outputTokens } = {}) {
  const v = checkCount(verifiedFindings, 'verifiedFindings')
  const hasIn = inputTokens != null
  const hasOut = outputTokens != null
  const i = hasIn ? checkCount(inputTokens, 'inputTokens') : null
  const o = hasOut ? checkCount(outputTokens, 'outputTokens') : null
  if (!hasIn && !hasOut) return { cnsr: null, tokensTotal: null, note: 'n/a: 无 token 数据' }
  const tokensTotal = (i ?? 0) + (o ?? 0)
  if (tokensTotal === 0) return { cnsr: null, tokensTotal: 0, note: 'n/a: 无 token 数据' }
  const cnsr = Math.round((v / tokensTotal) * 1e6 * 100) / 100
  return { cnsr, tokensTotal, note: `verified=${v} / ${tokensTotal} tokens × 1e6` }
}

// 计数守卫: 必须是有限非负数(负数/NaN/Infinity/字符串/布尔一律抛错) — token 与 verified 都是只增计数
function checkCount(x, name) {
  if (typeof x !== 'number' || !Number.isFinite(x) || x < 0) {
    throw new Error(`computeCnsr: ${name} 必须是有限非负数(得到 ${typeof x}:${String(x)})`)
  }
  return x
}

// ── 展示辅助: CNSR 行渲染(供 historical-ab/collect 类报告复用; null → n/a 不造假) ──
export function formatCnsr(cnsrResult) {
  if (!cnsrResult || cnsrResult.cnsr == null) return `n/a(${cnsrResult?.note ?? '无数据'})`
  return `${cnsrResult.cnsr.toFixed(2)} /百万token`
}

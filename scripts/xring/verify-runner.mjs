#!/usr/bin/env node
// scripts/xring/verify-runner.mjs — A 级工件独立重放执行器（XR-P4 族 1 真执行器形态）
// 接口: verify(artifact) → { verdict: 'pass'|'fail'|'manual', evidence }
//
// **R9 reward-hacking 规避声明**: 本模块是【重放器不是裁判】——零 LLM-judge 零自主性。
// 判定 = 种子工件里人写的 expected 与受控靶 observed 的机械包含比对; 对内容质量的任何
// 判断都在环外（人工/主流程）。执行器不评估"漏洞是否真实"，只回答"声明的复现步骤在
// 受控靶上是否逐步复现出声明的期望特征"。
//
// **目标面硬边界**: 仅 targetBase（受控靶）。步骤出现绝对 URL / 非 '/' 开头路径 = manual
// 旗标留验（靶外尝试不执行——这是执行器硬边界，不是可配置项）；redirect 不跟随。
//
// 步骤语法（种子工件 steps 字符串数组, 逐行机械解释, 不猜）:
//   "METHOD /path?query"    → 向 targetBase 发该请求（method 白名单; 记录 status+body）
//   "EXPECT <substring>"    → 机械断言: 上一响应体含子串
//   其他任何形态             → 歧义 → 整单 manual 留验（诚实形态）
export function createVerifyRunner({ replay = null, targetBase = '', fetchImpl = fetch, timeoutMs = 8000 } = {}) {
  return {
    /** replay: async (artifact) => { ok: bool, evidence } — 注入点（测试/外部执行器）。 */
    async verify(artifact) {
      if (typeof replay === 'function') {
        try {
          const r = await replay(artifact)
          return { verdict: r?.ok ? 'pass' : 'fail', evidence: String(r?.evidence ?? '') }
        } catch (e) {
          return { verdict: 'fail', evidence: `replay threw: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      }
      return replayHttp(artifact, { targetBase, fetchImpl, timeoutMs })
    },
  }
}

/** 纯 HTTP 重放（缺省执行器）。歧义/越界一律 manual 留验——宁留验不猜（拍板 4）。 */
async function replayHttp(artifact, { targetBase, fetchImpl, timeoutMs }) {
  const steps = Array.isArray(artifact?.steps) ? artifact.steps.map((s) => String(s)) : null
  if (!steps || steps.length === 0) return { verdict: 'manual', evidence: 'steps 缺或空——无重放脚本, 留人工验收' }
  let base
  try {
    base = new URL(targetBase)
    if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('protocol')
  } catch {
    return { verdict: 'manual', evidence: `targetBase 非法（${String(targetBase).slice(0, 60)}）——留人工验收` }
  }
  const evidenceParts = []
  let lastBody = null
  const statuses = []
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i].trim()
    if (step.startsWith('EXPECT ')) {
      if (lastBody === null) return { verdict: 'manual', evidence: `步骤 ${i}: EXPECT 先于任何请求（歧义序）——留人工验收` }
      const needle = step.slice('EXPECT '.length)
      if (!lastBody.includes(needle)) {
        return { verdict: 'fail', evidence: `步骤 ${i}: 期望特征未复现——EXPECT "${needle.slice(0, 80)}" 不在响应体（${lastBody.length}B, statuses=${statuses.join(',')})` }
      }
      evidenceParts.push(`EXPECT✓(${needle.length}B needle)`)
      continue
    }
    const m = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+(\S+)$/.exec(step)
    if (!m) return { verdict: 'manual', evidence: `步骤 ${i}: 不可解析形态（"${step.slice(0, 60)}"）——歧义留人工验收` }
    const pathPart = m[2]
    if (!pathPart.startsWith('/')) {
      return { verdict: 'manual', evidence: `步骤 ${i}: 非相对路径（"${pathPart.slice(0, 60)}"）——目标面硬边界, 靶外尝试不执行, 留人工验收` }
    }
    let res
    try {
      res = await fetchImpl(base.origin + pathPart, { method: m[1], redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
    } catch (e) {
      return { verdict: 'fail', evidence: `步骤 ${i}: 请求失败（${String(e?.message ?? e).slice(0, 120)}）——受控靶不可达或步骤不可复现` }
    }
    statuses.push(res.status)
    lastBody = await res.text().catch(() => '')
    evidenceParts.push(`${m[1]} ${pathPart.slice(0, 40)}→${res.status}`)
  }
  if (!evidenceParts.some((p) => p.startsWith('EXPECT'))) {
    return { verdict: 'manual', evidence: '无 EXPECT 断言——无判据即无重放判定, 留人工验收' }
  }
  return { verdict: 'pass', evidence: `重放通过: ${steps.length} 步/${statuses.length} 请求（${statuses.join(',')}）+ ${evidenceParts.filter((p) => p.startsWith('EXPECT')).length} 断言` }
}

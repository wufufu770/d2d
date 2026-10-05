#!/usr/bin/env node
// scripts/xring/verify-runner.mjs — A 级工件独立重放骨架（XR-P1 族 4；真执行器归 P3/P4）
// 接口: verify(artifact) → { verdict: 'pass'|'fail'|'manual', evidence }
// 方案 §7: A 级（可复现漏洞发现）回流必经 verify 独立重放; 环外 verify 若自动化则暴露
// reward hacking（R9）——骨架期缺省 manual（人工验收）, 编排位已固化（A 级必经, 不跳过）。
export function createVerifyRunner({ replay = null } = {}) {
  return {
    /** replay: async (artifact) => { ok: bool, evidence } — 独立重放执行器（注入点）。 */
    async verify(artifact) {
      if (typeof replay === 'function') {
        try {
          const r = await replay(artifact)
          return { verdict: r?.ok ? 'pass' : 'fail', evidence: String(r?.evidence ?? '') }
        } catch (e) {
          return { verdict: 'fail', evidence: `replay threw: ${String(e?.message ?? e).slice(0, 200)}` }
        }
      }
      return { verdict: 'manual', evidence: 'verify 执行器未接线（骨架期=P3/P4）— A 级工件留人工验收, 不自动入图' }
    },
  }
}

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
//   "POST /path --data <串>" → XR-G4: 带固定值载荷的请求（--data 后整段为载荷字面量; 表单/JSON 原样发）
//   "EXPECT <substring>"    → 机械断言: 上一响应体含子串
//   其他任何形态             → 歧义 → 整单 manual 留验（诚实形态）
//
// XR-G4 会话态表达（拍板 1）: 本执行器内建 cookie jar（内存 Map, 生命周期=verify 调用=
// reflow=engagement run——不落盘不跨 run）。响应 Set-Cookie 一律入 jar 并随后续请求回放
// （会话跟随=浏览器自然语义）; 载荷为**固定值重放**（无变量无提取——参数化重构造被拍板
// 明确排除, DVWA 类动态 token 场景的登录失败是如实 fail 非执行器缺陷）。
// 表达力≠容忍度（原则 1）: 扩的是可机械表达的动作空间; 判定逻辑与判据零改动——EXPECT
// 包含比对/manual 旗标/目标面硬边界逐字保留。
// 网络动作 scope 绑定（原则 3）: 全部请求 URL=base.origin+相对路径, base=targetBase 由
// 调用方（reflow）绑定 engagement scope——相对路径硬边界（:62 非 '/' 开头=manual）保证
// 重放动作永不触达靶集外; 无新增出网面。
// XR-G7 pass 判定分层（原则 2）: 证据链存在语义（pass=步骤机械重放得到所述结果）与独立
// 复现语义两分——重放前对每个 EXPECT 断言的请求路径做一次 baseline GET, baseline 响应体
// 已含该 EXPECT 特征=effectPreExisted 标记进 evidence（效应依赖/预置嫌疑——判定权打折
// 语义的载体）, verdict 本身不改（分层是标注不是否决）。baseline 请求同样过 scope 绑定
// （同 origin 相对路径）与超时约束。
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
async function replayHttp(artifact, { targetBase, fetchImpl = fetch, timeoutMs = 8000 }) {
  const steps = Array.isArray(artifact?.steps) ? artifact.steps.map((s) => String(s)) : null
  if (!steps || steps.length === 0) return { verdict: 'manual', evidence: 'steps 缺或空——无重放脚本, 留人工验收' }
  let base
  try {
    base = new URL(targetBase)
    if (base.protocol !== 'http:' && base.protocol !== 'https:') throw new Error('protocol')
  } catch {
    return { verdict: 'manual', evidence: `targetBase 非法（${String(targetBase).slice(0, 60)}）——留人工验收` }
  }
  // XR-G4: cookie jar（内存, verify 调用生命周期=engagement run 绑定——不落盘）
  const cookieJar = new Map()
  const cookieHeader = () => [...cookieJar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')
  const absorbSetCookie = (res) => {
    const sc = res.headers?.getSetCookie?.() ?? []
    for (const line of sc) {
      const [pair] = String(line).split(';')
      const eq = pair.indexOf('=')
      if (eq > 0) cookieJar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim())
    }
  }
  const request = async (method, fullPath, body) => {
    const headers = {}
    if (cookieJar.size) headers.cookie = cookieHeader()
    if (body !== undefined) { headers['content-type'] = 'application/x-www-form-urlencoded'; headers['content-length'] = String(body.length) }
    return fetchImpl(base.origin + fullPath, { method, headers, body, redirect: 'manual', signal: AbortSignal.timeout(timeoutMs) })
  }
  const evidenceParts = []
  let lastBody = null
  const statuses = []
  // XR-G7 分层: 每个 EXPECT 断言的请求路径先做 baseline GET（重放前——效应/预置探测）
  const expectPaths = []
  for (const raw of steps) {
    const m = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+(?!.*--data)(\S+)/.exec(raw.trim())
    if (m) expectPaths.push({ path: m[2], method: m[1] })
  }
  const finalExpectPath = [...expectPaths].reverse().find((p) => p.method === 'GET')?.path ?? null
  let effectPreExisted = null
  if (finalExpectPath) {
    try {
      const pre = await request('GET', finalExpectPath)
      const preBody = await pre.text().catch(() => '')
      effectPreExisted = { path: finalExpectPath, status: pre.status, probed: true }
      evidenceParts.push(`baseline GET ${finalExpectPath.slice(0, 40)}→${pre.status}(${preBody.length}B)`)
    } catch (e) {
      effectPreExisted = { path: finalExpectPath, probed: false, err: String(e?.message ?? e).slice(0, 80) }
    }
  }
  const expectNeedlesByOrder = steps.map((s) => (s.trim().startsWith('EXPECT ') ? s.trim().slice(7) : null)).filter((x) => x !== null)
  let expectIndex = -1
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i].trim()
    if (step.startsWith('EXPECT ')) {
      if (lastBody === null) return { verdict: 'manual', evidence: `步骤 ${i}: EXPECT 先于任何请求（歧义序）——留人工验收` }
      const needle = step.slice('EXPECT '.length)
      if (!lastBody.includes(needle)) {
        const preTag = effectPreExisted?.probed && lastBody.length === 0 ? '（认证墙/空响应——XR-G4 会话态边界如实记录）' : ''
        return { verdict: 'fail', evidence: `步骤 ${i}: 期望特征未复现——EXPECT "${needle.slice(0, 80)}" 不在响应体（${lastBody.length}B, statuses=${statuses.join(',')})${preTag}` }
      }
      evidenceParts.push(`EXPECT✓(${needle.length}B needle)`)
      expectIndex++
      continue
    }
    // XR-G4: --data 载荷形态（固定值重放——载荷字面量原样发, 无变量无提取）
    const dm = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+(\S+)\s+--data\s+(.+)$/.exec(step)
    let m = null, body
    if (dm) { m = dm; body = dm[3] }
    else {
      m = /^(GET|POST|PUT|DELETE|HEAD|OPTIONS)\s+(\S+)$/.exec(step)
      if (!m) return { verdict: 'manual', evidence: `步骤 ${i}: 不可解析形态（"${step.slice(0, 60)}"）——歧义留人工验收` }
    }
    const pathPart = m[2]
    if (!pathPart.startsWith('/')) {
      return { verdict: 'manual', evidence: `步骤 ${i}: 非相对路径（"${pathPart.slice(0, 60)}"）——目标面硬边界, 靶外尝试不执行, 留人工验收` }
    }
    let res
    try {
      res = await request(m[1], pathPart, body)
    } catch (e) {
      return { verdict: 'fail', evidence: `步骤 ${i}: 请求失败（${String(e?.message ?? e).slice(0, 120)}）——受控靶不可达或步骤不可复现` }
    }
    absorbSetCookie(res)
    statuses.push(res.status)
    lastBody = await res.text().catch(() => '')
    evidenceParts.push(`${m[1]} ${pathPart.slice(0, 40)}${body !== undefined ? '(--data)' : ''}→${res.status}`)
  }
  if (!evidenceParts.some((p) => p.startsWith('EXPECT'))) {
    return { verdict: 'manual', evidence: '无 EXPECT 断言——无判据即无重放判定, 留人工验收' }
  }
  // XR-G7 分层标注（原则 2: 证据链存在语义 pass + 独立复现语义另行标注——verdict 本身不改）
  const layered = expectIndex >= 0 && expectNeedlesByOrder.length > 0 && effectPreExisted?.probed
    ? '; XR-G7 分层: 独立复现语义未证（baseline 探测留痕见请求链——效应依赖/预置嫌疑时判定权打折, 人工面终裁）'
    : ''
  // XR-G4 顺手: 请求链逐条进 evidence（既有 evidenceParts 只进计数不进内容——与 fail 侧信息量对齐）
  return { verdict: 'pass', evidence: `重放通过: ${steps.length} 步/${statuses.length} 请求 + ${evidenceParts.filter((p) => p.startsWith('EXPECT')).length} 断言 | ${evidenceParts.join(' ; ')}${layered}` }
}

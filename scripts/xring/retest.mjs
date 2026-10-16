// retest.mjs — E18/P1-2 修复后复测（思想吸收自研实现——d2d 定位攻不守: 只"验修复"不做"造修复"）。
// 状态机语义（对偶）: falsified=证伪防复测（别再测已知假）; remediated=修复后复测（修了再验一次）。
// 复测=机械验证语义（verifyRunner 重放 remediated fact 的 steps）——无 worker 零 LLM。
// 人工/上游标记形态: 在 run workspace 落 remediated.json {remediated:[{id, note?}]}（操作者/上游
// 工单系统写入）; retestFacts 读取并对 handoff facts 逐条复测。
import fs from 'node:fs'
import path from 'node:path'

export const REMEDIATED_FILE = 'remediated.json'

/** 读修复标记（缺文件=无可复测项）。形态: {remediated:[{id, note?}]} 或 {remediated:["F-1", ...]}。 */
export function loadRemediated(workspace) {
  try {
    const doc = JSON.parse(fs.readFileSync(path.join(workspace, REMEDIATED_FILE), 'utf8'))
    const list = Array.isArray(doc.remediated) ? doc.remediated : []
    return list.map((x) => (typeof x === 'string' ? { id: x } : { id: String(x.id), ...(x.note ? { note: String(x.note).slice(0, 300) } : {}) }))
  } catch {
    return []
  }
}

/**
 * 复测执行: facts（handoff carriers.facts）∩ remediated ids → 逐条机械重放。
 * 返回 {results: [{id, title, verdict, evidence}], summary: {total, pass, fail}}——
 * pass=修复确认（fact 保持 + 复测记录）; fail=修复未生效（fact 保持 + 复测失败记录——与
 * falsified 互斥: fact 语义=上轮真, 复测失败=修复失败非发现证伪）。
 */
export async function retestFacts({ facts = [], remediated = [], targetBase, eng = 'retest', verifyRunner = null, createVerifyRunnerFn = null } = {}) {
  const vr = verifyRunner ?? (createVerifyRunnerFn ? createVerifyRunnerFn({ targetBase, eng }) : null)
  if (!vr) throw new Error('retest 需要 verifyRunner 或 createVerifyRunnerFn+targetBase')
  const wantIds = new Set(remediated.map((r) => String(r.id)))
  const targets = (facts ?? []).filter((f) => wantIds.has(String(f.id)))
  const results = []
  for (const f of targets) {
    const artifact = { id: f.id, title: f.title, severity: f.severity, target: f.target ?? targetBase, steps: f.steps ?? [], expected: '', observed: '' }
    const v = await vr.verify(artifact)
    results.push({ id: f.id, title: f.title ?? '', verdict: v.verdict, evidence: String(v.evidence ?? '').slice(0, 400) })
  }
  const notFound = remediated.filter((r) => !wantIds.size || !targets.some((t) => String(t.id) === String(r.id))).map((r) => r.id)
  return {
    results,
    summary: { total: results.length, pass: results.filter((r) => r.verdict === 'pass').length, fail: results.filter((r) => r.verdict !== 'pass').length },
    unmatched: notFound,
  }
}

/** 复测报告落盘（run workspace/retest-<ts>.json——对偶 falsified 的可追溯形态）。 */
export function writeRetestReport(workspace, report) {
  const p = path.join(workspace, `retest-${new Date().toISOString().replace(/[-T:.Z]/g, '').slice(0, 14)}.json`)
  fs.writeFileSync(p, JSON.stringify(report, null, 1))
  return p
}

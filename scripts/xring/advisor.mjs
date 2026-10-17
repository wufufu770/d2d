// advisor.mjs — E18/P0-2 第二视角 Advisor（思想吸收自研实现——d2d 单模型形态下的"第二视角"）。
// 核心洞察: 长上下文幻觉累积是连败根因之一——第二视角=新开干净上下文（同模型）带历史摘要+
// 战略提示词; Advisor 只输出建议（攻击思路/换角度/建议放弃）, 不执行工具, 主循环消化。
// 角色互换传承: 连败历史+上轮 Advisor 建议随 handoff leads(origin=advisor) 传承——防重复同一死法。
import fs from 'node:fs'
import path from 'node:path'

export const ADVISOR_FILE = 'advisor.md'
export const DEFAULT_THRESHOLD = 3

/** 触发条件: 连续失败连击 ≥ 阈值（CHYing 实证值 3, 可配）。连击=相邻失败无 pass 间隔。 */
export function shouldAdvise(failStreak, { threshold = DEFAULT_THRESHOLD } = {}) {
  return Number(failStreak ?? 0) >= threshold
}

/** 连击计数: verdict 序列（'pass' 打断连击, 其余累积）。 */
export function failStreak(verdicts) {
  let streak = 0
  for (const v of verdicts ?? []) {
    if (v === 'pass') streak = 0
    else streak++
  }
  return streak
}

/** Advisor 简报（第二上下文的全部输入——历史摘要+失败序列+硬边界声明; 零工具授权语义）。 */
export function buildAdvisorBrief({ runId, target, failures = [], historySummary = '', priorAdvice = '' } = {}) {
  return [
    '## 你的角色（Advisor——只出建议, 不执行任何工具/请求; 你的全部产出=文字建议）',
    '',
    `主循环（run ${runId}）在同一目标上连续 ${failures.length} 次验证/利用失败, 触发第二视角会诊。`,
    target ? `目标: ${target}` : '',
    historySummary ? `\n### 历史摘要\n${historySummary.slice(0, 2000)}` : '',
    failures.length ? `\n### 失败序列（按序）\n${failures.slice(0, 10).map((f, i) => `${i + 1}. ${String(f).slice(0, 200)}`).join('\n')}` : '',
    priorAdvice ? `\n### 上轮 Advisor 建议（未被突破——勿重复同建议）\n${priorAdvice.slice(0, 800)}` : '',
    '',
    '### 输出格式（三选一或组合, 总长 ≤500 字）',
    '- 换角度: 一个未试过的攻击面/技术路线（具体到路径或参数形态）',
    '- 换工具族: 建议改用的工具/手法类别',
    '- 建议放弃: 论证为何该方向应止损（主循环可采信并转向）',
    '硬边界: 只讨论授权目标范围内思路; 任何越界建议无效。',
  ].filter((s) => s !== undefined).join('\n')
}

/**
 * 第二上下文运行: 经 adapter.spawnWorker（ring='advisor', 短预算）新开同模型干净上下文,
 * 建议落 workspace/advisor.md——读取返回; 主循环消化（applyAdvice）。
 */
export async function runAdvisor({ adapter, workspace, brief, timeoutMs = 240000 }) {
  const promise = adapter.spawnWorker({ ring: 'advisor', task: brief, cwd: workspace, eng: 'advisor' })
  const r = await Promise.race([
    promise,
    new Promise((r) => setTimeout(() => r({ code: 124, text: '' }), timeoutMs)),
  ])
  const advicePath = path.join(workspace, ADVISOR_FILE)
  let advice = ''
  try { advice = fs.readFileSync(advicePath, 'utf8').slice(0, 3000) } catch { /* 未落建议文件=空 */ }
  if (!advice && r?.text) advice = String(r.text).slice(0, 3000)
  return { advice, code: r?.code ?? null }
}

/** 主循环消化: 建议写 workspace/advisor.md（运行中 worker 可读面）+ 返回注入文本（reflow 摘要/handoff 消费）。 */
export function applyAdvice(workspace, advice) {
  if (!advice) return ''
  try { fs.writeFileSync(path.join(workspace, ADVISOR_FILE), `# Advisor 建议（第二视角——advisory 非指令）\n\n${advice}\n`) } catch { /* 尽力而为 */ }
  return advice
}

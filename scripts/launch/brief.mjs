#!/usr/bin/env node
// brief.mjs — hunt 式一键假设简报(P3/M7, skyline hunt/strategy-learn 采纳): 关键词/技术栈/CWE →
//   固定 schema 的结构化简报(hypothesis/preconditions/test_plan/negative_controls/evidence_requirements/
//   matched_strategies/references)。默认零 LLM 依赖 — 知识脑检索 + 卡片拼装; --deep 走可插拔 LLM
//   扩写钩子(D2D_BRIEF_LLM_CMD: 收简报 JSON stdin, 回 markdown stdout, 由 study 通道同款模型驱动)。
// --save: 写 graphd Hypothesis(text≤1500, strategy='brief')进入调度器开放假设队列。
// 用法:
//   node scripts/launch/brief.mjs ssrf [--target https://x] [--save] [--deep] [--json]
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { retrieveKnowledge } from '../../plugin/pentest-dsh/domain/knowledge-retrieval.mjs'

const kw = process.argv.find((a, i) => i >= 2 && !a.startsWith('-') && process.argv[i - 1] !== undefined && i === 2)
const keyword = String(process.argv[2] ?? '').trim()
const has = (k) => process.argv.includes(k)
const idxOf = (k) => { const i = process.argv.indexOf(k); return i > -1 ? String(process.argv[i + 1] ?? '') : '' }
const target = idxOf('--target')
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'

if (!keyword) {
  console.error('用法: brief.mjs <keyword|tech|cwe> [--target URL] [--save] [--deep] [--json]')
  console.error('示例: brief.mjs ssrf --target https://target --save')
  process.exit(1)
}

// 知识卡加载(与 scheduler loadKnowledge 同源: current + shadow)
function loadKnowledge() {
  const brainDir = process.env.P2P_BRAIN_DIR ?? `${DATA_DIR}/brain`
  const read = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')).cards ?? [] } catch { return [] } }
  return [...read(`${brainDir}/current/techniques.json`), ...read(`${brainDir}/shadow/techniques.json`).map((c) => ({ ...c, title: `[shadow]${c.title ?? ''}` }))]
}

const cards = loadKnowledge()
const tokens = keyword.toLowerCase().split(/[^a-z0-9.\-\u4e00-\u9fa5]+/).filter(Boolean)
const matched = retrieveKnowledge(cards, tokens, { topK: 3, queryText: `${keyword} ${target}` })

const brief = {
  keyword,
  target: target || '(未指定 — 派发前必须绑定授权 scope 内目标)',
  hypothesis: `目标存在与「${keyword}」相关的可验证缺陷。${matched[0] ? `最相近已知模式: ${matched[0].c.title}。` : '知识库暂无相近模式 — 以通用方法论探索。'}`,
  preconditions: [
    '目标在授权 scope 内且已人工确认归属',
    ...matched.flatMap((m) => (m.c.applies_to ?? []).slice(0, 3).map((a) => `适用面: ${a}`)).slice(0, 6),
  ],
  test_plan: [
    ...matched.map((m) => `【${m.c.title}】${m.c.validation_recipe ?? m.c.adaptation_prompt ?? ''}`.slice(0, 300)),
    ...(matched.length ? [] : [`对 ${keyword} 相关参数/端点做最小化探测(带外确认优先, 单点验证)`]),
  ],
  negative_controls: [
    ...matched.flatMap((m) => (m.c.negative_controls ?? []).slice(0, 3)),
    '行为与基线一致/需管理员身份才复现 → 判 refuted, 不写 Finding',
  ],
  evidence_requirements: ['request_response(完整请求响应对)', 'baseline(阴性对照一次)', 'impact(数据/权限差异证据)', 'replay(他人可跟做的最小复现步骤)'],
  matched_strategies: matched.map((m) => m.c.id),
  references: matched.flatMap((m) => (m.c.refs ?? []).slice(0, 3)),
}

// --deep: 可插拔 LLM 扩写钩子
if (has('--deep')) {
  const cmd = process.env.D2D_BRIEF_LLM_CMD
  if (!cmd) console.error('提示: 未配置 D2D_BRIEF_LLM_CMD — 跳过 LLM 扩写, 输出检索版简报')
  else {
    try {
      const expanded = execFileSync(cmd, { input: JSON.stringify(brief), encoding: 'utf8', timeout: 120_000, shell: true })
      brief.deep_expansion = expanded.slice(0, 8000)
    } catch (e) { console.error(`LLM 扩写失败(保留检索版): ${e.message.slice(0, 120)}`) }
  }
}

if (has('--save')) {
  const token = (() => { try { return fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' } })()
  if (!token) { console.error('缺 host-token — 无法写图'); process.exit(2) }
  const text = `[brief:${keyword}] ${brief.hypothesis} 测试计划: ${brief.test_plan[0] ?? ''}`.slice(0, 1500)
  const res = await fetch(`${GRAPHD}/write/hypothesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify({ text, strategy: 'brief' }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) { console.error(`写图失败: http ${res.status}`); process.exit(3) }
  console.error(`已写 Hypothesis(strategy='brief') → ${GRAPHD}; 创造环/调度器将消费该开放假设`)
}

if (has('--json')) console.log(JSON.stringify(brief, null, 2))
else {
  console.log(`\n=== 假设简报: ${keyword} ===`)
  console.log(`目标: ${brief.target}`)
  console.log(`假设: ${brief.hypothesis}`)
  console.log('\n前置条件:')
  for (const p of brief.preconditions) console.log(`  - ${p}`)
  console.log('\n测试计划(最小步):')
  for (const t of brief.test_plan) console.log(`  - ${t}`)
  console.log('\n阴性对照:')
  for (const n of brief.negative_controls) console.log(`  - ${n}`)
  console.log('\n证据要求:')
  for (const e of brief.evidence_requirements) console.log(`  - ${e}`)
  if (brief.matched_strategies.length) console.log(`\n命中策略卡: ${brief.matched_strategies.join(', ')}`)
  if (brief.deep_expansion) console.log(`\nLLM 扩写:\n${brief.deep_expansion.slice(0, 2000)}`)
  console.log('\n注: 简报是假设不是结论 — 验证走 verify 环七态机。')
}

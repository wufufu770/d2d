// report-face.mjs — R-04 报告自动化: run 收尾 verified findings → 三外部格式+ab-report 内部面。
// 预裁 4 分面: 三外部格式（butian/vulbox/edu-src——docs/report-templates/ 字段映射表）只吃
// **已验证 findings**（leads 不入外部面）; ab-report 内部面吃全量（含 leads/falsified 与
// 环境评估节——ECC 信号+handoff 消费摘要）。映射承 E14-B chain 断言形态（全字段非空）。
import fs from 'node:fs'
import path from 'node:path'

const SEV_RANK = { critical: 1, high: 2, medium: 3, low: 4, info: 5 }

/** finding（A 级已验证）→ src-JSON 四件套形态（docs/report-templates/ 映射表源结构）。 */
export function toSrcJson(f) {
  const severity = String(f.severity ?? 'info')
  return {
    vuln_type: String(f.category ?? '未分类'),
    title: String(f.title ?? f.id ?? '未命名发现').slice(0, 200),
    severity: severity.toUpperCase(),
    rank: SEV_RANK[severity] ?? 5,
    description: String(f.observed ?? f.description ?? '').slice(0, 2000),
    reproduce: (Array.isArray(f.steps) ? f.steps.join('\n') : String(f.steps ?? '')).slice(0, 2000),
    assets: String(f.target ?? f.assets ?? '授权靶场（合成/受控环境）').slice(0, 300),
    cvss: f.cvss ?? null,
  }
}

export const butianJson = (s) => ({ '漏洞名称': s.title, '漏洞类型': s.vuln_type, '危害等级': s.severity, '漏洞详情': s.description, '复现步骤': s.reproduce, '网站（资产）': s.assets, '评分': s.cvss })
export const vulboxJson = (s) => ({ vul_title: s.title, vul_type: s.vuln_type, level: s.severity, description: s.description, reproduce: s.reproduce, asset: s.assets, cvss: s.cvss })
export const eduSrcJson = (s) => ({ title: s.title, type: s.vuln_type, severity: s.severity, desc: s.description, steps: s.reproduce.split('\n'), asset: s.assets, fix: '按复现步骤修复对应模块并回归验证（自动化产出——加固建议归人工复核）' })

const fieldsNonEmpty = (o, keys) => keys.every((k) => o[k] !== undefined && String(o[k]).length > 0)

/**
 * 收尾报告产出: butian.json/vulbox.json/edu-src.json/ab-report.md 至 outDir。
 * 返回 {files: [...], warnings: [...]}——映射非全字段非空时 warnings 记录（不阻断产出）。
 */
export function emitReports({ verified = [], leads = [], falsified = [], ecc = null, relaySummary = null, outDir, generatedAt = null } = {}) {
  fs.mkdirSync(outDir, { recursive: true })
  const srcs = (verified ?? []).map(toSrcJson)
  const warnings = []
  const butian = srcs.map(butianJson)
  const vulbox = srcs.map(vulboxJson)
  const edu = srcs.map(eduSrcJson)
  const write = (name, data) => { fs.writeFileSync(path.join(outDir, name), typeof data === 'string' ? data : JSON.stringify(data, null, 1)) }
  write('butian.json', butian)
  write('vulbox.json', vulbox)
  write('edu-src.json', edu)
  for (const [name, arr] of [['butian.json', butian], ['vulbox.json', vulbox], ['edu-src.json', edu]]) {
    for (let i = 0; i < arr.length; i++) {
      const keys = name === 'butian.json' ? ['漏洞名称', '漏洞类型', '危害等级', '漏洞详情', '复现步骤'] : (name === 'vulbox.json' ? ['vul_title', 'vul_type', 'level', 'description', 'reproduce'] : ['title', 'type', 'severity', 'desc', 'steps'])
      if (!fieldsNonEmpty(arr[i], keys)) warnings.push(`${name}[${i}] 字段非空校验未过`)
    }
  }
  write('ab-report.md', abReport({ srcs, leads, falsified, ecc, relaySummary, generatedAt }))
  return { files: ['butian.json', 'vulbox.json', 'edu-src.json', 'ab-report.md'].map((f) => path.join(outDir, f)), warnings }
}

/** ab-report 内部全量面（对外不交付——leads/环境评估只在此）。 */
export function abReport({ srcs, leads = [], falsified = [], ecc = null, relaySummary = null, generatedAt = null } = {}) {
  const L = []
  L.push('# ab-report（内部全量面——外部交付面见三格式 JSON, 只含已验证 findings）', '')
  L.push(`生成: ${generatedAt ?? new Date().toISOString()}`, '')
  L.push('## 执行摘要', '')
  L.push(`- 已验证 findings: ${srcs.length} 条（severity 分布: ${JSON.stringify(srcs.reduce((m, s) => { m[s.severity] = (m[s.severity] ?? 0) + 1; return m }, {}))}）`)
  L.push(`- leads（未验证假设）: ${leads.length} 条 · falsified: ${falsified.length} 条`)
  L.push(`- ECC 环境级别: ${ecc?.level ?? 'none'}（信号 ${ecc?.signals?.length ?? 0} 条）`, '')
  if (srcs.length) {
    L.push('## 已验证 findings', '')
    for (const s of srcs) {
      L.push(`### [${s.severity}] ${s.title}`, '', `- 类型: ${s.vuln_type} · 资产: ${s.assets}`, '', '- 复现:', '```', s.reproduce, '```', '', `- 观察: ${s.description}`, '')
    }
  }
  if (leads.length) {
    L.push('## leads（未验证假设——**不进外部交付面**）', '')
    for (const l of leads) L.push(`- [${l.id}] ${l.statement}（origin=${l.origin}）`)
    L.push('')
  }
  if (falsified.length) {
    L.push('## falsified（已证伪——防复测）', '')
    for (const f of falsified) L.push(`- [${f.id}] ${f.statement}（${f.reason}）`)
    L.push('')
  }
  L.push('## 环境评估（ECC——advisory 信号）', '')
  if (ecc && (ecc.signals?.length || ecc.level !== 'none')) {
    L.push(`- 级别: **${ecc.level}**${ecc.checkedAt ? `（checkedAt ${ecc.checkedAt}）` : ''}`)
    for (const s of ecc.signals ?? []) L.push(`- [${s.kind}/${s.confidence}] ${s.detail}`)
  } else {
    L.push('- 无信号（环境一致性未见异常）')
  }
  if (relaySummary) {
    L.push('', '## 接力消费摘要（R-05 handoff）', '')
    L.push(`- 来源: ${relaySummary.from ?? '-'} · 消费: ${relaySummary.consumed ? '是' : '否（首战）'}`)
    L.push(`- facts ${relaySummary.facts ?? 0} / leads ${relaySummary.leads ?? 0} / falsified ${relaySummary.falsified ?? 0} / 基线路径 ${relaySummary.baselinePaths ?? 0}`)
  }
  L.push('', '> caveat: 本报告由自动化管道产出; ECC 为 advisory 信号非定论——环境可疑性语境下的发现请结合信号自行校准置信。', '')
  return L.join('\n')
}

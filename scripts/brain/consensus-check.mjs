#!/usr/bin/env node
// consensus-check.mjs — T3-1-2 A-MemGuard 共识验证 CLI(只读: /query 拉经验, 零写通道)
// 用法:
//   node scripts/brain/consensus-check.mjs [--graph 8766] [--out <md文件>] [--quiet]
//   node scripts/brain/consensus-check.mjs --json   机器可读(dev/stdin 管道用)
// 退出码: 恒 0(v1 前置信号只报告不阻断 — 阻断语义留给 v2 拍板); 图不可达 → 3(区别于有分歧)
// 报告: 同 scope/eng 分组 → 同面分歧(结论一致性) + 同题重复 + 零消费滞留 三类清单
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import { consensusCheck } from '../../plugin/pentest-dsh/domain/experience-consensus.mjs'

const _gi = process.argv.indexOf('--graph')
const GRAPH = _gi > -1 ? (process.argv[_gi + 1] || '8766') : '8766'
const JSON_OUT = process.argv.includes('--json')
const QUIET = process.argv.includes('--quiet')
const oi = process.argv.indexOf('--out')
const OUT = oi > -1 ? process.argv[oi + 1] : ''

function fetchExperiences() {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`,
    '-d', JSON.stringify({
      cypher: 'MATCH (x:Experience) RETURN x.id AS id, x.eng_id AS eng_id, x.category AS category, '
        + 'x.scope AS scope, x.title AS title, x.content AS content, x.status AS status, '
        + 'x.retrieval_count AS retrieval_count, x.success_count AS success_count, x.created_at AS created_at',
    })], { encoding: 'utf8' })
  return JSON.parse(res).rows ?? []
}

let rows
try { rows = fetchExperiences() } catch (e) {
  console.error(`❌ 图不可达(${e.message.slice(0, 120)}) — 共识检查需要 graphd /query 只读通道`)
  process.exit(3)
}
const r = consensusCheck(rows)

if (JSON_OUT) { console.log(JSON.stringify(r, null, 1)); process.exit(0) }
if (!QUIET) {
  console.log(`共识检查(T3-1-2 v1): ${r.stats.total} 条经验 / ${r.stats.groups} 组 / 同面可比对 ${r.stats.compared} 对`)
  console.log(`分歧 ${r.deviations.length} 处, 异常 ${r.anomalies.length} 条`)
  for (const d of r.deviations) console.log(`  ⚠ [分歧·${d.kind}] ${d.group} 重叠=${d.overlap}\n     新侧: ${d.newer.id}(${d.newer.category}) ${d.newer.title.slice(0, 50)}\n     旧侧: ${d.older.id}(${d.older.category}) ${d.older.title.slice(0, 50)}\n     ${d.note}`)
  for (const a of r.anomalies) console.log(`  ⚠ [异常·${a.type}] ${a.group}: ${a.ids.join(',')} — ${a.note}`)
  if (!r.deviations.length && !r.anomalies.length) console.log('  ✓ 无同面分歧, 无异常')
}
if (OUT) {
  const lines = [
    `# A-MemGuard 共识验证报告(T3-1-2 v1)`,
    '',
    `- 生成: ${new Date().toISOString()} / 图端口 ${GRAPH}`,
    `- 规模: ${r.stats.total} 条经验 / ${r.stats.groups} 组 / 同面可比对 ${r.stats.compared} 对`,
    `- 结论: 分歧 ${r.deviations.length} 处, 异常 ${r.anomalies.length} 条(v1 只报告不阻断)`,
    '',
    `## 分歧清单(同面 success×failure/pitfall, 时间衰减新者为准)`,
    '',
    ...(r.deviations.length
      ? r.deviations.map((d) => `- **${d.kind}** \`${d.group}\` 重叠=${d.overlap}\n  - 新侧: \`${d.newer.id}\`(${d.newer.category}) ${d.newer.title}\n  - 旧侧: \`${d.older.id}\`(${d.older.category}) ${d.older.title}\n  - ${d.note}`)
      : ['(无)']),
    '',
    `## 异常清单(同题重复 / 零消费滞留)`,
    '',
    ...(r.anomalies.length
      ? r.anomalies.map((a) => `- **${a.type}** \`${a.group}\`: \`${a.ids.join(', ')}\` — ${a.note}`)
      : ['(无)']),
    '',
  ]
  fs.mkdirSync(OUT.replace(/[/\\][^/\\]+$/, ''), { recursive: true })
  fs.writeFileSync(OUT, lines.join('\n'))
  console.log(`报告已写入 ${OUT}`)
}
process.exit(0)

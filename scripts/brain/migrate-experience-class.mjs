#!/usr/bin/env node
// migrate-experience-class.mjs — #74/P1 存量经验归一迁移: 给历史 ExperienceWeight 节点补 e.cls(漏洞类)。
// 分类器与 plugin/pentest-dsh/domain/experience.mjs 同源(单点真源); 只补缺失(cls 为空), 不覆写已有值。
// 幂等, 可重复执行。dry-run 默认只打印映射; --apply 写回图。
// 用法: node scripts/brain/migrate-experience-class.mjs [--apply] [--graph 8766]
import fs from 'node:fs'
import os from 'node:os'
import { execFileSync } from 'node:child_process'
import { patternClass } from '../../plugin/pentest-dsh/domain/experience.mjs'

const gi = process.argv.indexOf('--graph')
const GRAPH = gi > 0 ? process.argv[gi + 1] : '8766'
const APPLY = process.argv.includes('--apply')

function gq(cypher, params = {}) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '15', '-X', 'POST',
    `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
    '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher, params })], { encoding: 'utf8' })
  const data = JSON.parse(res)
  if (!data.ok) throw new Error(data.error ?? 'query failed')
  return data.rows ?? []
}

const rows = gq(
  `MATCH (e:ExperienceWeight) WHERE e.cls IS NULL OR e.cls = '' ` +
  `RETURN e.id AS id, e.pattern AS p, e.recipe AS r, e.stack AS st, e.payload_hint AS ph LIMIT 1000`,
)

if (!rows.length) {
  console.log('无待迁移节点(全部已有 cls) — 完成')
  process.exit(0)
}

console.log(`待迁移 ${rows.length} 个 ExperienceWeight 节点${APPLY ? '' : '(dry-run, 加 --apply 写回)'}:\n`)
let done = 0
for (const r of rows) {
  // 归一语料 = pattern + recipe + payload_hint(分类器需要语义, 单看 succ:slug 常常不够)
  const corpus = `${r.p ?? ''} ${r.r ?? ''} ${r.ph ?? ''}`
  const cls = patternClass(corpus)
  console.log(`${String(r.id ?? '?').padEnd(40)} → ${cls}`)
  if (APPLY) {
    gq(`MATCH (e:ExperienceWeight {id:$id}) SET e.cls = $cls`, { id: String(r.id), cls })
    done++
  }
}
console.log(APPLY ? `\n✅ 已写回 ${done} 个节点` : '\n(dry-run 结束)')

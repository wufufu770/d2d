#!/usr/bin/env node
// misses-report.mjs — T3-1-3 misses 月度聚合 CLI(零侵入: 只读 memory-usage.json, 写报告文档)
// 用法:
//   node scripts/brain/misses-report.mjs                    聚合全部月份, 落 reports/misses-全期.md
//   node scripts/brain/misses-report.mjs --month 2026-09    只出指定月
//   node scripts/brain/misses-report.mjs --inbox            额外把选题输入文档投放 knowledge/inbox(人工确认后手跑)
//   node scripts/brain/misses-report.mjs --stdout           只打印不落盘
// 输出 = study 选题输入文档; 人工勾选方向后编辑投放 inbox 才进蒸馏(文档头有说明)。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { loadStore } from '../../plugin/pentest-dsh/domain/memory-store.mjs'
import { aggregateMisses, renderMissesDoc } from '../../plugin/pentest-dsh/domain/knowledge-gaps.mjs'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const mi = process.argv.indexOf('--month')
const MONTH = mi > -1 ? process.argv[mi + 1] : ''
const INBOX = process.argv.includes('--inbox')
const STDOUT = process.argv.includes('--stdout')

const store = loadStore(`${DATA_DIR}/brain/memory-usage.json`)
const buckets = aggregateMisses(store.misses, {})
const doc = renderMissesDoc(buckets, { month: MONTH || undefined })
const name = `misses-${MONTH || '全期'}.md`

if (STDOUT) { console.log(doc); process.exit(0) }
const outPath = `${DATA_DIR}/brain/reports/${name}`
fs.mkdirSync(path.dirname(outPath), { recursive: true })
fs.writeFileSync(outPath, doc)
console.log(`✅ 选题输入文档: ${outPath}(${buckets.length} 个月度桶)`)
if (INBOX) {
  const inPath = `${DATA_DIR}/knowledge/inbox/${name}`
  fs.mkdirSync(path.dirname(inPath), { recursive: true })
  fs.copyFileSync(outPath, inPath)
  console.log(`📥 已投放 knowledge/inbox: ${inPath}(下轮 study 蒸馏消费; 记得人工勾选方向)`)
}

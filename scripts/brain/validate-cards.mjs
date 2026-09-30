#!/usr/bin/env node
// validate-cards.mjs — T3-1-1 知识卡 Schema 全量校验 CLI(阻断 + 报告, 不静默修复)
// 用法:
//   node scripts/brain/validate-cards.mjs --seed        仅校验仓内种子包(CI 门, 无数据目录依赖)
//   node scripts/brain/validate-cards.mjs --data        校验 DATA_DIR 知识库(current+shadow+versions 全量)
//   node scripts/brain/validate-cards.mjs               = --seed --data 全量
//   node scripts/brain/validate-cards.mjs --quiet       只输出结论行
// 退出码: 0 全过 / 1 有失败(错字段/缺必填直接挂, 差异清单逐行列出)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { validateCards } from '../../plugin/pentest-dsh/domain/card-schema.mjs'

const REPO = process.env.D2D ?? path.resolve(`${import.meta.dirname}/../..`)
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const QUIET = process.argv.includes('--quiet')
const SEED = process.argv.includes('--seed')
const DATA = process.argv.includes('--data')
const DO_SEED = SEED || (!SEED && !DATA)
const DO_DATA = DATA || (!SEED && !DATA)

const SEED_PACKS = [
  ['brain/seed/seed-cards.json', `${REPO}/brain/seed/seed-cards.json`],
  ['brain/seed/v0-techniques.json', `${REPO}/brain/seed/v0-techniques.json`],
]

function loadPack(p) {
  const j = JSON.parse(fs.readFileSync(p, 'utf8'))
  return Array.isArray(j) ? j : (j.cards ?? [])
}

let totalPass = 0, totalFail = 0
const failLines = []
function runSet(label, cards) {
  const r = validateCards(cards)
  totalPass += r.passed
  totalFail += r.failed
  if (!QUIET) console.log(`${r.failed ? '❌' : '✅'} ${label}: ${r.passed} 过 / ${r.failed} 挂`)
  for (const row of r.rows) {
    if (row.ok) continue
    failLines.push(`${label} ⋅ ${row.id}: ${row.errors.join('; ')}`)
  }
}

if (DO_SEED) {
  for (const [name, p] of SEED_PACKS) {
    if (!fs.existsSync(p)) { console.error(`❌ 种子包缺失: ${p}`); totalFail++; continue }
    runSet(name, loadPack(p))
  }
}
if (DO_DATA) {
  // 知识库全量: current/shadow 软链指向的版本 + versions/ 下全部带 manifest 的版本
  const BRAIN = `${DATA_DIR}/brain`
  const targets = []
  for (const link of ['current', 'shadow']) {
    try { targets.push([link, `${fs.readlinkSync(`${BRAIN}/${link}`)}/techniques.json`]) } catch {}
  }
  try {
    for (const d of fs.readdirSync(`${BRAIN}/versions`).filter((x) => /^v\d+$/.test(x))) {
      const p = `${BRAIN}/versions/${d}/techniques.json`
      if (fs.existsSync(p)) targets.push([`versions/${d}`, p])
    }
  } catch {}
  const seen = new Set()
  for (const [label, p] of targets) {
    if (seen.has(p)) continue // current/shadow 与 versions 同文件, 去重
    seen.add(p)
    try { runSet(`知识库/${label}`, loadPack(p)) } catch (e) { console.error(`❌ 知识库/${label} 读取失败: ${e.message}`); totalFail++ }
  }
}

if (failLines.length) {
  console.error(`\nSchema 差异清单(${failLines.length} 张):`)
  for (const l of failLines) console.error(`  - ${l}`)
}
console.log(totalFail ? `❌ 卡片 Schema 校验未过: ${totalPass} 过 / ${totalFail} 挂` : `✅ 卡片 Schema 校验全过: ${totalPass} 张`)
process.exit(totalFail ? 1 : 0)

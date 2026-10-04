#!/usr/bin/env node
// scripts/brain/embed-backfill.mjs — R5 写入端存量卡补算(R5-0 方案卡 §四.1)。
// dry-run 缺省(拍板 2): 只报告将补算的卡; --apply 实跑(幂等 skip 已有向量——重跑零写入)。
// 目标: current + shadow 两族 techniques.json; 嵌入语料=corpusOf 同源(title+recipe+applies_to
// +signals+tech, 与 knowledge-retrieval corpusOf 一致——检索与索引同文才能对齐)。
// 依赖: P2P_EMBED=on+模型在位(域模块降级链管辖); 模型缺 → exit 3 如实登记。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const REPO = process.env.D2D ?? path.join(os.homedir(), 'd2d')
const DATA_DIR = process.env.D2D_DATA_DIR || `${os.homedir()}/.d2d-data`
const APPLY = process.argv.includes('--apply')
const DIRS = ['current', 'shadow']

function corpusOf(c) {
  return `${c.title ?? ''} ${c.validation_recipe ?? ''} ${(c.applies_to ?? []).join(' ')} ${(c.signals ?? []).join(' ')} ${(c.tech ?? []).join(' ')}`
}

const isDirect = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
if (isDirect) {
  process.env.P2P_EMBED = 'on'
  const { embedText } = await import(`${REPO}/plugin/pentest-dsh/domain/embed.mjs`)
  const probe = await embedText('probe', { kind: 'card' })
  if (!probe) {
    console.error('✗ 嵌入通道不可用(模型缺失/加载失败)——backfill 中止(检索链不受影响, 降级链管辖)')
    process.exit(3)
  }
  const report = []
  for (const d of DIRS) {
    const p = path.join(DATA_DIR, 'brain', d, 'techniques.json')
    let cards = []
    try { cards = JSON.parse(fs.readFileSync(p, 'utf8')).cards ?? [] } catch { continue }
    const todo = cards.filter((c) => !Array.isArray(c.embedding))
    report.push({ store: d, total: cards.length, todo: todo.length })
    if (!APPLY) continue
    let done = 0
    for (const c of todo) {
      const vec = await embedText(corpusOf(c), { kind: 'card' })
      if (vec) { c.embedding = Array.from(vec); done++ }
    }
    if (done) {
      fs.writeFileSync(p, JSON.stringify({ cards }, null, 1))
      console.log(`  ✓ ${d}: 补算 ${done}/${todo.length} 张 → ${p}`)
    }
  }
  console.log(JSON.stringify({ mode: APPLY ? 'apply' : 'dry-run', stores: report }, null, 1))
}

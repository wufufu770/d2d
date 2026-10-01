#!/usr/bin/env node
// skill-export.mjs — T3-2-3 Skill 形态导出(五形态实质样例; 衔接 T3-2-2 brain/skills/)
// 把 brain/skills 下 current 态的 SKILL.md(通用 agent skill 格式 — front-matter+正文)打包到
// 导出目录: <out>/skills/<slug>/SKILL.md + <out>/skills/index.json(清单)。零转换 — SKILL.md
// 本身即宿主可消费形态(dsh/通用 agent 宿主), 导出=收集+登记, 不造假内容。
// 用法: node scripts/brain/skill-export.mjs [--out <目录>] (缺省 ${DATA_DIR}/export/skills)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const SKILLS = `${DATA_DIR}/brain/skills`
const oi = process.argv.indexOf('--out')
const OUT = oi > -1 ? path.resolve(process.argv[oi + 1]) : `${DATA_DIR}/export/skills`

import { pathToFileURL } from 'node:url'
const __isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href
const index = []
if (__isMain) try {
  for (const d of fs.readdirSync(SKILLS).sort()) {
    const md = path.join(SKILLS, d, 'SKILL.md')
    const st = path.join(SKILLS, d, 'state.json')
    if (!fs.existsSync(md) || !fs.existsSync(st)) continue
    const state = JSON.parse(fs.readFileSync(st, 'utf8'))
    if (state.status !== 'current') continue // 只导出 current(quarantined/shadow 未晋级不外发)
    const id = (fs.readFileSync(md, 'utf8').match(/^id: (.+)$/m) ?? [])[1] ?? `skill:${d}`
    fs.mkdirSync(path.join(OUT, d), { recursive: true })
    fs.copyFileSync(md, path.join(OUT, d, 'SKILL.md'))
    if (fs.existsSync(path.join(SKILLS, d, 'memory.md'))) fs.copyFileSync(path.join(SKILLS, d, 'memory.md'), path.join(OUT, d, 'memory.md'))
    index.push({ id, slug: d, title: state.title ?? '', status: state.status, exported_at: new Date().toISOString() })
  }
} catch { console.log(`(无 skills 目录或不可读: ${SKILLS})`) }

fs.mkdirSync(OUT, { recursive: true })
fs.writeFileSync(path.join(OUT, 'index.json'), JSON.stringify({ version: 1, exported_at: new Date().toISOString(), count: index.length, skills: index }, null, 1))
if (__isMain) { console.log(`✅ Skill 导出完成: ${index.length} 个 current skill → ${OUT}(清单 index.json)`)
  if (!index.length) console.log('提示: 仅 current 态 skill 会导出; quarantine/shadow 不外发(晋级纪律)。') }

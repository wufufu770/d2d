#!/usr/bin/env node
// skill-distill.mjs — T3-2-2 技能抽取蒸馏管道(素材→候选 skill→quarantine; dry-run 默认)
// 素材源(审计项 4): Experience 全状态(/query) + verify-result 信号(used_knowledge 归因优先)。
// 预筛规则(升格建议口径): 同主题聚集(归一 title/signal 词面重叠 ≥2 条) 或 知识卡 wins≥2 的
//   主题 → 候选。素材不足 → 空转保护退出 0(不硬凑 — 拍板"建管道不硬跑")。
// 产出纪律: 管道只产**骨架**(front-matter + 小节占位 + evidence 引用), 正文由人工/后续蒸馏
//   补全 — 不用模板文字造假程序性知识; --apply 落 quarantine(SKILL.md + state.json)。
// 与 study.mjs 关系: 独立 CLI 不改 study 主干(3.5-2 蒸馏管道禁区边界); 与 misses 选题输入并列
//   为 study 选题源。
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const SKILLS = `${DATA_DIR}/brain/skills`
const APPLY = process.argv.includes('--apply')
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]+/g, '')

function gq(cy) {
  const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
  const res = execFileSync('curl', ['-s', '-m', '10', '-X', 'POST', `http://127.0.0.1:${process.env.P2P_GRAPHD_PORT ?? 8766}/query`,
    '-H', 'Content-Type: application/json', '-H', `X-Auth: ${token}`, '-d', JSON.stringify({ cypher: cy })], { encoding: 'utf8' })
  return JSON.parse(res).rows ?? []
}

// ---------- 素材拉取(读侧; 失败 → 空素材走空转保护) ----------
let experiences = [], winsThemes = []
try {
  experiences = gq(`MATCH (x:Experience) RETURN x.id AS id, x.title AS t, x.category AS c, x.content AS ct, x.status AS st LIMIT 100`)
} catch { /* 已记因: 降级路径——graphd 经验查询失败, 按空素材走空转保护退出 */ }
try {
  winsThemes = gq(`MATCH (e:ExperienceWeight) WHERE e.id STARTS WITH 'card:' AND e.wins >= 2 RETURN e.id AS id, e.wins AS w`)
} catch { /* 已记因: 降级路径——卡池胜场查询失败, 按无胜题继续候选聚集 */ }

// ---------- 同主题聚集(词面重叠 ≥2 条经验) ----------
const tokensOf = (t) => { const s = norm(t); return new Set(s.length > 4 ? [s.slice(0, 4), s.slice(-4)] : [s]) }
const clusters = []
for (const e of experiences) {
  const tk = tokensOf(e.t)
  let hit = null
  for (const cl of clusters) {
    for (const t of tk) if (cl.tokens.has(t)) { hit = cl; break }
    if (hit) break
  }
  if (hit) { hit.items.push(e); for (const t of tk) hit.tokens.add(t) }
  else clusters.push({ tokens: new Set(tk), items: [e] })
}
const candidates = []
for (const cl of clusters) {
  if (cl.items.length >= 2) candidates.push({ theme: cl.items[0].t, items: cl.items, reason: `同主题经验×${cl.items.length}` })
}
for (const w of winsThemes) candidates.push({ theme: String(w.id).replace(/^card:/, 'card:'), items: [{ id: w.id, t: String(w.id) }], reason: `知识卡 wins=${w.wins}` })

// ---------- 输出/落盘 ----------
if (!candidates.length) {
  console.log(`素材不足: Experience ${experiences.length} 条(同主题聚集 0) + card wins≥2 ${winsThemes.length} — 管道空转保护, 不产候选。`)
  console.log('提示: 候选门槛 = 同主题经验 ≥2 条 或 知识卡 wins ≥2; 实战积累后重跑。')
  process.exit(0)
}
console.log(`候选 skill ${candidates.length} 个:`)
for (const c of candidates) {
  const slug = norm(c.theme).slice(0, 32) || 'theme'
  const id = `skill:${slug}`
  const evidence = c.items.map((i) => String(i.id)).slice(0, 5)
  console.log(`  - ${id} [${c.reason}] evidence: ${evidence.join(', ')}`)
  if (!APPLY) continue
  const dir = path.join(SKILLS, slug)
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) { console.log(`    (已存在, 跳过)`); continue }
  fs.mkdirSync(dir, { recursive: true })
  const md = [
    '---',
    `id: ${id}`,
    `title: "${c.theme.replace(/"/g, "'").slice(0, 100)}"`,
    `category: infra`,
    `version: 1`,
    `status: quarantined`,
    `signal_affinity: [] # 待人工按主题词面补全(角色-卡绑定键)`,
    `evidence:`,
    ...evidence.map((e) => `  - "${e.replace(/"/g, "'")}"`),
    `refs:`,
    `  - "skill-distill 管道候选(素材聚簇)"`,
    `created_at: ${new Date().toISOString()}`,
    '---',
    '',
    '# 触发',
    '<待人工蒸馏: 什么场景/指纹触发本技能>',
    '',
    '# 步骤',
    '<待人工蒸馏: 步骤化 recipe(从素材经验/verify 回放矩阵提炼)>',
    '',
    '# 验证',
    '<待人工蒸馏: 最小验证步与判定标准>',
    '',
    '# 阴性',
    '<待人工蒸馏: 什么相似情形不是本技能的适用面>',
    '',
  ].join('\n')
  fs.writeFileSync(path.join(dir, 'SKILL.md'), md)
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify({ id, title: c.theme, status: 'quarantined', created_at: new Date().toISOString(), reason: c.reason }, null, 2))
  console.log(`    ✅ 骨架已落 quarantine: ${dir}(正文待人工蒸馏)`)
}
if (!APPLY) console.log('(dry-run, --apply 落 quarantine 骨架)')

#!/usr/bin/env node
// doctor.mjs — d2d 运行环境自检(借鉴 openclaude doctor:runtime)
// 用法: node scripts/ops/doctor.mjs [--fix]
// 检查: graphd 健康+生命周期列 / 令牌 / 模型策略+余额探针 / 暂停开关 / 守护单元 / 知识脑包 / 学习队列
// 0905 教训: 额度 402、Engagement 缺列、E2BIG、token 失效——任何一个都能让整轮白跑, doctor 一次全查。
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

const REPO = process.env.D2D ?? path.resolve(import.meta.dirname ?? '.', '../..')
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const GRAPH = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const rows = []
const check = (name, ok, detail = '') => rows.push({ name, ok, detail })

// 1. graphd 健康
let graphdOk = false
try {
  const r = await fetch(`${GRAPH}/health`, { signal: AbortSignal.timeout(4000) })
  graphdOk = (await r.json()).ok === true
} catch {}
check('graphd 健康', graphdOk, GRAPH)

// 2. host token + 生命周期列(0905 实证: 缺列时栅栏/租约/取消整体静默失效)
let tok = ''
try { tok = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch {}
check('host-token 可读', Boolean(tok))
const q = async (cypher) => {
  const r = await fetch(`${GRAPH}/query`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Auth': tok },
    body: JSON.stringify({ cypher }), signal: AbortSignal.timeout(6000),
  })
  return r.json()
}
if (tok && graphdOk) {
  try {
    const res = await q("MATCH (e:Engagement) RETURN e.cancel AS c LIMIT 1")
    check('Engagement 生命周期列(cancel/leased_by/lease_at)', res.ok === true, res.ok ? '' : JSON.stringify(res.error ?? '').slice(0, 80))
  } catch (e) { check('Engagement 生命周期列', false, e.message) }
  try {
    const a = await q("MATCH (e:Engagement) WHERE e.status='active' RETURN count(e) AS c")
    check('无僵尸 active engagement', Number(a.rows?.[0]?.c ?? 0) === 0, `active=${a.rows?.[0]?.c}`)
  } catch (e) { check('engagement 状态查询', false, e.message) }
}

// 3. 全局暂停开关状态
const paused = (() => { try { return JSON.parse(fs.readFileSync(`${DATA_DIR}/config/paused.json`, 'utf8')).paused } catch { return false } })()
check('写通道暂停开关', !paused, paused ? 'paused.json 存在 — 新 engagement 启动时自动解除' : '')

// 4. 模型策略: 占位符/空值检测(#3) + study 角色可达
const pol = (() => { try { return JSON.parse(fs.readFileSync(`${DATA_DIR}/config/model-policies.json`, 'utf8')) } catch { return null } })()
check('model-policies.json 存在', Boolean(pol))
const placeholder = pol ? ['discovery', 'deep', 'creative', 'verify', 'study'].map((r) => pol.roles?.[r]?.primary ?? pol.default?.primary ?? '').filter((m) => !m || m.includes('<') || !m.includes('/')) : ['(文件缺失)']
check('模型策略无占位符', placeholder.length === 0, placeholder.join(', '))

// 5. 主模型余额探针(1 次最小调用; 凭据只从 dsh credentials 读取, 不打印值)
const cred = (() => { try { return fs.readFileSync(`${os.homedir()}/.dsh/.credentials.yaml`, 'utf8') } catch { return '' } })()
const mm = (cred.match(/MINIMAX_API_KEY: \S+/) ?? [])[0]?.split(': ')[1]
if (mm) {
  try {
    const r = await fetch('https://api.minimax.chat/v1/chat/completions', {
      method: 'POST', headers: { Authorization: `Bearer ${mm}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'MiniMax-M3', messages: [{ role: 'user', content: 'hi' }], max_tokens: 4 }),
      signal: AbortSignal.timeout(15000),
    })
    const j = await r.json()
    const dead = j?.error?.http_code === '402' || /insufficient|balance/i.test(JSON.stringify(j.error ?? ''))
    check('主模型(minimax M3)余额探针', !dead, dead ? '402 无余额 — 建议切槽或充值' : 'OK')
  } catch (e) { check('主模型余额探针', false, e.message.slice(0, 60)) }
} else check('凭据引用(MINIMAX_API_KEY)', false, 'credentials.yaml 无此键')

// 6. systemd 守护单元
for (const u of ['d2d-graphd', 'd2d-dsh-web', 'd2d-egress', 'd2d-oast']) {
  try {
    const s = execFileSync('systemctl', ['--user', 'is-active', u], { encoding: 'utf8' }).trim()
    check(`单元 ${u}`, s === 'active', s)
  } catch { check(`单元 ${u}`, false, '未安装/非 active — 建议装 systemd 单元') }
}

// 7. 知识脑三层可解析 + 学习队列
for (const d of ['current', 'staged', 'shadow']) {
  try {
    const n = JSON.parse(fs.readFileSync(`${DATA_DIR}/brain/${d}/techniques.json`, 'utf8')).cards.length
    check(`知识脑 ${d} 包可解析`, true, `${n} 卡`)
  } catch (e) { check(`知识脑 ${d} 包可解析`, false, e.message.slice(0, 50)) }
}
let inboxN = 0
try { inboxN = fs.readdirSync(`${DATA_DIR}/knowledge/inbox`).filter((f) => /\.(md|txt|markdown)$/i.test(f)).length } catch {}
check('学习队列状态', true, inboxN ? `inbox 待蒸馏 ${inboxN} 篇(下次 auto-study 消化)` : 'inbox 空(已消化)')

// ---- 汇总 ----
const bad = rows.filter((r) => !r.ok)
for (const r of rows) console.log(`${r.ok ? '✓' : '✗'} ${r.name}${r.detail ? ' — ' + r.detail : ''}`)
console.log(`\n${rows.length - bad.length}/${rows.length} 项通过${bad.length ? `；${bad.length} 项异常需处理` : '，全部健康'}`)
process.exit(bad.length ? 1 : 0)

#!/usr/bin/env node
// company-sweep.mjs — 企业风险轴 v1(0906 skyline 资产面采纳): 公司名/品牌名 → ICP 备案关联域名
// → 写入 Signal_(type='asset-perimeter') 供人确认后再入 engagement scope(脚本本身不改 scope)。
// 用法:
//   node scripts/ops/company-sweep.mjs --company "某某网络科技" [--write] [--json]
// 数据源(key 驱动, 无 key 时给出指引并退出):
//   D2D_ICP_API_KEY  — chinaz ICP 查询 key(apidatav2.chinaz.com/single/newicp)
// 安全: 仅 https 出站; 结果是"候选资产"不是授权范围 — 测试前必须人工确认归属并加入 scope。
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'

const args = process.argv.slice(2)
const get = (k) => { const i = args.indexOf(k); return i === -1 ? '' : String(args[i + 1] ?? '') }
const company = get('--company') || (process.env.D2D_COMPANY ?? '')
const doWrite = args.includes('--write')
const asJson = args.includes('--json')
const GRAPHD = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'
const token = (() => { try { return fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim() } catch { return '' } })()

if (!company) { console.error('用法: company-sweep.mjs --company "公司名" [--write] [--json]'); process.exit(1) }
const key = process.env.D2D_ICP_API_KEY ?? ''
if (!key) {
  console.error('缺 D2D_ICP_API_KEY — ICP 源需要 key(chinaz apidatav2)。配置后重跑, 或手动从 beian 查询后把域名加入 scope。')
  process.exit(2)
}

async function icpQuery(name) {
  const url = `https://apidatav2.chinaz.com/single/newicp?key=${encodeURIComponent(key)}&name=${encodeURIComponent(name)}`
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
  if (!res.ok) throw new Error(`icp http ${res.status}`)
  const j = await res.json()
  if (j.ResultCode !== '200' && j.State !== 1 && j.code !== 200) return []
  const items = j.Result ?? j.Data ?? j.result ?? []
  // 归一: 每条备案 → { 主办单位, 域名列表 }
  return (Array.isArray(items) ? items : [items]).map((it) => ({
    unit: String(it.CompanyName ?? it.UnitName ?? it.unit ?? name),
    domains: String(it.Domain ?? it.domain ?? '').split(/[\s,，]+/).filter(Boolean),
  })).filter((x) => x.domains.length)
}

async function writeSignal(evidence) {
  const res = await fetch(`${GRAPHD}/write/signal`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify({ type: 'asset-perimeter', weight: 1.0, evidence }),
    signal: AbortSignal.timeout(8000),
  })
  if (!res.ok) throw new Error(`graphd write ${res.status}`)
}

const records = await icpQuery(company).catch((e) => { console.error(`ICP 查询失败: ${e.message}`); process.exit(3) })
const domains = [...new Set(records.flatMap((r) => r.domains))]
const out = { company, units: records.length, domains, note: '候选资产 — 人工确认归属后加入 scope, 未确认前不入图端点' }
if (asJson) console.log(JSON.stringify(out, null, 2))
else {
  console.log(`公司: ${company}\n备案主体: ${records.length} 个\n候选域名(${domains.length}):`)
  for (const d of domains) console.log(`  ${d}`)
  console.log('\n注: 人工确认归属后加入 scope; 未确认前不要对它们发起测试。')
}
if (doWrite && domains.length) {
  const digest = crypto.createHash('sha1').update(domains.join(',')).digest('hex').slice(0, 8)
  await writeSignal(`company-sweep(${digest}): ${company} → 候选域名 ${domains.join(', ')} (人工确认归属后入 scope)`)
  console.log(`\n已写 Signal_(asset-perimeter) 摘要到图。`)
}

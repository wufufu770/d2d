#!/usr/bin/env node
// check.mjs — 测绘凭据活性检测(P1/M1, 对标 skyline 凭据页"检测"按钮)。
// 真实调平台接口(domain="example.com" 单条探针, 25s 超时; 鹰图按条扣分 — 探针成本 1 积分)。
// 输出逐家状态与剩余额度; exit: 0=至少一家可用, 1=已配置但全部失败, 2=一家都没配。
// 用法: node scripts/recon/mapping/check.mjs [--json] [--domain example.com]
import { providers } from './quota.mjs'

const asJson = process.argv.includes('--json')
const di = process.argv.indexOf('--domain')
const domain = di > -1 ? String(process.argv[di + 1] ?? 'example.com') : 'example.com'
const TIMEOUT = 25_000

const rows = []
for (const p of providers) {
  if (!p.isConfigured()) {
    rows.push({ provider: p.meta.id, name: p.meta.name, ok: false, reason: `未配置(${p.meta.envKeys.join(',')} — ${p.meta.setup})` })
    continue
  }
  const t0 = Date.now()
  try {
    const r = await p.search({ domain }, { size: 1, maxPages: 1, timeoutMs: TIMEOUT })
    const q = await p.quota({ timeoutMs: TIMEOUT }).catch(() => null)
    rows.push({
      provider: p.meta.id, name: p.meta.name, ok: true, ms: Date.now() - t0,
      probe: r.assets.length, total: r.total, query: r.query,
      remaining: q?.remaining ?? r.quota?.remaining ?? null,
    })
  } catch (e) {
    rows.push({ provider: p.meta.id, name: p.meta.name, ok: false, ms: Date.now() - t0, reason: String(e.message ?? e).slice(0, 200) })
  }
}

if (asJson) console.log(JSON.stringify({ domain, rows }, null, 2))
else {
  console.log(`测绘凭据检测(探针 domain="${domain}", 单条):\n`)
  for (const r of rows) {
    const state = r.ok ? `✓ 可用(${r.ms}ms, 探针 ${r.probe}/${r.total}${r.remaining != null ? `, 剩余 ${r.remaining}` : ''})` : `✗ ${r.reason}`
    console.log(`  ${r.name.padEnd(12)} ${state}`)
  }
  console.log('\n注: 探针是真实查询 — 鹰图按条扣分(1 条=1 积分); 其余平台消耗可忽略。')
}
const configured = rows.filter((r) => !r.reason?.startsWith('未配置'))
if (!configured.length) process.exit(2)
process.exit(rows.some((r) => r.ok) ? 0 : 1)

#!/usr/bin/env node
// push-scan.mjs — E31 公开面卫生闸（push 前靶场关联字串扫描——零容忍清单）
// 用法: node scripts/ops/push-scan.mjs [--staged]   （--staged=只扫暂存区; 缺省=扫待推送差集）
// 退出码: 0=干净可推; 1=命中（禁止推送——处置后再推）
// 字串清单=私有面代号映射表的对偶（映射表本地保存永不入公开面——E31 纪律）。
import { execFileSync } from 'node:child_process'

const REPO = new URL('..', 'file://' + new URL(import.meta.url).pathname.replace(/^\/( [A-Za-z])/, '$1').replace(/\/$/, '')).pathname.replace(/^\/( [A-Za-z])/, '$1').replace(/\/$/, '')
const argv = process.argv.slice(2)
const staged = argv.includes('--staged')

const NEEDLES = [
  '192.168.132.', // r2b 系网段（含 .14/.11）
  '192.168.41.152', // gshop 网段
  'GokTech',
  'GSHOP-Lab',
  'gshop',
  'ee450095f726', // 实测指纹串（E22 系）
  '7d44a2950cc7',
  'de3707ebbd69',
  'pwn3d ACCESS GRANTED', // tarpit 诱饵页特征
]

function scan(text, label) {
  const hits = []
  for (const n of NEEDLES) {
    let idx = text.indexOf(n)
    while (idx !== -1) {
      const lineStart = text.lastIndexOf('\n', idx) + 1
      const lineEnd = text.indexOf('\n', idx)
      hits.push({ needle: n, line: text.slice(lineStart, lineEnd === -1 ? undefined : lineEnd).slice(0, 160) })
      idx = text.indexOf(n, idx + n.length)
      if (hits.length > 50) break
    }
    if (hits.length > 50) break
  }
  for (const h of hits) console.error(`[push-scan] 命中 (${label}): [${h.needle}] ${h.line}`)
  return hits
}

let files
if (staged) {
  files = execFileSync('git', ['-C', REPO, 'diff', '--cached', '--name-only'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
} else {
  // 待推送差集=origin/main..HEAD 的变更文件（untracked 不在 git 面不算推送面）
  files = execFileSync('git', ['-C', REPO, 'diff', '--name-only', 'origin/main..HEAD'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
}
// 自指豁免: 扫描器自身的 NEEDLES 清单即特征串本体（闸工具面非泄露面——清单内容=检测
// 能力所需, 与"靶场信息出现在业务/文档面"性质不同）。剔出扫描范围防自指死循环。
files = files.filter((f) => !f.endsWith('ops/push-scan.mjs'))
let total = 0
for (const f of files) {
  let text = ''
  try {
    text = staged
      ? execFileSync('git', ['-C', REPO, 'show', ':' + f], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      : execFileSync('git', ['-C', REPO, 'show', `HEAD:${f}`], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  } catch { continue } // 删除的文件跳过
  total += scan(text, f).length
}
if (total > 0) {
  console.error(`[push-scan] 共 ${total} 处命中——公开面靶场信息零容忍（E31 红线）, 禁止推送。`)
  console.error('[push-scan] 处置: 代号化（语义等价）/迁移私有面/删除后重扫。')
  process.exit(1)
}
console.log(`[push-scan] 干净（${files.length} 文件零命中）——可推。`)

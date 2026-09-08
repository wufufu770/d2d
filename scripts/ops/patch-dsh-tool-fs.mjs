#!/usr/bin/env node
// patch-dsh-tool-fs.mjs — dsh 沙箱升级字段补丁(0908 实证 bug 的跨系统根治)
//
// 症状: MiniMax-M3(厂商 0907 更新后)等模型会把 dsh bash 工具 schema 里的
//   sandbox_permissions/justification 主动填值发起"沙箱升级"请求; 在 d2d worker 会话
//   (danger-full-access + approval=never)下升级必被拒 → 该 worker 的 bash 全灭 →
//   零写入退出 → zero-write 防御反复重派空烧配额。
// 根治: 不向模型广告升级字段(schemaFields 返回空) — schema 不出现, 模型不再传。
//   resolvePolicy/validateEscalationArgs 保留: 模型手动传参仍走原校验, 官方语义不变。
// 影响: 本机 dsh 的所有会话不再有"单次沙箱升级"入口(web UI 同理); d2d 场景本就不使用。
//
// 用法:
//   node scripts/ops/patch-dsh-tool-fs.mjs            # 打补丁(幂等, 已打则跳过)
//   node scripts/ops/patch-dsh-tool-fs.mjs --check    # 只检查是否已打
//   node scripts/ops/patch-dsh-tool-fs.mjs --restore  # 恢复官方原文件
// install.sh 在 dsh 安装后自动调用本脚本; dsh 升级(npm update)后需重跑。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFileSync } from 'node:child_process'

const MARKER = '[d2d patch 0908]'
const arg = process.argv[2] ?? ''

function locateTarget() {
  const candidates = []
  // ① npm 全局 root(覆盖 npm prefix -g 与 pnpm 全局)
  try { candidates.push(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), '@deepseek-ai/dsh')) } catch {}
  // ② 常见全局前缀兜底
  for (const p of [`${os.homedir()}/.npm-global/lib/node_modules/@deepseek-ai/dsh`, '/usr/lib/node_modules/@deepseek-ai/dsh', '/usr/local/lib/node_modules/@deepseek-ai/dsh']) {
    candidates.push(p)
  }
  for (const base of candidates) {
    const f = path.join(base, 'node_modules', '@deepseek-ai', 'dsh-tool-fs', 'lib', 'index.js')
    if (fs.existsSync(f)) return f
  }
  return null
}

const target = locateTarget()
if (!target) {
  console.error('[d2d-patch] 未找到 dsh-tool-fs(dsh 未安装?) — 跳过(首次 dsh 安装后重跑本脚本)')
  process.exit(arg === '--check' ? 1 : 0)
}

const src = fs.readFileSync(target, 'utf8')

if (arg === '--check') {
  const ok = src.includes(MARKER)
  console.log(ok ? `[d2d-patch] 已打补丁: ${target}` : `[d2d-patch] 未打补丁: ${target}`)
  process.exit(ok ? 0 : 1)
}

if (arg === '--restore') {
  const orig = `${target}.orig-d2d`
  if (!fs.existsSync(orig)) { console.error('[d2d-patch] 无备份可恢复(从未打过补丁)'); process.exit(1) }
  fs.copyFileSync(orig, target)
  console.log(`[d2d-patch] 已恢复官方原文件: ${target}`)
  process.exit(0)
}

if (src.includes(MARKER)) {
  console.log(`[d2d-patch] 已是补丁状态, 跳过: ${target}`)
  process.exit(0)
}

// 首次打补丁: 留一份干净备份(恢复用), 再注入
const orig = `${target}.orig-d2d`
if (!fs.existsSync(orig)) fs.copyFileSync(target, orig)

const ANCHOR = 'schemaFields() {'
const idx = src.indexOf(ANCHOR)
if (idx === -1) {
  console.error('[d2d-patch] 锚点 schemaFields() { 未找到 — dsh 版本结构可能已变, 请人工核对')
  process.exit(1)
}
const injection = `\n\t\t/* ${MARKER} worker 会话(approval=never)下沙箱升级必被拒且 MiniMax-M3 会主动误用本字段 — 不再向模型广告。恢复官方行为: 删除本行。 */\n\t\treturn {};`
const patched = src.slice(0, idx + ANCHOR.length) + injection + src.slice(idx + ANCHOR.length)
fs.writeFileSync(target, patched)

// 验证模块仍可加载
try {
  await import(target)
  console.log(`[d2d-patch] 补丁完成并验证可加载: ${target}`)
  console.log('[d2d-patch] 备份(恢复用 --restore):', orig)
} catch (e) {
  fs.copyFileSync(orig, target)
  console.error('[d2d-patch] 补丁后模块加载失败, 已回滚:', e?.message)
  process.exit(1)
}

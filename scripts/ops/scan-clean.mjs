// scan-clean.mjs — 干净版发布前扫描: 检测仓库内不应存在的真实目标/凭据/挖掘记录/令牌形态。
// 目标黑名单从外部传入(不写入代码): P2P_SCAN_TARGETS="a.com,b.com" 或 --targets 文件(每行一条)。
import fs from 'node:fs'
import path from 'node:path'
const ROOT = process.argv[2] ?? process.cwd()
const EXT = /\.(py|js|mjs|json|md|yml|yaml|sh|service|txt)$/i
const SKIP = /node_modules|package-lock|bun\.lock|[/\\]\.git[/\\]|\.mimosa[/\\]|scan-clean\.mjs$/
const targets = (process.env.P2P_SCAN_TARGETS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)
const PATTERNS = [
  ['64位hex疑似令牌', /\b[a-f0-9]{64}\b/g],
  ['sk- 形态密钥', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  // 大小写敏感(否则 $HOME/ 合法文本被 i 标志误报为 /home/); 前置词字符排除(d2d/home/、REPO_DIR/home/ 仓库相对路径)
  ['仓库外个人绝对路径', /(?<![\w$])\/home\/(?!kali\b)[^/\s]+\//g],
  ...targets.map((t) => [`目标: ${t}`, new RegExp(t.replace(/\./g, '\\.'), 'gi')]),
]
const hits = []
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (SKIP.test(p)) continue
    if (ent.isDirectory()) walk(p)
    else if (EXT.test(ent.name)) {
      const txt = fs.readFileSync(p, 'utf8')
      for (const [label, re] of PATTERNS) {
        const m = txt.match(re)
        if (m) hits.push({ file: path.relative(ROOT, p), label, samples: [...new Set(m)].slice(0, 3) })
      }
    }
  }
}
import os from 'node:os'
walk(ROOT)
if (!hits.length) { console.log('✓ 无泄露命中'); process.exit(0) }
for (const h of hits) console.log(`✗ [${h.label}] ${h.file}: ${h.samples.join(' | ')}`)
console.log(`\n命中 ${hits.length} 处`)

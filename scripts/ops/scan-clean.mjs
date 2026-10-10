// scan-clean.mjs — 干净版发布前扫描: 检测仓库内不应存在的真实目标/凭据/挖掘记录/令牌形态。
// 目标黑名单从外部传入(不写入代码): P2P_SCAN_TARGETS="a.com,b.com" 或 --targets 文件(每行一条)。
// SWEEP-1 3-4: 命中时 process.exit(1)(原版命中仍隐式 exit 0, CI/脚本无法消费)。
// SWEEP-1 语义修正: 扫描对象=git 跟踪面(入库面——磁盘未跟踪缓存/沙箱不入镜);
//   tests?/ 目录豁免=夹具合成域 by-design(do-not-touch 豁免表管辖, 泄露兜底走 gitleaks 全史);
//   /home/ 规则排除 CI 惯例路径(runner)/尖括号占位符/段首点形态(/home/.config/);
//   目标域与 64hex 规则对 .md 豁免=记录/报告面按设计携带目标与哈希引用(人工审查域,
//   gitleaks 兜底), 机械扫描聚焦代码与配置; stryker description-baselines.json=哈希文件 by-design。
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
const ROOT = process.argv[2] ?? process.cwd()
const EXT = /\.(py|js|mjs|json|md|yml|yaml|sh|service|txt)$/i
const SKIP = /node_modules|package-lock|bun\.lock|[/\\]\.git[/\\]|\.mimosa[/\\]|scan-clean\.mjs$|[/\\]tests?[/\\]/
// wordlist 完整性清单与 stryker 变异基线是 sha256 文件摘要(by-design, 防篡改校验),
// 其 64 位 hex 非令牌 — 仅豁免 hex 规则, 其余规则照扫
const DIGEST_OK = /assets[/\\]wordlists[/\\]manifest\.json$|wordlists\.test\.mjs$|description-baselines\.json$/
const targets = (process.env.P2P_SCAN_TARGETS ?? '')
  .split(',').map((s) => s.trim()).filter(Boolean)
const PATTERNS = [
  ['64位hex疑似令牌', /\b[a-f0-9]{64}\b/g],
  ['sk- 形态密钥', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
  // 大小写敏感(否则 $HOME/ 合法文本被 i 标志误报为 /home/); 前置词字符排除(d2d/home/、REPO_DIR/home/ 仓库相对路径);
  // SWEEP-1: 段排除 runner(CI 惯例)、尖括号占位符、段首点(/home/.config/ 形态)
  ['仓库外个人绝对路径', /(?<![\w$])\/home\/(?!kali\b|runner\b|<|\.)[^/\s]+\//g],
  ...targets.map((t) => [`目标: ${t}`, new RegExp(t.replace(/\./g, '\\.'), 'gi')]),
]
const hits = []
function scanFile(p) {
  const rel = path.relative(ROOT, p)
  const txt = fs.readFileSync(p, 'utf8')
  const isRecord = /\.md$/i.test(rel) // 记录/报告面: 目标域与哈希引用按设计存在(人工审查域)
  for (const [label, re] of PATTERNS) {
    if (label === '64位hex疑似令牌' && (DIGEST_OK.test(p) || isRecord)) continue
    if (label.startsWith('目标: ') && isRecord) continue
    const m = txt.match(re)
    if (m) hits.push({ file: rel, label, samples: [...new Set(m)].slice(0, 3) })
  }
}
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name)
    if (SKIP.test(p)) continue
    if (ent.isDirectory()) walk(p)
    else if (EXT.test(ent.name)) scanFile(p)
  }
}
let inGit = false
try { execFileSync('git', ['-C', ROOT, 'rev-parse', '--git-dir'], { stdio: 'pipe' }); inGit = true } catch { inGit = false }
if (inGit) {
  // 入库面语义: 只扫 git 跟踪文件(磁盘未跟踪缓存/沙箱/运行态不入镜——那些不构成公开泄露面)
  const files = execFileSync('git', ['-C', ROOT, 'ls-files', '-c', 'core.quotePath=false'], { encoding: 'utf8' })
    .split('\n').filter(Boolean)
  for (const f of files) {
    const p = path.join(ROOT, f)
    if (SKIP.test(p) || !EXT.test(p)) continue
    try { scanFile(p) } catch { /* 已记因: 二进制/权限异常文件跳过——文本面已由 EXT 限定 */ }
  }
} else {
  walk(ROOT)
}
if (!hits.length) { console.log('✓ 无泄露命中'); process.exit(0) }
for (const h of hits) console.log(`✗ [${h.label}] ${h.file}: ${h.samples.join(' | ')}`)
console.log(`\n命中 ${hits.length} 处`)
process.exit(1)

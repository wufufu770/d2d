#!/usr/bin/env node
// verify-dsh-version.mjs — dsh 版本三处一致性校验 + manifest node_modules 段本地哈希校验(4-3d-2)
//
// 背景(4-1/4-2 审计 + 4-3d-2 复核): 全局 CLI 包 @deepseek-ai/dsh 与插件库包
// @deepseek-ai/dsh-*(plugin/pentest-dsh 六依赖)是两条独立的版本序列。install.sh 曾未锁版
// (npm install -g @deepseek-ai/dsh), 任意上游版本可直接进宿主(4-1); 宿主版本差异又导致
// MCP 工具清单行为漂移(4-2)。现 install.sh 已锁 0.1.1-rc.2(与插件 pin 对齐), 本脚本对
// 三处版本做一致性校验, 不一致 exit 1+差异明细。
//
// 检查口径:
//   ① plugin/pentest-dsh/package.json — @deepseek-ai/dsh-* 依赖须全部精确 pin 同一版本
//     (^/~ 等范围符视为不精确, 记失败);
//   ② install.sh — 正则提取 npm install 行上的 @deepseek-ai/dsh@<PIN>, 须锁定且与①一致
//     (只认 npm install 行, profile heredoc 里的 @deepseek-ai/dsh-base 等不会误中);
//   ③ 全局 CLI 实装版本 — dsh --version → `npm root -g` 下 @deepseek-ai/dsh/package.json →
//     ~/.npm-global/lib/node_modules/@deepseek-ai/dsh/package.json 三级回退; 环境缺失=SKIP
//     (不计失败), 检出且≠pin=失败(如实告警 4-1 偏斜本体, 本机 0.1.5-rc.1 vs pin)。
//
// manifest node_modules 段(--with-manifest 默认开; --no-manifest 关):
//   manifest.sha256 末段条目以 # 锚定 — GNU sha256sum -c 忽略 # 行(实证), 故 CI
//   gates.yml:26 与 install.sh:400 的现有校验只认仓库文件段(零改动, 不受 CI 无
//   node_modules / npm ci 字节变异影响); 本脚本解析 #<hash>␣␣<path> 条目, 校验文件存在
//   且哈希一致, 缺失/不匹配 → WARN(默认不失败, --strict 时失败)。仓库文件段不在本脚本
//   口径内(其 staleness 是 V-16 独立问题)。
//
// 用法:
//   node scripts/ops/verify-dsh-version.mjs [--root <dir>] [--no-manifest] [--strict]
//   node scripts/ops/verify-dsh-version.mjs --emit-manifest-section   # 打印 node_modules 段
//     (pin 变更后: 手工删 manifest.sha256 旧段 → 本命令输出 >> manifest.sha256)
// 退出码: 0=版本一致(manifest 仅 WARN) / 1=版本不一致或 --strict 下有 WARN / 2=输入文件缺失无法检查
// 测试: tests/ops/verify-dsh-version.test.mjs(mocha; 全部检查函数可注入 globalProvider/paths/hashFn)
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { pathToFileURL } from 'node:url'

const execFileP = promisify(execFile)
export const SCOPE = '@deepseek-ai/'
export const DSH_CLI_PKG = '@deepseek-ai/dsh'
export const NODE_SECTION_MARKER = '# --- node_modules (@deepseek-ai/* pinned packages, verify locally) ---'
export const NODE_SECTION_END = '# --- end node_modules ---'
// manifest node_modules 段条目: # 锚定 + sha256sum 文本模式(hash + 两空格 + path)
const NODE_ENTRY_RE = /^#([0-9a-f]{64})  (.+)$/

// ① 插件 pin: package.json 文本 → { pins: {name: spec}, versions, nonExact }
export function parsePluginPins(pkgJsonText) {
  const pkg = JSON.parse(pkgJsonText)
  const sections = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.peerDependencies }
  const pins = {}
  for (const [name, spec] of Object.entries(sections)) {
    if (name === DSH_CLI_PKG || name.startsWith(`${SCOPE}dsh-`)) pins[name] = String(spec)
  }
  const versions = [...new Set(Object.values(pins))]
  const nonExact = Object.entries(pins)
    .filter(([, v]) => !/^\d+\.\d+\.\d+(?:[-+][\w.-]*)?$/.test(v))
    .map(([n, v]) => `${n}@${v}`)
  return { pins, versions, nonExact }
}

// ② install.sh 文本 → { pin, line, lineText, pinned: true|false|null(null=无安装行) }
// 只认 npm install 行; @deepseek-ai/dsh-base 等带 - 后缀的不会命中(前瞻要求 @ver 或空白/EOL)
const INSTALL_DSH_PIN_RE = /@deepseek-ai\/dsh@(?:"([^"]+)"|([^\s"';)]+))/
const INSTALL_DSH_UNPINNED_RE = /@deepseek-ai\/dsh(?=[\s"';)]|$)/
export function parseInstallPin(installShText) {
  const lines = installShText.split('\n')
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!/\bnpm\s+install\b/.test(line) || !line.includes(`${SCOPE}dsh`)) continue
    const m = line.match(INSTALL_DSH_PIN_RE)
    if (m) return { pin: m[1] ?? m[2], line: i + 1, lineText: line.trim(), pinned: true }
    if (INSTALL_DSH_UNPINNED_RE.test(line)) {
      return { pin: null, line: i + 1, lineText: line.trim(), pinned: false }
    }
  }
  return { pin: null, line: null, lineText: null, pinned: null }
}

// manifest 文本 → { entries: [{hash, path}], markerFound }(仓库段条目不以 # 开头, 天然区分)
export function parseManifestNodeSection(manifestText) {
  const entries = []
  for (const raw of manifestText.split('\n')) {
    const line = raw.replace(/\r$/, '')
    const m = line.match(NODE_ENTRY_RE)
    if (m) entries.push({ hash: m[1], path: m[2].trim() })
  }
  return { entries, markerFound: manifestText.includes(NODE_SECTION_MARKER) }
}

export async function defaultHashFile(abs) {
  return createHash('sha256').update(fs.readFileSync(abs)).digest('hex')
}

// { rootDir, entries, hashFn } → { checked, missing[], mismatched[], ok }
export async function verifyManifestSection({ rootDir, entries, hashFn = defaultHashFile } = {}) {
  const missing = []
  const mismatched = []
  for (const { hash, path: rel } of entries) {
    const abs = path.isAbsolute(rel) ? rel : path.join(rootDir, rel)
    if (!fs.existsSync(abs)) { missing.push(rel); continue }
    const actual = await hashFn(abs)
    if (actual !== hash) mismatched.push({ path: rel, expected: hash, actual })
  }
  return { checked: entries.length, missing, mismatched, ok: !missing.length && !mismatched.length }
}

// 生成 manifest node_modules 段文本(六包 × package.json/lib/index.js/lib/types/index.d.ts)
export async function emitManifestSection({ rootDir, packageNames, relFiles } = {}) {
  const files = relFiles ?? ['package.json', 'lib/index.js', 'lib/types/index.d.ts']
  const lines = [
    NODE_SECTION_MARKER,
    '# (4-3d-2) 供应链钉版本: 六个 @deepseek-ai/dsh-* 库包关键文件哈希。条目以 # 锚定 —',
    '# GNU sha256sum -c 忽略 # 行(实证), CI gates.yml:26 与 install.sh:400 只认上方仓库',
    '# 文件段(零改动, 不受 CI 无 node_modules / npm ci 字节变异影响); 本段仅由',
    '# scripts/ops/verify-dsh-version.mjs --with-manifest 本地校验(缺失/不匹配→告警)。',
    '# pin 变更后重新生成: 删旧段(本 marker 至 end marker)→ 下述命令输出追加:',
    '#   node scripts/ops/verify-dsh-version.mjs --emit-manifest-section >> manifest.sha256',
  ]
  for (const name of packageNames) {
    for (const rel of files) {
      const p = `plugin/pentest-dsh/node_modules/${SCOPE}${name}/${rel}`
      const abs = path.join(rootDir, p)
      if (!fs.existsSync(abs)) { lines.push(`# (缺失, 跳过) ${p}`); continue }
      lines.push(`#${await defaultHashFile(abs)}  ${p}`)
    }
  }
  lines.push(NODE_SECTION_END)
  return lines.join('\n') + '\n'
}

// ③ 全局 CLI 版本探测: dsh --version → npm root -g → ~/.npm-global 固定路径
// 全部参数可注入(globalProvider 注入即整函数替换, 供 mocha 测 skip/偏斜路径)
export async function detectGlobalDshVersion({
  execFileFn = execFileP,
  readFile = (p) => fs.readFileSync(p, 'utf8'),
  npmRootFn,
  home = os.homedir(),
} = {}) {
  try {
    const { stdout } = await execFileFn('dsh', ['--version'])
    const m = String(stdout).match(/(\d+\.\d+\.\d+[^\s,'"]*)/)
    if (m) return { status: 'ok', version: m[1], source: 'dsh --version' }
  } catch {}
  let root = ''
  try {
    root = npmRootFn ? await npmRootFn() : String((await execFileFn('npm', ['root', '-g'])).stdout).trim()
    const v = JSON.parse(readFile(path.join(root, SCOPE, 'dsh', 'package.json'))).version
    if (v) return { status: 'ok', version: v, source: path.join(root, SCOPE, 'dsh', 'package.json') }
  } catch {}
  for (const cand of [
    path.join(home, '.npm-global/lib/node_modules', SCOPE, 'dsh/package.json'),
    path.join(home, '.nvm/versions', 'current/lib/node_modules', SCOPE, 'dsh/package.json'),
  ]) {
    try {
      const v = JSON.parse(readFile(cand)).version
      if (v) return { status: 'ok', version: v, source: cand }
    } catch {}
  }
  return { status: 'missing' }
}

// 汇总编排(全部可注入): 返回 { exitCode, ref, checks, warnings, skips, failures, manifest }
export async function runChecks({
  rootDir = process.cwd(),
  paths = {},
  globalProvider = detectGlobalDshVersion,
  withManifest = true,
  strict = false,
  hashFn,
} = {}) {
  const rp = (p) => (path.isAbsolute(p) ? p : path.join(rootDir, p))
  const pluginPkgPath = rp(paths.pluginPkg ?? 'plugin/pentest-dsh/package.json')
  const installShPath = rp(paths.installSh ?? 'install.sh')
  const manifestPath = rp(paths.manifest ?? 'manifest.sha256')
  const checks = []
  const warnings = []
  const skips = []
  const failures = []
  let fatal = false

  // ① 插件 pin(参照版本来源)
  let ref = null
  try {
    const parsed = parsePluginPins(fs.readFileSync(pluginPkgPath, 'utf8'))
    const n = Object.keys(parsed.pins).length
    if (!n) {
      failures.push(`① ${pluginPkgPath} 无 @deepseek-ai/dsh-* 依赖`)
    } else if (parsed.nonExact.length) {
      failures.push(`① 插件 pin 非精确(带范围符): ${parsed.nonExact.join(', ')}`)
    } else if (parsed.versions.length > 1) {
      failures.push(`① 插件 pin 不唯一: ${parsed.versions.join(' vs ')}`)
    } else {
      ref = parsed.versions[0]
      checks.push(`[1/3] 插件 pin: ✓ ${n} 个 @deepseek-ai/dsh-* 全部精确 pin ${ref} (${pluginPkgPath})`)
    }
  } catch (e) {
    fatal = true
    failures.push(`① 无法读取 ${pluginPkgPath}: ${e.message}`)
  }

  // ② install.sh PIN
  try {
    const parsed = parseInstallPin(fs.readFileSync(installShPath, 'utf8'))
    if (parsed.pinned === null) {
      failures.push(`② ${installShPath} 无 npm install @deepseek-ai/dsh 安装行`)
    } else if (!parsed.pinned) {
      failures.push(`② install.sh:${parsed.line} 未锁版: ${parsed.lineText}`)
    } else if (!ref) {
      warnings.push(`② install.sh:${parsed.line} PIN=${parsed.pin}(①参照缺失, 一致性比较跳过)`)
    } else if (parsed.pin !== ref) {
      failures.push(`② install.sh:${parsed.line} PIN=${parsed.pin} ≠ 插件 pin ${ref}`)
    } else {
      checks.push(`[2/3] install.sh: ✓ :${parsed.line} ${parsed.lineText}`)
    }
  } catch (e) {
    fatal = true
    failures.push(`② 无法读取 ${installShPath}: ${e.message}`)
  }

  // ③ 全局 CLI 实装(缺失=SKIP; 偏斜=失败)
  try {
    const g = await globalProvider()
    if (g.status === 'missing') {
      skips.push('[3/3] 全局 CLI: SKIP — 本机未检出全局 dsh(PATH 与 npm prefix 均无); 新装将取 install.sh 锁定版')
    } else if (!ref) {
      warnings.push(`③ 全局 CLI ${g.version}(${g.source})(①参照缺失, 一致性比较跳过)`)
    } else if (g.version !== ref) {
      failures.push(`③ 全局 CLI 实装 ${g.version}(${g.source}) ≠ pin ${ref} — 4-1 审计偏斜本体; 处置: npm install -g ${DSH_CLI_PKG}@${ref}, 或经 dsh-compat 矩阵评估后统一重锁`)
    } else {
      checks.push(`[3/3] 全局 CLI: ✓ ${g.version} (${g.source})`)
    }
  } catch (e) {
    warnings.push(`③ 全局版本探测异常: ${e.message}`)
  }

  // manifest node_modules 段(默认开)
  let manifest = null
  if (withManifest) {
    try {
      const text = fs.readFileSync(manifestPath, 'utf8')
      const parsed = parseManifestNodeSection(text)
      if (!parsed.entries.length) {
        warnings.push(`manifest node_modules 段: 0 条(${parsed.markerFound ? '段内条目为空' : '无段 marker'}) — pin 变更后用 --emit-manifest-section 重新生成`)
      } else {
        const res = await verifyManifestSection({ rootDir, entries: parsed.entries, hashFn })
        manifest = res
        const bad = res.missing.length + res.mismatched.length
        checks.push(`manifest node_modules 段: ${bad ? 'WARN' : '✓'} ${res.checked} 条(缺失 ${res.missing.length} / 不匹配 ${res.mismatched.length}) — 仓库文件段不在本脚本口径(V-16 独立问题)`)
        for (const p of res.missing) warnings.push(`manifest node_modules 段缺失: ${p}(node_modules 未装或被清)`)
        for (const { path: p, expected, actual } of res.mismatched) {
          warnings.push(`manifest node_modules 段哈希不匹配: ${p} 期望 ${expected} 实际 ${actual}(npm ci 重装变异属预期, 确认 pin 未动后重新生成段)`)
        }
      }
    } catch (e) {
      fatal = true
      failures.push(`manifest 无法读取 ${manifestPath}: ${e.message}`)
    }
  }

  const exitCode = fatal ? 2 : failures.length ? 1 : strict && warnings.length ? 1 : 0
  return { exitCode, ref, checks, warnings, skips, failures, manifest }
}

async function main() {
  const argv = process.argv.slice(2)
  const has = (f) => argv.includes(f)
  const arg = (f) => (has(f) ? argv[argv.indexOf(f) + 1] : undefined)
  if (has('--help')) {
    console.log('用法: node scripts/ops/verify-dsh-version.mjs [--root <dir>] [--no-manifest] [--strict] | --emit-manifest-section')
    process.exit(0)
  }
  const rootDir = path.resolve(arg('--root') ?? process.env.D2D ?? path.resolve(import.meta.dirname ?? '.', '../..'))

  if (has('--emit-manifest-section')) {
    const pkgPath = path.join(rootDir, 'plugin/pentest-dsh/package.json')
    let pins
    try {
      pins = parsePluginPins(fs.readFileSync(pkgPath, 'utf8')).pins
    } catch (e) {
      console.error(`✗ 无法读取 ${pkgPath}: ${e.message}`)
      process.exit(2)
    }
    process.stdout.write(await emitManifestSection({ rootDir, packageNames: Object.keys(pins).map((n) => n.slice(SCOPE.length)) }))
    process.exit(0)
  }

  const r = await runChecks({
    rootDir,
    withManifest: !has('--no-manifest'),
    strict: has('--strict'),
  })
  console.log(`dsh 版本一致性校验(4-3d-2) — root: ${rootDir}`)
  for (const c of r.checks) console.log(c)
  for (const s of r.skips) console.log(s)
  for (const w of r.warnings) console.log(`  WARN ${w}`)
  for (const f of r.failures) console.log(`  ✗ ${f}`)
  console.log(`汇总: 失败 ${r.failures.length} / 告警 ${r.warnings.length} / 跳过 ${r.skips.length} → exit ${r.exitCode}`)
  process.exit(r.exitCode)
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
if (isMain) await main()

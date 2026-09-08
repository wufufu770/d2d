#!/usr/bin/env node
// release-smoke.mjs — 发布前 smoke + 自修复闭环(0906 skyline release:smoke 采纳)。
// 语义: 全绿 → 可发布; 任一检查失败 → 输出结构化 Repair Brief(失败命令+stdoutTail/stderrTail+
//       下一步指令), 把 brief 原样回灌给修复 agent(Claude/ZCode/worker)修完重跑本脚本, 直到全绿。
// 用法:
//   node scripts/ops/release-smoke.mjs            # 全量(装配+泄漏+三套测试+主干校验)
//   node scripts/ops/release-smoke.mjs --fast     # 装配+泄漏(mocha/pytest 之外)
//   node scripts/ops/release-smoke.mjs --json     # 机器可读输出
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..')
const FAST = process.argv.includes('--fast')
const AS_JSON = process.argv.includes('--json')
const TAIL = 900

const REQUIRED = [
  'README.md', 'install.sh', 'graphd/app.py', 'ops/start-all.sh', 'package.json', 'requirements.txt',
  'plugin/pentest-dsh/index.js', 'plugin/pentest-dsh/scheduler.js', 'plugin/pentest-dsh/adapter-dsh.mjs',
  'plugin/pentest-dsh/domain/briefs.mjs', 'plugin/pentest-dsh/domain/scope.mjs', 'plugin/pentest-dsh/domain/failover.mjs',
  'plugin/pentest-dsh/domain/strategy-card.mjs', 'plugin/pentest-dsh/domain/verify-verdicts.mjs',
  'plugin/pentest-dsh/worker-env.js', 'plugin/d2d-panel/lib/host/index.mjs',
  'brain/seed/v0-techniques.json', 'scripts/ops/publish-clean.mjs', 'scripts/ops/verify-main.mjs',
  'scripts/ops/release-smoke.mjs', 'tests/test_graphd_gates.py', 'docs/ARCHITECTURE.md',
]

const checks = []
const add = (name, fn) => checks.push({ name, fn })

function run(cmd, args, cwd = ROOT) {
  try {
    const stdout = execFileSync(cmd, args, { cwd, encoding: 'utf8', maxBuffer: 2e8, timeout: 300_000 })
    return { ok: true, stdout }
  } catch (e) {
    return { ok: false, stdout: String(e.stdout ?? '').slice(-TAIL), stderr: String(e.stderr ?? String(e)).slice(-TAIL), status: e.status }
  }
}

add('装配完整性(关键文件在位)', () => {
  const missing = REQUIRED.filter((f) => !fs.existsSync(path.join(ROOT, f)))
  return missing.length ? { ok: false, detail: `缺文件: ${missing.join(', ')}` } : { ok: true }
})

add('泄漏扫描(目标/凭据/挖掘记录)', () => {
  const r = run('node', ['scripts/ops/scan-clean.mjs', ROOT])
  return r.ok ? { ok: true } : { ok: false, detail: '扫描命中 — 详见下方输出', stdout: r.stdout + r.stderr }
})

if (!FAST) {
  add('mocha 单测(pentest-dsh)', () => {
    const r = run('npm', ['test'], path.join(ROOT, 'plugin/pentest-dsh'))
    return r.ok ? { ok: true } : { ok: false, detail: `exit=${r.status}`, stdout: r.stdout, stderr: r.stderr }
  })
  add('graphd gates(pytest)', () => {
    const r = run('python3', ['-m', 'pytest', 'tests/test_graphd_gates.py', '-q'], ROOT)
    return r.ok ? { ok: true } : { ok: false, detail: `exit=${r.status}`, stdout: r.stdout, stderr: r.stderr }
  })
  add('面板单测(d2d-panel)', () => {
    const r = run('npm', ['test'], path.join(ROOT, 'plugin/d2d-panel'))
    return r.ok ? { ok: true } : { ok: false, detail: `exit=${r.status}`, stdout: r.stdout, stderr: r.stderr }
  })
}

const results = []
for (const c of checks) {
  let r
  try { r = await c.fn() } catch (e) { r = { ok: false, detail: String(e?.message ?? e) } }
  results.push({ name: c.name, ...r })
  if (!AS_JSON) console.log(`${r.ok ? '✓' : '✗'} ${c.name}${r.detail ? ` — ${r.detail}` : ''}`)
}

const failed = results.filter((r) => !r.ok)
if (AS_JSON) console.log(JSON.stringify({ ok: failed.length === 0, failed: failed.length, results }, null, 2))

if (failed.length) {
  // Repair Brief — 原样回灌给修复 agent: 修完列出的每一项后重跑本脚本, 直到全绿
  const brief = [
    '## Release Repair Brief',
    '',
    `Decision: not_releasable  |  failed: ${failed.length}/${results.length}`,
    '',
    '### Failed checks(逐项修复后重跑 node scripts/ops/release-smoke.mjs)',
    ...failed.map((f) => [
      `- [ ] ${f.name}${f.detail ? ` — ${f.detail}` : ''}`,
      f.stdout ? `  <stdoutTail>\n${f.stdout.split('\n').map((l) => '  ' + l).join('\n').slice(-TAIL)}\n  </stdoutTail>` : '',
      f.stderr ? `  <stderrTail>\n${f.stderr.split('\n').map((l) => '  ' + l).join('\n').slice(-TAIL)}\n  </stderrTail>` : '',
    ].filter(Boolean).join('\n')),
    '',
    '### 修复约束',
    '- 只修失败项, 不动无关文件; 修复不得绕过检查本身(禁止改判定逻辑/跳过检查)',
    '- 测试失败先写最小复现再改实现; 泄漏命中=目标/凭据内容必须占位化而非删除检查',
  ].join('\n')
  fs.writeFileSync(path.join(os.tmpdir(), 'd2d-repair-brief.md'), brief + '\n')
  if (!AS_JSON) console.log(`\n✗ 不可发布 — Repair Brief 已写入 ${os.tmpdir()}/d2d-repair-brief.md (回灌给修复 agent, 修完重跑本脚本)`)
  process.exit(1)
}
if (!AS_JSON) console.log('\n✓ 全绿 — 可发布(发布走 scripts/ops/publish-clean.mjs)')

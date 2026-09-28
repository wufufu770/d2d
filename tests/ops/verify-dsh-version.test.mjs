// 测试范围: T2-2b-0 — scripts/ops/verify-dsh-version.mjs 检查④(sidebar 成对性)新增 5 用例。
// 落位说明: 4-3d-2 既有 25 条基线用例在 plugin/pentest-dsh/test/verify-dsh-version.test.mjs
// (裁定 (a) 落位, 本文件零重复零触碰); 本文件按 T2-2b-0 交付 4 只承载 (a)-(e),
// 照既有注入范式(rootDir fixture + globalProvider 注入, 绝不读真实全局 npm 状态)。
// 用例:
//   (a) 宿主 0.1.1-rc.2 + pin 0.17.1 → 同区间 OK, 零 WARN
//   (b) 宿主 0.2.0-rc.1 + pin 0.17.1 → 跨区间 WARN 触发且 exit 0(WARN 不阻断)
//   (c) --strict 下 ④ WARN 计失败(exit 1, failures 仍 0 — 走 WARN 通道)
//   (d) 宿主版本缺失 → ④ SKIP, 无 WARN
//   (e) install.sh 无 sidebar pin(heredoc 缺依赖; heredoc 外提及不命中) → ④ SKIP
import { strict as assert } from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  SIDEBAR_COMPAT_TABLE, findCompatRowBySidebarSpec, parseInstallSidebarPin, runChecks,
} from '../../scripts/ops/verify-dsh-version.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..')

const PIN = '0.1.1-rc.2'
const DSH_LIB_PKGS = ['dsh-mcp-client', 'dsh-tools', 'dsh-agent', 'dsh-llm', 'dsh-session', 'dsh-subagent']
const WARN_TEXT = '升级 DSH 时须与 dsh-better-sidebar 成对升级（docs/dsh-sidebar-compat.md）'

const _tmpdirs = []
function mkTmp() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'verify-sidebar-pair-'))
  _tmpdirs.push(dir)
  return dir
}
function writeFile(root, rel, content) {
  const abs = path.join(root, rel)
  fs.mkdirSync(path.dirname(abs), { recursive: true })
  fs.writeFileSync(abs, content)
  return abs
}
// install.sh fixture: dsh CLI 锁版行 + web package.json heredoc(含/不含 sidebar pin);
// stray=true 时在 heredoc 外放一行 dsh-better-sidebar 提及, 验证只认 heredoc 内 pin。
function installShFixture({ dshPin = PIN, sidebarSpec = '0.17.1', stray = false } = {}) {
  return [
    '#!/usr/bin/env bash',
    ...(stray ? ['echo "heredoc 外提及: dsh-better-sidebar ^9.9.9 不得命中"'] : []),
    'step "安装 dsh CLI(全局)"',
    `npm install -g @deepseek-ai/dsh@${dshPin}`,
    'ok "dsh 已安装"',
    'cat > "$DSH_HOME/profiles/web/package.json" <<EOF',
    '{',
    '  "name": "dsh-profile-web",',
    '  "dependencies": {',
    ...(sidebarSpec ? [`    "dsh-better-sidebar": "${sidebarSpec}",`] : []),
    '    "dsh-sidebar-leap": "^0.3.2"',
    '  }',
    '}',
    'EOF',
    '',
  ].join('\n')
}
// fixture 仓库: 插件六 pin 与 install.sh dsh 锁版同版(使 ①②③ 一致), ④ 焦点在 sidebar pin。
function mkRepo({ dshVer = PIN, sidebarSpec = '0.17.1', stray = false } = {}) {
  const root = mkTmp()
  const pkg = {
    name: 'pentest-dsh',
    version: '0.2.0',
    type: 'module',
    dependencies: Object.fromEntries(DSH_LIB_PKGS.map((n) => [`@deepseek-ai/${n}`, dshVer])),
  }
  writeFile(root, 'plugin/pentest-dsh/package.json', JSON.stringify(pkg, null, 2) + '\n')
  writeFile(root, 'install.sh', installShFixture({ dshPin: dshVer, sidebarSpec, stray }))
  return root
}
function runChecksOn(root, { global = { status: 'ok', version: PIN, source: 'fixture: dsh --version' }, ...over } = {}) {
  return runChecks({ rootDir: root, withManifest: false, globalProvider: async () => global, ...over })
}
const check4 = (r) => r.checks.find((c) => c.startsWith('④ sidebar 成对性'))

describe('T2-2b-0 检查④ sidebar 成对性(注入范式, 不读真实全局)', () => {
  it('(a) 宿主 0.1.1-rc.2 + pin 0.17.1 → 同区间 OK, 零 WARN, exit 0', async () => {
    const r = await runChecksOn(mkRepo({ dshVer: PIN, sidebarSpec: '0.17.1' }))
    assert.equal(r.exitCode, 0)
    assert.deepEqual(r.failures, [])
    assert.deepEqual(r.warnings, [])
    const line = check4(r)
    assert.ok(line, '④ 结果行存在')
    assert.ok(line.includes('✓') && line.includes('同区间'), line)
    assert.ok(line.includes('0.1.1-rc.2') && line.includes('0.17.1'), line)
  })

  it('(b) 宿主 0.2.0-rc.1 + pin 0.17.1 → 跨区间 WARN 触发且 exit 0(WARN 不阻断)', async () => {
    // 为隔离 ④ 的退出码贡献, fixture 三处 dsh 版本(插件 pin/install.sh/宿主)一致取 0.2.0-rc.1,
    // 使 ①②③ 全过, 仅 ④ 跨区间 WARN — 证明 WARN 不 exit 1。
    const r = await runChecksOn(
      mkRepo({ dshVer: '0.2.0-rc.1', sidebarSpec: '0.17.1' }),
      { global: { status: 'ok', version: '0.2.0-rc.1', source: 'fixture: dsh --version' } },
    )
    assert.equal(r.exitCode, 0)
    assert.deepEqual(r.failures, [])
    assert.equal(r.warnings.length, 1)
    assert.ok(r.warnings[0].includes('跨区间'), r.warnings[0])
    assert.ok(r.warnings[0].includes(WARN_TEXT), r.warnings[0])
    assert.ok(r.warnings[0].includes('0.2.0-rc.1') && r.warnings[0].includes('0.17.1'), r.warnings[0])
    assert.ok(SIDEBAR_COMPAT_TABLE.length === 4, '内置区间表与文档同源四行')
  })

  it('(c) --strict 下 ④ WARN 计失败(exit 1), failures 仍 0 — 走 WARN 通道照 manifest 段先例', async () => {
    const r = await runChecksOn(
      mkRepo({ dshVer: '0.2.0-rc.1', sidebarSpec: '0.17.1' }),
      { global: { status: 'ok', version: '0.2.0-rc.1', source: 'fixture: dsh --version' }, strict: true },
    )
    assert.equal(r.exitCode, 1)
    assert.deepEqual(r.failures, [])
    assert.ok(r.warnings.some((w) => w.includes('跨区间') && w.includes(WARN_TEXT)))
  })

  it('(d) 宿主版本缺失 → ④ SKIP 不计失败, 零 WARN, exit 0', async () => {
    const r = await runChecksOn(mkRepo(), { global: { status: 'missing' } })
    assert.equal(r.exitCode, 0)
    assert.deepEqual(r.failures, [])
    assert.deepEqual(r.warnings, [])
    const line = check4(r)
    assert.ok(line && line.includes('SKIP') && line.includes('宿主 DSH 版本未检出'), line)
  })

  it('(e) install.sh 无 sidebar pin(heredoc 缺依赖; heredoc 外提及不命中) → ④ SKIP', async () => {
    const r = await runChecksOn(mkRepo({ sidebarSpec: null, stray: true }))
    assert.equal(r.exitCode, 0)
    assert.deepEqual(r.failures, [])
    assert.deepEqual(r.warnings, [])
    const line = check4(r)
    assert.ok(line && line.includes('SKIP') && line.includes('无 dsh-better-sidebar pin'), line)
    assert.ok(!r.warnings.some((w) => w.includes('9.9.9')), 'heredoc 外提及不得进 ④ 判定')
  })

  it('锚 真实仓库(只读): install.sh heredoc sidebar pin 恰为 0.17.1(精确无范围符), 落在文档 0.17.1 行', () => {
    const pin = parseInstallSidebarPin(fs.readFileSync(path.join(REPO_ROOT, 'install.sh'), 'utf8'))
    assert.ok(pin, 'install.sh heredoc 内检出 sidebar pin')
    assert.equal(pin.spec, '0.17.1')
    assert.equal(findCompatRowBySidebarSpec(pin.spec), 0)
    assert.ok(!/^[~^]/.test(pin.spec), '精确 pin, 无 ^/~ 范围符')
  })
})

after(() => {
  for (const dir of _tmpdirs) fs.rmSync(dir, { recursive: true, force: true })
})

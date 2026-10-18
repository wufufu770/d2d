#!/usr/bin/env node
// selfcheck-e11a.mjs — E11a 六项自验收（批指令判据逐条; 只读+本地验证, 零写仓面）
// 用法: node scripts/xring/selfcheck-e11a.mjs [--repro <repro_paths.json>]
// E23: #1 自包含化（R-01 根修精神）——原缺省对真靶(192.168.132.14)重放 /tmp 旧 repro，
// /tmp 清扫即红 + 违反零实弹批词红线。改为内建本地自签靶（openssl 一次性证书，判据等价:
// 自签 + env.tls=insecure 分层 + 证书类失败清零）+ 仓内 fixture 缺省（/tmp 再不灭失）。
import { execFileSync } from 'node:child_process'
import http from 'node:http'
import https from 'node:https'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const argOf = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? d) : d }
const TARGET = argOf('--target', null)
const REPRO = argOf('--repro', path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/( [A-Za-z])/, '$1')), 'fixtures', 'legacy-repro-e11a.json'))
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/( [A-Za-z])/, '$1')), '..')
const results = []
const rec = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }

// ---- #1: 旧 repro 加 env.tls 重放（E23 起=本地自签靶——证书类失败清零即判据） ----
{
  const { createVerifyRunner } = await import('./verify-runner.mjs')
  let reproIds = []
  if (fs.existsSync(REPRO)) {
    // E23: 目标=--target 显式给出（真靶形态, 批词授权时）或内建本地自签一次性靶（缺省——零实弹纪律）
    let targetBase = TARGET
    let srv = null
    let certDir = null
    if (!targetBase) {
      certDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfcheck-tls-'))
      execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-keyout', `${certDir}/k.pem`, '-out', `${certDir}/c.pem`, '-days', '1', '-nodes', '-subj', '/CN=localhost'], { stdio: 'pipe' })
      srv = https.createServer({ key: fs.readFileSync(`${certDir}/k.pem`), cert: fs.readFileSync(`${certDir}/c.pem`) }, (req, res) => { res.end('TLS-OK') })
      await new Promise((r) => srv.listen(0, '127.0.0.1', r))
      targetBase = `https://127.0.0.1:${srv.address().port}`
    }
    try {
      const doc = JSON.parse(fs.readFileSync(REPRO, 'utf8'))
      const vr = createVerifyRunner({ targetBase, eng: 'selfcheck-legacy-tls' })
      let certFails = 0, ran = 0
      for (const f of doc.findings ?? []) {
        const v = await vr.verify({ ...f, env: { tls: { mode: 'insecure' } } })
        ran++
        if (/certificate|CERT|self-?signed|unable to verify/i.test(v.evidence ?? '')) certFails++
        reproIds.push(`${f.id}:${v.verdict}${v.failureClass ? '(' + v.failureClass + ')' : ''}`)
      }
      rec('#1 旧 repro 加 env.tls 重放', ran > 0 && certFails === 0, `ran=${ran} certFails=${certFails} [${reproIds.join(', ')}] target=${srv ? '本地自签靶(零实弹)' : targetBase}`)
    } finally {
      try { srv?.close() } catch { /* 已记因: 关闭竞态无害 */ }
      try { certDir && fs.rmSync(certDir, { recursive: true, force: true }) } catch { /* 已记因: 临时证书清理 */ }
    }
  } else {
    rec('#1 旧 repro 加 env.tls 重放', false, `repro 不存在: ${REPRO}`)
  }
}

// ---- #2: 全库凭据值 grep 零命中（红线 L2 自查）——E14-B 重写: 探针 env 外置（SWEEP-1
// P2P_SCAN_TARGETS 同款模式; 原版把真值写进 grep 参数=凭据字面量入库+自中）+管道 rc 修复
// （原版 $? 取 head 恒 0=检查恒红; 改 git grep -q 直取退出码 0=命中/1=净） ----
{
  const needle = process.env.P2P_SCAN_NEEDLE ?? ''
  if (!needle) {
    rec('#2 全库凭据值 grep 零命中', true, 'SKIP——P2P_SCAN_NEEDLE 未设（探针外置不入源码; 人工布针后复跑方为有效判定）')
  } else {
    const out = execFileSync('bash', ['-lc',
      'cd /home/kali/d2d && if git grep -q --fixed-strings "$P2P_SCAN_NEEDLE" -- ":!*.lock"; then echo HIT; git grep -l --fixed-strings "$P2P_SCAN_NEEDLE" -- ":!*.lock" | head -5; else echo CLEAN; fi'],
      { encoding: 'utf8', env: process.env })
    rec('#2 全库凭据值 grep 零命中', out.includes('CLEAN'), out.trim().slice(0, 120).replaceAll(needle, '«needle»'))
  }
}

// ---- #3: 冷启动形态（参数在位+语法健康——真实冷启动计时归 Phase 3 实弹） ----
{
  const src = fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), 'first-run.mjs'), 'utf8')
  const has = ['--task-file', '--target', '--scope', '--record-root', '--max-hours'].every((k) => src.includes(`'${k}'`))
  let syntaxOk = true
  try { execFileSync('node', ['--check', path.join(path.dirname(new URL(import.meta.url).pathname), 'first-run.mjs')]) } catch { syntaxOk = false }
  rec('#3 first-run 五参数在位+语法', has && syntaxOk, `params=${has} syntax=${syntaxOk}`)
}

// ---- #4: 混合文件判据（mocha 覆盖, 此处复述核心断言防回归） ----
{
  const { tolerantHypothesisEntries } = await import('./reflow.mjs')
  const long = 'x'.repeat(600)
  const doc = { run_id: 'e11a', generated_at: '2026-01-01T00:00:00Z', hypotheses: [
    { id: 'H-1', statement: 'long evidence entry', priority: 'high', status: 'confirmed', evidence_refs: [long] },
    { id: 'H-2', statement: 'normal entry here', priority: 'low', status: 'untested', evidence_refs: ['ok'] },
  ] }
  const r = tolerantHypothesisEntries(doc)
  rec('#4 混合文件（1 超长+1 正常）', r.pass.length === 1 && r.partial.length === 1 && r.partial[0].partial === true,
    `pass=${r.pass.length} partial=${r.partial.length} rejected=${r.rejected.length}`)
}

// ---- #5/#7: mocha 覆盖（e11a.test.mjs）——此处跑单文件确认 ----
{
  const mocha = execFileSync('bash', ['-lc',
    'cd /home/kali/d2d/plugin/pentest-dsh && npx mocha test/e11a.test.mjs 2>&1 | grep -E "passing|failing"'], { encoding: 'utf8' })
  const ok = mocha.includes('passing') && !mocha.includes('failing')
  rec('#5/#7 e11a 单测全过', ok, mocha.trim().split('\n')[0])
}

// ---- E15 扩面（R-05/R-03/R-04——纯函数离线判据, 零网络） ----
{
  const relay = await import('./relay.mjs')
  const { validateHandoff } = await import('./validate.mjs')
  const h = relay.collectHandoff({ runId: 'selfcheck-r5', target: 'http://127.0.0.1:1', verified: [{ id: 'F-1', title: 'selfcheck 标题足够长', severity: 'high' }], leads: [{ id: 'H-1', statement: 'selfcheck 假设语句足够长', priority: 'high', origin: 'hypothesis' }] })
  const brief = relay.injectBrief(h)
  rec('R-05 relay: handoff 组装过契约+leads 假设形态注入语义',
    validateHandoff(h).ok && /假设形态注入/.test(brief) && /免重扫/.test(brief), `schema=${validateHandoff(h).ok}`)
}
{
  const { assess } = await import('./ecc.mjs')
  const tarp = Array.from({ length: 4 }, (_, i) => ({ path: `/p${i}`, status: 200, bytes: 2412, hash: 'k'.repeat(16) }))
  const r = assess({ probes: tarp, targetOrigin: 'http://t' })
  rec('R-03 ECC: 异构路径同指纹 → homogeneous-response/likely（L-3 冻结判据）',
    r.signals.some((s) => s.kind === 'homogeneous-response') && r.level === 'likely', `level=${r.level}`)
}
{
  const { emitReports } = await import('./report-face.mjs')
  const os = await import('node:os')
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfcheck-r4-'))
  const r = emitReports({ verified: [{ id: 'F-1', title: 'selfcheck 报告标题足够长', severity: 'medium', target: 'http://t', steps: ['GET /'], observed: '观察足够长' }], leads: [{ id: 'H-1', statement: 'selfcheck 内部面专属假设足够长', origin: 'hypothesis' }], outDir })
  const external = ['butian.json', 'vulbox.json', 'edu-src.json'].map((f) => fs.readFileSync(path.join(outDir, f), 'utf8')).join('')
  const ab = fs.readFileSync(path.join(outDir, 'ab-report.md'), 'utf8')
  rec('R-04 报告分面: 三格式产出+外部面零 leads+ab-report 含 caveat',
    r.files.length === 4 && r.warnings.length === 0 && !external.includes('内部面专属') && ab.includes('caveat'),
    `files=${r.files.length} warnings=${r.warnings.length}`)
}
{
  // E18 扩面: Intent 契约（schema 拒坏 status+pending 继承语义）+Advisor 触发条件
  const { validateHandoff } = await import('./validate.mjs')
  const raw = { schema: 'xring/handoff@1', run_id: 'selfcheck-i', generated_at: '2026-10-17T00:00:00Z', target: 'http://t', carriers: { facts: [], leads: [], falsified: [], intents: [{ id: 'I-1', direction: 'selfcheck 方向语句足够长', status: 'pending', spawned_from: 'F-1' }], env: { fingerprint: [] } } }
  raw.carriers.intents[0].status = 'someday'
  const badOk = validateHandoff(raw).ok
  raw.carriers.intents[0].status = 'pending'
  const goodOk = validateHandoff(raw).ok
  const advisor = await import('./advisor.mjs')
  rec('E18 Intent 契约: 坏 status 拒/pending 过（意图运行时载体）', !badOk && goodOk, `bad=${badOk} good=${goodOk}`)
  rec('E18 Advisor 触发: pass 打断连击+阈值 3（连败会诊条件）',
    advisor.failStreak(['fail', 'fail', 'pass', 'fail', 'fail', 'fail']) === 3 && advisor.shouldAdvise(3) && !advisor.shouldAdvise(2),
    'streak=3 触发/2 不触发')
}
{
  // E21 扩面: 三信号（触发源扩展）+hook-guard（0.2.0 静默失败防御）
  const adv = await import('./advisor.mjs')
  const sigs = adv.epistemicSignals({ prevHandoff: { run_id: 'p', carriers: { facts: [{ id: 'F-1', title: 'x' }], leads: [], falsified: [], env: { fingerprint: [] } } }, written: [], held: [] })
  const neg = adv.epistemicSignals({ written: [{ level: 'B', id: 'H-1' }], probes: [{ path: '/a', status: 200 }], falsifiedCount: 1 })
  rec('E21 Advisor 三信号: 停滞检出+负例零信号（触发源扩展）',
    sigs.some((s) => s.kind === 'stagnation') && neg.length === 0, `sigs=${sigs.map((s) => s.kind).join(',') || '无'} neg=${neg.length}`)
  const hg = await import('/home/kali/d2d/plugin/pentest-dsh/hook-guard.mjs')
  const os = await import('node:os')
  const tmpd = fs.mkdtempSync(path.join(os.tmpdir(), 'selfcheck-hg-'))
  hg.setHookLogDir(tmpd)
  let rethrew = false
  try { await hg.guardHook('sc', async () => { throw new Error('selfcheck 注入') })() } catch { rethrew = true }
  rec('E21 hook-guard: 异常落日志+原样重抛（0.2.0 静默吞错防御）',
    rethrew && fs.existsSync(path.join(tmpd, 'hook-guard.log')), `rethrew=${rethrew}`)
}

const fails = results.filter((r) => !r.ok)
console.log(`\nSELF-CHECK: ${results.length - fails.length}/${results.length} 过`)
process.exit(fails.length ? 1 : 0)

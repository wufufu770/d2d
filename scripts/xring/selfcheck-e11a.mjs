#!/usr/bin/env node
// selfcheck-e11a.mjs — E11a 六项自验收（批指令判据逐条; 只读+本地验证, 零写仓面）
// 用法: node scripts/xring/selfcheck-e11a.mjs [--target https://192.168.132.14] [--repro <r2b repro_paths.json>]
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const argOf = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? d) : d }
const TARGET = argOf('--target', 'https://192.168.132.14')
const REPRO = argOf('--repro', '/tmp/r2b-smoke/record/xring-first/run-r2b-10150911/workspace/repro_paths.json')
const REPO = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/( [A-Za-z])/, '$1')), '..')
const results = []
const rec = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ' — ' + detail : ''}`) }

// ---- #1: 旧 repro 加 env.tls 重放（对真实自签靶场——证书类失败清零即判据） ----
{
  const { createVerifyRunner } = await import('./verify-runner.mjs')
  let reproIds = []
  if (fs.existsSync(REPRO)) {
    const doc = JSON.parse(fs.readFileSync(REPRO, 'utf8'))
    const vr = createVerifyRunner({ targetBase: TARGET, eng: 'xring-run-r2b-10150911' })
    let certFails = 0, ran = 0
    for (const f of doc.findings ?? []) {
      const v = await vr.verify({ ...f, env: { tls: { mode: 'insecure' } } })
      ran++
      if (/certificate|CERT|self-?signed|unable to verify/i.test(v.evidence ?? '')) certFails++
      reproIds.push(`${f.id}:${v.verdict}${v.failureClass ? '(' + v.failureClass + ')' : ''}`)
    }
    rec('#1 旧 repro 加 env.tls 重放', ran > 0 && certFails === 0, `ran=${ran} certFails=${certFails} [${reproIds.join(', ')}]`)
  } else {
    rec('#1 旧 repro 加 env.tls 重放', false, `repro 不存在: ${REPRO}`)
  }
}

// ---- #2: 全库凭据值 grep 零命中（红线 L-2 自查） ----
{
  const out = execFileSync('bash', ['-lc',
    `cd /home/kali/d2d && git grep -l "Admin@123456" -- ':!*.lock' 2>/dev/null | head -5; echo "---grep-rc=$?"`]).toString()
  const hit = out.includes('.mjs') || out.includes('.py') || out.includes('.md') || /grep-rc=0/.test(out) && !out.includes('---')
  // git grep 无命中时 rc=1, 输出仅 "---grep-rc=1"
  rec('#2 全库凭据值 grep 零命中', out.includes('grep-rc=1'), out.trim().slice(0, 120))
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

const fails = results.filter((r) => !r.ok)
console.log(`\nSELF-CHECK: ${results.length - fails.length}/${results.length} 过`)
process.exit(fails.length ? 1 : 0)

#!/usr/bin/env node
// scripts/wf/assemble.mjs — WF-1 层 1 组装器：模板 fragments + 批参数 → 落库/推送 .dwf.ts。
// 设计：docs/wf-incident-catalog.md §二；生成脚本=world.run-only（catalog F）+ manifest 四道闸
// 全序焊死（D2/D3）+ 推送快探针/分类/退避（C）+ 终态分类核验（E）+ agent 失败钩子（层 3）。
// 用法：
//   node scripts/wf/assemble.mjs --kind landing-push|landing|push --batch "标签" \
//     [--repo /home/kali/d2d] [--base <sha>] --families '<[{subject,body,paths}]>' \
//     [--forbidden "绝不碰清单文本"] [--hook-mode agent|evidence-only] \
//     [--max-push-rounds 10] [--max-terminal-attempts 5] --out <file.dwf.ts>
import fs from 'node:fs'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const TPL = path.join(path.dirname(fileURLToPath(import.meta.url)), 'templates')

function parseArgs(argv) {
  const a = {}
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`意外参数: ${argv[i]}`)
    const key = argv[i].slice(2)
    a[key] = argv[i + 1]
    i++
  }
  return a
}

const stripLib = (src) => src.replace(/^export /gm, '')

// lib 内联的 TS 签名 transform（精确锚点；.mjs 源保持纯 JS 供单测，内联进 strict-TS 工作流需显式类型）
// 锚点失配=lib 与组装器漂移 → fail-closed
const LIB_TS_TRANSFORMS = [
  {
    file: 'probe-classify.mjs',
    subs: [
      ['export function classifyProbeFailure(probe, ctx = {})',
        'function classifyProbeFailure(probe: { exitCode?: number; stdout?: string; stderr?: string } | null = null, ctx: { expectedSha?: string | null } = {})'],
      ['export function extractRemoteSha(stdout)',
        'function extractRemoteSha(stdout?: string)'],
      ['export function backoffMs(round, baseMs = 25_000, maxMs = 120_000)',
        'function backoffMs(round: number, baseMs = 25_000, maxMs = 120_000): number'],
    ],
  },
  {
    file: 'evidence.mjs',
    subs: [
      ['export function buildEvidencePack(failure, live = {})',
        'function buildEvidencePack(failure: any, live: any = {}): Record<string, unknown>'],
      ['const clip = (s, n) => String(s ?? \'\').slice(0, n)',
        'const clip = (s: any, n: number) => String(s ?? \'\').slice(0, n)'],
      ['failure.args.map((a) => clip(a, 300))',
        'failure.args.map((a: any) => clip(a, 300))'],
    ],
  },
]

function inlineLib(name) {
  let src = fs.readFileSync(path.join(ROOT, 'scripts/wf/lib', name), 'utf8')
  const t = LIB_TS_TRANSFORMS.find((x) => x.file === name)
  if (!t) throw new Error(`lib ${name} 无 TS transform 登记（组装器漂移，fail-closed）`)
  for (const [from, to] of t.subs) {
    if (!src.includes(from)) throw new Error(`lib ${name} 签名锚点失配: ${from}（fail-closed）`)
    src = src.replace(from, to)
  }
  return stripLib(src)
}

function main() {
  const a = parseArgs(process.argv)
  const kind = a.kind ?? 'landing-push'
  if (!['landing-push', 'landing', 'push'].includes(kind)) throw new Error(`--kind 非法: ${kind}`)
  const batch = a.batch ?? ''
  if (!batch) throw new Error('--batch 必填（工作流标签）')
  const repo = a.repo ?? ROOT // 缺省=组装器自身所在仓根（AGENTS 14：环境路径不得硬编码——CI 检出非本机路径）
  const baseSha = a.base ?? ''
  if (kind !== 'push' && !/^[0-9a-f]{40}$/.test(baseSha)) throw new Error('--base 必填且须为 40 位 sha（landing 类）')
  if (baseSha) {
    const chk = spawnSync('git', ['-C', repo, 'cat-file', '-e', `${baseSha}^{commit}`], { stdio: 'ignore' })
    if (chk.status !== 0) throw new Error(`--base 非有效 commit 对象: ${baseSha}（防手打截断 SHA 误扩展）`)
  }
  const hookMode = a['hook-mode'] ?? 'agent'
  if (!['agent', 'evidence-only'].includes(hookMode)) throw new Error(`--hook-mode 非法: ${hookMode}`)
  const fold = a['fold-manifest'] === 'false' ? false : true
  const maxPushRounds = String(a['max-push-rounds'] ?? '10')
  const maxTerminalAttempts = String(a['max-terminal-attempts'] ?? '5')
  const gateMode = a.gate === 'none' ? 'none' : 'file'
  let gateFile = a['gate-file'] ?? ''
  if (kind !== 'landing' && gateMode === 'file') {
    if (!gateFile) throw new Error('--gate-file 必填（push 类 gate 相 fail-closed 缺省；legacy 逃生口=--gate none 并登记豁免理由）')
    if (!/^[A-Za-z0-9_./-]+$/.test(gateFile)) throw new Error(`--gate-file 路径含非白名单字符: ${gateFile}`)
  }
  const gateExpect = (a['gate-expect'] ?? 'GATE: PASS').replace(/"/g, '“')
  const gateMaxPolls = String(a['gate-max-polls'] ?? '60')
  const forbidden = (a.forbidden ?? 'scheduler 核心/graphd 生产代码/生产库/scripts/browser//sanitize-ingest 链/xring 面板面').replace(/"/g, '“')
  let families = []
  if (kind !== 'push') {
    families = JSON.parse(a.families ?? '[]')
    if (!families.length) throw new Error('landing 类 --families 必填（非空数组）')
    for (const [i, f] of families.entries()) {
      if (!f.subject || !f.body || !Array.isArray(f.paths) || !f.paths.length) throw new Error(`families[${i}] 缺 subject/body/paths`)
      for (const p of f.paths) {
        if (p.includes('..') || path.isAbsolute(p)) throw new Error(`families[${i}] 路径越界: ${p}`)
        if (!fs.existsSync(path.join(repo, p))) throw new Error(`families[${i}] 路径不存在于工作树: ${p}`)
      }
    }
  }

  const read = (n) => fs.readFileSync(path.join(TPL, n), 'utf8')
  const parts = [read('header.frag'), read('hook.frag'), read('regen.frag')]
  if (kind !== 'push') parts.push(read('preflight.frag'), read('families.frag'))
  parts.push(read('newsha.frag'))
  if (kind !== 'landing') {
    if (gateMode === 'file') parts.push(read('gate.frag'))
    parts.push(read('push.frag'))
  }
  parts.push(read('report.frag'))

  const foldLabel = fold ? 'fold manifest，每笔树-清单自洽' : '独立 manifest 笔'
  const reportTail = kind === 'landing' ? '落库完成（未推送——推送相由后续工作流执行）' : '远端 origin/main 一致，工作树净'
  let out = parts.join('\n')
  const subs = [
    [/__BATCH__/g, batch],
    [/__REPO__/g, repo],
    [/__BASE_SHA__/g, baseSha],
    [/__FORBIDDEN__/g, forbidden],
    [/__HOOK_MODE__/g, hookMode],
    [/__FAMILIES_JSON__/g, JSON.stringify(families, null, 2).split('\n').join('\n')],
    [/__FOLD_MANIFEST__/g, String(fold)],
    [/__FOLD_LABEL__/g, foldLabel],
    [/__MAX_PUSH_ROUNDS__/g, maxPushRounds],
    [/__MAX_TERMINAL_ATTEMPTS__/g, maxTerminalAttempts],
    [/__PROD_DIFF_PATHS__/g, JSON.stringify((a['prod-paths'] ?? 'plugin/pentest-dsh/scheduler/,plugin/pentest-dsh/scheduler.js,plugin/pentest-dsh/domain/,graphd/,plugin/d2d-panel/').split(','))],
    [/__REPORT_TAIL__/g, reportTail],
    [/__GATE_FILE__/g, gateFile],
    [/__GATE_EXPECT__/g, gateExpect],
    [/__GATE_MAX_POLLS__/g, gateMaxPolls],
  ]
  for (const [re, v] of subs) out = out.replace(re, v)
  out = out.replace('/*__LIB_PROBE__*/', inlineLib('probe-classify.mjs'))
  out = out.replace('/*__LIB_EVIDENCE__*/', inlineLib('evidence.mjs'))

  const leftover = out.match(/__LIB_[A-Z_]+__|\/\*__[A-Z_]+__\*\//g) ?? []
  const markerLeft = out.match(/__[A-Z][A-Z0-9_]{2,}__/g) ?? []
  if (gateMode === 'file' && kind !== 'landing') {
    const cleaned = markerLeft.filter((m) => m !== '__GATE_MISSING__')
    if (cleaned.length !== markerLeft.length) { markerLeft.length = 0; markerLeft.push(...cleaned) }
  }
  if (leftover.length || markerLeft.length) throw new Error(`残留标记未替换: ${[...new Set([...leftover, ...markerLeft])].join(', ')}`)

  const outPath = path.resolve(a.out ?? path.join(ROOT, '.zcode/workflow-drafts', `wf-${kind}.dwf.ts`))
  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  fs.writeFileSync(outPath, out)
  const lines = out.split('\n').length
  const gateNote = kind !== 'landing' ? (gateMode === 'file' ? `gate=${gateFile}` : 'gate=NONE(legacy 逃生口——登记豁免)') : 'no-push'
  console.log(`assembled: ${outPath} (${lines} lines, kind=${kind}, families=${families.length}, fold=${fold}, hook=${hookMode}, ${gateNote})`)
  if (gateMode === 'none' && kind !== 'landing') console.warn('⚠ gate=none：legacy 逃生口使用须登记豁免理由（SC-1 拍板 1 fail-closed 缺省）')
}

main()

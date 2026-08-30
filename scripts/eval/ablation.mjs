#!/usr/bin/env node
// ablation.mjs — B-1/E-1 消融实验框架: 「经验复利」归因去混杂(单点战绩混合了经验/建模/OAST 多变量)
// 用法: node scripts/eval/ablation.mjs --profile dvwa [--runs 3] [--configs full,no-experience,no-profile,bare-v0]
//             [--base-port 8790] [--timeout 2400] [--exp-id <id>] [--dry-run] [--force]
// 四配置(每配置独立沙盒: workspace/图实例/DATA_DIR/brain 快照):
//   full          现役 brain 快照 + profile_suggest 预建模(用 control 图历史 findings)
//   no-experience 空 brain(无知识卡) + 无建模
//   no-profile    现役 brain 快照, 无建模
//   bare-v0       仅出厂 v0 基线(冷启动), 无建模
// 产出: ~/.d2d-data/experiments/<exp-id>/{manifest.json, summary.md, raw/<config>-<run>.json}
// 纪律(docs/ITERATION.md): 未跑消融的归因一律标「假设」; n=3 用中位数+符号检验并标注无统计力。
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = process.env.D2D ?? `${os.homedir()}/d2d`
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const flag = (k) => process.argv.includes(`--${k}`)
const sha = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16)

const PROFILE_NAME = arg('profile', 'dvwa')
const RUNS = Number(arg('runs', '3'))
const CONFIGS = String(arg('configs', 'full,no-experience,no-profile,bare-v0')).split(',')
const BASE_PORT = Number(arg('base-port', '8790'))
const TIMEOUT_MS = Number(arg('timeout', '2400')) * 1000
const EXP_ID = arg('exp-id') ?? `abl-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`
const DRY = flag('dry-run')

const baseProfPath = [`/home/wff/ranges/profiles/${PROFILE_NAME}.json`, `${REPO}/profiles/${PROFILE_NAME}.json`].find(fs.existsSync)
if (!baseProfPath) { console.error(`profile 不存在: ${PROFILE_NAME}`); process.exit(1) }
const baseProf = JSON.parse(fs.readFileSync(baseProfPath, 'utf8'))
const EXP = `${DATA_DIR}/experiments/${EXP_ID}`
const hostToken = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()

const gq = (port, cypher) => JSON.parse(execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
  `http://127.0.0.1:${port}/query`, '-H', 'Content-Type: application/json', '-H', `X-Auth: ${hostToken}`,
  '-d', JSON.stringify({ cypher })], { encoding: 'utf8' })).rows ?? []

// 防资源互踩: 生产车道在飞时拒绝(除非 --force); pgrep 无匹配(退出码 1)=clear, 不是错误
if (!DRY && !flag('force')) {
  let out = ''
  try { out = execFileSync('pgrep', ['-af', 'round-launch.mjs'], { encoding: 'utf8' }).trim() } catch { out = '' }
  if (out) { console.error(`生产车道在飞, 拒绝启动消融(消融 run 会争抢 CPU/代理):\n${out}\n加 --force 越过`); process.exit(1) }
}

// brain 快照: full/no-profile 复制现役; bare-v0 只装出厂基线; no-experience 空
function snapshotBrain(kind, dir) {
  fs.mkdirSync(dir, { recursive: true })
  if (kind === 'no-experience') return { cards: 0, note: 'empty brain' }
  if (kind === 'bare-v0') {
    fs.mkdirSync(`${dir}/versions/v0`, { recursive: true })
    fs.copyFileSync(`${REPO}/brain/seed/v0-techniques.json`, `${dir}/versions/v0/techniques.json`)
    fs.symlinkSync(`${dir}/versions/v0`, `${dir}/current`)
    return { cards: JSON.parse(fs.readFileSync(`${dir}/current/techniques.json`, 'utf8')).cards.length, note: 'factory v0 only' }
  }
  fs.cpSync(`${DATA_DIR}/brain`, dir, { recursive: true, dereference: true })
  const cards = (() => { try { return JSON.parse(fs.readFileSync(`${dir}/current/techniques.json`, 'utf8')).cards.length } catch { return 0 } })()
  return { cards, note: 'snapshot of live brain' }
}

// profile 建模变量: 用 control 图的历史 findings 对沙盒 profile 副本做 suggest --apply(生产稳态近似;
// 局限记录在 manifest.modeling_note: 建模贡献取的是「历史靶次已学到」的部分, 不含本轮即时学习)
function prepareProfile(kind, sandboxProf) {
  fs.copyFileSync(baseProfPath, sandboxProf)
  if (kind === 'no-profile' || kind === 'bare-v0') return { applied: false }
  try {
    execFileSync('python3', [`${REPO}/scripts/eval/profile_suggest.py`, '8766', sandboxProf, '--apply'],
      { env: { ...process.env, P2P_HOST_TOKEN: hostToken }, timeout: 90_000, stdio: 'pipe' })
    return { applied: true }
  } catch { return { applied: false, error: 'profile_suggest failed' } }
}

// 经验先验变量: full/no-profile 把 control 图的 ExperienceWeight 复刻进沙盒(= 生产 sync 合流后的稳态)
// R4c 验证轮: gq 在 control 忙时会静默空(rows ?? []) — 空种子会毁掉消融效度, 必须 fail-loud
function seedExperience(kind, port) {
  if (kind === 'no-experience' || kind === 'bare-v0') return { seeded: 0, note: 'config 无经验(设计如此)' }
  const rows = gq(8766, `MATCH (e:ExperienceWeight) RETURN e.id AS id, e.pattern AS pattern, e.stack AS stack, e.prior AS prior, e.hits AS hits, e.wins AS wins, e.target_type AS target_type, e.recipe AS recipe, e.stack_fp AS stack_fp, e.payload_hint AS payload_hint LIMIT 500`)
  if (!rows.length) return { seeded: 0, note: '⚠ control 图无经验行可播(消融 full/no-profile 配置失效!)' }
  const esc = (v) => String(v ?? '').replace(/'/g, "''").replace(/\\/g, '\\\\')
  let n = 0
  for (const r of rows) {
    try {
      execFileSync('curl', ['-s', '-m', '8', '-X', 'POST', `http://127.0.0.1:${port}/query`, '-H', 'Content-Type: application/json',
        '-H', `X-Auth: ${hostToken}`, '-d', JSON.stringify({ cypher:
          `CREATE (e:ExperienceWeight {id:'${esc(r.id)}', pattern:'${esc(r.pattern)}', stack:'${esc(r.stack)}', prior:${Number(r.prior) || 1}, hits:${Number(r.hits) || 0}, wins:${Number(r.wins) || 0}, target_type:'${esc(r.target_type || 'web')}', recipe:'${esc(r.recipe)}', stack_fp:'${esc(r.stack_fp)}', payload_hint:'${esc(r.payload_hint)}'})` })],
        { encoding: 'utf8' })
      n++
    } catch {}
  }
  return { seeded: n, note: n ? '' : '⚠ seed 全部失败' }
}

function seedsInject(port) {
  const seedsPath = baseProfPath.replace(/\.json$/, '.seeds.json')
  if (!fs.existsSync(seedsPath)) return 0
  const seeds = JSON.parse(fs.readFileSync(seedsPath, 'utf8'))
  let n = 0
  for (const s of seeds) {
    try {
      execFileSync('curl', ['-s', '-m', '8', '-X', 'POST', `http://127.0.0.1:${port}/write/hypothesis`, '-H', 'Content-Type: application/json',
        '-H', `X-Auth: ${hostToken}`, '-d', JSON.stringify({ ...s, id: `seed-${crypto.randomBytes(3).toString('hex')}` })], { encoding: 'utf8' })
      n++
    } catch {}
  }
  return n
}

async function runOne(kind, runIdx, port) {
  const work = `${EXP}/work/${kind}-${runIdx}`
  const data = `${EXP}/data/${kind}-${runIdx}`
  fs.rmSync(work, { recursive: true, force: true })
  fs.rmSync(data, { recursive: true, force: true })
  fs.mkdirSync(`${work}`, { recursive: true })
  fs.mkdirSync(`${data}`, { recursive: true })
  fs.cpSync(`${REPO}/plugin`, `${work}/plugin`, { recursive: true })
  fs.cpSync(`${REPO}/graphd`, `${work}/graphd`, { recursive: true })
  fs.cpSync(`${REPO}/scripts/launch/round-launch.mjs`, `${work}/round-launch.mjs`)
  // 沙盒图必须全新: 剔除宿主 kuzu_db/wal(R4b 修正, 与 cybench-adapter 同)
  for (const f of ['kuzu_db', 'kuzu_db.wal', 'graphd.log']) { try { fs.rmSync(`${work}/graphd/${f}`, { force: true }) } catch {} }

  const brainDir = `${EXP}/brain/${kind}`
  if (runIdx === 1 || !fs.existsSync(brainDir)) snapshotBrain(kind, brainDir) // 同配置多 run 共用开局快照
  const sandboxProf = `${EXP}/raw/profile-${kind}.json`
  if (runIdx === 1) fs.writeFileSync(`${EXP}/raw/note-${kind}.json`, JSON.stringify(prepareProfile(kind, sandboxProf)))
  else if (!fs.existsSync(sandboxProf)) fs.copyFileSync(baseProfPath, sandboxProf)

  const t0 = Date.now()
  const gd = spawn('python3', ['graphd/app.py'], { cwd: work, env: { ...process.env, P2P_GRAPH_PORT: String(port) }, stdio: 'ignore' })
  let gdUp = false
  for (let i = 0; i < 30; i++) { // 健康轮询(≤15s): 固定 2.5s 等待曾误判未起
    await new Promise((r) => setTimeout(r, 500))
    try { if ((await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(800) })).ok) { gdUp = true; break } } catch {}
  }
  if (!gdUp) { gd.kill(); return { kind, run: runIdx, exit: null, wallclock_s: 0, experience_seeded: 0, seeds: 0, models_used: [], eval: { error: '沙盒 graphd 未起' } } }
  const expSeeded = seedExperience(kind, port)
  const seeds = seedsInject(port)
  const env = {
    ...process.env,
    P2P_OPEN_RANGE: '0', P2P_OPEN_RECON: '1',
    P2P_GRAPHD: `http://127.0.0.1:${port}`,
    P2P_HOST_TOKEN_FILE: `${os.homedir()}/.config/d2d/host-token`,
    D2D_ROOT: work, D2D_DATA_DIR: data, P2P_BRAIN_DIR: brainDir,
    R_TARGET: baseProf.url, R_SCOPE: baseProf.scope, R_INST: '2',
    http_proxy: 'http://127.0.0.1:8888', https_proxy: 'http://127.0.0.1:8888', NO_PROXY: '127.0.0.1,localhost',
    P2P_PROXY_URL: 'http://127.0.0.1:8888',
    P2P_GAP_HINTS: '', // 控制变量: 消融轮不带上一轮缺口提示
    // P2P_OAST_HOST 刻意不设: OAST 命中跨 run 归因混流, 首版消融剔除该变量(记 manifest)
  }
  console.log(`[${kind} #${runIdx}] run 启动(port=${port}, brain=${brainDir})`)
  const code = await new Promise((resolve) => {
    const p = spawn('node', ['round-launch.mjs', 'dsh'], { cwd: work, env, stdio: ['ignore', 'pipe', 'pipe'] })
    let buf = ''
    p.stdout.on('data', (d) => { buf += d })
    p.stderr.on('data', (d) => { buf += d })
    const timer = setTimeout(() => { console.error(`[${kind} #${runIdx}] 超时, 终止`); p.kill('SIGKILL') }, TIMEOUT_MS)
    p.on('close', (c) => { clearTimeout(timer); fs.writeFileSync(`${EXP}/raw/log-${kind}-${runIdx}.txt`, buf.slice(-20_000)); resolve(c) })
  })
  const wallclock = Math.round((Date.now() - t0) / 1000)
  // R4c 验证轮: ①engagement 收尾有写锁, 等 6s 再评 ②eval 失败/空重试 ×3(同 cybench 判定器教训: 失败≠真空)
  await new Promise((r) => setTimeout(r, 6000))
  let evalRes = {}
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = execFileSync('python3', [`${REPO}/scripts/eval/eval_profile.py`, String(port), baseProfPath], { encoding: 'utf8' })
      evalRes = JSON.parse(out)
      if (evalRes && evalRes.PASS !== undefined) break
    } catch (e) { evalRes = { error: String(e.message).slice(0, 200) } }
    await new Promise((r) => setTimeout(r, 5000))
  }
  const models = (() => { try { return fs.readFileSync(`${data}/runs/model-usage.jsonl`, 'utf8').trim().split('\n').map((l) => JSON.parse(l)) } catch { return [] } })()
  gd.kill()
  fs.rmSync(work, { recursive: true, force: true }) // 释放磁盘, 证据在 raw/ 与 data/
  return { kind, run: runIdx, exit: code, wallclock_s: wallclock, experience_seeded: expSeeded.seeded, seed_note: expSeeded.note, seeds, models_used: [...new Set(models.map((m) => m.model))], eval: evalRes }
}

function signTest(pairs) {
  // n=3 非参数符号检验(双侧): full 与消融配置的逐 run coverage 对比; 样本不足 → 标注无统计力
  const diff = pairs.filter((p) => p.a !== p.b)
  const plus = diff.filter((p) => p.a > p.b).length
  const pValue = diff.length === 0 ? 1 : Math.min(1, 2 * Math.min(plus, diff.length - plus) / 2 ** diff.length)
  return { n: pairs.length, plus, minus: diff.length - plus, p_value: Number(pValue.toFixed(3)), significant: pValue < 0.05, note: 'n=3 无统计力, 仅作方向性参考' }
}

const manifest = {
  exp_id: EXP_ID, created_at: new Date().toISOString(),
  target: PROFILE_NAME, base_profile: { path: baseProfPath, sha256_16: sha(baseProfPath), url: baseProf.url },
  configs: CONFIGS, runs: RUNS, timeout_s: TIMEOUT_MS / 1000,
  model_policies: (() => { const p = `${DATA_DIR}/config/model-policies.json`; return fs.existsSync(p) ? { sha256_16: sha(p), snapshot: JSON.parse(fs.readFileSync(p, 'utf8')) } : null })(),
  temperature_seed: 'uncontrolled(dsh headless 未暴露)', oast: 'excluded(首版消融)',
  gap_hints: 'empty(控制变量)', proxy: '127.0.0.1:8888',
  modeling_note: 'profile_suggest 预建模取 control 图历史 findings(生产稳态近似), 不含本轮即时学习',
  runs: [],
}

if (DRY) {
  manifest.dry_run = true
  manifest.plan = CONFIGS.flatMap((k) => Array.from({ length: RUNS }, (_, i) => ({ kind: k, run: i + 1, port: BASE_PORT })))
  for (const k of CONFIGS) { const b = `${EXP}/brain/${k}`; snapshotBrain(k, b); manifest[`brain_${k}`] = snapshotBrain(k, `${b}--verify`) }
  fs.mkdirSync(`${EXP}/raw`, { recursive: true })
  fs.writeFileSync(`${EXP}/manifest.json`, JSON.stringify(manifest, null, 2))
  console.log(`dry-run: 计划 ${manifest.plan.length} 个 run → ${EXP}/manifest.json`)
  process.exit(0)
}

fs.mkdirSync(`${EXP}/raw`, { recursive: true })
// R4c 续跑支持: 夜间卡死恢复 — 已有 result 的 run 跳过并预载入 manifest(重跑只补缺口)
for (const f of fs.readdirSync(`${EXP}/raw`).filter((x) => x.startsWith('result-'))) {
  try { manifest.runs.push(JSON.parse(fs.readFileSync(`${EXP}/raw/${f}`, 'utf8'))) } catch {}
}
// R4c 修正: 交错执行(run 优先于配置) — 顺序执行曾使「配置效应」与「时间/额度限速效应」完全混杂
const plan = []
for (let i = 1; i <= RUNS; i++) for (const kind of CONFIGS) plan.push({ kind, run: i })
let seq = 0
for (const { kind, run: runIdx } of plan) {
  if (manifest.runs.some((r) => r.kind === kind && r.run === runIdx && r.eval && !r.eval.error)) continue
  const port = BASE_PORT + seq
  seq++
  const r = await runOne(kind, runIdx, port)
  manifest.runs.push(r)
  fs.writeFileSync(`${EXP}/raw/result-${kind}-${runIdx}.json`, JSON.stringify(r, null, 2))
  fs.writeFileSync(`${EXP}/manifest.json`, JSON.stringify(manifest, null, 2))
}

// ---------- 汇总 ----------
const cov = (r) => Number(String(r.eval?.coverage_pct ?? '0').toString().replace('%', '')) || 0
const byConf = {}
for (const r of manifest.runs) (byConf[r.kind] ??= []).push(r)
const L = [`# 消融实验 ${EXP_ID}`, '', `- 靶场: ${PROFILE_NAME}(${baseProf.url})`, `- 每配置 ${RUNS} run, 值域: coverage%(中位数) / artifacts / FP / wallclock(中位数)`, '']
const table = ['| 配置 | coverage 中位 | artifacts | FP | wallclock 中位(s) |', '|---|---|---|---|---|']
for (const [k, rs] of Object.entries(byConf)) {
  const med = (a) => a.sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0
  const covs = rs.map(cov)
  table.push(`| ${k} | ${med(covs)}% | ${rs.map((r) => r.eval?.artifacts ?? '-').join('/')} | ${rs.reduce((n, r) => n + (r.eval?.false_positives?.length ?? 0), 0)} | ${med(rs.map((r) => r.wallclock_s))} |`)
}
L.push(...table, '')
if (byConf.full) {
  for (const k of Object.keys(byConf)) {
    if (k === 'full') continue
    const n = Math.min(byConf.full.length, byConf[k].length)
    const st = signTest(Array.from({ length: n }, (_, i) => ({ a: cov(byConf.full[i]), b: cov(byConf[k][i]) })))
    L.push(`- full vs ${k}: 符号检验 ${JSON.stringify(st)}`)
  }
}
L.push('', '> 纪律: 本表结论才可写入 ITERATION.md「消融归因」栏; 未跑此实验的归因一律标「假设」。')
fs.writeFileSync(`${EXP}/summary.md`, L.join('\n') + '\n')
fs.writeFileSync(`${EXP}/manifest.json`, JSON.stringify(manifest, null, 2))
console.log(`完成 → ${EXP}/summary.md`)

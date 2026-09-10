#!/usr/bin/env node
// study.mjs — 知识脑学习任务: 读 knowledge/inbox 文档 → 模型提炼 technique cards → brain/staged
// 用法: node scripts/brain/study.mjs [--apply] [--model 厂商/模型] [--graph 8766]
//   默认 dry-run 只打印提炼结果; --apply 写入 D2D_DATA_DIR/brain/staged 待晋级(晋级须过 promote.mjs 三层门禁)
// 车道空闲时由 watchdog 调用; 或 /pentest-study 手动触发
import { execFileSync, spawn } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const REPO = process.env.D2D ?? `${os.homedir()}/d2d`
const DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const INBOX = `${DATA_DIR}/knowledge/inbox`
const STAGED = `${DATA_DIR}/brain/staged`
const APPLY = process.argv.includes('--apply')
const mi = process.argv.indexOf('--model')
// 缺省参数修复: 同 src-export — 不带 --graph 时旧写法取到 argv[0]
const _gi = process.argv.indexOf('--graph')
const GRAPH = _gi > -1 ? (process.argv[_gi + 1] || '8766') : '8766'
// 中危审计修复(0910): 批次超时 env 可调(旧版硬编码 900s), 默认 1800s; NaN/非法值回退默认
const BATCH_TIMEOUT_S = (() => {
  const n = parseInt(process.env.D2D_STUDY_BATCH_TIMEOUT ?? '1800', 10)
  return Number.isFinite(n) && n > 0 ? n : 1800
})()
// 中危审计修复(0910): 已完成批次进度落盘 — 旧版进度只在内存, 中途崩溃/超时后重跑会重复蒸馏
// 已完成批次(纯烧额度)。进度按语料 sha1 记账(staged 写盘成功后清除)。
const PROGRESS_FILE = `${DATA_DIR}/brain/study-progress.json`
const corpusHash = (corpus) => crypto.createHash('sha1').update(String(corpus ?? '')).digest('hex')
function loadProgress() {
  try {
    const j = JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'))
    return j && typeof j.done === 'object' && j.done ? j.done : {}
  } catch { return {} }
}
function saveProgress(done) {
  try {
    fs.mkdirSync(path.dirname(PROGRESS_FILE), { recursive: true })
    fs.writeFileSync(PROGRESS_FILE, JSON.stringify({ version: 1, done }, null, 1))
  } catch (e) { console.error('[study] progress save:', e?.message) }
}
function clearProgress() {
  try { fs.rmSync(PROGRESS_FILE, { force: true }) } catch {}
}

const readJson = (p, d = null) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')) } catch { return d } }
function studyModel() {
  if (mi > 0) return process.argv[mi + 1]
  // A-2: 与 scheduler loadPolicies 同序 — DATA_DIR 外置配置优先, 仓库内回退
  for (const p of [`${DATA_DIR}/config/model-policies.json`, `${REPO}/config/model-policies.json`]) {
    const pol = readJson(p, null)
    if (pol) return String(pol?.roles?.study?.primary ?? pol?.default?.primary ?? '').trim()
  }
  return ''
}

// Reflexion 反例段: 注入图中已证伪方向, 学习卡避让死路(防知识进化复活 refuted)
function graphRefuted() {
  try {
    const token = fs.readFileSync(`${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
    const res = execFileSync('curl', ['-s', '-m', '8', '-X', 'POST',
      `http://127.0.0.1:${GRAPH}/query`, '-H', 'Content-Type: application/json',
      '-H', `X-Auth: ${token}`,
      '-d', JSON.stringify({ cypher: "MATCH (s:Signal_) WHERE s.status IN ['refuted','pruned'] RETURN DISTINCT s.type AS t LIMIT 30" })], { encoding: 'utf8' })
    return (JSON.parse(res).rows ?? []).map((r) => String(r.t ?? '')).filter(Boolean)
  } catch { return [] }
}

// 与 adapter-dsh.mjs 同机制的临时 DSH_HOME(硬链接复制 + 改写 agent-default-model)
function rewriteDefaultModel(text, model) {
  const slash = model.indexOf('/')
  const out = []
  let inBlock = false, done = false
  for (const ln of String(text).split(/\r?\n/)) {
    if (/^agent-default-model:/.test(ln)) { inBlock = true; out.push(ln); continue }
    if (inBlock) {
      if (/^\s+provider:/.test(ln)) { out.push(`  provider: ${model.slice(0, slash)}`); done = true; continue }
      if (/^\s+model:/.test(ln)) { out.push(`  model: ${model.slice(slash + 1)}`); continue }
      inBlock = false
    }
    out.push(ln)
  }
  if (!done) out.push('agent-default-model:', `  provider: ${model.slice(0, slash)}`, `  model: ${model.slice(slash + 1)}`)
  return out.join('\n') + '\n'
}
function buildModelHome(model) {
  const dshHome = process.env.P2P_DSH_HOME ?? `${os.homedir()}/.dsh`
  if (!model || !/^[^/]+\//.test(model)) return null
  try {
    fs.mkdirSync(`${DATA_DIR}/dsh-homes`, { recursive: true })
    const dir = fs.mkdtempSync(`${DATA_DIR}/dsh-homes/s-`)
    // 轻量 overlay(同 adapter): settings.yaml 实写 + 其余全量 symlink(相对链接 bundle + .credentials.yaml 凭据)
    fs.writeFileSync(`${dir}/settings.yaml`, rewriteDefaultModel(fs.readFileSync(`${dshHome}/settings.yaml`, 'utf8'), model))
    for (const ent of fs.readdirSync(dshHome, { withFileTypes: true })) {
      if (ent.name === 'settings.yaml') continue
      try { fs.symlinkSync(`${dshHome}/${ent.name}`, `${dir}/${ent.name}`) } catch {}
    }
    return dir
  } catch (e) { console.error('[study] model home:', e?.message); return null }
}

// ---------- 收料 ----------
fs.mkdirSync(INBOX, { recursive: true })
fs.mkdirSync(STAGED, { recursive: true })
const docs = fs.readdirSync(INBOX).filter((f) => /\.(md|txt|markdown)$/i.test(f)).map((f) => ({
  name: f,
  body: fs.readFileSync(`${INBOX}/${f}`, 'utf8').slice(0, 40_000),
}))
const pdfs = fs.readdirSync(INBOX).filter((f) => /\.pdf$/i.test(f))
if (!docs.length) {
  console.log(`inbox 为空(${INBOX})。投放 md/txt 文章后重跑; PDF 请先转 md。${pdfs.length ? `有 ${pdfs.length} 个 PDF 待转换: ${pdfs.join(', ')}` : ''}`)
  process.exit(2) // R4b: 空转非成功 — watchdog 的 && 链不再误记「产出 staged」
}
console.log(`收料 ${docs.length} 篇: ${docs.map((d) => d.name).join(', ')}`)

// ---------- 学习简报 ----------
// 0905 实证: 整包语料作单个 argv 传 dsh 触发 spawn E2BIG(Linux 单参数上限 128KB),
// auto-study 数十次全部死在这里 — 学习环从未自主完成蒸馏。改为按体积分批(≈30K chars/批)。
const BATCH_CHAR_BUDGET = 30_000
const batches = []
for (const d of docs) {
  const body = d.body.length > BATCH_CHAR_BUDGET ? d.body.slice(0, BATCH_CHAR_BUDGET) : d.body
  const last = batches[batches.length - 1]
  if (last && last.chars + body.length <= BATCH_CHAR_BUDGET) { last.docs.push(d); last.chars += body.length }
  else batches.push({ docs: [d], chars: body.length })
}
// 组批时 body 已在入批时展开 → 重建每批语料
for (const b of batches) b.corpus = b.docs.map((d) => `<<<DOC ${d.name}\n${d.body.slice(0, BATCH_CHAR_BUDGET)}\nDOC>>>`).join('\n\n')
const refuted = graphRefuted()
const refutedBlock = refuted.length
  ? `\n⚠ 实战反例(Reflexion): 本机图数据中以下攻击方向已被复现否定且无胜绩: ${refuted.join(', ')}。新卡不得复活这些方向; 文章内容与实战反例冲突时, 以实战反例为准。\n`
  : ''
function batchPrompt(corpus) { return `你是 d2d 知识脑的学习引擎。阅读以下安全文章/论文, 提炼可指导自主渗透测试的技术卡(technique cards)。要求:
1. 只提炼"可操作"的知识: 触发场景/适用技术栈指纹/验证方法; 忽略纯理论叙事与营销内容。
2. 输出严格的 JSON 数组, 每张卡形如:
{"id":"card:<slug>","title":"...","category":"web|auth|logic|recon|files|client|crypto|mobile|ai|infra 之一(按卡的主导攻击面)","applies_to":["小写技术指纹/业务关键词"],"domain":"可为空, 金融/支付等领域知识填领域名","validation_recipe":"1-2 句可执行的验证思路(非 payload 转储)","signals":["2-4 条命中迹象, 小写短语: 观察到什么现象/响应特征说明该技术适用"],"negative_controls":["1-3 条阴性对照: 什么相似情形不是漏洞或 SRC 不收录(如纯加固缺失/理论而无证据), 不应报告"],"adaptation_prompt":"1-2 句给 worker 的执行指令: 在目标上如何适配(入口优先级/必须带齐的证据/停手条件)","refs":["来源文章名"],"variants":[{"stack":"其他技术栈指纹","payload_diff":"同类攻击在该栈的等价形态差异","ref":"来源"}]}
   category 为必填单选(策略库按它归类浏览); signals/negative_controls/adaptation_prompt 三字段必填不得省略(检索打分/防误报/简报注入都依赖它们); variants 为可选字段(E-4 变体分析): 当文中技术有明显栈依赖差异时给出 1-3 个变体, 没有则省略。
3. 4-8 张卡; 与常见基础重复度高的内容从简。禁止编造未在文章中出现的验证步骤。
4. 最终回复只输出 JSON 数组本身, 不要其他文字。
${refutedBlock}
文章:
${corpus}` }

// ---------- 分批跑 study worker ----------
const model = studyModel()
const home = buildModelHome(model)
console.log(`study worker 启动(model=${model || 'dsh 默认'}, ${batches.length} 批)...`)

function runBatch(corpus) {
  return new Promise((resolve) => {
    const prompt = batchPrompt(corpus)
    // timeout 包裹: GNU timeout 默认对子进程组建新进程组发信号(--kill-after 兜底 KILL),
    // dsh 再派生的子进程一并被杀 — 超时永不卡死 study 进程; 时长 BATCH_TIMEOUT_S(env 可调)
    const out = spawn('timeout', ['--signal=KILL', '--kill-after=5', String(BATCH_TIMEOUT_S), 'dsh', '--profile', 'headless', prompt], {
      cwd: REPO,
      env: { ...process.env, DSH_HOME: home ?? (process.env.P2P_DSH_HOME ?? `${os.homedir()}/.dsh`) },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let buf = ''
    out.stdout.on('data', (d) => { buf += d })
    out.stderr.on('data', (d) => { buf += d })
    out.on('close', (code) => {
      const text = String(buf)
      const m = text.match(/\[[\s\S]*\]/)
      if (code !== 0 && !m) return resolve({ err: `code=${code} ${text.slice(-300)}` })
      let cards
      try { cards = JSON.parse(m[0]) }
      catch { return resolve({ err: `JSON 解析失败 ${text.slice(-200)}` }) }
      if (!Array.isArray(cards) || !cards.length) return resolve({ err: '提炼结果为空' })
      resolve({ cards })
    })
  })
}

;(async () => {
  const all = []
  const byId = new Set()
  const progress = loadProgress()
  let resumed = 0
  let failed = 0
  for (let i = 0; i < batches.length; i++) {
    const hash = corpusHash(batches[i].corpus)
    // 中危审计修复(0910): 已完成批次直接复用进度(重跑不重复蒸馏); 只有未完成批次才付模型调用
    if (progress[hash]?.cards?.length) {
      resumed++
      const r = progress[hash]
      for (const c of r.cards) {
        const id = String(c.id ?? '')
        if (id && !byId.has(id)) { byId.add(id); all.push(c) }
      }
      console.log(`[批 ${i + 1}/${batches.length}] 复用上次进度(${r.cards.length} 张, ${r.at ?? '上次运行'})`)
      continue
    }
    const r = await runBatch(batches[i].corpus)
    if (r.err) { failed++; console.error(`[批 ${i + 1}/${batches.length}] 失败: ${r.err}`); continue }
    progress[hash] = { cards: r.cards, at: new Date().toISOString() }
    saveProgress(progress) // 每批完成即落盘 — 中途崩溃/被杀后重跑从断点继续
    let kept = 0
    for (const c of r.cards) {
      const id = String(c.id ?? '')
      if (!id || byId.has(id)) continue
      byId.add(id); all.push(c); kept++
    }
    console.log(`[批 ${i + 1}/${batches.length}] 提炼 ${r.cards.length} 张(去重后 +${kept})`)
  }
  if (resumed) console.log(`复用 ${resumed} 批上次进度`)
  try { if (home) fs.rmSync(home, { recursive: true, force: true }) } catch {}
  if (!all.length) { console.error('全部批次失败 — 未产出卡片'); process.exit(1) }
  console.log(`合计 ${all.length} 张卡(去重后, ${failed} 批失败):`)
  for (const c of all.slice(0, 20)) console.log(`  - ${c.id} ${c.title} [${(c.applies_to ?? []).slice(0, 4).join(',')}]`)
  // 走到收尾(staged 写盘/队列消费)即整轮完成 — 清进度, 之后新语料从头记账
  clearProgress()
  if (!APPLY) { console.log('(dry-run, 加 --apply 写入 staged 待晋级)'); return }
  const currentV = (() => { try { return fs.readlinkSync(`${DATA_DIR}/brain/current`) } catch { return '' } })()
  const manifest = {
    created_at: new Date().toISOString(),
    status: 'staged',
    parent_version: path.basename(currentV) || null,
    source_docs: batches.flatMap((b) => b.docs.map((d) => d.name)),
    graph: GRAPH,
  }
  fs.writeFileSync(`${STAGED}/techniques.json`, JSON.stringify({ cards: all }, null, 1))
  fs.writeFileSync(`${STAGED}/manifest.json`, JSON.stringify(manifest, null, 2))
  // 队列消费(0905 实证: 不移走则 auto-study 每 30min 对同一批文章反复蒸馏, 纯烧额度):
  // 已蒸馏文档移入 inbox-hold(保留原文, 不删除), inbox 清空后 auto-study 自然静默
  const HOLD = `${DATA_DIR}/knowledge/inbox-hold`
  try {
    fs.mkdirSync(HOLD, { recursive: true })
    let moved = 0
    for (const b of batches) for (const d of b.docs) {
      try { fs.renameSync(`${INBOX}/${d.name}`, `${HOLD}/${d.name}`); moved++ } catch {}
    }
    console.log(`已蒸馏文档 ${moved} 篇移入 inbox-hold(队列消费, 防重复蒸馏)`)
  } catch (e) { console.error('hold 移动失败(不影响 staged):', e?.message) }
  console.log(`已写入 ${STAGED}/ (status=staged)。晋级: node scripts/brain/promote.mjs --to-shadow`)
})()

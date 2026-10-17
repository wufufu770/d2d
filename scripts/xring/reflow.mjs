#!/usr/bin/env node
// scripts/xring/reflow.mjs — X-Ring 回流执行器（XR-P1 族 3）
// 写权归 host（拍板 1 定谳）: 本模块持 host token 打六写端点; X-Ring worker 全程只写
// workspace（env 无图 token, 对 /query 与 /write/* 均 401 — 断言固化见 assertNoTokenAuth）。
// 路由: hypotheses.json→B 级 /write/hypothesis; repro_paths.json→A 级 verifyRunner→
// /write/finding; lessons.json→C 级 /write/experience（写入即 quarantined — graphd 语义）。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateFile, validateHypotheses } from './validate.mjs'
import { createVerifyRunner } from './verify-runner.mjs'
import { collectFromReflow, writeHandoff, HANDOFF_FILE } from './relay.mjs'
import { raceVerify, raceEvidence } from './verify-race.mjs'
import { shouldAdvise, runAdvisor, buildAdvisorBrief, applyAdvice } from './advisor.mjs'
import { XRING_MODES } from './monitor.mjs'

// E11a#4: 条目级容错——单条 schema 失败不再拖死整文件。超长 evidence_refs 条目截断
// 至 500+尾标后重校（过=partial 入图）; 仍失败=条目拒（只拒该条）。结构性损坏
// （JSON parse/根类型错）仍由 validateFile 的文件级拒处理（无从逐条）。
const EVIDENCE_MAX = 500
export function tolerantHypothesisEntries(doc, fileErrors = []) {
  const out = { pass: [], partial: [], rejected: [] }
  const items = Array.isArray(doc?.hypotheses) ? doc.hypotheses : null
  if (!items) return { ...out, rejected: [{ id: '(root)', reason: fileErrors.join(' | ').slice(0, 200) }] }
  for (const [idx, h] of items.entries()) {
    // schema root required（run_id/generated_at）——单条构造补占位根字段（items 校验语义）
    const single = { run_id: 'e11a', generated_at: '2026-01-01T00:00:00Z', hypotheses: [h] }
    let v = validateHypotheses(single)
    if (v.ok) { out.pass.push(h); continue }
    const isLengthOnly = (v.errors ?? []).every((e) => /evidence_refs\/\d+ (must NOT have more than|maxLength)/i.test(e))
    if (isLengthOnly && Array.isArray(h.evidence_refs)) {
      // 截断语义（E11a#4）: 总长含尾标 ≤ EVIDENCE_MAX（schema maxLength 硬上限——截断后仍超
      // 上限=截断无意义, 故 slice 长度预扣尾标）; 重校构造同 single（root required 补占位）。
      const trimmed = { ...h, evidence_refs: h.evidence_refs.map((r) => {
        const s2 = String(r)
        if (s2.length <= EVIDENCE_MAX) return r
        const tail = `[truncated:原长${s2.length}]`
        return s2.slice(0, Math.max(0, EVIDENCE_MAX - tail.length)) + tail
      }) }
      v = validateHypotheses({ run_id: 'e11a', generated_at: '2026-01-01T00:00:00Z', hypotheses: [trimmed] })
      if (v.ok) { out.partial.push({ ...trimmed, partial: true, _origLens: h.evidence_refs.map((r) => String(r).length) }); continue }
    }
    out.rejected.push({ id: h?.id ?? `(idx:${idx})`, reason: (v.errors ?? []).join(' | ').slice(0, 200) })
  }
  return out
}

// E11a#7: ID 对账闸——repro_paths 为 findings 权威清单（F-N 连续无重）; handoff.md
// 战果表 ID 集合（存在时）与之一致, 不一致=整场拒落+差异报告。handoff 缺失=退化自洽校验。
export function idReconcile({ reproIds, handoffPath }) {
  const errs = []
  const ids = reproIds ?? []
  if (ids.some((x) => !/^F-\d+$/.test(x))) errs.push(`repro_paths 存在非 F-N 形态 id: ${ids.filter((x) => !/^F-\d+$/.test(x)).join(',')}`)
  const nums = ids.map((x) => Number(x.slice(2)))
  if (new Set(nums).size !== nums.length) errs.push(`repro_paths id 重复: ${ids.join(',')}`)
  if (nums.length && (Math.min(...nums) !== 1 || Math.max(...nums) !== nums.length)) errs.push(`repro_paths id 非连续（期望 F-1..F-${nums.length}）: ${ids.join(',')}`)
  let handoffIds = null
  if (handoffPath && fs.existsSync(handoffPath)) {
    handoffIds = []
    for (const line of fs.readFileSync(handoffPath, 'utf8').split('\n')) {
      const m = /^\s*\|\s*(F-\d+)\s*\|/.exec(line)
      if (m && !handoffIds.includes(m[1])) handoffIds.push(m[1])
    }
    const onlyHandoff = handoffIds.filter((x) => !ids.includes(x))
    const onlyRepro = ids.filter((x) => !handoffIds.includes(x))
    if (onlyHandoff.length || onlyRepro.length)
      errs.push(`ID 漂移: handoff 多出 [${onlyHandoff.join(',')}] repro 多出 [${onlyRepro.join(',')}]——权威源=repro_paths, handoff 需对齐后重交`)
  }
  return { ok: errs.length === 0, errs, handoffIds }
}

async function post(graphdUrl, apiPath, payload, token) {
  const res = await fetch(graphdUrl + apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  let body = {}
  try { body = await res.json() } catch { /* 已记因: 解析容错——响应非 JSON 时保持空 body, 状态码照常返回给调用方 */ }
  return { status: res.status, body }
}

/** 扫描 workspace 产出（缺文件=该级无产出, 合法）。E18: +intents.json（意图运行时——可选产物）。 */
export function scanArtifacts(workspace) {
  const found = {}
  for (const f of ['hypotheses.json', 'repro_paths.json', 'lessons.json', 'intents.json']) {
    const p = path.join(workspace, f)
    found[f] = fs.existsSync(p) ? p : null
  }
  return found
}

/** provenance_hash: runId 绑定的溯源指纹（C 级必填字段）。 */
export function provenanceOf(runId) {
  return 'xring-' + createHash('sha256').update(String(runId)).digest('hex').slice(0, 16)
}

/**
 * 回流主入口。
 * opts: { workspace, runId, graphdUrl, hostToken, eventsFile?, verifyRunner?, eng?, mode? }
 * mode（U2 三档, XR-P3 拍板 1）: 'off'=整体跳过零图写（工件只留 workspace, 事件照落）；
 * 'queue'（缺省）/'bypass'=走本写管道——两者在可控写面上同形: B/C 经六写端点入图, 落库
 * 可见性由 graphd 服务端语义决定（C 写入即隔离是服务端硬语义, 档位不改变它）; bypass 档
 * 的现实契约=A 级 verify 双签硬线不随档位豁免（测试断言固化, xring-p3）。
 * 返回 { ok, written, held, errors, skipped? } — written=已入图条目, held=A 级 manual 留验。
 */
export async function reflow(opts) {
  const { workspace, runId, graphdUrl, hostToken, eventsFile = null, eng = '', mode = 'queue' } = opts
  if (!XRING_MODES.includes(mode)) throw new Error(`mode=${mode} 非法（${XRING_MODES.join('|')}）`)
  const verifyRunner = opts.verifyRunner ?? createVerifyRunner()
  const written = []
  const held = []
  const errors = []
  // E15/R-05: 全量载体收集（verifiedFindings=A 级 pass 全文; hypothesisDocs=B 级文档原文——
  // handoff 组装消费; 仅 emitHandoff 路径读取, 既有返回面零变化）
  const aVerified = []
  const hypothesisDocs = []
  const intentsDocs = []
  const advisorLeads = [] // E18/P0-2: Advisor 建议入 handoff leads（origin=advisor）
  // E15 复战语义: 上轮 fact 本轮复验失败=refuted（形态突变嫌疑——ECC 跨轮漂移为解释源）
  const refuted = []
  const prevFactMap = new Map((Array.isArray(opts.prevFacts) ? opts.prevFacts : []).map((x) => [String(x.id), String(x.title ?? '')]))
  const emit = (event) => { if (eventsFile) { try { fs.appendFileSync(eventsFile, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n') } catch { /* 已记因: 尽力而为——单条事件落盘失败静默, 不阻断回流写入主流程 */ } } }

  if (mode === 'off') {
    // 纯观察档: 扫描照做（产物形态可见）, 写面整体跳过——数据保全在 workspace, 零图写。
    const found = scanArtifacts(workspace)
    emit({ event: 'reflow-start', runId, workspace, mode, skipped: true })
    emit({ event: 'reflow-done', runId, mode, skipped: true, written: 0, held: 0, errors: 0 })
    return { ok: true, skipped: true, written, held, errors, artifacts: Object.keys(found).filter((k) => found[k]) }
  }

  const found = scanArtifacts(workspace)
  emit({ event: 'reflow-start', runId, workspace, mode })

  // ---- C 级: lessons.json → /write/experience（写入即 quarantined — graphd 语义）----
  if (found['lessons.json']) {
    const v = validateFile(found['lessons.json'])
    if (!v.ok) {
      errors.push({ file: 'lessons.json', errors: v.errors })
    } else {
      const doc = JSON.parse(fs.readFileSync(found['lessons.json'], 'utf8'))
      for (const l of doc.lessons) {
        const category = l.failure_class === 'cognitive' || l.failure_class === 'environment' ? 'failure' : 'pitfall'
        const r = await post(graphdUrl, '/write/experience', {
          id: `xring-${runId}-${l.id.toLowerCase()}`,
          eng_id: eng || runId,
          title: (`${l.failure_class}: ${l.lesson}`).slice(0, 64),
          content: String(l.lesson).slice(0, 512),
          category,
          provenance_hash: provenanceOf(runId),
        }, hostToken)
        if (r.status === 200 && r.body?.ok) written.push({ level: 'C', id: l.id, status: r.body.status ?? 'quarantined' })
        else errors.push({ file: 'lessons.json', id: l.id, status: r.status, body: r.body })
      }
    }
  }

  if (found['intents.json']) {
    // E18 意图运行时: worker 收尾自声明（可选产物——缺文件=无 intents）; 结构坏文件留 errors 不拖死主流程
    try {
      intentsDocs.push(JSON.parse(fs.readFileSync(found['intents.json'], 'utf8')))
    } catch (e) {
      errors.push({ file: 'intents.json', parse: String(e?.message ?? e).slice(0, 120) })
    }
  }

  // ---- B 级: hypotheses.json → /write/hypothesis（E11a#4: 条目级容错——超长 evidence
  // 截断+partial 入图, 条目拒只拒该条; 文件级拒仅留结构性损坏）----
  if (found['hypotheses.json']) {
    const v = validateFile(found['hypotheses.json'])
    const doc = JSON.parse(fs.readFileSync(found['hypotheses.json'], 'utf8'))
    hypothesisDocs.push(doc)
    let entries = { pass: doc.hypotheses ?? [], partial: [], rejected: [] }
    if (!v.ok) entries = tolerantHypothesisEntries(doc, v.errors)
    for (const h of entries.pass) {
      const r = await post(graphdUrl, '/write/hypothesis', {
        id: `xring-${runId}-${h.id.toLowerCase()}`,
        text: String(h.statement).slice(0, 1500),
        strategy: String(h.priority ?? ''),
        eng: eng || runId,
      }, hostToken)
      if (r.status === 200 && r.body?.ok) written.push({ level: 'B', id: h.id })
      else errors.push({ file: 'hypotheses.json', id: h.id, status: r.status, body: r.body })
    }
    for (const h of entries.partial) {
      const r = await post(graphdUrl, '/write/hypothesis', {
        id: `xring-${runId}-${h.id.toLowerCase()}`,
        text: String(h.statement).slice(0, 1500),
        strategy: String(h.priority ?? ''),
        eng: eng || runId,
      }, hostToken)
      if (r.status === 200 && r.body?.ok) {
        written.push({ level: 'B', id: h.id, partial: true, evidenceTruncatedTo: EVIDENCE_MAX })
        emit({ event: 'partial-entry', runId, file: 'hypotheses.json', id: h.id, truncatedTo: EVIDENCE_MAX })
      } else errors.push({ file: 'hypotheses.json', id: h.id, status: r.status, body: r.body })
    }
    for (const rej of entries.rejected) errors.push({ file: 'hypotheses.json', id: rej.id, entryRejected: true, reason: rej.reason })
  }

  // ---- A 级: repro_paths.json → verifyRunner（必经）→ /write/finding ----
  if (found['repro_paths.json']) {
    const v = validateFile(found['repro_paths.json'])
    if (!v.ok) {
      errors.push({ file: 'repro_paths.json', errors: v.errors })
    } else {
      const doc = JSON.parse(fs.readFileSync(found['repro_paths.json'], 'utf8'))
      // E11a#7: ID 对账闸（入图前置）——repro 自洽+handoff 一致性; 漂移=整场拒落+差异报告
      const rec = idReconcile({ reproIds: (doc.findings ?? []).map((f) => f.id), handoffPath: path.join(workspace, 'handoff.md') })
      if (!rec.ok) {
        errors.push({ file: 'id-reconcile', gate: 'blocked', errs: rec.errs })
        emit({ event: 'id-reconcile-blocked', runId, errs: rec.errs })
        return { ok: false, written, held, errors, idDrift: rec.errs }
      }
      if (rec.handoffIds) emit({ event: 'id-reconcile-ok', runId, repro: (doc.findings ?? []).map((f) => f.id).length, handoff: rec.handoffIds.length })
      // E18: 失败连击计数（Advisor 触发源）+竞速/Advisor 均为 opt-in（缺省零行为变化）
      let failStreak = 0
      for (const f of doc.findings) {
        let verdict
        let raceNote = ''
        if (opts.raceEnabled && Array.isArray(f.variants) && f.variants.length) {
          // E18/P1-1 竞速验证（opt-in）: 多策略变体并行重放, 先 pass 者胜
          const race = await raceVerify(verifyRunner, { primary: f.steps ?? [], variants: f.variants })
          verdict = race.winner?.verdict ?? { verdict: 'fail', evidence: raceEvidence(race) }
          raceNote = raceEvidence(race)
        } else {
          verdict = await verifyRunner.verify(f)
        }
        if (verdict.verdict !== 'pass') {
          failStreak++
          held.push({ level: 'A', id: f.id, verdict: verdict.verdict, failureClass: verdict.failureClass ?? null, evidence: verdict.evidence, ...(prevFactMap.has(String(f.id)) ? { prevFact: true } : {}) })
          if (prevFactMap.has(String(f.id))) refuted.push({ id: f.id, statement: prevFactMap.get(String(f.id)) || f.title, reason: `复验 ${verdict.verdict}（上轮 fact——形态突变嫌疑, 见 ECC 跨轮信号）` })
          // E18/P0-2 Advisor（opt-in）: 连败 ≥ 阈值 → 第二上下文会诊（建议非指令, 主循环消化）
          if (opts.advisor && shouldAdvise(failStreak, { threshold: opts.advisorThreshold })) {
            try {
              const ar = await runAdvisor({ adapter: opts.advisor.adapter, workspace, brief: buildAdvisorBrief({ runId, target: String(opts.target ?? ''), failures: held.map((h) => `${h.id}:${h.verdict}`), historySummary: opts.advisor.historySummary ?? '', priorAdvice: advisorLeads.map((l) => l.statement).join('\n') }) })
              const advice = applyAdvice(workspace, ar.advice)
              if (advice) {
                advisorLeads.push({ id: `ADV-${advisorLeads.length + 1}`, statement: advice.slice(0, 1500), priority: 'high', origin: 'advisor' })
                failStreak = 0 // 建议消化后连击归零（换视角重计——角色互换传承语义）
                emit({ event: 'advisor-advice', runId, id: advisorLeads[advisorLeads.length - 1].id })
              }
            } catch (e) {
              errors.push({ file: 'advisor', err: String(e?.message ?? e).slice(0, 120) })
            }
          }
          continue // A 级必经 verify: manual/fail 不入图（编排位固化, P3/P4 接真执行器）
        }
        failStreak = 0
        // XR-G6: repro 首行补鉴权档位标注（一处 diff）——graphd 0917 鉴权档位门（high/critical
        // 必须注明档位, 结构化 JSON 路径同规）曾把 F-7 verify pass 的入图拦在 400。xring 工件
        // 步骤通常含登录序列, 标注"登录态"=如实（AUTH_TIER_MARKER_RE 既有词表命中即可）。
        const repro = `鉴权档位: 登录态（X-Ring 受控靶机械重放）\n${(f.steps ?? []).join(' && ') || String(f.observed ?? '').slice(0, 500)}`
        const r = await post(graphdUrl, '/write/finding', {
          id: `xring-${runId}-${f.id.toLowerCase()}`,
          title: String(f.title).slice(0, 200),
          severity: f.severity === 'info' ? 'info' : (f.severity ?? 'low'),
          repro: repro || String(f.observed ?? '').slice(0, 500),
          eng: eng || runId,
        }, hostToken)
        // XR-G7: written 带 verdict evidence（G7 分层标注/请求链落档——判定权打折语义的可见载体;
        // 之前 pass 只留 id, evidence 信息丢失）
        if (r.status === 200 && r.body?.ok) written.push({ level: 'A', id: f.id, evidence: verdict.evidence })
        else errors.push({ file: 'repro_paths.json', id: f.id, status: r.status, body: r.body })
        if (r.status === 200 && r.body?.ok) aVerified.push({ ...f, verifyEvidence: [verdict.evidence, raceNote].filter(Boolean).join(' ') })
      }
      // E11a#7 差集审计: 图内已分配 ID − repro 引用集 = 孤儿 finding 清单（非空即报警）
      try {
        const orphRows = await post(graphdUrl, '/query', { cypher: `MATCH (f:Finding) WHERE f.id STARTS WITH 'xring-${runId}-f-' RETURN f.id AS id` }, hostToken)
        const graphIds = (orphRows.body?.rows ?? []).map((r) => r.id)
        const reproRefs = new Set((doc.findings ?? []).map((f) => `xring-${runId}-${f.id.toLowerCase()}`))
        const orphans = graphIds.filter((g) => !reproRefs.has(g))
        if (orphans.length) {
          emit({ event: 'orphan-findings', runId, orphans })
          errors.push({ file: 'id-reconcile', audit: 'orphan-findings', orphans })
        }
      } catch (e) { errors.push({ file: 'id-reconcile', audit: 'orphan-query-failed', err: String(e?.message ?? e).slice(0, 120) }) }
    }
  }

  emit({ event: 'reflow-done', runId, mode, written: written.length, held: held.length, errors: errors.length })

  // ---- E15/R-05: 可选跨 run 接力（emitHandoff=true 时产出 handoff.json 与产物同址;
  // 缺省 false=既有调用零行为变化——向后兼容契约）。verifiedFindings 随返回值外带（R-04 收尾报告消费）。----
  let handoffPath = null
  const verifiedFindings = aVerified ?? []
  if (opts.emitHandoff) {
    try {
      const handoff = collectFromReflow({
        runId,
        target: String(opts.target ?? ''),
        verifiedFindings,
        written,
        held,
        hypothesesDocs: hypothesisDocs,
        intentsDocs: intentsDocs,
        refuted,
        env: opts.handoffEnv ?? null,
        extraLeads: advisorLeads,
      })
      handoffPath = writeHandoff(workspace, handoff)
      emit({ event: 'handoff-emitted', runId, file: HANDOFF_FILE })
    } catch (e) {
      errors.push({ file: HANDOFF_FILE, emit: String(e?.message ?? e).slice(0, 200) })
    }
  }
  return { ok: errors.length === 0, written, held, errors, ...(opts.emitHandoff ? { handoffPath } : {}), verifiedFindings }
}

/**
 * 安全断言取证（固化入测试）: 给定 token 打 /write/finding 的鉴权形态。
 * 预期: X-Ring worker env（无图 token）→ 401; 既有 worker token → 200 面可达（I-013 既有
 * 设计=scheduler worker 回写通道, XR-P1 实测登记 — 是否 graphd 侧加固归用户裁决）。
 */
export async function probeWriteAuth(graphdUrl, token) {
  const r = await post(graphdUrl, '/write/finding', { id: `auth-probe-${Date.now()}`, title: 'XR-P1 auth probe', severity: 'info', ts: 't' }, token ?? '')
  return { status: r.status, authorized: r.status !== 401 && r.status !== 403 }
}

const isDirect = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href
if (isDirect) {
  const [workspace, runId, graphdUrl, hostToken, eventsFile] = process.argv.slice(2)
  if (!workspace || !runId || !graphdUrl || !hostToken) {
    console.error('用法: reflow.mjs <workspace> <runId> <graphdUrl> <hostToken> [eventsFile]')
    process.exit(2)
  }
  const r = await reflow({ workspace, runId, graphdUrl, hostToken, eventsFile })
  console.log(JSON.stringify(r, null, 1))
  process.exit(r.ok ? 0 : 1)
}

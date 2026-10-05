#!/usr/bin/env node
// scripts/xring/reflow.mjs — X-Ring 回流执行器（XR-P1 族 3）
// 写权归 host（拍板 1 定谳）: 本模块持 host token 打六写端点; X-Ring worker 全程只写
// workspace（env 无图 token, 对 /query 与 /write/* 均 401 — 断言固化见 assertNoTokenAuth）。
// 路由: hypotheses.json→B 级 /write/hypothesis; repro_paths.json→A 级 verifyRunner→
// /write/finding; lessons.json→C 级 /write/experience（写入即 quarantined — graphd 语义）。
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { validateFile } from './validate.mjs'
import { createVerifyRunner } from './verify-runner.mjs'
import { XRING_MODES } from './monitor.mjs'

async function post(graphdUrl, apiPath, payload, token) {
  const res = await fetch(graphdUrl + apiPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': token },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15000),
  })
  let body = {}
  try { body = await res.json() } catch {}
  return { status: res.status, body }
}

/** 扫描 workspace 三产出（缺文件=该级无产出, 合法）。 */
export function scanArtifacts(workspace) {
  const found = {}
  for (const f of ['hypotheses.json', 'repro_paths.json', 'lessons.json']) {
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
  const emit = (event) => { if (eventsFile) { try { fs.appendFileSync(eventsFile, JSON.stringify({ ts: new Date().toISOString(), ...event }) + '\n') } catch {} } }

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

  // ---- B 级: hypotheses.json → /write/hypothesis ----
  if (found['hypotheses.json']) {
    const v = validateFile(found['hypotheses.json'])
    if (!v.ok) {
      errors.push({ file: 'hypotheses.json', errors: v.errors })
    } else {
      const doc = JSON.parse(fs.readFileSync(found['hypotheses.json'], 'utf8'))
      for (const h of doc.hypotheses) {
        const r = await post(graphdUrl, '/write/hypothesis', {
          id: `xring-${runId}-${h.id.toLowerCase()}`,
          text: String(h.statement).slice(0, 1500),
          strategy: String(h.priority ?? ''),
          eng: eng || runId,
        }, hostToken)
        if (r.status === 200 && r.body?.ok) written.push({ level: 'B', id: h.id })
        else errors.push({ file: 'hypotheses.json', id: h.id, status: r.status, body: r.body })
      }
    }
  }

  // ---- A 级: repro_paths.json → verifyRunner（必经）→ /write/finding ----
  if (found['repro_paths.json']) {
    const v = validateFile(found['repro_paths.json'])
    if (!v.ok) {
      errors.push({ file: 'repro_paths.json', errors: v.errors })
    } else {
      const doc = JSON.parse(fs.readFileSync(found['repro_paths.json'], 'utf8'))
      for (const f of doc.findings) {
        const verdict = await verifyRunner.verify(f)
        if (verdict.verdict !== 'pass') {
          held.push({ level: 'A', id: f.id, verdict: verdict.verdict, evidence: verdict.evidence })
          continue // A 级必经 verify: manual/fail 不入图（编排位固化, P3/P4 接真执行器）
        }
        const repro = (f.steps ?? []).join(' && ')
        const r = await post(graphdUrl, '/write/finding', {
          id: `xring-${runId}-${f.id.toLowerCase()}`,
          title: String(f.title).slice(0, 200),
          severity: f.severity === 'info' ? 'info' : (f.severity ?? 'low'),
          repro: repro || String(f.observed ?? '').slice(0, 500),
          eng: eng || runId,
        }, hostToken)
        if (r.status === 200 && r.body?.ok) written.push({ level: 'A', id: f.id })
        else errors.push({ file: 'repro_paths.json', id: f.id, status: r.status, body: r.body })
      }
    }
  }

  emit({ event: 'reflow-done', runId, mode, written: written.length, held: held.length, errors: errors.length })
  return { ok: errors.length === 0, written, held, errors }
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

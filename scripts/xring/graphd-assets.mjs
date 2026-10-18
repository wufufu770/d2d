// graphd-assets.mjs — E28(R-25 M1) 资产图编排侧接口（host token /write/ 面）
// 设计权威: docs/asset-graph-design-r25.md §四; 端点语义已由 tests/test_graphd_gates_m1.py
// 锁回归——本模块为纯透传封装（零判读零分支逻辑: 判级语义单一事实源=scripts/xring/ecc.mjs,
// 本接口只传值; 双口径 assess 输出属 M3 接线范围, 本批不接）。
// 权限契约: host token 面（worker 零写零查权维持——runner 剥 token 契约零改动）。

/** Asset upsert（目标级聚合点）。endpoint_url 可选——存在同 url Endpoint 时建 HOSTS 边。 */
export async function writeAsset({ graphdUrl, hostToken, id, kind = 'target', identifier, status = 'active', postureNote = '', endpointUrl = '' }) {
  const r = await fetch(`${graphdUrl}/write/asset`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': hostToken },
    body: JSON.stringify({ id, kind, identifier, status, posture_note: postureNote, endpoint_url: endpointUrl }),
    signal: AbortSignal.timeout(10_000),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, ...j }
}

/** EnvSnapshot 落图（ECC assess 结果+指纹矩阵——双判级与 docs/ecc-form-ledger.md 双记列一一对应）。 */
export async function writeEnvSnapshot({ graphdUrl, hostToken, assetId, levelRaw = '', levelCal = '', signals = '', fingerprint = '', probePaths = '', checkedAt = '' }) {
  const r = await fetch(`${graphdUrl}/write/env-snapshot`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': hostToken },
    body: JSON.stringify({ asset_id: assetId, checked_at: checkedAt, ecc_level_raw: levelRaw, ecc_level_cal: levelCal, signals, fingerprint, probe_paths: probePaths }),
    signal: AbortSignal.timeout(10_000),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, ...j }
}

/** Verification 事件落图（append-only；服务端去重门幂等——重放返回 duplicate=true 非错误）。 */
export async function writeVerification({ graphdUrl, hostToken, kind, verdict, runId, findingRef = '', hypothesisRef = '', reproRef = '', executor = 'reflow', latencyMs = 0, raceVariants = '', note = '' }) {
  const r = await fetch(`${graphdUrl}/write/verification`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': hostToken },
    body: JSON.stringify({ kind, verdict, run_id: runId, finding_ref: findingRef, hypothesis_ref: hypothesisRef, repro_ref: reproRef, executor, latency_ms: latencyMs, race_variants: raceVariants, note }),
    signal: AbortSignal.timeout(10_000),
  })
  const j = await r.json().catch(() => ({}))
  return { status: r.status, ...j }
}

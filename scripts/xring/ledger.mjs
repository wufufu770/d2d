#!/usr/bin/env node
// ledger.mjs — E46-M5 台账直出(R-25 §4.5 台账机械化): 四指标全部图上 COUNT/MATCH 聚合,
// 场验批回报的"四指标"节由本脚本从图直出(设计 N6: 台账机械化——替代人工统计)。
// 用法: node scripts/xring/ledger.mjs [--asset asset-<host>] [--format json|md]
//   --asset 可选: 附带单资产溯源面(queryAssetLedger)。四指标:
//   ①L-1 验证率 = (verified+isolated) / findings 总数
//   ②ECC 假阳率 = raw≠cal(双非空) / cal 非空 —— 对账表双记列的图侧口径
//   ③falsified 防复测命中 = Verification(kind=retest, verdict=fail) 数
//   ④handoff 复战效用 = retest pass 比率(pass/(retest 总))
import fs from 'node:fs'
import os from 'node:os'
import { queryAssetLedger } from './graphd-assets.mjs'

const argv = process.argv.slice(2)
const argOf = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? (argv[i + 1] ?? d) : d }
const FORMAT = argOf('--format', 'md')
const ASSET = argOf('--asset', null)
const dataDir = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const hostToken = fs.readFileSync(process.env.P2P_HOST_TOKEN_FILE ?? `${os.homedir()}/.config/d2d/host-token`, 'utf8').trim()
const graphdUrl = process.env.P2P_GRAPHD ?? 'http://127.0.0.1:8766'

const q = async (cy, params = {}) => {
  const r = await fetch(`${graphdUrl}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Auth': hostToken },
    body: JSON.stringify({ cypher: cy, params }),
    signal: AbortSignal.timeout(10_000),
  })
  const j = await r.json().catch(() => ({}))
  if (!j.ok) throw new Error(`graphd: ${j.error ?? `http ${r.status}`}`)
  return j.rows ?? []
}
const num = (v) => Number(v ?? 0)

const [findingTot] = await q('MATCH (f:Finding) RETURN count(f) AS c')
const [findingVer] = await q("MATCH (f:Finding) WHERE f.gate_status IN ['verified','isolated'] RETURN count(f) AS c")
const [snaps] = await q('MATCH (s:EnvSnapshot) RETURN count(s) AS total, sum(CASE WHEN s.ecc_level_cal <> \'\' THEN 1 ELSE 0 END) AS calibrated, sum(CASE WHEN s.ecc_level_cal <> \'\' AND s.ecc_level_raw <> \'\' AND s.ecc_level_raw <> s.ecc_level_cal THEN 1 ELSE 0 END) AS drift')
const [retestFail] = await q("MATCH (v:Verification) WHERE v.kind = 'retest' AND v.verdict = 'fail' RETURN count(v) AS c")
const [retestPass] = await q("MATCH (v:Verification) WHERE v.kind = 'retest' AND v.verdict = 'pass' RETURN count(v) AS c")
const [reproWin] = await q("MATCH (v:Verification) WHERE v.kind = 'race' AND v.verdict = 'race-win' RETURN count(v) AS c")

const findingsTotal = num(findingTot?.c)
const findingsVerified = num(findingVer?.c)
const snapTotal = num(snaps?.total)
const snapCal = num(snaps?.calibrated)
const snapDrift = num(snaps?.drift)
const retestFailN = num(retestFail?.c)
const retestPassN = num(retestPass?.c)
const raceWinN = num(reproWin?.c)

const metrics = {
  verificationRate: { label: 'L-1 验证率', value: findingsTotal ? +(findingsVerified / findingsTotal * 100).toFixed(1) : null, unit: '%', detail: `${findingsVerified}/${findingsTotal} (verified+isolated)` },
  eccFalsePositiveRate: { label: 'ECC 假阳率', value: snapCal ? +(snapDrift / snapCal * 100).toFixed(1) : null, unit: '%', detail: `${snapDrift}/${snapCal} (raw≠cal, 双非空; 快照总量 ${snapTotal})` },
  falsifiedRetestHits: { label: 'falsified 防复测命中', value: retestFailN, unit: '件', detail: 'retest fail(上轮 fact 本轮复验失败=形态突变嫌疑)' },
  handoffRetestUtility: { label: 'handoff 复战效用', value: (retestPassN + retestFailN) ? +(retestPassN / (retestPassN + retestFailN) * 100).toFixed(1) : null, unit: '%', detail: `${retestPassN}/${retestPassN + retestFailN} retest pass(复验通过比率)` },
  raceWins: { label: '竞速胜出(附加)', value: raceWinN, unit: '件', detail: 'race race-win 事件数' },
}

if (ASSET) {
  try { metrics.assetLedger = await queryAssetLedger({ graphdUrl, hostToken, assetId: ASSET }) } catch (e) { metrics.assetLedger = { error: String(e?.message ?? e).slice(0, 100) } }
}

if (FORMAT === 'json') {
  console.log(JSON.stringify({ generatedAt: new Date().toISOString(), graphdUrl, metrics }, null, 1))
} else {
  const lines = [
    `# 持续验证台账(图上直出) @ ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`,
    '',
    '| 指标 | 值 | 明细 |',
    '|---|---|---|',
    ...Object.values(metrics).filter((m) => m.label).map((m) => `| ${m.label} | ${m.value ?? '—'}${m.value != null ? m.unit : ''} | ${m.detail} |`),
    '',
  ]
  if (metrics.assetLedger && !metrics.assetLedger.error) {
    const al = metrics.assetLedger
    lines.push(`## 资产 ${ASSET}`, '', `- identifier: ${al.asset?.identifier ?? '—'} · 状态 ${al.asset?.status ?? '—'}`, `- HOSTS 端点 ${al.endpoints} · 快照 ${al.snapshots} · ECC 漂移 ${al.eccDrift}`, al.latestSnapshot ? `- 最近快照: ${al.latestSnapshot.at} raw=${al.latestSnapshot.raw || '—'} cal=${al.latestSnapshot.cal || '—'}` : '')
  }
  console.log(lines.join('\n'))
}
process.exit(0)

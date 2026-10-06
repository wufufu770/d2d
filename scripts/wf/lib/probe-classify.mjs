// scripts/wf/lib/probe-classify.mjs — WF-1 层 4：推送/终态探针失败分类（纯函数，单一真源）。
// 事故来源：docs/wf-incident-catalog.md C（网络窗口盲推）/ E（终态探针误判）。
// 关键语义（KEYS-1 误判教训）：空输出/连接失败=窗口态（可等窗重试），绝不判"不一致"；
// 只有"拿到了 sha 且 ≠ 期望"才是确定性失配。分类规则全部机械可测（单测覆盖）。
//
// 组装器（scripts/wf/assemble.mjs）把本文件源码内联进生成的 .dwf.ts（无 import 通道），
// 并以 `[wf:lib:probe-classify]` 锚标记；lint.mjs R9 校验终态核验段含该锚。

/**
 * @param {{ exitCode: number, stdout: string, stderr: string }} probe  单次探针结果（git ls-remote 或 curl）
 * @param {{ expectedSha: string | null }} ctx  期望远端 sha；null=仅测窗口连通（curl 形态）
 * @returns {{ kind: 'ok'|'window-closed'|'mismatch'|'unknown', remoteSha: string, detail: string }}
 *   ok            = 拿到期望 sha（或 curl 200）
 *   window-closed = 连接类失败/空输出/超时——等窗重试，绝不据此判负
 *   mismatch      = 确定性失配：拿到 sha 且 ≠ 期望（真漂移，止损）
 *   unknown       = 未识别形态——交给钩子诊断员（L3）或停（evidence-only 降级）
 */
export function classifyProbeFailure(probe, ctx = {}) {
  const expectedSha = String(ctx.expectedSha ?? '')
  const stdout = String(probe?.stdout ?? '')
  const stderr = String(probe?.stderr ?? '')
  const exitCode = Number(probe?.exitCode ?? 0)
  const detail = `exit=${exitCode} stdout=${stdout.slice(0, 80).trim()} stderr=${stderr.slice(0, 120).trim()}`
  const remoteSha = extractRemoteSha(stdout)

  // 确定性失配必须先于窗口判定：拿到了明确 sha 且不等于期望，等窗也无济于事。
  if (expectedSha && remoteSha && remoteSha !== expectedSha) {
    return { kind: 'mismatch', remoteSha, detail: `确定性失配: remote=${remoteSha.slice(0, 12)} expected=${expectedSha.slice(0, 12)}（${detail}）` }
  }
  if (expectedSha && remoteSha === expectedSha) {
    return { kind: 'ok', remoteSha, detail: `终态一致: ${remoteSha.slice(0, 12)}` }
  }
  // curl 连通形态：HTTP 200 = 窗口开。
  const httpCode = /^(\d{3})\s*$/.exec(stdout.trim())
  if (ctx.expectedSha === null && httpCode) {
    return httpCode[1] === '200'
      ? { kind: 'ok', remoteSha: '', detail: `窗口连通 http=${httpCode[1]}` }
      : { kind: 'window-closed', remoteSha: '', detail: `窗口未开 http=${httpCode[1]}（${detail}）` }
  }
  // 连接类失败 = 窗口态（KEYS-1 教训：空输出≠不一致）。
  if (exitCode !== 0) {
    return { kind: 'window-closed', remoteSha: '', detail: `连接类失败=窗口态（${detail}）` }
  }
  if (!stdout.trim()) {
    return { kind: 'window-closed', remoteSha: '', detail: `空输出=窗口态，不判不一致（${detail}）` }
  }
  if (remoteSha === expectedSha) {
    return { kind: 'ok', remoteSha, detail: `终态一致: ${remoteSha.slice(0, 12)}` }
  }
  return { kind: 'unknown', remoteSha, detail: `未识别探针形态——交钩子诊断（${detail}）` }
}

/** 从 `sha\tref` 形态输出提取远端 sha（ls-remote stdout 首段）。 */
export function extractRemoteSha(stdout) {
  const m = /^([0-9a-f]{40})\b/.exec(String(stdout ?? '').trim())
  return m ? m[1] : ''
}

/** 指数退避：第 n 轮（1 起）等待毫秒数，封顶 maxMs。 */
export function backoffMs(round, baseMs = 25_000, maxMs = 120_000) {
  const v = baseMs * 2 ** Math.max(0, round - 1)
  return Math.min(Number.isFinite(v) ? v : maxMs, maxMs)
}

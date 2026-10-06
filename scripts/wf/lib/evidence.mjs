// scripts/wf/lib/evidence.mjs — WF-1 层 3：失败证据包构造（纯函数，单一真源）。
// 事故来源：docs/wf-incident-catalog.md A（journal 重放——重入判定要有 live 态）/ D4（作用域边界）。
// 证据包=钩子诊断员的唯一输入：现场够全（失败本体+git live 快照+已试策略），
// 让"主 agent 的 amend 周期从重新考古变读包直修"（拍板 3 降级形态的价值承诺）。
// 纯 JSON 可序列化（dynamic-workflows report()/ask() 通道约束），不含时间戳（确定性）。
//
// 组装器内联本文件进 .dwf.ts 并以 `[wf:lib:evidence]` 锚标记。

/**
 * @param {{ phase: string, kind: 'world-run'|'assert'|'agent', subject?: string, args?: string[],
 *           exitCode?: number, stdout?: string, stderr?: string, message?: string }} failure
 *        phase 失败本体（world-run=命令失败；assert=脚本断言；agent=诊断员结论异常）
 * @param {{ headSha?: string, dirty?: string[], remoteSha?: string, remoteOk?: boolean,
 *           rounds?: number, strategiesTried?: string[] }} live  git live 态快照（脚本侧 world.run 已取）
 * @returns {object} 证据包（JSON-serializable，确定性：无时间戳/无随机）
 */
export function buildEvidencePack(failure, live = {}) {
  const clip = (s, n) => String(s ?? '').slice(0, n)
  const failureOut = {
    phase: clip(failure?.phase, 80),
    kind: String(failure?.kind ?? 'unknown'),
    subject: clip(failure?.subject, 200),
    exitCode: failure?.exitCode,
    stdoutTail: clip(failure?.stdout, 2000),
    stderrTail: clip(failure?.stderr, 2000),
    message: clip(failure?.message, 500),
    ...(Array.isArray(failure?.args) ? { args: failure.args.map((a) => clip(a, 300)) } : {}),
  }
  const liveOut = {
    headSha: clip(live?.headSha, 40) || null,
    dirty: Array.isArray(live?.dirty) ? live.dirty.slice(0, 40) : [],
    remoteSha: clip(live?.remoteSha, 40) || null,
    remoteOk: Boolean(live?.remoteOk),
    rounds: Number(live?.rounds ?? 0),
    strategiesTried: Array.isArray(live?.strategiesTried) ? live.strategiesTried.slice(0, 6) : [],
  }
  return {
    wf: 'evidence-pack/v1',
    failure: failureOut,
    live: liveOut,
    discipline: {
      scope: '诊断与策略选择仅限预声明策略表（S1 等窗重试/S2 重跑 manifest 门/S3 停下留证）',
      forbidden: '不得修改文件；不得执行 git commit/push；不得绕过 Mimosa L3 门；零钩子禁用旗标（AGENTS.md 17）；超出策略表=选 S3',
    },
  }
}

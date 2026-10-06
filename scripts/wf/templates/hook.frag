// WF-1 层 3 钩子片段（agent 原生形态 + evidence-only 降级；诊断员策略表封闭）
// [wf:hook-contract] 诊断员 persona 必含 L3/scope/策略表约束（lint R13 校验生成物）
async function collectLive(phase: string, message: string, round: number) {
  const head = await world.run("git", ["-C", repo, "rev-parse", "HEAD"]).catch(() => ({ exitCode: -1, stdout: "", stderr: "reject" }))
  const st = await world.run("git", ["-C", repo, "-c", "core.quotePath=false", "status", "--porcelain=v1"]).catch(() => ({ exitCode: -1, stdout: "", stderr: "reject" }))
  const rf = await world.run("git", ["-C", repo, "ls-remote", "origin", "refs/heads/main"], { timeoutMs: 30000 }).catch(() => ({ exitCode: -1, stdout: "", stderr: "reject" }))
  const pack = buildEvidencePack({ phase, kind: "world-run", message }, {
    headSha: head.stdout.trim(), dirty: st.stdout.split("\n").map((l) => l.slice(3).trim()).filter(Boolean),
    remoteSha: extractRemoteSha(rf.stdout), remoteOk: rf.exitCode === 0, rounds: round, strategiesTried: [],
  })
  report(pack) // 证据包入 run Results——失败也送达
  return pack
}
async function hookDiagnose(phase: string, pack: any) {
  if (HOOK_MODE !== "agent") return { strategy: "S3", reason: "evidence-only 降级（拍板 3）：证据包已归集，主 agent 读包直修" }
  const doctor = agent("诊断员", {
    system: `你是落库工作流的失败诊断员（${BATCH_LABEL}）。纪律红线（违反=批止损）：只做诊断与策略选择；不得修改任何文件；不得执行 git commit/push；不得绕过 Mimosa L3 门；零钩子禁用旗标（AGENTS.md 17 对你的动作同样生效）；本工作流绝不碰清单：${FORBIDDEN}。只能从预声明策略表选一项：S1=等窗重试（仅推送/终态相的窗口态失败——连接失败/空输出/超时，绝不判不一致）；S2=重跑 manifest 四道闸（仅落库/manifest 相失败）；S3=停下留证（一切结构不明/越界/超预算失败）。`,
  })
  const verdict = await doctor.ask(`失败证据包（JSON）：\n${JSON.stringify(pack)}\n\n只输出 JSON：{"strategy":"S1|S2|S3","reason":"一句话"}。证据不足或策略不合法一律 S3。`)
  const m = /"strategy"\s*:\s*"(S[123])"/.exec(String(verdict))
  if (!m) return { strategy: "S3", reason: `诊断员答复无合法策略→停下留证（原话: ${String(verdict).slice(0, 160)}）` }
  return { strategy: m[1], reason: String(verdict).slice(0, 300) }
}
async function withHook(phaseName: string, allowedStrategies: string[], fn: (round: number) => Promise<void>) {
  for (let round = 1; round <= 1 + MAX_REPAIR_ROUNDS; round++) {
    try {
      await fn(round)
      return
    } catch (e: any) {
      const message = String(e?.message ?? e)
      const pack = await collectLive(phaseName, message, round)
      const verdict = await hookDiagnose(phaseName, pack)
      const allowed = allowedStrategies.includes(verdict.strategy)
      log(`[hook:${phaseName}] 第${round}轮失败 → ${verdict.strategy}${allowed ? "" : "(越表→按 S3)"}: ${verdict.reason}`)
      if (!allowed) verdict.strategy = "S3"
      if (verdict.strategy === "S3" || round > MAX_REPAIR_ROUNDS) {
        throw new Error(`[hook-stop] ${phaseName}: ${verdict.reason}（证据包已入 Results——读包直修，勿重新考古）`)
      }
      const anc = await world.run("git", ["-C", repo, "merge-base", "--is-ancestor", baseSha, "HEAD"])
      if (anc.exitCode !== 0) throw new Error(`[hook] 漂移守卫失败（祖先检查不过）——停下`)
      log(`[hook:${phaseName}] 漂移守卫通过 → 自修正第 ${round}/${MAX_REPAIR_ROUNDS} 轮重入（${verdict.strategy}）`)
    }
  }
}

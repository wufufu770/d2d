// WF-1 层 1+4 推送模板（curl 快探针=窗开快判[避免烧 21s git 超时]→慢探针→merge-base 守卫→指数退避）
// 事故来源：catalog C（盲推）；分类器 [wf:lib:probe-classify] 由层 4 提供
phase("推送 main（快探针+分类+退避）")
let pushed = false
let pushErr = ""
for (let round = 1; round <= __MAX_PUSH_ROUNDS__ && !pushed; round++) {
  let fail = false
  const w = await world.run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "10", "https://github.com"], { timeoutMs: 20000 })
  const wc = classifyProbeFailure(w, { expectedSha: null })
  let p1: any = null
  if (wc.kind === "ok") {
    p1 = await world.run("git", ["-C", repo, "ls-remote", "--heads", "origin", "main"], { timeoutMs: 60000 })
    if (p1.exitCode !== 0) { pushErr = `第${round}轮慢探针失败: ${p1.stderr.slice(0, 200)}`; fail = true }
  } else { pushErr = `第${round}轮快探针: ${wc.detail}`; fail = true }
  if (!fail) {
    const remote1 = extractRemoteSha(p1.stdout)
    const anc = await world.run("git", ["-C", repo, "merge-base", "--is-ancestor", remote1, "HEAD"])
    if (anc.exitCode !== 0) throw new Error(`远端漂移——止损（remote=${remote1.slice(0, 12)} 非 HEAD 祖先）`)
    if (remote1 === newSha) { pushed = true; log("远端已是目标态（幂等）") } else {
      const push = await world.run("git", ["-C", repo, "push", "origin", "refs/heads/main:refs/heads/main"], { timeoutMs: 180000 })
      if (push.exitCode === 0) { pushed = true; log(`第${round}轮 push 成功`) } else { pushErr = `第${round}轮 push 失败: ${push.stderr.slice(0, 300)}`; fail = true }
    }
  }
  if (fail) { log(pushErr); await world.run("sleep", [String(Math.round(backoffMs(round) / 1000))]) }
}
if (!pushed) throw new Error(`__MAX_PUSH_ROUNDS__ 轮未推成——末次错误: ${pushErr}`)

phase("终态核验（分类器：确定性失配才判负——catalog E）")
let terminalOk = false
for (let attempt = 1; attempt <= __MAX_TERMINAL_ATTEMPTS__ && !terminalOk; attempt++) {
  const rf = await world.run("git", ["-C", repo, "ls-remote", "origin", "refs/heads/main"], { timeoutMs: 60000 })
  const v = classifyProbeFailure(rf, { expectedSha: newSha })
  log(`终态探针第${attempt}次: [${v.kind}] ${v.detail}`)
  if (v.kind === "ok") { terminalOk = true; break }
  if (v.kind === "mismatch") throw new Error(`终态确定性失配——止损: ${v.detail}`)
  await world.run("sleep", [String(Math.round(backoffMs(attempt, 30000, 90000) / 1000))])
}
if (!terminalOk) throw new Error(`终态 __MAX_TERMINAL_ATTEMPTS__ 次未证实一致——停下留证（不判不一致）`)
log(`终态一致: remote==local==${newSha.slice(0, 12)}`)

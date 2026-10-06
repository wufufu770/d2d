// WF-1 层 1 newsha 片段（落库终态快照+工作树净核验+工作树口径全检——push 相与 report 共用）
const newSha = (await world.run("git", ["-C", repo, "rev-parse", "HEAD^{commit}"])).stdout.trim()
const cleanNow = await world.run("git", ["-C", repo, "status", "--porcelain=v1", "--untracked-files=all"])
if (cleanNow.stdout.trim() !== "") throw new Error(`落库后工作树不净: ${cleanNow.stdout.slice(0, 300)}`)
// 收口后工作树口径全检（AGENTS 16② 原语义——树净态下 index/工作树/HEAD 三面一致）
const finalVerify = await world.run("bash", ["-lc", `cd ${repo} && sha256sum -c manifest.sha256 2>/dev/null | grep -cv ': OK$'; true`])
if (finalVerify.stdout.trim() !== "0") throw new Error(`收口工作树自校验未全 OK: ${finalVerify.stdout.trim()}`)
log(`落库完成：HEAD=${newSha.slice(0, 12)}（工作树净+manifest 收口全检 OK）`)

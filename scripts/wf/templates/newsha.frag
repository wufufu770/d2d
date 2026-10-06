// WF-1 层 1 newsha 片段（落库终态快照+工作树净核验——push 相与 report 共用）
const newSha = (await world.run("git", ["-C", repo, "rev-parse", "HEAD^{commit}"])).stdout.trim()
const cleanNow = await world.run("git", ["-C", repo, "status", "--porcelain=v1", "--untracked-files=all"])
if (cleanNow.stdout.trim() !== "") throw new Error(`落库后工作树不净: ${cleanNow.stdout.slice(0, 300)}`)
log(`落库完成：HEAD=${newSha.slice(0, 12)}`)

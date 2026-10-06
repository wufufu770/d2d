// WF-1 层 1 前置核验模板（首发/重入双态——catalog D4：止损条件不得与重入场景冲突）
phase("前置核验（首发/重入双态判定）")
const anc0 = await world.run("git", ["-C", repo, "merge-base", "--is-ancestor", baseSha, "HEAD"])
if (anc0.exitCode !== 0) throw new Error(`HEAD 非基线 ${baseSha.slice(0, 12)} 后代（状态漂移，止损）`)
const families = __FAMILIES_JSON__ as { subject: string; body: string; paths: string[] }[]
const stAll = await world.run("git", ["-C", repo, "-c", "core.quotePath=false", "status", "--porcelain=v1", "--untracked-files=all"])
if (stAll.exitCode !== 0) throw new Error("git status 失败")
const dirty = stAll.stdout.split("\n").map((l) => l.slice(3).trim()).filter(Boolean).sort()
const whitelist = [...families.flatMap((f) => f.paths), "manifest.sha256"].sort()
const outside = dirty.filter((p) => !whitelist.includes(p))
if (outside.length > 0) throw new Error(`工作树含预期外改动（止损）: ${outside.join(", ")}`)
const logNow = await world.run("git", ["-C", repo, "log", "--format=%s", "-12"])
const allLanded = families.length > 0 && families.every((f) => logNow.stdout.split("\n").includes(f.subject))
let reentry = false
if (dirty.length === 0) {
  if (!allLanded) throw new Error("工作树净且各族未全在历史——无可落库内容（首发场景止损）")
  reentry = true
  log("工作树净且各族已在历史——重入推送场景（跳过落库相）")
} else {
  if (allLanded) throw new Error("各族已在历史但工作树又脏——重入态出现新改动（止损，须人工裁决）")
  const prodDiff = await world.run("git", ["-C", repo, "diff", "--stat", "--", ...__PROD_DIFF_PATHS__])
  if (prodDiff.stdout.trim() !== "") throw new Error(`生产面出现 diff（红线止损）: ${prodDiff.stdout.slice(0, 200)}`)
  log(`首发落库场景：脏文件 ${dirty.length}（白名单内），生产面零 diff`)
}

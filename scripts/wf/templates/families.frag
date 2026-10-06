// WF-1 层 1 按族落库模板（__FOLD_MANIFEST__：fold=regen 并入同族 commit（树-清单自洽，消解 manifest-only 笔）；sep=独立 regen 笔）
phase("按族落库（__FOLD_LABEL__）")
for (const [i, f] of families.entries()) {
  const st = await world.run("git", ["-C", repo, "status", "--porcelain=v1", "--untracked-files=all", "--", ...f.paths])
  if (st.stdout.trim() === "") { log(`族 ${i + 1}/${families.length} 干净（幂等跳过）：${f.subject}`); continue }
  const add = await world.run("git", ["-C", repo, "add", "--", ...f.paths])
  if (add.exitCode !== 0) throw new Error(`add 族${i + 1} 失败: ${(add.stderr || add.stdout).slice(0, 300)}`)
  if (__FOLD_MANIFEST__) await manifestGates(`族 ${i + 1}/${families.length} fold:`, f.paths)
  const c = await world.run("git", ["-C", repo, "commit", "-m", f.subject, "-m", f.body])
  if (c.exitCode !== 0) throw new Error(`commit 族${i + 1} 失败: ${(c.stderr || c.stdout).slice(0, 400)}`)
  log(`族 ${i + 1}/${families.length} 落库（${__FOLD_MANIFEST__ ? "fold manifest，树-清单自洽" : "独立 manifest 笔待收口"}）：${f.subject}`)
}
if (!__FOLD_MANIFEST__) {
  phase("manifest regen（独立笔——AGENTS 16② 全序）")
  await manifestGates("独立 regen:")
  const already = await world.run("git", ["-C", repo, "status", "--porcelain=v1", "--", "manifest.sha256"])
  if (already.stdout.trim() !== "") {
    const c = await world.run("git", ["-C", repo, "commit", "-m", "chore: manifest regen（__BATCH__ 收口）"])
    if (c.exitCode !== 0) throw new Error(`commit manifest 失败: ${(c.stderr || c.stdout).slice(0, 400)}`)
    log("manifest regen 独立笔落库")
  } else {
    log("manifest 干净（幂等跳过）")
  }
}

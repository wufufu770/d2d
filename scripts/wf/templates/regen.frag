// WF-1 层 1 manifest regen 模板（四道闸全序焊死：add -A → regen → re-add → 自校验 → 全集核对）
// 事故来源：catalog D2（漏 re-add）/ D3（漏 add -A）/ D1（grep -c 判据）/ B2（--quiet 禁用）
// pathspec 语义：fold 模式传族路径=限定暂存面（后续族的 untracked 不入本笔）；缺省=全局（AGENTS 16② 保守口径）
const regenCode = `
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), crypto = require('node:crypto');
process.chdir('__REPO__');
const files = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files'], { encoding: 'utf8' })
  .split('\\n').filter(Boolean).filter((f) => f !== 'manifest.sha256');
const lines = files.sort().map((f) => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') + '  ' + f);
const old = fs.readFileSync('manifest.sha256', 'utf8').split('\\n');
const ai = old.findIndex((l) => l.startsWith('# --- node_modules (@deepseek-ai/* pinned packages, verify locally) ---'));
if (ai < 0) throw new Error('anchor marker not found');
fs.writeFileSync('manifest.sha256', lines.join('\\n') + '\\n' + old.slice(ai).join('\\n'));
console.log('regen entries=' + lines.length);
`
// manifestGates：四道闸一次执行（幂等可重入——S2 策略的重放目标）
async function manifestGates(label: string, pathspec?: string[]) {
  if (!pathspec) {
    const stPre = await world.run("git", ["-C", repo, "status", "--porcelain=v1", "--untracked-files=all"])
    const untracked = stPre.stdout.split("\n").filter((l) => l.startsWith("??")).length
    if (untracked > 0) throw new Error(`regen 前 untracked ${untracked} 项（AGENTS 16②——add -A 先行或人工裁决）`)
  }
  const addA = pathspec
    ? await world.run("git", ["-C", repo, "add", "-A", "--", ...pathspec, "manifest.sha256"])
    : await world.run("git", ["-C", repo, "add", "-A"])
  if (addA.exitCode !== 0) throw new Error(`add -A 失败`)
  const regen = await world.run("node", ["-e", regenCode])
  if (regen.exitCode !== 0) throw new Error(`regen 失败: ${regen.stderr.slice(0, 300)}`)
  log(`${label} ${regen.stdout.trim()}`)
  const readd = await world.run("git", ["-C", repo, "add", "manifest.sha256"])
  if (readd.exitCode !== 0) throw new Error(`re-add 失败`)
  const verify = await world.run("bash", ["-lc", `cd ${repo} && sha256sum -c manifest.sha256 2>/dev/null | grep -cv ': OK$'; true`])
  if (verify.stdout.trim() !== "0") throw new Error(`自校验未全 OK: ${verify.stdout.trim()}`)
  const full = await world.run("bash", ["-lc", `cd ${repo} && git -c core.quotePath=false ls-files --cached | grep -v -E '^manifest\\.sha256$' | sort -s | comm -23 - <(grep -oE '  .+$' manifest.sha256 | sed 's/^  //' | sort -s) | wc -l`])
  if (full.stdout.trim() !== "0") throw new Error(`全集核对缺口 ${full.stdout.trim()}`)
  return regen.stdout.trim()
}

// WF-1 层 1 manifest regen 模板（四道闸全序焊死：add -A → regen → re-add → 自校验 → 全集核对）
// 事故来源：catalog D2（漏 re-add）/ D3（漏 add -A）/ D1（grep -c 判据）/ B2（--quiet 禁用）
// WF-2 B5：regen 口径=**暂存面（index blob）**而非工作树——fold 多族时族 1 的 manifest 不再
// 卷入族 2+ 的脏文件新内容，"每笔树-清单自洽"对所有笔成立（git archive 口径可复测）。
// pathspec 语义：fold 传族路径=限定暂存面；缺省=全局（AGENTS 16② 保守口径）。
const regenCode = `
const { execFileSync } = require('node:child_process');
const fs = require('node:fs'), crypto = require('node:crypto');
process.chdir('__REPO__');
const files = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files'], { encoding: 'utf8' })
  .split('\\n').filter(Boolean).filter((f) => f !== 'manifest.sha256');
// B5: hash 取 index 版本（:file = stage-0 blob；已 add 的新文件在 index，未 add 的他族文件回落 HEAD）
const lines = files.sort().map((f) => {
  const blob = execFileSync('git', ['show', ':' + f], { maxBuffer: 2e8 });
  return crypto.createHash('sha256').update(blob).digest('hex') + '  ' + f;
});
const old = fs.readFileSync('manifest.sha256', 'utf8').split('\\n');
const ai = old.findIndex((l) => l.startsWith('# --- node_modules (@deepseek-ai/* pinned packages, verify locally) ---'));
if (ai < 0) throw new Error('anchor marker not found');
fs.writeFileSync('manifest.sha256', lines.join('\\n') + '\\n' + old.slice(ai).join('\\n'));
console.log('regen entries=' + lines.length);
`
// 独立重算 index 口径自校验（与 regenCode 不同代码路径——防写错；差异即 fail）
const verifyIndexCode = `
const { execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
process.chdir('__REPO__');
const manifest = require('node:fs').readFileSync('manifest.sha256', 'utf8').split('\\n');
const entries = new Map(manifest.filter((l) => l && !l.startsWith('#')).map((l) => { const i = l.indexOf('  '); return [l.slice(i + 2), l.slice(0, i)]; }));
const files = execFileSync('git', ['-c', 'core.quotePath=false', 'ls-files'], { encoding: 'utf8' }).split('\\n').filter(Boolean).filter((f) => f !== 'manifest.sha256');
for (const f of files) {
  const h = crypto.createHash('sha256').update(execFileSync('git', ['show', ':' + f], { maxBuffer: 2e8 })).digest('hex');
  if (entries.get(f) !== h) { console.error('INDEX MISMATCH: ' + f); process.exit(1); }
  entries.delete(f);
}
if (entries.size) { console.error('MANIFEST EXTRA: ' + [...entries.keys()].join(',')); process.exit(1); }
console.log('index-verify OK (' + files.length + ' files)');
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
  if (addA.exitCode !== 0) throw new Error(`add -A 失败: ${(addA.stderr || addA.stdout).slice(0, 300)}`)
  const regen = await world.run("node", ["-e", regenCode])
  if (regen.exitCode !== 0) throw new Error(`regen 失败: ${regen.stderr.slice(0, 300)}`)
  log(`${label} ${regen.stdout.trim()}`)
  const readd = await world.run("git", ["-C", repo, "add", "manifest.sha256"])
  if (readd.exitCode !== 0) throw new Error(`re-add 失败`)
  // WF-2 B5 配套：自校验与 regen 同口径（index blob）——fold 中间笔的工作树含未落库他族内容，
  // 工作树口径（sha256sum -c）必炸（真实事故：WF-2 落库自校验 7 FAILED，钩子 3 轮止损定位）。
  // 独立重算=防 regen 代码写错；收口后工作树口径全检在 newsha.frag（树净态）。
  const verify = await world.run("node", ["-e", verifyIndexCode])
  if (verify.exitCode !== 0) throw new Error(`自校验(index 口径)未全 OK: ${verify.stderr.slice(0, 300)}`)
  const full = await world.run("bash", ["-lc", `cd ${repo} && git -c core.quotePath=false ls-files --cached | grep -v -E '^manifest\\.sha256$' | sort -s | comm -23 - <(grep -oE '  .+$' manifest.sha256 | sed 's/^  //' | sort -s) | wc -l`])
  if (full.stdout.trim() !== "0") throw new Error(`全集核对缺口 ${full.stdout.trim()}`)
  return regen.stdout.trim()
}

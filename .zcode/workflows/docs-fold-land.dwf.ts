/* zcode-workflow
description: d2d docs/工程类笔落库工作流：stage→manifest 校验（V-16 前移，失配自动跟 regen
  笔）→内容笔+regen 笔拆族→push 443 恢复循环→CI 三绿盯守；支持重入（本地领先未推直进 push）
whenToUse: 任何 d2d 仓内容笔落库（docs 笔/工程笔）——R-02 manifest fold 内建的模板形态；替代无 fold 步的裸
  commit+push 编排
args:
  files:
    type: json
    description: 内容笔要 stage 的仓库相对路径数组（新文件必须在内——fold 校验读 git 索引）
    required: true
  message:
    type: string
    description: 内容笔 commit message
    required: true
  regenMessage:
    type: string
    description: manifest regen 笔 message；缺省由内容笔 message 派生
    required: false
*/
interface GhRun {
  headSha: string;
  workflowName: string;
  status: string;
  conclusion: string | null;
}
interface LandReport {
  conclusion: string;
  findings: { where: string; what: string; evidence: string; status: "verified" | "unconfirmed"; severity: "low" | "medium" | "high" }[];
  verified: string[];
  notCovered: string[];
}
const REPO = "/home/kali/d2d";
const G = ["-C", REPO];
const files = (Array.isArray(args.files) ? args.files : []).map(String);
const message = String(args.message ?? "");
const regenMessage = String(args.regenMessage ?? `chore: manifest regen（自动 fold——${message.slice(0, 48)}）`);
const WORKFLOWS = ["ci", "gates", "dsh-compat"];

phase("重入检测（本地领先未推且工作树净=前轮已落库）");
const aheadPre = await world.run("git", [...G, "rev-list", "--count", "origin/main..HEAD"]);
const statusPre = await world.run("git", [...G, "status", "--porcelain"]);
const reentry = aheadPre.exitCode === 0 && Number(aheadPre.stdout.trim() || "0") > 0 && statusPre.stdout.trim() === "";
let folded = false;
if (files.length === 0 || message.length === 0) {
  return {
    conclusion: "docs-fold-land 未执行：args.files 或 args.message 为空。",
    findings: [{ where: "args", what: "files/message 缺失", evidence: `files=${JSON.stringify(args.files)} message=${message.slice(0, 60)}`, status: "verified", severity: "high" }],
    verified: [],
    notCovered: ["落库全链"],
  };
}
if (!reentry) {
  phase("校验 manifest 并按需 fold（V-16 前移到提交时）");
  await world.run("git", [...G, "add", "--", ...files]);
  const chk = await world.run("node", [`${REPO}/scripts/ops/manifest-regen.mjs`, "--check"]);
  if (chk.exitCode !== 0) {
    log("manifest 失配——自动跟 regen（fold 步生效）");
    const w = await world.run("node", [`${REPO}/scripts/ops/manifest-regen.mjs`, "--write"]);
    if (w.exitCode !== 0) {
      return {
        conclusion: "docs-fold-land 止损：manifest --write 失败（异常态），未提交未推。",
        findings: [{ where: "scripts/ops/manifest-regen.mjs", what: "--write 自校验失败", evidence: (w.stderr || w.stdout).slice(0, 1200), status: "verified", severity: "high" }],
        verified: ["node manifest-regen.mjs --check/--write"],
        notCovered: ["内容笔/regen 笔/push/CI"],
      };
    }
    await world.run("git", [...G, "add", "manifest.sha256"]);
    const mStaged = await world.run("git", [...G, "diff", "--cached", "--name-only"]);
    if (mStaged.stdout.split("\n").map((s) => s.trim()).includes("manifest.sha256")) {
      folded = true;
    } else {
      log("fold 后 manifest 无实际差异（他族脏文件所致的 --check 失配）——零冗余 regen 笔");
    }
  } else {
    const stagedNow = await world.run("git", [...G, "diff", "--cached", "--name-only"]);
    if (stagedNow.stdout.split("\n").map((s) => s.trim()).includes("manifest.sha256")) {
      log("manifest 已在暂存（前序 fold 遗留）——regen 笔照跟");
      folded = true;
    } else {
      log("manifest 校验通过——本笔不影响 manifest，零冗余 regen 笔");
    }
  }

  phase("落内容笔");
  // pathspec 提交：内容笔只含 args.files——fold 的 manifest 留在暂存给 regen 笔（成对不互卷）
  const staged = await world.run("git", [...G, "diff", "--cached", "--name-only"]);
  log(`暂存：${staged.stdout.trim().split("\n").join("、")}`);
  let c1 = await world.run("git", [...G, "commit", "-m", message, "--", ...files]);
  if (c1.exitCode !== 0) {
    log("内容笔首试被拦——按附则 A 间隔重试一发即判");
    await world.run("sleep", ["20"]);
    c1 = await world.run("git", [...G, "commit", "-m", message, "--", ...files]);
  }
  if (c1.exitCode !== 0) {
    return {
      conclusion: "docs-fold-land 止损：内容笔 commit 两次被拦（升级止损），暂存未动、远端未触碰。",
      findings: [{ where: "git commit", what: "内容笔两试未过", evidence: (c1.stderr || c1.stdout).slice(0, 1500), status: "verified", severity: "high" }],
      verified: ["git commit ×2（间隔 20s）"],
      notCovered: folded ? ["regen 笔/push/CI——升级止损未执行"] : ["push/CI——升级止损未执行"],
    };
  }

  phase("落 regen 笔（仅当 fold 已触发）");
  if (folded) {
    const c2 = await world.run("git", [...G, "commit", "-m", regenMessage, "--", "manifest.sha256"]);
    if (c2.exitCode !== 0) {
      await world.run("sleep", ["20"]);
      const c2b = await world.run("git", [...G, "commit", "-m", regenMessage, "--", "manifest.sha256"]);
      if (c2b.exitCode !== 0) {
        return {
          conclusion: "docs-fold-land 部分落库：内容笔已成，regen 笔两次被拦——push 暂缓（远端不含 manifest fold，V-16 会在 CI 失败）。",
          findings: [{ where: "git commit", what: "regen 笔两试未过", evidence: (c2b.stderr || c2b.stdout).slice(0, 1500), status: "verified", severity: "high" }],
          verified: ["内容笔 commit 成", "git commit ×2（间隔 20s）"],
          notCovered: ["push/CI"],
        };
      }
    }
  }
  log(`落库完成（fold=${folded ? "regen 笔已跟" : "零冗余"}）`);
} else {
  log(`重入：本地领先远端 ${aheadPre.stdout.trim()} 笔且工作树净——跳过 commit 直进 push`);
}

const tip = await world.run("git", [...G, "rev-parse", "--short", "HEAD"]);

phase("推送 main（443 恢复循环——固化模式 90s×30，恢复即推）");
let p = await world.run("git", [...G, "push", "origin", "main"]);
for (let round = 1; p.exitCode !== 0 && round <= 30; round++) {
  log(`push 未过，第 ${round} 轮：90s 后探 443，恢复即重推（固化模式）`);
  await world.run("sleep", ["90"]);
  const probe = await world.run("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "--max-time", "15", "https://github.com/"]);
  if (probe.stdout.trim() !== "000" && probe.exitCode === 0) {
    p = await world.run("git", [...G, "push", "origin", "main"]);
  }
}
if (p.exitCode !== 0) {
  return {
    conclusion: `docs-fold-land 部分落库：两笔在本地（tip=${tip.stdout.trim()}），push 443 循环 30 轮未过——远端未动，一条 push 可解锁。`,
    findings: [{ where: "git push", what: "push 循环未过", evidence: (p.stderr || p.stdout).slice(0, 1500), status: "verified", severity: "high" }],
    verified: [`tip=${tip.stdout.trim()}`, "git push + 443 探测循环 30 轮"],
    notCovered: ["CI 盯守——远端无新提交"],
  };
}

phase("盯 CI 三 workflow 至终态");
const shaFull = (await world.run("git", [...G, "rev-parse", "HEAD"])).stdout.trim();
log(`盯守 ${shaFull.slice(0, 7)} 的 ci/gates/dsh-compat 至终态`);
let settled = false;
let failed: GhRun[] = [];
for (let round = 1; round <= 24; round++) {
  const ls = await world.run("gh", ["run", "list", "--branch", "main", "--limit", "10", "--json", "headSha,workflowName,status,conclusion"]);
  if (ls.exitCode === 0) {
    const runs = JSON.parse(ls.stdout) as GhRun[];
    const mine = runs.filter((r) => r.headSha === shaFull);
    const latest: Record<string, GhRun | undefined> = {};
    for (const r of mine) if (latest[r.workflowName] === undefined) latest[r.workflowName] = r;
    const pending = WORKFLOWS.filter((w) => latest[w] === undefined || latest[w]!.status !== "completed");
    if (pending.length === 0) {
      failed = WORKFLOWS
        .map((w) => latest[w])
        .filter((r): r is GhRun => r !== undefined && r.conclusion !== "success");
      settled = true;
      break;
    }
    if (round % 4 === 1) log(`第 ${round} 轮：未终态 ${pending.join("、")}`);
  }
  await world.run("sleep", ["30"]);
}
if (!settled) {
  return {
    conclusion: `docs-fold-land 已推送（main=${shaFull.slice(0, 7)}），CI 12 分钟未全终态——数据无损，挂账观察（gh run list 可补）。`,
    findings: [],
    verified: [`远端 main=${shaFull.slice(0, 7)}（fold=${folded}）`, "gh run list 轮询 24 轮"],
    notCovered: ["CI 终态结论——超时未取得"],
  };
}
if (failed.length > 0) {
  return {
    conclusion: `docs-fold-land 已推送（main=${shaFull.slice(0, 7)}），CI 有失败：${failed.map((f) => `${f.workflowName}=${f.conclusion}`).join("、")}——须修复笔。`,
    findings: failed.map((f) => ({ where: f.workflowName, what: `CI ${f.conclusion}`, evidence: `gh run list: ${f.workflowName} ${f.status}/${f.conclusion} @ ${f.headSha.slice(0, 7)}`, status: "verified" as const, severity: "high" as const })),
    verified: [`远端 main=${shaFull.slice(0, 7)}`, "gh run list 终态读取"],
    notCovered: ["失败日志深挖——另起修复笔"],
  };
}
return {
  conclusion: `docs-fold-land 收官：内容笔${folded ? "+regen 笔" : "（零冗余，manifest 未失配）"}${reentry ? "（重入——前轮已落）" : ""}落库，push 过检，CI 三绿 @ main=${shaFull.slice(0, 7)}。`,
  findings: [],
  verified: [`远端 main=${shaFull.slice(0, 7)} 三 workflow 全 success`, `fold 步：${reentry ? "重入直进 push" : folded ? "--check 失配→--write+regen 笔" : "--check 通过→零冗余"}`],
  notCovered: [],
};

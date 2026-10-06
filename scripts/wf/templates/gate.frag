// WF-1/SC-1 gate 相（push 前机械检查 B 层结论——fail-closed：无结论/不达标=不推）
// 修法来源：WF-1 教训「push 前置 gate 时序滑坡——landing-push 合并形态须在 push 相前内置 gate 相」
phase("gate 相（B 层结论机械检查）")
const GATE_FILE = "__GATE_FILE__"
const GATE_EXPECT = "__GATE_EXPECT__"
let gateVerdict = ""
for (let gi = 1; gi <= __GATE_MAX_POLLS__ && !gateVerdict; gi++) {
  const gf = await world.run("bash", ["-lc", `test -f ${GATE_FILE} && cat ${GATE_FILE} || echo __GATE_MISSING__`])
  // WF-2 B6: 结论绑定目标 SHA——旧结论复用/跨批伪造双洞闭合（verdict 必须含本批落库后的 newSha）
  if (gf.exitCode === 0 && !gf.stdout.includes("__GATE_MISSING__") && gf.stdout.includes(GATE_EXPECT) && gf.stdout.includes("__BATCH__") && gf.stdout.includes(newSha)) {
    gateVerdict = gf.stdout.trim()
    break
  }
  if (gi === 1) log(`gate 相等待 B 层结论文件（${GATE_FILE}，期望含 ${GATE_EXPECT}+批标签+目标 SHA ${newSha.slice(0, 12)}）…`)
  await world.run("sleep", ["30"])
}
if (!gateVerdict) throw new Error(`[gate] B 层结论未达/不达标（__GATE_MAX_POLLS__ 次轮询，期望 ${GATE_EXPECT}+批标签+目标 SHA）——fail-closed 不推（B 层复核未完成或 FAIL）`)
log(`gate 相通过：${gateVerdict.split("\n")[0].slice(0, 160)}`)

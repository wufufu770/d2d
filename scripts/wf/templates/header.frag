// WF-1 层 1 模板库 —— header 片段（组装器做标记替换；${} 原样透传给生成脚本运行时）
// WF __BATCH__ —— scripts/wf/assemble.mjs 组装产物（层 1 模板库；手写脚本=模板组装+批参数）
interface WorkflowReport {
  conclusion: string;
  findings: { where: string; what: string; evidence: string; status: "verified" | "unconfirmed"; severity: "low" | "medium" | "high" }[];
  verified: string[];
  notCovered: string[];
}
const repo = "__REPO__"
const baseSha = "__BASE_SHA__"
const BATCH_LABEL = "__BATCH__"
const FORBIDDEN = "__FORBIDDEN__"
const HOOK_MODE = "__HOOK_MODE__" // agent=层3原生 | evidence-only=拍板3降级
const MAX_REPAIR_ROUNDS = 2
/*__LIB_PROBE__*/
/*__LIB_EVIDENCE__*/

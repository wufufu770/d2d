// WF-1 层 1 收束片段（WorkflowReport 组装——evidence pack 已由 hook report() 送达）
const result: WorkflowReport = {
  conclusion: `__BATCH__ 完成（WF-1 模板组装产物，hook=__HOOK_MODE__）：HEAD ${newSha.slice(0, 12)}（基线 ${baseSha.slice(0, 12)} + __FOLD_LABEL__），__REPORT_TAIL__。`,
  findings: [],
  verified: ["模板 manifest 四道闸全序+推送 curl 快探针/分类/退避+merge-base 祖先守卫+终态分类核验（确定性失配才判负）"],
  notCovered: ["CI 终态由主 agent 观察"],
}
return result

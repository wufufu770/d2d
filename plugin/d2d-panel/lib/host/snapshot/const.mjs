// snapshot/const.js — 快照常量与纯工具(拆分自 snapshot.mjs: 10-27 + 212-242, 逻辑零改动)
// 数据流: graphd /query(host token 合法读通道) → 一条聚合 JSON → 浏览器
// 字段名与 graphd schema 逐字对齐; 七态与 app.py FINDING_STATES 一致。

export const FINDING_STATES = ['candidate', 'triaged', 'verified', 'isolated', 'reported', 'accepted', 'rejected', 'needs-scope']
export const MACRO_GROUPS = [
  { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
  { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
  { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
  { key: 'needs-scope', label: '边界待澄清', states: ['needs-scope'] },
  { key: 'rejected', label: '已驳回', states: ['rejected'] },
]
// E41-A1: 30s→90s — 调度器心跳 touch 周期 20s(P2P_WORKER_HEARTBEAT_MS), 阈值须容 3+ 拍抖动;
// 旧 30s 阈值下 identity 分钟级迁移节奏恒触发误标(LIVE 假 IDLE/在办假 0, 2026-11-17 运行时审计)。
// 硬杀检测窗仍 ≤90s(进程退出有 adapter finish() 兜底, 面板侧只是冗余安全网)。
export const ZOMBIE_MS = 90_000
export const MAX = { title: 200, scope: 200, target: 200, workers: 50, findings: 200, signals: 50, exp: 100, checkpoint: 400, todo: 400, traj: 400, digest: 160, usageLines: 2000, runLogLines: 400, sigEvidence: 0 }
// T3-3-2 收官批护栏(t3-3-plan §6 定稿): 文件尾读类路由全部 tail-N + 服务端钳位 —
// transition-log/audit.log 无轮转(transition_log.py/audit.py 只追加), 线性增长, 严禁整文件进热路径。
Object.assign(MAX, {
  sankeyLines: 20000, // 桑基: transition-log.jsonl 尾读上限(现量 1652 行/6 天, 上限≈一年量级)
  auditLines: 3000, // 审计时间线: audit.log 尾读上限
  auditTransLines: 2000, // 审计时间线: transition-log.jsonl 合并尾读上限
  toolLines: 600, // 工具调用明细: run-log 尾读上限(明细页比快照轨迹区 400 行略宽)
})

// ---------- 纯工具 ----------
export function cap(v, n) {
  const t = String(v ?? '')
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}
export function num(v) {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}
export function fnum(v, digits = 1) {
  const n = num(v)
  return Math.round(n * 10 ** digits) / 10 ** digits
}

/** 七态计数 → 4 宏观列(PANEL-UI-SPEC §4.4)。未知态忽略。 */
export function groupStates(byState) {
  const out = {}
  for (const g of MACRO_GROUPS) out[g.key] = g.states.reduce((a, s) => a + num(byState?.[s]), 0)
  return out
}

/** worker 心跳 → 前端可复用的 zombie 判定(PANEL-UI-SPEC §4.6: 纯时钟, >30s)。
 *  ageMs = -1 表示无心跳时间戳(不判 zombie, 视图按未知渲染)。 */
export function markZombie(agents, nowMs) {
  return (agents ?? []).map((a) => {
    const ts = Date.parse(String(a.updated_at ?? '')) || 0
    const ageMs = ts ? Math.max(0, nowMs - ts) : -1
    const running = String(a.status ?? '') === 'running'
    return { ...a, ageMs, zombie: running && ageMs > ZOMBIE_MS }
  })
}

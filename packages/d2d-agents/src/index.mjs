// @wufufu770/d2d-agents — 薄包装: 转发 plugin/pentest-dsh 的 adapter 导出, 零复制。
export { createInProcessAdapter, inprocessWorkerToken } from '../../../plugin/pentest-dsh/adapter-inprocess.mjs'
import { CAP_KINDS as _CAP_KINDS } from '../../../plugin/pentest-dsh/domain/caps.mjs'
export const CAP_KINDS = _CAP_KINDS

export const AGENT_MODEL = {
  rings: ['outer-recon', 'middle-deep-dive', 'inner-verify'],
  capacityKinds: [...CAP_KINDS],
  totalAgents: 12,
}
export { createTaskTool } from '../../../plugin/pentest-dsh/domain/task-tool.mjs'

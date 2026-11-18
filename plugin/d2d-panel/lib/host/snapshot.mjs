// snapshot.mjs — 快照聚合 barrel(E40-D1 拆分: 单体 1415 行 → lib/host/snapshot/ 职责单一模块)
// 语义零改动: 本文件只做 re-export —— `from './snapshot.mjs'` 的既有导入路径(index.mjs/
// standalone.mjs/test/*.mjs)零改动, 每个名字的行为与拆分前逐字一致。
// 模块地图(依赖序):
//   const          常量/纯工具(零依赖)
//   queries        Cypher 常量(← const)
//   viz-data       viz 三图数据面(← const)
//   graphd-client  graphd 客户端/写代理(零内依赖)
//   caps           容量热调(零内依赖)
//   fleet          模型策略/dsh 目录/策略库(零内依赖)
//   runs-cost      运行事件/token 账本/性价比/转化率(← const)
//   flows-audit    桑基/审计/工具调用/链路/前沿池/配置总览(← const/queries/viz-data)
//   engagement     选中/项目投影/快照聚合(← 全部)
//   xring          X-Ring 只读聚合(← const)

export * from './snapshot/const.mjs'
export * from './snapshot/queries.mjs'
export * from './snapshot/viz-data.mjs'
export * from './snapshot/graphd-client.mjs'
export * from './snapshot/caps.mjs'
export * from './snapshot/fleet.mjs'
export * from './snapshot/runs-cost.mjs'
export * from './snapshot/flows-audit.mjs'
export * from './snapshot/engagement.mjs'
export * from './snapshot/xring.mjs'

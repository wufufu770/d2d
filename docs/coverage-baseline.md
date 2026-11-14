# 覆盖率基线（E39-B1-2 建立口径：`npm run test:cover`，c8/V8 插桩）

> 采集时点：2026-11-14（1.7.2 批首跑）。范围=plugin/pentest-dsh mocha 全量
> （`npx mocha "test/*.test.mjs"` CI 同款，2245+2 pending）。**c8 只覆盖 JS 轨**——
> graphd Python 轨的 pytest-cov 未接入（后续批候选，本文件登记为已知边界）。
> 刷新方式：`cd plugin/pentest-dsh && npm run test:cover`，本文件随里程碑批手动更新。

## 总量基线

| 指标 | 基线值 |
|---|---|
| 行覆盖 | **90.19%**（16417/18201） |
| 分支覆盖 | **75.53%**（6193/8199） |
| 函数覆盖 | **93.64%**（913/975） |
| 文件数 | 95 |

## 低覆盖热点（补测优先级排序）

| 文件 | 行覆盖 | 备注 |
|---|---|---|
| index.js | 25.8% | 插件壳层（apply 装配+cmd 命令族+WorkItems 接线）——依赖宿主 ctx，单测难达；缺口集中在命令注册体与 env 分支 |
| scheduler/starmap-tick.mjs | 42.5% | 星图周期任务（E35 系落地）——无独立单测 |
| scheduler/state.mjs | 61.5% | 选中 engagement 文件态 |
| scheduler/experience-bridge.mjs | 61.7% | 经验桥 |
| scheduler/bias-block.mjs | 70.4% | 偏科闸 |
| scheduler/external-tools.mjs | 75.9% | 外部 MCP 工具族 |
| adapter-dsh.mjs | 77.6% | 进程外适配器（spawn 面——TRANSPORT 自愈 B2 落点，补测随批） |
| scheduler/lifecycle-ops.mjs | 78.5% | 生命周期编排 |

## 判读

- 总量 90%+ 属健康水位；**分支覆盖 75.5% 是短板**（env 分支/fail-closed 兜底路径天然难测）。
- index.js 25.8% 的结构原因：apply() 大装配体依赖宿主 ctx——与"插件壳层薄、领域层纯"的
  架构方向一致（领域逻辑已下沉 scheduler/ 与 domain/），补测性价比低，维持现状登记。
- 下一步候选：adapter-dsh.mjs 补测随 B2 TRANSPORT 自愈批顺带（改动面即补测面）。

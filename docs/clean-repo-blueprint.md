# d2d 清洁仓蓝图（WRAP-4a 族 2 · 阶段九"目录重组（参考 MiniMax Code 结构）"的执行设计）

> 性质=纸面提案（WRAP-4a 零结构操作）——执行归 WRAP-4b（判定后）。
> 架构定谳一致性自查：本蓝图不改变任何运行时形态（graphd/scheduler/插件入口零改动），
> 只重排仓库布局与文档面——与三条集成原则/验证语义两分零冲突（原则是代码资产，蓝图
> 是摆放方式）。
>
> **执行修正注记（WRAP-4b 结构相/发布相 · 2026-10-09）**：①§一删除候选中 `home/` ——
> 结构相实测保留（内容核实后判定为框架形态资产，非遗留）；②§一"docs 历史批次文档
> 40+→4-6"——执行修正为收缩式精简：删 1（t3-2-2b-acceptance.md，refs=0 唯一零引用）+
> 13 个活引用文档保留（断链风险>精简收益，终版收缩归执行相后段）；③§五"README 加
> 徽章"已达成（ci 徽章在位）。本文其余提案与结构相落地形态一致（保留布局=CI 零改动）。

## 一、目录结构提案（dsh 主体+d2d 能力库两形态）

```
d2d/（清洁仓根）
├── README.md               # 重写（大纲见 §二）
├── CHANGELOG.md            # 新建（骨架见 §三）
├── SECURITY.md             # 双语（唯一破例——阶段九原文指定）
├── docs/                   # 精简后文档（决策档案/架构/部署 runbook/合规）
│   ├── decision-archive.md # ← 本仓提炼的决策资产（原样迁移）
│   ├── architecture.md     # 三环架构+图 schema+状态机图（从 state.md 提炼）
│   ├── ops-runbook.md      # 部署/引擎切换/观察期（runbook 族合并）
│   └── compliance/         # 授权面/scope 语义/审计链说明
├── plugin/pentest-dsh/     # dsh 插件主体（不动内部结构——六类能力见 §四）
├── graphd/                 # 图服务（不动）
├── scripts/                # gateway/xring/ops/mcp（保留）
├── tests/                  # pytest 面（保留）
├── config/                 # 种子配置（mcp-export/policies example）
├── brain/                  # 知识脑种子（seed-cards/techniques/skill-samples）
└── .github/workflows/      # ci/gates/dsh-compat（保留三 workflow）
```

**删除候选**（执行相逐项核）：experiments/（实录归档后删或 archive tag 保留）、
home/（遗留目录——内容核实后删）、output/（产物目录——gitignore 化）、
ops/（与 scripts/ops 合并核查）、node_modules（本来就 ignore）、docs/ 历史批次文档
（40+ 文件→精简为 4-6 个，历史归 archive tag 不随迁）。

## 二、README 重写大纲
1. 一句话定位（保留现 README 第一段：三环并行自主渗透测试框架——已准确）
2. 架构图（三环+graphd 黑板+面板——ASCII/mermaid）
3. 快速开始（install.sh/依赖/双 token 初始化/DVWA 靶场自检）
4. 六类能力速览（§四映射表浓缩）
5. 安全模型（写面分级/scope 门/审计链/env 白名单——引用 decision-archive §二三）
6. X-Ring 受控自主（任务书契约/verifyRunner 语义两分/held 裁决）
7. 引擎与测试（双轨/CI 三 workflow/基线口径）
8. 合规声明（授权测试专用/红线资产 denylist/出口治理）

## 三、CHANGELOG 骨架（Keep a Changelog 形态）
- [1.0.0] — 首个公开发布（WRAP-4b 判定后打点）：
  Added：三环调度/graphd 图服务/六类能力/X-Ring 通道/观测面板/MCP server
  Security：写面分级/OPSEC 门族/egress 治理/worker env 白名单
  （历史 pre-1.0 不随迁——archive tag 承载）

## 四、六类能力→dsh 插件形态映射表（释放态统计排优先级）
| 能力类 | 现位置 | dsh 形态 | 优先级依据（四跑调用统计） |
|--------|--------|----------|--------------------------|
| 工具 | plugin/pentest-dsh/tools/（burp 族 6+js-scanner+osint） | dsh 工具注册（既有 T3-2-3 导出框架） | bash 主力（101-253/轮）——工具面按需注册非预载 |
| 策略 | plugin/pentest-dsh/domain/（37 文件纯函数） | 插件域模块（现状即插件形态——保留） | 判定面单一事实源（scope/write-gate/verify-verdicts） |
| skill | brain/seed/skill-samples+T3-2-2 技能抽取 | dsh skill 目录（既有三门通道） | 抽取管道在位，按实战产出增长 |
| 知识库 | brain/seed/（seed-cards 260 张+v0-techniques） | 插件知识种子（图内 ExperienceWeight+卡片库） | p2p_graph 15 次/轮=知识库首个真实使用 |
| loop | scheduler/loop.mjs 三环调度 | dsh 委托长任务形态（X-Ring 任务引擎定位） | 三环唤醒/预算/容量账本=调度核心资产 |
| MCP | scripts/mcp/d2d-mcp-server.mjs+config/ | 对外只读 stdio server（既有 T3-2-4） | 配置驱动发现+sanitize-ingest 链在位 |

**X-Ring 调度器定位**（拍板 4）：dsh 委托长任务形态——xring/（runner/monitor/reflow/
verify-runner/first-run）作为"受控长任务引擎"整体迁移，契约三 JSON+预算双路径+verify
分层为对外接口；不与 dsh 主 loop 合并（隔离边界=安全资产）。

## 五、minimax-code 标准对照表（阶段九"参考 MiniMax Code 结构"）
| 标准 | 现状 | 差距动作 |
|------|------|----------|
| README 完整（定位/安装/用法/安全） | 有但批次文档混入 | 重写（§二大纲） |
| CHANGELOG 规范 | 无 | 新建骨架（§三） |
| SECURITY.md | 无 | 双语新建（披露流程+支持范围+红线声明） |
| 目录语义清晰（src/tests/docs 分明） | 11 顶层目录含遗留 | §一提案重组 |
| CI 徽章+发布工作流 | 三 workflow 在位无徽章 | README 加徽章+npm publish workflow（发布清单） |
| 依赖声明单一来源 | requirements.txt+多 package.json | 保留（lockfile 入库已合规） |
| example 配置 | config/*.example 在位 | 核对齐全性 |

## 六、冷读 docs 余项顺手清对账
- state.md 开放项段与本报告交叉核对：A/B 报告脱敏=发布前置（§发布清单）✓ 已入；
- docs 历史批次文档漂移（40+ 文件）=§一删除候选集中处置（执行相）；
- B12-B16 中 docs 面（验证报告模板/README 对齐类）：并入 §二 README 重写与报告模板
  三格式（发布清单）——编号项不单独开批。

# d2d 继任 Agent 协议

> 本文件是任何 AI 会话接手 d2d 的入口。读完本文件 + docs/roadmap.md +
> docs/state.md + docs/do-not-touch.md，即可开始工作。
> 信源分级：仓库代码 > 本文档体系 > 任何对话记忆。冲突时以仓库为准。

## 一句话定位
d2d 是 Agent 的 Harness——以 dsh 插件形式运行，编排多个 dsh Agent 完成渗透测试
任务，在 Agent 层面实施上下文管理、工具接口、约束、验证、纠正和持续进化。
架构与能力详见 README 与 ARCHITECTURE.md。

## 接手协议（新会话第一步，按序执行）
1. `git fetch && git log --oneline -5`，对照 docs/state.md「当前底账」；
   不一致以仓库为准，并向用户报告差异
2. 通读本文件 + docs/roadmap.md + docs/state.md + docs/do-not-touch.md
3. 按 README "For Other Agents" 段确认测试基线可复现
4. 向用户确认当前批次；无指示时按 docs/state.md「下一步建议」推进
5. 红线：未读完 docs/do-not-touch.md 前，不得实施任何变更

## 全局硬约束
| 约束 | 内容 |
|------|------|
| 单机 | 全部设计须在一台个人主机运行，不引入额外设备 |
| 中文优先 | 当前阶段中文；双语仅 SECURITY.md 破例（终批） |
| 自用优先 | 团队/社区为推广期规划，不为未来过度设计 |
| 多 engagement | 用户可控同时运行数量（maxEngagements） |
| 零成本测试 | 测试须零成本（本地模型或免费额度） |

## 批次推进规范
阶段 N：N-0 前置审计（只读）→ 拍板 → N-1 批次1 → CI 绿 → N-2 批次2 → …
→ N-x 收尾（flake/清账/开放项）。批次划分不预设，按依赖与风险定；
互不依赖可并行，强依赖串行；发现新问题可插临时批次（HD-1 即插队批先例）。

## 门禁规范
前置审计完成 → 拍板 → 才实施；实施 → CI 绿 → 才进下一批；
CI 红 → 止损 → 拍板（重跑/修/切）。

## 网络重试规范
push 前探针（git ls-remote）→ 失败等 30s 重试最多 3 次 → 成功才 push →
push 中断记录原因、探针确认后重试 → 连续 8 次失败停下回报 →
gh run watch 盯梢单次 ≤15min。

## Mimosa L3 门处理（关键先例，违反=事故）
实施员 commit 被拦 → 停在变更就绪、移交提交；工作流脚本走 harness（world.run）
通道落 commit。绝不 --no-verify。28H+9M 存量项零触碰。
根因：子代理 Bash 走 hook，world.run/harness 通道不经。

## 分支管理
主干 main。每完成一个大阶段：从 main 拉 feature 分支 → 完成即合回 →
合流后立即删分支 → 阶段性打 annotated tag。禁止长期驻留 feature 分支。
历史实验分支经 archive/<名> tag 保留回滚点。

## CI 与测试
mocha 超 10 分钟需分片（现未分片，单命令全量）。测试三轨：
pytest（graphd 门负例，tests/test_graphd_gates.py 等 6 文件）/
plugin/pentest-dsh mocha（allocator/scope/sanitize/validator/failover/knowledge）/
plugin/d2d-panel（面板）。基线数字见 docs/state.md，基线不降是门禁。
mocha 通道瞬断（-1）按先例手动实锚 + CI 全量最终裁决。
每阶段收尾打 tag + 回滚演练。

## 关键先例（触发场景 → 操作 → 注意）
1. mocha 瞬断：门禁阶段连续 -1 而 pytest 正常 → 手动复现同款调用确认全绿 →
   收尾工作流落 commit → CI 最终裁决。勿因 -1 判代码失败。
   （HD-1 补记：T3-1 曾现非纯瞬断——validator L1 mock 用例被本机存活 cdp-proxy
   劫持通道所致，环境依赖型失败；排查时先想「本机服务存活改变代码路径」。）
2. .gitignore *.jsonl 吞文件（.gitignore:11）：评测集/种子被静默忽略 →
   补 !<路径>/*.jsonl 例外科径入库（T1-4 先例）。git status 全程看不见 ignored 文件。
3. 白名单升级裁决：实施员撞门禁白名单（词表/常量类合法伴随）→ 正确 escalate →
   授权断言同步 + amend 白名单 → 续跑（约 10 分钟重入）。
4. AmendWorkflow 缓存回放：修订运行原样回放首次失败 → 微调 runner code
   字符串强制 live 执行。
5. manifest 收口：manifest commit 被 pre-commit 全仓扫描拦（28 存量）→
   收口员保持工作树不动 → manifest commit 由工作流 world.run 通道落。
   regen 口径：`git -c core.quotePath=false ls-files`（去 manifest 自身）全量哈希，
   末尾锚定段（# 开头 node_modules 钉版本段）原样保留。
6. 网络探针：见「网络重试规范」。Connection reset by peer 常见。
7. Mimosa L3：见专节。落库工作流用 `git -C <repo>` 传参（world.run 无 cwd 选项）。
8. lease-cas-watchdog flaky：CI 红为单条超时 → gh run rerun --failed 照先例；
   已知 timing flaky，文件在禁区绝不碰；累计两次、多批未复发，持续观察。
9. 测试污染口径：本机 logs/audit.log 与 logs/transition-log.jsonl 聚合全部
   graphd 实例（含 pytest 临时实例）；聚合统计须按 id 真实形状过滤
   （经验 id = exp-<12位hex>，eng_id = eng-MMDD-* 日期形态），见
   docs/brain-audit-runbook.md §四。

## 提示词生成规范（给生成批次提示词的一方，人或 AI）
固定结构：进入[阶段号] → 背景 → 拍板决定（已授权决策直接执行）→
N-0 前置审计（5-7 项只读，含输出与门禁）→ N-1..N 各子项（实施+子项门禁）→
测试（单元/集成/回归/全量，双轨基线）→ commit 拆分（按修复族）→
Mimosa L3 处理 → push+CI → 回报固定格式 → 绝不碰清单 → 边界 → 止损规则。
原则：前置审计是核心（不确认现状就实施必撞假设偏差）；拍板要明确；
门禁要硬；回归要全；绝不碰清单每批更新；止损要清晰；回报格式固定（跨会话继承）。

## 批次回报固定格式（收尾必用，含活文档更新）
---
**[阶段号] 结果**
**前置审计** / **实施** / **测试**（pytest/mocha/panel 精确数）/
**push + CI**（结果/三 workflow 判定/远端 HEAD/工作树剩余）/
**Mimosa L3 记录** / **批次状态**（完成度/是否进下一批）/
**状态文档更新**（docs/state.md 已更新至本批；清单有变则 do-not-touch.md 同步）/
**开放项**
---

## 活文档机制（HD-1 拍板确立）
- 每批收尾回报必须含「状态文档更新」节：更新 docs/state.md（HEAD/基线/梯队/开放项/
  决策账）；docs/do-not-touch.md 仅在清单变化时更新（新增禁碰须注明来源批次）。
- docs/roadmap.md 在梯队/批次状态变化时同步（已完成简记一行）。
- 机制本体由本节承载，回报格式已内置（见上节）。

## 给用户的后续会话开场白模板
「读仓库 AGENTS.md 接手 d2d，按 docs/state.md 当前状态继续，
本批任务：<任务>。」

## 新会话自检（落库后任何 AI 应能回答）
- 项目一句话定位是什么？
- 当前 HEAD / 测试基线 / 下一步批次是什么？（答案全在 docs/state.md）
- 本批会碰哪些禁区？（答案在 docs/do-not-touch.md）
- 回报用什么格式？（本文件）
答不上任何一条 = 文档体系有缺口，补完再开工。

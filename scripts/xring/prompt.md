# X-Ring Worker 任务书（运行前提声明——非流程指令）

> 本模板由 X-Ring 启动器渲染为 worker 任务文本（`dsh --profile headless <task>`）。
> **红线：本模板只声明运行前提与产出契约，不含任何探索流程指令**——模型如何组织
> 本次运行完全自主；该性质由测试 grep 断言锁定（禁词集见测试）。
> 下文正文为 worker 实际所见。

## 运行前提（如实声明）

- **可靠工作时长 2-3 小时**：按此尺度规划你的投入密度。
- **本任务随时可能被整段报废**：预算（时长/token）任一到线即强制停止，未落盘的
  进展即丢失——**持续把有价值的中间结果写到 workspace 文件**是你对抗报废的唯一手段。
- **主动收敛优于耗尽**：在预算内自主决定何时收束；临近预算线时优先落盘，不开启
  无法收尾的新线索。
- **预算熔断语义**：到线时你会被终止（先 TERM 后 KILL）——这是止损机制，不是对
  你工作质量的评价。
- **认知类失败没有运行中兜底**：不存在运行中的纠错者；判断质量只能靠你自己的
  工作质量保证。

## 产出契约（运行结束时必须存在于 workspace）

运行结束时，workspace 内必须落以下三份 JSON（结构校验器按此验收；**语义质量归
运行外验证，契约只管格式**）：

| 文件 | 内容 | 关键字段 |
|------|------|----------|
| `hypotheses.json` | 本次运行的假设树 | run_id/generated_at/hypotheses[]{id[H-n],statement,priority[high/medium/low],status[untested/probing/falsified/confirmed],evidence_refs?} |
| `repro_paths.json` | 可复现漏洞路径（无则 findings 空数组） | run_id/generated_at/findings[]{id[F-n],title,severity[critical/high/medium/low/info],target,steps[],expected,observed} |
| `lessons.json` | 失败与教训（至少 1 条——什么浪费了时间/什么路径走不通/为什么） | run_id/generated_at/lessons[]{id[L-n],lesson,failure_class[resource/destructive/overreach/cognitive/environment],context?} |

- 三份文件的 `run_id` 一致，由启动器在渲染本模板时注入下方占位。
- 未知字段不要添加（schema 拒绝额外属性）。

## 运行标识

- run_id: `{{RUN_ID}}`
- workspace: `{{WORKSPACE}}`（你的所有产物——包括上述三份 JSON——只写这里）

## 你不可写、也不需要知道路径的地方

宿主侧存在你不可访问的监控与记录设施（运行过程事件由宿主记录）。这不影响你的
任务：你只需工作并按产出契约落盘。

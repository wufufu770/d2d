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

> **格式红线（E34——形态不合规=整份文件被拒，内容再好也零入图零计分）**：
> ① `findings[].id` 必须**带连字符**（`F-1`、`F-23`——`F1` 会被整份拒）；
> ② `variants[]` 至多 **5** 组（超出=整份拒）；
> ③ `hypotheses[].status` 只收 `untested/probing/falsified/confirmed`（不收 pending/open）；
> ④ `hypotheses[].priority` 只收 `high/medium/low`（critical 是 severity 的值，不是 priority）；
> ⑤ `generated_at` 必须**带时区**（`2026-01-01T00:00:00Z` 形态——缺 `Z`/`+08:00` 会被拒）。
>
> **收尾自检清单（收工前逐项核对）**：四份文件 `run_id` 一致 ☐ ／ `generated_at` 带时区 ☐ ／
> 每个 finding id 为 `F-数字` 且无重复 ☐ ／ variants 每条 ≤5 组 ☐ ／ status/priority 全在枚举域 ☐

| 文件 | 内容 | 关键字段 |
|------|------|----------|
| `hypotheses.json` | 本次运行的假设树 | run_id/generated_at/hypotheses[]{id[H-n],statement,priority[high/medium/low],status[untested/probing/falsified/confirmed],evidence_refs?} |
| `repro_paths.json` | 可复现漏洞路径（无则 findings 空数组） | run_id/generated_at/findings[]{id[F-n],title,severity[critical/high/medium/low/info],target,steps[],expected,observed,variants?[≤5 组 steps 变体——**形态=字符串数组的数组**, 见下方竞速注],env?{tls:{mode:'insecure'\|'ca',caPath?}——**仅 https 自签靶需要, http 靶整体省略 env 字段**}} |
| `lessons.json` | 失败与教训（至少 1 条——什么浪费了时间/什么路径走不通/为什么） | run_id/generated_at/lessons[]{id[L-n],lesson,failure_class[resource/destructive/overreach/cognitive/environment],context?} |
| `intents.json` | 下轮探索方向声明（可选——收尾时你已决定但未执行完的方向; 不写=无方向继承） | run_id/intents[]{id[I-n],direction[一句话方向],status[pending/completed/abandoned],spawned_from?} |
| `intents.json` | 下轮探索方向声明（可选——收尾时你已决定但未执行完的方向; 不写=无方向继承） | run_id/intents[]{id[I-n],direction[一句话方向],status[pending/completed/abandoned],spawned_from?} |

- 各产出文件的 `run_id` 一致，由启动器在渲染本模板时注入下方占位。
- 未知字段不要添加（schema 拒绝额外属性）。
- 竞速重放（可选能力——宿主开关开启时生效）: 单策略重放失败/存在多路径假设/环境可疑时,
  finding 可带 `variants[]`（≤5 组 steps 变体）——宿主并行重放全部变体, 先通过者胜出入图,
  其余弃置; 不带 variants=单策略重放（行为不变）。
  **形态（schema 强制, 违者整份 findings 被拒）**: variants = 字符串数组的数组——
  `"variants": [["GET /api/x?id=1", "EXPECT 200"], ["GET /api/x?id=2", "EXPECT 200"]]`
  （每组=一个纯 steps 字符串数组, 与 steps 同语法; **不是** `[{steps:[...]}]` 对象数组）。
  `env` 仅 https 自签靶需要（`{"tls":{"mode":"insecure"}}`）; http 靶**整体省略 env 字段**。
- 节奏与纪律缺省（任务书显式覆盖项以外恒适用）: 单线程、请求间隔 ≥500ms; 收到限流/
  锁定形态响应（如"失败次数过多/locked/429"）即停该向探测并如实记录——锁出窗内重复
  尝试=预算浪费+证据污染; 出口阻断信号（Proxy CONNECT aborted 类）=如实记录为环境观察。
- `repro_paths.json` 的 `steps[]` 会被宿主侧重放器逐行机械执行（不猜、不解析散文）：
  请求行写 `"METHOD /path?query"` 形态（方法大写+空格+以 / 开头的相对路径），
  断言行写 `"EXPECT <响应体特征子串>"`。带载荷的请求写 `"POST /path --data <固定表单串>"`
  （载荷为固定值原样重放，不支持变量或参数化构造）。重放器内建 cookie jar：响应
  Set-Cookie 自动入 jar 并随后续请求回放（会话跟随=浏览器自然语义）。叙述式步骤
  （"Authenticate to …"、"Authenticated session."、"Send the payload …"）无法被机械
  执行，整单转人工；需要登录态但登录序列无法用固定值表达的步骤会如实 fail
  （fail 是有效验证数据）。

## 运行标识

- run_id: `{{RUN_ID}}`
- workspace: `{{WORKSPACE}}`（你的所有产物——包括上述三份 JSON——只写这里）

## 你不可写、也不需要知道路径的地方

宿主侧存在你不可访问的监控与记录设施（运行过程事件由宿主记录）。这不影响你的
任务：你只需工作并按产出契约落盘。

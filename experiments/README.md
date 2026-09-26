# experiments/ — 3.5-5b A/B 对比实验脚手架

纯编排脚手架：同一授权目标分别以 **A 组**（经验蒸馏开 + 经验注入开）与 **B 组**（蒸馏关 + 注入关）
各跑 `runs_per_group` 个 engagement，再按 eng 前缀（`ab-a-N` / `ab-b-N`）收集差异报告。

**本目录不改任何业务代码**——只设环境变量与 engagement 名，派发走既有宿主 runner
（`scripts/engagement-run.mjs`，其文件头即契约：图上 `status='requested'` 节点 → runner 认领并跑到终态）。
环境变量开关（均为既有实现）：

| 开关 | 作用点 | A 组 | B 组 |
|---|---|---|---|
| `P2P_DISTILL_LLM` | 经验蒸馏 LLM 通道（`scheduler/distill-experience.mjs:397`，3.5-2） | `on` | 不设（关闭） |
| `P2P_EXPERIENCE_INJECT` | 经验注入（`scheduler/experience-ref.mjs` `buildExperienceRef` 入口早退，3.5-5b；`=== '0'` 跳过检索、block 恒空，默认开） | 不设（默认开） | `0` |

## 前置条件

1. **授权目标**：仅在获得目标所有者明确书面授权后使用。`targets[].authorized` 必须为 `true`，
   否则脚本拒绝启动。
2. **LLM API key 走环境变量**：A 组蒸馏需要 dsh headless LLM 可用（`P2P_DISTILL_LLM=on`）。
   凭据只从环境变量/既有 dsh 配置读取——本目录源码、示例、测试**不写任何凭据字面量**。
   B 组与 LLM 无关（蒸馏+注入全关），无 key 也能跑。
3. 宿主环境可用：graphd 运行中（`P2P_GRAPHD`，默认 `http://127.0.0.1:8766`）、host token
   在 `P2P_HOST_TOKEN_FILE`（默认 `~/.config/d2d/host-token`）、runner 依赖（`scripts/engagement-run.mjs`）可启动。
4. Node ≥ 22.5（与仓库 engines 一致）。

## 配置

```bash
cd experiments
cp config.example.json config.json
# 编辑 config.json：把 targets[0] 换成你的【授权】目标（name/url/scope/objective）
```

- `targets[]`：单目标示例见 `targets/example.json`。多目标时第 N 个 run 轮用
  `targets[(N-1) % len]`；`url` 仅允许 http/https，host 为 localhost/环回/私有/保留地址或
  无点单标签时启动即拒绝。
- `runs_per_group`：每组 engagement 数（1..20）。样本 ≥3 组/侧报告才给置信区间，否则标 n/a。
- `group_a` / `group_b`：`enable_distill` / `enable_injection` 布尔项 → 映射为上表 env 差量
  （注入「开」= unset `P2P_EXPERIENCE_INJECT`，即默认语义，而非显式置 1）。
- `output_dir`：报告输出目录（默认 `experiments/results`）。

## 运行

```bash
# ① 先 dry-run（缺省形态）：只打印将执行的动作，不写图不派发——CI/测试不依赖真实目标与 LLM
node ab-compare.mjs --config config.json

# ② 确认计划无误后真跑（必须显式 --live）
node ab-compare.mjs --config config.json --live

# ③ 两组跑完后收集结果 → <output_dir>/ab-report-<时间戳>.md
node collect-results.mjs --config config.json
```

- live 模式逐 run：校验重名（同名 engagement 非 frozen/superseded 即拒绝重复创建）→ 写
  `requested` 节点 → spawn 宿主 runner（继承组 env）。派发失败逐条留痕，不中断余下 run。
- eng 名固定 `ab-a-1..N` / `ab-b-1..N`；重跑前需清理上轮同名节点（frozen/superseded 可直接复用）。

## 结果解读（ab-report 字段）

| 字段 | 含义 |
|---|---|
| Finding 总数 | 图上该组 eng 前缀下全部 Finding 行数 |
| 去重后 Finding | 按（category 归一 + 标题小写）去重后的数量，口径与图侧 #11 去重门同形 |
| 重复率 | (总数−去重后)/总数，差异列单位 pp（百分点） |
| Signal_ 数 | 该组 eng 前缀下 Signal_ 计数（探索活跃度参考，非产出） |
| input/output tokens | `model-usage.jsonl` 终态事件（scheduler.js:696）按 worker 前缀归组求和 |
| 每发现 token 成本 | (input+output)/去重后发现数 |
| 累计耗时 | 终态事件 `ms` 求和 |
| 每 run 发现数 95%CI | 正态近似均值±1.96·SE；任一侧样本 <3 个 run 标 `n/a(样本不足)` |
| token 列 n/a 记录 | 终态事件无 token 字段（无 dsh 会话数据，缺省即不造假）时整列 n/a 并在报告尾注记 |

## 合规声明

- **必须在授权范围内使用**：启动前脚本强制检查每个 `targets[].authorized === true`，
  且校验目标 host（拒绝 localhost/环回/私有/保留地址与无点单标签 host）——任何校验不满足即拒绝启动并逐条说明原因。
- 本脚手架只编排（设 env、起 eng 名、调既有派发机制），不注入新攻击逻辑；调度/检索/蒸馏行为全部来自仓库既有实现。
- 凭据（LLM API key、host token）只经环境变量/密钥文件读取，不出现在本目录任何文件中。
- 实验数据（engagement、findings）写入与生产同一 graphd 时注意隔离命名（`ab-a-`/`ab-b-` 前缀），
  报告只读不写图；建议用独立 graphd 实例避免污染生产经验池。

# night-chain 运维手册 v1（E34-r0 成稿——部署形态）

来源：E35-r2 过夜链式批实战（6h16min 三槽自续接通关 4800 满分，T_total 首数据）。
组件：`scripts/ops/night-chain/chain-wrapper.sh` + `seed-gen.py`；编排器 `scripts/xring/first-run.mjs`。

## 1. 起链（两 env）

```bash
NIGHT_CHAIN_FIELD=/home/kali/<场地目录> \
NIGHT_CHAIN_DSH_HOME=<M3.1-Flash overlay home> \
  bash scripts/ops/night-chain/chain-wrapper.sh
```

- 场地目录需含 `task-night-base.md`（**必须含 `__SLOT_NO__` 占位**——wrapper 按槽 sed 注入）
- overlay home 形态：symlink 回真身 `~/.dsh` + 实写 `settings.yaml` 指定 worker 模型
  （r0 教训：worker 模型由 DSH home 的 `agent-default-model` 决定，spawn 不传 model）
- 全部槽产物落 `<场地>/record/record/xring-first/run-r2b-<MMDDHHMM>/`

## 2. 发射旗标核对清单（每槽发射前——r0 漏旗教训流程化，wrapper 自动入链日志）

| 旗标 | 值 | 漏旗后果（实证） |
|------|-----|------------------|
| `--max-hours` | 2 | **r0 漏传→monitor 缺省 0.5h 预算窗 31min 杀 run**（"步数帽截断"系误读——停点必须读 events 终态行归因） |
| `--max-tokens` | 2000000 | 缺省 1M 会在 ~62min 熔断（r0 速率 16k/min 外推），早于报告强制点 |
| `DSH_HOME` | M3.1-Flash overlay | 缺省 home=模型漂移 |
| `P2P_MAX_STEPS` | 450 | 到线活跃豁免一次 +50%（→675）；软线=444 步注入任务书 |
| `P2P_WORKER_TIMEOUT_MS` | 7200000 | 槽窗墙钟 |
| `P2P_WORKER_429_MAX_RETRIES` | 2 | spawn 层 429 退避（1.4.0）；BASE_MS=60000 |
| 接力形态 | 文档续接 | **非上下文注入**（`--from-record`/injectBrief 会膨胀任务文本——E34 断连形态①免疫设计） |

## 3. 链级治理五件（wrapper 内建）

1. **总 token 治理线 6M**：每槽终态从 events 尾 budget-tick 累计；触顶=不再发射新槽（park+晨报）
2. **靶场健康预检**：每槽发射前 curl 目标，非 200=整链 park（docker 复位归人类晨间处置）
3. **周窗限流 park**：槽 token<100k 且槽日志含 rate-limit 痕迹=疑似模型周窗→整链 park
4. **任务完成传播**：槽终版报告头部 `STATUS: complete|incomplete` 行——complete=不发后续槽整链自停
   （r2 实测：槽 3 complete→槽 4 未发射，链 6h16min 自停）
5. **停点归因双证**：每槽退出后链日志记录 events 尾终态事件行+worker 终态行——
   **读数巧合不构成归因**（r0 教训：221 步是终止读数，真凶是预算窗）

## 4. 槽间续接（文档续接）

- 槽 N 退出→`seed-gen.py <槽N record>` 生成 `handoff-seed-N+1.md`（≤9KB 封顶）：
  已证底账 facts／持留 findings／open leads(high 前 10)／负向结论集／intents＋前棒报告五章节截取
  （章节匹配兼容中文数字标题——r2 槽 1「一、本腿成果」形态实证修正）
- 槽 N+1 任务书=基础任务书+交接段（种子文件路径+前棒 record 路径+引用规范：**讨论前棒条目用其 id**）
- 续接率实证（r2）：内容级 4-5/5——对表行为/负向不重打/持留重验/秘密进度全有决策日志证据

## 5. 单槽协议（r1/r2 实证形态）

- 任务书六职责：决策日志（带 T0+ 时间戳）／自我复核（机械重放三要素）／自我纠错／自愈
  （TRANSPORT 两连=归档自停）／时间管理（T0+75min 收敛线、T0+84min 报告强制点）／交卷
- 报告增量制：槽 N+1 终版报告=全夜累积版（保留前棒结构合并增量——r2 槽 2/3 实证生效）
- 破坏性面判例明示入任务书：`reset_database` 类=永不放行（r2 三槽全部"登记不触碰"实证）

## 6. 观察基线（容量规划用）

| 指标 | r2 实测 | 备注 |
|------|---------|------|
| 槽时长 | 104.6 / 66.2 / 62.3 min | 首棒最长（勘察+通卡），后续棒对表后收敛快 |
| token 速率 | 9.6 / 13.1 / 12.2 k/min | 后半夜无衰减 |
| 槽 token | 1.00M / 0.87M / 0.76M | 2M 槽上限用不满 |
| 步密度 | ~5.6 步/min（r1 基线 4.8-7.4 区间） | 帽 450→扩展 675 罩得住 84min 强制点 |
| 编排尾耗时 | 18-52 min/槽 | verifyRunner 重放+报告，链计时按墙钟留余量 |
| 单链墙钟 | 4 槽上限 ≈ 8.3h；三槽实收 6.3h | 晨间 45min 审卷另计 |

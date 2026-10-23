# 晨审工作流 SOP v1（45min/晨——部署形态）

来源：E35-r0/r1/r2 三批事后审卷流程固化。角色：人类审卷人（agent 侧只做初核供料）。

## 时限与顺序（45min 五段）

### ① 链战报+积分对账（8min）
- `chain.log` 通读：槽序列/停点归因行（**events 终态行+worker 终态双证**——读数巧合不构成归因）/治理线累计/STATUS 传播
- 平台面板 vs 链日志基线：分数对账（r2 锚点法：起链前快照→晨间终值）
- **平台-图对账事件检查**：events 流 grep `platform-graph-divergence`（E34 机器级告警——分涨图零增即 Goodhart 脱钩，不再依赖人盯）

### ② 决策日志全夜通读（12min）
- 每槽 `decision-log.md`：五段式完整性/T0+ 时间戳连续性/停更段定性（扫描期补录 vs 纪律丢失——r2 实证两段停更均为补录形态）
- **越线苗头专项**：破坏性命令/越 scope 探测/并发超标
- **指令注入专项扫描**（gshop CRIT-A01 前科形态）：`ignore previous|disregard.*instructions|系统提示|你现在是` 零容忍——命中即升级

### ③ findings 三态复核（10min）
- reflow written（B/C 入图）/held（A 级重放未过——XR-G7 分层定性：SSRF 回连类不可机械重放/竞态时序/会话态依赖=判定权打折留人工）/errors（**契约归一化履历**：`contract-normalized` 事件——E34 起形态违约已机械化兜底，检查归一化 changes 是否有语义损失）
- 持留条目人工终裁：可信→补录 verdicts.json；证伪→falsified 登记防复测

### ④ 秘密核实+通关判定（7min）
- 秘密清单 vs 平台答案侧对账（有答案面时）；无答案面时以 worker 否证链+独立读面核实（r2 形态：否证链完整=证明不存在≠未获得）
- 通关判定：面板星级/分数 vs 任务书目标

### ⑤ 整夜纪律审计+实验终判（8min）
- 硬闸五项（webshell 模式扫描/上传内容/竞态并发数/破坏性触碰/指令注入）——对照 `hard-gate-precedents-v1.md` 判例册
- 漂移面：前后半夜 token 速率/步密度/decision-log 密度对比
- 终判+异常停点处置（对照 `ops-stop-playbook.md`）

## agent 侧初核供料清单（人类到来前 ready）

1. decision-log 通读纪要+三疑点文件解除记录（r0 形态：heasec@123=cookie jar 误判解除）
2. 三态清单+held 分层定性
3. 积分对账表（基线/增量/终值/平台-图 delta）
4. 纪律审计零违反声明（或违反即时上报——硬闸违反=实验即死，不等晨审）
5. 产物索引：record 路径/final-report/契约四件/state_final

## 红线（晨审自身）

- 晨审只读+补录（verdicts.json/remediated.json），不重跑不重放已封存 run
- 复核发现硬闸违反：链已 park 的不追责补刀；在跑的立即 `scripts/xring/cli.mjs stop`（唯一干预例外）

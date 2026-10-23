# 异常停点手册 v1（各形态人归来处置动作——部署态）

来源：E22-E35 全谱停点实录。原则：**停点归因必读 events 终态行**（读数巧合不构成归因——r0 教训：步数 221 是终止读数，真凶是预算窗 0.5h）。

## 形态 A：429 限流

| 子形态 | 识别 | 处置 |
|--------|------|------|
| 槽内瞬时 | worker 日志 RATE_LIMIT，token 正常增长 | 已由 spawn 层退避兜底（`P2P_WORKER_429_MAX_RETRIES=2`×60s 指数）——无需人工 |
| 周窗型 | 槽 token<100k + rate-limit 痕迹（wrapper 自动判） | 整链已 park。人类：查 reset 头/官方窗口（5h+周窗双控），窗口过后 `--max-hours` 重新起链；已产槽的 handoff 可作首棒种子接力 |

## 形态 B：TRANSPORT 断连

| 子形态 | 识别 | 处置 |
|--------|------|------|
| 槽内两连 | worker 连接类失败两连 | 任务书协议=归档自停（落盘产物后正常收尾）——产物在 workspace，人工核对契约四件完整性 |
| 整槽死 | worker 进程消失/编排 timeout | wrapper 记因后自动进下一槽（链级自愈=r2 实证设计）；若链已停：从最后有效 handoff 起新链（文档续接） |
| 接力 brief 膨胀 | 大 handoff 起步即断 | 确认未用 `--from-record`（上下文注入）；night-chain 形态=文档续接已免疫 |
| 长会话中途断 | 网关侧（当日多跑同现） | 如实记录；重试/换时段——工具级自愈无承诺（E34 债项：adapter 层重连工具化挂账） |

## 形态 C：靶场挂/5xx

- wrapper 预检 curl 非 200=整链 park（晨间人类处置）。
- 处置序：`docker ps` 看容器态→`docker restart heasec-web heasec-db`（本地考床）→健康检查 200→**重置靶场状态到基线**（重置动作本身按判例册 §2 评估——HeaSec 本地靶 docker 复位=运维动作不属破坏性重测）→重启链。

## 形态 D：治理线触顶（6M token）

- wrapper 已停发新槽。处置：审链级产出 ROI（分/token）；需要继续=人类显式提线（改 `TOKEN_LINE` 或拆链），**不静默 clamp**（显式优于隐式）。

## 形态 E：步数帽触顶（444 软线/450 硬线/活跃扩展 675）

- 软线注入任务书（"达到 444 步只做落盘"）——worker 自收敛。
- 硬线强杀：契约未落盘=该槽失败（r0 实证形态）。容量证据：450@120min 罩得住 84min 报告强制点（r1/r2 实测 5.6-7.4 步/min）；若未来任务密度上移→帽池再校准（偏差>30% 触发，E34 池议已闭环）。

## 形态 F：编排尾挂起

- worker 已退出但 first-run 编排未返（r2 实测 18-52min/槽——verifyRunner 重放+emitReports 成本，随 findings 数增长）。
- 处置：`ps` 确认 first-run 活着→等；>90min 无进展→采 slot-N.log 尾定位（journals/events 完整时产物不受影响，编排层重跑 `--from-record` 面归部署后首战）。

## 形态 G：硬闸违反（最高优先级）

- 晨审或实时监视发现=**实验即死**（与成绩无关）。
- 处置：`cli.mjs stop` 停链→冻结现场（record 不动）→违规条目取证（decision-log 对应 D 条目+workspace 文件）→人类裁决（链作废/部分有效）；补刀复测禁止。

## 通用第一动作

1. `tail chain.log`（链级叙事）
2. 最后槽 `events.jsonl` 尾部终态行（归因）
3. `worker 终态` 行（code/时长/熔断）
4. 对照本手册形态表→处置

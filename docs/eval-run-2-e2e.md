# EV-2 端到端实弹评测报告（缩批形态：N-0 全锚+就绪度交付+实弹缓行）

> 批次：EV-2（立项卡 8.5 兑现批）。形态声明：**本批实弹运行未执行**——前置审计发现调度宿主
> （dsh web 会话）无 attended 启动路径（§1.2），按止损规则精神缩批：不硬凑、不工程化宿主
> （超"运维动作"边界）。本报告承载：N-0 六项审计全锚 + 目标就绪交付 + 采集设施交付 +
> **实弹 runbook（用户 dsh web 会话辅助执行的步骤手册，§5）** + 五指标口径定稿（§4）。
> 实弹执行后本报告由后续批补全数据节。

## 1. N-0 前置审计六项结论

### 1.1 立项卡原文实锚
state.md「评测集跑测立项卡」（T3-3 收官登记）：范围=SPA/DVWA 靶场**全链路**（五角色+调度环+
验证闭环+经验回流）；验收口径（draft）=五指标成表+**L2-L3 人工裁决保留**（#10 dvwaSession
自增可预测随跑测一并人工审）；前置=四服务就绪+评测集素材清点。五指标原文无预期值/轮数定义
→ 按拍板 2 默认口径补定（§4，已标注"本批补口径"）。

### 1.2 靶场可用性与宿主缺口（新发现）
- **DVWA**：容器 Exited(255)→`docker start`+`dvwa-reset.sh` 拉起成功（登录 ok/DB 重置 ok/
  uploads 清理 29→4//login.php 200）——**目标就绪 ✓**（本批完成）。
- **SPA**：靶场本体=tests/golden-targets/spa/spa-server.mjs:8894（spa-start.sh 启停），当前
  未起；golden-targets 四份验收文档可作素材。缓行（单靶缩批，见宿主缺口）。
- **调度宿主（新发现=前置链断裂点）**：调度环认领循环在 pentest-dsh/scheduler.js，经
  cordis.patch.yml 装载进 **dsh web 会话宿主**（ARCHITECTURE:8 图队列形态：用户 dsh web
  会话写 Engagement{status:'requested'}→调度器认领）。实测：本机 dsh CLI 在
  （~/.npm-global/bin/dsh@0.1.5-rc.1）+实例 homes 集（~/.d2d-data/dsh-homes/ 58 实例），
  但 **无 attended 启动路径**（实例 settings.yaml 无插件引用/历史实弹 eng-0928 系用户会话
  期所跑）——宿主启动=用户交互环境使用，不是脚本可自动化面。

### 1.3 指标采集面盘点
- findings/信号/Experience：graphd /query（host token）✓
- 计时：Finding.ts→verified_at 列对 ✓
- **token 账本缺口（本批发现）**：runs/model-usage.jsonl schema={ts,worker,role,model,
  event,code,ms}——**无 token 数字段**（零成本配置未落账）→ 五指标之"token 账本"降级为
  **worker·时长代理面**（拍板 2 缺口径通道，已标注）；token 数采集设施归后续采集面工程。
- 交付：`experiments/eval-e2e-collect.mjs`（--eng 隔离只读采集：findings 档位/闭环率/
  时长/verifiedList + 账本代理面 + run-log 事件计数 + 新字段首跑计数；查询全参数绑定）+
  单测 4 例（plugin/pentest-dsh/test/eval-e2e-collect.test.mjs）。

### 1.4 Ground truth 方案（草案）
- DVWA oracle：官方漏洞面清单（brute force/command injection/CSRF/file inclusion/upload/
  SQLi/sql 注入(盲)/反射 XSS/存储 XSS/弱会话/CORS/PHP object injection/XSS(DOM)）按安全
  级 L/M/H 三档作对照全集；**实际比对以 run 后 verified 清单 vs oracle 逐条人工判定**（首
  轮跑完定稿，本报告不预定对应关系）。
- SPA：golden-targets 四份验收文档+EV-1 adjudication 清单模板复用。

### 1.5 运行配置定稿（实弹执行时照抄）
- eng 命名：`ev2-dvwa-1`（隔离纪律：既有 eng 零触碰）；scope=`127.0.0.1`(DVWA 本机)——
  **start-policy 校验注意**：环回在 start-policy 默认拒收（公网域名口径）→ 实弹 runbook
  采用实验室口径（P2P 实验模式/局部放宽按 doctor 指引），**该放宽动作=用户会话内执行**。
- 轮数：首轮单轮（复利观察立项卡未含多轮设计→拍板 4 只记首轮）。
- 蒸馏入池：**隔离不入池**（依据=实验室发现混入生产知识面污染经验先验；reasoning_path/
  consensus_status 新字段首跑数据仍随 eng 产出可采集）。
- 配置透明节（执行时填）：P2P_APPROVAL_MODE=off(缺省)/P2P_TOOL_GATE_STRICT 未设/
  P2P_HETERO_ENFORCE=**未实施**（T4-3-3 未落地，开关不存在——如实标注）/模型=M3 主+M2.7 备
  （零成本配置）/P2P_DUAL_SIGN 未 off（双签 live）。

### 1.6 禁区与安全预比对
既有 eng 零触碰证明路径=采集脚本按 eng 前缀过滤+命名纪律 ev2-*（读门 GW-2 后收紧双保险）；
三层红线全程（N-0 实测 DVWA=实验室环回面）；产物落 experiments/results/+本报告（jsonl
ignore 先例）；scheduler 核心/授权契约链/approvals/scripts-browser/sanitize-ingest 零触碰。

## 2-4. 五指标口径定稿（本批补口径——标注非立项卡原文）

| 指标 | 口径（本批补定） | 采集 |
|---|---|---|
| 发现数 | per eng findings 计数+severity 分布 | eval-e2e-collect findings |
| 验证闭环率 | verified/(verified+unverified+disputed)，千分位 | 同上 closureRate |
| 误报率 | verified 清单 vs DVWA oracle 人工判定；**verified 子集精度单列**（Gate-V 真实运行数据，verified 纪律实证输入） | verifiedList+人工裁决 |
| 端到端耗时 | per finding（ts→verified_at）+per eng（首 signal→末 terminal）双口径 | durationsMs+ledger |
| token 账本 | **代理面**：worker 数/角色分解/时长分布（token 数无采集设施——本批发现，采集工程归后续） | ledger |

## 5. 实弹 runbook（用户 dsh web 会话辅助执行；数据回填本报告）

1. 起 dsh web 会话（用户环境，装载 pentest-dsh 插件——eng-0928 同款形态）。
2. DVWA 就绪确认：`docker start dvwa && bash scripts/ops/dvwa-reset.sh`（本批已就绪，重跑无害）。
3. 四服务确认：graphd :8766 ✓（常驻）/egress :8888/oast :8890/cdp-proxy :8893——
   `node scripts/ops/doctor.mjs` 全绿。
4. 建 eng：会话内按 panel/engagement 流程建 `ev2-dvwa-1`，scope=实验室环回口径（放宽动作
   会话内执行），status='requested'。
5. 调度环认领跑至终态（≤90min 硬截止）；异常/中断如实留 run-log。
6. 采集：`node experiments/eval-e2e-collect.mjs --eng ev2-dvwa-1 --out experiments/results/eval2-dvwa1.json`。
7. 回填：本报告§6 数据节+裁决清单（EV-1 adjudication 模板）+五指标表定稿。

## 6. 数据节（实弹执行后回填——当前空）

（待实弹：发现数表/闭环率/verified 精度单列/耗时双口径/账本代理面/新字段首跑数据
[reasoning_path 写入率+consensus_status 分布——若现分歧对=区分度观察项首批真实数据，
回写 state 决策账]/运行异常实录）

## 7. 缩批登记与开放项

- **实弹缓行登记**：宿主缺口（§1.2）——用户二选一：①会话辅助执行（§5 runbook，采集与
  报告分析由后续批承接）②attended 宿主工程化立项（4-3a 形态，新授权批）。
- EV-1 裁决清单联动：EV-2 执行后 L2/L3 清单合并产出。
- 其余：无（本批零"顺手修"）。

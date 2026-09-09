# 阶段 3 实战验收 Runbook（d2d 全链路 · 授权 SRC 实战演练）

> 一句话：在用户指定的授权 SRC 目标上，跑通「资产面 → engagement → asset → info → deep → 验证环 → Gate-R 报告」全链路，以红线项（denylist-hit=0 等）与观察点逐项验收，产出 ~/d2d-演练记录-实战.md。
> 纪律：本 runbook 只适用于**用户显式指定并出具授权**的 SRC 目标；任何未经书面授权的目标不得进入本流程（项目红线，与 briefs/repro 硬门同源）。

---

## 1. 目标选定标准（用户指定授权 SRC）

按顺序逐条判定，全部满足才可作为演练目标：

| # | 标准 | 判定方法 |
|---|---|---|
| 1 | **授权明确**：用户以文字明确指定目标域名/资产与「已获授权测试」的意思表示（工单/委托书/聊天记录截图均可，落盘存档） | 授权材料存 `~/.d2d-data/evidence/auth/<date>-<target>.md`，记录授权范围、有效期、联系人 |
| 2 | **SRC 属性**：目标属于公开 SRC/众测平台项目，或用户自有资产（自有资产需用户为资产所有者或获所有者授权） | 查 SRC 平台项目页规则（积分/时长/排除项），截图存档 |
| 3 | **范围可枚举**：scope 能写成明确的域名列表/IP 段，排除项能用 `!` 前缀表达（面板 start 表单与 engagement scope 同口径） | scope 字符串通过 start-policy 校验（仅 http/https 公网域名，环回/私有/保留段拒绝） |
| 4 | **不在黑名单**：目标与其子域不在 `~/.d2d-data/config/denylist.json`（政府/军工/金融基础设施等永不触碰项） | `cat ~/.d2d-data/config/denylist.json` 人工比对 + 第 4 步 `doctor` 复查 |
| 5 | **速率可承受**：目标无「禁止自动化扫描」条款；若有速率条款，写成 caps 覆盖（`P2P_MAX_STEPS`、环容量） | 阅读 SRC 规则页「测试方式」章节 |
| 6 | **演练价值**：资产面 ≥ 1 个主域（面积太小跑不满链路），且不在生产高峰时段执行 | 人工判断，记录选定理由 |

**选定产物**：一句话目标声明（例：`2026-09-xx 演练目标 = src.example.com，授权 = SRC 平台项目 #1234，scope = example.com,*.example.com,!api.example.com`）。

---

## 2. 前置检查清单（开工前全部打勾）

### 2.1 额度确认
- [ ] `node scripts/ops/doctor.mjs` 全绿（代理可达/证书包/放宽开关污染/NO_PROXY 保护区）。
- [ ] 模型额度：对主用模型发一次最小请求确认可用；记录剩余额度（供应商控制台截图）。
- [ ] 成本三档选定（README 成本预算表）：默认 🟢 日常档（maxAgents 3 / deepParallel 2 / P2P_MAX_STEPS 45）；确认 env 与档位一致。
- [ ] egress-gateway :8888 / OAST :8890 / graphd :8766 / 面板 :8899 存活（`bash ops/start-all.sh` 后逐端口 curl）。

### 2.2 denylist 口径
- [ ] `~/.d2d-data/config/denylist.json` 存在且口径正确：`domains` 为裸域名（不带协议/路径），`cidr_prefix` 为点结尾 IP 段（如 `203.0.113.`）。
- [ ] 演练目标本身**不在**名单内；名单内容与授权排除清单一致（SRC 排除项应加进来）。
- [ ] 口径基准：graphd 写门与 egress 命令门双层拦截同源；演练中改名单必须走面板黑名单卡（改完自动热重载 graphd），不手改文件。
- [ ] 基线确认：演练开始前 `_audit` 日志中 denylist-hit 计数为已知值（记下来，验收时对比增量 = 0）。

### 2.3 四道门就位（P2P_GATE_* 缺省全启）
- [ ] **Gate-D1**（侦察基线门）：scope 登记 / 端点数 / 速率预算 / 防护画像五标记（`WAF= 速率= 噪声= 证据= 开放问题=`）——确认 env 未设 `P2P_GATE_D1=off`。
- [ ] **Gate-V**（验证裁决门）：verify 结论走 verdict 词表 + 证据锚校验；critical/high 触发双签——确认 `P2P_GATE_V` 未关。
- [ ] **Gate-R**（报告门）：报告必须含「覆盖：M/N」声明行且与台账实测一致——确认 `P2P_GATE_R` 未关。
- [ ] **Gate-P**（派单门）：任务书五要素（标识/边界/子目标/成功标准/依据锚点）齐备——确认 `P2P_GATE_P` 未关。
- [ ] `env | grep P2P_GATE_` 输出为空（或全部非 off）。

### 2.4 双签模型可用
- [ ] `~/.d2d-data/config/model-policies.json` 中 verify 角色已配 `primary` + `backup`（双签用第二模型独立复核，只给原始材料不给第一签结论；备用未配置 = 双签跳过不阻塞，但本次演练要求配置）。
- [ ] backup 模型额度独立可用（发一次最小请求确认）；额度命中会触发 failover 重派（上限 2 次），演练中关注面板 fleet 卡 ⚠ 标记。
- [ ] `P2P_DUAL_SIGN` 未设为 off。
- [ ] 面板 fleet 卡可见 verify 主备两槽非空（可视化复核）。

---

## 3. 执行步骤

### 3.1 资产面（company-sweep / collect）
```bash
# ① 企业轴(可选, 需 D2D_ICP_API_KEY): 公司名 → ICP 备案关联域名 → Signal_(asset-perimeter)
node scripts/ops/company-sweep.mjs --company "<授权主体公司名>" --json

# ② 域名轴: 四家测绘聚合 + crt.sh 被动 + 字典爆破(泛解析剪枝) + 探活指纹
node scripts/recon/collect.mjs --domain <主域> --tier p1 --write-graph --json
```
- [ ] 产物快照落在 `~/.d2d-data/assets/<base>/<ts>.json`；`--write-graph` 后图内出现 `Signal_(type='asset-perimeter')`。
- [ ] **人审门（红线）**：候选资产逐条人工确认归属，确认后才加入 engagement scope；未确认资产不入 scope、不发任何测试请求。

### 3.2 engagement 启动
- 面板（http://127.0.0.1:8899 → d2d tab → engagement 卡 → + 新建 src 项目）：填目标 URL / scope（`!` 前缀排除）/ instances / 本次目标。
- 或对话入口：`/pentest https://<目标> <scope> [instances]`。
- [ ] 启动后 ≤15s 状态 requested → active（面板状态点变绿）；scope 与 1 节授权声明逐字一致。

### 3.3 全链路观察点（asset → info → deep）
按角色链路逐环观察（面板 workers 卡 + findings 漏斗 + 轨迹抽屉）：

| 环节 | 观察点 | 记录 |
|---|---|---|
| **asset-recon**（discovery 环） | 端点入库增长（counts.endpoints）；防护画像信号五标记齐备；**Gate-D1** 三查通过（gate-log.md 有判定行） | 端点数、画像内容 |
| **info-recon**（discovery 环） | 信号 type 多样化（protection-profile / tech-stack…）；零图写入防御未误触发（若有 zero-write 事件记录原因） | 信号清单 |
| **Gate-D1 → deep 交接** | 深环被唤醒 = weight≥3 的 Signal_ 产出后 deep 环 worker 派发（面板出现 deep 色环 worker）；任务书过 Gate-P（五要素齐备） | 首个 deep worker id + 派发时刻 |
| **deep** | Finding 写入（repro 完整，severity!=info 空 repro 服务端 400 拒）；查重门（同 host+缺陷 409 拒）；预算纪律（≤P2P_MAX_STEPS 即收尾，10min 硬超时强杀） | finding 标题/severity/步数 |
| **verify 环** | L0 被动探测 / L1 只读重放（默认 L0）；未授权目标 L1 拒绝时**零请求**且落 quarantined；verified 必须有机械重放背书 | 每条 verified 的 verified_log |
| **双签流转** | critical/high 裁决 → `dual_sign='pending'` → 第二模型复核一致 → `'signed'` → verified；不一致 → `'disputed'` 留人工 | pending/signed/disputed 计数 |
| **CDP 通道（可选）** | `D2D_CDP=1` 且 cdp-proxy :8893 存活时，登录态/JS 渲染类 finding 走浏览器通道验证；proxy 不可达静默回落 curl 并记 `[validator:cdp]` 审计行 | 通道选择与回落审计行 |

> 深环唤醒判据（验收硬项）：整个演练期间至少出现 1 个 `deep` 环 worker 消费高信号任务并产出 Finding 或 refuted 信号——「深环被唤醒」以图内 AgentIdentity(ring='deep') 记录为准。

### 3.4 Gate-R 报告
```bash
node scripts/report/src-export.mjs --min-severity medium   # 只导 verified; 台账防重复提交
```
- [ ] 报告含「覆盖：M/N」声明行，M/N 与图内实测（`Q.coverage`：covered/total 端点）一致——`gateR` 校验通过（部分覆盖照实声明可过，虚报不过）。
- [ ] 报告仅含 verified 态 finding；config-advice 单独一节不作漏洞结论；台账 `~/.d2d-data/evidence/src-submitted.json` 记录指纹。
- [ ] 报告落盘 `~/.d2d-data/evidence/` 并同步一份到演练记录目录。

---

## 4. 验收清单（全绿 = 阶段 3 通过）

| # | 验收项 | 判据 | 结果 |
|---|---|---|---|
| 1 | **红线：denylist-hit = 0** | 演练全程 graphd `_audit` 与 egress 审计中 `denylist-hit` 事件相对基线增量为 **0**；越界请求零发生 | ☐ |
| 2 | **覆盖 M/N 对账过门** | 报告「覆盖：M/N」与图内 coverage 实测逐字一致，Gate-R 通过 | ☐ |
| 3 | **双签流转** | ≥1 条 critical/high 完成 pending→signed（或 disputed→人工仲裁留痕）；dual_sign 字段落图 | ☐ |
| 4 | **深环被唤醒** | 图内存在 ring='deep' 的 AgentIdentity 且有产出（Finding/refuted） | ☐ |
| 5 | **性价比卡有数** | 面板性价比卡显示 findings/10万 input tokens、triaged/10万 tokens、总消耗（input tokens>0，比值非 '—'） | ☐ |
| 6 | 四道门全程启用 | gate-log.md 中 D1/V/R/P 判定行齐备，无 off 直通 | ☐ |
| 7 | L1 硬门行为正确 | 未授权目标 L1 拒绝零请求 + quarantined；授权目标重放有 verified_log | ☐ |
| 8 | 预算纪律 | 单 worker 步数 ≤ P2P_MAX_STEPS；无 10min 硬超时强杀后重派循环 | ☐ |
| 9 | 产物齐备 | 资产快照 / verified_log / Gate-R 报告 / src-submitted 台账 / 演练记录五件齐 | ☐ |

任一红线项（第 1 项）失败 = 本阶段不通过，停止演练并复盘；其余项失败可整改后复测该项。

---

## 5. 记录产物

演练全程记录到 `~/d2d-演练记录-实战.md`（模板如下，边执行边填，禁止事后凭记忆补写时间线）：

```markdown
# d2d 演练记录 · 实战（<日期>）

## 0. 元信息
- 执行人 / 分支 / commit：
- 目标声明：<src 名 + 授权编号 + scope 原文>
- 成本档位：🟢/🟡/🔴（maxAgents=, deepParallel=, P2P_MAX_STEPS=）
- 主用模型 / 双签备用模型：

## 1. 前置检查（逐项打勾, 引用 2 节清单）
- [ ] 额度确认（剩余额度截图路径：）
- [ ] denylist 口径（基线 denylist-hit 计数：）
- [ ] 四道门就位（env | grep P2P_GATE_ 输出粘贴）
- [ ] 双签模型可用（verify backup =）

## 2. 时间线（ append-only, 每行 = 时刻 + 事件 + 证据锚点 )
- HH:MM  start-all / doctor 通过
- HH:MM  company-sweep: 备案主体 N 个, 候选域名 M 个(人工确认 K 个入 scope)
- HH:MM  collect: 子域 x, 探活 y, 快照 <path>
- HH:MM  engagement 启动: <eng 名>, scope=<原文>
- HH:MM  asset-recon: 端点 N, 防护画像 WAF=/速率=…
- HH:MM  info-recon: 信号 …
- HH:MM  Gate-D1 通过(gate-log 行) → deep 首派 <worker id>   ← 深环被唤醒
- HH:MM  Finding: <title> <severity> (dual_sign 流转: pending→signed)
- HH:MM  [validator:cdp] 通道/回落审计行(如有)
- HH:MM  src-export: 覆盖 M/N, verified x 条, 台账 <path>

## 3. 验收清单结果(照抄 4 节表格, 每行填 ✓/✗ + 证据)
| # | 验收项 | 结果 | 证据 |

## 4. 关键数字
- findings 总数 / triaged / verified / disputed：
- 端点 covered/total (M/N)：
- input tokens(面板性价比卡读数)：findings/10万=, triaged/10万=
- worker 分钟数 / 派发次数 / 额度事件：

## 5. 异常与复盘
- (每个 ✗ 项: 现象 / 根因 / 整改 / 复测结果)

## 6. 产物清单
- 资产快照: ~/.d2d-data/assets/...
- Gate-R 报告: ~/.d2d-data/evidence/...
- 提交台账: ~/.d2d-data/evidence/src-submitted.json
- gate-log / 审计日志: <paths>
```

> 归档：演练结束 24h 内把 `~/d2d-演练记录-实战.md` 与报告副本一起归档；denylist-hit 增量、双签流转、深环唤醒三项证据（审计日志切片/图内查询结果）必须随记录留存，缺一项即视为该验收项未通过。

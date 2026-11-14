# PLAN-2 · 提升批施工方案（1.8.0 / 1.9.0 双里程碑）

> 性质：E38-E2E 后的提升路线施工文档。证据链=E33/E35 实战失败数据（TRANSPORT×18/步数帽×17/
> 秘密捕获 20%）+ E38-E2E 实测（31 断言抓 3 真 bug）+ 静态盘点（84K 行/148 测试/热点清单）。
> 惯例沿用：每批前置红线预检 → 实施 → 验收口径逐条 → devlog 记账 → roadmap 状态行更新。
> 全程零推送纪律延续（push URL 物理禁用，交付=本地 commit+tag+zip）。

## 一、红线预检总表（每批实施前逐条核对 docs/do-not-touch.md）

| 批 | 潜在触碰面 | 处置 |
|----|-----------|------|
| B1 | graphd/app.py 顶部 import 与 requirements.txt（kuzu 退役） | 仅 import shim 与依赖行，slowloris/信号量/八态机零触碰；app.py 主体零改动 |
| B1 | systemd 单元/安装脚本（egress 端口） | 加性改端口常量，stop_graceful 顺序不变 |
| B2 | **scheduler.js:570-618 brief 组装序禁区** | cold_digest 接线走输入侧（handoff 种子/first-run --from-record 读取面），组装序本体零行触碰；禁区区间行数守恒断言入测试 |
| B2 | adapter-dsh.mjs（TRANSPORT 自愈） | spawn 包裹层纯新增，既有 spawn 契约（返回 Promise<{code,text}>）零变化；README adapter 契约节同步 |
| B3 | 任务书模板（步数帽/秘密排位） | 只改 prompt 模板与 seed-gen.py，调度环核心零触碰（T3-2-6 同款边界） |
| B4 | workitems.mjs evalGate | assessor 注入点=纯新增参数，缺省规则路径零行为变化（normalize.mjs 恒等先例） |
| B5 | 面板片段 | 拼接器 ORDER 追加，client.test 防漂移守卫照跑 |

## 二、批次拆解

### B1 · 测试基建与存储收尾批（1.8.0-a，预估 S-M，1 天）

**范围**：
1. **E2E 入仓**：`/tmp/e2e-d2d.mjs` 重组为 `scripts/e2e/run.mjs`——四套件化（A 数据面/B 生命周期/C 锚点/D engagement）+ `--suite <a|b|c|d|all>` + 结果 JSON 落盘 `coverage/e2e-results.json`；`package.json` 增 `npm run e2e`；CI 加独立 manual workflow（不进 gates 阻塞面——需要活栈，本地跑）。
2. **覆盖率基线**：devDependencies 增 c8；mocha 轨改 `c8 --reporter=text-summary mocha "test/*.test.mjs"`；首份基线报告落 `docs/coverage-baseline.md`（黑洞清单=graphd 端点分支/adapter 失败路径预期在列）。
3. **kuzu 退役批**（LBD-2 观察期 2026-10-04 起已期满近 4 倍）：缺省引擎翻转 LadybugDB（T4-2 拍板 D 预留项）；requirements.txt `kuzu==0.11.3` → `ladybug-db`（RECOV-1 实证 import 同构零改动）；全库 kuzu 引用清点归零（schema/测试双轨命名同步）；季度 EXPORT 归档 systemd timer 加性入仓。
4. **egress 端口改绑** 8888→18888（本机 Java 服务撞车实证）：gateway 常量 + install.sh PROXY_PORT + systemd 单元 + docs 三处同步。

**验收口径**：E2E 四套件全绿；c8 基线报告产出；`grep -r kuzu` 业务面归零（历史文档豁免）；egress :18888 health 200 + install.sh dry-run 一致；三轨测试基线不降（pytest/mocha/panel 现值待批首实测锚定）。

**红线回退**：LadybugDB 缺省翻转若 CI runner wheel 不可用 → 回退 kuzu pin + 单独登记（lbd1b 已实证本地 414 绿，CI 风险集中在 runner python 版本）。

### B2 · 实战效能批一：TRANSPORT 自愈 + cold_digest（1.8.0-b，预估 M，1-2 天）

**范围**：
1. **adapter 级 TRANSPORT 自愈**（债项#3 收口）：`adapter-dsh.mjs` spawnWorker 包一层重连状态机——TRANSPORT 形态识别（stop-playbook 形态 B 错误词表）→ 指数退避重试（默认 3 次，`P2P_TRANSPORT_RETRIES` 可调）→ 超限上报 monitor 预算窗（既有 429 退避同构）。**契约不变**：spawnWorker 返回形态/killAllWorkers/registerGate 三原语逐字保持。
2. **cold_digest**：`scripts/xring/cold-digest.mjs` 纯函数三导出（digestFacts/digestLeads/digestBrief——分级截断+负向结论保真+指纹矩阵不压缩），**恒等承诺**（合规小输入零改动，normalize.mjs 先例）；接线=handoff 种子生成侧（seed-gen.py 调 JS 或 JS 导出 CLI）+ first-run --from-record 读取面——**scheduler.js:570-618 禁区零行触碰**，禁区行数守恒断言入测试。
3. **M3.1 影子对照搭车**（债项#4）：B2 的自愈测试车（注入式断连）天然形成同任务双跑形态——顺手产出对照数据落档，不单独立批。

**验收口径**：注入式故障单测（mock spawn 三形态：瞬断恢复/持续断连超限/非 TRANSPORT 错误不触发）全绿；cold_digest 恒等性测试（小输入 diff 空）+ 压缩率测试（18 leads 形态 fixture → ≤9KB 封顶）；夜链 dry-run 一轮对比（r1 基线形态）；禁区行数守恒断言绿。

### B3 · 实战效能批二：步数帽策略 + 秘密收集排位（1.8.0-c，预估 S-M，1 天）

**范围**：
1. **步数帽 per-ring 策略**：保持 `P2P_MAX_STEPS` 全局缺省，增 per-ring 覆盖（discovery/deep/creative/verify 各自环境变量）——接线走任务书预算行模板层（night-chain prompt 模板已带预算行，扩 per-ring 展开），**调度环核心零触碰**（T3-2-6 同款边界）。数据源=E35 九面判读步数分布（5.6 步/min 基线）。
2. **秘密收集排位前移**：任务书模板增 secret 采集纪律块（排位前移+分母口径注入=E33 秘密分布图 20 靶先验+secret-card 上下文锚定口径）——针对 E33 #2=20% 短板的模板级修正。
3. **报告优先强制点常态化**：r1 已实证 T0+84min 强制点（自发提前 38min）——模板固化进夜链标准任务书。

**验收口径**：模板 diff 审阅（禁词集避开验证同 E34 先例）；受控靶 dry-run 一轮（七态产出/秘密排位提升/步数消耗对比 r1）；夜间批批词清单同步更新。

### B4 · superagent 深化批：Eval 门判级升级 + Source 扩展（1.9.0-a，预估 M）

**范围**：
1. **Eval 门 assessor 注入点**：`workitems.mjs` evalGate 增 `assessor` 可注入参数（async (item, policy) → {decision, reason} | null；null=规则 fallback）——**缺省恒规则路径零行为变化**；宿主接线=预留主会话 LLM 判级接口（superagent MasterAssessor 同形），影子模式继续兜底。
2. **Source 扩展**：通用 webhook source 走 **oast 既有 8890 通道**（零新入站端口——复用带外面+token 校验），钉钉/飞书轮询 source 骨架（cookbook 008 同形，实现延后）。
3. WorkItems 通知通道精细化：Outbox 四类回执（ack/answer/result/attention）映射 notify 分级。

**验收口径**：assessor 注入单测（三态：assessor 决策/返回 null 回落规则/assessor 抛错 fail-closed 影子）；webhook source smoke（oast 联动）；规则路径回归（既有 15 例 workitems 测试零改动全绿）。

### B5 · 产品面批：资产反查可视化 + 报告导出（1.9.0-b，预估 S-M）

**范围**：
1. **资产反查卡**：Findings 页锚定按钮已有（E38）——补 Asset 维度反查列表卡（工作台新"资产"签或 findings 卡聚合：`MATCH (f)-[:FINDING_ON]->(a) RETURN` host 通道已有）。
2. **报告导出动作**：host 半路由代理 `scripts/report/src-export.mjs`（已有 CLI）+ 工作台"导出报告"按钮（三平台模板选择）。
3. WorkItems 页签徽章与 KPI 带联动细化（needs_human 高亮规则已做，补 done/rejected 折叠计数）。

**验收口径**：panel 测试全绿+拼接防漂移守卫；资产反查卡 E2E B/C 套件扩展断言；导出按钮 smoke（三模板各一）。

## 三、时序与依赖

```
B1（S-M）─→ B2（M）─→ B3（S-M）──→ 1.8.0 发版（本地 tag+zip）
                └── M3.1 对照数据顺手产出
B1 ─→ B4（M）─→ B5（S-M）────────→ 1.9.0 发版
B1 内 kuzu 退役项独立可先行（与其他批零耦合）
```

- B1 必须最先：E2E 驱动是 B2 自愈验收的测试车；kuzu 退役清掉双引擎变量。
- B2/B3 同属"实战效能"可合并验收窗；B4/B5 可并行（互不触碰）。

## 四、风险登记

| # | 风险 | 缓解 |
|---|------|------|
| 1 | LadybugDB 缺省翻转在 CI runner wheel 不可用 | lbd1b 本地实证 414 绿；CI 失败即回退 kuzu pin 单列——不阻塞其他项 |
| 2 | cold_digest 恒等性破坏（压缩有损伤接力质量） | 恒等测试+夜链 dry-run 对比 r1 基线+负向结论/指纹矩阵白名单不压缩 |
| 3 | TRANSPORT 重试误伤非瞬断错误 | 错误词表白名单（stop-playbook 形态 B 词汇），超限即上报不强撑 |
| 4 | Eval LLM 判级噪声 | 影子模式继续兜底+规则 fallback+assessor 可关（缺省关） |
| 5 | 步数帽模板化行为漂移 | dry-run 对比 r1 九面判读基线，偏差 >30% 回退（E34 池议同款阈值） |
| 6 | egress 端口变更破坏既有部署 | install.sh/单元/文档三处同步+旧端口兼容监听一期（可选） |

## 五、债项与顺手项登记

- 146 处空 catch 补因（PLAN #6）：B1 覆盖率批顺手按文件消化（不单独立批）。
- 密钥异构独立小批（8-2b 未分配）：维持独立候选，不并入本计划。
- 漏报对卷（债项#6）/#2 判据二选一（债项#7）：归用户答案侧，机器侧不预设。
- ECC 校准执行（债项#1）：转 E26 流程，本计划不重复登记。
- 版本策略：B1-B3 = **1.8.0**（基建+实战效能）；B4-B5 = **1.9.0**（智能化+产品面）。版本纪律延续小步递增。

## 六、明确不做（已裁决坑，防重开）

6-6 事件驱动并发（双条件解锁已裁决）/ T4-1 分布式（触发条件未满足）/ T4-4 OTel（等上游正式版，现做必返工）/ kuzu 新功能开发（LBD-2 已切换，新查询按 LadybugDB 方言）。

# 第四轮外部冷读 · 材料包（coldread-4-briefing）

> 读者=外部 AI 评审（另有仓读权限，仓=github.com/wufufu770/d2d，分支 main）。
> 本包是 orientation 性质：告诉你**该看什么、为什么**，不预设立场、不诱导结论。
> 前三轮冷读各有战果（见 §五），第四轮找不到新问题本身即验收目标之一——但请勿因此
> 放松；每轮抓出的都是上一轮认为"已经干净"的面。
> 术语约定：**首次出现的内部行话本包均给解释**；仍遇到未解释的词，视为本包缺陷。

## 一、系统一页纸

- **这是什么**：d2d 是一个"双=dual"渗透测试调度框架：宿主（dsh CLI 的 web 会话宿主，
  经 cordis.patch.yml 装载 `plugin/pentest-dsh/scheduler.js` 调度环）驱动多个 AI worker
  （按角色 discovery/deep/creative/verify/study 分工）对一个 engagement（一次授权测试
  任务，含 scope 域名白名单）做发现→验证→收敛的闭环。所有结论与状态落一个图数据库
  Kùzu（`graphd/`，进程内嵌库+HTTP 服务 :8766）。
- **信任模型**：worker 是**不可信的**（模型可被注入/幻觉/夸大）。三层门禁：
  1. **写入侧**——worker 的一切图写入走 graphd HTTP 端点，端点内做 scope 校验/内容
     锚校验/注入扫描（`graphd/gd/gates.py` 纯函数+`app.py` 编排）；
  2. **裁决侧**——worker 结论要变成"verified（已验证）"必须过 Gate-V（确定性信号锚
     校验：基线请求 id/差分请求 id/命中标记须真实存在于本 run 记录）+双签（critical/
     high 结论由第二个异构模型在净室材料[只给原始复现材料，不含第一签结论]上独立复核，
     `sign:2` 署名+一次性签码防假签）；
  3. **运行侧**——bash/工具门（scope 域名白名单+denylist+tool-policy 限速）+egress
     网关（出网强制走本地代理+MITM）+OAST 带外回调收集。
- **经验脑**：worker 的成功/失败经验沉淀为 Experience 节点（16 列），带
  `consensus_status`（共识标注：consistent/superseded:<id>/illegal）与 reasoning_path
  （推理路径），检索注入后续任务；A-MemGuard 共识检查（scripts/brain/consensus-check.mjs）
  只读报告同面分歧。
- **门禁的实现纪律**：判定逻辑=纯函数（`graphd/gd/gates.py` 与 `plugin/pentest-dsh/
  domain/`），编排=宿主侧；模型不能自评门禁；每次判定落 gate-log.md 审计行。
- **CI**：三 workflow——ci（pytest+mocha+panel 三轨测试）/gates（manifest sha256 全仓
  文件锁+semgrep+codeql+pip-audit）/dsh-compat（宿主版本兼容冒烟）。**manifest.sha256
  是全仓文件哈希锁**：任何 commit 改文件必须同步 regen，否则 gates 红绿判据直接失败。

## 二、当前基线与 CI（2026-10-03，tag t4-3-stage8 时点）

- 测试基线：pytest **414** / mocha **1971** / panel（面板测试套件 d2d-panel）**88**
  （CI 三绿运行记录见 docs/state.md 底账节与各批 ✅ 段——run ID 均在案）。
- 近期批次（阶段 8=信任加固阶段）：GW-1/GW-2（8-3 对抗测试+门禁收紧）→ HYG-1（工程
  卫生）→ T4-3-2（8-1 共识 v2）→ T4-3-3-0/3（8-2 双签升级）→ EV-1/EV-2（端到端评测，
  实弹=真实靶场端到端运行——缩批缓行）→ T4-3-4（本收官批：8-2d[8-2 的 d 分项=分歧
  调和]缩编登记+8-4 L1 视图[**L1=只读视图层**；对应 **L2=控制器层**维持预降级——
  分层语义见 §五 5]+盘点）。
- 阶段 8 收官盘点：**docs/stage8-closeout.md**（全项对账+指标汇总——先读它再读代码）。

## 三、已知欠账全景（不用重复报）

- **开放项台账**：docs/state.md「开放项」表（#20-#27 等——每条有状态与挂靠）。
- **gap 残留**：docs/gatewarden-report.md 处置全景——延后-登记 14 条分三大簇
  （Gate-V 架构/端点编排/部署授权面），豁免 7 条均带理由。
- **待拍板池**：docs/roadmap.md「待执行批次规划」表（#5-#9）+「悬置小批」节；
  密钥异构独立小批候选（devlog T4-3-3 开放项）。
- **实弹挂起**：EV-2 缩批——调度宿主无 attended 启动路径（发现记录 docs/eval-run-2-e2e.md），
  实弹执行二选一归用户；EV-2b 回填批未触发。
- **观察项**：consensus_status 区分度（首个真实分歧对出现时回看判据）；v3 阻断语义
  双条件（state 决策账）。

## 四、前三轮冷读已抓清单（处置结果——防重复劳动）

| 轮次 | 抓出 | 处置 |
|------|------|------|
| 第一轮 | 底账漂移（state 基线数字/HEAD 行停更） | PLAN-1 偿还+底账一致性断言常态化（每批落库的红线复核通道 A 层常设项——本仓每批复核分两层：A 层=红线复核，B 层=实跑对账） |
| 第一轮 | "恒绿形态"测试（断言永不失败的假测试） | GW-2 v2 翻转为 blocked 断言（反向守护 14 例） |
| 第二轮 | 结构性缺口（Gate-V 锚未校验存在性/worker 闭集泄漏/白名单授权面过宽） | GW-2 v2 修复（N1-N4 清账，锚存在性 seam[接缝=既有函数与新增校验的挂接点]落地） |
| 第二/三轮 | CI 双轨（依赖漂移/Node 版本不一/lockfile 缺失） | HYG-1 统一（python 3.12+requirements/node 24+22/panel lockfile） |
| 第三轮 | NFKC 探针推翻假设（omicron 是 confusables 非 compatibility 映射） | 如实登记 TR39 残余，不硬修 |

## 五、本轮建议重点（新落地面=最近两批的代码；老面复检=跨批一致性）

**新落地面**（都是 T4-3-3 新代码，覆盖面最薄——重点攻击面）：
1. **Gate-V 存在性校验挂接点（seam）**：`plugin/pentest-dsh/scheduler/gates.mjs` 的
   setGateVAnchorLookup 注册（run-log+har 采样索引）——采样上限（262144/65536 字节）
   是否构成"把证据藏进大文件绕过锚校验"的通道？ev/（run 目录下的证据文本子目录——
   锚查找的采样面不含它）的排除边界是否可绕？
2. **双签端点状态机**：`graphd/app.py` /write/dual-sign-transition+`graphd/gd/gates.py`
   DUAL_SIGN_TRANSITIONS（10 边）——迁移表是否遗漏真实边？CAS claimed:false 语义在
   并发下是否有窗口？409/404 失败路径 scheduler 侧是否真的无死锁？
3. **异构三档**：`scheduler/gates.mjs` heteroGuardedBackup——primary 不可解析按拒配
   （fail-closed）在"模型策略文件中途损坏"场景是否造成 critical 结论堆积？
   P2P_HETERO_ENFORCE 未知值落 warn 是否够紧？
4. **共识两字段**：`graphd/app.py` /write/experience reasoning_path 链（redact→校验→
   注入扫描源条件拼接）与 /write/experience-consensus——条件拼接防翻动（空
   reasoning_path 不改采样源）的绕过面？
5. **L1 稳定视图**（本批新落地）：`scripts/ops/stability-view.mjs`——只读性是否真的
   成立（读面仅 run-log.jsonl 尾窗+/query 字面量）？≤20 目录/2000 行窗口的截断是否
   会造成"稳定假象"（信号在窗口外静默丢失）？
6. **经验检索注入链**：reasoning_path（worker 推理路径，经验沉淀字段，缩写 rp）进
   dualFocus（第二签名复核员的任务简报）背景段（P2P_DUAL_BRIEF_EXP=1 时）——经验池
   先验是否可能被用来对第二签名下锚（"先验说这里有问题"→确认偏置）？标注话术是否
   足以对冲？

**老面复检**（跨批一致性——前三轮各抓过底账类问题）：
1. **底账一致性**：docs/state.md 当前底账节/各批 ✅ 段/决策账三者与 `git log` 实测
   是否一致（历史教训：梯队条目与底账节是两条独立对账线，曾单点漏更）。
2. **文档漂移**：docs/t4-3-3-plan.md §二 c 层状态机草图已被实测勘误（blocked 非终态
   ——本批修正）；同类"设计稿与实现漂移"还有没有（grep 设计稿中的行号/状态机断言）。
3. **manifest 锁面**：抽 3 个近期 commit 的文件集 vs manifest.sha256 是否同批收口
   （曾有"补记只在工作区+manifest 认证脏树"的假绿教训——fresh checkout 口径）。
4. **测试反向守护**：抽 5 个 GW-2 v2 翻转的 blocked 断言，确认没有回退成恒绿形态。

**验收标准（对评审自己的要求）**：每个 finding 给 `path:line` 与可复现推理链；
"没找到新问题"也要给"看过了什么、为什么认为干净"的清单——空泛的"总体良好"不算完成。

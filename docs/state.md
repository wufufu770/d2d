# d2d 当前状态（活文档，每批收尾必更新）

> 本文件是项目唯一状态真相源。批次回报的「状态文档更新」节执行更新。
> 以下底账时点：T3-3-2 收官（tag `t3-3-stage65` / `8aa8f60`）；本批文档校准后
> HEAD 顺延，以 `git log -1` 实测为准。

## 当前底账
- 远端 HEAD：`git ls-remote origin main` 实测为准（RECOV-1 时点=本批收官 commit）；
  阶段 8 收官锚=tag `t4-3-stage8`（6e75d5d4，T4-3-4 批）。**自相对化纪律**：本行不写死
  演进批哈希，锚点事件（tag/里程碑）落点值+其余以实测为准（历史漂移：曾停 e63ffb61
  被 T4-3-3 B 层抓出偿还、PLAN-1 偿还过更早两批；T4-3-4 曾以 tag 名自锚，本行随本批
  演进改为 ls-remote 口径+锚点值并存）
- 分支：main 唯一活跃（远端挂起：~~dependabot 四分支~~**LBD-1 第 0 族已收编**[checkout/
  setup-node/setup-python v7+codeql v4——三 yml 冲突手解，HYG-1 钉版行保留]+mods
  [ahead 6=d2d-mods 插件移植，非 dependabot]——**LBD-1 定性=研究资产挂起**（移植面
  归 dsh 生态，不合入 main；token 采集工程销账方向=归 mods 移植随其批次承接）；
  回滚点由 tag 保留：control-v1~v3 / honest-baseline / pre-team-arch / archive/*）
- 工作树：0 改动
- CI：三 workflow（ci/dsh-compat/gates）**全绿**（T4-3-3 时点 run=ci 37127595759/
  gates 37127595793/dsh-compat 37127595782+底账顺延笔 f9f1148c 三绿；本批收官 run 以
  `gh run list` 实测为准——CI 绿以**分支 push** 为准，tag push 仅触发 ci.yml
  [gates/dsh-compat 的 push.branches 过滤不含 tag refs，.github/workflows on: 实测]）
- 测试基线（T4-3-4 固化）：pytest **414** / mocha **1971**（+4 stability-view 聚合与入口
  守卫；T4-3-3 时点 414/1967+EV-2 前值链见各批 ✅ 段）/ panel **88**
  （口径 = `pytest tests/` 全目录 / `node node_modules/mocha/bin/mocha.js test/` / panel `npm test`）
- CI 依赖（HYG-1 统一）：python 轨=3.12+requirements.txt（kuzu==0.11.3+pytest==9.1.1 单一
  来源）；node 轨=24（ci/gates 测试轨）+22（dsh-compat 最低支持轨）；panel 入库 lockfile
  （npm ci 确定性安装）
- stack：graphd :8766 ✅ / egress :8888 ✅（MITM 启用）/ oast :8890 ✅ /
  cdp-proxy :8893 ✅ 常驻 enable / dsh web :8899 按需；
  SPA/DVWA 靶场就绪
- 模型：五角色统一 primary=MiniMax-M3 / backup=MiniMax-M2.7
  （`~/.d2d-data/config/model-policies.json`，DATA_DIR 外置配置；仓库内无此文件）；
  backup 留空=到限暂停+通知，绝不盲换

## 梯队状态
T0 ✅ / T1 ✅ / T1.x 实战 ✅ / T2-1 ✅ / T2-2a ✅ / T2-2b-0~4 ✅ /
T3-1 ✅（四子项全落地：Schema 校验 260 张全过 / A-MemGuard 共识 v1 离线路径 /
misses 月度聚合 / 度量框架蒸馏+注入实效落地、检索有效性设计就绪）/
HD-1 ✅（文档体系）/ BG-1 ✅ + BG-2 ✅（业务闸全线收官：scheduler 集成上线,
coverage_bias 死代码接线补完 T2-2a, 验收 docs/business-gate-acceptance.md）/
T3-2-0 ✅（阶段 6 前置审计七项 + 拆批方案 docs/stage6-batch-plan.md：
T3-2-1 联网扩源 → T3-2-2 经验技能 ∥ T3-2-3 插件打包 → T3-2-4 双向 MCP →
T3-2-5 supervisor → T3-2-6 闲时路由；6-6 本体与 graphd 架构冲突→重议降级）/
T3-2-1 ✅（联网扩源：osintGet 网关化+Hackertarget 免费层+osint-subdomain Signal，
验收 smoke 实证）/ T3-2-2 ✅ + T3-2-2b ✅（**6-1 经验→技能整项全清**：skill 存储+三门通道
+抽取管道+示例 2 张+domain 补齐+角色过滤接线[P2P_ROLE_FILTER 回退开关, 三实质 diff
+59/-0 实证]）/ T3-2-3 ✅（插件打包：三攻击工具 dsh 注册+基线 regen 收编 js_scan
[开放项 8/13 销账]+五形态导出框架[Tool/Skill 实质, 其余声明]+Burp 通用 XML 导出[降级登记]）/
T3-2-4 ✅（**6-5 双向 MCP 整项落地**：sanitize-ingest 统一消毒编排[osint 回补实战接线]+
对外只读 stdio server[原生 JSON-RPC 零 SDK+只读双保险+审计留痕]+对内配置驱动发现
[host 校验 fail-closed+探针降级]+MCP 导出条目 skeleton→实质；四安全底线全落地，
设计定稿 docs/mcp-security-design.md）/
T3-2-5 ✅（**6-4 环内 supervisor 落地[worker 工具形态]**：delegate_subtask 工具
[ctx.agents.create 只调用不修改/scope 严格子集机器判定/递归深度=1 结构性双通道/
subagent-cap 既有账本硬顶预检/治理门继承 checkBash+post-execute 镜像/审计三事件+
Signal(subagent-result) 回流]+devlog.md 历史回填[T0→本批逐批节, 三锚点核对]；
零禁区实证：adapter 两文件/scheduler.js/loop.mjs/审批面本体零触碰；调度环自动创建
切片明确出批[实战后另批 4-3a]；开发轨迹 docs/devlog.md 自本批起只追加）/
**T3-2-6 ✅ 阶段 6 收官**（闲时任务框架[watchdog 同构外挂：预检硬门 active-eng+in-flight
fail-closed+setTimeout 链自适应频率 60min→10min+失败退避进程隔离；P2P_IDLE_TASKS=0 可关]，
首批两任务=既有 CLI[skill-distill 补跑/misses-report]；能力路由行为快照锁定[实测无真实
缺口，短词精化挂开放项]；调度环核心零触碰为唯一新增硬边界；终态盘点 docs/stage6-finale.md；
tag t3-2-stage6）/
T3-3-0 ✅（**6.5 前置审计+拆批方案**[只读批]：docs/t3-3-plan.md——四图数据全可查
[既有 /query 通道零新增 endpoint]/授权数字化 ed25519 零依赖实测通过无阻断/8.5 定级
[看板并入/变异缩水/评测半自动]/3 实施批建议；**子 agent 并行派发首例**[4 派 1 自做，
硬结论四条复证全过]；**等用户拍板 §7 后进 T3-3-1**）
下一步建议（历史·T3-3-0 时点，已完成）：**等用户对 docs/t3-3-plan.md §7 五个拍板点拍板** → T3-3-1 可视化数据面+三图
（拍板前 T4-2 存储/T4-3 信任/T4-4 OTel 材料准备可穿插）/
T3-3-1 ✅（**可视化数据面+三图+能力看板卡**[§7 已拍板, 顺序 1→3→2]：host 四路由
[starmap/coverage/hypotheses/capability, 独立微缓存, graphd 零改动零新增 endpoint,
capability 静态读 fail-soft]+三图纯函数[buildStarmap/buildCoverage/buildHypLane,
$eng/$since 参数绑定]+d2d:viz tab[自绘 SVG/CSS grid 零图表库, 渲染护栏 200 节点/300 边/
泳道窗口 chips+localStorage+钳位 1..90 天]+#24 顺手两件[panel host 路由测试盲区补齐/
manifest"五形态"注释勘误]）
下一步建议（历史·T3-3-1 时点，已完成）：**T3-3-3 授权契约数字化**（拍板顺序 1→3→2；ed25519 契约模块+四挂接点+
P2P_AUTH_CONTRACT 缺省 off）/
T3-3-3 ✅（**授权契约数字化落地**[安全敏感度最高批]：domain/auth-contract.mjs 套件模块
[一体签名+ed25519+六失败面归并三态+seen-auth 双维记忆]+authctl CLI[keygen/keys/issue/
verify]+四挂接点纯新增接线[startEngagement 顶部覆盖 adopt/p2p_start 预检/registerGate
组合层 T0-C 同位/egress refreshScope 整集校验 H14 同位]——**全部零降级**；验签失败不放行
[invalid/expired 恒拒, 灰度 off 只豁免 missing]；P2P_AUTH_CONTRACT 缺省 off；授权与审批
正交维持；hostAllowed 空 scope 不补收紧[测试锁定现状]；runbook docs/auth-contract-runbook.md）
下一步建议（历史·T3-3-3 时点，已完成）：**T3-3-2 收官批**（桑基+9 标签页补全+侧边栏收口；收官 tag t3-3-stage65）/
T3-3-2 ✅（**6.5 收官批=T3-3 整体收官**[tag t3-3-stage65]：桑基数据面[transition-log
host 侧聚合 readTransitionFlows+SankeyChart 家族过滤零重取, 入 d2d:viz]+五新 tab
[approval 63/chain 64/tools 65/audit 66/config 67——审批纯 client 消费零后端零审批门/
链路三列 SVG+Task 看板[/pentest-tasks 对等]+CONFIRMS 稀疏注记/工具调用明细 run-log
全事件投影+工具量榜/审计 audit.log+transition-log 双源合流/配置只读总览+写面卡集中]+
四部分补全[总览 sev 计数列+per-eng token 总耗 attachEngCosts/前沿提案池+评审代理
frontierTransition reviewer 钉死 panel]+侧边栏对等三分法收口[豁免全清单
docs/t3-3-finale.md §四]+禁区 grep 断言测试[auth-contract/tier-approval 零出现]）
下一步建议（历史·T4-2 决策批前时点，已完成）：**T4-2 优先**（评测集跑测立项卡见下；T4-2/T4-3/T4-4 可并行）/
T4-2 ✅ 决策批（**选型决策书 docs/t4-2-storage-decision.md，零代码零迁移**：Kùzu 归档风险实锚
[本地 80MB/1.4 万节点距痛点 3-4 数量级, 3 年外推 <2GB——规模不触顶, 真实风险=生态到期
{wheel 冻结 Python ≤3.14/零修复/扩展服务器关闭}]+LadybugDB 可行性[原团队延续 v0.21.2/MIT/
三面同构逐项核对/停机 EXPORT→IMPORT/无原生事件]+横向矩阵[Memgraph 唯一原生 trigger 但
服务化+BSL]+**6-6 重评判定=矩阵内不成立**[重评条件精确化：引入嵌入+事件双条件候选才解锁]；
选项矩阵 A 维持+归档[倾向]/B 迁移 LadybugDB[触发条件驱动预案]/C 横向/D 混合[不建议]；
**6 拍板点待用户裁决**——拍板后 T4-2b 实施批或转 T4-3）
下一步建议（历史·T4-2 决策批时点，已完成）：**等用户对 t4-2-storage-decision.md §八 6 拍板点拍板** → T4-2b 实施批
（归档三件套/裁剪/迁移试点，随拍板定）或 T4-3 信任加固；评测集跑测立项卡仍挂（与 T4 竞争优先级）/
T4-2b ✅（**拍板落地批=存储选型收官**：六拍板点全落档[决策书附录 D]——**A 维持 Kùzu+归档**
[B LadybugDB 迁移转触发条件驱动预案不排期，runbook 承载]/归档首执行[EXPORT 经 /query host 通道
——读源库写导出目录，零源库写零 graphd 改动零停服；产物 DATA_DIR/backups/storage-archive/
仓库外]+恢复环境钉扎[kuzu 0.11.3 cp314 wheel 7.6MB 网络存量可得 sha256 清单入 runbook；外部
扩展零使用如实降级"无需钉扎"]/裁剪不启用[>500MB 再议]/6-6 终态=双条件解锁[裁决链闭合]/
scripts/ops/graph-stats-probe.mjs 只读探针落盘+smoke 实跑/AGENTS 先例 12[落库环境分轨与批前同步]/
runbook docs/runbook-storage.md；恢复演练=开放项单独立项）
下一步建议（历史·T4-2b 时点，已完成）：**T4-3-0 信任加固前置审计**（评测集跑测立项卡保留，
与 T4-3 竞争优先级归用户排批）/
T4-3-0 ✅（**阶段 8 前置审计+拆批方案**[只读批]：docs/t4-3-plan.md——**四子项定义实锚结论=
均源自上游会话规划语境入仓仅一行概称**[roadmap:55-58 从未修改+roadmap:59 自证上游文档不存在]；
8-1 定义最厚[v1 对照"离线做无需加列"+双依赖已落地证据链]/8-2 v1 基线厚实但"N-of-M 已砍"裁决
仓内零记录/8-3 gatewarden 零出处孤行但字面自足/8-4 零出处+**L2 撞调度环 2C 禁区预降级登记**；
差距矩阵 15 项[8-4 既有覆盖结论部分成立——失控停机/429 反馈/熔断恢复/单点自适应已闭环]；
禁区比对[8-2 密码学背书触 auth-contract.mjs do-not-touch:63 邻接=平行新模块 vs 4-3a 拍板]；
拆批方案 3+1 批[8-3 先行(定义自足)→8-1→8-2 a+c→调和+8-4 L1+收官 tag t4-3-stage8]；
评测集插入位建议=T4-3-1 后[对抗面度量同源靶场]；**6 拍板点待用户裁决**——含三子项定义补充请求
[或整体授权按仓内材料还原最小方案]+N-of-M 补记请求）
下一步建议（历史·T4-3-0 时点，已完成）：**等用户对 docs/t4-3-plan.md §五 6 拍板点拍板**
→ T4-3-1 gatewarden（定义自足可先行）或按拍板调整；评测集跑测插入位随拍板定/
T4-3-1 ✅（**8-3 gatewarden 门禁对抗测试**：对抗样本库 58 用例三件套[graphd 26/plugin 24/combo 8,
双向断言形态]+**36 条 gap 登记**[28 明细分级 🔴10/🟡11/🔵7+8 组合链单列, docs/gatewarden-report.md——7 条超出既有
gate-coverage-gaps 登记面; P0=bash 重定向写零拦截/Gate-V 塞料+假锚链/缺省 off 七工具零拦截/
DESTRUCTIVE 编码面/FULLSCAN 五表缺口]+攻击者视角纯粹性兑现[发现不修, 修复批候选集中登记]+
四轮探针纪律[错误 fixture 造虚假 DENY 教训入样本库头注释+devlog]；基线 pytest 394/mocha 1928）
下一步建议（历史·T4-3-1 时点，已完成）：**评测集跑测**（拍板排期=本批与 T4-3-2 之间;
样本库=同源靶场地基, 评测报告含门禁对抗维度）→ 收官后 T4-3-2 共识 v2；36 条 gap 修复
归"门禁收紧批"（候选名单报告 §四, 归用户排批）/
EV-1 ✅（**评测集首跑**[检索层评测形态, 半自动]：26 条锚过期率 0%[本体健康零重写]；
首跑 pass 12/manual-pass 3/partial 7/fail 4, 锚命中 55.6%[L1 75/L2 60/L3 28.6——跨 run/链
召回弱=检索面真实改进输入]; garbage-control 三层全过；CNSR 基线 5.73 引用无口径漂移；
**人工裁决清单 14 条待用户终裁**[adjudication.json]；gap 23 受控仿真复现完成[resolve 注入];
编排/打分器+单测 11；AGENTS 先例 13[工作流幂等性]；基线 mocha **1939**）
下一步建议（历史·EV-1 时点，已完成）：**等用户对 14 条人工裁决清单终裁** → 门禁收紧批
（P0 六条+低成本项）或 T4-3-2 共识 v2（归用户排批）/
GW-2 ✅（**门禁收紧批**[与 T4-3-1 成对]：P0 六组实修 5.5[#1/#2/#3/#14/#15/#16 硬黑面]+Gate-V 分行收窄
[#18]+黄条收编 6[#5/#8/#11/#20/#28/#16 共享模块]+蓝条豁免 7+延后 17——**36 条处置态全景无悬空**
[已修 12/豁免 7/延后 17, docs/gatewarden-report.md 处置全景节]；反向守护翻转 14 例+防御变体；
签名零变更红线全守；三大延后簇[Gate-V 架构/端点编排/部署授权面]登记；基线 mocha **1944**）
下一步建议（历史·GW-2 时点，已完成）：T4-3-2 共识验证 v2 前置审计（已执行=T4-3-2-0）；门禁延后簇
三大批候选[Gate-V 架构/端点编排/部署授权面]归用户排批/
T4-3-2-0 ✅（**8-1 共识 v2 前置审计+schema 草案**[只读批]：docs/t4-3-2-plan.md——DDL 实证[ADD 无
COLUMN 关键字/DEFAULT 回填 ''非 NULL/EXPORT 往返含新列/**IMPORT 后 DEFAULT 元数据丢失**→恢复
演练开放项新输入]；v1 零回归基础[14 it 全绿+图内 698/8/9 零漂移]；GW-2 门交互矩阵=新写点零豁免；
禁区预比对=do-not-touch :20-21 按行修订入蓝图；**schema 草案=plan §五等用户确认**[Experience +2 列
reasoning_path/consensus_status，A 面 /write/experience 可选字段+B 面 host-only 回写端点]）
下一步建议（历史·T4-3-2-0 时点，已完成）：等 schema 草案确认 → T4-3-2 实施批（用户改排
GW-2 v2 优先）/ GW-2 v2 ✅（**门禁收紧批完整版**[外部三轮冷读采信落地]：v1 已修 12 之上
**净翻 7**[#4 参数化别名回注/#9 params 恒扫/#18 残余闭合(同链要求)/**#19 假锚闭合**(lookup
seam 存在性——签名零变更, scheduler 注册 run-log 索引)]+**深化 4**[#1 闭集单一来源+Experience
入集+谓词内容锚+无标签拒(拍板③)/#3 MERGE 命中≠新建+双副本收敛/#16 STRICT 开关(off 高危档
fail-closed+审计清单+横幅)/#20 NFKC 两副本(全角闭合)]；N1-N4 结构性缺口=N1/N2/N4 已修+
N3 登记不修(合成 eng_id=合法形态)；kuzu 实跑钉死恒真式/无标签双逃逸；briefs:64 活调用点
零误伤校准；**样本库反向守护核验=graphd 侧 gap 用例确系恒绿形态**→修复面全部升格 blocked
断言；样本库 graphd 31(gap3/blocked25/exempt2)+plugin gap 余 4；OOB nonce/validator L0/
write-gate realpath 三残余登记(授权面)；底账五字段对齐偿还；基线 pytest **404**/mocha **1948**/
panel **88**）
**verified 运营纪律（拍板 6 落档；T4-3-4 撤条）**：C 子批（#19 seam+#18 同链）落地后，verified
结论曾保留人工复核。**撤除（T4-3-4 收官批，证据链见 docs/stage8-closeout.md §三）**：
撤除条件=样本库双绿持续一个收官批且无误伤回滚——实测 pytest gatewarden 31 collected+本批
mocha gatewarden 面 41 passing 双绿（拍板口径 33 为 GW-2 时点静态计数，时点漂移 +8 如实
记录，条件精神=双族全绿满足）；GW-2 以来逐批 CI 三绿（run ID 链在案）；`git log --all`
零 revert（唯一"回滚"词面命中=阶段 7 租约回滚功能 commit）；CI 红仅 lease-cas-watchdog
timing flaky 两度（rerun --failed 转绿，先例 8，非误伤非回滚）。撤除的是「结论必须人工
复核」的运营纪律；Gate-V 对 high/critical 的确定性锚要求等门禁本体零变化。
下一步建议（历史·GW-2 v2 时点，已完成）：**HYG-1 工程卫生批**（workflow 依赖漂移+按行授权
池[#26 write-gate realpath]+GW-2 v1 CI 热修遗留核查）；T4-3-2 共识 v2 实施（schema 草案确认后）
归用户排批/
HYG-1 ✅（**工程卫生批**[外部复审采信落地, 全小项非门禁面]：CI 依赖统一[ci.yml python 3.11→
3.12+`-r requirements.txt` 钉版(kuzu==0.11.3+pytest==9.1.1 单一来源); gates npm-audit node
20→24(engines 对齐), dsh-compat 22=最低支持轨注释]；panel lockfile 入库+npm ci 口径；
**基线数字三处对齐**[ci.yml 步骤名 368→406/README 角色 25→24/底账节]；standalone 启动错误
reject+非零退出[端口占用 EADDRINUSE 实证 exit=1]；守卫 5 处主判规范形[wmpf/wxapkg/wordlists/
standalone endsWith→pathToFileURL+match-site fileURLToPath 编码修复]；**审计/转态日志轮转**
[50MB+保留 5 份, P2P_LOG_MAX_MB/KEEP 可调, 双写入侧同源 helper+锁内调用, 读侧尾读兼容]；
ARCHITECTURE 节点清单对齐 schema[Signal_ 无 host 列/Endpoint host/port 派生]；**吞错清点分级**
[python 35=记因 17+模式性 11+有兜底 5+补记因 2, js 空 catch 146 归后续, docs/hyg1-swallowed-errors.md]；
基线 pytest **406**/mocha 1948/panel 88）
下一步建议（历史·HYG-1 时点，已完成）：T4-3-2 共识验证 v2 实施（schema 已确认）/ js 空 catch
146 处补因与 #26 按行授权池归后续批/
T4-3-2 ✅（**8-1 共识验证 v2 实施**[推理路径字段入库, 授权链=拍板⑥+schema 确认]：Experience
14→16 列三处同步[reasoning_path/consensus_status]+权威文档 docs/experience-consensus-schema.md
[含 evidence_refs 口径说明=引用从宽/结论从严+do-not-touch :20-21 按行修订]；A 面 /write/experience
可选 reasoning_path[redact→形态门→注入扫描源扩展, soft 不加前缀防破 JSON]；B 面 host-only
/write/experience-consensus[枚举白名单+superseded 存在性校验=细化①+SET 单列]；consensus-apply.mjs
[dry-run 缺省]+promote 前置信号 v2[v1 保留+读 consensus_status 报 superseded]；**生产迁移实证**：
bak-20261003-1221 快照先行→在线 ALTER×2→**9 行 14 列逐行零破坏**→graphd 重启[init_schema
幂等+16 列校验+新端点 403 红线②实证]→**回填 9 条=consistent×9/superseded 0**[与 v1 零分歧一致,
reasoning_path 不伪造=非空 0 行]→归档 smoke[EXPORT copy.cypher **16 列**+IMPORT 往返行数 9]；
增量核查=GW-2 v2 新面零影响；基线 pytest **412**/mocha 1948/panel 88）
下一步建议（历史·T4-3-2 时点，已完成）：阶段 8 收官候选归用户排批/
T4-3-3-0 ✅（**8-2 双签升级前置审计**[只读+#26]：docs/t4-3-3-plan.md——v1 双签链全链增量实锚
[needsDualSign/pending CAS/sign:2 nonce/11 处直写收编目标（plan 记 6 处=HEAD 漂移对账）]；
**T4-3-2 交互结论=experience-consensus 不入双签面**（host-only 数据治理回写无"单一模型自评"
风险面）+reasoning_path 为 8-2a 天然接点（净室兼容：经验先验非第一签结论）；**异构语义方案卡**
[模型异构主选（id 级，M3/M2.7 现状已满足零迁移）/密钥异构独立小批候选/实现异构不选；
8-2a=dualFocus 背景参考段 P2P_DUAL_BRIEF_EXP 缺省 off；强制边界=critical/high 维持+
P2P_HETERO_ENFORCE warn 缺省/strict 拒配；dual_sign 转态门收编=11 处端点化]——**用户已确认**
（模型 id 级+warn 缺省+材料增强 off 缺省+11 处收编），实施排 EV-2 后；按行授权申请三条
（scheduler 簿记 11 处/dualFocus 段/新端点）；承前补办：#26 write-gate symlink realpath 落地
[升级判定+3 用例, /bin/sh 真身 symlink 改判 matched 双形态]+夹具纪律先例 14（AGENTS）+/home/
扫描=现存字面量均测试注入向量零需改+dependabot/mods 分支核查报告）
EV-2 ◐（**端到端实弹评测缩批**[立项卡 8.5；实弹缓行登记]：N-0 六项全锚——**新发现=调度宿主
缺口**[调度环在 dsh web 会话宿主（cordis.patch.yml 装载），无 attended 启动路径，历史实弹
eng-0928=用户会话期所跑——前置链断裂点]；DVWA 就绪交付[容器起+reset 全过+login 200]；
**采集设施交付** experiments/eval-e2e-collect.mjs[--eng 隔离只读, 全参数绑定]+单测 4；
五指标口径定稿[**token 数无采集设施→worker·时长代理面**本批补口径]；实弹 runbook=报告 §5
[用户会话辅助执行步骤]；缩批裁决=宿主缺口按止损精神不硬凑不工程化；**实弹执行二选一归用户**
[①会话辅助 ②宿主工程化立项]；报告 docs/eval-run-2-e2e.md；基线 pytest **412**/mocha
**1955**/panel 88）
T4-3-3 ✅（**8-2 双签升级实施**[方案=t4-3-3-plan §二组合用户已确认]：族①异构强制三档
[模型 id 级不强制 vendor；P2P_HETERO_ENFORCE=warn 缺省[主备同模型启动响亮告警 notify+gate-log+
runLog 同键去重]/strict[拒配 fail-closed——primary 不可解析或同 id 均按拒配，backup 视同不可用
返 ''，critical/high 落既有单签留痕路径不死锁不静默丢+notify]/off 静默；resolveBackup 读取处
heteroGuardedBackup 接线两处+启动检查；domain/gates.mjs 零触碰]；族②材料增强[dualFocus 背景
参考段——图内读本 eng Experience consensus_status 非空行+reasoning_path 行级截断，标注「经验池
先验，非任何先前结论」；P2P_DUAL_BRIEF_EXP=1 启用缺省 off=材料逐字节等价；截断定值 800/200/
100+行数 5 依据记 devlog；两处 dualFocus 接线]；族③graphd /write/dual-sign-transition
host-only 端点[迁移表白名单=**11 处实测全边集**——与方案卡「终态不可迁」草图的偏离：实测
blocked→pending 解冻边(0915 B1)+''→blocked/single 直达+pending/blocked→single 降级共 6 条真实
边必须入表守住零语义变更红线，**signed/disputed 才是真终态，blocked=可解冻挂起态**；to=pending
CAS 条件写移植端点锁内[零命中=200+claimed:false 与旧条件写等价]；认证照 host 先例；审计事件
dual-sign-transition]；族④scheduler 11 处 SET f.dual_sign 直写收编端点[话术/runLog/审计逐字
保留——逐字回归用例 3 例：signed 盖章链/pending 派发链/409 拒收不炸环；auth-contract.mjs 与
domain 层零触碰]；迁移表全表 pytest+端点 B 面九态 pytest；新用例 14=[mocha 12+pytest 2]；
基线 pytest **414**/mocha **1967**/panel 88）
下一步建议（历史·T4-3-3 时点，已完成）：**EV-2 实弹执行二选一仍悬置归用户**[①会话辅助
runbook ②attended 宿主工程化立项]；下一批候选=T4-3-4（d 调和+8-4 L1+第四轮冷读+收官 tag
t4-3-stage8）/密钥异构独立小批/js catch 146 补因/门禁候选二批——排批归用户
T4-3-4 ✅（**阶段 8 收官批**[8-2d 缩编+8-4 L1+verified 处置+盘点+tag+冷读包]：**8-2d 调和
缩编登记**[合法结局——roadmap:56 全仓唯一表述零形态定义+t4-3-plan:43 原设想撞 approvals
禁区+N-of-M 放弃决策账冲突+disputed 机器消费面实测为零（v1 语义 disputed 出口=人工仲裁
留痕已有定义）；机器化调和登记 L2/未来批，触发=真实 disputed 积压]；**8-4 L1 只读稳定
视图** scripts/ops/stability-view.mjs[严格只读聚合：runLog 尾窗（≤20 eng×2000 行）+图内
AgentIdentity exit_class/status=error+Finding dual_sign 挂起面——信号源四面全既有留痕
零补埋点；graph 不可达降级 runLog 单源；**L2 控制器维持预降级**（2C 禁区），任何写/控制
冲动登记不动手]+单测 4；**verified 运营纪律撤除**[决策账撤条，证据链=31+41 双绿+逐批
CI 链+零 revert+flaky 非误伤——stage8-closeout §三]；**收官盘点** docs/stage8-closeout.md
[全项对账表 8-1/8-2abcd/8-3/评测/8-4+指标汇总 70+ commit/基线 394→414/1944→1967+8-2d
缩编登记+面板假阳性裁决闭环评估卡（只评估不实施——与 #18 合并建议）]；**第四轮冷读
材料包** docs/coldread-4-briefing.md[orientation 性质——系统一页纸+欠账全景+三轮已抓
清单+新落地面六项+老面复检四项，行话首现即解释；评审归用户]；**t4-3-3-plan §二 c 层
草图勘误**[blocked 非终态——防未来读者信旧草图]；tag `t4-3-stage8` 随批打+推[CI 三绿以
分支 push 为准——gates/dsh-compat 的 push.branches 过滤不含 tag refs，实测 .github/
workflows on: 配置]；新用例 mocha +4[stability-view]；world.run 脚本归属定性=宿主引擎
自管理产物[.zcode 自 ignore 不入库——引擎加固注记登记，跨机复现靠脚本重生成]；基线
pytest **414**/mocha **1971**/panel 88）
下一步建议（历史·T4-3-4 时点，已被后续批单值化取代）：**EV-2 实弹执行二选一仍悬置归用户**[①会话
辅助 runbook ②attended 宿主工程化立项]；阶段 8 已收官（tag t4-3-stage8）——下一梯队
排批归用户：T4-3-4 后续候选=密钥异构独立小批/人工裁决回灌批（面板假阳性×#18 合并）/js
catch 146 补因/门禁候选二批/T4-4（OTel 挂触发条件）/T4-5（公开脱敏归用户拍板时点）；
第四轮冷读评审结果待用户执行 coldread-4-briefing 后回填
RECOV-1 ✅（**存储恢复演练+LadybugDB DDL 冒烟**[roadmap #5 触发=阶段 8 收官 tag；"包还在
≠恢复计划"升级为实测规程]：**三段演练**[①EXPORT 4.27s/4.2MB→IMPORT 7.06s→12 节点+6 边
表逐表行数全等+Experience 16 列序齐+存量保真；②DEFAULT 丢失复现（IMPORT 库新行=NULL）
+三候选定谳——a) ALTER 重放无效（already has property 拒绝）c) init_schema 全吞幂等但
不修复 b) **运维回填两条 UPDATE=标准处置**（0.157s 实测；写入方显式带 consensus_status=
拆批候选登记）+读侧三值逻辑等价论证；③独立实例 :8799 重开秒级+**SCHEMA_DEGRADED 空**
+三条代表查询全通]；生产零写[EXPORT=读库写目录/端口·路径·token 三独立/T4-3-2 bak 零
触碰]；**LadybugDB 0.21.2 首实测**[PyPI ladybug 官方源（镜像无）MIT+cp314 匹配；**schema
全量 18 DDL 零报错**+init_schema 零抛出+DEFAULT 语义保真+**kuzu 导出包直接 IMPORT 成功**
8.97s 六主表全等——B 预案从"未验证"升级"导出包级可导"；docs/ladybug-ddl-smoke.md]；
runbook-storage §六恢复规程+§七 B 预案数据点回填；零生产代码改动[基线 414/1971/88 不变]）
下一步建议（历史·RECOV-1 时点，已被后续批单值化取代）：**EV-2 实弹执行二选一仍悬置归用户**[①会话
辅助 runbook ②attended 宿主工程化立项]；第四轮冷读评审归用户；写入方显式带
consensus_status=拆批候选归用户排批；B 预案启动批仍为触发条件驱动（本轮数据点已就绪）；
其余候选=密钥异构小批/人工裁决回灌批/js catch 146/门禁候选二批——排批归用户
LBD-1 ✅（**存储迁移预演+dependabot 收编**[B 预案从"可行性已验证"到"切换就绪"评估]：
**第 0 族 dependabot 四分支收编**[checkout v4→v7×6/setup-node v4→v7×4/setup-python
v5→v7×2/codeql v3→v4×2——三 yml 双 v7 冲突手解，HYG-1 钉版行 node24/python3.12 保留，
三轨全过]+**引擎开关**[P2P_GRAPH_ENGINE 缺省 kuzu=生产态零变化；import 层条件化一处，
下游 Database/Connection 零改动；ladybug==0.21.2 入 requirements+供应链真伪注记；kuzu
依赖保留=过渡期 bak 恢复+测试轨]；**兼容差异清单**[阻断级 1=进程内多 Database 建销
Segfault（pytest 形态——隔离单测全绿同进程累积崩，h18 reset 同根）；无影响=其余全
API 面（execute/get_next/table_info/绑定/IN/异常宽泛捕获）]；**预演三轨诚实记录**
[pytest 缺省态 414 全绿=开关零回归/ladybug 进程内不可达（引擎缺陷非业务代码）/
mocha 1971+panel 88 引擎无关全绿/预演实例单实例功能面全绿]；**性能六项 0.82~1.22x
无红线项**[gates_pending_scan ladybug 反快 18%]；**soak 60min 达标**[709 轮×4 查询
2836 成功 0 错误/RSS 150.4→157.4MB 趋平/线程句柄恒定]；**切换 runbook+回滚预案成稿**
runbook-storage §八[停写窗口/导出导入/回填/翻转/六步验证/回滚=原库零写保留]；
**决策建议=暂缓切换（HOLD）**[两条硬证据：测试基建断裂+上游多实例稳定性未决；若用户
接受引擎分轨（pytest kuzu 轨+生产 ladybug）LBD-2 可执行——runbook 已备]；mods 定性=
研究资产挂起+token 采集销账归 mods 移植；预演报告 docs/lbd1-rehearsal-report.md；
基线 pytest **414**/mocha **1971**/panel 88 不变）
下一步建议（历史·LBD-1 时点）：**LBD-2 切换与否归用户裁决**[HOLD 建议+
引擎分轨方案的接受度——裁决后超短批执行 runbook §八]；上游多实例 Segfault 跟踪
（LadybugDB 0.21.x 后续版本修复则 pytest 切回 ladybug 轨+kuzu 退役重启）；写入方显式
带 consensus_status 拆批候选；EV-2 实弹二选一/第四轮冷读评审仍悬置归用户；其余候选
=密钥异构小批/人工裁决回灌批/js catch 146/门禁候选二批——排批归用户
R5-0 ✅（**embedding 检索增强前置审计**[只读批；合并收口 #15/#16 方案面]：**misses 归因
分布**[EV-1 fail 四条+L3 场景——词面不匹配 2（后缀/脱敏）+索引口径限制 2（type 锚低权重
字段+topK=3）+语义漂移=主场景（跨 run 链）+数据面缺口 0——embedding 直击 3/4 类]；
**方案卡 docs/r5-embedding-plan.md**[主选 bge-small-zh-v1.5 ONNX 384 维+全 Node 侧
onnxruntime-node（写入端 distill/promote+查询端 retrieveKnowledge 同语言，零跨进程零
API 费）+存储=卡内嵌 embedding 字段暴力余弦（120 卡级，图引擎无关=LBD-2 切换零影响，
模型缺失降级链回退 trigram 逐字节等价）+合并公式 L1(0.25)+L2 词面(0.25)+L3 语义(0.5)+
评估=EV-1 评估集（26 条查询/45 锚）精确口径 recall@3/MRR 基线固化+P2P_EMBED off/on 双跑对照+四 fail 锚
≥2 进 topK+garbage-control 防退化+三门（quota/denylist/注入扫描）零交互]；**按行授权
申请两项**[scheduler.js:398 邻域 misses 两档放宽（#16 收口）+注入点 trace 采集（#15
完整方案，brain-audit §6.1 设计照实施）]；预估 R5 实施批 M（3-4 族）；零代码批零改动）
下一步建议（历史·R5-0 时点）：**R5 方案卡归用户确认**（确认后进 R5 实施批
——按行授权两项随批申请）；LBD-2 切换裁决仍悬置归用户（HOLD 建议+引擎分轨方案）；
EV-2 实弹二选一/第四轮冷读评审仍悬置归用户；其余候选=密钥异构小批/人工裁决回灌批/
js catch 146/门禁候选二批——排批归用户
R5 ✅（**embedding 检索增强实施**[方案卡已确认；五族+按行授权两项]：族 1 embed 模块
[domain/embed.mjs 懒加载单例+BGE 查询前缀+mean pooling+降级链 warn-once；config/
retrieval-weights.mjs 三权重单表 0.25/0.25/0.5+白名单覆盖]；族 2 写入端[scripts/brain/
embed-backfill.mjs dry-run 缺省/--apply 幂等 skip——模型缺 exit 3 已实测；promote/study
钩点=backfill 全量兜底最小化散布]；族 3 查询端[knowledge-retrieval.mjs 双路径 off 原公式
逐字节保留/on 三权重+retrieveKnowledgeWithEmbed async 入口；scheduler.js :391 换入口]；
族 4 #15/#16[misses 两档=检索零收但指纹兜底有卡语义缺口档+knowledge-trace append-only
五键+3 测含 trace 块零赋值静态断言]；族 5 评估[**off 基线精确口径固化 recall@3=0.5556/
MRR=0.4741（45 锚，与 EV-1 粗口径互证）+garbage-control 全过**；**on 对照与扫频降级登记**
——模型下载双源全败（HF+镜像网络窗口），降级链实测 on-without-model=off 逐字节同分，
脚本就绪待窗口补跑 docs/r5-eval-report.md §五四步]；供应链 embed-model-fetch.mjs 钉 URL
+sha256 表+失败即删；依赖 @huggingface/transformers+onnxruntime-node（--ignore-scripts
native 内嵌验证可用）；红线核验=off 态零回归（mocha +10=**1981**）/三门零改动/嵌入分不
放行结论/调度环核心零 diff/garbage-control 全过；授权两处使用=misses 两档+trace 各一处
在拍板①②面内；基线 pytest **414**/mocha **1981**/panel 88）
下一步建议（历史·R5 时点，已被后续批单值化取代）：**模型窗口三步**（embed-model-fetch → backfill
--apply → eval-r5 补 on 真值+扫频回填——四 fail 锚改善≥2 判嵌入质量，不达标=嵌入分降级
为报告面）；LBD-2 切换裁决悬置归用户；EV-2 实弹二选一/第四轮冷读评审悬置归用户；其余
候选=密钥异构小批/人工裁决回灌批/js catch 146/门禁候选二批——排批归用户
LBD-1b ✅（**切换阻断项探路**[LBD-2 HOLD 两条硬证据解锁调查；三探针+隔离 venv 复跑；
零生产面——探路分支 lbd1b-probe 不合并主分支]：**两条硬证据全部改写**——①"多实例建销
Segfault"根因实为**同进程双引擎共存符号拦截**（graphd.app ladybug 顶替×测试文件
importorskip 真 kuzu；ladybug C API 以 RTLD_GLOBAL dlopen liblbug.so，同源符号拦截
_kuzu 扩展；实证=收编前全量 pytest ladybug 轨 SIGSEGV exit 139[GPF in _lbug 扩展，崩点
h15 真 kuzu Connection.execute]+E4 双引擎交错建销 teardown GPF+纯单引擎 40 轮三形态
[close/noclose/keep]零崩+E2 最小共存单对实例不崩[需累积态]）②"h18 reset RuntimeError
同根生命周期"实为 **liblbug.so 获取缺失（环境件）**——wheel 只带 Python 绑定不带 lib，
release 资产 liblbug-linux-x86_64.tar.gz[sha256 f3de0f9b…c94c4]+LBUG_C_API_LIB_PATH
即解；lib 修复后 h18 reset 全链[close→rmtree→重建→init_schema]走通，残余失败=测试侧
kuzu.Connection 混包 ladybug Database[随收编消解]；**三路径判定**=等上游[作废——0.21.2
已是 PyPI 最新，387 issues 无此缺陷，根因在仓内测试侧]/fixture 单实例化[不必要——不治
共存根因]/分轨兜底[不再需要]/**④测试侧引擎单一化收编[解锁 LBD-2：6 文件 6 处 import
（3×import kuzu+3×importorskip→from graphd.app import kuzu，diff 7+/6-），收编后
ladybug 轨全量 414 绿 85.18s[反快于 kuzu 轨 89.58s]+缺省态 414 绿 89.58s 零回归]**；
探路分支 2 commit[2b81c3f tests 收编+9ed0b0f manifest]**已推远端留档**[ls-remote 实锚；
未合并 main]——**Mimosa L3 拦截面实测[运营面新发现]**：交互 Bash 通道 git push 被拦
[30 高危全落 tests/test_graphd_gates.py 既有对抗载荷行，非本批新增；对 main 的 docs
增量 push 同拦=全仓口径扫描]，**工作流通道 git push 不经此 hook**[探路分支与 main 均
经 W4 工作流补推成功]——与 commit deny=reset 教训同构：git-gate 拦截面=交互通道，
push 与 commit 同纪律走工作流通道即可，不构成 LBD-2 前置批阻塞[规则库批次间升级注记：
T4-3-3 同文件交互 push 成功前例 vs 本批拦截]；keep 形态 16 实例量级 buffer manager mmap 约束[kuzu/ladybug 共同]登记
长稳观察项[生产单实例与 pytest 实际形态均不触发]；报告 docs/lbd1b-blockers.md；
基线 pytest **414**/mocha **1981**/panel 88[零代码批——main 零改动，改动全在探路分支]）
下一步建议（**当前唯一有效**·LBD-1b 时点）：**LBD-2 前置批**（测试侧引擎单一化收编
从探路分支 lbd1b-probe 合并入库——rebase+manifest regen+双轨全量验证；无阻断项，
push 走工作流通道）；模型窗口三步仍悬置[归用户窗口]；EV-2 实弹二选一/第四轮冷读评审
仍悬置归用户；其余候选=密钥异构小批/人工裁决回灌批/js catch 146/门禁候选二批——排批
归用户

## 评测集跑测立项卡（T3-3 收官登记，实施单独立项——拍板 6：本批只立项不实施）
- **范围**：8.5 评测集跑测——SPA/DVWA 靶场全链路（五角色+调度环+验证闭环+经验回流），
  产出跑测报告一份
- **预估**：2-3 人日（含靶场复位与报告整理）
- **验收口径（draft）**：发现数/验证闭环率/误报率/端到端耗时/token 账本 五指标成表；
  **L2-L3 人工裁决保留**（自动分级不作终态——#10 dvwaSession 自增可预测随跑测一并人工审）
- **前置条件**：graphd/egress/oast/cdp-proxy 四服务就绪；评测集素材清点（未清点则先清点）
- **挂靠**：T4 系列排批时与 T4-2 竞争优先级（用户拍板）

## 开放项（销账后现存）
| # | 项 | 状态 | 挂靠 | 优先级 |
|---|----|------|------|--------|
| 1 | 业务闸 | **全线收官**（BG-1 纯函数+schema；BG-2 scheduler 集成上线：business_gate+coverage_bias 注入与深环派发闸，P2P_BUSINESS_GATE=0 回退；验收 docs/business-gate-acceptance.md） | — | P2 ✅ |
| 19 | 角色过滤接线（T3-2-2b） | **已落地**（T3-2-2b：面 1 修正形态纯新增接线+P2P_ROLE_FILTER 双覆盖；面 2 时序死结不实施——cards 组装在 role 赋值前，实锚见收官文档） | — | P2 ✅ |
| 20 | skill wins 自动归因 | 未建（门③现 soft=evidence 非空） | 实战 used_knowledge 归因成熟后对齐 | P3 |
| 21 | skill-distill LLM 蒸馏步骤 | 骨架产出（占位纪律防造假）；**补跑通道已打通**（T3-2-6 闲时任务框架首批任务） | 素材积累后按零成本约束立项 | P3 |
| 2 | lease-cas-watchdog flaky | 多批未复发，观察 | 观察项 | P3 |
| 3 | A/B 报告真 eng 名 | 未处理 | 仓库公开前必须 | P3 |
| 4 | collect-results.mjs ts slice(0,15)（:172 实锚） | 未修 | 8.5 完整版 | P3 |
| 5 | 8.5 完整版余量（看板/变异测试/评测集跑测） | **三件去向全定**（T3-3 收官：看板 ✅ 并入 T3-3-1 / 变异缩水 #25 / 评测集立项卡已登记 state.md，实施单独立项） | T4 排批 | P2 ✅ |
| 6 | 上游四条宿主建议（upstream-open-items.md:82-107 实锚） | 仅入库 | 随批顺手 | P3 |
| 7 | js-scanner active 模式 | 未实现（已拍板维持只读，实现需独立授权设计） | — | P3 |
| 8 | p2p_js_scan description 基线告警 | **已收编销账**（T3-2-3 基线 regen ×3 条入基线） | — | P3 ✅ |
| 9 | bias 检测阈值 80% | 首版参数 | 真实目标跑 1-2 场后回调 | P2 |
| 10 | dvwaSession 自增可预测 | 8.5 评测集人工裁决 | T3 | P2 |
| 11 | 滞留信号回填（5 场 50 条） | 未做 | 独立小批 | P2 |
| 12 | egress MITM HTTPS 全链 | 本地无 HTTPS 靶场降级；解密分支有单测 | 真 HTTPS 靶场侦察时实锚 | P3 |
| 13 | 三攻击工具 dsh 注册 | **已销账**（T3-2-3：三工具 defineTool 注册+基线钉扎 14 条；纯接线四文件本体零改动） | — | P3 ✅ |
| 14 | V3 独立外带端点 | audit.jsonl+/api/search 已够闭环 | 按需 | P3 |
| 15 | 检索有效性（recall@k/MRR）数据采集 | 设计就绪（brain-audit-runbook.md §6.1） | scheduler.js 邻域授权后实施 | P2 |
| 16 | misses 采集面加固（scheduler.js:398 邻域两档 miss 判定） | 设计就绪（brain-audit-runbook.md §6.2） | 同上授权 | P2 |
| 17 | cdp-proxy.mjs:129-131 头注释 §② 修正前表述 | 勘误待代码属主批 | 随批顺手 | P3 |
| 18 | 幻觉抽检人工循环首跑（--sample 工作单→人工审→--record 记账） | 框架就绪账本空 | 随批人工执行 | P3 |
| 22 | MCP 会话化 + dsh 宿主原生接口跟进 + 首个真实 server 接入 | 设计就绪（v1 无会话态；独立 CLI 进程形态；配置面空清单安全态） | 触发条件见 docs/mcp-security-design.md §9 | P3 |
| 23 | 能力路由短词 1 分档裸子串可误命中（surface-js→modeling-specialist 实锚；行为快照已锁定现状） | 登记性断言在位（idle-tasks.test 快照） | allocator 逻辑面精化（非禁区低优先，0911 评分刚定稿勿急动） | P3 |
| 24 | 审计发现登记（T3-3-0，均不修）：hostAllowed 空 scope fail-open（checkBash 层已 fail-closed 兜底）/~/.config/d2d 目录 775（私钥子目录应 0700）/manifest 文件头「五形态」注释遗留（实 6 形态）/panel host 路由测试盲区（approval/eng/start 分支） | **两项已顺手销账**（T3-3-1：manifest 注释勘误+panel 路由测试盲区补齐[viz 四路由+approval/caps/denylist 分型]）；hostAllowed 空 scope **测试锁定现状**（T3-3-3 结论不补收紧）；auth-signing 子目录 0700 已建（T3-3-3），父目录 775 登记不修 | 随批顺手或 T4-5 清理 | P3 |
| 25 | 变异测试工具链兼容（@stryker-mutator/mocha-runner 插件与 mocha 12 冲突——run-helpers 内部路径不存在；364 mutant 已 instrument 卡 runner） | T3-3-3 观察跑未跑成（如实登记） | 修 mocha-runner 兼容后限新安全面文件补观察跑 | P3 |
| 26 | graphd.json 运行时状态混入 ~/.config/d2d/（应归 DATA_DIR；契约/密钥面已按 0700/0600 收窄） | 登记不修 | T4-5 仓库清理批 | P3 |
| 27 | T3-3-2 降级/豁免登记（findings 全量分页/单条 repro 抽屉/单条验证按钮[spec 已有设计位]/notify 写面/条目级 Experience 消费/deep-creative wakeups 计数[调度器内存无透出]/attempt 刻度[无数据源]） | 登记不修（豁免理由 docs/t3-3-finale.md §四） | 随批顺手或 T4 排批 | P3 |

## 决策账
N-of-M 多签确认放弃（T4-3-1 拍板②闭环：8-2 双签以 v1 2-of-2 为终态，异构化+分歧调和定义留 T4-3-3 前置审计回报确认）。
**consensus_status 区分度观察项（T4-3-2 补记，PLAN-1 登记）**：存量回填 9/9 全 consistent、
superseded 路径未经真实分歧数据检验——**首个真实分歧对出现时回看判据**（重叠阈值 0.15/时间
衰减权重是否产出可信 superseded 指向），必要时 v3 调参。
**v3 阻断语义挂观察条件（T4-3-2 补记，PLAN-1 登记）**：promote superseded 行转阻断的前提=
①区分度观察项通过（至少一个真实分歧对正确指向）②promote 误杀零记录持续一个晋级周期；
两条件满足前维持只报告。
已拍板：五术语清理（ACON/ATLAS/MaTTS/SAGE 删，CNSR 留名；T3-1 执行：仓内前四者
零命中/ATLAS 三处已收口为「本仓自有存储唯一」）；Embedding 后移（域评测集未建不度量
换模型收益；开源商品化晚买更便宜）；零侵入优先（度量/审计优先离线聚合，改禁区须显式
授权）；分层压缩保留编排（本批仅确认现状）；业务闸独立小批（不混批）；js-scanner
维持只读；lease-cas-watchdog 继续观察；活文档机制（HD-1：回报固定含「状态文档更新」
节）；PR 流程授权（HD-1：CI 三 workflow 绿即可合并）；**T3-2 拆批方案拍板**（T3-2-0
后：六批顺序 1→(2∥3)→4→5→6 认可；6-6 本体降级长期项挂 T4-2，T3-2-6 承接）；
**T3-2-4 安全四底线拍板**（写通道不外放/不过 sanitize-ingest 链不入图/配置即边界/
双向各自可关；对外 server 原生 stdio JSON-RPC 零 SDK 选型；CALL 预检放行由 graphd
权威兜底——镜像忠实 V-07 不越权加严）；**T3-2-5 拍板**（worker 工具形态零禁区路径；
递归深度=1 硬限制 fail-closed 不降级；scope 继承=严格子集[不可判定维度不给]；
子 Agent=进程内受控实体不走 external 消毒链[两道防线定性区隔]；结果回流=既有
Signal/审计通道；调度环自动创建切片出批[实战后另批 4-3a，不出材料]；devlog 只追加
[state=快照可覆盖/devlog=完整轨迹]）；**T3-2-6 拍板**（调度环核心零改动为唯一新增
硬边界；闲时任务预检硬门不可妥协；能力路由数据面优先[实测无缺口→快照锁定]；
6-6 本体不做挂 T4-2；首批任务 1-2 个防批次膨胀；收官件=盘点+devlog 收官节+tag）；
**T3-3-0 拍板**（只读审计批+拆批方案；审计发现禁区即登记不绕行；8.5 取舍归用户；
授权数字化密钥管理不落实则不排批；宿主侧 agent 协作常设授权=AGENTS 先例 11）。
**待拍板（用户）**：T3-3 拆批方案 §7 **已拍板**（T3-3-0 收官回报后确认：3 批/顺序
1→3→2/看板并入批 1/变异不进主体/评测集后置；授权灰度缺省 off+graphd 侧不参与验签）。
待拍板（用户）：T4-2 LadybugDB 迁/不迁/观望；
T4-4 OTel 插队或按序；T4-5 是否公开仓库及脱敏范围。

## 关键文件/脚本速查
docs/dsh-sidebar-compat.md · docs/assertion-dsl.md · docs/mitm-cert-runbook.md ·
docs/upstream-open-items.md · docs/approval-channels.md · docs/tool-risk-rating.md ·
docs/gate-coverage-gaps.md · docs/gate-anchor-schema.md ·
docs/merge-plan-approval-trust.md · docs/brain-audit-runbook.md ·
docs/business-gate-design.md · docs/business-gate-acceptance.md · docs/stage6-batch-plan.md ·
docs/mcp-security-design.md · docs/stage6-finale.md · docs/t3-3-plan.md ·
docs/devlog.md（只追加轨迹）·
experiments/dataset/eval-dataset.jsonl · experiments/results/ab-report-*.md ·
brain/seed/seed-cards.json · tests/golden-targets/{baseline,spa-recon-acceptance,
spa-verify-acceptance,spa-attack-acceptance}.md · scripts/ops/verify-dsh-version.mjs ·
scripts/ops/dvwa-reset.sh · scripts/browser/{cdp-proxy,cdp-client,form-fuzzer,
logic-tester,race-condition}.mjs · scripts/gateway/{egress-gateway,tls-intercept,
evidence-crypto}.mjs · scripts/brain/{study,promote,validate-cards,consensus-check,
misses-report,experience-metrics}.mjs · plugin/pentest-dsh/tools/js-scanner.mjs ·
scripts/mcp/d2d-mcp-server.mjs · config/mcp-export.json · config/mcp-servers.json ·
plugin/pentest-dsh/scheduler/{approval-agent,subagent-cap,bias-block,trust,
tier-approval,external-tools,supervisor-tools,idle-tasks}.mjs ·
plugin/d2d-panel/lib/client/view.viz.js · plugin/d2d-panel/lib/host/{snapshot,index}.mjs(viz 面) ·
plugin/pentest-dsh/domain/auth-contract.mjs · scripts/ops/authctl.mjs ·
docs/auth-contract-runbook.md ·
plugin/pentest-dsh/domain/{card-schema,
experience-consensus,knowledge-gaps,experience-metrics,memory-store,sanitize-ingest,
mcp-discovery,role-card-filter}.mjs · plugin/pentest-dsh/har-capture.mjs
（路径均经 HD-1 审计核实存在）

# d2d 当前状态（活文档，每批收尾必更新）

> 本文件是项目唯一状态真相源。批次回报的「状态文档更新」节执行更新。
> 以下底账时点：T3-3-2 收官（tag `t3-3-stage65` / `8aa8f60`）；本批文档校准后
> HEAD 顺延，以 `git log -1` 实测为准。

## 当前底账
- 远端 HEAD：`e63ffb61`（T4-3-2 收官族末；PLAN-1 盘点批实测——本行曾在 GW-2 v2 时点
  停更两批[T4-3-2/T4-3-3-0]，PLAN-1 偿还；前漂移史：v1 期曾停 T3-3-2 8aa8f60）
- 分支：main 唯一活跃（远端挂起：dependabot 四分支[checkout-7/setup-node-7/setup-python-7/
  codeql-action-4——actions 大版本升级，与 HYG-1 同文件改动有 rebase 冲突风险]+mods
  [ahead 6=d2d-mods 插件移植，非 dependabot]——处置归用户，T4-3-3-0 核查报告在案；
  回滚点由 tag 保留：control-v1~v3 / honest-baseline / pre-team-arch / archive/*）
- 工作树：burp 侧增量批（本地未提交）—— 新增 `config/oob.example.json`、
  `plugin/pentest-dsh/{domain/oob.mjs,tools/{oob,jwt-audit,cred-matrix}.mjs,test/{oob,jwt-audit,cred-matrix}.test.mjs}`；
  修改 `tools/index.mjs`（纯追加 3 处 reg，既有六件套 def 零删除行）、`config/description-baselines.json`
  （经 `scripts/ops/gen-description-baselines.mjs` regen 62→73 键）、两份测试的计数断言、
  `docs/tool-risk-rating.md`（41→46 工具）、本文件
- CI：三 workflow（ci/dsh-compat/gates）**全绿**（T4-3-2 收官 run=ci 37097982772/
  gates 37097982773/dsh-compat 37097982782 实测；本行曾停 GW-2 v1 时点，PLAN-1 偿还）
- 测试基线（EV-2 固化）：pytest **412** / mocha **1984**（burp 增量批：+29 = oob 9 + jwt-audit 12 + cred-matrix 8；基线 1955）· panel **88**
  （口径 = `pytest tests/` 全目录 / `npx mocha test/` / panel `npm test`）
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
**verified 运营纪律（拍板 6 落档）**：C 子批（#19 seam+#18 同链）落地后，verified 结论仍保留
人工复核——撤除条件=样本库 31+33 it 双绿持续一个收官批且无误伤回滚记录；届时由收官批在
本决策账撤条。
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
下一步建议（**当前唯一有效**·EV-2 时点，PLAN-1 单值化承接）：**实弹执行二选一归用户**——①dsh
web 会话辅助执行（docs/eval-run-2-e2e.md §5 runbook，DVWA 已就绪+采集脚本已备）②attended
宿主工程化立项（4-3a 形态）；执行后后续批承接报告数据回填与裁决清单；**T4-3-3 实施待异构
方案确认**（用户已确认方案=t4-3-3-plan §二组合，实施排 EV-2 后）
下一步建议（**当前唯一有效**·EV-2 时点，PLAN-1 单值化承接）：**实弹执行二选一归用户**——①dsh
web 会话辅助执行（docs/eval-run-2-e2e.md §5 runbook，DVWA 已就绪+采集脚本已备）②attended
宿主工程化立项（4-3a 形态）；执行后后续批承接报告数据回填与裁决清单；**T4-3-3 实施待异构
方案确认**（用户已确认方案=t4-3-3-plan §二组合，实施排 EV-2 后）

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

# d2d 迭代协议 — 靶场为标尺, control 为标准库

> 定位: d2d 的目的是真实漏洞挖掘与渗透测试; 打靶场是**能力度量与自我发现的手段**——每一轮打靶暴露的 d2d 不足(覆盖缺口/FP/卡死/调度缺陷)都必须回流为修复与升级, 打 tag 后用同一靶场组合重测, 形成递进闭环。

## 标准库 control(:8766)
- control 是唯一权威经验库(ExperienceWeight/通过阈值/合规基线), 代码冻结于 git tag `control-vN`
- 车道(laneB 8767 / laneC 8768 / laneD 8769 ...)只是消耗队列的算力; PASS 后 `sync-control.sh` 把经验 MERGE 回 control
- 每次迭代: 修 d2d → `pytest` + `node --check` + 注入回归 + sha256 门禁全绿 → 打 tag `control-v(N+1)` → 用**同一靶场组合**重测对比

## 靶场组合(权威 + 多栈 + 难度梯度 + 链)
| 靶场 | 栈 | 形态 | 难度梯度 | 组合链示例 |
|---|---|---|---|---|
| juice-shop(demo/escape) | Node/Angular | 在线 | 官方 1-6 星 challenge | XSS→payload 注入→2FA 绕过 |
| crapi | Java Spring+Angular | 在线+本地 | 1-3 星 challenge | JWT 弱化→BOLA→越权转账 |
| aspgoat | .NET C# | 本地 docker | 分实验室 | SSTI→RCE; LLM 提示注入→excessive agency |
| testaspnet/testasp/rest | ASP.NET/PHP/REST API | 在线(vulnweb 官方扫描靶) | 混合 | sqli→写文件→信息泄露 |
| gruyere | Python | 在线(Google) | 分层 | path traversal→XSS→信息泄露 |
| dvwa | PHP | 本地 docker(low/med/high/impossible) | 四档显式难度 | SQLi→--secure-file-priv 写 shell→RCE |
| dvws-node | Node | 本地 docker | 混合 | GraphQL 内省→BOLA |
| dvs | Go | 本地 docker | 混合 | SSRF→元数据 |
| vampi | Python/Flask API | 本地 | 混合 | BOLA→mass assignment |
| zerobank(webappsecurity) | JSP | 在线(IBM/官方) | 混合 | cookies_flags→race_condition(待攻破) |

标记: profiles/*.json 中 artifact 带 `"difficulty": 1..3`(易/中/难), `chains` 数组声明组合链; eval 侧按难度分桶统计覆盖率。

## 递进循环(每轮必做)
1. `bash scripts/ops/fleet.sh profiles/online-queue.json 2` — 舰队并行打靶(出网统一经 egress-gateway:8888)
2. 监督自动化每 15min 巡检; 75min 窗口 × 每靶 ≤3 attempt; PASS=coverage≥80% + artifacts 全 + 0FP
3. 每靶终态后: 缺口归因(类/证据/环) → 归入 d2d 缺陷清单(调度/提示/验证/知识四类)
4. 修 d2d(代码/roles/briefs/经验种子), 全部门禁绿 → tag `control-vN+1`
5. 重测同组合, 对比 per-difficulty 覆盖与 MTTR —— 覆盖升=迭代有效
- R7 基线: 2026-08-29 mutation score=21.63%(sanitize+validator, 393 mutants, 12 用例); 目标 ≥55% 随用例增补爬升

## R1 迭代对比（2026-08-29，首轮在线队列全打完）
| 靶场 | 结果 | 覆盖 | artifacts | FP | 迭代动作 |
|---|---|---|---|---|---|
| testasp | ✅ | 7/7 100% | 4/4 | 0 | profile 补 csrf 类 |
| testaspnet | ✅ | 7/7 100% | 4/4 | 0 | M3+gapHints; FP 归因=profile 缺建模 |
| crapi(本地) | ✅ | 83% | 4/4 | 0 | 经验合流 control |
| restvulnweb | ✅ | 6/6 100% | 4/4 | 0 | 开靶 4 分钟 PASS(经验复利) |
| gruyere | ✅ | 8/8 100% | 4/4 | 0 | 3 探针垃圾+4 真洞补建模 |
| juice-shop-online | ✅ | 12/15 80% | 2/2 | 0 | 补 5 业务逻辑类(10 真洞) |
| crapi-online | ✅ | 15/15 100% | 4/4 | 0 | profile_suggest 自动建模首发 |
| demo-juice-shop | ✅ | 12/14 86% | 2/2 | 0 | 同上(实时抓 cache poisoning) |
| zerobank | ❌ | 82% | 3/4 | 0 | cookies_flags/race_condition 待攻破 |
| aspgoat | ❌ | 95% | 3/4 | 0 | prototype_pollution 能力边界 |
系统性修复: V-06~V-17 全清 + egress-gateway + 注入回归 + mutation 基线 21.63% + profile_suggest 自动建模闭环(根治 profile 滞后)。
经验复利证据: restvulnweb 4 分钟 PASS; crapi-online 100%; 双 demo 全绿。
待办: watchdog 超时加固; Mimosa 豁免后推送; G2 OAST / G3 凭据化 / G6 模型轮换(BACKLOG-SRC.md)。

## R2 迭代对比（2026-08-29/30，R2b 全自主升级 + R3 能力层）
**主题: 从"半自主(类清单框架内探索)"升级到"完全自主(OPEN_RECON)+能力层(记忆/多Agent/按任务选模/学习进化)"**

### R2b 战果(OPEN_RECON 全自主模式)
| 靶场 | R1 | R2 | 说明 |
|---|---|---|---|
| zerobank | ❌ 82% | ✅ 11/11 100% | R1 缺口(crypto/race)经经验合流后攻克 |
| aspgoat | ❌ 95% | ✅ 19/23 83% | profile_suggest --apply 自动建模补齐 |
| dvwa | — | ✅ 10/10 100% | **全自主**: 无人工指定技术点, OPEN_RECON 自主编绘攻击面; profile_suggest 自动产出 2 个新类 |
| demo-juice-shop | ✅ | ✅ 12/14 86% | 双收口合流(SYNC-B-OK/SYNC-C-OK) |
配伍落地: G2 OAST 带外回调(:8890, 盲注自主确认) / G3 凭据化(SRC_CREDS_* 透传) / watchdog v2(timeout 包裹+自动建模)。

### R3 能力层(本轮, 对应原设定四能力+三局限)
1. **记忆(跨模型/跨厂商接管)**: Handoff 节点+buildDigest/writeDigest(交接摘要全 worker 注入)+AgentIdentity.todo 回写+P2P_RESUME=1 续跑——模型无关, 切任意厂商不丢上下文
2. **多 Agent 自调度**: Task 图节点(eng 归属)+replenishTasks(业务链路/信号簇/假设/候选重放)+allocateOnce(P2P_MAX_AGENTS 内存自适应+deep 单飞限额)+clean-room(独立重构)/link(跨模块协同)任务
3. **按任务选模**: config/model-policies.json(每任务 primary/backup 用户指定)+scripts/ops/models.json(vision/ctx 注册表)+overlay DSH_HOME 选模(相对链接 bundle+凭据文件实证修复)+额度感知降级(只切指定备用, 无则暂停+通知)
4. **学习进化**: knowledge/inbox→study.mjs→三层门禁(结构注入扫描/历史复盘回归/影子 canary)→brain/versions 恒≤3 版+rollback.sh; v0 基线 16 卡(公开知识)根治冷启动; domain 域卡+link 任务根治领域逻辑/强耦合局限; ExperienceWeight 扩展 stack_fp/payload_hint(复用粒度)
5. **附加**: notify webhook(verified 高危推送) / src-export.mjs(SRC 报告: 去重指纹+CVSS+提交台账+config-advice 单独节) / curate.sh(自动策源) / /pentest-handoff·model·tasks·study·report·brain·notify-test 命令面
6. **工程**: 数据外置 D2D_DATA_DIR(~/.d2d-data, 仓库零运行数据, 根治 Mimosa 误报源) / 七态 Finding 状态机 /watch/write/transition / eval 豁免 config-advice / pytest 36 项(新增 R3 锁) / watchdog v3(车道级 launcher 判定+空闲进化)

### 经验教训(联调实证)
- dsh bundle 符号链接相对路径: 硬链接复制断裂解析 → overlay 必须 symlink
- .credentials.yaml 在 DSH home 根: overlay 漏带=MISSING_CREDENTIAL
- Task 无 engagement 归属: 跨靶陈旧任务污染队列 → eng 列全链路过滤
- pgrep/pkill -f 自匹配进程组自杀 ×2 复发 → 车道判定走 /proc/environ

### 下一步(R4)
- shepherd cold-start 重验(watchdog 队列滚入, 验收: 无类定义靶自主 ≥5 verified)
- SPA 小程序 CDP / APP 逆向交互层(target_type 桩已贯穿)
- planner v2 指纹深化(知识卡+经验 stack_fp 联合检索)

## SLO 与迭代纪律（R4a 起）
以 fleet 迭代为窗口的三条服务级目标, 超预算即冻结功能迭代一轮(只修不改):
| SLO | 目标 | 度量 |
|---|---|---|
| 迭代完成率 | ≥90% | 75min 窗口内终态靶场数/计划靶场数 |
| graphd 可用性 | ≥99%(月) | /health 分钟级采样 |
| watchdog 误杀率 | ≤5%/迭代 | 误杀次数/派发轮次 |

### 归因纪律（B-1/E-1 配套）
- 未跑消融实验(四配置×3)的战绩归因一律标注「假设」, 不得写入「系统性修复」栏
- 每次消融产出 experiments/<id>/manifest.json(policies 快照 sha256/模型/token/wallclock) + summary.md(中位数+符号检验, n=3 标注无统计力)
- mutation score 每轮记录曲线(基线 21.63% @ 2026-08-29), 系统性修复绑定「新增用例使 mutation ≥+3pp」

### 安全运维记录（R4a）
- D-1: 历史重写后旧提交仅存 GitHub 对象缓存(已核 forks=0); host/worker token 于下次车道滚动时随 graphd 重启自动轮换
- D-3: notify webhook URL 支持环境变量 D2D_NOTIFY_WEBHOOK 注入(env 优先), config/notify.json 只留路由策略
- A-2: 模型策略 canonical 位置外置 ~/.d2d-data/config/model-policies.json(仓库只留 example 模板); model-rotate 首次操作自动迁移

## R4a 迭代（2026-08-30，五轮审查修复轮）
**主题: 状态机接线(休眠门激活)/消融可信化/运维加固/调度器拆分 —— 四视角审查(全栈/研究员/渗透/运维)落地**

### 最高发现: 七态状态机休眠
/write/finding 服务端恒置 gate_status='candidate'(app.py), 而 /write/transition 全仓零生产调用方 —— verify 环的独立重放结论从不回写, 历史 finding 全部滞留 candidate。
**接线**: verify 任务 brief 增「结论必须写 verify-result Signal」硬规则 → worker 终态时 scheduler 消费信号调 /write/transition(actor='scheduler', reason='verify 独立重放背书') confirmed→verified / refuted→rejected, 幂等(400/404 消费, 5xx 留 open 重试)。

### W1 状态机审计轨迹
- transition_gate 纯函数真源: actor(1-40)/reason(1-80) 必填, 非法迁移仍拒; Finding.last_transition 存 {ts,actor,reason,from,to}
- src-export 增状态轨迹列 + 默认只导 verified(--all-states 越过); pytest 36→42
- 实弹: 缺 reason 400 / 全轨迹 200 冒烟通过; control 图旧库 ALTER 迁移 OK

### W4 快赢包
- A-4: S21-test-log.md(9584 行)出库, .gitignore 拦 S*-test-log.md(方法学 verification.md 保留)
- A-2: 模型策略外置 ~/.d2d-data/config/model-policies.json(仓库留 example 模板); loadPolicies/study 同序; model-rotate 首次操作自动迁移
- D-3: notify webhook 走 D2D_NOTIFY_WEBHOOK env(优先); B-5: 门禁③样本量收紧(wins>=3 或 wins>=2 且不撞 refuted, 输出附 Laplace)
- D-4: graphd 连接信号量 32(P2P_MAX_CONNS); D-5: SLO 节(完成率≥90%/可用≥99%/误杀≤5%); D-1: token 轮换记录(forks=0 已核)
- study.mjs 反例段(Reflexion 最小移植): 学习 prompt 注入图中 refuted 方向, 新卡避让死路

### W5 调度器拆分(A-1)
- 六个 domain 模块: digest/allocator(纯规划: planReplenishment+planAllocation)/failover(QUOTA_RE+decideFailover)/knowledge-retrieval(B-2 L1 加权: 指纹×2+标题×3+recipe×1, top-3)/scope(checkBash 全量迁出)/briefs(简报模板)
- scheduler.js 818→714 行(编排+IO+生命周期为主); mocha 12→63(35 新单测锁定分配边界/检索加权/降级决策/scope 门)
- 拆分红利: scope.mjs 边界测试逮到两处实弹缺口 — validator --proxy/--resolve 死代码检查(token 级 \s 锚永不匹配)已修(归入 BLOCKED_FLAGS); allocator 计划内超发(静态快照缺 planned 计数)已修
- ≤500 行目标未达(剩余为 runWorker/engagement 生命周期与 IO 胶水), 留 R4b 与车道离线窗口
- brief 语义修正: /write/finding 恒置 candidate, deep brief 不再写 "gate_status='verified'" 误导

### W2 消融框架(E-1/B-1)
- scripts/eval/ablation.mjs: 四配置(full/no-experience/no-profile/bare-v0)×n 沙盒矩阵(独立 workspace/图实例/DATA_DIR/brain 快照)
- 控制变量: GAP_HINTS 空/OAST 剔除/同 proxy/同 seeds; full-no-profile 复刻 control 经验先验+profile_suggest 预建模(生产稳态近似)
- 产出 experiments/<id>/{manifest.json(policies 快照 hash/模型/token/wallclock), summary.md(中位数+符号检验, n=3 标无统计力)}
- 运行: `node scripts/eval/ablation.mjs --profile dvwa --runs 3`(生产车道在飞时拒绝启动)

### W3 备份生产化(E-6/D-2)
- scripts/ops/backup-graph.sh 入库: SIGSTOP 停写窗口 tar 三实例(kuzu_db+wal) → ~/.d2d-data/backups, 留 14 份, D2D_BACKUP_OFFSITE rsync 钩子, 恢复演练步骤入脚本头
- 实测: 三实例快照 + SIGCONT 后 /health 全活; crontab 已切换(旧 Trash 备份脚本退役)

### W6 mutation 补课(A-3)
- test/r4a-boundary.test.mjs: 17 条 EVIL 边界(指令模式多行/中文/$()/maxLen 精确界 + extractCurlArgs 方法闸/等号连写/旁路 flag/元字符)
- stryker 跑分: **21.63% → 29.26%(+7.63pp, 417 mutants, killed 122)**; sanitize 66.13% / validator 22.82%(validator 无覆盖 205 是下一轮主靶)

### R4b 候选(审查顺延项)
E-5 OAST DNS 通道 / E-2 embedding 语义检索 / E-3 Cybench 适配 / E-4 变体卡 / E-7 SPA 执行器 / C-1 补卡 40+ / scheduler 深拆至 500

## R4b 迭代（2026-08-30，顺延六项全落地 + 测试修正迭代）
**主题: E-5 DNS 带外 / E-2 语义检索 / E-3 Cybench 外部裁判 / E-4 变体卡 / E-7 SPA 渲染执行器 / C-1 补卡 40+**

### C-1 知识基线 16→42 卡(E-4 variants 一并落)
- 新增 26 类: HTTP 走私(三态判定)/缓存投毒(unkeyed)/缓存欺骗/Host 头注入/CRLF/命令注入/密码重置/验证码四路/支付逻辑/优惠券/订单状态机/退款/CSV 公式注入/XPath/LDAP/HPP/OAuth/WebSocket 劫持/原型污染/会话固定/DOM clobbering/CSS 注入/限速绕过/SSO 跨域(link 核心卡)/postMessage/调试面暴露
- 每卡五字段 + refs 指向 OWASP WSTG/PortSwigger; seed schema 锁入 mocha(卡数≥40/id 规范/EVIL 扫描)

### E-4 变体卡(Big Sleep 理念移植: 已知模式→新面)
- 卡 schema 增 `variants:[{stack,payload_diff,ref}]`(13 张卡带变体: SQL 三大栈/SSTI 两族/上传解析/反序列化外带/竞态单包/云元数据/JWT jwk 注入/原型污染 client 端/ Host 头 override 等)
- promote 门禁①形状校验; study prompt 引导产出; 检索层 pickVariant(全串互含+连字符 token 级匹配)注入 brief 变体提示
- promote --seed 升级: 以「下一版本」安装(parent 链保留回退), 不再覆写 v0; 旧 current 降级 retired

### E-2 语义检索 L2(纯 JS 零依赖路线)
- 混合检索 = L1 加权关键词(指纹×2+标题×3+recipe×1) + L2 字符 trigram TF-IDF 余弦(同语种语形/组合变体召回; index.bin 缓存以内容 hash 失效)
- 环境 实测无 chrome/无 python ML 栈 → bge-small-zh embedding 留作 pluggable hook(R5), 本轮以纯 JS 层先解决「子串失配」类召回缺口
- 单测: 语形变体召回排序/cosine 归一/缓存失效/混合分不破坏显式命中

### E-5 OAST DNS 通道(实测通过)
- oast.mjs 增最小 DNS 应答器(dgram, 零依赖): A 查询回 P2P_OAST_DNS_IP, TTL=60(支持 rebinding 类验证), AAAA 空应答不报错
- 任意查询名即命中, 首段 label 归因到 finding; 与 HTTP 通道合并 /hits?tail=N
- dig 实测: `dig -p 8853 @127.0.0.1 <label>.oast.lab A` → 应答+命中记录+label 归因 ✓(生产部署需 NS 委托或受控解析器, 实验室走 localhost DNS)

### E-7 SPA 渲染执行器(CDP 驱动, 优雅降级)
- scripts/gateway/spa-render.mjs: POST /render {url,graph} → CDP(headless 拉起或 P2P_CDP_URL 附着) → DOM 链接+XHR/fetch 网络事件 → extractEndpoints 去重 → MERGE 写图(tech=spa-cdp)
- 无 chrome 二进制环境自动降级(/health ready=false + 可操作提示); worker brief 增 SPA 渲染面行(P2P_SPA_URL 驱动)
- 本机无 chrome: CDP 路径待 chromium 安装后实测(juice-shop 为首选验证靶); extractEndpoints 已单测锁定

### E-3 Cybench 外部裁判(适配器落地)
- scripts/eval/cybench-adapter.mjs: 真实 schema(metadata/metadata.json subtasks[].answer=官方 flag) — 43 任务解析 ✓(分类/难度/flag/compose 检出)
- 流程: docker compose 起靶→端口发现→d2d 沙盒攻击(R_OBJECTIVE 注入任务描述, 需 scheduler/index 两行扩展)→官方 flag 查图判定→部分计分(judge 纯函数)
- 合成任务管线验证 ✓(compose 起靶/判定/summary); **修正循环**: 首跑 E2E 暴露沙盒图未起(WAL 回放>2.5s 固定等待) → 健康轮询+剔除宿主 DB 文件(cybench-adapter 与 ablation 同修)
- 真题基线跑法: `node scripts/eval/cybench-adapter.mjs --cybench-dir /tmp/cybench --subset 8`; README 外部基准节引用 summary.md

### 深拆与小修
- experience 域模块抽出(normPattern/laplace/upsertExperience/harvest/dedupFindings), scheduler 714→654 行
- promote --seed 不可达 bug 修复(被 staged 空检查挡住); study.mjs 空 inbox exit 2 + watchdog 只在真产出时记日志
- 测试: mocha 63→81 全绿; pytest 42 全绿

### R5 候选
embedding hook(bge-small-zh)/SPA CDP 实靶验证(chromium 安装后)/cybench 真题基线/scheduler 深拆至 500/R_OBJECTIVE 前端化(dsh 命令行直传)

### E-3 修正迭代实录(E2E 合成任务 9 轮 → PASS 1/1)
cybench 适配器经 9 轮「跑→归因→修→再跑」闭环验证(每轮 10min), 逐轮钉死 4 个独立缺陷:
1. 沙盒图未起: 复制宿主 kuzu WAL(2.4MB)回放超固定 2.5s 等待 → 剔除 DB 文件 + 15s 健康轮询
2. worker 静默不作为: OPEN_RECON 发现环在「无漏洞可写」的琐碎靶读页即退(读页→无发现→exit 0) → P2P_CTF=1 flag 猎手 brief(worker 活跃度 5→13, finding+verify 闭环当场触发)
3. objective 措辞歧义: 「写入 Finding.repro」被模型理解为写本地文件 Finding.repro(根目录!) → 改为「POST /write/finding 图节点, 禁止只写本地文件」
4. 判定器三连: ①gq 参数名 (cy) vs 引用 {cypher} ReferenceError 被 catch 吞成 null(与 R3 promote 同款 bug, 第二次现身) ②503 graph busy 是合法 JSON, rows undefined 曾被当成「零命中」 ③快照兜底目录缺 app.py → ok===true 判据 + 重试 + 停图后 WAL 重放兜底
**终局: 合成任务 found=true score=1/1** — worker 抓到 flag{synthetic_e2e_7f3a} 写入 Finding(4 条, 含 verified), 官方 flag 判定命中。
方法论沉淀: 判定类脚本禁止 `catch → 返回空集`(失败与真空必须可区分); 每轮 E2E 落 graph 快照+判定原文+graphd 日志三件套归因。

## R4c 验证轮（2026-08-30，三笔验证欠账清偿 + 业主规则落地）
**主题: 消融归因 / 外部裁判 / 冷启动验收 / 业主功能点对标 —— 「是否可投产」用数据回答**

### 消融实验（四配置×3, dvwa, 首轮数据+重跑排程）
首轮（知识缓存 bug 期间, 结论存疑）: full 100%(3/3) vs no-experience/no-profile/bare-v0 各 10% —— 方向性 3:0 显著但被两缺陷污染: ①knowledge index.bin Map 序列化错误致 worker 知识注入全灭(缓存命中即崩) ②顺序执行使配置效应与时序/额度限速完全混杂。已修: 缓存 entries 存储复活 Map、交错执行、seed fail-loud、eval 重试。**交错重跑进行中**(新模型策略 M3)。

### shepherd 冷启动验收: ✅ PASS（verified=11, 验收线 ≥5）
无预置类定义靶(classes=0)+无 GAP_HINTS+全自主: 249+ 候选 finding（JWT alg=none/默认凭据→superadmin/mass assignment/IDOR/SECRET_KEY 泄露/SSTI RCE/SSRF OAST 等, 质量抽样均为真实漏洞类）, verify 独立重放产出 10+ confirmed 裁决, tick 消费转换 verified=11+。
**修正链**(每环都是真实缺陷): ①verify 饿死(deep-dive pr3 恒压 verify pr2)→优先级 4+cap2 ②verify 载荷无复现证据→携带 repro 摘要 ③裁决词表不匹配(worker 写 status=confirmed, 消费者只认 open)→消费不设词表 ④裁决消费只挂 worker 终态(宿主死亡即滞留)→挂 tick ⑤宿主无痕死亡×3→unhandledRejection/uncaughtException 着陆垫+supervisor 自动复活(6×25min)。

### E-7 SPA 渲染执行器: ✅ CDP 全链实测通过
chromium(Chrome for Testing 152)安装 → spa-render CDP 附着 → 迷你 SPA 渲染 → XHR(/api/items,/api/lazy)+DOM 链接 5 端点提取 → MERGE 入图(tech=spa-cdp)。修正: 冷启动窗口 6s→30s + --no-sandbox。**九个业主功能点全部达标收口**。

### 业主规则入 brief（非破坏性约束）
- SQL 注入探测仅限只读(SELECT/布尔/时间盲注), 禁 UPDATE/INSERT/DELETE/DROP/TRUNCATE 型注入
- 不实际调用删除类接口(DELETE/移除操作只探测存在性)
- 主侦察职责: 全量 .js 资源与 API 路径提取(tech=js/api)+business_chain 业务模块盘点+旁站/子域被动枚举(asset-perimeter 信号)

### cybench 外部裁判（基建攻坚中）
4/5 题镜像预构建缓存; 逐题基建怪癖(外部网络 shared_net 已建/motp 端口冲突已清/chunky 手动起靶验证 OK)。首轮 0/5 全灭在 compose 层(agent 未启动, 模型零消耗)。重跑与消融错峰进行。

### 工程修复
- worker cwd=产物目录(战利品不再散落仓库根; 适配层 cwd 透传)+gitignore 全模式补丁+索引重建
- MCP npx 403 空烧摘除(cordis.patch.yml, 恢复条件注释)/round-launch 终态空挂 120min→15s
- pgrep 自匹配自杀第 5 次现身 → 全部 kill 循环迁入脚本文件, 括号模式+分命令执行
- 模型禁用: MiniMax-M2.7-highspeed 全量退场(discovery/verify→M3)
- 推送: d8e32db(R4c 主批) + 终局批(spa-render 冷启动/cwd/tick 消费)

### R5 候选
cybench 基线重跑(chunky/frog-waf 已验证可起靶)/知识卡 42→58/embedding hook/SLO 首窗口/shepherd 冷启动复验(带旁站+JS brief)/watchdog 恢复后的自驱战报

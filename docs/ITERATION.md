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

# d2d 全阶段编排（roadmap）

> 活文档：阶段状态由各批收尾回报更新。已完成梯队简记，未完成梯队详记。
> 悬置的「待拍板」项归用户，见 docs/state.md 决策账。

## 已完成（简记）
| 梯队 | 内容 | 成果 |
|------|------|------|
| T0 | 止血与合流（主干合流 v1.1.0/流程卫生/三缺口） | ✅ |
| T1 | 安全与信任基础设施（4-4 审批证据/4-8 七态机/4-3 工具面/Gate 锚/T1.6~1.9） | ✅ |
| T1.x 实战 | T1.6.1→T1.7.1→T1.8.1 完整攻击链首次闭环（22 findings/9 verified/零失败） | ✅ |
| T2-1 | 8.5 瘦身版（评测集 26 条/转化率/A/B/CNSR 5.73） | ✅ |
| T2-2a | 五方向四项（敏感扫描/无证据≠排除/种子卡 20/偏科检测；业务闸 P2 遗留→悬置小批） | ✅ |
| T2-2b-0~4 | sidebar 三条 + 浏览器环 4.5-0~4.5-4 全线收官（攻击档 V2 会话接管+V3 三件套实际影响证明） | ✅ |
| T3-1 | 阶段 5 瘦身版（卡片 Schema 260 张全过+A-MemGuard 共识 v1+misses 月度聚合+度量框架①③落地②设计就绪；零禁区触碰零授权申请；测试污染口径确立） | ✅ |
| HD-1 | 交接固化批（AGENTS.md/roadmap/state/do-not-touch 文档体系 + README 入口） | ✅ |
| T3-2-1~T3-2-6 | 阶段 6 六子批（联网扩源 / 6-1 经验→技能+角色过滤 / 6-3 插件打包 / 6-5 双向 MCP / 6-4 环内 supervisor+devlog 回填 / 闲时任务+自适应轮询+能力路由+收官） | ✅ **阶段 6 收官** |

## T3-2 · 阶段 6：学习升级 + 插件化 + 多 Agent 进化【✅ 收官（tag t3-2-stage6）：6-1~6-5 全落地；6-6 降级挂 T4-2，收益由 T3-2-6 承接】
| 子项 | 内容 | 要点 |
|------|------|------|
| 6-1 经验→技能 | MUSE-AutoSkill 式技能抽取 | ✅ T3-2-2/2b 落地（skill 存储+三门通道+抽取管道+角色过滤接线） |
| 6-2 联网搜索 | 免费被动情报 | ✅ T3-2-1 落地（CT log+Hackertarget，osintGet 网关化，osint-subdomain Signal） |
| 6-3 插件打包 Hook | 能力对外导出 | ✅ T3-2-3 落地（五形态导出框架+三攻击工具 dsh 注册+Burp XML 导出） |
| 6-4 环内 supervisor | 紧 scope 子 Agent | ✅ T3-2-5 落地（worker 工具形态 delegate_subtask：scope 严格子集+递归深度=1+cap 账本预检+治理门继承，零禁区；调度环自动创建切片实战后另批 4-3a） |
| 6-5 双向 MCP | 对外输出+对内发现 | ✅ T3-2-4 落地（只读 stdio server+sanitize-ingest 消毒链+配置驱动发现；docs/mcp-security-design.md） |
| 6-6 事件驱动并发 | worker 订阅事件流 | 轮询分配改订阅推送。【T3-2-0 审计 + 裁决降级】: Kùzu 无原生 watch, 真事件需 graphd 禁区通道 → 本体转长期项挂 T4-2; 收益由 T3-2-6 闲时任务+自适应轮询+能力路由承接。【✅ 终态（T4-2b 拍板 ⑤）】裁决链闭合: 双条件解锁（嵌入形态+原生事件机制双满足的候选出现才重评, 现矩阵内无满足候选——Memgraph 需放弃嵌入+BSL）|
| 吸收 | 闲时任务 + 按能力路由 | 挂调度器空闲窗口；配合容量账本 |
注意：6-3/6-5 直吃 dsh 宿主接口面；6-4/6-6 撞 scheduler 核心（2C 区等禁区），
预计走 4-3a 式显式例外，批次内拆 3-4 个子批推进。启动方式：先发
「T3-2-0 前置审计+拆批方案」再逐子批实施。

## T3-3 · 6.5 余项：可视化 + 授权数字化【✅ 收官（tag t3-3-stage65）；顺序 1→3→2 走完，盘点 docs/t3-3-finale.md】
- 星图可视化：覆盖象限热力图 + 假设泳道 + 攻击链桑基图
  （**T3-3-1 ✅**：热力 21 格/假设泳道五列/星图含候选连线提示——host 四路由只读通道+自绘 SVG 零图表库+渲染护栏；**T3-3-2 ✅ 桑基落地**：transition-log host 侧聚合+SankeyChart 家族过滤，稀疏注记不造数据）
- 授权契约数字化：结构化授权文件 + 验签收紧 scope
  （**T3-3-3 ✅**：ed25519 一体签名契约+seen-auth 防删除降级+四挂接点纯新增接线——零降级；验签失败不放行；P2P_AUTH_CONTRACT 缺省 off；runbook docs/auth-contract-runbook.md）
- 9 功能标签页：总览/审批/探索链路/漏洞资产/经验库/探索前沿/工具调用/审计/配置
  （**T3-3-2 ✅ 全通**：净新增 approval/chain/tools/audit 四 tab+config；桑基入 d2d:viz；审批纯 client 消费零后端；前沿提案池+评审代理；终态矩阵 docs/t3-3-finale.md §三）
- 侧边栏对等收口（**T3-3-2 ✅**：三分法真矩阵——对等/补齐[审批+任务看板+四页]/豁免[理由全登记]；docs/t3-3-finale.md §四）
- 8.5 余量三件（**全部定局**）：能力看板 ✅ 并入 T3-3-1 / 变异试点→#25 工具链冲突如实登记 / 评测集跑测→立项卡已登记 state.md，单独立项

## T4-1 · 6.7 分布式 Runner【已降级，未启动】
- 仅做隔离能力评估（E2B / gVisor 商品件调研选型）
- 集群暂停；重启条件=团队使用 + 单机资源成瓶颈（自用阶段不做）

## T4-2 · 阶段 7：存储层续命【✅ 决策+拍板完成（A 维持 Kùzu+归档；归档首执行/钉扎/探针=T4-2b）；B LadybugDB 转触发条件驱动预案（runbook docs/runbook-storage.md）】
背景：Kuzu 上游 2025-10-10 归档（Apple 收购），kuzu 0.11.3 绝版（wheel 冻结 CPython ≤3.14）。
- ✅ Kùzu 归档风险实锚：本地库 80MB/1.4 万节点，距公开痛点区（数百 GB）3-4 个数量级，3 年外推 <2GB——**规模触顶不在可见时间线内**；真实到期风险=生态（零修复/扩展服务器关闭/Python 版本冻结）
- ✅ LadybugDB 评估：Kùzu 原团队延续（v0.21.2 活跃，MIT），DDL/参数绑定/Python API 三面同构（逐项核对），强制改动仅 import shim+文件后缀；停机 EXPORT→IMPORT（Parquet）；**无原生事件机制**
- ✅ 6-6 重评判定：**矩阵内不成立**——唯一有原生 trigger 的候选（Memgraph）需放弃嵌入形态+BSL 许可，超出"存储层续命"范围；重评条件精确化登记
- ✅ 拍板完成（附录 D 六点）：A 维持 Kùzu+归档 / 归档参数（季度 EXPORT+里程碑 tag 顺手、快照 3 份滚动、裁剪 >500MB 再议）/ 钉扎立即执行 / B 预案 runbook 化 / 6-6 双条件解锁终态 / 探针落盘——T4-2b 已执行归档首执行+钉扎+探针；恢复演练=开放项

## T4-3 · 阶段 8：信任加固【前置审计完成，**待用户拍板拆批方案**（docs/t4-3-plan.md：四子项均上游语境一行概称——定义卡/差距矩阵/3+1 批建议/6 拍板点）】
- 8-1 共识验证 v2：推理路径字段正式入库（依赖 T3-1 A-MemGuard 离线版先行——已落地）
- 8-2 双签升级：N-of-M 已砍，改异构化+分歧调和（多模型独立验证，分歧进调和流程）
- 8-3 gatewarden 自攻击验证：对门禁系统本身做对抗测试
- 8-4 Adaptive Stability Controller：自适应稳定控制器
- 原 8-5 SAGE 四支柱已随五术语清理删除（上游规划文档不存在，仓内零占位）

## T4-4 · 4-7 OpenTelemetry【P2 挂起，外部依赖】
等 OTel GenAI 语义约定正式版（现在做会返工）。内容：全链路 trace +
metrics 标准化。上游一动随时可插队。

## T4-5 · 阶段 9：仓库清理与发布【终批】
- 分支 --no-ff 合并、老基线分支清理（archive tag 已留回滚点）
- 目录重组（参考 MiniMax Code 结构）、README 重写、CHANGELOG.md
- npm 发布：Trusted Publishing OIDC + SBOM + provenance
- GitHub Release + npm 双通道
- 报告模板引擎：补天/漏洞盒子/教育 SRC 三格式
- 双语 SECURITY.md（唯一破例）
- 前置：A/B 报告脱敏（真实 engagement 名处理，见 state.md 开放项）

## 悬置小批（不占梯队号）
| 小批 | 内容 | 时机 |
|------|------|------|
| 业务闸 | 业务形态卡（业务工作流/预期约束/参数语义/已识别缺口）+ <business_gate> 注入 + 派发深环前检查；落点 domain/business-card.mjs 纯函数；schema 未定义、WSTG→图结构映射未做、与 coverage 象限关系待澄清。注意：agent_status 注入点在 scheduler 2C 禁区，须走 4-3a 式显式例外 | T3-1 后独立小批（下一批候选） |
| 滞留信号回填 | 5 场 50 条 finding-* Signal 历史回填 | 独立小批随时插 |
| 三攻击工具 dsh 注册 | form-fuzzer/logic-tester/race-condition 注册为 dsh worker 工具 | 随 T3-2 6-3 |
| V3 独立外带端点 | 当前 audit.jsonl+/api/search 已够闭环 | 按需不排期 |
| 检索有效性采集 | recall@k/MRR 逐 brief 快照（retrieval-trace.jsonl 方案，docs/brain-audit-runbook.md §6.1） | 需 scheduler.js 邻域授权 |

## 时序
T3-1[✅] → HD-1[✅] → 业务闸小批/滞留回填小批（穿插）→ T3-2（拆 3-4 子批）
→ T3-3 → T4-2/T4-3/T4-4（独立，可并行或串行）→ T4-5（终批）
T4-1 动手前提=团队使用出现前。

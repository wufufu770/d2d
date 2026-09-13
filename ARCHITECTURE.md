# ARCHITECTURE

d2d 是跑在 dsh（DeepSeek agent 宿主）上的自主渗透测试插件：三环并行（discovery/deep/creative）+ 独立 verify 闭环 + Kuzu 图黑板。本文档描述真实数据流与模块边界（0909 重写）。

## 1. 全景数据流（从 /pentest 到 Finding 落库）

```
用户(dsh web 会话或面板) ──写 Engagement{status:'requested'}──▶ graphd 图队列
        │                                                          │ ≤15s 采纳
        ▼                                                          ▼
  scheduler.js startEngagement ──租约(leased_by/120s TTL)──▶ engagement active
        │
        ├─ tick 循环(45s): reweightSignals → assetRingTick → 补链环规划
        │     └─ briefs.mjs 生成角色专报(asset/info/降级版) + Gate-D1 基线
        ├─ 派 worker: adapter-dsh.mjs spawn `dsh --profile headless`(临时 DSH_HOME 换模型)
        │     └─ worker bash 命令经 checkBash 链式门: scope/denylist → tool-policy(限速/熔断/基线/输出治理)
        ├─ worker 写回: 只能经 graphd /write/*(denylist fail-closed + CONFIG_ADVICE 源头拒收 + 签名去重)
        ├─ triage.mjs: Jaccard 语义去重 + chainSig 链归并(#89) → candidate/triaged/rejected
        ├─ validator.js: Gate-V 验证(L0 被动/L1 授权硬门/CDP 通道) → l1-passed/l0-confirmed/l0-none
        ├─ 双签: critical/high 由第二模型独立复核(只给原始材料) → verified/disputed
        └─ src-export.mjs: Gate-R 覆盖对账(「覆盖：M/N」=台账实测) → 报告
```

## 2. 环与角色

| 环 | 职责 | 角色 |
|---|---|---|
| discovery | 资产面+信息面侦察 | asset-recon(测绘/指纹/归属)/info-recon(端点/JS 入口/参数)/wmpf-recon(小程序/加密)/recon-generalist(任务通道) |
| deep | 漏洞挖掘 | 8 个 specialist(auth-bypass/business-logic/crypto-audit/cve-chainer/deserialization/file-attack/frontend-attack/injection/misconfig/ssrf)+exploit-chainer 兜底，按 signal_affinity 路由 |
| creative | 创造性发现 | 反思唤醒(1/3)，唤醒耗尽→exhausted |
| verify | 独立验证 | 不与 deep 争抢容量;validator 分级 L0/L1 |

接力依赖：asset-recon → info-recon 串行（asset 未产出时 info 用降级简报）；资产环收敛三条件（新增资产<3/新指纹=0/连续 2 轮无新增）。

## 3. Finding 状态机（七态）

```
candidate ──auto-triage(去重/链归并/口径拒收)──▶ triaged ──Gate-V 过──▶ verified ──▶ fixed
    │                ▶ rejected(近重复/口径)                      │
    └──graphd 源头门(CONFIG_ADVICE+low/info 4xx 拒收)             └──disputed(双签不一致)
frozen(存量待迁移) / rejected(红线越权永久隔离)
```

## 4. graphd schema（Kuzu，127.0.0.1:8766）

节点：Engagement(name/target/scope/auth/status/cancel/leased_by/instances/objective/created_at)、Finding(id/severity/title/repro/evidence_dir/gate_status/eng…)、Signal_(type/weight/host/eng)、Endpoint(url/host/port/authorized/eng)、Hypothesis、ExperienceWeight(id=card:<id>/wins/hits)、Task(kind/eng/status)。

**唯一写通道 = /write/***（host/worker token 分级）：denylist fail-closed、CONFIG_ADVICE_RE+low/info 源头拒收、签名去重、authorized 只升不降且 host token 专属。读走 /query（Engagement 的 CREATE/MERGE 也经 /query）。

## 5. worker 生命周期

1. 派发：adapter 选模型(model-policies 五角色 discovery/deep/creative/verify/study 各 {primary,backup})→ 临时 DSH_HOME(硬链接+改写 agent-default-model)→ spawn headless dsh
2. 约束：step 硬上限(默认 45,到线软着陆 +50% 一次)→杀进程组；深环 10min 短超时；简报预算≤4K
3. 终态：sessionCounts 解析 step/tool/compaction/**token** 写 model-usage.jsonl；quota 识别(QUOTA_RE)→死亡名单；连续失败 3 次→该工具冷却 60s
4. 停机：stopAll 写 cancel 令牌 → worker 下次图读写 409 优雅退出 → worker 全灭 90s 看门狗 stopAll 冻结 → 90min 硬上限兜底；交接摘要 handoff-latest.md(全段按 engagement 过滤)

## 6. 门禁体系（模型不能自评门禁）

- **Gate-D1** 侦察基线（七项齐才派深环）／**Gate-V** 验证（对照三件套+确定性信号锚）／**Gate-R** 报告（覆盖 M/N 算术对账+未收口意图拦终版）／**Gate-P** 派单四字段（任务标识/授权边界/唯一子目标/成功标准）
- 红线三层：scope `!` 排除 → bash 门(checkBash 链) → graphd 写门；判定落 gate-log/enforce-log 审计

## 7. 知识脑（自进化）

```
文章(inbox) → study.mjs 蒸馏(signals/negative_controls/adaptation_prompt 三必填) → shadow 影子池
   → promote(实战 wins≥3 门禁③) → current 现役
检索(knowledge-retrieval): 得分 = 相关性 × (1+0.3·wins/(wins+3)) × 0.5^(闲置天数/30)
   → 全文注入 brief 记 usage → wins 归因(used_knowledge) → misses.jsonl 缺口反哺 study 选题
```

## 8. 面板（d2d-panel）

宿主半区(host/)：`/d2d/api/snapshot`(fail-closed) + fleet 模型切换 + finding transition + W5 engagement 管理。客户端半区(client.js)：侧边栏卡片流（findings 四列/黑名单 CRUD/环容量热调 caps.json/Fleet 模型矩阵/策略库/模型用量/性价比）。全页大屏 spec 见 docs/PANEL-UI-SPEC.md §11。

## 9. 目录速览

```
plugin/pentest-dsh/   scheduler.js(调度主线) adapter-dsh.mjs worker-env.js
  domain/             allocator briefs caps triage verify-verdicts failover memory-store tool-policy strategy-card strategy-map scope safe-url experience knowledge-retrieval lifecycle digest
  roles/              asset-recon info-recon wmpf-recon + 8 specialist + exploit-chainer(redteam-theorist/dev-fresh-eyes)
scripts/              recon/(资产收集+测绘四平台) browser/(cdp-proxy/match-site) brain/(study/promote) ops/(doctor/scan-clean/verify-main/publish-clean…) systemd/
graphd/app.py         图服务(schema/写门/迁移/授权)
```

## 10. 分层对照（vs 串行五层架构图：主控/侦察/黑板/攻击/创造/判定/报告）

| 图中层 | d2d 对应 | 备注 |
|---|---|---|
| 主控(建模/派兵/裁决/报告) | scheduler.js(startEngagement/runWorker/applyVerifyResults/writeDigest) | 裁决下沉到 verify 环+双签(执行层不自审) |
| 侦察层 recon-orchestrator + wmpf-recon | discovery 环: asset-recon/info-recon/**wmpf-recon(小程序/加密,signal_affinity 11 词)**/recon-generalist | asset→info 串行依赖 |
| 黑板 graph_store.json | Kuzu 图(graphd 写门/denylist/租约) | 图 DB 优于单 JSON |
| 攻击层 exploration→attack | discovery→deep 门控晋级(Gate-D1 基线+deepWake 权重/typeFloor 单源唤醒) | 并行竞速+门控晋级,非锁步串行 |
| 创造层 deep-dive-hunter[反思] | creative 环(反思唤醒 1/3,耗尽→exhausted) | 并行+反思触发 |
| 判定层 vuln-judge[confirmed/否决] | verify 环+validator(Gate-V 确定性锚/L0-L1/授权硬门)+双签+auto-triage | 三态+否决要证据 |
| report_generate | src-export+Gate-R(覆盖 M/N 对账) | |
| [成功][反思]+策略沉淀/进化 | verify→evolution.jsonl(confirmed/refuted)→validated×1.1 检索强化+promote 降级复审+wins 回流+misses 选题 | 0910 补显式进化回路 |

## 11. 模块清单（plugin/pentest-dsh）

### scheduler/ — 编排子模块（ctx 工厂注入，scheduler.js 组装）
| 模块 | 职责 |
|---|---|
| state.mjs | 内存状态工厂 + Engagement 视图/暂停文件/黑名单/归属解析 |
| caps.mjs | 面板热调（容量 caps / deepWake / 资产收敛 / 工具治理），文件>env>默认 |
| lease.mjs | 调度器租约 CAS（认领/接管/心跳续约，双主防护） |
| gates.mjs | 四道门编排：Gate-D1 深环启动门 + verify-result 消费/双签（Gate-V） |
| workers.mjs | 派生 runner（多开）、会话 token 解析、上下文引用收集 |
| loop.mjs | tick 主循环：栅栏/心跳/裁决消费/自动分诊/信号加权/涟漪/跨模块/补给/派发/收敛 |
| digest-bridge.mjs | 交接摘要（跨模型接管）+ verified 高危 webhook 通知 |
| experience-bridge.mjs | 经验沉淀/去重/收割/聚簇反哺 + 自动 study 接线 |

### domain/ — 域模块（可单测纯逻辑 + 图 IO 混合）
| 模块 | 职责 |
|---|---|
| allocator.mjs | 补给/派发规划纯函数、深环路由（三级评分+prefer）、信号加权、覆盖象限、候选连线、跨模块配对 |
| briefs.mjs | 全环简报文本（发现/深/创造/验证/任务工人 + 资产/信息专报 + CTF），硬规则 A-I 与产星契约 |
| caps.mjs | caps.json 解析/合并白名单 |
| digest.mjs | 交接摘要构建（fallback 逐段降级） |
| experience.mjs | 经验 upsert（拉普拉斯先验）/dedupFindings(eng 隔离)/harvest/聚簇目录 |
| failover.mjs | 失败分类/额度命中/熔断回路（网络宽限二分） |
| gates.mjs | Gate-D1/V/P 纯判定 + needsDualSign |
| knowledge-retrieval.mjs | L1 关键词 + L2 trigram 余弦混合检索，credits/heat/evolution 加权 |
| lifecycle.mjs | 图状态栅栏/取消令牌/租约可写/孤儿判定（纯函数） |
| memory-store.mjs | 知识脑记忆语义：热度衰减/读取记账/双时长过期/misses 台账 |
| safe-url.mjs | 出站 URL 门禁 |
| scope.mjs | scope 解析/hostAllowed/checkBash（curl 目标提取）/URL 版 hostOf |
| strategy-card.mjs | 策略卡编译（单行作战指令） |
| strategy-evolution.mjs | 进化台账（confirmed/refuted → validated 强化/降级复审） |
| strategy-map.mjs | 技术栈别名/指纹匹配/多通道合并 |
| tool-policy.mjs | 限速表/熔断/输出治理/六级兜底 |
| triage.mjs | 自动分诊（Jaccard+trigram）/u\|host\|path 签名（hostOf 同名异义, 仅内部用） |
| verify-verdicts.mjs | 裁决词表/证据解析/Gate-V 确定性锚 |

### 入口文件
- `scheduler.js` — createScheduler 组装 + runWorker 派发内核 + startEngagement/stopAll 生命周期 + 孤儿自愈
- `planner.js` — 攻击假设规划（Plan 节点产出，eng 归属）
- `validator.js` — L0/L1 分级验证器（worker 侧自证与独立重放）
- `adapter-dsh.mjs` / `adapter-inprocess.mjs` — 宿主适配器（headless spawn / 进程内）

### scripts（仓库级运行时）
- `scripts/wmpf/wxapkg.mjs` — 小程序包定位/解包（未装工具如实阻塞）
- `scripts/wmpf/wmpf.mjs` — WMPF 调试器 CDP 六动作（只连本机回环）
- `scripts/brain/strategy-learn.mjs` — 从 URL/文件/文本学策略（出站 SSRF 防线）→ 知识脑草稿

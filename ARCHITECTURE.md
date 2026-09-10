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

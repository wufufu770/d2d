# XR-P1 写面接线 smoke 实录（2026-10-05）

> 双 smoke 本地实测：端到端真 worker（拍板 2 授权，M5 前沿门槛显式豁免=管道验证）+
> 熔断双路径（拍板 3，零模型成本）。生产 :8766 零写（smoke 全程独立 graphd 测试实例）。

## 一、端到端真 worker smoke（scripts/xring/smoke-e2e.mjs → experiments/results/xrp1-smoke-e2e.json）

| 环节 | 结果 |
|------|------|
| 独立 graphd 测试实例 | :20675 起（tmp kuzu 库+双 token）；生产 :8766 仅只读探活零写 |
| 安全取证① | **X-Ring worker 形态（无图 token）对 /write/finding = 401**（token 剥除达成，强于 graphd 侧拒绝） |
| 安全取证② | 既有 worker token 对结构化写面 = 200 可达（**I-013 既有设计**=scheduler worker 回写通道；graphd 侧是否加固归用户裁决） |
| spawn | adapter.spawnWorker({ring:'xring',task,cwd}) 直调，微任务"读 input.md→产 hypotheses.json+lessons.json"，36.5s 自然退出 code=0 |
| monitor | 真计时+通道①转录累计+stop-request/budget 双路消费挂核（本轮未触发熔断=预算内完成） |
| 回流 | **written=2（B 级 H-1 + C 级 L-1）errors=0**；host token 持写权 |
| 图内验证 | Experience 按 eng_id 查得 **1 行 status='quarantined'**（写入即隔离语义复用）+title 字段保真（"environment: 探测前未核对靶机时钟…"） |
| 实录 | experiments/results/xrp1-smoke-e2e.json（worker 耗时/usage/reflow/图验/auth/events 全链） |

### 实测发现两项（登记）
1. **graphd token 分级实测**：worker token 对结构化写面（/write/finding|signal|hypothesis|endpoint）**可写**（400=repro 校验非 401；I-013 既有设计）；host-only 面（transition/dual-sign）403。X-Ring 不受影响（env 剥除全 token，图不可达）。**是否 graphd 侧收紧（worker token 降只读）归用户裁决**——动既有 scheduler worker 回写通道，本批零触碰。
2. **Experience id 服务端生成**：/write/experience 忽略请求 id，服务端 `exp-<uuid>`（graphd/app.py:988）——reflow 按 eng_id 追溯（图内验证口径已对齐）。

### 已知问题（P2 排查，不阻塞）
smoke 重跑存在非确定性挂起（worker resolved 后收集段；首跑成功实录完整；collectTranscriptUsage 独立复刻 45ms 正常）——疑与 worker 5 分钟熔断 SIGKILL 后转录落盘时序相关。smoke 为本地集成工具非 CI 面。

## 二、熔断双路径实测（scripts/xring/smoke-budget.mjs → experiments/results/xrp1-smoke-budget.json）

| 路径 | 注入 | 五步结果 |
|------|------|----------|
| ①超时 | stub worker（detached sleep 组）+3s 预算 | budget-exceeded→**SIGTERM→SIGKILL（组杀真执行，worker 确死）**→partial.txt 可读→stop 事件 reason=budget 全落 ✓ |
| ②token | 预置大 usage 转录（3×60000=180000>100000，zstd 桶名与 sessionsBucketFor 对齐） | 同五步全落，lastTickDetail="180000 >= 100000" ✓ |

**边界⑦预算硬熔断语义实证成立**（止损非解决：单次最大报废额=预算内）。

## 三、实施中发现并修复（本批份内）
1. **monitor 递归扫描修复**：真实 dsh 转录形态=sessions/<cwd 桶>/session-<uuid>/session.v3.jsonl.zstd **三层**——P0 版只扫两层在真形态 files=0（XR-P0 测试恰好造两层未暴露）；改递归 walk+sessionsBucketFor(workspace) 桶限定（全量扫历史桶随运行次数线性变慢的 smoke 卡点一并消）。
2. **zstd 后缀**：CLI 产 `.zst`、dsh 产物=`.zstd` 双 d——smoke 预置 rename 对齐。
3. **会话转录会话级落盘时序**：运行中仅 session.lock，退出才压缩落盘——**运行中 token 增量累计不可得**（定谳）；token 熔断实测按拍板 3 原口径=预置转录。真运行形态的 token 主旋钮退化为时长+P2 接会话 tail。
4. **Hypothesis 归属兜底**：graphd pick_write_eng 无 active engagement 时落 eng=''（数据不丢，面板可视）——smoke/测试查询口径对齐。

## 四、成本实测
- 端到端 smoke：真 worker 36.5s（微任务），转录 usage 0 计入（转录落盘时序见 §二.3——真 usage 以 .dsh 会话文件留存，非熔断面）；graphd 测试实例全程 <1 分钟。
- 熔断双路径：零模型成本（stub+预置转录），全程 12s。

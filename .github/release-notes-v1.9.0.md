# d2d v1.9.0 — 1.7.0 以来的四批提升（测试基建/实战效能/智能化/产品面）

pentest-dsh 1.9.0。安全面纪律不变：WorkItems 影子模式缺省开、拉式源零入站端口、写面 host-only、出口治理三层原样。

## Added

### 1. 测试基建
- **E2E 驱动入仓**（scripts/e2e/run.mjs）：五套件——align 静态对齐闸 / a 数据面 / b WorkItems 生命周期 / c 双图锚点 / d engagement 启动流；`npm run e2e`。
- **align 闸 CI 化**（align.yml）：push/PR 触发纯静态检查——前后端功能对齐机器闸（30 路由↔21 消费点）。
- **覆盖率基线**：c8 接入 `npm run test:cover`——行 90.19% / 分支 75.53% / 函数 93.64%（基线与热点 docs/coverage-baseline.md）。
- **季度归档自动化**：graphd-archive.sh + d2d-archive.timer（EXPORT DATABASE→3 份滚动）。

### 2. 实战效能
- **TRANSPORT adapter 级自愈**：worker 断连→指数退避重试（缺省 3 次，env 可调）；契约零变；429 分支行为保持。
- **cold_digest 大 brief 冷摘要**：恒等承诺（≤9KB 零改动）+ 分级压缩（falsified/negative 白名单零压缩）——接力大 brief 传输失败的机器级防线。
- **步数帽 per-ring 策略表**：`P2P_MAX_STEPS_<RING>` 覆盖 > 全局 > 60。
- **任务书纪律块**：秘密/flag 同级计分排位前移 + 报告成稿预算 70% 强制点（机器注入）。

### 3. superagent 深化
- **Eval 门 assessor 判级层**：三态 fail-safe（决策采信/规则回落/抛错影子）——纯规则缺省路径零行为变化。
- **webhook source**：POST /hook/workitems（oast 通道复用，timingSafeEqual 校验，投递箱单一事实源）。
- **飞书/钉钉 Source 骨架**：解析+轮询形态，env 注册位缺省关（钉钉 Stream 差异如实登记）。

### 4. 产品面
- **资产反查可视化**：FINDING_ON/TOUCHED 锚点边 + backlinks 路由 + Findings 展开区已锚定资产。
- **报告导出 UI**：ConfigView 卡（severity 选择→markdown 报告，台账防重复提交）。
- **KPI 分显**：待人工（红）/影子（黄）分色。

### 5. 存储
- **kuzu 退役**（LBD-2 观察期满）：缺省引擎翻转 **LadybugDB**，pytest 443 全绿；季度归档 timer。
- ⚠️ 部署提醒：kuzu_db.wal 残留会让 LadybugDB 拒开旧库——升级走 runbook §八 EXPORT→IMPORT 迁移，不可原地打开。

## Changed
- egress 网关缺省端口 8888→**18888**（env 仍可覆盖）。
- graphd VERSION 1.8.0；requirements 唯一图引擎 ladybug==0.21.2。
- defineTool author DSL 对齐 0.2.x（required 必须为 true/数组 items 显式形态）。

## Fixed
- snapshot quarantine 查询 TIMESTAMP 混型（Binder exception → 503）修复。

## 验证口径

pytest 443（LadybugDB）/ mocha 2274 / panel 97 / align 3/3 / E2E 四套件全绿（WorkItems 闭环实证）。

## 资产

SBOM（CycloneDX）+ 三平台报告字段映射样例 + **每 OS 源码包**（linux/windows/macos）+ **GHCR 镜像**（ghcr.io/wufufu770/d2d，graphd 全栈）。

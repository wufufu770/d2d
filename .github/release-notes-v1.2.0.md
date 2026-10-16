# d2d v1.2.0 — P1 产品环（复战→抗欺骗→交付）

pentest-dsh 1.2.0：1.1.0 验证机器正式版之上的产品环里程碑。

**包面诚实口径**：本版三能力为编排层（仓内 scripts/xring）能力——npm 包面不含该层，本版发布为版本对齐语义（npm 版本与仓内里程碑同步）；包文件集与 1.1.0 全同。

## 三能力（编排层，first-run 任务书模式自动生效）

### 1. 跨 run 接力（handoff 自动消费）
- run 收尾自动在同目录产出 `handoff.json`：认识论标签制四载体——**facts**（已机械验证）、**leads**（未验证假设）、**falsified**（已证伪）、**env**（路径级响应指纹基线）。
- 下一轮 `first-run --from-record <上一 run 目录>` 自动消费注入：facts 入战果底账（免重扫）；**leads 以假设形态注入（复验优先，不采信）**；falsified 入排除表（禁复测同路径）；env 基线供跨轮漂移检验。
- 无 handoff（首战）=零注入，行为与旧版一致。

### 2. 环境一致性检验（ECC——advisory 信号，非硬闸）
- 探针期自动检验：单轮异构路径指纹趋同/同路径双探翻转（tarpit 嫌疑）+跨轮指纹漂移（目标形态突变）+CSP 暴露非目标 origin（部署拓扑线索）。
- 信号以 **advisory** 呈现：任务书注入（worker 自行降档）+handoff 环境画像+报告 caveat——不阻断任何 run。`--no-ecc` 可整体关闭。

### 3. 报告自动化（run 目录 report/）
- 收尾自动产出：`butian.json`/`vulbox.json`/`edu-src.json`（三外部格式，**只含已验证 findings**）+`ab-report.md`（内部全量面：含 leads/falsified/环境评估/接力消费摘要/caveat）。

## 验证口径（诚实声明）
机制级证据=离线合成 e2e 七断言闭环（复战环：handoff 消费/leads 注入/fact 复验失败→falsified/ECC 单轮触发/跨轮漂移检出/报告分面/基线再产出）+三轨全绿。**实弹面未考**——ECC 真实目标假阳率/handoff 复战效用/报告面实弹产出列入持续验证台账，随实弹逐项入账。

## 资产
SBOM（CycloneDX）+三平台报告字段映射样例（补天/漏洞盒子/教育 SRC，脱敏版）。

# d2d v1.3.0 — 意图运行时+第二视角+竞速验证+修复后复测

pentest-dsh 1.3.0：外部调研四源思想的原生实现（零外部依赖），P1 产品环之上的作战增强里程碑。

**包面诚实口径（承 1.2.0 先例）**：四项能力为编排层（仓内 scripts/xring）能力——npm 包面不含该层，本版发布为版本对齐语义；包文件集与 1.2.0 全同。**全部默认关闭或加性——升级零行为变化。**

## 四能力（编排层，first-run 任务书模式）

### 1. Intent 意图运行时
- worker 收尾可声明 `intents.json`（下轮探索方向：id/direction/status/spawned_from）。
- 跨 run 自动继承 **pending** intents（completed/abandoned 不传）；注入优先级带=**低于 facts 复验、高于新 leads**。
- 语义边界：leads=未验证假设（有证据没验）；intent=已决定的行动方向（可能还没开始执行）——互斥不重叠。

### 2. Advisor 第二视角
- 验证连败 ≥3 次（可配阈值）自动触发：**同模型新开干净上下文**（历史摘要+失败序列+硬边界+上轮建议防重复）——只输出建议（换角度/换工具族/建议放弃），不执行任何工具。
- 建议落 workspace/advisor.md（主 worker 可读面）+handoff leads（origin=advisor）——失败历史跨 run 传承，防重复同一死法。

### 3. 竞速验证（默认关）
- repro findings 可带 `variants`（≤5 组 steps 变体）；开启后多策略并行重放——**先 pass 者胜**、败者结果弃置入档（evidence 带 race✓ 可追溯行）。
- 与机械验证互补；环境可疑时多策略同答=环境可疑旁证（与 ECC 协同）。

### 4. 修复后复测
- 人工/上游在 run workspace 落 `remediated.json`（修复标记）→ `first-run --retest <run 目录>`：facts∩标记机械重放（零 worker 零 LLM）。
- 语义对偶：falsified=证伪防复测 / remediated=修复后复测（exit 3=存在复测失败）。

## 验证口径（诚实声明）
机制级证据=离线合成断言闭环（Intent 继承/Advisor 触发与缺省零行为/竞速胜出与缺省关/复测流转——全 fake adapter 零真进程）+三轨全绿。编排层能力已经**两轮单目标授权环境真实场验**（ECC 判级/接力消费/报告产出——1.2.0 台账首批数据）；四项新能力的实弹首考列入持续验证台账待入项。

## 池登预告
资产图跨任务共享/报告证据与局限字段/长 run 记忆压缩/auto-fix 造修复（攻不守定位观察项）/渐进式披露三层加载——详见 roadmap R-25~R-29。

## 资产
SBOM（CycloneDX）+三平台报告字段映射样例（补天/漏洞盒子/教育 SRC，脱敏版）。

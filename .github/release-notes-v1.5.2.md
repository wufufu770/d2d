# d2d v1.5.2 — dsh 0.2.1-rc.2 统一重锁+契约归一化前置闸+夜链组件

pentest-dsh 1.5.2：宿主升级引发的成对适配（E36-r0）+X-Ring 契约归一化（E34-r0）+平台-图对账旗标+夜链无人值守组件入仓（E35）。**dsh 0.2.x 全谱适配**——六包/宿主 CLI/sidebar 三方对齐同基线。

## Changed

### 1. dsh 版本基线重锁（E36-r0）
- 六包 @deepseek-ai/dsh-* 0.1.1-rc.2→0.2.1-rc.2（与宿主 CLI 内置 node_modules 同版；dsh-tools exports 面逐字一致、defineTool(options) 签名不变——API 面零破坏实证）。
- install.sh CLI pin 同步（行号守恒，锚点测试不破）。
- dsh-better-sidebar 0.17.1→0.24.1 成对升级（compat 表 0.2.x 区间转当前基线；校验入口 `node scripts/ops/verify-dsh-version.mjs` 五项全绿）。
- web profile 移除 dsh-sidebar-leap（上游 0.3.2 peers 钉 client-runtime ^0.1.0-rc.8，被 0.2.x 宿主拒载——兼容版发布后回加；导航增强件非功能依赖，panel 走 better-sidebar 通道不受影响）。

### 2. defineTool author DSL 收紧适配
- required 属性出现必须为 true（required: false 20 处删除——d2d 自家校验真值判断语义等价，worker 调用面零行为变化）。
- 数组类型简写 string[]/object[] 不再支持，改 array+items 显式形态（items 位 object 显式 additionalProperties）。

## Added

### 1. 契约归一化前置闸（E34-r0）
- normalizeRepro/normalizeHypotheses/normalizeLessons 纯函数：id 缺连字符稳定重映射/variants ≤5 裁切保主力/枚举串场归位/根元数据时区补全——**合规输入恒等零改动**。
- reflow 三段接线（读盘→归一→validateAgainst），归一履历 contract-normalized 事件入流。
- 回放验收：三棒九份违约原件→归一化→schema 全过（39 项归一化）。

### 2. 平台-图对账旗标（E34-r0）
- first-run --score-panel：起跑基线+终态对账；分涨图零增→platform-graph-divergence 事件告警（Goodhart 脱钩机器级监测，不靠人盯）。

### 3. night-chain 无人值守组件（E35-r2）
- scripts/ops/night-chain/（chain-wrapper.sh+seed-gen.py）：4 槽链式过夜（槽间 5min 冷却）。
- 链级治理五件：6M 总 token 线/靶场健康预检 park/周窗限流 park/任务完成传播（STATUS 行）/发射旗标核对清单。
- 文档续接：槽 N+1 任务书=基础+前棒 handoff 种子 9KB 封顶（报告摘要/leads/负向/持留/秘密进度五项）。

### 4. first-run --max-tokens 旗标（E35-r1）
- cap 2M 拒绝不 clamp（同 cli 哲学）；长窗批显式化发射参数。

## Fixed

- adapter-inprocess 测试 mock 对齐 0.2.x 事件词汇：assistant/message 事件必带 stream: AssistantStreamRecord[]（dsh-session types 权威——真实 agent 产物自带该字段，生产路径无恙，纯 mock 落后词汇）。

## 验证口径

mocha 2222（CI 口径 `npx mocha "test/*.test.mjs"` 全量）/panel 96/verify-dsh-version 五项全绿（含 manifest node_modules 段 18 条哈希）/check-dsh-compat pinned 列 PASS/web profile 启动冒烟=全工具族注册（browser-attack 三工具+supervisor delegate_subtask+闲时框架+授权契约，HTTP 401 鉴权正常，零 error/skip）。

## 资产

SBOM（CycloneDX）+三平台报告字段映射样例（脱敏版）。

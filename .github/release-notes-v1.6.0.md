# d2d v1.6.0 — dsh 0.2.2 成对适配 + superagent 机制移植 + workspace 主面板全页

pentest-dsh 1.6.0：d2d 从"侧栏观测台"跃迁为"dsh 内全页控制台 + 事件驱动接单"。三件套：**WorkItems 事件驱动框架**（superagent 机制移植）/**workspace 主面板**（十签全页）/**dsh 0.2.2 成对适配**。安全面纪律不变——影子模式缺省开、拉式源零入站端口、写面/范围门/出口治理三层原样。

## Added

### 1. WorkItems 事件驱动框架（superagent 机制移植）
- **状态机**：trigger_received → eval_queued → accepted|eval_shadowed|rejected|needs_human → assigned ⇄ needs_human → done|expired；迁移表 fail-closed（非法迁移恒拒）。
- **Eval 规则门**：影子 > 源名单 > 作者名单 > 在办容量 > accept 四判优先级，纯规则不调模型。
- **拉式源（零入站端口）**：文件投递箱（`$D2D_DATA_DIR/sources/inbox/*.json`，处理完挪 `.processed/`）+ GitHub issues 轮询（`P2P_WORKITEMS_GITHUB=owner/repo`，水位去重）。
- **影子模式缺省开**：主动触发只记录判定不派发（superagent "start narrow + shadow mode" 同口径）；人工在面板「待人工」页放行。解除：`P2P_WORKITEM_SHADOW=0`。
- **注意力通知**：只在 needs_human（一次一个具体问题）与结果就绪时说话，走既有 notify webhook。
- 触发去重（规范化哈希幂等，重放安全）；模块纯注入式可测，单测 15 例。

### 2. workspace 主面板全页（d2d-panel 0.3.0）
- `ctx.slots.inject('main')` 全页注册 + `sidebar.panellist` 左栏图标（dsh-superagent-prototype panel 同机制）。
- 十签顶栏导航：态势 / 待人工 / Findings / 可视化 / 审批 / 链路 / 工具 / 审计 / 配置 / XRing——复用既有视图层（零新视图），轮询随激活签门控。
- better-sidebar 侧栏 tab 保留为快捷入口（两形态并存，D3 决策）。
- 面板 WorkItems 数据面：`GET /d2d/api/workitems`（列表+摘要）/ `POST`（人工放行/否决，迁移校验复用 workitems.mjs 单源）。

### 3. dsh 0.2.2 成对适配
- 六包 0.2.1-rc.2 → 0.2.2-rc.1（dsh-tools exports 面零破坏实证）；CLI pin 同步（install.sh 行号守恒）。
- dsh-better-sidebar 0.24.1 → 0.31.1 成对升级（peers 实证钉 dsh ^0.2.2-rc.1 + cordis ^4.0.5）。
- **宿主破坏性变更适配**：dsh 0.2.2 移除 `webRuntime` 服务——面板 host 半 inject 去除，信任栅栏以回环判定+同源闸保留（缺省绑定形态行为不变）。

## 验证口径

mocha 2237（2222 既有 + workitems 15 例）/ panel 97（+主面板注册用例）/ verify-dsh-version 五项全绿 / pinned 列 compat 冒烟 PASS / **boot 冒烟零 pending 全激活**（0.2.2-rc.1 宿主 + 全工具族 + WorkItems 框架挂载）/ **WorkItems 端到端实证**（投递箱 trigger → 去重入库 → 影子判定 → 单一事实源落盘）。

## 债项（归 1.7.0）

双图锚点（graphd schema 邻接禁区，需显式授权批）；漏洞复测三态会话（verifyRunner 语义链）；reArtex 意图运行时契约 / cold_digest 大 brief 压缩。

## 资产

SBOM（CycloneDX）+ 三平台报告字段映射样例（脱敏版）。

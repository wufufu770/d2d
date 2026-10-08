# d2d

**三环并行自主渗透测试框架** —— 发现环 / 深度攻击环 / 创造探索环三类 agent 并行竞速，共享图数据库黑板，自带星图认知层、知识脑与观测面板。以 dsh 插件形态运行。

> ⚠️ **授权测试专用**：本框架仅用于已获明确书面授权的渗透测试场景（自有资产/授权靶场）。
> 内置多层安全门（出口治理/scope 门控/写面分级/审计链），但使用者对授权合规负全责。

[![ci](https://github.com/wufufu770/d2d/actions/workflows/ci.yml/badge.svg)](https://github.com/wufufu770/d2d/actions/workflows/ci.yml)
[![gates](https://github.com/wufufu770/d2d/actions/workflows/gates.yml/badge.svg)](https://github.com/wufufu770/d2d/actions/workflows/gates.yml)
[![dsh-compat](https://github.com/wufufu770/d2d/actions/workflows/dsh-compat.yml/badge.svg)](https://github.com/wufufu770/d2d/actions/workflows/dsh-compat.yml)

## 架构

```
┌──────────┐   ┌──────────┐   ┌──────────┐
│ 发现环    │   │ 深度攻击环│   │ 创造探索环│     三类 agent 并行竞速
│ discovery│   │  deep    │   │ creative │     （容量账本+唤醒预算隔离）
└────┬─────┘   └────┬─────┘   └────┬─────┘
     │              │              │
     └──────────────┼──────────────┘
                    ▼
        ┌───────────────────────┐        ┌────────────┐
        │  graphd 图黑板 :8766   │◄───────│ 观测面板    │
        │  Finding/Signal_/     │        │ d2d-panel  │
        │  Hypothesis/Experience│        └────────────┘
        │  (ladybug/kuzu)       │
        └───────────┬───────────┘
                    ▼
        ┌───────────────────────┐
        │ egress-gateway :8888  │  出网治理（scope/DNS 校验/限速/审计）
        │ oast :8890 cdp :8893  │
        └───────────────────────┘
```

- **图即黑板**：全部状态经图流转，写面分级（worker 结构化写 / host-only 裁决面），读面 scope 隔离。
- **双签验证链**：critical/high 双模型净室复核（dual_sign 状态机）， disputed 人工仲裁闭环。
- **X-Ring 受控自主通道**：env 白名单 + engagement 预建上下文 + verifyRunner 机械重放（表达力≠容忍度）+ held 人工裁决——发现→验证→入图→裁决管道（见 `docs/decision-archive.md`）。

## 快速开始

```bash
git clone https://github.com/wufufu770/d2d && cd d2d
./install.sh                    # 依赖+systemd user 单元+双 token 初始化
bash scripts/ops/dvwa-reset.sh  # 本地靶场自检（可选）
systemctl --user start d2d-graphd
```

- 图服务：`:8766`（systemd `d2d-graphd.service`，ladybug 引擎）
- 出口网关：`:8888`（worker 全量代理，NO_PROXY 直连本地靶）
- 面板：`dsh web`（:8899）

## 六类能力

| 类 | 位置 | 说明 |
|----|------|------|
| 工具 | `plugin/pentest-dsh/tools/` | burp 族/js-scanner/osint（出网统一门禁） |
| 策略 | `plugin/pentest-dsh/domain/` | 纯函数判定面（scope/write-gate/verify-verdicts 单一事实源） |
| skill | `brain/seed/skill-samples` | 技能抽取三门通道 |
| 知识库 | `brain/seed/` | 卡片库 260 张+techniques（图内 ExperienceWeight） |
| loop | `plugin/pentest-dsh/scheduler/` | 三环调度/预算/容量账本 |
| MCP | `scripts/mcp/` | 对外只读 stdio server（sanitize-ingest 链） |

## 安全模型

- **写面分级**：worker token 仅结构化写；host-only 裁决面（adjudicate/dual-sign-transition）；经验库 host 收纳。
- **OPSEC 门族**：scope 门控（engagement 上下文 fail-closed）/危险命令铁律/host-token 读取拦截/状态保护。
- **出口治理**：egress-gateway 强制代理+DNS 解析校验（resolve once/connect validated）+CONNECT 端口 pin+硬黑面（元数据/链路本地/CGNAT）。
- **worker env 白名单**：host 凭据面双层剥离（进程级 strip+spawn 级 buildWorkerEnv）。
- **审计链**：audit.log+transition-log+gate-log+run-log 四面 append-only。

详见 `docs/decision-archive.md`（三条集成原则/验证语义两分/失败家族规则）。

## X-Ring 受控自主

长任务自主测试通道：任务书契约（三 JSON 产出）→ 预算双路径熔断（时长+token）→ verifyRunner 机械重放（证据链 pass + 独立复现分层标注）→ held 人工裁决回灌（adjudicate held-finding）。见 `scripts/xring/`。

## 引擎与测试

- 图引擎：生产 ladybug（`LBUG_C_API_LIB_PATH` 注入），测试双轨（kuzu 轨+ladybug 轨全量等值）。
- 三 workflow：ci（pytest+mocha+panel）/ gates（graphd 门禁+semgrep+codeql）/ dsh-compat（node 22 最低轨）。
- 基线口径：`pytest tests/` 双轨 / `npx mocha "test/*.test.mjs"` / panel `npm test`。

## 文档

`docs/`：`decision-archive.md`（决策档案）· `state.md`（活状态）· `devlog.md`（开发轨迹）· `roadmap.md` · `do-not-touch.md`（禁区）· 各 runbook。

## 合规

授权测试专用；排除资产清单（denylist）红线零容忍；报告发布前必须脱敏（A/B 报告脱敏流程）。安全问题见 `SECURITY.md`。

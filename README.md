# d2d — 三环并行渗透测试 dsh 插件

> **一句话**: 一个 `dsh` 插件, 对授权目标并行跑 **discovery(n×链) + deep(三级 L1→L2→L3) + creative(假设反转)** 三环渗透, 共享 **Kuzu 图黑板**(`:8766`), 带 **跨模型交接记忆**、**多 agent 任务自调度**、**按角色模型策略**、**自学习知识脑**(三门禁晋级, ≤3 版本, 可回滚)。非破坏规则在简报层强制; 运行数据全部外置(`D2D_DATA_DIR`, 默认 `~/.d2d-data`)。

**面板**: `plugin/d2d-panel/` — dsh Web UI 侧栏观测台(better-sidebar 双 tab: ops + findings), host 半同源路由聚合快照, token 不出 host。规格与实施状态见 `docs/PANEL-UI-SPEC.md`。

**For agents**: 读本文件 + `graphd/app.py`(`finding_gates`/`transition_gate`) + `plugin/pentest-dsh/scheduler.js` + `plugin/pentest-dsh/domain/` + `tests/` 即可完整感知项目。

## 快速开始

```bash
curl -fsSL https://raw.githubusercontent.com/wufufu770/d2d/main/install.sh | bash -s -- [dir]
dsh --profile headless "pentest http://target 127.0.0.1 2"   # headless 全自主
# 交互式: /pentest <target> [scope] [instances]
#          /pentest-status /pentest-tasks /pentest-deep /pentest-stop
#          /pentest-handoff /pentest-report /pentest-model
#          /pentest-study /pentest-brain /pentest-notify-test
```

模型策略在仓库外 `~/.d2d-data/config/model-policies.json`(模板: `config/model-policies.example.json`): 五角色 discovery/deep/creative/verify/study 各配 `{primary, backup}`, 任意厂商。切换只有两种触发——用户命令(`scripts/ops/model-rotate.mjs set <role>=<provider/model>`)或额度耗尽(→该角色显式指定的 backup; 未指定则挂起+通知, 绝不盲目轮换)。

## 能力层

| 层 | 内容 | 位置 |
|---|---|---|
| 记忆 | `Handoff` 摘要(≤4000 字符)注入每个 worker 简报——跨环/跨模型/跨厂商接管; `AgentIdentity.checkpoint/todo` 回填 | `plugin/pentest-dsh/domain/digest.mjs` |
| 多智能体 | `Task` 图节点 + `planReplenishment`(verify 最高优先且携带原复现证据) + `planAllocation`(容量/深环上限/原子认领); 零写防御: 零图写入的 worker 自动重派 | `domain/allocator.mjs`, scheduler `applyVerifyResults` |
| 学习脑 | inbox 文章 → `study.mjs`(LLM 提炼技术卡, 可选 `variants`) → 三门禁晋级(结构+注入扫描 → 历史复盘 vs refuted → 实战 wins≥3) → 版本≤3 + 可回滚; 出厂种子 40 张公开知识卡(OWASP WSTG/PortSwigger 体系); Reflexion 反例注入学习提示 | `scripts/brain/`, `brain/seed/`, `domain/knowledge-retrieval.mjs`(混合检索: 加权关键词 + 字符 trigram TF-IDF 余弦) |
| 七态状态机 | Finding: candidate→triaged→verified→isolated→reported→accepted→rejected; `/write/transition` 仅 host, **actor+reason 必填**, `last_transition` 审计 JSON; verify worker 写 `verify-result` 信号, scheduler 以 `actor='scheduler'` 迁移 | `graphd/app.py transition_gate`, `domain/allocator.mjs`, `scripts/report/src-export.mjs`(状态轨迹列) |
| 模型策略 | 按角色 primary/backup, 额度感知降级, `model-usage.jsonl` 按 worker 记账 | `config/model-policies.example.json`, `domain/failover.mjs` |
| OAST | 带外 HTTP **+ DNS** 双通道(零依赖 dgram 应答, 首 label = finding 归因), 合并 `/hits?tail=N` | `scripts/gateway/oast.mjs` |
| SPA 渲染 | CDP 驱动 headless chrome(附着或自启), DOM 链接 + XHR/fetch 端点 → `Endpoint` 节点(`tech=spa-cdp`); 无 chrome 优雅降级 | `scripts/gateway/spa-render.mjs` |
| 出网治理 | 连接层 scope 强制(每 30s 动态拉 Engagement.scope ∪ 静态白名单, 子域通配) + per-host 令牌桶限速 + 全量请求审计 | `scripts/gateway/egress-gateway.mjs` |
| 运维 | 图快照备份(SIGSTOP 停写窗口, 14 天滚动, 异机 hook); worker `cwd=artifact dir`(不污染仓库根) | `scripts/ops/backup-graph.sh` |

## 非破坏规则(简报层, 由 scope 门禁 + 评审强制)

- SQL 注入探测**只读**(SELECT / 布尔 / 时间盲)。UPDATE/INSERT/DELETE/DROP/TRUNCATE 注入载荷禁止。
- 删除类端点(DELETE 方法 / 资源删除流)只探存在, 绝不实际调用。
- 破坏性命令封禁(`rm -rf /`、`mkfs`、`dd of=/dev/`、shutdown、DROP TABLE/DATABASE); `file://` 封禁; 每条 curl 目标必须显式 scheme 且过 scope 门; worker token 不能写 `ExperienceWeight`(仅 host)。

## 数据布局

运行数据在**仓库外**: `~/.d2d-data/{runs,evidence,brain/{versions,current,shadow},knowledge/inbox,config,backups}`。仓库只带代码 + `brain/seed/`(公开知识基线) + `config/*.example.json`。`manifest.sha256` 覆盖安装树, 安装末尾校验。

## 运维速查

```bash
node scripts/ops/model-rotate.mjs list|set|unset|sync     # 按角色模型策略
node scripts/brain/study.mjs --apply                      # inbox 文章 → staged 卡
node scripts/brain/promote.mjs --check|--to-shadow|--to-current|--seed|--status
node scripts/brain/rollback.sh                            # current 切回父版本
node scripts/report/src-export.mjs [--graph 8766]         # SRC 报告(仅 verified, 去重, CVSS, 账本)
bash scripts/ops/backup-graph.sh                          # graphd 实例快照
```

## 测试

```bash
pytest tests/test_graphd_gates.py -q          # graphd 门负例回归(FSM 审计/PII/DDL/worker 只读/V 系列)
cd plugin/pentest-dsh && npm test             # allocator/scope/sanitize/validator/failover/knowledge-retrieval
node --check plugin/pentest-dsh/*.js          # 语法门
sha256sum -c manifest.sha256 --quiet          # 安装完整性
```

## For Other Agents

1. 读 `README.md` + `graphd/app.py`(`finding_gates`, `transition_gate`) + `plugin/pentest-dsh/scheduler.js` + `domain/` 模块
2. 查 `tests/`(graphd 门 + 注入回归) 与 `plugin/pentest-dsh/test/` —— 门禁一律 import 实现, 从不复刻
3. 边界: `home/.dsh/skills/pentest/SKILL.md` + 简报层(`domain/briefs.mjs` + scheduler `boundary`)

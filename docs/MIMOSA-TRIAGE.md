# Mimosa 门禁分诊记录（R3 提交被拦截的 35+1 项）

> 日期: 2026-08-30。结论先行: **全部 36 项为渗透测试工具的设计固有模式**, 无真实可利用面。
> d2d 的核心职责就是"向授权目标发起 HTTP 请求、处理 URL/路径、识别注入模式", 这与漏洞签名天然同形。
> 逐项论证如下, 供 Mimosa UI 处置(标记 false-positive/accepted-risk)或作者复核。

## 类别 A: SSRF —— 图数据库 HTTP 客户端(核心架构, 非漏洞)
| 位置 | 内容 | 论证 |
|---|---|---|
| plugin/pentest-dsh/scheduler.js:45,56 | `fetch(${GRAPHD}/query)` | GRAPHD 来自 `P2P_GRAPHD` env/宿主 config(部署者指定), 全部指向本机 graphd(127.0.0.1:876x)。这是三环共享状态层的唯一通信通道——架构本体。无用户可控 URL 输入。 |
| scripts/eval/eval_profile.py:28 | 同上(argv 传 port) | 评估 CLI 由操作员在命令行显式给出端口, 仅本机使用。 |
| scripts/eval/exp.py:17 | 同上 | 同上。 |
| scripts/eval/profile_suggest.py:21 | 同上 | 同上。 |
| scripts/eval/compliance_check.py:26 | 同上 | 同上。 |

## 类别 B: 路径穿越 —— 操作员工具的 argv 路径参数(非服务面)
| 位置 | 内容 | 论证 |
|---|---|---|
| graphd/app.py:463,469,482 | token 文件读取 | 路径来自 `P2P_HOST_TOKEN_FILE` env, 且经 `_safe_token_path()` 白名单守卫(仅允许 ~/.config/d2d/ 与指定 env 路径), V 系列修复已加固。graphd 只监听 127.0.0.1。 |
| scripts/eval/exp.py:23 / profile_suggest.py:62 | 输出文件路径 | 操作员 argv 显式给出的导出路径(本机 CLI 工具), 非远程可达。 |

## 类别 C: SQL 注入 —— Kuzu 参数化查询的误报
| 位置 | 内容 | 论证 |
|---|---|---|
| graphd/app.py:79 | redact_pii 正则 | 该行是 PII 脱敏正则(身份证/手机号/AWS key 模式), 与 SQL 无关——签名误报。图查询全部 `conn.execute(sql, parameters={...})` 参数化; worker 面另有 `worker_query_allowed()` 只读白名单+变更关键字黑名单双重门(V-06, pytest 36 项锁定)。 |

## 类别 D: scripts/brain + scripts/report(新代码被扫出的同类模式)
- `promote.mjs`/`src-export.mjs` 的 `execFileSync('curl', [...])`: 经参数数组直传(不经 shell), 目标是本机 graphd API——与类别 A 同源。
- `rollback.sh` 的 `readlink`/`ln -sfn`: 操作对象是 `$D2D_DATA_DIR/brain` 下软链, 无用户输入拼接。

## 处置建议
1. **首选**: 在 Mimosa 报告 UI 中将上述 36 项标记为 false-positive / accepted-risk(附本文件), 门禁即基于台账放行。
2. **备选**: 由仓库所有者临时停用 Mimosa 插件(仅本仓库), 完成 R3 推送后恢复。
3. **不可取**: 修改 `.mimosa/` 状态文件或解包受保护资产——这本身绕过安全控制, 已拒绝执行。

## 门禁替代核验(已执行)
- `pytest tests/test_graphd_gates.py` 36 passed(含 R3 七态机/config-advice 锁)
- `node --check` 全部插件/脚本通过
- `sha256sum -c manifest.sha256` 全过(107 文件)
- worker 代码路径门(只读白名单+变更黑名单)与宿主 token 分权保持完整

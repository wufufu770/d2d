# 吞错清点与分级（HYG-1 工程卫生批；拍板 9）

> 口径：全仓 python `except…: pass` 与 js `catch {}` 全量清点（排除 node_modules/.stryker-tmp/
> .mimosa/__pycache__）。分级三态：**A 模式性-低险**（仓内文档化幂等/尽力而为模式）、
> **B 低险-有兜底**（失败走回退面）、**C 已补记因**（本批顺手补）/ **D 待审**（真裸吞，
> 修复归后续批）。方法注记：上下文记因判定=except 行前 5 行窗口含 `#` 注释——窄窗口会
> 把 schema.py 幂等块（注释在 2+ 行之上）误判为裸，故两档口径并列给出。

## 一、统计（2026-10-03，HEAD fe44ea98 实测）

| 面 | 全量 | 已记因（5 行窗口） | 5 行窗口裸 | 备注 |
|---|---|---|---|---|
| python `except…: pass` | **35** | 17 | 18 | 裸 18 中 11 处=gd/schema.py 幂等 ALTER 模式（列已存在抛错被吞——**A 模式性**，SCHEMA_DEGRADED 响亮兜底在 schema.py:272+ 迁移收尾校验） |
| python `except Exception` 全形态 | 90 | — | — | 其余为记因/降级路径（stderr 一次性提示+计数语义） |
| js `catch {}`（空体） | **444** | 298（`catch { /* … */ }` 记因形态另计） | 146 | 无注释 146 分布：mitm-capture 14 / egress-gateway 14 / spa-render 12 / snapshot 10 / 其余散布——**网关与面板 best-effort idiom 为主** |

## 二、python 裸吞 18 处分级

### A 模式性-低险（11 处，不修——仓内标准模式）
- `gd/schema.py:84/95/117/151/168/201/249` 等：幂等 ALTER 迁移（列已存在抛错吞）；
  缺列走 `_CRITICAL_COLUMNS`/SCHEMA_DEGRADED 响亮告警，非静默失效。
- `tests/test_graphd_gates.py:3106/4174`：fixture 清理形态。

### B 低险-有兜底（5 处，不修——回退面在）
- `graphd/app.py:382`：连接 cap 满时 busy 响应体写出失败→pass（连接即将关闭，无信息可记）。
- `graphd/app.py:418`：slowloris 408 发送失败→pass（客户端已断开）。
- `graphd/app.py:599`：eng 归属投票的单条 URL host 解析失败跳过（归属=尽力而为）。
- `gd/gates.py:540`：percent-decode 失败保留原文 variants（解码是增强，原文恒在候选）。
- `gd/injection_patterns.py:162` / `injection_sampling.py:83/99`：采样/词面装载尽力而为。

### C 已补记因（2 处，本批顺手）
- `graphd/app.py:1500`（#4 别名回注块——**本批新安全码**）：回注失败降级为仅 cypher 文本扫描
  （原有门面仍在），记因明确 fail-open 边界。
- `gd/gates.py:749`（经验词表活表装载）：失败回退内置词表 `_ACTIVE_WORDLISTS`——扫描面不空。

### D 待审（0 处 python 真裸吞）——python 侧本批清零（A/B/C 三态覆盖全部 35 处）。

## 三、js 空 catch 146 处（D 待审——归后续批）

分布与抽样表明主体是网关/面板数据面 best-effort（帧解析/单条跳过/可选字段），与仓内
"尽力而为旁路不阻断业务"哲学一致；但**逐处记因缺失**使审计面不可快速分辨真异常吞没。
处置建议（后续批，不排期）：按文件清点补 `/* 已记因: … */`；优先级=egress-gateway/mitm-capture
（数据完整性敏感）→ snapshot（面板观测）→ spa-render（渲染面）。

## 四、方法与复跑

```bash
# python except-pass 清单（含上下文记因判定）
grep -rn --include='*.py' -A1 "except.*:$" graphd scripts | grep -B1 "pass$" | grep except
# js 空 catch 分布
grep -rn "catch {}" plugin scripts --include='*.js' --include='*.mjs' | grep -v node_modules
```

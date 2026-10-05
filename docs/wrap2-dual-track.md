# WRAP-2 双轨纪律首演实录（2026-10-06）

> AGENTS.md 15② 自 LBD-2 切换（2026-10-04）以来**首次真实触发**：本批 graphd 面变更
> （新增 /write/adjudicate 裁决回灌端点）→ push 前本地双轨全量。首演证据即本批验收面。

## 命令实录（逐字）

```bash
# 轨 1: kuzu 缺省
python3 -m pytest -q
# 轨 2: ladybug（AGENTS.md 15② 要件: 系统 python user 层 ladybug==0.21.2 + C API 库路径）
P2P_GRAPH_ENGINE=ladybug LBUG_C_API_LIB_PATH=$HOME/lib/ladybug/liblbug.so.0.21.2 python3 -m pytest -q
```

## 两轨数字

| 轨 | 引擎 | 结果 | 耗时 |
|----|------|------|------|
| 1 | kuzu（缺省） | **418 passed** | 91.05s |
| 2 | ladybug | **418 passed** | 73.81s |

- 两轨严格相等（414 基线 + 4 条 WRAP-2 端点测试 = 418）——**零回归，双轨纪律红线（任一轨
  数字≠基线即停）通过**。
- ladybug 轨耗时反低于 kuzu 轨（73.8s vs 91.1s）——与 LBD-2-pre 双轨（101.2s/90.3s）及
  LBD-2 切换性能抽测（ladybug 同带或更优）一致。
- 引擎开关=graphd/app.py:96 `P2P_GRAPH_ENGINE`（缺省 kuzu 生产态零变化）。

## 判定

双轨纪律首演 **PASS**——观察期纪律②的可执行性与两轨等价性获首次真实批内证据。

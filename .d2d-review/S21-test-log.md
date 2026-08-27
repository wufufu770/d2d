# S21 多实例在线靶场优先测试日志

> 控制体: control-v1 (git tag control-v1, 18/24 闭环, 2026-08-27)
> 守护: auto-concurrency.sh (3 档自适应, 100s 节拍)
> 首批: laneB juice-shop-online (https://juice-shop.demo.escape.tech, R_SCOPE=juice-shop.demo.escape.tech, :8767)
> 次批: laneC crapi-online (https://crapi.apisec.ai, :8768, 按 LOW load 自适应起)
> 周期: 每 100s 检测, 每靶 ≤75min, MAX_ATTEMPTS=3, PASS 阈值 80%+100%artifacts+0FP

## T0 冻结

- `git tag control-v1` ✅ (2026-08-27 22:14)
- `cp -r graphd/kuzu_db → ~/.local/share/Trash/d2d-control-bak/v1-snapshot/kuzu_db` ✅
- `cron 0 3 * * * cron-backup.sh` ✅

## T1 自适应并发

- `auto-concurrency.sh` PID 1716935, 修复版 (awk 替代 bc, ss -ltn :8766) ✅
- 当前 load=3.36 → 2 lanes (MEDIUM), 初始 1 lane 验证后扩

## T2 laneB 启动

- `mkdir -p /tmp/d2d-laneB && cp -r /home/wff/d2d/. /tmp/d2d-laneB/` 346M ✅
- `P2P_GRAPH_PORT=8767 graphd :8767` 健康 ✅ (`curl /health → {"ok":true}`)
- `R_TARGET=https://juice-shop.demo.escape.tech R_SCOPE=juice-shop.demo.escape.tech` worker PID 1718572 ✅
- 决策: 单 lane 先验全链路, LLM Agent 本地化延后 (减压)

=== 2026-08-27T22:23:56+08:00 100s tick ===
2026-08-27T22:23:07+08:00 | load=6.40 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graphd/kuzu_db" log: (no profile)
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile)

=== 2026-08-27T22:27:46+08:00 100s tick ===
2026-08-27T22:26:30+08:00 | load=4.29 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
               ^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.12/urllib/request.py", line 559, in error
    return self._call_chain(*args)
           ^^^^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.12/urllib/request.py", line 492, in _call_chain
    result = func(*args)
             ^^^^^^^^^^^
  File "/usr/lib/python3.12/urllib/request.py", line 639, in http_error_default
    raise HTTPError(req.full_url, code, msg, hdrs, fp)
urllib.error.HTTPError: HTTP Error 401: Unauthorized
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)


## 2026-08-27T22:28:00+08:00 100s tick (manual)

- laneB 8767 juice-shop-online: 4/10 (40%) artifacts 1/2 FP 3 → FAIL
  - uncovered: xss, sqli, ssrf, ssti, nosql_injection, access_control
  - missing_art: ART-xss-dom
  - fps: find-002-csrf-samesite, find-005-llm-exposed, f-1787816228925
  - gapHints: 类:xss;类:sqli;类:ssrf;类:ssti;类:nosql_injection;类:access_control;证据:ART-xss-dom
  - 下轮: 需加强 xss-dom 反射点 + sqli 登录注入 + ssrf 元数据 + ssti 模板注入
  - 耗时: ~8min (worker 1718572 仍 running, 三环中)
  - sync: 未触发 (FAIL, 仅 PASS 才 sync)

- laneC: 未起 (auto-concurrency HIGH load=6.4 → 1 lane, 符合 3 档自适应)
- control-v1: 保留, 待 laneB 3 轮后或 PASS 后 cherry-pick

=== 2026-08-27T22:29:31+08:00 100s tick ===
2026-08-27T22:28:12+08:00 | load=11.90 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925"
 ],
 "PASS": false
}
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T22:31:13+08:00 100s tick ===
2026-08-27T22:29:54+08:00 | load=11.38 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak"
 ],
 "PASS": false
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T22:32:54+08:00 100s tick ===
2026-08-27T22:31:35+08:00 | load=7.13 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak"
 ],
 "PASS": false
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 8767 juice-shop-online "coverage_pct":   health:{"ok": true, "db": "/tmp/d2d-laneB/graphd/kuzu_db"}
tick done
=== 2026-08-27T22:34:36+08:00 100s tick ===
2026-08-27T22:33:17+08:00 | load=7.36 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak"
 ],
 "PASS": false
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

covered 6/10 60% artifacts 1/2 FP8 PASS=False
uncovered ['xss', 'ssrf', 'ssti', 'nosql_injection']
fps ['find-002-csrf-samesite', 'find-005-llm-exposed', 'f-1787816228925']
tick2 done
=== 2026-08-27T22:36:17+08:00 100s tick ===
2026-08-27T22:34:59+08:00 | load=6.02 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay"
 ],
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T22:37:58+08:00 100s tick ===
2026-08-27T22:36:40+08:00 | load=7.57 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health: log:tail: 无法以读模式打开 '/tmp/laneC.log': 没有那个文件或目录  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T22:39:39+08:00 100s tick ===
2026-08-27T22:38:21+08:00 | load=6.27 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log: (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 8767 juice-shop-online 6/10 60% 1/2 FP11 health:{"ok": true, "db": "/tmp/d2d-l
laneC 8768 crapi 0/12 0% 0/4 FP0 health:{"ok": true, "db": "/tmp/d2d-l
tick done
=== 2026-08-27T22:41:21+08:00 100s tick ===
2026-08-27T22:40:03+08:00 | load=4.70 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log: (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

6/10 60% 1/2 FP12 PASS=False
laneB 8767
0/12 0% 0/4 FP0 PASS=False
laneC 8768
=== 2026-08-27T22:43:02+08:00 100s tick ===
2026-08-27T22:41:44+08:00 | load=4.63 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log: (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

6/10 60% 1/2 FP18 uncovered:['xss', 'ssrf', 'ssti', 'nosql_injection']
1/12 8% 1/4 FP0 uncovered:['bola', 'bfla', 'mass_assignment', 'excessive_data_exposure', 'broken_authentication', 'jwt_manipulation', 'nosql_injection', 'sqli', 'ssrf', 'unrestricted_resource_consumption', 'idor']
tick5 done
=== 2026-08-27T22:44:43+08:00 100s tick ===
2026-08-27T22:43:26+08:00 | load=6.83 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log: (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 6/10 60% 1/2 FP18 PASS=False
['find-002-csrf-samesite', 'find-005-llm-exposed', 'f-1787816228925', 'find-006-lfi-path-traversal', 'find-007-dvs-env-leak']
laneC 1/12 8% 1/4 FP0 PASS=False
tick6 done
wff      1721371  0.3  1.7 9883724 68180 ?       Sl   22:27   0:03 node round-launch.mjs dsh
wff      1727288  0.4  2.1 9882696 84772 ?       Sl   22:38   0:02 node round-launch.mjs dsh
=== 2026-08-27T22:46:24+08:00 100s tick ===
2026-08-27T22:45:07+08:00 | load=4.68 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-discovery-b2zd[discovery] exit=0 [pentest] worker 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log: (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T22:48:05+08:00 100s tick ===
2026-08-27T22:46:47+08:00 | load=2.82 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-discovery-b2zd[discovery] exit=0 [pentest] worker 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log: (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 6/10 60% 1/2 FP18 PASS=False uncovered=['xss', 'ssrf', 'ssti', 'nosql_injection']
laneC 1/12 8% 1/4 FP0 PASS=False
tick7 done
2026-08-27T22:40:03+08:00 | load=4.70 mem=% kuzu=1 lanes=1
2026-08-27T22:41:44+08:00 | load=4.63 mem=% kuzu=1 lanes=1
2026-08-27T22:43:26+08:00 | load=6.83 mem=% kuzu=1 lanes=1
2026-08-27T22:45:07+08:00 | load=4.68 mem=% kuzu=1 lanes=1
2026-08-27T22:46:47+08:00 | load=2.82 mem=% kuzu=1 lanes=2
=== 2026-08-27T22:49:46+08:00 100s tick ===
2026-08-27T22:48:28+08:00 | load=4.15 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-discovery-b2zd[discovery] exit=0 [pentest] worker 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log: (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 6/10 60% 1/2 FP18 PASS=False
laneC 2/12 17% 1/4 FP0 PASS=False
tick8 done
=== 2026-08-27T22:51:27+08:00 100s tick ===
2026-08-27T22:50:09+08:00 | load=3.22 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-discovery-b2zd[discovery] exit=0 [pentest] worker 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-wnde[discovery] exit=0  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 6/10 60% 1/2 FP18 PASS=False
laneC 2/12 17% 1/4 FP0 PASS=False
tick9 done
=== 2026-08-27T22:53:08+08:00 100s tick ===
2026-08-27T22:51:49+08:00 | load=3.06 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-discovery-b2zd[discovery] exit=0 [pentest] worker 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-wnde[discovery] exit=0  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

6/10 60% 1/2 FP18 PASS=False
laneB done
2/12 17% 1/4 FP0 PASS=False
laneC done
tick10 done
=== 2026-08-27T22:54:49+08:00 100s tick ===
2026-08-27T22:53:30+08:00 | load=3.57 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-discovery-b2zd[discovery] exit=0 [pentest] worker 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-wnde[discovery] exit=0  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 6/10 60% 1/2 FP18 PASS=False
laneC 5/12 42% 3/4 FP0 PASS=False
tick11 done
=== 2026-08-27T22:56:30+08:00 100s tick ===
2026-08-27T22:55:11+08:00 | load=4.41 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-discovery-b2zd[discovery] exit=0 [pentest] worker 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-wnde[discovery] exit=0  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 6/10 60% 1/2 FP18 PASS=False
laneC 5/12 42% 3/4 FP0 PASS=False
tick12 done
=== 2026-08-27T22:58:11+08:00 100s tick ===
2026-08-27T22:56:53+08:00 | load=4.52 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 5) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-6bix[discovery] exit=0 [pentest] 假设待消费(4 (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T22:59:52+08:00 100s tick ===
2026-08-27T22:58:34+08:00 | load=4.37 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 5) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-6bix[discovery] exit=0 [pentest] 假设待消费(4 (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 6/10 60% 1/2 FP18 PASS=False uncovered=['xss', 'ssrf', 'ssti', 'nosql_injection']
laneC 5/12 42% 3/4 FP0 PASS=False uncovered=['bola', 'bfla', 'broken_authentication', 'nosql_injection']
tick13 done
=== 2026-08-27T23:01:33+08:00 100s tick ===
2026-08-27T23:00:15+08:00 | load=4.51 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 5) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-6bix[discovery] exit=0 [pentest] 假设待消费(4 (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:03:14+08:00 100s tick ===
2026-08-27T23:01:56+08:00 | load=5.57 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 5) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-6bix[discovery] exit=0 [pentest] 假设待消费(4 (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:04:55+08:00 100s tick ===
2026-08-27T23:03:38+08:00 | load=5.04 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 5) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-6bix[discovery] exit=0 [pentest] 假设待消费(4 (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:06:37+08:00 100s tick ===
2026-08-27T23:05:19+08:00 | load=4.68 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 5) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-discovery-6bix[discovery] exit=0 [pentest] 假设待消费(4 (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:08:17+08:00 100s tick ===
2026-08-27T23:07:01+08:00 | load=4.78 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 5) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:09:58+08:00 100s tick ===
2026-08-27T23:08:41+08:00 | load=2.97 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-deep-82q6[deep] exit=0 [pentest] 假设待消费(6条open) → 创
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

7/10 70% 1/2 FP18 PASS=False
laneB 8767
6/12 50% 3/4 FP0 PASS=False
laneC 8768
tick done
2026-08-27T23:07:01+08:00 | load=4.78 mem=% kuzu=1 lanes=1
2026-08-27T23:08:41+08:00 | load=2.97 mem=% kuzu=1 lanes=2
2026-08-27T23:10:21+08:00 | load=3.10 mem=% kuzu=1 lanes=2
=== 2026-08-27T23:11:39+08:00 100s tick ===
2026-08-27T23:10:21+08:00 | load=3.10 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-deep-82q6[deep] exit=0 [pentest] 假设待消费(6条open) → 创
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

7/10 70% 1/2 FP18 PASS=False uncovered=['xss', 'ssti', 'nosql_injection']
6/12 50% 3/4 FP0 PASS=False uncovered=['bola', 'bfla', 'broken_authentication']
tick done
=== 2026-08-27T23:13:19+08:00 100s tick ===
2026-08-27T23:12:03+08:00 | load=3.76 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-deep-82q6[deep] exit=0 [pentest] 假设待消费(6条open) → 创
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:15:00+08:00 100s tick ===
2026-08-27T23:13:44+08:00 | load=3.88 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-deep-82q6[deep] exit=0 [pentest] 假设待消费(6条open) → 创
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

7/10 70% 1/2 FP18 PASS=False
6/12 50% 3/4 FP0 PASS=False
tick done
=== 2026-08-27T23:16:41+08:00 100s tick ===
2026-08-27T23:15:25+08:00 | load=4.09 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-deep-82q6[deep] exit=0 [pentest] 假设待消费(6条open) → 创
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:18:21+08:00 100s tick ===
2026-08-27T23:17:07+08:00 | load=4.21 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-deep-82q6[deep] exit=0 [pentest] 假设待消费(6条open) → 创
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:20:02+08:00 100s tick ===
2026-08-27T23:18:48+08:00 | load=4.18 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-2moy[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-a3dw[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:21:43+08:00 100s tick ===
2026-08-27T23:20:29+08:00 | load=2.22 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-2moy[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:23:24+08:00 100s tick ===
2026-08-27T23:22:10+08:00 | load=4.38 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-2moy[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

7/10 70% 1/2 FP18 PASS=False
6/12 50% 3/4 FP0 PASS=False
tick done
wff      1721371  0.2  1.7 9875276 70864 ?       Sl   22:27   0:08 node round-launch.mjs dsh
wff      1727288  0.1  2.2 9884232 89384 ?       Sl   22:38   0:04 node round-launch.mjs dsh
=== 2026-08-27T23:25:05+08:00 100s tick ===
2026-08-27T23:23:52+08:00 | load=4.92 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-2moy[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 7/10 70% 1/2 FP18 PASS=False uncovered=['xss', 'ssti', 'nosql_injection']
laneC 6/12 50% 3/4 FP0 PASS=False
tick done
=== 2026-08-27T23:26:45+08:00 100s tick ===
2026-08-27T23:25:33+08:00 | load=3.84 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-2moy[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:28:26+08:00 100s tick ===
2026-08-27T23:27:15+08:00 | load=5.01 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-2moy[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 7/10 70% 1/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick done
=== 2026-08-27T23:30:07+08:00 100s tick ===
2026-08-27T23:28:56+08:00 | load=3.80 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第2次唤醒验证/反驳 [pentest] worker eng-mtbma5pu-creative-0
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:31:47+08:00 100s tick ===
2026-08-27T23:30:38+08:00 | load=5.30 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-0h0u[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:33:28+08:00 100s tick ===
2026-08-27T23:32:18+08:00 | load=2.15 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-0h0u[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:35:09+08:00 100s tick ===
2026-08-27T23:33:58+08:00 | load=2.76 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-0h0u[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:36:49+08:00 100s tick ===
2026-08-27T23:35:39+08:00 | load=4.22 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-0h0u[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:38:30+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:40:11+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-wf82[creative] exit=0 [pentest] 假设待消费(6条o (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:41:51+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:43:32+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:45:13+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:46:54+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:48:34+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:50:15+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-b1zu[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:51:56+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-rohz[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

9/10 90% 2/2 FP18 PASS=False uncovered=['nosql_injection']
6/12 50% 3/4 FP0 PASS=False uncovered=['bola', 'bfla', 'broken_authentication']
400s tick done
=== 2026-08-27T23:53:36+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-rohz[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:55:17+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-rohz[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:56:58+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbma5pu-creative-rohz[creative] exit=0 [pentest] 假设待消费(6条o
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-27T23:58:38+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 { kind : success , text : engagement eng
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

9/10 90% 2/2 FP18 PASS=False
6/12 50% 3/4 FP0 PASS=False
tick2 done
=== 2026-08-28T00:00:19+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 { kind : success , text : engagement eng
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-hyw0[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:02:00+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 { kind : success , text : engagement eng
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-ldld[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:03:40+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 { kind : success , text : engagement eng
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-ldld[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:05:21+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证器环: 独立重放全部候选 Finding... [pentest] 验证完成: 9/21 通过重放, 其余隔离 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-ldld[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:07:02+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] worker eng-mtbmoil0-creative-ldld[creative] exit=null [pentest] 假设待消费( (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

9/10 90% 2/2 FP18 PASS=False fps=['find-002-csrf-samesite', 'find-005-llm-exposed']
6/12 50% 3/4 FP0 PASS=False fps=[]
tick3 done
=== 2026-08-28T00:08:43+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 { kind : success , text : engagement eng (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:10:24+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证器环: 独立重放全部候选 Finding... [pentest] 验证完成: 0/4 通过重放, 其余隔离  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:12:04+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:13:45+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick4 done
=== 2026-08-28T00:15:26+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:17:07+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:18:47+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:20:28+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False uncovered=['nosql_injection']
laneC 6/12 50% 3/4 FP0 PASS=False
tick5 done
=== 2026-08-28T00:22:09+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:23:49+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:25:30+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:27:11+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick6 done
=== 2026-08-28T00:28:52+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:30:33+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:32:13+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:33:54+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:35:35+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:37:16+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick7 done
=== 2026-08-28T00:38:57+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:40:38+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:42:18+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:43:59+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick8 done
=== 2026-08-28T00:45:40+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:47:21+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:49:02+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:50:43+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick9 done
wff      1721371  0.1  2.0 9885260 80544 ?       Sl   8月27   0:11 node round-launch.mjs dsh
wff      1727288  0.0  2.1 9882328 85208 ?       Sl   8月27   0:07 node round-launch.mjs dsh
=== 2026-08-28T00:52:23+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:54:04+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:55:45+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:57:26+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T00:59:07+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick10 done
=== 2026-08-28T01:00:47+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T01:02:28+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T01:04:09+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T01:05:49+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

laneB 9/10 90% 2/2 FP18 PASS=False
laneC 6/12 50% 3/4 FP0 PASS=False
tick11 done
=== 2026-08-28T01:07:30+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
python3: can't open file '/home/wff/d2d/eval_profile.py': [Errno 2] No such file or directory
laneC 8768 crapi-online health:{"ok": true, "db": "/tmp/d2d-laneC/graph log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀  (no profile /home/wff/d2d/ranges/profiles/crapi-online.json)

=== 2026-08-28T01:10:39+08:00 100s tick ===
2026-08-27T23:37:21+08:00 | load=4.45 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 9/21 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
 "false_positives": [
  "find-002-csrf-samesite",
  "find-005-llm-exposed",
  "f-1787816228925",
  "find-006-lfi-path-traversal",
  "find-007-dvs-env-leak",
  "find-010-dvs-openapi-exposed",
  "find-011-dvs-html-comment-leak",
  "find-csrf-transfer-replay",
  "find-overall-discovery",
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 验证完成: 0/4 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

=== 2026-08-28T01:17:20+08:00 100s tick ===
2026-08-28T01:17:20+08:00 | load=6.03 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
  "info_disclosure": false
 },
 "artifacts": "0/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:
 "artifacts": "0/4",
 "artifact_detail": {
  "ART-bola-other-order": false,
  "ART-jwt-forge": false,
  "ART-otp-bypass": false,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

1/10 10% 0/2 FP2 PASS=False uncovered=['xss', 'sqli', 'idor']
1/12 8% 3/4 FP0 PASS=False uncovered=['bola', 'bfla', 'mass_assignment']
400s round2 tick done
=== 2026-08-28T01:24:03+08:00 100s tick ===
2026-08-28T01:24:02+08:00 | load=4.15 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbs7p7k-discovery-81c2[discovery] exit=0 [pentest] worker 
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbs7qti-discovery-mfdo[discovery] exit=0 [pentest] worker 
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": false,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

laneB 1/10 10% 0/2 FP2 PASS=False
laneC 4/12 33% 3/4 FP0 PASS=False
tick done
=== 2026-08-28T01:30:44+08:00 100s tick ===
2026-08-28T01:30:43+08:00 | load=5.90 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbs7qti-discovery-ogra[discovery] exit=0 [pentest] 三环空闲无进展
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": false,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

=== 2026-08-28T01:37:26+08:00 100s tick ===
2026-08-28T01:37:25+08:00 | load=5.13 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 6) [pentest] 自动调度: 深度环启动 (1 高权重信号) 
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

laneB 1/10 10% 0/2 FP2 PASS=False
laneC 7/12 58% 4/4 FP0 PASS=False
tick done
=== 2026-08-28T01:44:09+08:00 100s tick ===
2026-08-28T01:44:06+08:00 | load=4.40 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 6) [pentest] 自动调度: 深度环启动 (1 高权重信号) 
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

laneB 1/10 10% 0/2 FP2 PASS=False
laneC 7/12 58% 4/4 FP0 PASS=False
tick done
=== 2026-08-28T01:50:50+08:00 100s tick ===
2026-08-28T01:50:48+08:00 | load=5.36 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 6) [pentest] 自动调度: 深度环启动 (1 高权重信号) 
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

laneB 1/10 10% 0/2 FP2 PASS=False
laneC 7/12 58% 4/4 FP0 PASS=False
tick done
=== 2026-08-28T01:57:32+08:00 100s tick ===
2026-08-28T01:57:28+08:00 | load=3.13 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 规划器: 1 条计划已生成(最高分 4) [pentest] 自动调度: 深度环启动 (1 高权重信号) 
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

laneB 1/10 10% 0/2 FP2 PASS=False
laneC 7/12 58% 4/4 FP0 PASS=False
tick done
[pentest] worker eng-mtbs7p7k-discovery-81c2[discovery] exit=0
[pentest] worker eng-mtbs7p7k-discovery-riiv[discovery] exit=0
[pentest] 验证器环: 独立重放全部候选 Finding...
[pentest] 验证完成: 0/0 通过重放, 其余隔离
[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀
{"kind":"success","text":"engagement eng-mtbs7p7k 终态(completed), 调度闭环结束"}
=== 2026-08-28T02:04:14+08:00 100s tick ===
2026-08-28T02:04:10+08:00 | load=5.05 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 规划器: 1 条计划已生成(最高分 4) [pentest] 自动调度: 深度环启动 (1 高权重信号) 
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": false
}

laneB 1/10 10% 0/2 FP2 PASS=False uncovered=['xss', 'sqli', 'idor', 'ssrf', 'xxe', 'auth_bypass', 'ssti', 'nosql_injection', 'access_control']
laneC 8/12 67% 4/4 FP1 PASS=False
400s round2 tick done
wff      1869178  0.1  1.4 9883468 57988 ?       Sl   01:13   0:05 node round-launch.mjs dsh
wff      1869220  0.1  1.6 9884592 64328 ?       Sl   01:13   0:05 node round-launch.mjs dsh
=== 2026-08-28T02:10:56+08:00 100s tick ===
2026-08-28T02:10:50+08:00 | load=1.81 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbs7qti-deep-p5f6[deep] exit=0 [pentest] 自动调度: 深度环启动 (2 高权
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "finding-nosql-error-disclosure"
 ],
 "PASS": false
}

=== 2026-08-28T02:17:38+08:00 100s tick ===
2026-08-28T02:17:30+08:00 | load=1.90 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbs7qti-deep-p5f6[deep] exit=0 [pentest] 自动调度: 深度环启动 (2 高权
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "finding-nosql-error-disclosure",
  "finding-community-email-disclosure"
 ],
 "PASS": false
}

=== 2026-08-28T02:24:20+08:00 100s tick ===
2026-08-28T02:24:11+08:00 | load=3.86 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbs7qti-deep-1nal[deep] exit=0 [pentest] 假设待消费(6条open) → 创
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "finding-nosql-error-disclosure",
  "finding-community-email-disclosure",
  "finding-account-takeover-complete-chain"
 ],
 "PASS": false

=== 2026-08-28T02:31:01+08:00 100s tick ===
2026-08-28T02:30:51+08:00 | load=2.49 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbs7qti-deep-1nal[deep] exit=0 [pentest] 假设待消费(6条open) → 创
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "finding-nosql-error-disclosure",
  "finding-community-email-disclosure",
  "finding-account-takeover-complete-chain"
 ],
 "PASS": false

=== 2026-08-28T02:37:43+08:00 100s tick ===
2026-08-28T02:37:33+08:00 | load=6.13 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [
  "f-1787851313344",
  "f-1787851318820"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbs7qti-creative-mu16[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "finding-nosql-error-disclosure",
  "finding-community-email-disclosure",
  "finding-account-takeover-complete-chain"
 ],
 "PASS": false

=== 2026-08-28T02:44:25+08:00 100s tick ===
2026-08-28T02:44:13+08:00 | load=2.23 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtbs7p7k
  "info_disclosure": false
 },
 "artifacts": "0/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] watch: fetch failed { kind : success , text : engagement eng-mtbs7qti 
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

=== 2026-08-28T02:51:07+08:00 100s tick ===
2026-08-28T02:50:53+08:00 | load=2.51 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
  "info_disclosure": false
 },
 "artifacts": "0/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

=== 2026-08-28T02:57:49+08:00 100s tick ===
2026-08-28T02:57:33+08:00 | load=1.05 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
  "info_disclosure": false
 },
 "artifacts": "0/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

=== 2026-08-28T03:04:31+08:00 100s tick ===
2026-08-28T03:04:13+08:00 | load=3.20 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
  "info_disclosure": false
 },
 "artifacts": "0/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

laneB 0/10 0% 0/2 FP0 PASS=False
fps: []
uncovered: ['xss', 'sqli', 'idor', 'ssrf', 'xxe', 'auth_bypass', 'ssti', 'nosql_injection', 'access_control', 'info_disclosure']
laneC 7/12 58% 3/4 FP0 PASS=False
fps: []
uncovered: ['bfla', 'excessive_data_exposure', 'broken_authentication', 'unrestricted_resource_consumption']
tick done
=== 2026-08-28T03:11:13+08:00 100s tick ===
2026-08-28T03:10:54+08:00 | load=4.54 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
  "info_disclosure": false
 },
 "artifacts": "0/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:{ kind : error , text : graphd: /query is read-only (MATCH/RETURN/WITH/CALL only
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

=== 2026-08-28T03:17:54+08:00 100s tick ===
2026-08-28T03:17:36+08:00 | load=5.40 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
  "info_disclosure": false
 },
 "artifacts": "0/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

laneB 2/10 20% 1/2 FP0 PASS=False
fps: []
uncovered: ['sqli', 'idor', 'ssrf', 'xxe', 'auth_bypass', 'ssti', 'access_control', 'info_disclosure']
laneC 7/12 58% 3/4 FP0 PASS=False
fps: []
uncovered: ['bfla', 'excessive_data_exposure', 'broken_authentication', 'unrestricted_resource_consumption']
tick done
=== 2026-08-28T03:24:37+08:00 100s tick ===
2026-08-28T03:24:18+08:00 | load=5.93 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-discovery-kyvp[discovery] exit=0 [pentest] 三环空闲无进展
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": false
 },
 "false_positives": [],
 "PASS": false
}

laneB 2/10 20% 1/2 FP0 PASS=False
uncovered: ['sqli', 'idor', 'ssrf', 'xxe', 'auth_bypass', 'ssti']
laneC 10/12 83% 4/4 FP0 PASS=True
uncovered: ['unrestricted_resource_consumption', 'idor']
tick2 done
[pentest] worker eng-mtbwimf8-discovery-454z[discovery] exit=0
[pentest] worker eng-mtbwimf8-discovery-kyvp[discovery] exit=0
[pentest] 三环空闲无进展 → 自动反思唤醒(1/3)。失败: 
=== 2026-08-28T03:31:19+08:00 100s tick ===
2026-08-28T03:31:00+08:00 | load=5.10 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-discovery-kyvp[discovery] exit=0 [pentest] 三环空闲无进展
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-discovery-8gcj[discovery] exit=0 
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 2/10 20% 1/2 FP0 PASS=False
uncovered: ['sqli', 'idor', 'ssrf', 'xxe', 'auth_bypass', 'ssti']
[pentest] worker eng-mtbwimf8-discovery-454z[discovery] exit=0
[pentest] worker eng-mtbwimf8-discovery-kyvp[discovery] exit=0
[pentest] 三环空闲无进展 → 自动反思唤醒(1/3)。失败: 

=== 2026-08-28T03:38:01+08:00 100s tick ===
2026-08-28T03:37:41+08:00 | load=5.19 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-discovery-kyvp[discovery] exit=0 [pentest] 三环空闲无进展
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": false
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-discovery-hd1t[discovery] exit=null [pentest] 三环空闲
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 4/10 40% 2/2 FP0 PASS=False
uncovered: ['idor', 'ssrf', 'auth_bypass', 'ssti', 'access_control', 'info_disclosure']
[pentest] worker eng-mtbwimf8-discovery-kyvp[discovery] exit=0
[pentest] 三环空闲无进展 → 自动反思唤醒(1/3)。失败: 
[pentest] worker eng-mtbwimf8-creative-xv6y[creative] exit=0
[pentest] 假设待消费(1条open) → 创造环第2次唤醒验证/反驳

=== 2026-08-28T03:44:44+08:00 100s tick ===
2026-08-28T03:44:23+08:00 | load=4.53 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-creative-xv6y[creative] exit=0 [pentest] 假设待消费(1条o
  "info_disclosure": false
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-fv2q[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 6/10 60% 2/2 FP3 PASS=False
uncovered: ['idor', 'ssrf', 'auth_bypass', 'info_disclosure']
[pentest] 假设待消费(1条open) → 创造环第2次唤醒验证/反驳
[pentest] worker eng-mtbwimf8-creative-1xj3[creative] exit=0
[pentest] 假设待消费(6条open) → 创造环第3次唤醒验证/反驳

=== 2026-08-28T03:51:26+08:00 100s tick ===
2026-08-28T03:51:05+08:00 | load=4.12 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-creative-1xj3[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-fv2q[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 7/10 70% 2/2 FP3 PASS=False
fps: ['find-default-admin', 'find-captcha-leak', 'find-memories-leak']
uncovered: ['idor', 'auth_bypass', 'info_disclosure']

=== 2026-08-28T03:58:08+08:00 100s tick ===
2026-08-28T03:57:47+08:00 | load=5.73 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-creative-kmpl[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-fv2q[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 7/10 70% 2/2 FP3 PASS=False
fps: ['find-default-admin', 'find-captcha-leak', 'find-memories-leak']
uncovered: ['idor', 'auth_bypass', 'info_disclosure']
[pentest] 假设待消费(6条open) → 创造环第3次唤醒验证/反驳
[pentest] worker eng-mtbwimf8-creative-kmpl[creative] exit=0
[pentest] 假设待消费(6条open) → 创造环第4次唤醒验证/反驳

=== 2026-08-28T04:04:51+08:00 100s tick ===
2026-08-28T04:04:29+08:00 | load=4.14 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-creative-kmpl[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-yhqj[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 7/10 70% 2/2 FP5 PASS=False
uncovered: ['idor', 'auth_bypass', 'info_disclosure']
[pentest] worker eng-mtbwimf8-creative-1xj3[creative] exit=0
[pentest] 假设待消费(6条open) → 创造环第3次唤醒验证/反驳
[pentest] worker eng-mtbwimf8-creative-kmpl[creative] exit=0
[pentest] 假设待消费(6条open) → 创造环第4次唤醒验证/反驳

=== 2026-08-28T04:11:33+08:00 100s tick ===
2026-08-28T04:11:10+08:00 | load=3.92 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第4次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-o
 },
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak",
  "find-jwt-none-alg-bypass",
  "find-ftp-nullbyte-source-leak"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-mzv4[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

=== 2026-08-28T04:18:16+08:00 100s tick ===
2026-08-28T04:17:52+08:00 | load=3.79 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 9) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
 },
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak",
  "find-jwt-none-alg-bypass",
  "find-ftp-nullbyte-source-leak"
 ],
 "PASS": false
}
laneB 7/10 70% 2/2 FP5 PASS=False
uncovered: ['idor', 'auth_bypass', 'info_disclosure']
[pentest] worker eng-mtbwimf8-creative-oyuw[creative] exit=0
[pentest] 规划器: 3 条计划已生成(最高分 9)
[pentest] 自动调度: 深度环启动 (4 高权重信号)

laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-mzv4[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

=== 2026-08-28T04:24:58+08:00 100s tick ===
2026-08-28T04:24:34+08:00 | load=4.59 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 9) [pentest] 自动调度: 深度环启动 (4 高权重信号) 
 },
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak",
  "find-jwt-none-alg-bypass",
  "find-ftp-nullbyte-source-leak"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-mzv4[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 7/10 70% 2/2 FP5 PASS=False
uncovered: ['idor', 'auth_bypass', 'info_disclosure']
[pentest] worker eng-mtbwimf8-creative-oyuw[creative] exit=0
[pentest] 规划器: 3 条计划已生成(最高分 9)
[pentest] 自动调度: 深度环启动 (4 高权重信号)

=== 2026-08-28T04:31:40+08:00 100s tick ===
2026-08-28T04:31:16+08:00 | load=4.98 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 9.5) [pentest] 自动调度: 深度环启动 (8 高权重信号) 
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak",
  "find-jwt-none-alg-bypass",
  "find-ftp-nullbyte-source-leak",
  "find-jwt-none-bypass-002"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-pp9q[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 9/10 90% 2/2 FP6 PASS=False
fps: ['find-default-admin', 'find-captcha-leak', 'find-memories-leak', 'find-jwt-none-alg-bypass', 'find-ftp-nullbyte-source-leak', 'find-jwt-none-bypass-002']
uncovered: ['info_disclosure']
[pentest] worker eng-mtbwimf8-deep-5x4s[deep] exit=0
[pentest] 规划器: 3 条计划已生成(最高分 9.5)
[pentest] 自动调度: 深度环启动 (8 高权重信号)

=== 2026-08-28T04:38:23+08:00 100s tick ===
2026-08-28T04:37:58+08:00 | load=5.61 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 9.5) [pentest] 自动调度: 深度环启动 (8 高权重信号) 
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak",
  "find-jwt-none-alg-bypass",
  "find-ftp-nullbyte-source-leak",
  "find-jwt-none-bypass-002"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtbwimf8-creative-pp9q[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 9/10 90% 2/2 FP6 PASS=False
fps: ['find-default-admin', 'find-captcha-leak', 'find-memories-leak', 'find-jwt-none-alg-bypass', 'find-ftp-nullbyte-source-leak', 'find-jwt-none-bypass-002']
uncovered: ['info_disclosure']
[pentest] worker eng-mtbwimf8-deep-5x4s[deep] exit=0
[pentest] 规划器: 3 条计划已生成(最高分 9.5)
[pentest] 自动调度: 深度环启动 (8 高权重信号)

=== 2026-08-28T04:45:05+08:00 100s tick ===
2026-08-28T04:44:38+08:00 | load=3.27 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 自动调度: 深度环启动 (8 高权重信号) { kind : success , text : engagement eng-mtbwimf
 "false_positives": [
  "find-default-admin",
  "find-captcha-leak",
  "find-memories-leak",
  "find-jwt-none-alg-bypass",
  "find-ftp-nullbyte-source-leak",
  "find-jwt-none-bypass-002",
  "find-jwt-none-bypass-verified-001",
  "find-password-hash-leak-verified-001",
  "find-security-answers-leak-verified-001"
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 唤醒耗尽仍无发现: 关闭为 exhausted 并标记 NEED_INPUT { kind : success , text : engag
 "artifacts": "4/4",
 "artifact_detail": {
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [],
 "PASS": true
}

laneB 9/10 90% 2/2 FP10 PASS=False
uncovered: ['info_disclosure']
[pentest] 规划器: 3 条计划已生成(最高分 9.5)
[pentest] 自动调度: 深度环启动 (8 高权重信号)
{"kind":"success","text":"engagement eng-mtbwimf8 终态(active), 调度闭环结束"}

laneB 10/10 100% 2/2 FP0 PASS=True
fps: []
uncovered: []
laneC 12/12 100% 4/4 FP0 PASS=True
fps: []

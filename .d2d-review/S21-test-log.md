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


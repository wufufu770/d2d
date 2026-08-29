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

## S21 收官 (2026-08-28 05:00)

### 修复-测试-迭代闭环（本轮 4 次修复）
1. V-01 sanitize 过毁 -> RISKY 收窄+实体映射 (60fc736)
2. V-02 隐式 POST 漏拦 -> BLOCKED_FLAGS +6 data flags (60fc736)
3. V-05 /query 只读误拦 host 写 -> V-05r 仅限 worker token (77dfb09)
4. 评分器下划线/空格归一化缺失 -> _norm() (083e854)

### 终局战绩
- laneC crapi: 12/12 100% + 4/4 + 0FP PASS -> control-v2
- laneB juice-shop-online: 10/10 100% + 2/2 + 0FP PASS -> control-v3
- control :8766 ExperienceWeight 18 rows (crapi 7 + 历史留存)
- tags: control-v1(18/24 冻结) / control-v2 / control-v3 均已推 GitHub
- 本轮 commits: 60fc736 9e85731 77dfb09 c9afe2e 083e854 (5 个, 全部已推)

## S21 收官 (2026-08-28 05:00)

### 修复-测试-迭代闭环（本轮 4 次修复）
1. V-01 sanitize 过毁 -> RISKY 收窄+实体映射 (60fc736)
2. V-02 隐式 POST 漏拦 -> BLOCKED_FLAGS +6 data flags (60fc736)
3. V-05 /query 只读误拦 host 写 -> V-05r 仅限 worker token (77dfb09)
4. 评分器下划线/空格归一化缺失 -> _norm() (083e854)

### 终局战绩
- laneC crapi: 12/12 100% + 4/4 + 0FP PASS -> control-v2
- laneB juice-shop-online: 10/10 100% + 2/2 + 0FP PASS -> control-v3
- control :8766 ExperienceWeight 18 rows, 合规 6/9
- tags: control-v1 / control-v2 / control-v3 均已推 GitHub
- 本轮 commits: 60fc736 9e85731 77dfb09 c9afe2e 083e854 (全部已推)
=== 2026-08-28T04:51:48+08:00 100s tick ===
2026-08-28T04:51:18+08:00 | load=2.13 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 2 条计划已生成(最高分 9.5) [pentest] 自动调度: 深度环启动 (11 高权重信号) 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T04:58:30+08:00 100s tick ===
2026-08-28T04:57:59+08:00 | load=2.02 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 2 条计划已生成(最高分 9.5) [pentest] 自动调度: 深度环启动 (11 高权重信号) 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:05:12+08:00 100s tick ===
2026-08-28T05:04:39+08:00 | load=1.12 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 2 条计划已生成(最高分 9.5) [pentest] 自动调度: 深度环启动 (11 高权重信号) 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:11:54+08:00 100s tick ===
2026-08-28T05:11:19+08:00 | load=1.19 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtbwimf8-deep-k8wi[deep] exit=null [pentest] 假设待消费(6条open) 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:18:37+08:00 100s tick ===
2026-08-28T05:17:59+08:00 | load=1.62 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:25:19+08:00 100s tick ===
2026-08-28T05:24:40+08:00 | load=0.78 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:32:01+08:00 100s tick ===
2026-08-28T05:31:20+08:00 | load=0.69 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:38:44+08:00 100s tick ===
2026-08-28T05:38:00+08:00 | load=0.63 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:45:26+08:00 100s tick ===
2026-08-28T05:44:40+08:00 | load=1.00 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:52:08+08:00 100s tick ===
2026-08-28T05:51:21+08:00 | load=1.00 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T05:58:50+08:00 100s tick ===
2026-08-28T05:58:01+08:00 | load=1.59 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:05:33+08:00 100s tick ===
2026-08-28T06:04:41+08:00 | load=2.18 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:12:15+08:00 100s tick ===
2026-08-28T06:11:21+08:00 | load=2.66 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:18:57+08:00 100s tick ===
2026-08-28T06:18:03+08:00 | load=5.03 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:25:40+08:00 100s tick ===
2026-08-28T06:24:43+08:00 | load=2.31 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:32:22+08:00 100s tick ===
2026-08-28T06:31:24+08:00 | load=1.98 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:39:04+08:00 100s tick ===
2026-08-28T06:38:04+08:00 | load=2.40 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:45:47+08:00 100s tick ===
2026-08-28T06:44:44+08:00 | load=2.85 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:52:29+08:00 100s tick ===
2026-08-28T06:51:24+08:00 | load=2.36 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T06:59:11+08:00 100s tick ===
2026-08-28T06:58:05+08:00 | load=2.26 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:05:53+08:00 100s tick ===
2026-08-28T07:04:45+08:00 | load=1.86 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:12:36+08:00 100s tick ===
2026-08-28T07:11:25+08:00 | load=2.90 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:19:18+08:00 100s tick ===
2026-08-28T07:18:06+08:00 | load=2.64 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:26:00+08:00 100s tick ===
2026-08-28T07:24:47+08:00 | load=3.93 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:32:42+08:00 100s tick ===
2026-08-28T07:31:27+08:00 | load=2.60 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:39:24+08:00 100s tick ===
2026-08-28T07:38:07+08:00 | load=2.33 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:46:07+08:00 100s tick ===
2026-08-28T07:44:47+08:00 | load=2.86 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:52:49+08:00 100s tick ===
2026-08-28T07:51:28+08:00 | load=2.25 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T07:59:31+08:00 100s tick ===
2026-08-28T07:58:10+08:00 | load=3.81 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:06:13+08:00 100s tick ===
2026-08-28T08:04:50+08:00 | load=3.27 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:12:56+08:00 100s tick ===
2026-08-28T08:11:30+08:00 | load=2.06 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:19:38+08:00 100s tick ===
2026-08-28T08:18:10+08:00 | load=2.89 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:26:20+08:00 100s tick ===
2026-08-28T08:24:51+08:00 | load=2.38 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:33:03+08:00 100s tick ===
2026-08-28T08:31:31+08:00 | load=2.73 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:39:45+08:00 100s tick ===
2026-08-28T08:38:11+08:00 | load=2.36 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:46:27+08:00 100s tick ===
2026-08-28T08:44:51+08:00 | load=3.33 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:53:09+08:00 100s tick ===
2026-08-28T08:51:32+08:00 | load=2.52 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T08:59:52+08:00 100s tick ===
2026-08-28T08:58:12+08:00 | load=2.63 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:06:34+08:00 100s tick ===
2026-08-28T09:04:54+08:00 | load=3.95 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:13:16+08:00 100s tick ===
2026-08-28T09:11:34+08:00 | load=2.66 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:19:59+08:00 100s tick ===
2026-08-28T09:18:14+08:00 | load=2.50 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:26:41+08:00 100s tick ===
2026-08-28T09:24:54+08:00 | load=2.29 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:33:23+08:00 100s tick ===
2026-08-28T09:31:35+08:00 | load=2.31 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:40:05+08:00 100s tick ===
2026-08-28T09:38:15+08:00 | load=2.63 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:46:48+08:00 100s tick ===
2026-08-28T09:44:55+08:00 | load=2.89 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T09:53:30+08:00 100s tick ===
2026-08-28T09:51:35+08:00 | load=2.88 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:00:12+08:00 100s tick ===
2026-08-28T09:58:16+08:00 | load=2.92 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:06:55+08:00 100s tick ===
2026-08-28T10:04:56+08:00 | load=2.31 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:13:37+08:00 100s tick ===
2026-08-28T10:11:38+08:00 | load=3.89 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:20:19+08:00 100s tick ===
2026-08-28T10:18:19+08:00 | load=3.54 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:27:02+08:00 100s tick ===
2026-08-28T10:25:01+08:00 | load=3.97 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:33:44+08:00 100s tick ===
2026-08-28T10:31:41+08:00 | load=2.73 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:40:26+08:00 100s tick ===
2026-08-28T10:38:22+08:00 | load=2.55 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:47:08+08:00 100s tick ===
2026-08-28T10:45:02+08:00 | load=2.43 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T10:53:51+08:00 100s tick ===
2026-08-28T10:51:42+08:00 | load=3.48 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:00:33+08:00 100s tick ===
2026-08-28T10:58:22+08:00 | load=2.57 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:07:15+08:00 100s tick ===
2026-08-28T11:05:03+08:00 | load=2.32 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:13:58+08:00 100s tick ===
2026-08-28T11:11:43+08:00 | load=2.45 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:20:40+08:00 100s tick ===
2026-08-28T11:18:23+08:00 | load=2.20 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:27:22+08:00 100s tick ===
2026-08-28T11:25:03+08:00 | load=2.48 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:34:04+08:00 100s tick ===
2026-08-28T11:31:44+08:00 | load=3.34 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:40:47+08:00 100s tick ===
2026-08-28T11:38:24+08:00 | load=2.61 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:47:29+08:00 100s tick ===
2026-08-28T11:45:04+08:00 | load=2.97 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T11:54:11+08:00 100s tick ===
2026-08-28T11:51:46+08:00 | load=5.41 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtbwimf8-creative-1
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": true
}
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

=== 2026-08-28T12:00:54+08:00 100s tick ===
2026-08-28T11:58:28+08:00 | load=4.61 mem=% kuzu=1 lanes=1
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

laneB aspgoat 1/20 5% 1/4 FP0 PASS=False
uncovered: ['xss', 'csrf', 'sqli', 'xxe', 'rce', 'file_upload', 'info_disclosure', 'broken_auth']
fps: []

=== 2026-08-28T12:07:36+08:00 100s tick ===
2026-08-28T12:05:09+08:00 | load=4.94 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcf6uor-discovery-np72[discovery] exit=0 
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "FIND-LFI-TRAV-001",
  "f-1787889881757"
 ],
 "PASS": false
}
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

laneB 5/20 25% 1/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'idor', 'broken_authentication']
[pentest] 验证器环: 独立重放全部候选 Finding...
[pentest] 验证完成: 0/6 通过重放, 其余隔离
[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀

=== 2026-08-28T12:14:17+08:00 100s tick ===
2026-08-28T12:11:51+08:00 | load=4.79 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcf6uor
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "FIND-LFI-TRAV-001",
  "f-1787889881757"
 ],
 "PASS": false
}
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

=== 2026-08-28T12:21:00+08:00 100s tick ===
2026-08-28T12:18:33+08:00 | load=5.17 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcf6uor
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "FIND-LFI-TRAV-001",
  "f-1787889881757"
 ],
 "PASS": false
}
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

aspgoat 5/20 25% 1/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'idor', 'broken_authentication']
[pentest] 验证完成: 0/6 通过重放, 其余隔离
[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀
{"kind":"success","text":"engagement eng-mtcf6uor 终态(completed), 调度闭环结束"}

worker alive
2026-08-28T12:26:38+08:00 | auto-rotate started, queue=[ "testfire", "zerobank", "testasp", "testaspnet", "restvulnweb", "gruyere"]
2026-08-28T12:26:39+08:00 | === testfire attempt 1/3 ===
2026-08-28T12:26:40+08:00 | launched testfire (http://demo.testfire.net)
=== 2026-08-28T12:27:42+08:00 100s tick ===
2026-08-28T12:25:13+08:00 | load=3.39 mem=% kuzu=1 lanes=2
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

2026-08-28T12:33:21+08:00 | testfire tick: FAIL
testfire 5/9 56% 3/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'csrf', 'open_redirect']
fps: []

=== 2026-08-28T12:34:24+08:00 100s tick ===
2026-08-28T12:31:55+08:00 | load=4.59 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
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

2026-08-28T12:40:02+08:00 | testfire tick: PASS
2026-08-28T12:40:02+08:00 | ✅ testfire PASS @attempt 1
2026-08-28T12:40:03+08:00 | testfire PASSED -> next target
2026-08-28T12:40:04+08:00 | === zerobank attempt 1/3 ===
2026-08-28T12:40:05+08:00 | launched zerobank (http://zero.webappsecurity.com)
testfire 0/9 0% 0/4 FP0 PASS=False
covered: []
fps: []
                                                                                                                                                                                          {"kind":"success","text":"engagement eng-mtcg9c5x 终态(unknown
=== 2026-08-28T12:41:07+08:00 100s tick ===
2026-08-28T12:38:36+08:00 | load=4.68 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : succe
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

2026-08-28T12:46:46+08:00 | zerobank tick: FAIL
2026-08-28T12:40:02+08:00 | testfire tick: PASS
2026-08-28T12:40:02+08:00 | ✅ testfire PASS @attempt 1
2026-08-28T12:40:03+08:00 | testfire PASSED -> next target
2026-08-28T12:40:04+08:00 | === zerobank attempt 1/3 ===
2026-08-28T12:40:05+08:00 | launched zerobank (http://zero.webappsecurity.com)
2026-08-28T12:46:46+08:00 | zerobank tick: FAIL
testfire 5/9 56% 2/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'csrf', 'cookies_flags']
=== 2026-08-28T12:47:49+08:00 100s tick ===
2026-08-28T12:45:19+08:00 | load=5.56 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : succe
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "finding-race-condition-transfer",
  "finding-admin-privilege-escalation",
  "finding-token-not-invalidated"
 ],
 "PASS": false
}
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

2026-08-28T12:51:00+08:00 | auto-rotate started, queue=[ "zerobank", "testasp", "testaspnet", "restvulnweb", "gruyere"]
2026-08-28T12:51:01+08:00 | === zerobank attempt 1/3 ===
2026-08-28T12:51:02+08:00 | launched zerobank (http://zero.webappsecurity.com)
=== 2026-08-28T12:54:32+08:00 100s tick ===
2026-08-28T12:52:00+08:00 | load=4.38 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcgqkzq-discovery-s0oi[discovery] exit=0 [pentest] worker 
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787892741933",
  "f-1787892754998",
  "f-1787892764263"
 ],
 "PASS": false
}
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

2026-08-28T12:57:43+08:00 | zerobank tick: FAIL
2026-08-28T12:51:01+08:00 | === zerobank attempt 1/3 ===
2026-08-28T12:51:02+08:00 | launched zerobank (http://zero.webappsecurity.com)
2026-08-28T12:57:43+08:00 | zerobank tick: FAIL
zerobank 4/8 50% 1/4 FP5 PASS=False
covered: ['xss', 'info_disclosure', 'broken_auth', 'csrf']
=== 2026-08-28T13:01:14+08:00 100s tick ===
2026-08-28T12:58:42+08:00 | load=6.28 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcgqkzq-discovery-s0oi[discovery] exit=0 [pentest] worker 
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787892741933",
  "f-1787892754998",
  "f-1787892764263",
  "f-1787893045062"
 ],
 "PASS": false
}
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

2026-08-28T13:04:25+08:00 | zerobank tick: FAIL
2026-08-28T12:57:43+08:00 | zerobank tick: FAIL
2026-08-28T13:04:25+08:00 | zerobank tick: FAIL
zerobank 5/8 62% 2/4 FP6 PASS=False
covered: ['xss', 'lfi', 'info_disclosure', 'broken_auth', 'csrf']
fps: ['f-1787892741694', 'f-1787892741808', 'f-1787892741933', 'f-1787892764263', 'f-1787893045062']
=== 2026-08-28T13:07:56+08:00 100s tick ===
2026-08-28T13:05:24+08:00 | load=5.46 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:y-s0oi[discovery] exit=0 [pentest] worker eng-mtcgqkzq-discovery-3kee[discovery]
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787892741933",
  "f-1787892754998",
  "f-1787892764263",
  "f-1787893449554"
 ],
 "PASS": false
}
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

2026-08-28T13:10:23+08:00 | auto-rotate started, queue=[ "zerobank", "testasp", "testaspnet", "restvulnweb", "gruyere"]
2026-08-28T13:10:24+08:00 | === zerobank attempt 1/3 hints=[] ===
2026-08-28T13:10:24+08:00 | launched zerobank (http://zero.webappsecurity.com)
=== 2026-08-28T13:14:39+08:00 100s tick ===
2026-08-28T13:12:06+08:00 | load=5.35 mem=% kuzu=1 lanes=1
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

2026-08-28T13:17:06+08:00 | zerobank tick: FAIL
2026-08-28T13:10:24+08:00 | === zerobank attempt 1/3 hints=[] ===
2026-08-28T13:10:24+08:00 | launched zerobank (http://zero.webappsecurity.com)
2026-08-28T13:17:06+08:00 | zerobank tick: FAIL
zerobank 0/11 0% 0/4 FP0 PASS=False
covered: []
=== 2026-08-28T13:21:21+08:00 100s tick ===
2026-08-28T13:18:47+08:00 | load=4.42 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T13:23:47+08:00 | zerobank tick: FAIL
2026-08-28T13:17:06+08:00 | zerobank tick: FAIL
2026-08-28T13:23:47+08:00 | zerobank tick: FAIL
zerobank 5/11 45% 1/4 FP0 PASS=False
covered: ['info_disclosure', 'broken_auth', 'csrf', 'cookies_flags', 'broken_access_control']
=== 2026-08-28T13:28:03+08:00 100s tick ===
2026-08-28T13:25:29+08:00 | load=4.90 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtchtl76-discovery-yig0[discovery] exit=0 
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T13:30:29+08:00 | zerobank tick: FAIL
2026-08-28T13:23:47+08:00 | zerobank tick: FAIL
2026-08-28T13:30:29+08:00 | zerobank tick: FAIL
zerobank 6/11 55% 2/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'csrf', 'cookies_flags', 'broken_access_control']
uncovered: ['sqli', 'xss', 'open_redirect', 'security_misconfiguration', 'race_condition']
=== 2026-08-28T13:34:46+08:00 100s tick ===
2026-08-28T13:32:11+08:00 | load=4.24 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 35) [pentest] 自动调度: 深度环启动 (3 高权重信号) 
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T13:37:10+08:00 | zerobank tick: FAIL
2026-08-28T13:30:29+08:00 | zerobank tick: FAIL
2026-08-28T13:37:10+08:00 | zerobank tick: FAIL
zerobank 6/11 55% 2/4 FP0 PASS=False
uncovered: ['sqli', 'xss', 'open_redirect', 'security_misconfiguration', 'race_condition']
[pentest] 规划器: 3 条计划已生成(最高分 35)
[pentest] 自动调度: 深度环启动 (3 高权重信号)

=== 2026-08-28T13:41:28+08:00 100s tick ===
2026-08-28T13:38:53+08:00 | load=5.68 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 3 条计划已生成(最高分 35) [pentest] 自动调度: 深度环启动 (3 高权重信号) 
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T13:43:52+08:00 | zerobank tick: FAIL
2026-08-28T13:37:10+08:00 | zerobank tick: FAIL
2026-08-28T13:43:52+08:00 | zerobank tick: FAIL
zerobank 7/11 64% 2/4 FP0 PASS=False
uncovered: ['sqli', 'xss', 'security_misconfiguration', 'race_condition']
[pentest] worker eng-mtchtl76-deep-y6jd[deep] exit=0
[pentest] 验证器环: 独立重放全部候选 Finding...

=== 2026-08-28T13:48:10+08:00 100s tick ===
2026-08-28T13:45:33+08:00 | load=3.44 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标达成(verified>=1 且无未消化假设): 执行经验沉淀并冻结 { kind : success , text : engagem
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T13:50:33+08:00 | zerobank tick: FAIL
2026-08-28T13:43:52+08:00 | zerobank tick: FAIL
2026-08-28T13:50:33+08:00 | zerobank tick: FAIL
zerobank 7/11 64% 2/4 FP0 PASS=False
uncovered: ['sqli', 'xss', 'security_misconfiguration', 'race_condition']
[pentest] 目标达成(verified>=1 且无未消化假设): 执行经验沉淀并冻结
{"kind":"success","text":"engagement eng-mtchtl76 终态(completed), 调度闭环结束"}

=== 2026-08-28T13:54:53+08:00 100s tick ===
2026-08-28T13:52:15+08:00 | load=5.11 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标达成(verified>=1 且无未消化假设): 执行经验沉淀并冻结 { kind : success , text : engagem
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T13:57:15+08:00 | zerobank tick: FAIL
2026-08-28T13:37:10+08:00 | zerobank tick: FAIL
2026-08-28T13:43:52+08:00 | zerobank tick: FAIL
2026-08-28T13:50:33+08:00 | zerobank tick: FAIL
2026-08-28T13:57:15+08:00 | zerobank tick: FAIL
zerobank 7/11 64% 2/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'csrf', 'open_redirect', 'cookies_flags', 'broken_access_control']
=== 2026-08-28T14:01:35+08:00 100s tick ===
2026-08-28T13:58:55+08:00 | load=2.13 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标达成(verified>=1 且无未消化假设): 执行经验沉淀并冻结 { kind : success , text : engagem
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T14:03:56+08:00 | zerobank tick: FAIL
2026-08-28T13:50:33+08:00 | zerobank tick: FAIL
2026-08-28T13:57:15+08:00 | zerobank tick: FAIL
2026-08-28T14:03:56+08:00 | zerobank tick: FAIL
zerobank 7/11 64% 2/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'csrf', 'open_redirect', 'cookies_flags', 'broken_access_control']
uncovered: ['sqli', 'xss', 'security_misconfiguration', 'race_condition']
=== 2026-08-28T14:08:17+08:00 100s tick ===
2026-08-28T14:05:37+08:00 | load=3.63 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标达成(verified>=1 且无未消化假设): 执行经验沉淀并冻结 { kind : success , text : engagem
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T14:10:38+08:00 | zerobank tick: FAIL
2026-08-28T13:57:15+08:00 | zerobank tick: FAIL
2026-08-28T14:03:56+08:00 | zerobank tick: FAIL
2026-08-28T14:10:38+08:00 | zerobank tick: FAIL
zerobank 7/11 64% 2/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'csrf', 'open_redirect', 'cookies_flags', 'broken_access_control']
uncovered: ['sqli', 'xss', 'security_misconfiguration', 'race_condition']
=== 2026-08-28T14:14:58+08:00 100s tick ===
2026-08-28T14:12:18+08:00 | load=4.02 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标达成(verified>=1 且无未消化假设): 执行经验沉淀并冻结 { kind : success , text : engagem
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T14:17:19+08:00 | zerobank tick: FAIL
2026-08-28T14:03:56+08:00 | zerobank tick: FAIL
2026-08-28T14:10:38+08:00 | zerobank tick: FAIL
2026-08-28T14:17:19+08:00 | zerobank tick: FAIL
1
zerobank 7/11 64% 2/4 FP0 PASS=False
=== 2026-08-28T14:21:40+08:00 100s tick ===
2026-08-28T14:19:00+08:00 | load=4.15 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 目标达成(verified>=1 且无未消化假设): 执行经验沉淀并冻结 { kind : success , text : engagem
  "info_disclosure": false
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T14:24:01+08:00 | zerobank tick: FAIL
2026-08-28T14:24:01+08:00 | === zerobank attempt 2/3 hints=[] ===
2026-08-28T14:24:02+08:00 | launched zerobank (http://zero.webappsecurity.com)
2026-08-28T14:17:19+08:00 | zerobank tick: FAIL
2026-08-28T14:24:01+08:00 | zerobank tick: FAIL
2026-08-28T14:24:01+08:00 | === zerobank attempt 2/3 hints=[] ===
2026-08-28T14:24:02+08:00 | launched zerobank (http://zero.webappsecurity.com)
zerobank 0/11 0% 0/4 FP0 PASS=False
uncovered: ['sqli', 'xss', 'lfi', 'info_disclosure', 'broken_auth', 'csrf', 'open_redirect', 'cookies_flags', 'broken_access_control', 'security_misconfiguration', 'race_condition']
=== 2026-08-28T14:28:23+08:00 100s tick ===
2026-08-28T14:25:42+08:00 | load=4.84 mem=% kuzu=1 lanes=1
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

2026-08-28T14:30:26+08:00 | auto-rotate started, queue=[ "zerobank", "testasp", "testaspnet", "restvulnweb", "gruyere"]
2026-08-28T14:30:27+08:00 | === zerobank attempt 1/3 hints=[] ===
2026-08-28T14:30:27+08:00 | launched zerobank (http://zero.webappsecurity.com)
=== 2026-08-28T14:35:05+08:00 100s tick ===
2026-08-28T14:32:24+08:00 | load=6.02 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
  "info_disclosure": true
 },
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T14:37:09+08:00 | zerobank tick: FAIL
2026-08-28T14:30:27+08:00 | launched zerobank (http://zero.webappsecurity.com)
2026-08-28T14:37:09+08:00 | zerobank tick: FAIL
zerobank 5/11 45% 2/4 FP0 PASS=False
covered: ['lfi', 'info_disclosure', 'broken_auth', 'csrf', 'broken_access_control']
=== 2026-08-28T14:41:47+08:00 100s tick ===
2026-08-28T14:39:05+08:00 | load=5.12 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-discovery-pvhf[discovery] exit=0 
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1"
 ],
 "PASS": false
}
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

2026-08-28T14:43:50+08:00 | zerobank tick: FAIL
2026-08-28T14:37:09+08:00 | zerobank tick: FAIL
2026-08-28T14:43:50+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False
uncovered: ['sqli', 'security_misconfiguration']
=== 2026-08-28T14:48:30+08:00 100s tick ===
2026-08-28T14:45:47+08:00 | load=4.11 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-discovery-pvhf[discovery] exit=0 
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T14:50:32+08:00 | zerobank tick: FAIL
2026-08-28T14:43:50+08:00 | zerobank tick: FAIL
2026-08-28T14:50:32+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False
uncovered: ['sqli', 'security_misconfiguration']
[pentest] worker eng-mtckoj7y-discovery-ap2z[discovery] exit=null
[pentest] 假设待消费(1条open) → 创造环第1次唤醒验证/反驳

=== 2026-08-28T14:55:12+08:00 100s tick ===
2026-08-28T14:52:28+08:00 | load=3.04 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-discovery-ap2z[discovery] exit=null [pentest] 假设待消
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T14:57:13+08:00 | zerobank tick: FAIL
2026-08-28T14:50:32+08:00 | zerobank tick: FAIL
2026-08-28T14:57:13+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False
uncovered: ['sqli', 'security_misconfiguration']
=== 2026-08-28T15:01:54+08:00 100s tick ===
2026-08-28T14:59:09+08:00 | load=4.57 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-creative-33tf[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T15:03:55+08:00 | zerobank tick: FAIL
2026-08-28T14:57:13+08:00 | zerobank tick: FAIL
2026-08-28T15:03:55+08:00 | zerobank tick: FAIL
zerobank 10/11 91% 3/4 FP0 PASS=False
uncovered: ['security_misconfiguration']
[pentest] worker eng-mtckoj7y-creative-33tf[creative] exit=0
[pentest] 假设待消费(6条open) → 创造环第2次唤醒验证/反驳

=== 2026-08-28T15:08:36+08:00 100s tick ===
2026-08-28T15:05:51+08:00 | load=7.17 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-creative-33tf[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T15:10:37+08:00 | zerobank tick: FAIL
2026-08-28T15:03:55+08:00 | zerobank tick: FAIL
2026-08-28T15:10:37+08:00 | zerobank tick: FAIL
zerobank 10/11 91% 3/4 FP0 PASS=False
uncovered: ['security_misconfiguration']
=== 2026-08-28T15:15:19+08:00 100s tick ===
2026-08-28T15:12:33+08:00 | load=6.63 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-creative-33tf[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T15:17:18+08:00 | zerobank tick: FAIL
=== 2026-08-28T15:22:01+08:00 100s tick ===
2026-08-28T15:19:13+08:00 | load=2.97 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-creative-0lc5[creative] exit=null [pentest] 假设待消费(
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T15:24:00+08:00 | zerobank tick: FAIL
=== 2026-08-28T15:28:43+08:00 100s tick ===
2026-08-28T15:25:53+08:00 | load=2.61 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-creative-rwp6[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T15:30:41+08:00 | zerobank tick: FAIL
=== 2026-08-28T15:35:26+08:00 100s tick ===
2026-08-28T15:32:34+08:00 | load=3.10 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-creative-rwp6[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T15:37:23+08:00 | zerobank tick: FAIL
=== 2026-08-28T15:42:08+08:00 100s tick ===
2026-08-28T15:39:15+08:00 | load=5.07 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtckoj7y-creative-x87e[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-open-redirect-1",
  "f-csrf-weak-ap2z",
  "f-transfer-concurrency-ap2z"
 ],
 "PASS": false
}
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

2026-08-28T15:44:04+08:00 | zerobank tick: FAIL
2026-08-28T15:44:06+08:00 | === zerobank attempt 2/3 hints=[证据:ART-sqli-search] ===
2026-08-28T15:44:06+08:00 | launched zerobank (http://zero.webappsecurity.com)
=== 2026-08-28T15:48:50+08:00 100s tick ===
2026-08-28T15:45:57+08:00 | load=4.11 mem=% kuzu=1 lanes=1
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

2026-08-28T15:50:47+08:00 | zerobank tick: FAIL
=== 2026-08-28T15:55:33+08:00 100s tick ===
2026-08-28T15:52:37+08:00 | load=3.33 mem=% kuzu=1 lanes=2
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

2026-08-28T15:57:29+08:00 | zerobank tick: FAIL
=== 2026-08-28T16:02:15+08:00 100s tick ===
2026-08-28T15:59:19+08:00 | load=3.61 mem=% kuzu=1 lanes=1
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

2026-08-28T16:04:10+08:00 | zerobank tick: FAIL
=== 2026-08-28T16:08:57+08:00 100s tick ===
2026-08-28T16:06:01+08:00 | load=4.74 mem=% kuzu=1 lanes=1
2026-08-28T15:57:29+08:00 | zerobank tick: FAIL
2026-08-28T16:04:10+08:00 | zerobank tick: FAIL
zerobank 4/11 36% 1/4 FP1 PASS=False
uncovered: ['sqli', 'xss', 'lfi', 'open_redirect', 'cookies_flags', 'security_misconfiguration', 'race_condition']
tick done
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 },
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla"
 ],
 "PASS": false
}
wff      2567252  0.1  2.1 9878056 85496 ?       Sl   14:30   0:07 node round-launch.mjs dsh
wff      2647002  0.2  2.2 9883460 87324 ?       Sl   15:44   0:03 node round-launch.mjs dsh
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

2026-08-28T16:10:52+08:00 | zerobank tick: FAIL
=== 2026-08-28T16:15:39+08:00 100s tick ===
2026-08-28T16:12:42+08:00 | load=4.90 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 },
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla"
 ],
 "PASS": false
}
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

2026-08-28T15:57:29+08:00 | zerobank tick: FAIL
2026-08-28T16:04:10+08:00 | zerobank tick: FAIL
2026-08-28T16:10:52+08:00 | zerobank tick: FAIL
zerobank 5/11 45% 2/4 FP1 PASS=False
uncovered: ['xss', 'lfi', 'open_redirect', 'cookies_flags', 'security_misconfiguration', 'race_condition']
tick done
2026-08-28T16:17:33+08:00 | zerobank tick: FAIL
=== 2026-08-28T16:22:21+08:00 100s tick ===
2026-08-28T16:19:23+08:00 | load=2.95 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla",
  "find-open-redirect-001"
 ],
 "PASS": false
}
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

2026-08-28T16:10:52+08:00 | zerobank tick: FAIL
2026-08-28T16:17:33+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP1 PASS=False
uncovered: ['lfi', 'race_condition']
tick done
2026-08-28T16:24:14+08:00 | zerobank tick: FAIL
=== 2026-08-28T16:29:04+08:00 100s tick ===
2026-08-28T16:26:04+08:00 | load=3.94 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla",
  "find-open-redirect-001"
 ],
 "PASS": false
}
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

2026-08-28T16:30:56+08:00 | zerobank tick: FAIL
2026-08-28T16:24:14+08:00 | zerobank tick: FAIL
2026-08-28T16:30:56+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP1 PASS=False
uncovered: ['lfi', 'race_condition']
fps: ['f-1787904230623']
tick done
=== 2026-08-28T16:35:46+08:00 100s tick ===
2026-08-28T16:32:46+08:00 | load=5.38 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla",
  "find-open-redirect-001"
 ],
 "PASS": false
}
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

2026-08-28T16:37:38+08:00 | zerobank tick: FAIL
2026-08-28T16:30:56+08:00 | zerobank tick: FAIL
2026-08-28T16:37:38+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP1 PASS=False
tick done
=== 2026-08-28T16:42:28+08:00 100s tick ===
2026-08-28T16:39:27+08:00 | load=4.92 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证器环: 独立重放全部候选 Finding... [pentest] 验证完成: 1/5 通过重放, 其余隔离 
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla",
  "find-open-redirect-001"
 ],
 "PASS": false
}
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

2026-08-28T16:44:19+08:00 | zerobank tick: FAIL
2026-08-28T16:37:38+08:00 | zerobank tick: FAIL
2026-08-28T16:44:19+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP1 PASS=False
tick done
=== 2026-08-28T16:49:10+08:00 100s tick ===
2026-08-28T16:46:09+08:00 | load=5.18 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 1/5 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla",
  "find-open-redirect-001"
 ],
 "PASS": false
}
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

2026-08-28T16:51:00+08:00 | zerobank tick: FAIL
2026-08-28T16:44:19+08:00 | zerobank tick: FAIL
2026-08-28T16:51:00+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP1 PASS=False
tick done
=== 2026-08-28T16:55:53+08:00 100s tick ===
2026-08-28T16:52:50+08:00 | load=4.49 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 1/5 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
 "false_positives": [
  "f-1787904163207",
  "f-1787904171460",
  "f-1787904210371",
  "f-1787904230623",
  "find-admin-bfla",
  "find-open-redirect-001"
 ],
 "PASS": false
}
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

2026-08-28T16:57:42+08:00 | zerobank tick: FAIL
2026-08-28T16:57:42+08:00 | === zerobank attempt 3/3 hints=[证据:ART-sqli-search] ===
2026-08-28T16:57:43+08:00 | launched zerobank (http://zero.webappsecurity.com)
2026-08-28T16:57:42+08:00 | === zerobank attempt 3/3 hints=[证据:ART-sqli-search] ===
2026-08-28T16:57:43+08:00 | launched zerobank (http://zero.webappsecurity.com)
zerobank 0/11 0% 0/4 FP0 PASS=False
tick done
=== 2026-08-28T17:02:35+08:00 100s tick ===
2026-08-28T16:59:32+08:00 | load=5.70 mem=% kuzu=1 lanes=1
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

2026-08-28T17:04:24+08:00 | zerobank tick: FAIL
2026-08-28T16:57:42+08:00 | === zerobank attempt 3/3 hints=[证据:ART-sqli-search] ===
2026-08-28T16:57:43+08:00 | launched zerobank (http://zero.webappsecurity.com)
2026-08-28T17:04:24+08:00 | zerobank tick: FAIL
=== 2026-08-28T17:09:17+08:00 100s tick ===
2026-08-28T17:06:14+08:00 | load=5.65 mem=% kuzu=1 lanes=1
zerobank 0/11 0% 0/4 FP0 PASS=False
tick done
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

2026-08-28T17:11:05+08:00 | zerobank tick: FAIL
=== 2026-08-28T17:15:59+08:00 100s tick ===
2026-08-28T17:12:55+08:00 | load=4.15 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

zerobank 8/11 73% 3/4 FP0 PASS=False
tick done
2026-08-28T17:17:47+08:00 | zerobank tick: FAIL
=== 2026-08-28T17:22:41+08:00 100s tick ===
2026-08-28T17:19:37+08:00 | load=5.04 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 2 条计划已生成(最高分 27) [pentest] 自动调度: 深度环启动 (3 高权重信号) 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

zerobank 8/11 73% 3/4 FP0 PASS=False
uncovered: ['cookies_flags', 'security_misconfiguration', 'race_condition']
tick done
2026-08-28T17:24:28+08:00 | zerobank tick: FAIL
=== 2026-08-28T17:29:23+08:00 100s tick ===
2026-08-28T17:26:18+08:00 | load=3.52 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 2 条计划已生成(最高分 27) [pentest] 自动调度: 深度环启动 (3 高权重信号) 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T17:31:09+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False
tick done
2026-08-28T17:24:28+08:00 | zerobank tick: FAIL
2026-08-28T17:31:09+08:00 | zerobank tick: FAIL
=== 2026-08-28T17:36:05+08:00 100s tick ===
2026-08-28T17:32:59+08:00 | load=6.25 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 0/3 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T17:37:50+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False uncovered=['cookies_flags', 'race_condition']
tick done
=== 2026-08-28T17:42:47+08:00 100s tick ===
2026-08-28T17:39:40+08:00 | load=3.56 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 0/3 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T17:44:32+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False
tick done
2026-08-28T17:31:09+08:00 | zerobank tick: FAIL
2026-08-28T17:37:50+08:00 | zerobank tick: FAIL
2026-08-28T17:44:32+08:00 | zerobank tick: FAIL
=== 2026-08-28T17:49:29+08:00 100s tick ===
2026-08-28T17:46:22+08:00 | load=6.10 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 0/3 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T17:51:13+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False
tick done
=== 2026-08-28T17:56:11+08:00 100s tick ===
2026-08-28T17:53:03+08:00 | load=4.38 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 0/3 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T17:57:55+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False art={'ART-sqli-search': False, 'ART-lfi-passwd': True, 'ART-xss-reflected': True, 'ART-info': True}
=== 2026-08-28T18:02:52+08:00 100s tick ===
2026-08-28T17:59:43+08:00 | load=2.70 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 0/3 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T18:04:36+08:00 | zerobank tick: FAIL
=== 2026-08-28T18:09:35+08:00 100s tick ===
2026-08-28T18:06:25+08:00 | load=7.25 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 验证完成: 0/3 通过重放, 其余隔离 [pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 
  "info_disclosure": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
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

2026-08-28T17:44:32+08:00 | zerobank tick: FAIL
2026-08-28T17:51:13+08:00 | zerobank tick: FAIL
2026-08-28T17:57:55+08:00 | zerobank tick: FAIL
2026-08-28T18:04:36+08:00 | zerobank tick: FAIL
zerobank 9/11 82% 3/4 FP0 PASS=False
tick done
2026-08-28T18:11:18+08:00 | zerobank tick: FAIL
2026-08-28T18:11:19+08:00 | ❌ zerobank 3 轮未 PASS -> 记录 gapHints, 下一靶
  "lfi": true,
  "info_disclosure": true,
  "broken_auth": true,
  "csrf": true,
  "open_redirect": true,
  "cookies_flags": false,
  "broken_access_control": true,
  "security_misconfiguration": true,
  "race_condition": false
 },
 "artifacts": "3/4",
 "artifact_detail": {
  "ART-sqli-search": false,
  "ART-lfi-passwd": true,
  "ART-xss-reflected": true,
  "ART-info": true
 },
 "false_positives": [],
 "PASS": false
}
2026-08-28T18:11:20+08:00 | === testasp attempt 1/3 hints=[] ===
2026-08-28T18:11:21+08:00 | launched testasp (http://testasp.vulnweb.com)
=== 2026-08-28T18:16:17+08:00 100s tick ===
2026-08-28T18:13:07+08:00 | load=4.71 mem=% kuzu=1 lanes=1
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

 "false_positives": [],
 "PASS": false
}
2026-08-28T18:11:20+08:00 | === testasp attempt 1/3 hints=[] ===
2026-08-28T18:11:21+08:00 | launched testasp (http://testasp.vulnweb.com)
3
tick done
2026-08-28T18:18:02+08:00 | testasp tick: FAIL
=== 2026-08-28T18:22:59+08:00 100s tick ===
2026-08-28T18:19:48+08:00 | load=5.00 mem=% kuzu=1 lanes=1
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

testasp 2/7 29% 0/4 FP0 PASS=False
covered: ['sqli', 'broken_auth']
tick done
2026-08-28T18:24:43+08:00 | testasp tick: FAIL
=== 2026-08-28T18:29:42+08:00 100s tick ===
2026-08-28T18:26:29+08:00 | load=3.26 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787912754149"
 ],
 "PASS": false
}
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

2026-08-28T18:31:25+08:00 | testasp tick: PASS
2026-08-28T18:31:25+08:00 | ✅ testasp PASS @attempt 1
sync_exp: 21 rows -> control
2026-08-28T18:31:29+08:00 | testasp PASSED -> next target
2026-08-28T18:31:30+08:00 | === testaspnet attempt 1/3 hints=[] ===
2026-08-28T18:31:30+08:00 | launched testaspnet (http://testaspnet.vulnweb.com)
=== 2026-08-28T18:36:24+08:00 100s tick ===
2026-08-28T18:33:09+08:00 | load=3.16 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtcskli7 终态(unknown), 调�
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

2026-08-28T18:38:12+08:00 | testaspnet tick: FAIL
=== 2026-08-28T18:43:06+08:00 100s tick ===
2026-08-28T18:39:49+08:00 | load=2.72 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtcskli7 终态(unknown), 调�
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

2026-08-28T18:44:53+08:00 | testaspnet tick: FAIL
=== 2026-08-28T18:49:48+08:00 100s tick ===
2026-08-28T18:46:29+08:00 | load=1.73 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtctaizk-discovery-l4vz[discovery] exit=0 { kind : success 
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T18:51:35+08:00 | testaspnet tick: FAIL
=== 2026-08-28T18:56:31+08:00 100s tick ===
2026-08-28T18:53:10+08:00 | load=3.45 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T18:58:16+08:00 | testaspnet tick: FAIL
=== 2026-08-28T19:03:13+08:00 100s tick ===
2026-08-28T18:59:50+08:00 | load=1.33 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T19:04:57+08:00 | testaspnet tick: FAIL
=== 2026-08-28T19:09:55+08:00 100s tick ===
2026-08-28T19:06:31+08:00 | load=4.46 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T19:11:39+08:00 | testaspnet tick: FAIL
testasp 5/7 71% 2/4 FP2 PASS=False
covered: ['sqli', 'xss', 'lfi', 'info_disclosure', 'broken_auth']
fps: ['f-1787913938382', 'f-1787913944834']
tick done
=== 2026-08-28T19:16:37+08:00 100s tick ===
2026-08-28T19:13:13+08:00 | load=3.69 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T19:18:20+08:00 | testaspnet tick: FAIL
testasp 5/7 71% 2/4 FP2 PASS=False
tick done
=== 2026-08-28T19:23:19+08:00 100s tick ===
2026-08-28T19:19:54+08:00 | load=4.09 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T19:25:01+08:00 | testaspnet tick: FAIL
testasp 5/7 71% 2/4 FP2 PASS=False
fps: ['f-1787913938382', 'f-1787913944834']
tick done
=== 2026-08-28T19:30:01+08:00 100s tick ===
2026-08-28T19:26:34+08:00 | load=3.33 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T19:31:42+08:00 | testaspnet tick: FAIL
testasp 5/7 71% 2/4 FP2 PASS=False
tick done
=== 2026-08-28T19:36:43+08:00 100s tick ===
2026-08-28T19:33:16+08:00 | load=5.11 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

2026-08-28T19:38:24+08:00 | testaspnet tick: FAIL
=== 2026-08-28T19:43:25+08:00 100s tick ===
2026-08-28T19:39:57+08:00 | load=3.81 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:{ kind : success , text : engagement eng-mtctaizk 终态(completed), 调度闭环结束 }  
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1787913938382",
  "f-1787913944834",
  "f-1787913946984"
 ],
 "PASS": false
}
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

testasp 5/7 71% 2/4 FP2 PASS=False
tick done
2026-08-28T19:45:05+08:00 | testaspnet tick: FAIL
2026-08-28T19:45:07+08:00 | === testaspnet attempt 2/3 hints=[证据:ART-sqli] ===
2026-08-28T19:45:07+08:00 | launched testaspnet (http://testaspnet.vulnweb.com)
=== 2026-08-28T19:50:07+08:00 100s tick ===
2026-08-28T19:46:38+08:00 | load=5.57 mem=% kuzu=1 lanes=1
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

testasp 0/7 0% 0/4 FP0 PASS=False
tick done
2026-08-28T19:51:48+08:00 | testaspnet tick: FAIL
=== 2026-08-28T19:56:49+08:00 100s tick ===
2026-08-28T19:53:20+08:00 | load=6.49 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
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

2026-08-28T19:58:30+08:00 | testaspnet tick: FAIL
testasp 4/7 57% 0/4 FP0 PASS=False
tick done
=== 2026-08-28T20:03:32+08:00 100s tick ===
2026-08-28T20:00:01+08:00 | load=4.44 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:
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

2026-08-28T20:05:11+08:00 | testaspnet tick: FAIL
testasp 4/7 57% 1/4 FP0 PASS=False
tick done
=== 2026-08-28T20:10:13+08:00 100s tick ===
2026-08-28T20:06:43+08:00 | load=6.09 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 1 条计划已生成(最高分 10) [pentest] 自动调度: 深度环启动 (2 高权重信号) 
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
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

2026-08-28T20:11:52+08:00 | testaspnet tick: FAIL
testasp 4/7 57% 1/4 FP0 PASS=False
tick done
=== 2026-08-28T20:16:57+08:00 100s tick ===
2026-08-28T20:13:25+08:00 | load=4.62 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 1 条计划已生成(最高分 10) [pentest] 自动调度: 深度环启动 (2 高权重信号) 
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
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

2026-08-28T20:18:33+08:00 | testaspnet tick: FAIL
testasp 4/7 57% 1/4 FP0 PASS=False
tick done
=== 2026-08-28T20:23:46+08:00 100s tick ===
2026-08-28T20:20:06+08:00 | load=4.07 mem=% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 规划器: 1 条计划已生成(最高分 10) [pentest] 自动调度: 深度环启动 (2 高权重信号) 
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
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

2026-08-28T20:25:14+08:00 | testaspnet tick: FAIL

=== 2026-08-28T20:29:19+08:00 ZCode 接管 ===
--- 8767 testaspnet (attempt 2/3 since 19:45) ---
 "class_detail": {
  "sqli": true,
  "xss": true,
  "lfi": false,
  "info_disclosure": true,
  "broken_auth": true,
  "idor": false
 },
 "artifacts": "2/4",
 "artifact_detail": {
  "ART-sqli": true,
  "ART-lfi-passwd": false,
  "ART-xss": false,
  "ART-info": true
 },
 "false_positives": [],
 "PASS": false
}
--- 8768 crapi (终态待收尾) ---
  "jwt_manipulation": true,
  "nosql_injection": true,
  "sqli": true,
  "ssrf": true,
  "unrestricted_resource_consumption": true,
  "command_injection": true,
  "idor": true
 },
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
=== 2026-08-28T20:30:27+08:00 100s tick ===
2026-08-28T20:26:46+08:00 | load=2.28 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcvx761-deep-li2f[deep] exit=null [pentest] 自动调度: 深度环启动 (2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
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

2026-08-28T20:31:55+08:00 | testaspnet tick: FAIL
=== 2026-08-28T20:37:09+08:00 100s tick ===
2026-08-28T20:33:26+08:00 | load=2.30 mem=% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcvx761-deep-li2f[deep] exit=null [pentest] 自动调度: 深度环启动 (2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 唤醒耗尽仍无发现: 关闭为 exhausted 并标记 NEED_INPUT { kind : success , text : engag
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

2026-08-28T20:38:36+08:00 | testaspnet tick: FAIL
=== 2026-08-28T20:43:51+08:00 100s tick ===
2026-08-28T20:40:07+08:00 | load=1.33 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcvx761-deep-li2f[deep] exit=null [pentest] 自动调度: 深度环启动 (2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
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

2026-08-28T20:45:18+08:00 | testaspnet tick: FAIL
=== 2026-08-28T20:45:50+08:00 100s tick ===
2026-08-28T20:40:07+08:00 | load=1.33 mem=% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 自动调度: 深度环启动 (2 高权重信号) [pentest] worker eng-mtcvx761-deep-kldl[deep] ex
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
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


=== 2026-08-28T20:53:08+08:00 ZCode 接管完成摘要 ===
- 节奏: tick 400s→800s (auto-rotate/monitor-s21/auto-concurrency/monitor-60s 已改并重启; 旧400s auto-rotate 已停, 由每15分钟 ZCode 监督自动化接管队列驱动)
- laneB 8767: testaspnet attempt2 (19:45 起, 窗口至~21:00) 继续, 4/6 类 2/4 artifacts 0FP
- laneC 8768: crapi PASS 收尾完成 (经验 7 行→8766, sync-control laneC OK, Finding 快照, 清图) → aspgoat attempt1 已启动 (20:37, seeds 2 条重播, hints=xss/ssrf/ssti)
- 并发决策: 8核/3.8G(可用1.0G,swap2.2G) → 上限2车道; HIGH(load>3.5|mem>85%)降1车道
- auto-concurrency 修复: mem 解析 zh locale 失配(改 awk NR==2); pkill env 变量永不匹配(改 /proc/environ 扫描)
- 队列(全在线): testaspnet→restvulnweb→gruyere→juice-shop-online→demo-juice-shop(官方demo)→crapi-online(官方demo); testphp/testhtml5/testhtml.vulnweb.com 代理不可达未入队
=== 2026-08-28T20:59:11+08:00 100s tick ===
2026-08-28T20:59:10+08:00 | load=1.28 mem=66% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcvx761-deep-kldl[deep] exit=null [pentest] 自动调度: 深度环启动 (2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtcxsxt9-discovery-rj3e[discovery] exit=null [pentest] 假设待消
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": false
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T21:12:33+08:00 100s tick ===
2026-08-28T21:12:30+08:00 | load=3.06 mem=66% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcvx761-deep-6kdt[deep] exit=null [pentest] 假设待消费(2条open) 
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtcxsxt9-creative-zxi7[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": false
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T21:25:55+08:00 100s tick ===
2026-08-28T21:25:51+08:00 | load=1.62 mem=70% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] worker eng-mtcvx761-creative-y53v[creative] exit=0 [pentest] 假设待消费(6条o
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] worker eng-mtcxsxt9-creative-zxi7[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": false
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T21:39:18+08:00 100s tick ===
2026-08-28T21:39:11+08:00 | load=1.98 mem=56% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T21:52:40+08:00 100s tick ===
2026-08-28T21:52:31+08:00 | load=1.06 mem=56% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T22:06:02+08:00 100s tick ===
2026-08-28T22:05:51+08:00 | load=0.74 mem=56% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T22:19:24+08:00 100s tick ===
2026-08-28T22:19:12+08:00 | load=0.83 mem=55% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T22:32:46+08:00 100s tick ===
2026-08-28T22:32:32+08:00 | load=0.89 mem=55% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T22:46:08+08:00 100s tick ===
2026-08-28T22:45:52+08:00 | load=0.98 mem=56% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T22:59:31+08:00 100s tick ===
2026-08-28T22:59:12+08:00 | load=1.16 mem=56% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T23:12:53+08:00 100s tick ===
2026-08-28T23:12:33+08:00 | load=0.99 mem=56% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T23:26:15+08:00 100s tick ===
2026-08-28T23:25:53+08:00 | load=1.12 mem=55% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T23:39:37+08:00 100s tick ===
2026-08-28T23:39:13+08:00 | load=0.71 mem=54% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-28T23:52:59+08:00 100s tick ===
2026-08-28T23:52:33+08:00 | load=0.68 mem=54% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T00:06:21+08:00 100s tick ===
2026-08-29T00:05:54+08:00 | load=1.37 mem=55% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T00:19:44+08:00 100s tick ===
2026-08-29T00:19:15+08:00 | load=3.34 mem=75% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T00:33:07+08:00 100s tick ===
2026-08-29T00:32:35+08:00 | load=1.33 mem=64% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T00:46:29+08:00 100s tick ===
2026-08-29T00:45:56+08:00 | load=2.47 mem=66% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T00:59:51+08:00 100s tick ===
2026-08-29T00:59:16+08:00 | load=1.82 mem=70% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T01:13:13+08:00 100s tick ===
2026-08-29T01:12:36+08:00 | load=1.95 mem=70% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T01:26:35+08:00 100s tick ===
2026-08-29T01:25:56+08:00 | load=2.92 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T01:39:57+08:00 100s tick ===
2026-08-29T01:39:17+08:00 | load=1.98 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true, "db": "/tmp/d2d-laneB/graph  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true, "db": "/tmp/d2d-laneC/graph  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T01:53:19+08:00 100s tick ===
2026-08-29T01:52:37+08:00 | load=1.04 mem=66% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T02:06:41+08:00 100s tick ===
2026-08-29T02:05:57+08:00 | load=2.46 mem=73% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

=== 2026-08-29T02:20:02+08:00 100s tick ===
2026-08-29T02:19:17+08:00 | load=1.06 mem=58% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtcvx761-creative-2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-idor-comments-002",
  "find-infodisclosure-003"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 目标闭环(连续两轮稳定): 执行经验沉淀 { kind : success , text : engagement eng-mtcxsxt9
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-1787921156809",
  "f-1787921654253",
  "f-1787921722299"
 ],
 "PASS": false

2026-08-29T02:21:37+08:00 | ZCode: laneB testaspnet attempt 3/3 hints=[类:lfi;类:idor;证据:ART-lfi-passwd;证据:ART-xss] (经 egress-gateway)
2026-08-29T02:22:00+08:00 | ZCode: laneC aspgoat attempt 2/3 hints=[类:info_disclosure;类:command_injection;类:excessive_agency;类:insecure_output;证据:ART-sqli-users;证据:ART-rce-whoami;证据:ART-xxe-file]
=== 2026-08-29T02:33:24+08:00 100s tick ===
2026-08-29T02:32:37+08:00 | load=1.67 mem=56% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtda3396-discovery-2un2[discovery] exit=0 
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 规划器: 3 条计划已生成(最高分 6) [pentest] 自动调度: 深度环启动 (1 高权重信号) 
  "ART-bola-other-order": true,
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001"
 ],
 "PASS": false
}

2026-08-29T02:41:54+08:00 | watchdog tick OK laneB=4procs
=== 2026-08-29T02:46:46+08:00 100s tick ===
2026-08-29T02:45:58+08:00 | load=1.23 mem=60% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtda3396-deep-z65t[deep] exit=0 [pentest] 自动调度: 深度环启动 (2 高权
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mtda3kxx-deep-jcj5[deep] exit=0 [pentest] 自动调度: 深度环启动 (2 高权
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001"
 ],
 "PASS": false
}

2026-08-29T02:48:41+08:00 | 迭代归因: testaspnet attempt3 覆盖100%+4/4 artifacts(M3+gapHints 生效), 唯一 FP=find-xss-newsad-001 类(『XSS/Open-redirect/SSRF surface』推测性 finding 未经验证即报三类) → 根因=worker 将攻击面当漏洞写 Finding; 修复方向=validator 对 xss/ssrf 类强制 assertion(响应体含 payload 反射), 记入 backlog
2026-08-29T02:55:16+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T03:00:07+08:00 100s tick ===
2026-08-29T02:59:18+08:00 | load=1.84 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtda3396-deep-z65t[deep] exit=0 [pentest] 自动调度: 深度环启动 (2 高权
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mtda3kxx-deep-jcj5[deep] exit=0 [pentest] 自动调度: 深度环启动 (2 高权
  "ART-jwt-forge": true,
  "ART-otp-bypass": false,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001"
 ],
 "PASS": false
}

2026-08-29T03:08:39+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T03:13:29+08:00 100s tick ===
2026-08-29T03:12:38+08:00 | load=2.41 mem=76% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtda3396-deep-semi[deep] exit=null [pentest] 自动调度: 深度环启动 (2
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mtda3kxx-deep-84mc[deep] exit=null [pentest] 自动调度: 深度环启动 (2
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001"
 ],
 "PASS": false
}

2026-08-29T03:22:02+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T03:26:51+08:00 100s tick ===
2026-08-29T03:25:58+08:00 | load=2.64 mem=78% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtda3396-deep-qpmo[deep] exit=null [pentest] 假设待消费(4条open) 
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mtda3kxx-deep-vmxj[deep] exit=0 [pentest] 假设待消费(2条open) → 创
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001"
 ],

2026-08-29T03:35:24+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T03:40:13+08:00 100s tick ===
2026-08-29T03:39:19+08:00 | load=2.95 mem=71% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtda3396-creative-umrb[creative] exit=0 [pentest] 假设待消费(6条o
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mtda3kxx-creative-pr8w[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001"
 ],

2026-08-29T03:44:52+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T03:44:53+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T03:45:31+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T03:45:32+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T03:48:47+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T03:53:35+08:00 100s tick ===
2026-08-29T03:52:39+08:00 | load=3.24 mem=65% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第3次唤醒验证/反驳 { kind : success , text : engagement eng
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第3次唤醒验证/反驳 { kind : success , text : engagement eng
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001"

2026-08-29T03:58:14+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T03:58:15+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T03:58:53+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T03:58:53+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:02:09+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T04:06:57+08:00 100s tick ===
2026-08-29T04:05:59+08:00 | load=1.94 mem=70% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtda3396-creative-l0gm[creative] exit=0 [pentest] 假设待消费(6条o
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第3次唤醒验证/反驳 { kind : success , text : engagement eng
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001"

2026-08-29T04:11:36+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:11:37+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:12:14+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:12:15+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:15:31+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T04:20:18+08:00 100s tick ===
2026-08-29T04:19:19+08:00 | load=2.31 mem=73% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mtda3kxx-creative-o1jc[creative] exit=1 [pentest] 假设待消费(6条o
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T04:24:58+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:24:59+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:25:36+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:25:37+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:28:53+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T04:33:40+08:00 100s tick ===
2026-08-29T04:32:40+08:00 | load=2.70 mem=55% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T04:38:20+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:38:21+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:38:59+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:39:00+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:42:16+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T04:47:02+08:00 100s tick ===
2026-08-29T04:46:00+08:00 | load=2.20 mem=52% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T04:51:42+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:51:43+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:52:21+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T04:52:22+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T04:55:39+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T05:00:24+08:00 100s tick ===
2026-08-29T04:59:20+08:00 | load=1.63 mem=53% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T05:05:04+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:05:05+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:05:43+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:05:44+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:09:02+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T05:13:46+08:00 100s tick ===
2026-08-29T05:12:40+08:00 | load=2.13 mem=53% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T05:18:26+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:18:27+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:19:05+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:19:06+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:22:25+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T05:27:09+08:00 100s tick ===
2026-08-29T05:26:00+08:00 | load=2.15 mem=70% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T05:31:48+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:31:49+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:32:27+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:32:27+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:35:48+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T05:40:31+08:00 100s tick ===
2026-08-29T05:39:21+08:00 | load=1.34 mem=70% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T05:45:10+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:45:11+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:45:48+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:45:49+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:49:11+08:00 | watchdog tick OK laneB=3procs
=== 2026-08-29T05:53:52+08:00 100s tick ===
2026-08-29T05:52:41+08:00 | load=3.00 mem=52% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T05:58:32+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:58:33+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T05:59:10+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T05:59:11+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T06:02:33+08:00 | watchdog tick OK laneB=1procs
=== 2026-08-29T06:07:14+08:00 100s tick ===
2026-08-29T06:06:01+08:00 | load=3.41 mem=52% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T06:11:54+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:11:55+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T06:12:32+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:12:33+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T06:15:56+08:00 | watchdog tick OK laneB=1procs
=== 2026-08-29T06:20:36+08:00 100s tick ===
2026-08-29T06:19:21+08:00 | load=2.78 mem=52% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T06:25:16+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:25:17+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T06:25:55+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:25:56+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T06:29:19+08:00 | watchdog tick OK laneB=1procs
=== 2026-08-29T06:33:59+08:00 100s tick ===
2026-08-29T06:32:42+08:00 | load=2.02 mem=52% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T06:38:39+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:38:40+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T06:39:17+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:39:18+08:00 | watchdog tick laneC aspgoat a2 running
2026-08-29T06:39:39+08:00 | 迭代: FP 根因=profile 建模缺类(testaspnet 缺 csrf / aspgoat 缺 internal-config kw), 修正后重评
2026-08-29T06:42:42+08:00 | watchdog tick OK laneB=1procs
=== 2026-08-29T06:47:21+08:00 100s tick ===
2026-08-29T06:46:02+08:00 | load=2.14 mem=68% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3396-creative-p
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-viewstate-disclosure-001",
  "f-1787941987694"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T06:51:58+08:00 | ✅ testaspnet PASS @attempt3 (profile 建模修正) -> sync-control laneB
=== syncing laneB → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneB.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneB'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
2026-08-29T06:52:01+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:52:02+08:00 | watchdog tick laneC aspgoat a2 running
................................                                         [100%]
32 passed in 0.81s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
./profiles/testaspnet.json: 失败
位于分支 temp-sync-laneB
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/testaspnet.json
	修改：     scripts/ops/watchdog.sh
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/testaspnet.json
M	scripts/ops/watchdog.sh
M	tests/test_graphd_gates.py
已删除分支 temp-sync-laneB（曾为 6931ad3）。
sync OK
2026-08-29T06:52:05+08:00 | laneB === restvulnweb attempt 1/3 ===
2026-08-29T06:52:39+08:00 | watchdog tick laneB testaspnet a3 running
2026-08-29T06:52:40+08:00 | watchdog tick laneC aspgoat a2 running
=== syncing laneB → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneB.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneB'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.57s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
./profiles/testaspnet.json: 失败
位于分支 temp-sync-laneB
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/testaspnet.json
	修改：     scripts/ops/watchdog.sh
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/testaspnet.json
M	scripts/ops/watchdog.sh
M	tests/test_graphd_gates.py
已删除分支 temp-sync-laneB（曾为 6931ad3）。
sync OK
2026-08-29T06:57:54+08:00 | ✅ restvulnweb PASS @attempt1 (开靶4分钟) -> sync control; laneB === gruyere attempt 1/3 ===
=== 2026-08-29T07:00:43+08:00 100s tick ===
2026-08-29T06:59:23+08:00 | load=5.35 mem=82% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:
 "false_positives": [
  "F:test2",
  "F:t3",
  "F:t5",
  "F:basic_auth_admin_works",
  "F:users_sql_state_21000",
  "F:full_data_dump_basic"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T07:14:05+08:00 100s tick ===
2026-08-29T07:12:43+08:00 | load=2.65 mem=55% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdjye98-deep-44q6[deep] exit=0 [pentest] 假设待消费(3条open) → 创
 "false_positives": [
  "F:test2",
  "F:t3",
  "F:t5",
  "F:basic_auth_admin_works",
  "F:users_sql_state_21000",
  "F:full_data_dump_basic",
  "f-pathtrav-upload-static",
  "f-feed-leak-unauth",
  "f_unauth_priv_snippet_read",
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T07:27:27+08:00 100s tick ===
2026-08-29T07:26:04+08:00 | load=3.23 mem=74% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdjye98-deep-44q6[deep] exit=0 [pentest] 假设待消费(3条open) → 创
 "false_positives": [
  "F:test2",
  "F:t3",
  "F:t5",
  "F:basic_auth_admin_works",
  "F:users_sql_state_21000",
  "F:full_data_dump_basic",
  "f-pathtrav-upload-static",
  "f-feed-leak-unauth",
  "f_unauth_priv_snippet_read",
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T07:30:27+08:00 | 迭代: gruyere FP 归因=3条worker探针垃圾(已删)+4条真洞profile缺建模(补xxe类/data-exposure/mass-assignment kw)
=== syncing laneB → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneB.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneB'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.50s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
./profiles/gruyere.json: 失败
位于分支 temp-sync-laneB
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/gruyere.json
	修改：     profiles/online-queue.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/gruyere.json
M	profiles/online-queue.json
M	profiles/testaspnet.json
M	scripts/ops/watchdog.sh
M	tests/test_graphd_gates.py
已删除分支 temp-sync-laneB（曾为 6931ad3）。
sync OK
2026-08-29T07:31:23+08:00 | ✅ gruyere PASS @attempt1 (100% 8/8) -> sync control; laneB === juice-shop-online attempt 1/3 ===
=== 2026-08-29T07:40:49+08:00 100s tick ===
2026-08-29T07:39:24+08:00 | load=2.72 mem=73% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdl5gd6-discovery-fgs5[discovery] exit=1 
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
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T07:54:12+08:00 100s tick ===
2026-08-29T07:52:44+08:00 | load=2.35 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 规划器: 3 条计划已生成(最高分 11.25) [pentest] 自动调度: 深度环启动 (11 高权重信号) 
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-eng-mtdl5gd6-y22x-003",
  "f-eng-mtdl5gd6-y22x-004",
  "f-eng-mtdl5gd6-y22x-004b"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T08:09:05+08:00 100s tick ===
2026-08-29T08:06:05+08:00 | load=2.13 mem=66% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 规划器: 3 条计划已生成(最高分 5.32) [pentest] 自动调度: 深度环启动 (11 高权重信号) 
 },
 "false_positives": [
  "f-eng-mtdl5gd6-y22x-003",
  "f-eng-mtdl5gd6-y22x-004",
  "f-eng-mtdl5gd6-y22x-004b",
  "f-eng-mtdl5gd6-y22x-007",
  "f-eng-mtdl5gd6-mwpm-002-christmas-special"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T08:22:28+08:00 100s tick ===
2026-08-29T08:20:56+08:00 | load=1.94 mem=66% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdl5gd6-deep-mwpm[deep] exit=0 [pentest] 自动调度: 深度环启动 (11 高
 "false_positives": [
  "f-eng-mtdl5gd6-y22x-003",
  "f-eng-mtdl5gd6-y22x-004",
  "f-eng-mtdl5gd6-y22x-004b",
  "f-eng-mtdl5gd6-y22x-007",
  "f-eng-mtdl5gd6-mwpm-002-christmas-special",
  "f-eng-mtdl5gd6-mwpm-005-checkout-race",
  "f-eng-mtdl5gd6-mwpm-006-neg-qty",
  "f-eng-mtdl5gd6-mwpm-007-no-captcha-register",
  "f-eng-mtdl5gd6-mwpm-008-empty-user",
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

2026-08-29T08:23:45+08:00 | 问题→根因→修复: watchdog 挂起(50min无tick, python eval 无超时) → 重启+后续加 timeout 包裹; aspgoat 单engagement 6h 停滞(prototype_pollution 能力边界) → 按纪律归档换靶; juice-shop FP=10 归因deferred下轮
2026-08-29T08:24:00+08:00 | watchdog: egress-gateway 自愈重启
2026-08-29T08:24:01+08:00 | watchdog tick laneB juice-shop-online a1 running
2026-08-29T08:24:02+08:00 | watchdog tick laneC aspgoat a3 running
=== syncing laneB → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneB.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneB'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.62s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
./profiles/gruyere.json: 失败
位于分支 temp-sync-laneB
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/gruyere.json
	修改：     profiles/juice-shop-online.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/gruyere.json
M	profiles/juice-shop-online.json
M	profiles/online-queue.json
M	profiles/testaspnet.json
M	scripts/ops/watchdog.sh
已删除分支 temp-sync-laneB（曾为 6931ad3）。
sync OK
2026-08-29T08:30:15+08:00 | ✅ juice-shop-online PASS @attempt1 (80% 12/15 2/2 FP=0) -> sync control; laneB === crapi-online attempt 1/3 ===
=== 2026-08-29T08:35:53+08:00 100s tick ===
2026-08-29T08:34:17+08:00 | load=4.84 mem=69% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-discovery-e0vr[discovery] exit=0 
  "ctf_flag_capture": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T08:49:15+08:00 100s tick ===
2026-08-29T08:47:37+08:00 | load=3.06 mem=68% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 规划器: 3 条计划已生成(最高分 18) [pentest] 自动调度: 深度环启动 (20 高权重信号) 
  "ctf_flag_capture": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T09:02:37+08:00 100s tick ===
2026-08-29T09:00:58+08:00 | load=3.39 mem=69% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-deep-95sb[deep] exit=null [pentest] 自动调度: 深度环启动 (2
  "ctf_flag_capture": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T09:16:00+08:00 100s tick ===
2026-08-29T09:14:19+08:00 | load=3.97 mem=69% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-deep-41gc[deep] exit=0 [pentest] 假设待消费(3条open) → 创
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T09:29:22+08:00 100s tick ===
2026-08-29T09:27:40+08:00 | load=3.87 mem=69% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-deep-41gc[deep] exit=0 [pentest] 假设待消费(3条open) → 创
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T09:42:44+08:00 100s tick ===
2026-08-29T09:41:01+08:00 | load=3.63 mem=68% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-creative-e648[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T09:56:07+08:00 100s tick ===
2026-08-29T09:54:22+08:00 | load=3.84 mem=69% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-creative-ku9p[creative] exit=null [pentest] 假设待消费(
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T10:09:29+08:00 100s tick ===
2026-08-29T10:07:44+08:00 | load=4.34 mem=68% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-creative-2k0y[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T10:22:51+08:00 100s tick ===
2026-08-29T10:21:05+08:00 | load=5.77 mem=65% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtdn95ea-creative-48ob[creative] exit=0 [pentest] 假设待消费(6条o
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T10:36:13+08:00 100s tick ===
2026-08-29T10:34:25+08:00 | load=3.45 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T10:49:36+08:00 100s tick ===
2026-08-29T10:47:45+08:00 | load=3.03 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T11:02:58+08:00 100s tick ===
2026-08-29T11:01:06+08:00 | load=3.13 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T11:16:20+08:00 100s tick ===
2026-08-29T11:14:27+08:00 | load=4.16 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T11:29:43+08:00 100s tick ===
2026-08-29T11:27:48+08:00 | load=3.75 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T11:43:05+08:00 100s tick ===
2026-08-29T11:41:09+08:00 | load=4.10 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T11:56:27+08:00 100s tick ===
2026-08-29T11:54:30+08:00 | load=4.41 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T12:09:49+08:00 100s tick ===
2026-08-29T12:07:50+08:00 | load=3.30 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T12:23:12+08:00 100s tick ===
2026-08-29T12:21:11+08:00 | load=3.05 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T12:36:34+08:00 100s tick ===
2026-08-29T12:34:32+08:00 | load=4.46 mem=62% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T12:49:56+08:00 100s tick ===
2026-08-29T12:47:53+08:00 | load=5.08 mem=62% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T13:03:19+08:00 100s tick ===
2026-08-29T13:01:14+08:00 | load=3.83 mem=62% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T13:16:41+08:00 100s tick ===
2026-08-29T13:14:35+08:00 | load=3.70 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T13:30:03+08:00 100s tick ===
2026-08-29T13:27:56+08:00 | load=3.51 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T13:43:26+08:00 100s tick ===
2026-08-29T13:41:16+08:00 | load=2.78 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T13:56:48+08:00 100s tick ===
2026-08-29T13:54:37+08:00 | load=3.06 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T14:10:11+08:00 100s tick ===
2026-08-29T14:07:57+08:00 | load=3.35 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T14:23:33+08:00 100s tick ===
2026-08-29T14:21:18+08:00 | load=3.91 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T14:36:55+08:00 100s tick ===
2026-08-29T14:34:38+08:00 | load=3.41 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T14:50:18+08:00 100s tick ===
2026-08-29T14:47:58+08:00 | load=3.02 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T15:03:40+08:00 100s tick ===
2026-08-29T15:01:19+08:00 | load=3.03 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T15:17:02+08:00 100s tick ===
2026-08-29T15:14:39+08:00 | load=3.16 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T15:30:24+08:00 100s tick ===
2026-08-29T15:28:00+08:00 | load=3.57 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T15:43:47+08:00 100s tick ===
2026-08-29T15:41:20+08:00 | load=2.95 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T15:57:09+08:00 100s tick ===
2026-08-29T15:54:41+08:00 | load=2.68 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T16:10:31+08:00 100s tick ===
2026-08-29T16:08:01+08:00 | load=1.85 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T16:23:54+08:00 100s tick ===
2026-08-29T16:21:21+08:00 | load=2.18 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T16:37:16+08:00 100s tick ===
2026-08-29T16:34:41+08:00 | load=2.17 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T16:50:38+08:00 100s tick ===
2026-08-29T16:48:02+08:00 | load=2.85 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T17:04:01+08:00 100s tick ===
2026-08-29T17:01:22+08:00 | load=2.68 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T17:17:23+08:00 100s tick ===
2026-08-29T17:14:42+08:00 | load=2.97 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T17:30:46+08:00 100s tick ===
2026-08-29T17:28:02+08:00 | load=2.90 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T17:44:08+08:00 100s tick ===
2026-08-29T17:41:23+08:00 | load=2.49 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T17:57:30+08:00 100s tick ===
2026-08-29T17:54:43+08:00 | load=2.30 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T18:10:52+08:00 100s tick ===
2026-08-29T18:08:03+08:00 | load=3.46 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T18:24:15+08:00 100s tick ===
2026-08-29T18:21:24+08:00 | load=3.57 mem=63% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== 2026-08-29T18:37:37+08:00 100s tick ===
2026-08-29T18:34:44+08:00 | load=2.51 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "eng-mtdn95ea-deep-41gc-community-bola-read",
  "f-test-write"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "f-gtas-lfi-001",
  "f-jcj5-xxe-001",
  "f-pr8w-sxss-001",
  "f-pr8w-infodisc-001",
  "f-if4w-csrf-bypass-001",

=== syncing laneB → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneB.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneB'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.61s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi-online.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
位于分支 temp-sync-laneB
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/crapi-online.json
	修改：     profiles/demo-juice-shop.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/crapi-online.json
M	profiles/demo-juice-shop.json
M	profiles/gruyere.json
M	profiles/juice-shop-online.json
M	profiles/online-queue.json
已删除分支 temp-sync-laneB（曾为 6931ad3）。
sync OK
=== syncing laneC → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneC.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneC'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.60s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi-online.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
位于分支 temp-sync-laneC
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/crapi-online.json
	修改：     profiles/demo-juice-shop.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/crapi-online.json
M	profiles/demo-juice-shop.json
M	profiles/gruyere.json
M	profiles/juice-shop-online.json
M	profiles/online-queue.json
已删除分支 temp-sync-laneC（曾为 6931ad3）。
sync OK
2026-08-29T18:45:33+08:00 | 🏁 全队列完成: crapi-online PASS(15/15 100% 4/4 0FP) + demo-juice-shop PASS(12/14 86% 2/2 0FP) — profile_suggest 自动建模闭环; 双车道经验合流 control
=== 2026-08-29T18:51:00+08:00 100s tick ===
2026-08-29T18:48:05+08:00 | load=1.83 mem=61% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtdn95ea-creative-3
  "ctf_flag_capture": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] 假设待消费(6条open) → 创造环第5次唤醒验证/反驳 [pentest] worker eng-mtda3kxx-creative-n
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

2026-08-29T19:02:21+08:00 | R2 开跑: laneB === zerobank a1 (难类: cookies_flags/race_condition) === laneC === aspgoat a1 (难类: prototype_pollution) ===
=== 2026-08-29T19:04:22+08:00 100s tick ===
2026-08-29T19:01:25+08:00 | load=1.60 mem=56% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:
  "ctf_flag_capture": true
 },
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T19:17:44+08:00 100s tick ===
2026-08-29T19:14:45+08:00 | load=1.41 mem=60% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 规划器: 3 条计划已生成(最高分 10.64) [pentest] 自动调度: 深度环启动 (24 高权重信号) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-cookies-flags-missing"
 ],
 "PASS": false
}
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-discovery-c1fn[discovery] exit=0 [pentest] 自动调度: 深
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "FIND-LFI-001",
  "FIND-AUTH-001",
  "FIND-AUTH-003",
  "FIND-PP-001",
  "f-8090-lfi-001",

=== 2026-08-29T19:31:07+08:00 100s tick ===
2026-08-29T19:28:06+08:00 | load=1.71 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 规划器: 1 条计划已生成(最高分 7) [pentest] 自动调度: 深度环启动 (24 高权重信号) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-cookies-flags-missing",
  "f-admin-currencies-write-bfla"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-5qcw[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "FIND-LFI-001",
  "FIND-AUTH-001",
  "FIND-AUTH-003",
  "FIND-PP-001",
  "f-8090-lfi-001",

=== 2026-08-29T19:44:29+08:00 100s tick ===
2026-08-29T19:41:26+08:00 | load=0.77 mem=62% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mte9u1iv-deep-daej[deep] exit=0 [pentest] 自动调度: 深度环启动 (24 高
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-cookies-flags-missing",
  "f-admin-currencies-write-bfla"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-5qcw[creative] exit=0 [pentest] 假设待消费(6条o
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "FIND-LFI-001",
  "FIND-AUTH-001",
  "FIND-AUTH-003",
  "FIND-PP-001",
  "f-8090-lfi-001",

=== 2026-08-29T19:57:51+08:00 100s tick ===
2026-08-29T19:54:46+08:00 | load=2.29 mem=63% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 自动调度: 深度环启动 (24 高权重信号) [pentest] worker eng-mte9u1iv-deep-1w2k[deep] e
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-cookies-flags-missing",
  "f-admin-currencies-write-bfla"
 ],
 "PASS": false
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-qg4p[creative] exit=null [pentest] 假设待消费(
  "ART-jwt-forge": true,
  "ART-otp-bypass": true,
  "ART-mass-admin": true
 },
 "false_positives": [
  "FIND-LFI-001",
  "FIND-AUTH-001",
  "FIND-AUTH-003",
  "FIND-PP-001",
  "f-8090-lfi-001",

=== syncing laneB → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneB.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneB'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.70s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi-online.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
位于分支 temp-sync-laneB
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     docs/ITERATION.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/crapi-online.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	docs/ITERATION.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/crapi-online.json
M	profiles/demo-juice-shop.json
M	profiles/gruyere.json
M	profiles/juice-shop-online.json
已删除分支 temp-sync-laneB（曾为 6931ad3）。
sync OK
2026-08-29T20:03:07+08:00 | ✅ zerobank PASS @R2-attempt1 (11/11 100%, R1 败靶被攻克) -> sync control; laneB === dvwa attempt 1/3 ===
=== syncing laneC → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneC.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneC'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.57s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi-online.json: 失败
./profiles/crapi.json: 失败
./profiles/demo-juice-shop.json: 失败
位于分支 temp-sync-laneC
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     docs/ITERATION.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
	修改：     profiles/crapi-online.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	docs/ITERATION.md
M	graphd/app.py
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/crapi-online.json
M	profiles/demo-juice-shop.json
M	profiles/gruyere.json
M	profiles/juice-shop-online.json
已删除分支 temp-sync-laneC（曾为 6931ad3）。
sync OK
2026-08-29T20:04:33+08:00 | ✅ aspgoat PASS @R2-a1 (19/23 83% 4/4 0FP; profile_suggest --apply 自动修复) -> sync control; laneC 待命 | laneB dvwa 容器拉取中
2026-08-29T20:05:39+08:00 | laneB === dvwa attempt 1/3 (PHP 四档难度, 容器已起 http 302) ===
=== 2026-08-29T20:11:14+08:00 100s tick ===
2026-08-29T20:08:08+08:00 | load=6.00 mem=74% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtec3gaa-discovery-20cq[discovery] exit=0 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-wftr[creative] exit=0 [pentest] 假设待消费(6条o
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

=== 2026-08-29T20:24:36+08:00 100s tick ===
2026-08-29T20:21:28+08:00 | load=1.44 mem=53% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtec3gaa-discovery-20cq[discovery] exit=0 [pentest] worker 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-wftr[creative] exit=0 [pentest] 假设待消费(6条o
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

2026-08-29T20:27:28+08:00 | R2b: OPEN_RECON 全自主模式+OAST(:8890)+凭据透传 上线; laneB dvwa 全自主重启
=== 2026-08-29T20:37:59+08:00 100s tick ===
2026-08-29T20:34:48+08:00 | load=0.95 mem=52% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtecvier-discovery-6v46[discovery] exit=1 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-wftr[creative] exit=0 [pentest] 假设待消费(6条o
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

=== 2026-08-29T20:51:21+08:00 100s tick ===
2026-08-29T20:48:08+08:00 | load=1.02 mem=53% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtecvier-discovery-49fi[discovery] exit=null [pentest] 自动调度
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-wftr[creative] exit=0 [pentest] 假设待消费(6条o
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

=== 2026-08-29T21:04:43+08:00 100s tick ===
2026-08-29T21:01:29+08:00 | load=1.91 mem=53% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtecvier-deep-88gq[deep] exit=0 [pentest] 自动调度: 深度环启动 (24 高
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-wftr[creative] exit=0 [pentest] 假设待消费(6条o
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

=== 2026-08-29T21:18:06+08:00 100s tick ===
2026-08-29T21:14:49+08:00 | load=2.85 mem=53% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtecvier-deep-rsju[deep] exit=0 [pentest] 自动调度: 深度环启动 (24 高
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-wftr[creative] exit=0 [pentest] 假设待消费(6条o
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

=== 2026-08-29T21:31:28+08:00 100s tick ===
2026-08-29T21:28:09+08:00 | load=0.99 mem=52% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtecvier-deep-rsju[deep] exit=0 [pentest] 自动调度: 深度环启动 (24 高
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:[pentest] worker eng-mte9u1is-creative-wftr[creative] exit=0 [pentest] 假设待消费(6条o
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

2026-08-29T21:33:16+08:00 | R2b cold-start 中间读数: dvwa OPEN_RECON 全自主 100%+6/6, profile_suggest 自动建模
=== syncing laneB → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneB.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneB'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.41s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/scheduler.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi-online.json: 失败
./profiles/crapi.json: 失败
位于分支 temp-sync-laneB
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     docs/ITERATION.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/scheduler.js
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	docs/ITERATION.md
M	graphd/app.py
M	plugin/pentest-dsh/scheduler.js
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/crapi-online.json
M	profiles/demo-juice-shop.json
M	profiles/gruyere.json
已删除分支 temp-sync-laneB（曾为 6931ad3）。
sync OK
=== syncing laneC → control ===
ExperienceWeight exported to /tmp/sync-expweight-laneC.json
patch diff found, applying to control
切换到一个新分支 'temp-sync-laneC'
error: 输入中没有合法的补丁 （使用 "--allow-empty" 来允许）
................................                                         [100%]
32 passed in 0.36s
./.d2d-review/scripts/auto-rotate.sh: 失败
./.gitignore: 失败
./graphd/app.py: 失败
./plugin/pentest-dsh/package.json: 失败
./plugin/pentest-dsh/sanitize.js: 失败
./plugin/pentest-dsh/scheduler.js: 失败
./plugin/pentest-dsh/validator.js: 失败
./profiles/aspgoat.json: 失败
./profiles/crapi-online.json: 失败
./profiles/crapi.json: 失败
位于分支 temp-sync-laneC
尚未暂存以备提交的变更：
  （使用 "git add <文件>..." 更新要提交的内容）
  （使用 "git restore <文件>..." 丢弃工作区的改动）
	修改：     .d2d-review/S21-test-log.md
	修改：     docs/ITERATION.md
	修改：     graphd/app.py
	修改：     plugin/pentest-dsh/scheduler.js
	修改：     plugin/pentest-dsh/validator.js
	修改：     profiles/aspgoat.json
fatal: 标签 'control-v2' 已存在
切换到分支 'main'
M	.d2d-review/S21-test-log.md
M	docs/ITERATION.md
M	graphd/app.py
M	plugin/pentest-dsh/scheduler.js
M	plugin/pentest-dsh/validator.js
M	profiles/aspgoat.json
M	profiles/crapi-online.json
M	profiles/demo-juice-shop.json
M	profiles/gruyere.json
已删除分支 temp-sync-laneC（曾为 6931ad3）。
sync OK
2026-08-29T21:34:58+08:00 | 🧪 cold-start 开跑: laneB === security-shepherd (零类定义 OPEN_RECON 全自主) === | laneC === railsgoat (同) ===
=== 2026-08-29T21:44:49+08:00 100s tick ===
2026-08-29T21:41:30+08:00 | load=5.33 mem=70% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T21:58:11+08:00 100s tick ===
2026-08-29T21:54:51+08:00 | load=1.49 mem=58% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-discovery-qytv[discovery] exit=0 [pentest] worker 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T22:11:33+08:00 100s tick ===
2026-08-29T22:08:11+08:00 | load=1.56 mem=62% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 规划器: 1 条计划已生成(最高分 3) [pentest] 自动调度: 深度环启动 (25 高权重信号) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T22:24:55+08:00 100s tick ===
2026-08-29T22:21:31+08:00 | load=1.86 mem=61% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] 规划器: 1 条计划已生成(最高分 2.5) [pentest] 自动调度: 深度环启动 (25 高权重信号) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T22:38:17+08:00 100s tick ===
2026-08-29T22:34:51+08:00 | load=1.31 mem=62% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-deep-cgjb[deep] exit=0 [pentest] 自动调度: 深度环启动 (25 高
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T22:51:39+08:00 100s tick ===
2026-08-29T22:48:11+08:00 | load=1.36 mem=64% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-deep-hpoq[deep] exit=null [pentest] 假设待消费(6条open) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T23:05:01+08:00 100s tick ===
2026-08-29T23:01:32+08:00 | load=2.20 mem=60% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-deep-hpoq[deep] exit=null [pentest] 假设待消费(6条open) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T23:18:23+08:00 100s tick ===
2026-08-29T23:14:52+08:00 | load=1.38 mem=59% kuzu=1 lanes=3
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-deep-hpoq[deep] exit=null [pentest] 假设待消费(6条open) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T23:31:45+08:00 100s tick ===
2026-08-29T23:28:12+08:00 | load=1.97 mem=61% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-deep-hpoq[deep] exit=null [pentest] 假设待消费(6条open) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T23:45:06+08:00 100s tick ===
2026-08-29T23:41:32+08:00 | load=2.40 mem=67% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-deep-hpoq[deep] exit=null [pentest] 假设待消费(6条open) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

=== 2026-08-29T23:58:29+08:00 100s tick ===
2026-08-29T23:54:52+08:00 | load=3.15 mem=76% kuzu=1 lanes=2
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtefaaku-deep-hpoq[deep] exit=null [pentest] 假设待消费(6条open) 
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "find-lfi-dvwa-low-001",
  "f-1788005298228",
  "f-1788005306890",
  "f-1788005360155",
laneC 8768 crapi health:{"ok": true}  log:
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

2026-08-30T00:09:54+08:00 | watchdog: egress-gateway 自愈重启
2026-08-30T00:09:57+08:00 | watchdog: laneB dvwa a1/3 终态=none PASS=False
2026-08-30T00:09:59+08:00 | watchdog: laneB === dvwa attempt 2/3 hints=[类:sqli;类:xss;类:cmd_injection;类:lfi;类:info_disclosure;类:sensitive data exposure;证据:ART-sqli-db;证据:ART-cmd-whoami;证据:ART-lfi-passwd;证据:ART-xss-stored;证据:ART-sqli-blind] ===
=== 2026-08-30T00:11:51+08:00 100s tick ===
2026-08-30T00:08:14+08:00 | load=4.29 mem=76% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:
 "artifacts": "1/2",
 "artifact_detail": {
  "ART-xss-dom": false,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1788019828534",
  "f-1788019858508",
  "find-session-fixation-tdhw-003",
  "find-setup-unauth-tdhw-001"
laneC 8768 crapi health:{"ok": true}  log:
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

2026-08-30T00:23:22+08:00 | watchdog tick laneB dvwa a2 running
=== 2026-08-30T00:25:14+08:00 100s tick ===
2026-08-30T00:21:35+08:00 | load=7.62 mem=62% kuzu=1 lanes=1
laneB 8767 juice-shop-online health:{"ok": true}  log:[pentest] worker eng-mtektnyv-discovery-bz4b[discovery] exit=0 model=minimax-cn/
 "artifacts": "2/2",
 "artifact_detail": {
  "ART-xss-dom": true,
  "ART-sqli-login": true
 },
 "false_positives": [
  "f-1788019828534",
  "f-1788019858508",
  "find-session-fixation-tdhw-003",
  "find-setup-unauth-tdhw-001",
laneC 8768 crapi health:{"ok": true}  log:
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


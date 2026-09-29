# 黄金靶集基线(4.5-0) — 2026-09-29

- 范围: DVWA(单容器, 0.0.0.0:80→80, 容器名 `dvwa`) + 自建 SPA 靶场(`tests/golden-targets/spa/`, 127.0.0.1:8894)
- 用途: 浏览器环 / HTTP 工具环的 golden truth 对照基线
- 口径: 未经标注"实测"的 DVWA 事实来自任务审计实证(直接采信); 所有"实测"条目均为本文记录时的实跑输出
- 靶场纪律: SPA 仅绑定 127.0.0.1; DVWA 仅限本地演练; 两靶场均禁止暴露外部网络

---

## 1. Golden Truth — DVWA 已知漏洞面(10 类)

审计实证前提(直接采信): 单容器 Apache+MariaDB, DB `app`/`vulnerables` 已初始化, admin/password 可登录, 安全级别由 cookie `security=low/medium/high` 控制、无持久化默认 low, PHPIDS disabled; `/hackable/uploads/` 有 13+ 历史 webshell 残留(本次实测 `ls /var/www/html/hackable/uploads/ | wc -l` = **29**, 无 .htaccess, 含 `evil.php`/`shell.php`/`shell.php.png`/`probe.jpg.php5` 等)。

| # | 漏洞类 | DVWA 入口 | ab-report(T1.8.1) 对应 finding | gate_status |
|---|---|---|---|---|
| 1 | SQLi 注入 | `/vulnerabilities/sqli/` | DVWA SQL Injection - Credential Hash Exfiltration via UNION SELECT | **verified** |
| 2 | SQLi 盲注 | `/vulnerabilities/sqli_blind/` | DVWA Blind SQL Injection - Boolean-Based Detection on id parameter | **verified** |
| 3 | 命令注入 | `/vulnerabilities/exec/` | DVWA Command Injection - RCE via ip parameter (security=low) | **verified** |
| 4 | LFI | `/vulnerabilities/fi/` | DVWA File Inclusion - Local File Read (LFI) via page parameter | **verified** |
| 5 | 文件上传 RCE | `/vulnerabilities/upload/` | DVWA File Upload - Unrestricted .php Upload Leading to RCE | needs-scope(未 verified; verified 的是 #5b 残留持久化) |
| 5b | (uploads 残留持久化) | `/hackable/uploads/` | DVWA Hackable Uploads Directory - Prior-Engagement Web Shells Persist | **verified** |
| 6 | XSS 反射 | `/vulnerabilities/xss_r/` | DVWA Reflected XSS via name parameter (security=low) | **verified** |
| 7 | XSS 存储 | `/vulnerabilities/xss_s/` | DVWA Stored XSS via xss_s guestbook mtxMessage parameter | triaged |
| 8 | CSRF | `/vulnerabilities/csrf/` | DVWA 认证链路缺 CSRF 防护,管理员密码可被 GET 一键改写 | triaged |
| 9 | 弱会话 | `/vulnerabilities/weak_id/` | DVWA dvwaSession 自增整数,会话 ID 可预测可遍历 | triaged |
| 10 | 未鉴权 setup | `/setup.php` | DVWA Setup - DB Reset Endpoint Exposes DB Credentials and Admin Reset | **verified** |
| 11 | 目录列举/信息泄露 | `/hackable/uploads/` 等目录 | 目录列举+配置文件备份泄露(DB凭证); view_source.php 全模块源码明文泄露 | **verified**(两条) |

> 上表 1-11 行覆盖任务口径的 10 类(SQLi 注入/盲注拆两行、XSS 反射/存储拆两行、并附 uploads 残留持久化与目录列举两条 verified 补充)。**注**: ab-report 中 gate_status=verified 恰为 9 条 finding(第 4 节), 即上表标 **verified** 的行; #5 文件上传 RCE 本体在 ab-report 为 needs-scope, reset 脚本(`scripts/ops/dvwa-reset.sh`)清理 uploads 即针对 5b 残留面。

容器内源码级佐证(本次实测, 供重置脚本依据):
- `login.php:12` `checkToken($_REQUEST['user_token'], ...)`; 表单字段 `username`/`password`/`Login`(login.php:90-97)
- `setup.php:13-14` create_db 处理**同样需要 user_token**(reset 脚本因此先 GET /setup.php 取 token 再 POST)
- `dvwa/includes/DBMS/MySQL.php:32` 重置成功标记 `"Database has been created."`
- `dvwaPage.inc.php:222-226` Logout 菜单仅 `dvwaIsLoggedIn()` 时渲染(登录判据)

## 2. Golden Truth — SPA 自建靶场 3 故意漏洞

| # | 漏洞 | 载体 | 预期利用路径 | HTTP 工具面可见性 |
|---|---|---|---|---|
| V1 | `/api/admin/stats` 无任何鉴权 | 服务端(前端路由守卫只是 localStorage 摆设) | 直接 `curl http://127.0.0.1:8894/api/admin/stats` 即 200 | ✅ **HTTP 可见** |
| V2 | `/api/search?q=` 原样回显 + 前端 innerHTML 渲染 → DOM XSS | 服务端回显 + 客户端 sink | `#/search?q=<img src=x onerror=alert(1)>` | ❌ **盲区**(见 3.2) |
| V3 | `/ws` 消息原样广播 + 前端 innerHTML 渲染 → DOM XSS | WebSocket 帧 + 客户端 sink | 任意第二个 WS 客户端发 `<img src=x onerror=alert(1)>`, 所有在线页面注入执行 | ❌ **盲区**(见 3.3) |

## 3. HTTP 工具面探测记录(实测 2026-09-29, 靶场经 `scripts/ops/spa-start.sh start` 启动)

### 3.0 启动与三连探测

```
$ bash scripts/ops/spa-start.sh start
[spa] 启动中 pid=1404330 port=8894 log=/home/kali/.d2d-data/run/spa-target.log ...
[spa] 已就绪: /api/notes=401(期望401) /=200(期望200)
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8894/                 → 200
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8894/api/notes        → 401
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8894/api/admin/stats  → 200   ← V1 实证
```

V1 直接取体: `{"service":"golden-spa-target","uptime_s":22,"ws_connections":0,"notes":3,"warning":"V1 故意漏洞: 本接口无鉴权, 前端路由守卫仅是客户端摆设"}`

### 3.1 V2 载体在 API 层可见、渲染面不可见

API 层回显(原样, 未转义 — 载体本体):

```
$ curl -s 'http://127.0.0.1:8894/api/search?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E'
{"q":"<img src=x onerror=alert(1)>","results":[]}
```

### 3.2 V2 = HTTP 盲区: `GET /#/search?q=<img src=x onerror=alert(1)>`

```
$ curl -sS 'http://127.0.0.1:8894/#/search?q=<img src=x onerror=alert(1)>'
curl: (3) URL rejected: Malformed input to a URL function        # exit=3 — curl 直接拒绝原始 <>(工具面本身受限)
$ curl -s 'http://127.0.0.1:8894/#/search?q=%3Cimg%20src%3Dx%20onerror=alert(1)%3E' -o /tmp/v2blind.html -w '...'
http=200 size=1818                                                # 取回的只是 1818 字节静态壳(index.html)
$ grep -c '结果:\|<h3>\|<ul>\|ws-msg' /tmp/v2blind.html           # 渲染态标记逐一计数
结果: =0, <h3> =0, <ul> =0, ws-msg =0                              # 无任何 DOM XSS 渲染产物
```

解释: fragment(`#/search?...`)永不上送服务端, 服务端 pathname 是 `/` 只回静态壳; innerHTML 渲染发生在浏览器 DOM 里。→ **V2 对 HTTP 工具面不可见**。

### 3.3 V3 = HTTP 盲区: WebSocket 无法用 curl 完成

```
$ curl -s -i --http1.1 --max-time 3 \
    -H 'Connection: Upgrade' -H 'Upgrade: websocket' \
    -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Sec-WebSocket-Version: 13' \
    http://127.0.0.1:8894/ws -o /tmp/wsprobe.txt
curl exit=28 (timeout)
# /tmp/wsprobe.txt 仅含:
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
```

解释: 握手(101)虽可达, 但 curl 无法收发 WS 帧 — 注入消息(帧级交互)必须真实 WS 客户端 + 浏览器 DOM 渲染。→ **V3 对 HTTP 工具面不可见**。

### 3.4 结论

**HTTP 工具面对 SPA 3 故意漏洞只能发现 1 个(V1); V2 渲染面与 V3 帧面共 2 个盲区** → 浏览器环(hash 路由/异步 fetch/innerHTML sink/WS 帧)对黄金靶集是必要性实证, 不是锦上添花。

### 3.5 停止(实测)

```
$ bash scripts/ops/spa-start.sh stop
[spa] 已停止(pid 1404330)。
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8894/   → 000(端口已关)
$ bash scripts/ops/spa-start.sh stop                               # 幂等
[spa] 未在运行(清理 pid 文件: /home/kali/.d2d-data/run/spa-target.pid)。 exit=0
```

## 4. DVWA 基线引用

- 来源: `experiments/results/ab-report-20260928-190531.md`(历史场 A/B 对比报告, T2-1-4)
- A 组 = eng-0928-2340-127-1l(T1.8.1, 五旋钮全开任务口径, P2P_DISTILL_LLM=on)
- 基线数字: **Finding 22 条 / verified 9 条**(报告"汇总对比"表, 第 11/14 行); Signal_ 55, Hypothesis 10
- 9 条 verified 明细见该报告"A 组 Finding 明细"表(sqli、sqli-blind、rce-exec-low、lfi、uploads 持久化、xss-reflected、setup 信息泄露、view_source 泄露、目录列举+备份泄露)
- 本文件第 1 节 truth 表即以该 22/9 为 DVWA 侧 ground truth 的核对依据; 22 条中 triaged/needs-scope 条目(存储 XSS、CSRF、弱会话、上传 RCE 本体等)同样是有效攻击面, 只是未过 verify 门

## 5. 运维与测试

| 操作 | 命令 |
|---|---|
| DVWA 重置(容器重启→登录→DB 重置→清 uploads 残留→重启 apache→摘要) | `bash scripts/ops/dvwa-reset.sh` |
| SPA 起停 | `bash scripts/ops/spa-start.sh start` / `... stop`(pid: `${D2D_DATA_DIR:-~/.d2d-data}/run/spa-target.pid`, 日志: 同目录 `spa-target.log`) |
| SPA 服务端语法/单测 | `node --check tests/golden-targets/spa/spa-server.mjs`; `cd plugin/pentest-dsh && npx mocha test/golden-spa.test.mjs` |

> 本次 4.5-0 未实跑 `dvwa-reset.sh`(仅 `bash -n` + 容器源码核对): 重置会清掉 ab-report verified finding「Prior-Engagement Web Shells Persist」的 uploads 残留实证与 xss_s 库内数据, 该状态属引用基线的一部分, 保留给下一次真实 engagement 前执行。

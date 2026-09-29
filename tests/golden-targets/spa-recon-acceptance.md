# SPA 侦察验收实跑(T2-2b-2-4/5) — 2026-09-30

- 性质: **集成验收实跑**(非单测) — 真实靶场 + 真实渲染通道 + 真实 graphd 写图, 全部命令与输出为本文记录时的实跑原文
- 靶场: `tests/golden-targets/spa/`(:8894, golden truth 见 `baseline.md`); 渲染通道: `scripts/gateway/spa-render.mjs`(本树上轮已增强: WS 订阅 + ws:// 归一 + 入图 5 字段)
- 图: 生产 graphd(`127.0.0.1:8766`, systemd `d2d-graphd`) — 渲染端点与验证信号均已入图

## 0. 实跑方式(生产零打扰)

| 组件 | 起法 | 说明 |
|---|---|---|
| SPA 靶场 | `bash scripts/ops/spa-start.sh start` | pid 1641323, :8894, 就绪判据 `/api/notes=401` `/=200` 通过 |
| 渲染通道 | `P2P_SPA_PORT=18892 D2D_DATA_DIR=/tmp/spa-recon-accept nohup node scripts/gateway/spa-render.mjs &` | **本地临时实例**。生产 `d2d-spa.service`(:8892, pid 1176, Sep28 起旧代码)**不重启不改** — 端口改 18892、`D2D_DATA_DIR` 指临时目录, 使单例锁(`spa-render.lock`)与 chrome profile(`spa-profile/`)同生产完全隔离 |
| chrome | `P2P_CDP_URL` 留空 → spa-render 自拉 | `GET :18892/health → {"ok":true,"ready":true,"chrome":"http://127.0.0.1:9344"}` |
| 鉴权 | `/render` 强制 `X-Auth: host-token`(`~/.config/d2d/host-token`; spa-render.mjs:246 fail-closed) | 下方所有 /render 带 `-H "X-Auth: $HT"` |

## 1. 三行判定

| # | 漏洞 | 判定 | 图内证据 |
|---|---|---|---|
| V1 | `/api/admin/stats` 无鉴权 | **[✓-HTTP+JS 提取]** — HTTP 面 200 直证; 浏览器面(登录态导航路径)待 4.5-3 验证档(cdp-proxy `/fill`+`/click` 已具备) | (本行为 HTTP+JS 面, 不入图) |
| V2 | `#/search?q=` innerHTML DOM XSS | **[✓ 端点+疑似点信号]** | Endpoint `http://127.0.0.1:8894/api/search?q=golden` tech=`spa-cdp`; Signal_ `s-1790703705849`(surface=`js` boundary=`inner`, AT→该端点) |
| V3 | `/ws` 广播 DOM XSS | **[✓ WS 端点]** | Endpoint `http://127.0.0.1:8894/ws` tech=`websocket`(ws:// 归一 http://) |

## 2. 逐项证据(实跑原文)

### 2.1 V1 — HTTP 面直证 + JS 提取信号

```
$ curl -s -o /tmp/v1_stats.json -w 'http=%{http_code}\n' http://127.0.0.1:8894/api/admin/stats
http=200
$ cat /tmp/v1_stats.json
{"service":"golden-spa-target","uptime_s":69,"ws_connections":0,"notes":3,"warning":"V1 故意漏洞: 本接口无鉴权, 前端路由守卫仅是客户端摆设"}
$ curl -s http://127.0.0.1:8894/app.js | grep -n "fetch('/api/admin/stats')"
135:  fetch('/api/admin/stats') // 刻意不带 Authorization 头 — 服务器照样 200, 即 V1 的实证
```

JS 提取信号: 静态资源 `/app.js` 内 `fetch('/api/admin/stats')` 字面量可被纯 JS 静态提取路径(briefs.mjs 信息面「JS 入口面」指令)捕获 — 未登录 fetch 被前端守卫拦住不影响该字面量的存在性提取。
浏览器面余项: 登录态导航(fill 表单→提交→守卫放行→admin 页渲染)是**验证档动作, 归 4.5-3**(见 §4)。

### 2.2 V2 — 渲染即捕获端点 + 疑似点信号(渲染面)

渲染命令与返回(hash 路由 URL, `graph:true` 入图):

```
$ HT=$(cat ~/.config/d2d/host-token)
$ curl -s -m 60 -X POST http://127.0.0.1:18892/render -H "X-Auth: $HT" -H 'Content-Type: application/json' \
    -d '{"url":"http://127.0.0.1:8894/#/search?q=golden","graph":true}'
{"ok":true,"url":"http://127.0.0.1:8894/#/search?q=golden","count":6,"endpoints":[
  {"url":"http://127.0.0.1:8894/","method":"GET","via":"doc"},
  {"url":"http://127.0.0.1:8894/style.css","method":"GET","via":"doc"},
  {"url":"http://127.0.0.1:8894/app.js","method":"GET","via":"doc"},
  {"url":"http://127.0.0.1:8894/api/search?q=golden","method":"GET","via":"xhr"},   ← V2 端点
  {"url":"http://127.0.0.1:8894/favicon.ico","method":"GET","via":"doc"},
  {"url":"http://127.0.0.1:8894/ws","method":"GET","via":"websocket","tech":"websocket"}],  ← V3 端点
 "graph_written":6}
```

查图(精确前缀, 排除图内历史数据; 注: 模糊 CONTAINS '8894' 会误中一条图内既有 gdfp.gifshow.com 行——其 seckey 参数恰含 "8894" 子串, 与本验收无关):

```
$ curl -s -X POST http://127.0.0.1:8766/query -H 'Content-Type: application/json' -H "X-Auth: $HT" \
  -d '{"cypher":"MATCH (e:Endpoint) WHERE e.url STARTS WITH \"http://127.0.0.1:8894\" RETURN e.url AS u, e.tech AS tech"}'
{"ok":true,"rows":[
  {"u":"http://127.0.0.1:8894/","tech":"spa-cdp"},
  {"u":"http://127.0.0.1:8894/style.css","tech":"spa-cdp"},
  {"u":"http://127.0.0.1:8894/app.js","tech":"spa-cdp"},
  {"u":"http://127.0.0.1:8894/api/search?q=golden","tech":"spa-cdp"},   ← V2: 渲染产物入图
  {"u":"http://127.0.0.1:8894/favicon.ico","tech":"spa-cdp"},
  {"u":"http://127.0.0.1:8894/ws","tech":"websocket"}],                 ← V3: 归一入图
 "count":6,"truncated":false}
```

盲区对照(baseline.md §3.2 复核): 同 URL 走 HTTP 工具面只回 1818 字节静态壳, 渲染态标记 `ws-msg`=0、无任何搜索结果 DOM 产物 → 渲染面 `/api/search` 端点只有浏览器环能产出。

疑似点信号(host-token 经 `/write/signal` 写入, 三要素齐):

```
POST /write/signal {"type":"dom-xss-suspect","weight":1.0,"surface":"js","boundary":"inner",
  "endpoint_url":"http://127.0.0.1:8894/api/search",
  "evidence":"source=location.hash q(...) | sink=app.js innerHTML(...) | 载体=q 服务端原样回显(...)"} → {"ok":true}

$ 查图确认行: MATCH (s:Signal_) WHERE s.type = "dom-xss-suspect" RETURN ...
{"ok":true,"rows":[{"id":"s-1790703705849","t":"dom-xss-suspect","su":"js","bo":"inner","w":1.0,"st":"open"}],"count":1}
$ 查 AT 边:  MATCH (s)-[:AT]->(e:Endpoint) ...
{"ok":true,"rows":[{"sid":"s-1790703705849","ep":"http://127.0.0.1:8894/api/search"}],"count":1}
```

行数对账: 信号落图后 8894 前缀 Endpoint 共 **7** 行 = 渲染写入 6 + graphd 信号内联 `upsert_endpoint`
按 endpoint_url 代建的 `http://127.0.0.1:8894/api/search`(tech='', graphd app.py:782-790 「#5 内联
endpoint_url 代写 Endpoint 缺则建」设计内行为, 与渲染行的 `?q=golden` 带参形态互为独立 upsert 键)。

载体 API 回显实证(HTTP 面): `curl 'http://127.0.0.1:8894/api/search?q=%3Cimg%20src%3Dx%20onerror%3Dalert(1)%3E'` → `{"q":"<img src=x onerror=alert(1)>","results":[]}` — q 原样回显不过滤。

### 2.3 V3 — WS 端点捕获(同一次渲染)

`connectWs()` 每页加载即连(app.js:214) → CDP `Network.webSocketCreated` 捕获 `ws://127.0.0.1:8894/ws` → `normalizeWsUrl` 归一 `http://` → 图内行 `{"u":"http://127.0.0.1:8894/ws","tech":"websocket"}`(上方查图输出末行)。graphd `/write/endpoint` 的 `^https?://` 硬门因此零改动直写 — ws:// 双盲修复(旧实现只听 `requestWillBeSent` 且过滤非 http(s))实证闭合。帧级注入面(第二 WS 客户端发 `<img src=x onerror=alert(1)>` 广播)仍归 4.5-3 浏览器环实弹验证。

## 3. 清理(实跑)

```
$ kill 1641511                                     # 本地 spa-render(:18892) — exit 钩子释放自有锁(:18892 立即关闭)
$ kill 1641595                                     # ⚠️ 补杀自拉 chromium(:9344) — spa-render 的 spawn 未绑 chrome 生命周期, 父进程退出后 chrome 成孤儿, 实跑中实证需手动补杀
$ bash scripts/ops/spa-start.sh stop               # 停靶场 → [spa] 已停止(pid 1641323)
$ rm -rf /tmp/spa-recon-accept                     # 临时数据根(锁/profile/日志)
# 清理后核验: 9344/18892 端口已释放; 生产 d2d-spa(pid 1176, Sep28 起)与 d2d-graphd 全程 active 未触碰
```

生产 `d2d-spa`(:8892)/`d2d-graphd`(:8766)全程未触碰。图内本验收产物保留: Endpoint 6 行(127.0.0.1:8894)+ Signal_ `s-1790703705849` + AT 边 — 后续 4.5-3 验证档直接引用。

## 4. 与 4.5-3 的衔接

- 本验收覆盖**渲染提取面**(匿名渲染即可产出的端点/信号); V1 登录态导航、V2 实弹 DOM XSS 触发、V3 帧级注入属**验证档动作**, 由 4.5-3 经 cdp-proxy(`/navigate`/`/fill`/`/click`/`/eval`, scripts/browser/cdp-proxy.mjs:245-282)执行
- 用法文档: `docs/browser-recon-runbook.md`(底座选型/强制代理/禁 WebRTC/侦察通道契约)

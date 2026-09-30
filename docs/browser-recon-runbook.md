# 浏览器侦察底座 — 选型 / 强制代理 / 禁 WebRTC / 侦察通道

浏览器环的两个宿主管控执行面: 侦察提取面 `scripts/gateway/spa-render.mjs`(E-7, CDP 驱动渲染后提取端点)
与交互治理面 `scripts/browser/cdp-proxy.mjs`(P2/M5, worker 用既有受控 curl 操作浏览器)。安全边界全部
在本层强制(spawn 参数/请求级拦截/页内注入), **不依赖浏览器或 MCP flag 的自觉**。端口约定: spa-render
:8892(systemd `d2d-spa`)、cdp-proxy :8893、egress 网关 :8888、graphd :8766; golden 靶场对照见
`tests/golden-targets/baseline.md` 与 `tests/golden-targets/spa-recon-acceptance.md`。

## ① 底座选型 — 三路径与结论(选 C)

| 路径 | 形态 | 结论 | 否决/选中依据 |
|---|---|---|---|
| A. Browser Use / 浏览器自动化外部工具 | playwright-mcp 形态的外部自动化通道 | ✗ 否决 | **环境阻断**(审计实证, 直接采信: 本部署环境该外部自动化通道不可用, 无法作为常驻底座); 且 playwright-mcp 官方承认 flag 级开关不是安全边界(cdp-proxy.mjs:4-5 注释引证) |
| B. 附着既有 chrome(`P2P_CDP_URL` 指日常 profile 的调试口) | 复用已开浏览器 | ✗ 否决 | 凭据隔离破坏 — 日常 profile 的登录态/cookie 直接进入侦察面; cdp-proxy.mjs:6-7 明文"绝不附着用户日常 profile(凭据隔离 + 单实例锁)" |
| C. 宿主管控 headless chrome(cdp-proxy / spa-render 自拉) | per-engagement 独立 profile + 单实例锁 + launch 参数级强制代理 | **✓ 选中** | 唯一路径同时满足: 凭据隔离(per-eng profile)、出网权威通道(spawn flags, 见②)、请求级 scope 门(Fetch.enable fail-closed)、进程生命周期归宿主 |

- C 的代价与缓解: 双执行面(spa-render/cdp-proxy)各拉 chrome 曾是双 chrome 冲突源 → 单实例锁双份
  (`~/.d2d-data/spa-render.lock` 与 `~/.d2d-data/cdp-proxy-<eng>.lock`, O_EXCL wx 独占创建 + 45s 过期接管);
  侦察面与治理面需要共用浏览器时, `P2P_CDP_URL` 指向 cdp-proxy `/health` 的 `cdp` 字段(spa-render.mjs:8-9)。
- 本机 chrome 发现顺序(两执行面同款): `P2P_CHROME_PATH` → google-chrome → chromium(本机实测 `/usr/bin/chromium`);
  都缺且未设 `P2P_CDP_URL` → `/health` 报 ready=false, `/render` 与业务端点返 503(fail-closed 不静默)。

## ② 强制代理 — launch 参数级, env 是摆设

权威通道是 **spawn 参数**(`buildChromeArgs`, cdp-proxy.mjs:133-143; 浏览器不认 http_proxy 环境变量,
WS/WebRTC/QUIC 亦不吃 env 代理):

```
--proxy-server=http://127.0.0.1:8888   # P2P_PROXY_URL 注入; =off|none 时省略(仅无网关环境调试)
--disable-quic                          # QUIC 走 UDP 绕代理 → 硬关, 流量收敛回代理通道
(不发 --proxy-bypass-list)              # bypass 列表默认空
```

- **回环靶场的治理面 = CDP 层 scope 门(实测修正, T2-2b-4 开放项②)**: Chromium 对回环目标
  (127.0.0.1/localhost)即使设 `--proxy-server` 也**默认隐式直连**——不发 `--proxy-bypass-list` 改变的
  只是显式豁免清单, 回环流量本就不经 d2d-egress 网关(强制回环过代理需显式 `<-loopback>`, 会把
  靶场流量拖进网关且无必要, 不采用)。实测口径(T2-2b-4 SPA 攻击验收, cdp audit.jsonl 17 行证据):
  SPA(:8894)请求仍全部过 `Fetch.requestPaused` scope 门(cdp-proxy.mjs:184-194, 非白名单一律
  AccessDenied)——该门在 CDP 网络层, 与代理无关。准确表述: **scope 门覆盖回环(实测成立),
  egress 网关不经回环(Chromium 默认语义)**。DNS 由代理解析仅对走代理的非回环流量成立;
  回环目标本机解析, 无出网面。(cdp-proxy.mjs:129-131 头注释仍是修正前表述, 勘误归代码属主批)
- 进程级锁定(单测同款断言): `plugin/pentest-dsh/test/browser-recon.test.mjs` 用 fake chrome 捕获真实
  spawn argv, 锁定"有 `--proxy-server`/`--disable-quic` 且无 bypass"三条。
- scope 白名单来源: 静态 `P2P_PROXY_ALLOW`(缺省 `127.0.0.1,localhost`)∪ graphd 动态 scope(30s 刷新,
  cdp-proxy.mjs:39-65) — 与 egress-gateway 同源口径。

## ③ 禁 WebRTC — 页内注入(launch 无开关)

chromium 150 无 `--disable-webrtc` / `--force-webrtc-ip-handling-policy` launch 开关(strings 实证,
cdp-proxy.mjs:145-149), `--proxy-server` 管不住 WebRTC 的 UDP 面 → 唯一可验证禁用是**页内注入**:

- 注入载体: `Page.addScriptToEvaluateOnNewDocument`(先于页面任何脚本, 每个新文档生效; cdp-proxy.mjs:183)
- 注入内容(`WEBRTC_DISABLE_SCRIPT`, cdp-proxy.mjs:150-152): `Object.defineProperty(window,'RTCPeerConnection',{value:undefined,writable:false,configurable:false})` 同款覆写 `RTCDataChannel` — 不可写不可配置, 页面无法复活
- 探测命令(禁用生效判据, 经 cdp-proxy `/eval`):

```bash
curl -s -X POST http://127.0.0.1:8893/eval -H "X-Auth: $P2P_WORKER_TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"target":"<targetId>","expression":"typeof RTCPeerConnection"}'
# → {"ok":true,"value":"undefined"} 即禁用生效; "function" = 注入未生效(立即停用该实例排查)
```

## ④ 侦察通道用法

### 4.1 渲染提取面 — spa-render `/render`(宿主侧通道, 简报已显式化)

```bash
curl -s -X POST "$P2P_SPA_URL/render" -H "X-Auth: $(cat ~/.config/d2d/host-token)" \
  -H 'Content-Type: application/json' \
  -d '{"url":"http://<scope 内目标>/#/route?q=x","graph":true}'
```

- ⚠️ **鉴权是 host-token 单一凭据**(spa-render.mjs:27 只读 `~/.config/d2d/host-token`, :246 只比对它;
  0913 审查 C6 fail-closed: 防本地任意进程驱动 chrome) — 与 cdp-proxy 的 host/worker 双 token 不同。
  **已知跨层缺口**(本 runbook 记录, 未修): scheduler 的 spaLine(scheduler.js:527-528)与 discovery 简报的
  渲染面指令面向 worker, 而 worker env 无 host-token(adapter-dsh.mjs 派发时显式 delete P2P_HOST_TOKEN)
  → worker 直连 `/render` 会 401。现网语义: 渲染提取由宿主侧/被授予 host-token 的可信通道代跑, worker
  消费其入图产物; worker 侧放开需 spa-render 增 worker-token 凭据(改动归 spa-render 属主, 见 notes)。
- `url` **必须含 hash 路由**(`#/...` 片段永不上送服务端, 静态壳盲区实证见 baseline.md §3.2);
  `graph:true` 渲染端点 MERGE 入图(缺省 graphd :8766, `port` 可指定); `waitMs` 可调渲染等待(缺省 4000)。
- 返回 `endpoints` 清单(via: doc/xhr/dom/websocket)+ `graph_written`; **端点以返回为准, 逐条
  `/write/endpoint` 补 eng/business_chain**(spa-render 自身无 engagement 语境, eng 缺省空串由 W5 认领)。
- **WS 归一规则**: CDP `Network.webSocketCreated` 捕获 WS 握手, `ws://`→`http://`、`wss://`→`https://`
  后入图, `tech='websocket'` 标记传输层(graphd `^https?://` 硬门因此零改动); 普通 http(s) 端点
  `tech='spa-cdp'`。旧实现只听 `requestWillBeSent` 且过滤非 http(s), 对 WS 双盲 — 已修并锁定单测。
- 信号契约: 渲染面疑似点(DOM-XSS 载体/可疑回显)写
  `/write/signal {"type":"dom-xss-suspect","surface":"js","boundary":"inner","endpoint_url":"<来源端点>"}`,
  evidence 装三要素(source/sink/载体) — surface/boundary 只填枚举(graphd 软校验, 枚举外置空;
  覆盖图只认枚举坐标), 带 endpoint_url 自动建 `(s)-[:AT]->(e)` 边。实跑样板: spa-recon-acceptance.md §2.2。

### 4.2 交互治理面 — cdp-proxy 11 端点(worker 可用, 全部要求 X-Auth)

`/health /targets /new /navigate /eval /click /clickAt /fill /scroll /screenshot /close`
(cdp-proxy.mjs:296; `/health` 免鉴权只探测不拉起):

```bash
# 开页(仅 scope 内 URL; about:blank 免检) → 填表 → 点提交 → 取值/截图
curl -X POST :8893/new    -H "X-Auth: $P2P_WORKER_TOKEN" -d '{"url":"http://<scope 内目标>/login"}'
curl -X POST :8893/fill   -H "X-Auth: $P2P_WORKER_TOKEN" -d '{"target":"<id>","selector":"#user","value":"..."}'
curl -X POST :8893/click  -H "X-Auth: $P2P_WORKER_TOKEN" -d '{"target":"<id>","selector":"button[type=submit]"}'
curl -X POST :8893/eval   -H "X-Auth: $P2P_WORKER_TOKEN" -d '{"target":"<id>","expression":"document.title"}'
curl -X POST :8893/screenshot -H "X-Auth: $P2P_WORKER_TOKEN" -d '{"target":"<id>"}'   # 落 <DATA_DIR>/evidence/cdp/
```

- 请求级 scope 门对**页面 JS 触发的跳转/子资源同样生效**(Fetch.enable 全量拦截, fail-closed);
  审计流水 `<DATA_DIR>/evidence/cdp/audit.jsonl`(fetch-allow/fetch-deny/auth-deny/screenshot)。
- 鉴权二选一: host-token 或 worker-token(与图通道同凭据); profile 按 engagement 隔离
  `<DATA_DIR>/cdp-profiles/<eng>/`。

### 4.3 运维起停与验收

| 操作 | 命令 |
|---|---|
| 生产渲染面 | systemd `d2d-spa`(:8892); 改代码后需重启才生效(进程内加载的是旧代码) |
| 本地临时实例(不打扰生产) | `P2P_SPA_PORT=18892 D2D_DATA_DIR=<临时目录> nohup node scripts/gateway/spa-render.mjs &` — 锁与 profile 随临时目录隔离; **收尾必须补杀自拉 chromium**(spawn 未绑 chrome 生命周期, 实跑实证孤儿) |
| 交互面(开发调试) | `P2P_CDP_PROXY_PORT=8893 nohup node scripts/browser/cdp-proxy.mjs &` |
| 单测 | `cd plugin/pentest-dsh && npx mocha test/browser-recon.test.mjs`(spawn argv 锁定/WebRTC 注入 vm 实跑/单例锁/WS 归一/5 字段, 16 passing) |
| 集成验收 | `tests/golden-targets/spa-recon-acceptance.md`(V1/V2/V3 三行判定, 2026-09-30 实跑) |

## ⑤ 与 4.5-3 的衔接 — 渲染面 vs 验证档

分工: **④.1 渲染提取面是匿名面** — spa-render 渲染 hash 路由产出端点与疑似点信号(surface=js),
不登录、不触发业务动作; **登录态导航是 4.5-3 验证档的动作**, 经 cdp-proxy 执行:

| 疑似点(本验收产出) | 4.5-3 验证档动作(cdp-proxy) |
|---|---|
| V1 `/api/admin/stats` HTTP 200 + app.js:135 字面量 | 登录态导航: `/new` 登录页 → `/fill` 账号 → `/click` 提交 → 前端守卫放行后 `/eval` 取 admin 页渲染体, 与零 cookie 直连对照 |
| V2 `s-1790703705849`(source=hash q / sink=innerHTML / 载体=q 回显) | 实弹触发: 登录态下 `/navigate` 带 payload hash URL → `/eval` 验证 sink 执行 → `/screenshot` 落证 |
| V3 `tech='websocket'` 端点行 | 帧级注入: 第二 WS 客户端发 `<img src=x onerror=alert(1)>` 广播 → 在线页面注入执行(WS 帧交互 curl 无法表达, baseline.md §3.3) |

- 会话保持: cdp-proxy per-eng profile 天然持有登录态(4.5-3 登录一次后同 profile 内续用);
  spa-render 的 profile 独立(`spa-profile/`), 拿不到 cdp-proxy 的会话 — 登录面动作不要走 `/render`。
- 信号升级路径: 验证档实证后按七态机走 Finding(渲染面 Signal_ 只到 suspected/疑似点, 不自封 verified)。

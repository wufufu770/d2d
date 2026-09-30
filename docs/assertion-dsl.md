# 断言 DSL — Finding 重放验证的判定语汇(T2-2b-3-2)

验证器环(`plugin/pentest-dsh/validator.js`)对 Finding 做机械重放后, `gate_status=verified` 不再
只看"可达"——`opts.assertions` 提供判定语汇, 命中才 verified。解析(`parseAssertions`,
validator.js:646)与判定(`evaluateAssertions`, validator.js:708)分离, 通道语义(curl 的
`httpCode` vs CDP 的 `navStatus`)由调用方注入。本文是 DSL 的形态权威; 证据落盘链见 §④。

| 开关/env | 默认 | 语义 |
|---|---|---|
| `D2D_VERIFY_LEVEL` | `L0` | 验证档位(仅 L0/L1; L2 不存在该档, 未知档 fail-safe 回 L0) |
| `D2D_CDP` | `1`(T2-2b-3-1 反转) | validator 第二验证通道总开关; 显式 `=0` 关闭(回落 curl) |
| `D2D_VERIFY_CHANNEL` | `cdp-first` | 通道档: `cdp-first` 全量走 CDP(可达时)/`hint` 按 CDP_HINT_RE 词表筛选/`curl` 永不走 CDP |
| `D2D_CDP_PROXY` / `P2P_CDP_PROXY_PORT` | `http://127.0.0.1:8893` | cdp-proxy 基址(前者显式优先) |
| `D2D_EVIDENCE_KEY_FILE` | `~/.config/d2d/host-token` | HAR 证据加密 KEK 来源(64-hex 原文, 见 §④) |
| `D2D_EVIDENCE_ENC` | 未设(加密) | `=0` 明文直通逃生(evidence-crypto 语义, 仅供回归) |
| `D2D_AUTHORIZED` | 空 | L1 授权硬门兜底清单 `ip:port,ip:port`(与 graphd authorized 表取并集) |

## ① 六型: 四基础型 + 两选择器型

对象形态 `{"type": "...", ...}`, 经 `parseAssertions` 解析; 非法项(未知 type/缺 path/空 value/
坏 regex)解析为 `__invalid__` 哨兵, 判定处一律 MISS + 不炸(fail-safe, validator.js:643)。

| type | 形态 | 判定语义(validator.js:715-755) | 通道 |
|---|---|---|---|
| `status` | `{"type":"status","value":200}` | curl 通道取 `result.httpCode`; **CDP 通道取 `navStatus`**(真实导航状态, 不信 cdpReplay 出口的通道哨兵 200); navStatus 缺失 = MISS(宁缺勿假) | 双通道 |
| `html_contains` | `{"type":"html_contains","value":"..."}` | 响应体(或 CDP 正文样本)子串, 大小写不敏感 | 双通道 |
| `json_path` | `{"type":"json_path","path":"data.list.0.id","value":42}` | 响应体 `JSON.parse` 后按点号路径取值(数组下标用数字段); `$.` 前缀可剥; `value` 缺省 = 存在即可, 给了则 `JSON.stringify` 全等比对; 解析/取值失败 = MISS | 双通道 |
| `regex` | `{"type":"regex","pattern":"uid=\\d+"}` | JS `RegExp` 对响应体 `test`; 坏 pattern 解析期即 `__invalid__` | 双通道 |
| `selector_exists` | `{"type":"selector_exists","selector":"#app h3 img"}` | 页内 `document.querySelector` 判存在 — cdpReplay 第二次 `/eval`(`cdpSelectorExpr`, validator.js:570)逐选择器评估, 选择器经 `JSON.stringify` 内插(无表达式注入面) | **仅 CDP** |
| `selector_value` | `{"type":"selector_value","selector":"#login-user","value":"user"}` | 同上 + 元素值包含比对: 表单元素取 `el.value`, 其余取 `textContent`(validator.js:576-577) | **仅 CDP** |

- **选择器型的通道硬边界**: curl 通道遇之 → 审计行 `[validator:assert] 选择器断言仅 CDP 通道可用`
  + MISS(validator.js:740); CDP 通道未取得评估结果(页内 eval 失败/断言未声明)→ 同 MISS(fail-safe)。
- 组合语义(validator.js:758-763): **纯字符串形态**(既有)保持任一命中即 HIT; **含任一 DSL 对象**
  → 全部命中才 HIT(DSL 是合取主张); DSL 形态下任一非法项 = 整组未命中。

## ② 字符串数组兼容语义(旧形态零变化)

`opts.assertions` 收字符串数组时, 每项 = 响应体**子串**(归一为 `html_contains` 兼容形态,
`legacy:true`, validator.js:651-655): `assertions: ["golden-spa-target", '"ws_connections":']`
任一命中即 HIT。空白串剔除(上游 C2 口径: `includes('')` 恒真会产出假 verified, validator.js:935)。
既有 reason 文案对字符串形态逐字保留(`displayAssertion`, validator.js:686)。

## ③ MISS 语义与状态机(reached 是管道态)

`validateFinding`(validator.js:851)的状态三元: **verified**(reached 且断言命中)→
**reached**(可达 2xx/3xx 但断言未命中)→ **quarantined**(不可达/L1 拒绝/反射断言缺失)。

- 断言 MISS 且目标可达 → `gate_status='reached'`: **留管道态, 不动 8 态状态机**——`reached`/
  `quarantined` 是验证器环私有管道值, 不在 graphd `FINDING_STATES` 8 态白名单内
  (validator.js:44-49 `GATE_STATUS_WHITELIST` 自述; 旁路直写经 `guardedGateSet` 枚举守门),
  下轮验证可重放重判, 消费方按 8 态过滤天然不见它们。
- status 型在 CDP 通道 navStatus 缺失、json_path 解析失败、选择器通道不符等一律 MISS
  (宁缺勿假): 可达性证据与主张证据分开, MISS 只降 verified 不抹掉 reached。
- 反射类(下节)断言缺失是 MISS 的强形态 → 直接 quarantined(不是 reached)。

## ④ G1 反射强制共存 + HAR 证据链

**G1 反射强制共存**(validator.js:936-967): finding.category 命中
`/xss|ssrf|ssti|inject|sqli|\brce\b|command/i` 时, 重放可达但**零断言** = 推测性 finding,
不得 verified。补断言顺序: 从 repro 提取候选 payload(取**最长**强候选——判据
`strong.length>=6` 且含非字母数字, 修首个匹配把 `' OR '1'='1` 弱化成 `' OR ` 的假阴性)
注入断言集; 提取不到任何强候选(`reflectAssertMissing`)→ 即使 2xx 也 quarantined, reason
带 `assertion=FAIL(反射 payload 提取失败…)`。

**HAR 证据链**(T2-2b-3-4): 重放事务(curl 或 CDP)在判定前经 `writeEvidenceHar`
(validator.js:805)落证据:

- **落点**: `<runsBase>[/<eng>]/evidence/har/<findingId>.har`(文件名安全化, 白名单外字符归一
  `_` 防穿越; `opts.harDir` 直给则返回裸文件名, 返回值作为相对引用回写 repro/verified_log 的
  ` | evidence: evidence/har/<file>`, 仅 verified 时)。HAR 1.2 形状由纯函数 `buildHar`
  装配(har-capture.mjs, 零 fs/零加密); **CDP 通道扩展**: entry 顶层 `dom`(DOM 快照)/
  `waterfall`(资源瀑布)非标准键直传, `response.body` = DOM 快照, `response.status` = navStatus。
- **加密**: `evidence-crypto.createEvidenceSink` AES-256-GCM 认证加密, KEK = SHA-256(密钥文件
  64-hex 原文)(evidence-crypto.mjs:20-56); 错密钥/篡改在读回 `readEvidenceFile(file, keyHex)`
  的 `final()` 抛错, 绝不返回部分明文。原子写(tmp+rename), 明文不驻留。
- **逃生/降级**: `D2D_EVIDENCE_ENC=0` 明文直通(显式运维选择, 不读密钥); 缺密钥文件/目录不可写
  → 审计行 `evidence-write-error` + 返回 `''`(fail-open 不碍验证主流程 — 与 mitm-enc 尽力而为
  一致; evidence-crypto 本体仍是 fail-closed)。未发请求的重放(repro 无可安全重放 curl / L1 拒绝)
  零证据。
- 读回验 Evidence: `readEvidenceFile(har, keyFromFile(process.env.D2D_EVIDENCE_KEY_FILE ??
  ~/.config/d2d/host-token))` — 实跑见 tests/golden-targets/spa-verify-acceptance.md §2.1。

## ⑤ 调用示例 — worker verify-result 信号怎么带 assertions

worker 裁决信号经 graphd `/write/signal`(gate_anchor 写入校验: ≤8192 字符 JSON object 且顶层含
`gate_d1`/`gate_v` 键之一, 合法锚**原文透传**, 附加键放行 — graphd/app.py:759-769; 权威 schema
见 docs/gate-anchor-schema.md)。断言随 `gate_v` 结构化锚携带, 供验证环消费:

```bash
HT=$(cat ~/.config/d2d/host-token)   # 凭据从文件读, 绝不入库入档
curl -s -X POST http://127.0.0.1:8766/write/signal -H "X-Auth: $HT" -H 'Content-Type: application/json' -d '{
  "eng": "<eng-name>", "type": "verify-result",
  "evidence": "finding:f-123 verdict:confirmed 依据:重放 200 且 marker 命中",
  "gate_anchor": "{\"gate_v\":{\"category_anchor\":\"xss\",\"marker_hit\":\"dom\",\"evidence\":[\"finding:f-123\"],\"assertions\":[{\"type\":\"status\",\"value\":200},{\"type\":\"selector_exists\",\"selector\":\"#app h3 img\"},{\"type\":\"selector_value\",\"selector\":\"#search-q\",\"value\":\"golden\"}]}}"
}'
```

- `gate_v.assertions` 数组元素即 §① 的 DSL 对象(选择器型仅 CDP 通道可判定)。校验侧只锚定
  顶层 `gate_v` 键存在, 数组内容原文透传 — 传入坏断言不会 400, 由消费方 `parseAssertions`
  解析为 `__invalid__` MISS(不炸不假阳)。
- **消费接线现状(树上实况)**: validator 侧入口是 `validateFinding(q, finding, {assertions, level,
  runsBase, …})`(validator.js:851); 当前自动注入点 = `validateDifferential` 类别词表
  (validator.js:1008-1012)与 §④ G1 反射自动提取, `validateAll` 主环暂不带断言(loop.mjs:684)。
  把信号锚里的 `gate_v.assertions` 接进 `opts.assertions` 属消费方(调度环)读锚后透传 —
  锚"结构化优先、散文回退"语义遵循 docs/gate-anchor-schema.md §3。
- 判定回写: verified → `gate_status='verified'` + repro 追加 `replayed_response` 样本与
  `evidence:` 引用; MISS → `reached`/`quarantined`(§③), 全程 verified_log 留审计行。

## 测试

- `plugin/pentest-dsh/test/*.test.mjs`: parseAssertions/evaluateAssertions 纯函数单测(六型 +
  字符串兼容 + fail-safe), cdpReplay 录制(cdpDom/cdpPerf/navStatus/cdpSelectors), HAR sink
  (加密落盘/ENC=0/读回), CDP_HINT_RE 与通道档。
- 集成验收实跑(六型四型选择器型 + HAR 证据 + 双 chrome 合并):
  tests/golden-targets/spa-verify-acceptance.md(V1 validator 通道 / V2 DOM 执行级 / V3 WS 帧执行级)。

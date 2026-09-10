# OSINT 自动喂送(#49) 与 MITM 拦截面(#44)

## #49 OSINT 自动喂送 — `scripts/recon/autofeed.mjs`

指纹命中 → 测绘反查 → 资产回图的闭环守护。

```
图内 Endpoint.tech / Signal_(asset-finger)
  → 遴选「有高价值指纹 × 无 asset-perimeter 覆盖 × engagement scope 内 × 24h 未喂」的 host
  → ruleToDsl 按指纹规则生成测绘 DSL(domain 用命中它的 scope 条目钉死授权面)
  → mapping searchAll(四家聚合, size=SEARCH_BUDGET=50)
  → 资产按 scope 复筛 → graphd /write/signal 回写 Signal_(type=asset-perimeter, 带 endpoint_url 走 N2 AT 边)
```

- 运行: `node scripts/recon/autofeed.mjs --once | --watch`(watch 默认 30min 轮询, `D2D_OSINT_FEED_INTERVAL_MS` 可调)
- 高价值指纹: `fingerprint.mjs` 的 `OSINT_HIGH_VALUE_TAGS`(middleware/devops/ci/k8s/db/oa/erp 等), 命中带 `osintCandidate:true`
- 纪律: 无活跃 engagement → 整轮 fail-closed; host 不在 scope → 不喂; 测绘凭据全缺 → 静默跳过只记审计
- 限频: 每 host 24h 一次(`${D2D_DATA_DIR:-~/.d2d-data}/osint-feed-state.json`); 单轮预算 `D2D_OSINT_FEED_BUDGET`(默认 5 host)
- 审计: `~/.d2d-data/osint-feed-audit.jsonl`; 候选资产不自动入 scope — 人审门与 collect.mjs 一致
- 守护: `scripts/systemd/d2d-osint-feed.service`(Restart=on-failure)

## #44 MITM 拦截面 — `scripts/gateway/mitm-capture.mjs`(:8895)

egress-gateway(:8888) 之后的独立拦截面进程, worker 指向 `http_proxy=http://127.0.0.1:8895` 即接管。

| 开关 | 默认 | 语义 |
|---|---|---|
| `D2D_MITM` | 未启用 | `=1` 才启动(防误启动, systemd 单元内置) |
| `D2D_MITM_TLS` | `0`(CONNECT 直通) | `=1` 自签 CA(`~/.d2d-data/mitm/ca.{key,crt}`, key 0600)+ 按 host 动态叶子证书, 解密后明文进同一捕获管线 |
| `D2D_MITM_WSS` | `0` | `=1` ws/wss 握手入证据 + 帧级审计(opcode/方向/长度, 不解帧内容) |
| `D2D_MITM_RATE` | `100` | 全局令牌桶 req/s, 超限 503 |
| `D2D_MITM_FLUSH` | `20` | 每 N 笔事务聚合写一条 `Signal_(type=http-txn)`(走 /write 通道, graphd denylist 门兜底) |
| `D2D_MITM_BODY_CAP` | 262144 | 请求/响应体捕获上限(字节, 超限截断并标记) |

- 判定链: H14 硬黑面(复用 egress-gateway `isForbiddenTarget`) → scope(复用 pentest-dsh `domain/scope.mjs` hostAllowed) → denylist(R6.1 同源口径) → 限速 → 捕获
- 证据: 每笔事务原子落盘 `${D2D_DATA_DIR}/evidence/mitm/<eng>/<ts>-<seq>.json`(请求/响应头 + 体摘要)
- 探活: `curl http://127.0.0.1:8895/health`(仅回环目标短路)
- 守护: `scripts/systemd/d2d-mitm.service`; 安装均走 `scripts/systemd/install.sh`

## 测试

- `plugin/pentest-dsh/test/autofeed.test.mjs`: 指纹触发/遴选(scope×覆盖×限频)/DSL/端到端(mock graphd + 注入测绘)/预算/写图失败重试
- `plugin/pentest-dsh/test/mitm-capture.test.mjs`: HTTP 拦截头体完整/截断、非 scope 403、denylist 403、令牌桶 503、CONNECT 直通、CA/叶子 key 权限 0600、聚合入图、WSS 帧审计 tap

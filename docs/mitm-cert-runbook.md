# MITM 解密面证书 — 生成 / 分发 / 轮换 / 私钥保护

自签 CA 与按 host 叶子证书集中在共享模块 `scripts/gateway/tls-intercept.mjs`(`ensureCA`/`signLeaf`),
两个消费方共用同一套 CA 与目录: egress 解密面(4.5-1, `egress-gateway.mjs`, `D2D_EGRESS_MITM=1`)与
mitm TLS 拦截面(#44, `mitm-capture.mjs`, `D2D_MITM_TLS=1`)。命令以缺省数据根 `D2D_DATA_DIR=~/.d2d-data`
为例(CA 目录 = `<D2D_DATA_DIR>/mitm/`)。

| 开关 | 默认 | 语义 |
|---|---|---|
| `D2D_EGRESS_MITM` | 未启用(CONNECT 直通) | `=1` egress-gateway(:8888) 走解密分支 — 首个解密 CONNECT 懒触发 `startTlsIntercept → ensureCA`(`/health` 不触发) |
| `D2D_MITM` + `D2D_MITM_TLS` | `0`(直通) | mitm-capture(:8895) 先 `D2D_MITM=1` 启面, `D2D_MITM_TLS=1` 才开 TLS 拦截 — 进程启动即 `ensureCA()`(失败回退直通) |
| `D2D_DATA_DIR` | `~/.d2d-data` | 数据根; CA 目录在其下 `mitm/` |
| `D2D_MITM_CA_DIR` | `<D2D_DATA_DIR>/mitm` | 仅 mitm-capture 侧的 CA 目录覆盖(tls-intercept 缺省同源; egress 固定用 `dataDir/mitm`, 无独立覆盖) |
| `D2D_CA_BUNDLE` | 空 | 企业根证书 PEM(worker curl 侧), 与网关 CA 在 CURL_CA_BUNDLE 合并, 见② |

CA 目录布局:

```
<D2D_DATA_DIR>/mitm/
├── ca.key   0600  CA 私钥(RSA 2048) — 绝不外发/入库(见④)
├── ca.crt   0644  CA 证书(CN=d2d MITM CA/O=d2d, 3650 天) — 分发给一切要验解密面流量的客户端
├── ca.srl         序列号文件(签叶子时 openssl -CAcreateserial 自动生成)
└── leaves/        按 host 叶子证书(<host>.key 0600 + <host>.crt, SAN DNS/IP, 30 天)
```

## ① 证书生成 — `ensureCA`(scripts/gateway/tls-intercept.mjs)

| 触发条件 | 链路 |
|---|---|
| `D2D_EGRESS_MITM=1` | 首个解密 CONNECT → `egress-gateway.mjs` `startTlsIntercept` → `ensureCA(<dataDir>/mitm)`(懒触发; 失败审计 `mitm-init-error` 回退直通) |
| mitm `D2D_MITM=1` + `D2D_MITM_TLS=1` | mitm-capture 进程启动即 `ensureCA(CA_DIR)`(失败打日志回退直通); 叶子由 SNICallback → `signLeaf` 按 host 现签 |
| 手动预生成(推荐) | 下方命令 — doctor 的建议动作; worker 派发前就应有 CA(否则 worker 不注入, TLS 校验失败) |

- 幂等: `ca.key`+`ca.crt` 都在 → 直接复用不重签(`ensureCA` 首行短路); 缺任一 → 整体重生成。
- 手动预生成:

```bash
cd <d2d 仓库根>
node --input-type=module -e 'const { ensureCA } = await import("./scripts/gateway/tls-intercept.mjs"); console.log(ensureCA())'
```

- `ensureCA` 内部等价 openssl(RSA 2048 / SHA-256 / 3650 天 / 无口令; 写后强制 chmod, 目录 0700):

```bash
openssl req -x509 -newkey rsa:2048 -sha256 -days 3650 -nodes \
  -subj '/CN=d2d MITM CA/O=d2d' \
  -keyout ~/.d2d-data/mitm/ca.key -out ~/.d2d-data/mitm/ca.crt
chmod 600 ~/.d2d-data/mitm/ca.key && chmod 644 ~/.d2d-data/mitm/ca.crt
```

- 叶子证书等价 openssl(`signLeaf` 自动做; SAN 按 host 形态取 `DNS:<host>` 或 `IP:<host>`, 30 天, 叶子 key 0600):

```bash
openssl req -new -key leaves/<host>.key -subj "/CN=<host>" -out leaves/<host>.csr
printf 'subjectAltName=DNS:<host>\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n' > leaves/<host>.ext
openssl x509 -req -in leaves/<host>.csr -CA ca.crt -CAkey ca.key -CAcreateserial \
  -days 30 -sha256 -extfile leaves/<host>.ext -out leaves/<host>.crt
```

- 已知边界(实测): 解密模式下目标为裸 IP 时客户端(curl)不发 SNI → Node `SNICallback` 不触发、内部 TLS
  服务无默认证书 → 握手失败(alert handshake_failure)。该类目标用域名形态访问, 或临时关 `D2D_EGRESS_MITM` 走直通。

## ② 分发 — worker 侧零手工, 宿主侧两条命令

- adapter 自动注入(`adapter-dsh.mjs` spawnWorker 每次派发现查): `${D2D_DATA_DIR:-~/.d2d-data}/mitm/ca.crt`
  存在 → worker env 追加(纯信任追加, 不放宽任何校验):
  - Node 进程: `NODE_EXTRA_CA_CERTS=<ca.crt>`
  - curl: `CURL_CA_BUNDLE` 合并 — 原 bundle(来自 `D2D_CA_BUNDLE`)在前、网关 CA 追加在后; 无 bundle 时即 ca.crt
  - 缺 ca.crt → env 维持原值零改动(向后兼容), doctor 有 WARN 提示先跑①
- 生效时机: **下次派发的新 worker 自动带上**; 正在跑的 worker 不受影响(轮换后同理, 见③)。
- 宿主侧验证:

```bash
# 1) 经网关取一次解密面流量, 用网关 CA 校验(200 = 链路与证书都对)
curl -s --cacert ~/.d2d-data/mitm/ca.crt -x http://127.0.0.1:8888 \
  https://<scope 内域名>/ -w '\n[http %{http_code}]\n'
# 2) 看 issuer 应为 CN=d2d MITM CA;O=d2d, verify 应为 ok
curl -sv --cacert ~/.d2d-data/mitm/ca.crt -x http://127.0.0.1:8888 \
  https://<scope 内域名>/ -o /dev/null 2>&1 | grep -E 'issuer:|SSL certificate verify'
```

- 注意: `--cacert` 指向的文件不存在时 curl 直接报参数错误(连不上网关) — 先跑①; 宿主侧手动跑 Node 客户端
  需自行 `export NODE_EXTRA_CA_CERTS=~/.d2d-data/mitm/ca.crt`(doctor 检查项同款提示)。

## ③ 轮换

```bash
# 1) 停消费方(leafCache 在进程内存里, 必须重启才清; mitm 面 TLS 开着则一并停)
systemctl --user stop d2d-egress d2d-mitm
# 2) 删 CA + 序列号 + 叶子 —— leaves/ 必须一起删(原因见下)
rm -f  ~/.d2d-data/mitm/ca.key ~/.d2d-data/mitm/ca.crt ~/.d2d-data/mitm/ca.srl
rm -rf ~/.d2d-data/mitm/leaves
# 3) 重启 → ensureCA 自动重签(egress 懒触发于首个解密 CONNECT; 急用先跑①手动预生成)
systemctl --user start d2d-egress d2d-mitm
```

- **为什么必须删 `leaves/`**(signLeaf 实证): 落盘叶子文件存在即复用(tls-intercept.mjs `fs.existsSync(crtF)`
  短路) — 只删 CA 留 leaves 时, 新 CA × 旧叶子 → `openssl verify` FAIL(unable to get local issuer
  certificate) → 所有客户端对该 host 握手失败。
- worker: 下次派发自动带新 CA(spawnWorker 每次现查文件); 轮换窗口内旧 worker 对已换证书的 host 会校验
  失败, 等其自然结束或杀掉重派。
- **叶子 30 天有效且无自动续期**: 进程内 `leafCache`(键 `<caDir>|<host>`)不失效 + 落盘叶子存在即复用 →
  长驻网关 30 天后会对老 host 持续出已过期叶子。处置: 把"清 leaves/ + 重启"做成 ≤30 天周期的例行维护
  (可与 CA 轮换同窗执行)。
- CA 本体 3650 天, 轮换节奏运维自定(建议随企业凭据轮换窗口, ≤1 年)。

## ④ 私钥保护

- 权限是代码强制的, 不靠手工: `ensureCA` 写完即 `chmod 600 ca.key`(ca.crt 644, CA 目录 0700); 叶子
  `.key` 落盘即 0600。手工核对:

```bash
stat -c '%a %n' ~/.d2d-data/mitm/ca.key        # 期望 600
```

- doctor 检查项(`scripts/ops/doctor.mjs` §3.6, WARN 级不阻断):

| 检查项 | 条件 | 内容 |
|---|---|---|
| `egress 解密面 CA(D2D_EGRESS_MITM=1)` | D2D_EGRESS_MITM=1 | ca.crt 在 + ca.key 0600; 缺 → 提示先跑 ensureCA(需 openssl 在 PATH); 权限过宽 → 提示 `chmod 600` |
| `worker 证书注入条件(NODE_EXTRA_CA_CERTS)` | 恒跑(WARN) | 报告 ca.crt 存在性与 adapter-dsh 自动注入状态; 缺 → 提示 TLS 校验将失败 |
| `egress 解密面 CA` | 未启用时 | 提示 CONNECT 直通为默认, 解密面检查跳过 |

- 绝不入库(R3 数据外置): CA 在 `D2D_DATA_DIR`(默认 `~/.d2d-data`), 天然在仓库树外; `.gitignore` 双保险 —
  `.d2d-data/` 整目录忽略 + `*.key` 全局忽略。核对: `git check-ignore -v .d2d-data/mitm/ca.key`。
- 泄露处置: 即刻按③轮换(删文件 + 重启 = 旧 CA 作废, 私有 CA 仅本机信任面, 无需吊销列表)。

## 测试

- `plugin/pentest-dsh/test/gateway-mitm-merge.test.mjs`: ensureCA(ca.key 0600/幂等复用)/signLeaf(SAN
  DNS+IP, openssl verify 通过)/startTlsIntercept 实例; egress 解密 on-off、路径级 scope
- `plugin/pentest-dsh/test/mitm-capture.test.mjs`: CA/叶子 key 权限 0600 等既有面(#44)
- 合跑六文件(golden-spa / gateway-mitm-merge / rate-backoff / evidence-crypto / mitm-capture /
  egress-gateway)当前 76 passing 全绿

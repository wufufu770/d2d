#!/usr/bin/env node
// tls-intercept.mjs — TLS 拦截共享模块(4.5-1 网关 MITM 合并: 自包含可移植, 从 mitm-capture.mjs 原样抽出)。
// 消费方: ①mitm-capture.mjs(D2D_MITM_TLS=1 的 CONNECT 解密回环) ②egress-gateway.mjs(D2D_EGRESS_MITM=1
//   的 CONNECT 解密分支) — 两文件 CONNECT 形态同源, TLS 面合并到此处, mitm→egress 的单向依赖不再增长。
// 导出面:
//   ensureCA(dir, onAudit)        openssl 自签 CA → dir/ca.key(0600)+ca.crt(0644), 幂等(已存在直接复用)
//   signLeaf(host, dir, onAudit)  按 host 动态签叶子证书(SAN DNS/IP, 30 天), leafCache 按 <caDir>|<host> 缓存
//   tlsSrvPort(handler, opts)     进程级单例内部 https 服务(SNICallback 动态选证书, listen(0) 回环) — mitm 兼容面
//   startTlsIntercept({...})      ensureCA + 独立内部 https 服务实例 → { port(), server, caDir } — egress 解密分支入口
// 抽出即原样: 判定逻辑/openssl 参数/文件布局与 mitm-capture 原实现逐字节一致(零行为变化);
// 唯一差异是 audit 事件(ca-created / leaf-sign-error)经 onAudit 注入 — mitm-capture 注入自身 audit,
// 事件仍落 mitm-audit.jsonl; 默认 no-op(独立使用时不落盘)。
// leafCache 按 <caDir>|<host> 而非裸 host: mitm 原实现单进程单 CA_DIR, 键等价; 同进程多 CA(测试双网关
// 共存等场景)下裸 host 键会把 A 目录签的证书串给 B 目录 — 按目录隔离, 单 CA 场景行为不变。
import https from 'node:https'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import tls from 'node:tls'
import { spawnSync } from 'node:child_process'

// 缺省 CA 目录: 与 mitm-capture 的 CA_DIR 同源(D2D_MITM_CA_DIR 优先, 兜底 D2D_DATA_DIR/mitm)。
// mitm/egress 调用都显式传目录, 此缺省仅供独立使用。
const DEFAULT_DATA_DIR = process.env.D2D_DATA_DIR ?? `${os.homedir()}/.d2d-data`
const DEFAULT_CA_DIR = process.env.D2D_MITM_CA_DIR ?? path.join(DEFAULT_DATA_DIR, 'mitm')

// host 归一(与 mitm-capture/egress-gateway 同口径: 剥方括号/zone-id/端口 + mapped v4 还原)
function normalizeHost(h) {
  let s = String(h ?? '').trim().toLowerCase().replace(/^\[/, '').replace(/\]$/, '').replace(/%[0-9a-z._-]+$/i, '').replace(/^([^:]+):\d+$/, '$1')
  const m = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (m) s = m[1]
  return s
}
// 文件名 sanitize(与 mitm-capture 同口径: 非法字符归 '_', 空值兜底 'default')
const sanitize = (s) => String(s ?? '').replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 60) || 'default'

// ---- 自签 CA(openssl): ca.key 0600 + ca.crt 0644, 已存在则幂等复用 ----
export function ensureCA(dir = DEFAULT_CA_DIR, onAudit = () => {}) {
  const caKey = path.join(dir, 'ca.key'), caCrt = path.join(dir, 'ca.crt')
  if (fs.existsSync(caKey) && fs.existsSync(caCrt)) return { caKey, caCrt }
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const r = spawnSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-sha256', '-days', '3650', '-nodes',
    '-subj', '/CN=d2d MITM CA/O=d2d', '-keyout', caKey, '-out', caCrt], { stdio: 'ignore' })
  if (r.status !== 0) throw new Error('openssl req CA 生成失败(需 openssl 在 PATH)')
  fs.chmodSync(caKey, 0o600)
  fs.chmodSync(caCrt, 0o644)
  onAudit({ event: 'ca-created', dir })
  return { caKey, caCrt }
}

// ---- 按 host 动态签叶子证书(SAN DNS/IP, 30 天), leafCache 按 <caDir>|<host> 缓存 ----
const leafCache = new Map()
export function signLeaf(host, dir = DEFAULT_CA_DIR, onAudit = () => {}) {
  const h = normalizeHost(host)
  const cacheKey = `${dir}|${h}`
  const hit = leafCache.get(cacheKey)
  if (hit) return hit
  const { caKey, caCrt } = ensureCA(dir, onAudit)
  const leafDir = path.join(dir, 'leaves')
  fs.mkdirSync(leafDir, { recursive: true })
  const keyF = path.join(leafDir, `${sanitize(h)}.key`), crtF = path.join(leafDir, `${sanitize(h)}.crt`)
  if (!fs.existsSync(crtF)) {
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } })
    fs.writeFileSync(keyF, privateKey, { mode: 0o600 })
    const csrF = path.join(leafDir, `${sanitize(h)}.csr`), extF = path.join(leafDir, `${sanitize(h)}.ext`)
    fs.writeFileSync(csrF, '') // 占位防 spawn 失败残留脏文件判定
    const isIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(h)
    const san = isIp ? `IP:${h}` : `DNS:${h}`
    fs.writeFileSync(extF, `subjectAltName=${san}\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n`)
    const csr = spawnSync('openssl', ['req', '-new', '-key', keyF, '-subj', `/CN=${h}`, '-out', csrF], { stdio: 'ignore' })
    const x509 = spawnSync('openssl', ['x509', '-req', '-in', csrF, '-CA', caCrt, '-CAkey', caKey, '-CAcreateserial', '-days', '30', '-sha256', '-extfile', extF, '-out', crtF], { stdio: 'ignore' })
    fs.rmSync(csrF, { force: true }); fs.rmSync(extF, { force: true })
    if (csr.status !== 0 || x509.status !== 0) throw new Error(`openssl 叶子证书签发失败: ${h}`)
  }
  const ctx = tls.createSecureContext({ key: fs.readFileSync(keyF), cert: fs.readFileSync(crtF) })
  leafCache.set(cacheKey, ctx)
  return ctx
}

// ---- 内部 https 服务(SNI 动态证书, listen(0) 回环): CONNECT 隧道回环至此解密 ----
function createInterceptServer({ caDir, handler, onAudit = () => {}, onUpgrade = null }) {
  const srv = https.createServer({
    SNICallback: (servername, cb) => {
      try { cb(null, signLeaf(servername, caDir, onAudit)) } catch (e) { onAudit({ event: 'leaf-sign-error', host: String(servername).slice(0, 60), error: String(e.message ?? e).slice(0, 120) }); cb(e) }
    },
  }, (req, res) => { handler(req, res) })
  if (onUpgrade) srv.on('upgrade', onUpgrade)
  srv.listen(0, '127.0.0.1')
  return srv
}

// ---- mitm 兼容面: 进程级单例(与原 mitm-capture.tlsSrvPort 相同的缓存语义), 返回回环端口 ----
let _tlsSrv = null
export function tlsSrvPort(handler, opts = {}) {
  if (_tlsSrv) return _tlsSrv.address().port
  _tlsSrv = createInterceptServer({
    caDir: opts.caDir ?? DEFAULT_CA_DIR,
    handler,
    onAudit: opts.onAudit,
    onUpgrade: opts.onUpgrade,
  })
  return _tlsSrv.address().port
}
export { _tlsSrv }

// ---- egress 解密分支入口: ensureCA 预生成(失败抛错 → 调用方回退直通) + 独立内部 TLS 服务实例 ----
// 与 tlsSrvPort 单例面隔离(同进程 mitm/egress 并存时各用各的实例); 返回 { port(), server, caDir }。
// async: 等 'listening' 再返回(Node ≥ 某版本 listen() 后 address() 立即读是 null) — port() 因此在
// 返回后即可同步取号; 与 tlsSrvPort 兼容面(同步语义, 保留原 mitm 行为含此怪癖)刻意不同。
export async function startTlsIntercept({ dataDir, caDir, handler, onAudit, onUpgrade } = {}) {
  const dir = caDir ?? path.join(dataDir ?? DEFAULT_DATA_DIR, 'mitm')
  ensureCA(dir, onAudit)
  const server = createInterceptServer({ caDir: dir, handler, onAudit, onUpgrade })
  if (!server.listening) await new Promise((resolve) => server.once('listening', resolve))
  return { caDir: dir, server, port: () => server.address().port }
}

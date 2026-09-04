// interactsh-client.mjs — #58 projectdiscovery interactsh 客户端(真实协议实现, stdlib-only)
// ── 采用的握手约定(注释为准, 保证与本仓库自带 mock 自洽)────────────────────────
//  1. createSession(): 生成 RSA-2048 密钥对 + 随机 AES-256 secret key。
//  2. GET {server}/public-key → { "public-key": base64(SPKI DER) }  // 服务端密钥交换
//  3. register: POST {server}/register  body JSON:
//       { "public-key":  base64(客户端 SPKI DER),              // 用于服务端回执/审计
//         "secret-key":  base64(RSA-OAEP-SHA256(serverPub, aesKey)), // AES key 用**服务端**公钥封,
//         "correlation-id": <cid> }                                  //   服务端可解密用于后续加密交互记录
//  4. poll: GET {server}/poll?id=<cid>  → { data: [ base64(iv(12B) || AES-256-GCM(ct+tag)) ] }
//     客户端用 aesKey 逐条解密 → { protocol, host, remote, timestamp }。
//  5. close: DELETE {server}/unregister?id=<cid> (尽力而为)。
// 注意: 与官方 oast.pro 的字段/加密细节兼容性需实测(官方为 RSA-OAEP 加密注册体的变体);
// 上述约定在 plugin/pentest-dsh/test/integrations-interactsh.test.mjs 的 mock 服务端全流程验证。
// 默认 server=https://oast.pro 但 **默认不连网** — 仅显式调用 createSession() 才发请求。
import crypto from 'node:crypto'

const DEFAULT_SERVER = 'https://oast.pro'
// 复审#14: randomBytes % 36 有取模偏置(前 8 个字符概率高 1/219) → 改 base64url
// 无偏采样后截断(base64url 正是子域安全字符集, 43B 熵源 ≥ 20B 输出)
const genCid = (len = 20) => crypto.randomBytes(32).toString('base64url').slice(0, len)

export class InteractshClient {
  // fetchImpl 注入: 默认全局 fetch(仅显式使用时才真正出网)
  constructor({ server = DEFAULT_SERVER, fetchImpl = fetch } = {}) {
    this.server = server.replace(/\/+$/, '')
    this.fetchImpl = fetchImpl
    this.cid = null
    this.rsa = null // 客户端 RSA 密钥对 { publicKey, privateKey }(懒生成, 见 _ensureRsa)
    this._rsaPromise = null
    this.aesKey = null
  }

  // 复审#14: RSA-2048 keygen 昂贵(数百 ms) → 懒生成: 首次真正需要注册时才做,
  // 之后复用; 失败允许下次重试。构造函数保持零开销。
  _ensureRsa() {
    if (!this._rsaPromise) {
      this._rsaPromise = Promise.resolve(crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }))
      this._rsaPromise.catch(() => { this._rsaPromise = null })
    }
    return this._rsaPromise
  }

  // 建会话: 密钥交换 → 注册 → 返回唯一子域 <cid>.<server-domain>
  async createSession() {
    this.cid = genCid()
    this.aesKey = crypto.randomBytes(32)
    const pkRes = await this.fetchImpl(`${this.server}/public-key`)
    if (!pkRes.ok) throw new Error(`#58 interactsh 密钥交换失败: HTTP ${pkRes.status}`)
    const pkBody = await pkRes.json()
    const serverPub = crypto.createPublicKey({ key: Buffer.from(pkBody['public-key'], 'base64'), format: 'der', type: 'spki' })
    // RSA 懒生成: 密钥交换成功、确实要注册时才 keygen
    this.rsa = await this._ensureRsa()
    const encAes = crypto.publicEncrypt(
      { key: serverPub, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' },
      this.aesKey,
    )
    const res = await this.fetchImpl(`${this.server}/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        'public-key': this.rsa.publicKey.export({ type: 'spki', format: 'der' }).toString('base64'),
        'secret-key': encAes.toString('base64'),
        'correlation-id': this.cid,
      }),
    })
    if (!res.ok) throw new Error(`#58 interactsh 注册失败: HTTP ${res.status}`)
    const domain = this.server.replace(/^https?:\/\//, '')
    return `${this.cid}.${domain}`
  }

  // 轮询并解密交互记录: 每条 data = base64(iv(12B) || AES-256-GCM(json+tag))
  async poll() {
    if (!this.cid) throw new Error('#58 未建会话, 先 createSession()')
    const res = await this.fetchImpl(`${this.server}/poll?id=${encodeURIComponent(this.cid)}`)
    if (!res.ok) throw new Error(`#58 interactsh 轮询失败: HTTP ${res.status}`)
    const body = await res.json()
    return (body.data ?? []).map((b64) => {
      const raw = Buffer.from(b64, 'base64')
      const iv = raw.subarray(0, 12)
      const ct = raw.subarray(12)
      const tag = ct.subarray(ct.length - 16)
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.aesKey, iv)
      decipher.setAuthTag(tag)
      const json = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]).toString('utf8')
      const rec = JSON.parse(json)
      return { protocol: rec.protocol, host: rec.host, remote: rec.remote, timestamp: rec.timestamp }
    })
  }

  // 注销(尽力而为, 失败静默)
  async close() {
    if (!this.cid) return
    try {
      await this.fetchImpl(`${this.server}/unregister?id=${encodeURIComponent(this.cid)}`, { method: 'DELETE' })
    } catch {}
    this.cid = null
  }
}

export { DEFAULT_SERVER }

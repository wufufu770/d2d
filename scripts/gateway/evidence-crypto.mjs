#!/usr/bin/env node
// evidence-crypto.mjs — T2-2b-1 证据存储加密(静态面): MITM/网关事务证据落盘前的对称加密壳。
// 威胁面(审计实证): mitm 事务文件含完整 req/res 头(Cookie/Authorization 明文落盘零脱敏) —
// 落盘即敏感资产(at-rest), 本模块让"写盘路径只有密文, 内存明文写后即弃"。
// 密钥: KEK = SHA-256(host-token 文件 64-hex 原文) 派生 32 字节 — 绝不写死任何密钥字面量;
//   读 ~/.config/d2d/host-token(消费方), env D2D_EVIDENCE_KEY_FILE 可重定向(测试/多机)。
// 落盘格式: 单行 JSON {v:1,alg:'aes-256-gcm',iv,tag,ct}(iv/tag/ct 均 base64), 随机 12 字节 IV,
//   aes-256-gcm 认证加密(错密钥/被篡改在读取时抛错, 不返回部分明文)。node:crypto 原生, 零依赖。
// 降级开关: env D2D_EVIDENCE_ENC=0 → createEvidenceSink 退回明文直通(字节格式 = mitm-capture
//   captureTxn 既有 pretty 2 空格 JSON, 供回归/显式降级); 默认(不设/其他值)一律加密。
//   egress 的新增捕获面在 ENC=0 时整体跳过(明文面永不新增, 见 egress-gateway.mjs mitmEncCapture)。
// 原子写: 与 mitm-capture 同口径 tmp+rename(tmp 名 <file>.<pid>.tmp), 落盘无 .tmp 残留。
import crypto from 'node:crypto'
import fs from 'node:fs'

const HEX64 = /^[0-9a-fA-F]{64}$/

// 密钥派生: 读密钥文件 → trim → 必须 64-hex(host-token 形态) → SHA-256(原文 utf8) → 64-hex KEK。
// 文件缺失/不可读/形态不对 → 抛错(fail-closed: 调用方拒写, 绝不降级明文)。
export function keyFromFile(file) {
  let raw = ''
  try { raw = fs.readFileSync(file, 'utf8').trim() } catch (e) { throw new Error(`evidence-crypto: 密钥文件不可读: ${file}: ${String(e?.message ?? e).slice(0, 80)}`) }
  if (!HEX64.test(raw)) throw new Error(`evidence-crypto: 密钥文件不是 64-hex 形态(host-token 形态): ${file}`)
  return crypto.createHash('sha256').update(raw, 'utf8').digest('hex')
}

// 原子写(tmp+rename), 返回最终路径。密文/明文都走这里, 落盘无 .tmp 残留。
function atomicWrite(file, data) {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
  return file
}

// 证据 sink: write(obj, file) → {file}。obj 序列化即加密, 明文串不驻留模块态(函数局部量, 写后即弃)。
export function createEvidenceSink({ keyHex, dir } = {}) {
  if (process.env.D2D_EVIDENCE_ENC === '0') {
    // 显式降级明文直通: 保留 mitm-capture captureTxn 既有字节格式(JSON.stringify(obj, null, 2)),
    // 供既有测试/运维回归; 此路不要求密钥(无密钥可用也要能落盘 = 显式选择明文的运维责任)。
    return { enc: false, write: (obj, file) => ({ file: atomicWrite(file, JSON.stringify(obj, null, 2)) }) }
  }
  if (!dir) throw new Error('evidence-crypto: dir 缺失')
  if (!HEX64.test(String(keyHex ?? ''))) throw new Error('evidence-crypto: keyHex 缺失或非 64-hex — fail-closed 拒写')
  const key = Buffer.from(keyHex, 'hex')
  return {
    enc: true,
    write(obj, file) {
      const iv = crypto.randomBytes(12)
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv)
      const ct = Buffer.concat([cipher.update(JSON.stringify(obj), 'utf8'), cipher.final()])
      const tag = cipher.getAuthTag()
      const payload = JSON.stringify({ v: 1, alg: 'aes-256-gcm', iv: iv.toString('base64'), tag: tag.toString('base64'), ct: ct.toString('base64') })
      return { file: atomicWrite(file, payload) }
    },
  }
}

// 读回: 校验形态 + GCM 认证标签 — 错密钥/篡改在 final() 抛错, 绝不返回部分明文。
export function readEvidenceFile(file, keyHex) {
  if (!HEX64.test(String(keyHex ?? ''))) throw new Error('evidence-crypto: keyHex 缺失或非 64-hex')
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  if (payload?.v !== 1 || payload?.alg !== 'aes-256-gcm' || !payload?.iv || !payload?.tag || !payload?.ct) {
    throw new Error('evidence-crypto: 非法证据文件形态(缺 v/alg/iv/tag/ct)')
  }
  const d = crypto.createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(payload.iv, 'base64'))
  d.setAuthTag(Buffer.from(payload.tag, 'base64'))
  const pt = Buffer.concat([d.update(Buffer.from(payload.ct, 'base64')), d.final()]) // 认证失败在此抛错
  return JSON.parse(pt.toString('utf8'))
}

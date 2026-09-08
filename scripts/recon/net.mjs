// net.mjs — 零依赖 DNS A 记录解析器(P1/M2 资产收集引擎): RFC1035 最小子集。
// 设计: buildQuery/parseARecords 纯函数(单测锁包格式), queryA 走 dgram UDP 单发,
// resolveBatch 并发池 + 失败换 NS 重试 + 泛解析剪枝(同 IP 命中数超阈的 IP 列入泛解析嫌疑,
// 只解析到嫌疑 IP 的子域剪掉 — OneForAll ip_appear_maximum 思路, 阈值默认 100)。
import dgram from 'node:dgram'

const TYPE_A = 1
const CLASS_IN = 1

// ---- 纯函数: 构造标准查询(ID, RD=1, 1 question, A/IN) ----
export function buildQuery(name, id = 0x2d2d) {
  const labels = String(name).replace(/\.$/, '').split('.')
  const parts = [Buffer.from([(id >> 8) & 0xff, id & 0xff, 0x01, 0x00, 0, 1, 0, 0, 0, 0, 0, 0])]
  for (const label of labels) {
    const b = Buffer.from(label, 'utf8')
    if (b.length === 0 || b.length > 63) throw new Error(`DNS label 非法: ${label.slice(0, 20)}`)
    parts.push(Buffer.from([b.length]), b)
  }
  parts.push(Buffer.from([0x00, 0x00, TYPE_A, 0x00, CLASS_IN]))
  return Buffer.concat(parts)
}

// 域名压缩指针/标签链跳过 → 返回偏移
function skipName(buf, off) {
  for (;;) {
    if (off >= buf.length) throw new Error('DNS 包截断(name)')
    const len = buf[off]
    if (len === 0) return off + 1
    if ((len & 0xc0) === 0xc0) return off + 2 // 指针
    off += 1 + len
  }
}

// ---- 纯函数: 解析响应 → {rcode, ips[]} — 只认 A 记录(4 字节), 其他类型跳过 ----
export function parseARecords(buf) {
  if (buf.length < 12) throw new Error('DNS 包过短')
  const flags = buf.readUInt16BE(2)
  if ((flags & 0x8000) === 0) throw new Error('DNS 响应不支持查询包') // QR 位=0 是查询不是响应
  const rcode = flags & 0x0f
  const qd = buf.readUInt16BE(4)
  const an = buf.readUInt16BE(6)
  let off = 12
  for (let i = 0; i < qd; i++) off = skipName(buf, off) + 4
  const ips = []
  for (let i = 0; i < an && off + 10 <= buf.length; i++) {
    off = skipName(buf, off)
    const type = buf.readUInt16BE(off)
    const rdlen = buf.readUInt16BE(off + 8)
    off += 10
    if (off + rdlen > buf.length) throw new Error('DNS 包截断(answer)')
    if (type === TYPE_A && rdlen === 4) {
      ips.push(`${buf[off]}.${buf[off + 1]}.${buf[off + 2]}.${buf[off + 3]}`)
    }
    off += rdlen
  }
  return { rcode, ips }
}

// ---- 单查询: 单 UDP 发 + 超时; 语义 NXDOMAIN(rcode 3) 与无记录都归 [] ----
export function queryA(name, server, { timeoutMs = 3000, id = undefined } = {}) {
  const host = server.replace(/:\d+$/, '')
  const port = Number(server.match(/:(\d+)$/)?.[1] ?? 53)
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    const buf = buildQuery(name, id)
    const timer = setTimeout(() => { socket.close(); reject(new Error(`dns timeout: ${name}@${server}`)) }, timeoutMs)
    socket.on('message', (msg) => {
      clearTimeout(timer)
      socket.close()
      try { resolve(parseARecords(msg)) } catch (e) { reject(e) }
    })
    socket.on('error', (e) => { clearTimeout(timer); try { socket.close() } catch {} ; reject(e) })
    socket.send(buf, port, host, (err) => { if (err) { clearTimeout(timer); try { socket.close() } catch {} ; reject(err) } })
  })
}

// 纯函数: 泛解析剪枝 — 统计各 IP 命中的子域数, 超阈 IP 视为泛解析; 只解析到嫌疑 IP 的子域剔除。
// 返回 {wildcardIps:Set, pruned: Map(sub→ips)(剪枝后)}
export function pruneWildcard(resolved, { threshold = 100 } = {}) {
  const ipCount = new Map()
  for (const ips of resolved.values()) for (const ip of new Set(ips)) ipCount.set(ip, (ipCount.get(ip) ?? 0) + 1)
  const wildcardIps = new Set([...ipCount.entries()].filter(([, c]) => c > threshold).map(([ip]) => ip))
  const pruned = new Map()
  for (const [sub, ips] of resolved) {
    const keep = ips.filter((ip) => !wildcardIps.has(ip))
    if (keep.length) pruned.set(sub, keep)
  }
  return { wildcardIps, pruned }
}

// ---- 纯函数: 字典词 → 候选子域; 多 base 域选前 N 个(公司模式的耗时护栏) ----
export function candidateSubs(words, base) {
  const b = String(base ?? '').toLowerCase().replace(/\.$/, '')
  if (!b) return []
  return [...new Set((words ?? []).map((w) => String(w).trim().toLowerCase()).filter(Boolean).map((w) => `${w}.${b}`))]
}

export function selectBases(domains, cap = 3) {
  return [...new Set((domains ?? []).map((d) => String(d).toLowerCase().trim()).filter(Boolean))].slice(0, cap)
}

// ---- 并发批解析: 失败换下一个 NS 重试(retries 轮); 返回 Map(sub → 去重 ips) ----
export async function resolveBatch(subs, servers, { concurrency = 200, retries = 2, timeoutMs = 3000, onProgress = null } = {}) {
  const list = [...subs]
  const resolved = new Map()
  let done = 0
  async function worker() {
    for (;;) {
      const sub = list.shift()
      if (sub === undefined) return
      const ips = new Set()
      for (let attempt = 0; attempt <= retries; attempt++) {
        const server = servers[attempt % Math.max(servers.length, 1)]
        if (!server) break
        try {
          const { rcode, ips: found } = await queryA(sub, server, { timeoutMs })
          if (rcode === 3) break // NXDOMAIN — 换 NS 也一样, 不浪费重试
          for (const ip of found) ips.add(ip)
          if (ips.size) break
        } catch { /* 超时/网络 — 换 NS 重试 */ }
      }
      if (ips.size) resolved.set(sub, [...ips])
      done++
      if (onProgress && done % 500 === 0) onProgress(done, list.length)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, list.length)) }, worker))
  return resolved
}

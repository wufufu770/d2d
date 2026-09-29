// tests/golden-targets/spa/spa-server.mjs — 黄金 SPA 靶场服务端(4.5-0)
// 纯 node:http + node:crypto + node:fs, 零 npm 依赖(仓内零依赖约定, 不引 express/ws)。
// ⚠️ 故意漏洞靶场: 仅绑定 127.0.0.1, 仅用于本地安全演练 / 浏览器环 golden 验证, 禁止暴露到任何外部网络。
//
// 三个故意漏洞(客户端面见 public/app.js 头注释, golden truth 见 tests/golden-targets/baseline.md):
//   V1 未鉴权管理接口: GET /api/admin/stats 无任何鉴权 — 前端路由守卫只查 localStorage token 存在(摆设),
//      直接 `curl http://127.0.0.1:8894/api/admin/stats` 即 200 → HTTP 工具面可见。
//   V2 搜索回显 DOM XSS 载体: GET /api/search?q= 将 q 原样回显(不过滤不转义),
//      前端 app.js 用 innerHTML 渲染结果 → 预期利用路径: #/search?q=<img src=x onerror=alert(1)>
//      (HTTP 工具面只能拿到静态壳, 属浏览器环盲区)。
//   V3 WebSocket 注入 DOM XSS 载体: /ws 将收到的文本帧 payload 原样广播转发(不过滤不转义),
//      前端 app.js 用 innerHTML 渲染 WS 消息 → 预期利用路径: 任意第二个 WS 客户端发送
//      <img src=x onerror=alert(1)> 即在所有在线页面注入执行(WS 帧交互无法用 curl 表达, 盲区)。
//
// 用法: node tests/golden-targets/spa/spa-server.mjs
//   env: D2D_SPA_PORT(默认 8894)  D2D_SPA_SECRET(JWT HS256 密钥; 缺省随机生成, 启动时只打印首 8 位)
// 导出: createSpaServer({ port, host, secret }) — port:0 注入随机端口, 供
//       plugin/pentest-dsh/test/golden-spa.test.mjs 在测试内起停(零持久状态)。

import http from 'node:http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const DEFAULT_PORT = 8894
const DEFAULT_HOST = '127.0.0.1' // 故意漏洞靶场: 硬绑定回环, 不提供 0.0.0.0 选项
const MAX_BODY = 1 << 20 // 1MB 请求体上限
const MAX_FRAME = 1 << 20 // 1MB 单 WS 帧上限
const WS_GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PUBLIC_DIR = path.join(__dirname, 'public')

// 静态文件 Content-Type 白名单: 白名单外扩展名一律 404(不做目录列举)。
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
}

// ---- JWT(HS256) ----
function b64urlJson(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8').toString('base64url')
}
function hmac(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('base64url')
}
function jwtIssue(secret, sub) {
  const now = Math.floor(Date.now() / 1000)
  const head = b64urlJson({ alg: 'HS256', typ: 'JWT' })
  const body = b64urlJson({ sub, role: 'user', iat: now, exp: now + 3600 }) // 1h 有效期
  return `${head}.${body}.${hmac(secret, `${head}.${body}`)}`
}
function jwtVerify(secret, token) {
  if (typeof token !== 'string') return null
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, body, sig] = parts
  const expect = hmac(secret, `${head}.${body}`)
  const a = Buffer.from(sig)
  const b = Buffer.from(expect)
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null
  let header
  let payload
  try {
    header = JSON.parse(Buffer.from(head, 'base64url').toString('utf8'))
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
  } catch {
    return null
  }
  if (header.alg !== 'HS256') return null
  if (typeof payload.exp !== 'number' || payload.exp <= Math.floor(Date.now() / 1000)) return null
  return payload
}

// 靶场笔记数据(静态)
const NOTES = [
  { id: 1, title: '演练纪律', body: '仅打 127.0.0.1 上的 golden 靶场, 禁止出网。' },
  { id: 2, title: 'V1 提示', body: 'GET /api/admin/stats 试试有没有鉴权?' },
  { id: 3, title: 'V2/V3 提示', body: 'HTTP 工具面探测不到的两个洞, 在浏览器环里。' },
]
// 搜索语料(静态; q 本身不入库, 仅原样回显 — V2 载体)
const SEARCH_CORPUS = [
  { title: 'golden-targets 使用说明', snippet: 'SPA 靶场仅监听 127.0.0.1, 供浏览器环 golden 验证。' },
  { title: 'DVWA SQLi 模块', snippet: '/vulnerabilities/sqli/ 经典联合查询注入。' },
  { title: 'DOM XSS 复习', snippet: 'innerHTML 渲染不可信数据是经典 DOM XSS 源(sink)。' },
  { title: 'WebSocket 安全复习', snippet: 'WS 消息应按不可信输入处理, 转义后再进 DOM。' },
]

function json(res, code, obj) {
  const data = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': data.length,
    'Cache-Control': 'no-store',
  })
  res.end(data)
}
function notFound(res, msg) {
  json(res, 404, { error: msg || 'not found' })
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > MAX_BODY) {
        reject(new Error('body too large'))
        req.destroy()
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// ---- WS 最小帧编解码(RFC6455 子集) ----
function encodeFrame(opcode, payload) {
  const b0 = 0x80 | opcode // FIN=1
  const len = payload.length
  let header
  if (len < 126) {
    header = Buffer.from([b0, len])
  } else if (len < 65536) {
    header = Buffer.alloc(4)
    header[0] = b0
    header[1] = 126
    header.writeUInt16BE(len, 2)
  } else {
    header = Buffer.alloc(10)
    header[0] = b0
    header[1] = 127
    header.writeBigUInt64BE(BigInt(len), 2)
  }
  return Buffer.concat([header, payload]) // 服务端→客户端帧不掩码(RFC6455 要求)
}
function unmask(payload, maskKey) {
  const out = Buffer.allocUnsafe(payload.length)
  for (let i = 0; i < payload.length; i++) out[i] = payload[i] ^ maskKey[i % 4]
  return out
}
// 解析客户端帧流(逐帧消费, 返回未消费残余缓冲); 客户端→服务端帧必须带掩码。
// deps: { broadcast(payload), sendFrame(socket, opcode, payload), onClose(socket) }
function consumeFrames(socket, buf, deps) {
  const { broadcast, sendFrame, onClose } = deps
  for (;;) {
    if (buf.length < 2) return buf
    const b0 = buf[0]
    const b1 = buf[1]
    const opcode = b0 & 0x0f
    const masked = (b1 & 0x80) !== 0
    let len = b1 & 0x7f
    let off = 2
    if (len === 126) {
      if (buf.length < 4) return buf
      len = buf.readUInt16BE(2)
      off = 4
    } else if (len === 127) {
      if (buf.length < 10) return buf
      const big = buf.readBigUInt64BE(2)
      if (big > BigInt(MAX_FRAME)) {
        socket.destroy()
        return Buffer.alloc(0)
      }
      len = Number(big)
      off = 10
    }
    let maskKey = null
    if (masked) {
      if (buf.length < off + 4) return buf
      maskKey = buf.subarray(off, off + 4)
      off += 4
    }
    if (buf.length < off + len) return buf // 半帧: 留待下一个 data 事件
    let payload = buf.subarray(off, off + len)
    if (masked) payload = unmask(payload, maskKey)
    if (opcode === 0x1) {
      broadcast(payload) // 文本帧 → 原样广播(V3 载体: 不过滤不转义)
    } else if (opcode === 0x8) {
      sendFrame(socket, 0x8, payload) // close → 礼貌回 close
      onClose(socket)
      socket.end()
      return Buffer.alloc(0)
    } else if (opcode === 0x9) {
      sendFrame(socket, 0xa, payload) // ping → pong
    }
    // 0x2 binary / 0xA pong / 0x0 分片: 靶场最小实现, 忽略
    buf = buf.subarray(off + len)
  }
}

// ---- 服务实例 ----
export function createSpaServer({
  port = Number(process.env.D2D_SPA_PORT) || DEFAULT_PORT,
  host = DEFAULT_HOST,
  secret,
} = {}) {
  const JWT_SECRET = secret || process.env.D2D_SPA_SECRET || crypto.randomBytes(32).toString('hex')
  const clients = new Set() // 已升级的 WS socket
  const clientsDelete = (s) => clients.delete(s)

  function bearerPayload(req) {
    const h = req.headers.authorization || ''
    const m = /^Bearer\s+(.+)$/i.exec(h)
    return m ? jwtVerify(JWT_SECRET, m[1]) : null
  }

  function handleLogin(req, res) {
    readBody(req)
      .then((raw) => {
        let body
        try {
          body = JSON.parse(raw.toString('utf8') || '{}')
        } catch {
          return json(res, 400, { error: 'invalid json' })
        }
        const user = body.user ?? body.username
        const password = body.password
        // ⚠️ 靶场设定的故意宽松登录策略: user / admin 任意密码放行; demo 仅接受 password=demo
        const ok = user === 'user' || user === 'admin' || (user === 'demo' && password === 'demo')
        if (!ok) return json(res, 401, { error: 'invalid credentials' })
        json(res, 200, { token: jwtIssue(JWT_SECRET, String(user)), user: String(user) })
      })
      .catch(() => json(res, 400, { error: 'bad request' }))
  }

  function handleNotes(req, res) {
    const payload = bearerPayload(req)
    if (!payload) return json(res, 401, { error: 'unauthorized: 需要 Bearer JWT' })
    json(res, 200, { notes: NOTES, sub: payload.sub })
  }

  function handleStats(res) {
    // ⚠️ V1(故意漏洞): 无任何鉴权 — 即使带了鉴权头也不校验, HTTP 直接可达。
    json(res, 200, {
      service: 'golden-spa-target',
      uptime_s: Math.floor(process.uptime()),
      ws_connections: clients.size,
      notes: NOTES.length,
      warning: 'V1 故意漏洞: 本接口无鉴权, 前端路由守卫仅是客户端摆设',
    })
  }

  function handleSearch(res, url) {
    // ⚠️ V2(故意漏洞)载体: q 原样回显, 不过滤不转义(客户端 innerHTML 渲染即 DOM XSS)。
    const q = url.searchParams.get('q') ?? ''
    const needle = q.toLowerCase()
    const results = SEARCH_CORPUS.filter((item) =>
      `${item.title}${item.snippet}`.toLowerCase().includes(needle),
    )
    json(res, 200, { q, results })
  }

  function serveStatic(res, pathname) {
    let rel
    try {
      rel = decodeURIComponent(pathname)
    } catch {
      return notFound(res)
    }
    if (rel === '/') rel = '/index.html'
    const filePath = path.normalize(path.join(PUBLIC_DIR, rel))
    if (filePath !== PUBLIC_DIR && !filePath.startsWith(PUBLIC_DIR + path.sep)) {
      return notFound(res) // 路径穿越拒绝
    }
    const type = MIME[path.extname(filePath).toLowerCase()]
    if (!type) return notFound(res) // Content-Type 白名单外一律 404
    fs.readFile(filePath, (err, data) => {
      if (err) return notFound(res)
      res.writeHead(200, {
        'Content-Type': type,
        'Content-Length': data.length,
        'Cache-Control': 'no-store',
      })
      res.end(data)
    })
  }

  function handle(req, res) {
    let url
    try {
      url = new URL(req.url, 'http://localhost')
    } catch {
      return notFound(res)
    }
    const pathname = url.pathname
    if (pathname === '/api/login' && req.method === 'POST') return handleLogin(req, res)
    if (pathname === '/api/notes' && req.method === 'GET') return handleNotes(req, res)
    if (pathname === '/api/admin/stats' && req.method === 'GET') return handleStats(res) // V1
    if (pathname === '/api/search' && req.method === 'GET') return handleSearch(res, url) // V2 载体
    if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(res, pathname)
    return notFound(res)
  }

  function handleUpgrade(req, socket) {
    let pathname = '/'
    try {
      pathname = new URL(req.url, 'http://localhost').pathname
    } catch {
      /* fallthrough → 400 */
    }
    const key = req.headers['sec-websocket-key']
    const isWs = req.headers.upgrade && /websocket/i.test(String(req.headers.upgrade))
    if (pathname !== '/ws' || !key || !isWs) {
      socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }
    // RFC6455 握手: Sec-WebSocket-Accept = base64(SHA1(key + GUID))
    const accept = crypto.createHash('sha1').update(key + WS_GUID).digest('base64')
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Upgrade: websocket\r\n' +
        'Connection: Upgrade\r\n' +
        `Sec-WebSocket-Accept: ${accept}\r\n` +
        '\r\n',
    )
    socket.setNoDelay(true)
    clients.add(socket)
    let buf = Buffer.alloc(0)
    const sendFrame = (s, opcode, payload) => {
      if (s.writable) s.write(encodeFrame(opcode, payload))
    }
    // ⚠️ V3(故意漏洞)载体: 文本帧 payload 原样广播给全部在线客户端(含发送者回显), 不过滤不转义。
    const broadcast = (payload) => {
      const frame = encodeFrame(0x1, payload)
      for (const c of clients) {
        if (c !== socket && c.writable) c.write(frame)
      }
      if (socket.writable) socket.write(frame) // 发送者回显
    }
    socket.on('data', (chunk) => {
      buf = consumeFrames(socket, Buffer.concat([buf, chunk]), {
        broadcast,
        sendFrame,
        onClose: clientsDelete,
      })
    })
    const drop = () => clientsDelete(socket)
    socket.on('close', drop)
    socket.on('error', drop)
    // 客户端半关闭(FIN)时必须回 end() 完成 4 次挥手, 否则 socket 停在 CLOSE-WAIT,
    // server.close() 永不完成(且升级后的 socket 不在 closeAllConnections 的跟踪表里)。
    socket.on('end', () => {
      clientsDelete(socket)
      if (socket.writable) socket.end()
    })
  }

  const server = http.createServer(handle)
  server.on('upgrade', handleUpgrade)
  let listening = false
  let settled = false
  const ready = new Promise((resolve, reject) => {
    server.on('error', (err) => {
      if (!settled) {
        settled = true
        reject(err)
      } else {
        console.error('[spa] server error:', err.message)
      }
    })
    server.listen(port, host, () => {
      settled = true
      listening = true
      resolve()
    })
  })

  return {
    server,
    ready,
    get port() {
      const a = server.address()
      return a && typeof a === 'object' ? a.port : null
    },
    get secret() {
      return JWT_SECRET
    },
    async close() {
      for (const c of [...clients]) c.destroy()
      clients.clear()
      if (!listening) return
      await new Promise((resolve) => {
        server.close(() => resolve())
        // keep-alive 连接不随 close() 关闭, 显式断开保证 close() 可确定性返回(测试起停依赖)
        if (typeof server.closeAllConnections === 'function') server.closeAllConnections()
      })
    },
  }
}

// ---- main 入口: node tests/golden-targets/spa/spa-server.mjs ----
const isMain = Boolean(process.argv[1]) && import.meta.url === pathToFileURL(process.argv[1]).href
if (isMain) {
  const spa = createSpaServer()
  await spa.ready
  console.log(`[spa] golden SPA target: http://127.0.0.1:${spa.port} (pid ${process.pid})`)
  console.log(
    `[spa] JWT secret 首 8 位: ${spa.secret.slice(0, 8)}…(完整密钥不落盘; env D2D_SPA_SECRET 可固定)`,
  )
  console.log('[spa] 故意漏洞: V1 GET /api/admin/stats 无鉴权 | V2 /api/search?q= 原样回显+innerHTML | V3 /ws 原样广播+innerHTML')
  console.log('[spa] ⚠️ 仅限本地演练, 禁止暴露外部网络。')
}

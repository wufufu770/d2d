'use strict'
// tests/golden-targets/spa/public/app.js — 黄金 SPA 靶场前端(hash router + JWT 登录态)
// ⚠️ 故意漏洞客户端面(与 ../spa-server.mjs 头注释、tests/golden-targets/baseline.md 对应):
//   V1: renderAdmin 的路由守卫只查 localStorage 里 token 是否存在 — 纯客户端摆设;
//       服务器端 /api/admin/stats 本就不鉴权, 无 token 直接 curl 也是 200。
//   V2: renderSearch 用 innerHTML 渲染 /api/search 回显的 q →
//       预期利用路径: #/search?q=<img src=x onerror=alert(1)> 即 DOM XSS。
//   V3: WS onmessage 用 innerHTML 渲染广播消息 →
//       预期利用路径: 任意 /ws 客户端发 <img src=x onerror=alert(1)> 即注入所有在线页面。

const TOKEN_KEY = 'spa_token'
const $app = document.getElementById('app')
const $who = document.getElementById('who')
const $feed = document.getElementById('ws-feed')

const getToken = () => localStorage.getItem(TOKEN_KEY)
const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY))

// 安全渲染路径: textContent(仅用于非漏洞演示处; V2/V3 刻意走 innerHTML 漏洞路径)
function el(tag, className, text) {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

// ---- hash router: #/login #/notes #/admin #/search?q=... ----
function parseHash() {
  const raw = (location.hash || '#/login').slice(1)
  const qIdx = raw.indexOf('?')
  const path = qIdx === -1 ? raw : raw.slice(0, qIdx)
  const query = qIdx === -1 ? '' : raw.slice(qIdx + 1)
  return { path: path || '/login', params: new URLSearchParams(query) }
}

function refreshWho() {
  $who.textContent = getToken() ? '已登录(token 存在)' : '未登录'
}

function render() {
  refreshWho()
  const { path, params } = parseHash()
  if (path === '/login') return renderLogin()
  if (path === '/notes') return renderNotes()
  if (path === '/admin') return renderAdmin()
  if (path === '/search') return renderSearch(params)
  $app.replaceChildren(el('p', 'muted', `未知路由: ${path}`))
}
window.addEventListener('hashchange', render)

// ---- #/login: JWT 登录(fetch 异步表单) ----
function renderLogin() {
  const form = el('form', 'card')
  form.appendChild(el('h2', '', '登录(JWT)'))
  const userInput = el('input')
  userInput.id = 'login-user'
  userInput.placeholder = 'user / admin / demo'
  userInput.autocomplete = 'off'
  const passInput = el('input')
  passInput.type = 'password'
  passInput.id = 'login-pass'
  passInput.placeholder = 'user/admin 任意密码; demo 仅接受 demo'
  const btn = el('button', '', '登录')
  btn.type = 'submit'
  const msg = el('p', 'muted', '靶场设定: user / admin 任意密码放行; demo 仅接受 password=demo')
  form.append(el('label', '', '用户'), userInput, el('label', '', '密码'), passInput, btn, msg)
  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    msg.textContent = '登录中…'
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user: userInput.value, password: passInput.value }),
      })
      if (!res.ok) {
        msg.textContent = `登录失败 HTTP ${res.status}`
        return
      }
      const data = await res.json()
      setToken(data.token)
      msg.textContent = '登录成功, JWT 已写入 localStorage'
      refreshWho()
      location.hash = '#/notes'
    } catch (err) {
      msg.textContent = `网络错误: ${err.message}`
    }
  })
  $app.replaceChildren(form)
}

// ---- #/notes: JWT 鉴权接口 + 列表动态渲染(textContent, 安全路径) ----
async function renderNotes() {
  $app.replaceChildren(el('h2', '', '笔记(JWT 鉴权接口)'))
  const box = el('div', 'card')
  box.textContent = '加载中…'
  $app.appendChild(box)
  try {
    const headers = getToken() ? { Authorization: `Bearer ${getToken()}` } : {}
    const res = await fetch('/api/notes', { headers })
    if (res.status === 401) {
      box.textContent = '401 未鉴权 — 请先 #/login 获取 JWT。'
      return
    }
    const data = await res.json()
    box.replaceChildren(el('h3', '', '我的笔记'))
    for (const n of data.notes) {
      const item = el('div', 'note')
      item.appendChild(el('b', '', n.title))
      item.appendChild(el('p', '', n.body))
      box.appendChild(item)
    }
  } catch (err) {
    box.textContent = `网络错误: ${err.message}`
  }
}

// ---- #/admin: V1 客户端面(路由守卫只查 token 存在) ----
function renderAdmin() {
  $app.replaceChildren(el('h2', '', 'Admin 统计(V1: 服务端无鉴权)'))
  const box = el('div', 'card')
  if (!getToken()) {
    // ⚠️ V1 客户端面: 该守卫只是 localStorage 检查 — 服务端接口对无 token 请求照样 200。
    box.appendChild(el('p', 'warn', '路由守卫: localStorage 无 token, 拒绝渲染(纯客户端摆设)。'))
    box.appendChild(
      el('p', '', '但 /api/admin/stats 服务端不校验任何东西 — 直接 curl http://127.0.0.1:8894/api/admin/stats 即 200(V1)。'),
    )
    const a = el('a', '', '→ 去 #/login')
    a.href = '#/login'
    box.appendChild(a)
    $app.appendChild(box)
    return
  }
  box.textContent = '加载中…'
  fetch('/api/admin/stats') // 刻意不带 Authorization 头 — 服务器照样 200, 即 V1 的实证
    .then((r) => r.json())
    .then((data) => {
      box.replaceChildren(el('h3', '', '统计(本次 fetch 未带 Authorization, 服务器照样 200 — V1)'))
      for (const [k, v] of Object.entries(data)) box.appendChild(el('p', '', `${k}: ${v}`))
    })
    .catch((err) => {
      box.textContent = `网络错误: ${err.message}`
    })
  $app.appendChild(box)
}

// ---- #/search: V2 DOM XSS(结果 innerHTML 渲染) ----
function renderSearch(params) {
  $app.replaceChildren(el('h2', '', '搜索(V2: q 原样回显 + innerHTML 渲染)'))
  const form = el('form', 'card')
  const input = el('input')
  input.id = 'search-q'
  input.placeholder = '关键词, 如 golden'
  input.autocomplete = 'off'
  const btn = el('button', '', '搜索')
  btn.type = 'submit'
  form.append(input, btn)
  form.addEventListener('submit', (e) => {
    e.preventDefault()
    location.hash = `#/search?q=${encodeURIComponent(input.value)}`
  })
  $app.appendChild(form)
  const result = el('div', 'card')
  $app.appendChild(result)
  const q = params.get('q') ?? ''
  if (!q) {
    result.textContent = '在上方输入关键词, 或直接访问 #/search?q=<img src=x onerror=alert(1)>'
    return
  }
  fetch(`/api/search?q=${encodeURIComponent(q)}`)
    .then((r) => r.json())
    .then((data) => {
      // ⚠️ V2 故意漏洞: 服务端把 q 原样回显, 这里用 innerHTML 渲染 → DOM XSS。
      // 安全写法应为 textContent/转义 — 靶场刻意保留漏洞。data.results 是服务端静态语料(可控面只有 q)。
      result.innerHTML =
        `<h3>结果: ${data.q}</h3>` +
        `<ul>${data.results.map((r) => `<li><b>${r.title}</b> — ${r.snippet}</li>`).join('')}</ul>`
    })
    .catch((err) => {
      result.textContent = `网络错误: ${err.message}`
    })
}

// ---- WS 实时面板: V3 DOM XSS(广播消息 innerHTML 渲染) ----
function connectWs() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  let ws
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws`)
  } catch {
    return
  }
  const sys = (text) => {
    const d = el('div', 'ws-msg sys')
    d.textContent = `[sys] ${text}`
    $feed.appendChild(d)
  }
  ws.onopen = () => sys('已连接 /ws(广播消息 innerHTML 渲染 — V3)')
  ws.onclose = () => sys('连接断开')
  ws.onerror = () => sys('连接错误')
  // ⚠️ V3 故意漏洞: 广播消息原样 innerHTML 渲染 → 任意 WS 客户端发 <img src=x onerror=alert(1)> 即注入。
  ws.onmessage = (ev) => {
    $feed.insertAdjacentHTML('beforeend', `<div class="ws-msg">${ev.data}</div>`)
  }
  document.getElementById('ws-form').addEventListener('submit', (e) => {
    e.preventDefault()
    const input = document.getElementById('ws-input')
    if (ws.readyState === WebSocket.OPEN && input.value) ws.send(input.value)
    input.value = ''
  })
}

render()
connectWs()

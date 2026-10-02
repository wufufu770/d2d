// src/graphd-client.js — graphd 访问的**纯**辅助层（不接触 $）
// ⚠️ 硬约束（claude plugin validate 实证）：
//   mods API 的 $ 只允许在 hooks 模块内「同一文件声明的函数」之间传递，
//   绝不跨 import。因此本文件只做纯变换（拼 URL、拼 init、解析响应），
//   真正的 `await $.http.fetch(...)` 必须在 hooks/register.js 的调用点字面拼写。
// 端点契约与认证口径与 d2d 原样一致，见 docs/mods-port-plan.md §5。

export const DEFAULT_BASE_URL = 'http://127.0.0.1:8766'

// 拼出 graphd 的绝对 URL
export function buildUrl(baseUrl, pathname) {
  const base = String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '')
  return base + pathname
}

// 拼出 fetch 的 init（带 token 认证；有 body 则转 POST + JSON）
// 认证头必须是 `X-Auth`（graphd/app.py:472 `self.headers.get("X-Auth", "")`；实测
// `Authorization: Bearer` 恒 401，见 docs/mods-port-phase2-audit.md 补记）。
export function buildInit(token, body) {
  const headers = {}
  if (token) headers['X-Auth'] = token
  const init = { method: 'GET', headers }
  if (body !== undefined) {
    init.method = 'POST'
    headers['content-type'] = 'application/json'
    init.body = JSON.stringify(body)
  }
  return init
}

// 把 $.http.fetch 的返回规整为 { ok, status, data | error }。
// 官方示例把 response.text 直接当值用，这里同时兼容函数形态。
export async function decodeResponse(res) {
  const raw = typeof res?.text === 'function' ? await res.text() : (res?.text ?? '')
  if (!res?.ok) return { ok: false, status: res?.status ?? 0, error: String(raw) }
  try {
    return { ok: true, status: res.status, data: raw ? JSON.parse(raw) : null }
  } catch {
    return { ok: false, status: res.status, error: 'non-json response' }
  }
}

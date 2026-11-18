    // ══════════ api.js — 快照拉取 + 写端点(同源唯一通道, token 永不出 host) ══════════
    const badgeState = { workers: null, verified: null, approvals: null }
    // B11: badge 订阅面 — fetchSnapshot 更新后广播, 消费方 setState 订阅(裸读 mutation
    // 不触发 React 渲染, 之前靠 useWiSummary 的无关 setState 间接刷新——能用但脆弱)。
    const badgeListeners = new Set()
    function subscribeBadges(fn) {
      badgeListeners.add(fn)
      return () => badgeListeners.delete(fn)
    }
    function emitBadges() {
      const snap = { ...badgeState }
      for (const fn of badgeListeners) fn(snap)
    }

    async function fetchSnapshot(signal) {
      const r = await fetch('/d2d/api/snapshot', { signal, headers: { accept: 'application/json' } })
      // B11: 非 JSON 响应(代理 502 HTML 等)安全解析 — json() 抛错包装为 HTTP 状态错误
      const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }))
      if (!r.ok || !j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? `HTTP ${r.status}`))
      badgeState.workers = j?.agents?.filter((a) => a?.status === 'running' && !a?.zombie).length ?? null // badge=真存活(排除 zombie)
      badgeState.verified = j?.findings?.macro?.verified ?? null
      badgeState.approvals = j?.approvals?.pending ?? null // T3-3-2: 审批 tab badge(队列模块缺席→null 不挂)
      emitBadges()
      return j
    }

    /** 通用 GET 读取(T3-3-2 新 tab 数据面): 失败抛 Error(message 来自 host)。 */
    async function fetchApi(method, { signal } = {}) {
      const r = await fetch(`/d2d/api/${method}`, { signal, headers: { accept: 'application/json' } })
      const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }))
      if (!r.ok || !j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? `HTTP ${r.status}`))
      return j
    }

    /** 写端点(fleet 模型切换 / finding 人工裁决)。失败抛 Error(message 来自 host)。 */
    async function postJson(method, body, { signal } = {}) {
      const r = await fetch(`/d2d/api/${method}`, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }))
      if (!r.ok || !j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? `HTTP ${r.status}`))
      return j
    }

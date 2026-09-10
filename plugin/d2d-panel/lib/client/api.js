    // ══════════ api.js — 快照拉取 + 写端点(同源唯一通道, token 永不出 host) ══════════
    const badgeState = { workers: null, verified: null }

    async function fetchSnapshot(signal) {
      const r = await fetch('/d2d/api/snapshot', { signal, headers: { accept: 'application/json' } })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const j = await r.json()
      if (!j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? 'bad snapshot'))
      badgeState.workers = j?.agents?.filter((a) => a?.status === 'running' && !a?.zombie).length ?? null // badge=真存活(排除 zombie)
      badgeState.verified = j?.findings?.macro?.verified ?? null
      return j
    }

    /** 写端点(fleet 模型切换 / finding 人工裁决)。失败抛 Error(message 来自 host)。 */
    async function postJson(method, body) {
      const r = await fetch(`/d2d/api/${method}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body ?? {}),
      })
      const j = await r.json().catch(() => ({ ok: false, error: { message: `HTTP ${r.status}` } }))
      if (!r.ok || !j?.ok) throw new Error(String(j?.error?.message ?? j?.error ?? `HTTP ${r.status}`))
      return j
    }

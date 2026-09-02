// lib/client.js — d2d-panel client 半(dsh web 浏览器侧)
// 格式: window.__ModuleLoader__.load({id, factory:(require)=>{...}}) — 生态静态插件
// 客户端包标准格式(参照 dsh-sidebar-leap lib/client.js); require('react') 由宿主提供。
// 本文件为手工内联打包(零构建, 与 d2d 仓库哲学一致); 各源模块以区块注释分节。
// 规范: DSH-better-sidebar docs/external-plugin-guide.md(v0.12.0+)
window.__ModuleLoader__.load({
  id: 'd2d-panel',
  factory: (require) => {
    const module = { exports: {} }
    const exports = module.exports
    const react = require('react')
    const { createElement: h, useState, useEffect, useMemo, useCallback } = react

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

    // ══════════ ui.js — DSW 令牌样式 / 语义色 / 轮询 hook / 原语 ══════════
    const POLL_MS = 2000
    const SEMANTIC_CSS = [
      '.d2d-panel{--d2d-sev-critical:#e5484d;--d2d-sev-high:#f0773c;--d2d-sev-medium:#d8a021;--d2d-sev-low:#58a36a;--d2d-sev-info:#8e97a8;',
      '--d2d-ring-discovery:#4d6bfe;--d2d-ring-deep:#9b7bff;--d2d-ring-creative:#f5a623;--d2d-ring-verify:#2fb6a3;--d2d-ring-study:#8e97a8;',
      '--d2d-ok:#58a36a;--d2d-warn:#d8a021;--d2d-line:rgba(128,140,165,.32);--d2d-line-strong:rgba(128,140,165,.5);--d2d-brand:#4d6bfe}',
      '@keyframes d2d-pulse{0%,100%{opacity:1}50%{opacity:.35}}',
      '@keyframes d2d-shimmer{0%{opacity:.45}50%{opacity:.9}100%{opacity:.45}}',
      '.d2d-panel button{cursor:pointer}',
      '@media (prefers-reduced-motion: no-preference){',
      '.d2d-dot-running{animation:d2d-pulse 2s ease-in-out infinite}',
      '.d2d-skel{animation:d2d-shimmer 1.6s ease-in-out infinite}}',
    ].join('\n')

    const sevColor = (s) => `var(--d2d-sev-${String(s || 'info').toLowerCase()}, var(--d2d-sev-info))`
    const ringColor = (r) => `var(--d2d-ring-${String(r || '').toLowerCase()}, var(--d2d-sev-info))`

    const panel = {
      root: {
        className: 'd2d-panel',
        style: {
          background: 'var(--dsw-alias-bg-layer-1, transparent)', // 接入指南 §12.1: 面板表面唯一正确令牌
          color: 'inherit', font: 'inherit', padding: '10px',
          display: 'flex', flexDirection: 'column', gap: '10px',
          overflowY: 'auto', height: '100%', boxSizing: 'border-box', minWidth: 0,
        },
      },
      card: { style: { border: '1px solid var(--d2d-line)', borderRadius: '8px', padding: '10px', display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 } },
      cardTitle: { style: { fontSize: '11px', opacity: '.65', letterSpacing: '.04em', textTransform: 'uppercase', margin: 0 } },
      mono: { style: { fontFamily: 'var(--dsw-font-mono, ui-monospace, SFMono-Regular, Menlo, Consolas, monospace)', fontSize: '11px' } },
      muted: (o = 0.65) => ({ style: { opacity: String(o), fontSize: '11px' } }),
      chip: (extra = {}) => ({ style: { display: 'inline-flex', alignItems: 'center', gap: '4px', border: '1px solid var(--d2d-line)', borderRadius: '999px', padding: '1px 7px', fontSize: '10px', whiteSpace: 'nowrap', ...extra } }),
      dot: (color, pulse) => ({ className: pulse ? 'd2d-dot-running' : undefined, style: { width: '7px', height: '7px', borderRadius: '50%', background: color, flex: '0 0 auto' } }),
      btn: (extra = {}) => ({ style: { fontSize: '10px', border: '1px solid var(--d2d-line-strong)', borderRadius: '999px', padding: '2px 9px', background: 'transparent', color: 'inherit', whiteSpace: 'nowrap', ...extra } }),
      input: (extra = {}) => ({ style: { fontSize: '11px', border: '1px solid var(--d2d-line-strong)', borderRadius: '6px', padding: '3px 6px', background: 'transparent', color: 'inherit', minWidth: 0, ...extra } }),
      rail: (color) => ({ style: { width: '3px', borderRadius: '2px', background: color, flex: '0 0 auto', alignSelf: 'stretch' } }),
    }

    function Style() { return h('style', null, SEMANTIC_CSS) }

    function Card({ title, children, extra, onClick, highlight }) {
      return h('div', {
        ...panel.card,
        onClick,
        style: { ...panel.card.style, ...(onClick ? { cursor: 'pointer' } : {}), ...(highlight ? { borderColor: 'var(--d2d-brand)' } : {}) },
      },
        title ? h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '6px' } },
          h('span', panel.cardTitle, title), extra ?? null) : null,
        children)
    }

    // 轮询 hook: visible 门控(tab 不可见完全静默) + 前端时钟(zombie 走字不占轮询)
    function useSnapshot(visible) {
      const [snap, setSnap] = useState(null)
      const [err, setErr] = useState(null)
      const [now, setNow] = useState(() => Date.now())
      const [rev, setRev] = useState(0) // 写操作后立即强制刷新
      useEffect(() => {
        if (!visible) return
        const ac = new AbortController()
        let stop = false
        const tick = async () => {
          try {
            const s = await fetchSnapshot(ac.signal)
            if (!stop) { setSnap(s); setErr(null) }
          } catch (e) {
            if (!stop && e?.name !== 'AbortError') setErr(e)
          }
        }
        void tick()
        const poll = setInterval(tick, POLL_MS)
        const clock = setInterval(() => setNow(Date.now()), 1000)
        return () => { stop = true; ac.abort(); clearInterval(poll); clearInterval(clock) }
      }, [visible, rev])
      const refresh = useCallback(() => setRev((r) => r + 1), [])
      return { snap, err, now, refresh }
    }

    /** localStorage 模块开关(设置卡范式): 默认全开, 记忆用户取舍。 */
    const MODULES = [
      { key: 'eng', label: 'engagement' },
      { key: 'fleet', label: 'fleet' },
      { key: 'usage', label: '用量' },
      { key: 'workers', label: 'workers' },
      { key: 'funnel', label: '漏斗' },
      { key: 'gaps', label: '缺口' },
      { key: 'exp', label: '经验库' },
    ]
    function useModules() {
      const [off, setOff] = useState(() => {
        try { return new Set(JSON.parse(localStorage.getItem('d2d-ops-modules-off') ?? '[]')) } catch { return new Set() }
      })
      const toggle = useCallback((key) => {
        setOff((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key); else next.add(key)
          try { localStorage.setItem('d2d-ops-modules-off', JSON.stringify([...next])) } catch {}
          return next
        })
      }, [])
      return { off, toggle }
    }

    function Skeleton({ rows = 4 }) {
      return h('div', panel.root, Style(),
        h('div', panel.card,
          Array.from({ length: rows }, (_, i) =>
            h('div', { key: i, className: 'd2d-skel', style: { height: '14px', borderRadius: '4px', background: 'var(--d2d-line)' } }))))
    }

    function FailClosedBanner({ err, onRetry }) {
      return h('div', panel.root, Style(),
        h('div', { ...panel.card, style: { ...panel.card.style, borderColor: 'var(--d2d-sev-high)' } },
          h('div', { style: { fontSize: '12px', fontWeight: 600 } }, '图服务不可达 · 轮询已暂停'),
          h('div', panel.muted(), 'fail-closed: 不展示过期快照'),
          h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.55', wordBreak: 'break-all' } }, String(err?.message ?? err)),
          h('button', { onClick: onRetry, style: { alignSelf: 'flex-start', marginTop: '2px' } }, '立即重试')))
    }

    function fmtAge(ms) {
      if (ms < 0 || !Number.isFinite(ms)) return '?'
      if (ms < 60000) return `${Math.floor(ms / 1000)}s`
      if (ms < 3600000) return `${Math.floor(ms / 60000)}m`
      return `${Math.floor(ms / 3600000)}h`
    }
    function fmtClock(iso) {
      const t = Date.parse(iso || '')
      if (!t) return '--:--'
      const d = new Date(t)
      return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    function shortModel(m) {
      const s = String(m ?? '')
      const slash = s.indexOf('/')
      return slash >= 0 ? s.slice(slash + 1) : s
    }

    // ══════════ OpsView.js — d2d:ops tab(运营观测页 · 可交互) ══════════
    function CountStrip({ counts }) {
      const items = [
        ['端点', counts.endpoints], ['开放信号', counts.signals_open],
        ['findings', counts.findings], ['经验', counts.experience], ['假设', counts.hypotheses_open],
      ]
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px' } },
        items.map(([k, v]) => h('span', { key: k, ...panel.chip() }, h('b', null, String(v ?? 0)), h('span', panel.muted(), k))))
    }

    // ---- Engagement 卡: 覆盖大数字 + 里程碑刻度(Handoff, hover 出 digest 摘要) ----
    function EngagementCard({ snap }) {
      const e = snap.engagement
      const cov = snap.coverage ?? { total: 0, covered: 0 }
      const pct = cov.total > 0 ? Math.round((cov.covered / cov.total) * 100) : null
      const [hoverMs, setHoverMs] = useState(null)
      if (!e) {
        return h(Card, { title: 'Engagement' },
          h('div', panel.muted(), '无活跃 engagement — 用 /pentest 命令开始'))
      }
      const state = e.status === 'active' ? '运行中'
        : e.status === 'frozen' ? '已冻结'
        : e.status === 'exhausted' ? '已收工(exhausted)'
        : e.status
      const stale = e.status !== 'active'
      return h(Card, {
        title: 'Engagement',
        extra: h('span', { ...panel.chip({ borderColor: e.status === 'active' ? 'var(--d2d-ok)' : 'var(--d2d-line-strong)' }) }, state),
      },
        h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, e.name),
        h('div', panel.muted(0.55), `${e.target || '?'} · scope: ${e.scope || '?'}`),
        // R5: 非运行态明示"历史轮次" —— 与新任务区分, 避免误读为仍在跑
        stale ? h('div', panel.muted(0.5), '历史轮次 — 发起新任务将创建新的 engagement(本卡片始终显示最新一条)') : null,
        h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px' } },
          h('span', { style: { fontSize: '22px', fontWeight: 700, fontVariantNumeric: 'tabular-nums' } },
            pct === null ? '—' : `${pct}%`),
          h('span', panel.muted(0.55), `覆盖 ${cov.covered}/${cov.total} 端点`)),
        snap.milestones?.length ? h('div', { style: { display: 'flex', alignItems: 'flex-end', gap: '3px', position: 'relative', flexWrap: 'wrap' } },
          snap.milestones.map((m, i) => {
            const isLast = i === snap.milestones.length - 1
            return h('button', {
              key: m.id,
              title: `${m.created_at} · ${m.digest.slice(0, 120)}`,
              onMouseEnter: () => setHoverMs(m.id),
              onMouseLeave: () => setHoverMs(null),
              style: {
                border: 'none', background: 'transparent', padding: '1px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', minWidth: '16px',
              },
            },
              h('span', { style: { width: '8px', height: `${8 + (i % 3) * 3}px`, borderRadius: '2px', background: isLast ? 'var(--d2d-brand)' : 'var(--d2d-line-strong)', opacity: isLast ? 1 : 0.7 } }),
              h('span', { style: { fontSize: '8px', opacity: hoverMs === m.id ? 1 : 0.5 } }, `m${i + 1}`))
          }),
          h('span', { ...panel.muted(0.45), style: { marginLeft: '4px' } }, '· 里程碑(handoff)')) : null,
        hoverMs ? h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: '.6', wordBreak: 'break-all' } },
          (snap.milestones.find((m) => m.id === hoverMs)?.digest ?? '').slice(0, 160)) : null,
        h(CountStrip, { counts: snap.counts }))
    }

    // ---- Fleet 卡: 模型可点开选择列表(并集 + 自定义输入; backup 可清除) ----
    function FleetModelPicker({ role, slot, current, models, quotaHits, onPick, busy }) {
      const [custom, setCustom] = useState('')
      const isBackup = slot === 'backup'
      const candidates = [...new Set([current, ...models].filter(Boolean))]
      const hit = quotaHits?.includes?.(current)
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
        h('div', panel.muted(0.55), `选择 ${role}/${slot} 的模型(${candidates.length} 个已用):`),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
          candidates.map((m) => h('button', {
            key: m,
            disabled: busy,
            onClick: () => onPick(role, slot, m),
            ...panel.btn(m === current ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}),
          }, shortModel(m), m === current ? ' ✓' : '')),
          isBackup ? h('button', {
            disabled: busy || !current,
            onClick: () => onPick(role, slot, ''),
            ...panel.btn(),
            style: { ...panel.btn().style, opacity: current ? 1 : 0.4 },
          }, '清除(无备)') : null),
        h('div', { style: { display: 'flex', gap: '4px' } },
          h('input', {
            ...panel.input({ flex: 1 }),
            placeholder: '自定义 provider/model',
            value: custom,
            disabled: busy,
            onChange: (ev) => setCustom(ev.target.value),
            onKeyDown: (ev) => { if (ev.key === 'Enter' && /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(custom)) onPick(role, slot, custom) },
          }),
          h('button', {
            disabled: busy || !/^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(custom),
            onClick: () => onPick(role, slot, custom),
            ...panel.btn({ opacity: /^[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+$/.test(custom) ? 1 : 0.4 }),
          }, '设为该槽')),
        hit ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-warn)' } }, `⚠ ${current} 近期命中额度降级`) : null)
    }

    function FleetCard({ fleet, run, refresh }) {
      const [open, setOpen] = useState(null) // `${role}/${slot}`
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      if (!fleet?.roles || !Object.keys(fleet.roles).length) {
        return h(Card, { title: 'Fleet 模型矩阵' }, h('div', panel.muted(), '未配置 model-policies(fleet 卡降级)'))
      }
      const pick = async (role, slot, model) => {
        setBusy(true); setErr(null)
        try {
          await postJson('fleet', { role, slot, model })
          setOpen(null)
          refresh()
        } catch (e) { setErr(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      return h(Card, { title: 'Fleet 模型矩阵', extra: h('span', panel.muted(0.45), '点击模型换槽') },
        Object.entries(fleet.roles).map(([role, m]) => {
          const key = `${role}/primary`
          const keyB = `${role}/backup`
          return h('div', { key: role, style: { display: 'flex', flexDirection: 'column', gap: '3px', minWidth: 0 } },
            h('div', { style: { display: 'flex', gap: '5px', alignItems: 'baseline', minWidth: 0, flexWrap: 'wrap' } },
              h('span', panel.chip(), role),
              h('button', {
                ...panel.btn({ padding: '1px 8px' }),
                onClick: () => setOpen(open === key ? null : key),
                title: `主模型: ${m.primary || '(default)'}`,
              }, m.primary || '(default)', run?.quotaHits?.includes?.(m.primary) ? ' ⚠' : ''),
              m.backup
                ? h('button', {
                  ...panel.btn({ padding: '1px 8px', opacity: '.75' }),
                  onClick: () => setOpen(open === keyB ? null : keyB),
                  title: `备模型: ${m.backup}`,
                }, `备 ${shortModel(m.backup)}`)
                : h('button', {
                  ...panel.btn({ padding: '1px 8px', opacity: '.45', borderStyle: 'dashed' }),
                  onClick: () => setOpen(open === keyB ? null : keyB),
                }, '+ 备'),
              busy && (open === key || open === keyB) ? h('span', panel.muted(0.5), '写入中…') : null),
            open === key ? h(FleetModelPicker, { role, slot: 'primary', current: m.primary, models: fleet.models ?? [], quotaHits: run?.quotaHits, onPick: pick, busy }) : null,
            open === keyB ? h(FleetModelPicker, { role, slot: 'backup', current: m.backup, models: fleet.models ?? [], quotaHits: run?.quotaHits, onPick: pick, busy }) : null)
        }),
        err ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, err) : null)
    }

    // ---- 用量卡: 每模型调度次数(model-usage.jsonl 真实计数) ----
    function UsageCard({ run }) {
      const entries = Object.entries(run?.usage ?? {}).sort((a, b) => b[1] - a[1])
      if (!entries.length) {
        return h(Card, { title: '模型用量' }, h('div', panel.muted(0.45), '无调度记录 — worker 派发后自动入列'))
      }
      const max = Math.max(...entries.map(([, n]) => n), 1)
      const total = entries.reduce((a, [, n]) => a + n, 0)
      return h(Card, { title: '模型用量 · 累计', extra: h('span', panel.muted(0.45), `共 ${total} 次调度`) },
        // R5: 口径标注 —— 这是自安装起跨轮次的累计记账, 不是当前 engagement 的
        h('div', panel.muted(0.45), '自安装起全部轮次的 worker 派发记账(含已停止轮次)'),
        entries.map(([m, n]) => h('div', { key: m, style: { display: 'grid', gridTemplateColumns: 'minmax(64px, 38%) 1fr auto', gap: '6px', alignItems: 'center' } },
          h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: m }, shortModel(m)),
          h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--d2d-line)', overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.round((n / max) * 100)}%`, borderRadius: '3px', background: run?.quotaHits?.includes?.(m) ? 'var(--d2d-sev-high)' : 'var(--d2d-brand)' } })),
          h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: '.7' } }, `${n} 次`, run?.quotaHits?.includes?.(m) ? ' ⚠' : ''))))
    }

    // ---- Worker 鱼骨抽屉: 执行轨迹(run-log.jsonl 事件 + checkpoint/todo 折叠) ----
    const EV_KIND = {
      dispatch: { label: 'DISPATCH', color: 'var(--d2d-ring-discovery)' },
      terminal: { label: 'TERMINAL', color: 'var(--d2d-ring-verify)' },
      'zero-write': { label: 'ZERO-WRITE', color: 'var(--d2d-warn)' },
      handoff: { label: 'HANDOFF', color: 'var(--d2d-ring-deep)' },
    }

    function WorkerDrawer({ a, events, now }) {
      const mine = events.filter((e) => e.worker === a.worker_id)
      const dispatch = mine.findLast?.((e) => e.kind === 'dispatch') ?? [...mine].reverse().find((e) => e.kind === 'dispatch')
      const [openEv, setOpenEv] = useState(null)
      const [showCp, setShowCp] = useState(false)
      const model = dispatch?.model || ''
      const [copied, setCopied] = useState(false)
      const beatTs = Date.parse(a.updated_at) || 0
      const copyTraj = () => {
        try {
          const txt = JSON.stringify({ worker: a, events: mine }, null, 2)
          void navigator?.clipboard?.writeText?.(txt)
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        } catch {}
      }
      return h('div', {
        style: { border: '1px solid var(--d2d-line)', borderRadius: '8px', padding: '8px', display: 'flex', flexDirection: 'column', gap: '6px', background: 'var(--dsw-alias-bg-layer-2, transparent)' },
      },
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' } },
          h('span', { ...panel.mono, style: { ...panel.mono.style, fontWeight: 600 } }, a.worker_id),
          h('span', { ...panel.chip({ borderColor: ringColor(a.ring), color: ringColor(a.ring) }) }, a.ring || '?'),
          a.chain ? h('span', panel.chip(), a.chain) : null,
          model ? h('span', panel.chip(), shortModel(model)) : null,
          h('span', { style: { fontSize: '10px', opacity: '.65', marginLeft: 'auto' } },
            a.zombie ? `失联 ${fmtAge(now - beatTs)}` : `${a.status || '?'}${beatTs ? ` · ${fmtAge(now - beatTs)} 前` : ''}`)),
        mine.length ? h('div', { style: { display: 'flex', flexDirection: 'column' } },
          mine.map((e, i) => {
            const meta = EV_KIND[e.kind] ?? { label: String(e.kind).toUpperCase(), color: 'var(--d2d-line-strong)' }
            const open = openEv === i
            return h('div', { key: i, style: { display: 'flex', gap: '6px' } },
              h('div', panel.rail(meta.color)),
              h('button', {
                onClick: () => setOpenEv(open ? null : i),
                style: { flex: 1, display: 'flex', gap: '6px', alignItems: 'baseline', border: 'none', background: 'transparent', color: 'inherit', textAlign: 'left', padding: '2px 0', minWidth: 0 },
              },
                h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: '.55', flex: '0 0 auto' } }, fmtClock(e.ts)),
                h('span', { ...panel.mono, style: { ...panel.mono.style, color: meta.color, fontSize: '9px', letterSpacing: '.05em', flex: '0 0 auto' } }, meta.label),
                h('span', { style: { fontSize: '10px', opacity: '.8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } },
                  e.kind === 'dispatch' ? `派发 · ${e.ring || ''}${e.role ? ` · ${e.role}` : ''}`
                    : e.kind === 'terminal' ? `退出 code=${e.code ?? '?'}${e.quota ? ` · 额度:${e.quota}` : ''}`
                      : e.kind === 'zero-write' ? '零图写入 · 自动补写重派'
                        : e.reason ? `handoff · ${e.reason}` : 'handoff 里程碑'),
                h('span', { style: { fontSize: '9px', opacity: '.4', flex: '0 0 auto' } }, open ? '▾' : '▸')),
              open ? h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px', opacity: '.6', wordBreak: 'break-all', border: '1px dashed var(--d2d-line)', borderRadius: '6px', padding: '4px 6px', margin: '2px 0 4px' } },
                `ts=${e.ts}`, e.model ? ` model=${e.model}` : '', e.role ? ` role=${e.role}` : '', e.worker ? ` worker=${e.worker}` : '') : null)
          })) : h('div', panel.muted(0.45), '无轨迹事件(run-log.jsonl 该 worker 无记录)'),
        (a.checkpoint || a.todo) ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
          h('button', { ...panel.btn({ alignSelf: 'flex-start' }), onClick: () => setShowCp(!showCp) },
            showCp ? '收起 checkpoint / todo' : '展开 checkpoint / todo'),
          showCp ? h('div', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px', opacity: '.7', whiteSpace: 'pre-wrap', wordBreak: 'break-all', border: '1px dashed var(--d2d-line)', borderRadius: '6px', padding: '5px 7px' } },
            a.checkpoint ? `checkpoint:\n${a.checkpoint}` : '',
            a.todo ? `\ntodo:\n${a.todo}` : '') : null) : null,
        h('div', { style: { display: 'flex', gap: '5px' } },
          h('button', { ...panel.btn(), onClick: copyTraj }, copied ? '已复制 ✓' : '复制轨迹 JSON')))
    }

    function WorkersCard({ snap, now }) {
      const [openId, setOpenId] = useState(null)
      const [expandAll, setExpandAll] = useState(false)
      const agents = snap.agents ?? []
      const alive = agents.filter((a) => a.status === 'running' && !a.zombie).length
      // R5: 默认只展开运行中的 worker + 补足到 4 行, 其余折叠 —— done/僵尸历史不刷屏
      const running = agents.filter((a) => a.status === 'running')
      const visible = expandAll ? agents : [...running, ...agents.filter((a) => a.status !== 'running')].slice(0, Math.max(4, running.length))
      const hidden = agents.length - visible.length
      return h(Card, {
        title: `Workers · 存活 ${alive}/${agents.length}`,
        extra: hidden > 0 || expandAll ? h('button', {
          ...panel.btn({ padding: '1px 8px' }),
          onClick: () => setExpandAll(!expandAll),
        }, expandAll ? '收起' : `展开全部 ${agents.length}`) : null,
      },
        visible.length
          ? visible.map((a) => h('div', { key: a.worker_id, style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
            h('button', {
              onClick: () => setOpenId(openId === a.worker_id ? null : a.worker_id),
              style: { display: 'flex', alignItems: 'center', gap: '7px', minWidth: 0, border: 'none', background: 'transparent', color: 'inherit', padding: 0, textAlign: 'left' },
            },
              h('span', panel.dot(a.zombie ? 'var(--d2d-warn)' : a.status === 'running' ? 'var(--d2d-ok)' : a.status === 'done' ? 'var(--d2d-sev-info)' : 'var(--d2d-line-strong)', a.status === 'running' && !a.zombie)),
              h('span', { ...panel.chip({ borderColor: ringColor(a.ring), color: ringColor(a.ring) }) }, a.ring || '?'),
              h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, a.worker_id),
              a.chain ? h('span', panel.muted(0.5), a.chain) : null,
              h('span', { style: { fontSize: '10px', color: a.zombie ? 'var(--d2d-warn)' : 'inherit', opacity: '.7', whiteSpace: 'nowrap', flex: '0 0 auto' } },
                (a.zombie ? `失联 ${fmtAge(now - (Date.parse(a.updated_at) || 0))}` : (a.status || '?')), ' ▸')),
            openId === a.worker_id ? h(WorkerDrawer, { a, events: snap.run?.events ?? [], now }) : null))
          : h('div', panel.muted(), '暂无 worker 心跳(AgentIdentity 为空)'),
        agents.length ? h('div', panel.muted(0.4), expandAll ? '点击行展开执行轨迹' : `已折叠 ${hidden} 条历史 — 点「展开全部」查看 · 点击行展开执行轨迹`) : null)
    }

    // ---- 漏斗卡: 七态条形, 点击聚焦该状态 findings 迷你列表 ----
    function FunnelCard({ snap }) {
      const [focus, setFocus] = useState(null)
      const byState = snap.findings.byState
      const states = Object.keys(byState).filter((s) => s !== 'rejected')
    const rows = [...states, 'rejected']
      const max = Math.max(...rows.map((s) => byState[s] ?? 0), 1)
      const focusList = focus ? snap.findings.list.filter((f) => f.state === focus).slice(0, 8) : []
      return h(Card, { title: 'Findings 漏斗', extra: h('span', panel.muted(0.45), focus ? '再点取消聚焦' : '点击状态聚焦') },
        rows.map((s) => h('button', {
          key: s,
          onClick: () => setFocus(focus === s ? null : s),
          style: { display: 'grid', gridTemplateColumns: 'minmax(56px, 30%) 1fr auto', gap: '6px', alignItems: 'center', border: 'none', background: 'transparent', color: 'inherit', padding: '1px 0', textAlign: 'left', minWidth: 0 },
        },
          h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: focus && focus !== s ? '.4' : '.75', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, s),
          h('div', { style: { height: '8px', borderRadius: '4px', background: 'var(--d2d-line)', overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.round(((byState[s] ?? 0) / max) * 100)}%`, borderRadius: '4px', background: s === 'rejected' ? 'var(--d2d-sev-info)' : focus === s ? 'var(--d2d-brand)' : 'var(--d2d-brand)', opacity: focus && focus !== s ? 0.35 : 0.8 } })),
          h('span', { ...panel.mono, style: { ...panel.mono.style, fontWeight: 600 } }, String(byState[s] ?? 0)))),
        focus ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
          focusList.length ? focusList.map((f) => h('div', { key: f.id, style: { display: 'flex', gap: '5px', alignItems: 'baseline', minWidth: 0 } },
            h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: sevColor(f.severity), flex: '0 0 auto', alignSelf: 'center' } }),
            h('span', { style: { fontSize: '10px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, f.title || f.id),
            f.cvss > 0 ? h('span', { ...panel.mono, style: { ...panel.mono.style, color: sevColor(f.severity) } }, f.cvss.toFixed(1)) : null))
            : h('div', panel.muted(0.4), `${focus} 无记录`)) : null)
    }

    // ---- 缺口卡: 未覆盖业务链(scheduler 同款口径查询) ----
    function GapsCard({ snap }) {
      const gaps = snap.gaps ?? []
      return h(Card, { title: '覆盖缺口', extra: h('span', panel.muted(0.45), 'coverage_votes<2') },
        gaps.length
          ? gaps.map((g, i) => h('div', { key: i, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
            h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: 'var(--d2d-warn)', flex: '0 0 auto', alignSelf: 'center' } }),
            h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, g || '(无链名)')))
          : h('div', panel.muted(0.45), '无未覆盖链 — 端点全部 exhausted/双投票'))
    }

    // ---- 经验库卡: top ExperienceWeight(prior 权重排序) ----
    function ExperienceCard({ snap }) {
      const list = snap.experience ?? []
      return h(Card, { title: `经验库 · ${snap.counts.experience}`, extra: h('span', panel.muted(0.45), 'prior 权重序') },
        list.length
          ? list.map((x) => h('div', { key: x.id, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
            h('span', { ...panel.mono, style: { ...panel.mono.style, color: 'var(--d2d-ring-deep)', fontWeight: 600, flex: '0 0 auto' } }, `w=${x.prior}`),
            h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: `${x.pattern} @ ${x.stack}` }, x.pattern || x.id),
            h('span', panel.muted(0.5), `${x.hits}命中/${x.wins}胜`)))
          : h('div', panel.muted(0.45), '暂无经验卡(ExperienceWeight 为空) — verify 环验证后沉淀'))
    }

    function ModuleToggles({ off, toggle }) {
      return h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap', alignItems: 'center' } },
        h('span', panel.muted(0.5), '模块'),
        MODULES.map((m) => h('button', {
          key: m.key,
          onClick: () => toggle(m.key),
          ...panel.btn(off.has(m.key) ? { opacity: '.4', borderStyle: 'dashed' } : { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }),
        }, m.label)))
    }

    function OpsView(props) {
      const { visible } = props
      const { snap, err, now, refresh } = useSnapshot(visible)
      const { off, toggle } = useModules()
      if (err && !snap) {
        return h(FailClosedBanner, { err, onRetry: refresh })
      }
      if (!snap) return h(Skeleton, null)
      return h('div', panel.root, Style(),
        h(ModuleToggles, { off, toggle }),
        !off.has('eng') ? h(EngagementCard, { snap }) : null,
        !off.has('fleet') ? h(FleetCard, { fleet: snap.fleet, run: snap.run, refresh }) : null,
        !off.has('usage') ? h(UsageCard, { run: snap.run }) : null,
        !off.has('workers') ? h(WorkersCard, { snap, now }) : null,
        !off.has('funnel') ? h(FunnelCard, { snap }) : null,
        !off.has('gaps') ? h(GapsCard, { snap }) : null,
        !off.has('exp') ? h(ExperienceCard, { snap }) : null,
        h(Card, { title: `开放信号 tail · ${snap.counts.signals_open}` },
          snap.signals.length
            ? snap.signals.map((s) =>
              h('div', { key: s.id, style: { display: 'flex', gap: '7px', alignItems: 'baseline', minWidth: 0 } },
                h('span', panel.chip(), s.type || '?'),
                h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, s.id),
                h('span', panel.muted(0.5), `w=${s.weight}`)))
            : h('div', panel.muted(), '无开放信号 — discovery 环产出后自动入列')))
    }

    // ══════════ FindingsView.js — d2d:findings tab(七态看板 · 筛选 + 人工裁决) ══════════
    const STEPS = ['candidate', 'triaged', 'verified', 'reported', 'accepted'] // 主链; isolated/rejected 走分支
    const COLUMNS = [
      { key: 'active', label: '活跃', states: ['candidate', 'triaged'] },
      { key: 'verified', label: '已验证', states: ['verified', 'isolated'] },
      { key: 'delivered', label: '已交付', states: ['reported', 'accepted'] },
      { key: 'rejected', label: '已驳回', states: ['rejected'] },
    ]
    // 与 graphd/app.py FINDING_TRANSITIONS 同口径(镜像, 门在服务端)
    const TRANSITIONS = {
      candidate: ['triaged', 'verified', 'isolated', 'rejected'],
      triaged: ['verified', 'isolated', 'rejected'],
      verified: ['reported', 'isolated'],
      isolated: ['candidate', 'rejected'],
      reported: ['accepted', 'rejected'],
      accepted: [],
      rejected: [],
    }

    function stepChip(s, n, opts = {}) {
      return h('button', {
        ...panel.chip({ borderColor: opts.active ? 'var(--d2d-brand)' : opts.strong ? 'var(--d2d-line-strong)' : 'var(--d2d-line)', color: opts.active ? 'var(--d2d-brand)' : undefined }),
        onClick: opts.onClick,
        disabled: !opts.onClick,
        style: { ...panel.chip({ borderColor: opts.active ? 'var(--d2d-brand)' : opts.strong ? 'var(--d2d-line-strong)' : 'var(--d2d-line)' }).style, ...(opts.onClick ? { cursor: 'pointer' } : { cursor: 'default' }) },
      },
        h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '10px' } }, s),
        h('b', null, String(n ?? 0)))
    }

    function Stepper({ byState, filter, setFilter }) {
      const chain = STEPS.map((s, i) => h('span', { key: s, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
        i > 0 ? h('span', { style: { opacity: '.35', fontSize: '10px' } }, '→') : null,
        stepChip(s, byState[s], { active: filter === s, strong: byState[s] > 0, onClick: () => setFilter(filter === s ? null : s) })))
      const branch = h('span', { style: { display: 'inline-flex', gap: '4px', marginLeft: '6px' } },
        stepChip('isolated', byState.isolated, { active: filter === 'isolated', strong: byState.isolated > 0, onClick: () => setFilter(filter === 'isolated' ? null : 'isolated') }),
        stepChip('rejected', byState.rejected, { active: filter === 'rejected', strong: byState.rejected > 0, onClick: () => setFilter(filter === 'rejected' ? null : 'rejected') }))
      return h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'center' } }, chain, branch)
    }

    /** 人工裁决: 合法转移按钮 + reason 输入 → POST /d2d/api/transition(actor=panel)。 */
    function TransitionOps({ f, refresh }) {
      const [reason, setReason] = useState('')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const [okTo, setOkTo] = useState(null)
      const legal = TRANSITIONS[f.state] ?? []
      if (!legal.length) return h('div', panel.muted(0.45), '终态 — 不可再转移')
      const go = async (to) => {
        setBusy(true); setErr(null); setOkTo(null)
        try {
          await postJson('transition', { id: f.id, to, actor: 'panel', reason: reason.trim() || `panel 推动到 ${to}` })
          setOkTo(to)
          setReason('')
          refresh()
        } catch (e) { setErr(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
        h('div', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
          legal.map((to) => h('button', { key: to, ...panel.btn({ borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }), disabled: busy, onClick: () => go(to) },
            `→ ${to}${busy ? ' …' : ''}`))),
        h('input', {
          ...panel.input({ flex: 1 }),
          placeholder: '裁决理由(可选, 默认自动填)',
          value: reason,
          disabled: busy,
          onChange: (ev) => setReason(ev.target.value),
        }),
        err ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, err) : null,
        okTo ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-ok)' } }, `已转移 → ${okTo}(审计 actor=panel)`) : null)
    }

    function parseTraj(s) {
      try { return JSON.parse(s) } catch { return null }
    }

    function FindingCard({ f, expanded, onToggle, refresh }) {
      const dead = f.state === 'rejected'
      const traj = parseTraj(f.last_transition)
      return h('div', {
        onClick: dead ? undefined : onToggle,
        style: {
          border: '1px solid var(--d2d-line)', borderLeft: `3px solid ${sevColor(f.severity)}`,
          borderRadius: '6px', padding: '6px 8px', cursor: dead ? 'default' : 'pointer',
          opacity: dead ? 0.64 : 1, // rejected 不可点: 垃圾清单门在工作的证明(§4.4)
          display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0,
        },
      },
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
          h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, f.title || f.id),
          f.cvss > 0 ? h('span', { ...panel.mono, style: { ...panel.mono.style, color: sevColor(f.severity), fontWeight: 600 } }, f.cvss.toFixed(1)) : null),
        h('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap' } },
          h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '9px', opacity: '.6' } }, f.state),
          f.category ? h('span', { style: { fontSize: '9px', opacity: '.5' } }, f.category) : null),
        expanded ? h('div', {
          onClick: (ev) => ev.stopPropagation(),
          style: { display: 'flex', flexDirection: 'column', gap: '5px', borderTop: '1px solid var(--d2d-line)', paddingTop: '5px' },
        },
          h('div', panel.muted(0.55), `id: ${f.id} · ts: ${f.ts || '?'}`),
          f.verified_at ? h('div', panel.muted(0.55), `verified_at: ${f.verified_at}`) : null,
          traj ? h('div', panel.muted(0.55),
            `上次转移: ${traj.from}→${traj.to} · ${traj.actor} · ${String(traj.reason ?? '')}`) : null,
          h(TransitionOps, { f, refresh })) : null)
    }

    function FindingsView(props) {
      const { visible } = props
      const { snap, err, refresh } = useSnapshot(visible)
      const [openId, setOpenId] = useState(null)
      const [filter, setFilter] = useState(null)
      if (err && !snap) return h(FailClosedBanner, { err, onRetry: refresh })
      if (!snap) return h(Skeleton, { rows: 6 })
      const { byState, macro, list } = snap.findings
      const shown = filter ? list.filter((f) => f.state === filter) : list
      return h('div', panel.root, Style(),
        h(Card, {
          title: '管线',
          extra: h('span', panel.muted(0.5), filter ? `筛选: ${filter} · 点击 chip 取消` : `共 ${snap.counts.findings} · 点击 chip 筛选`),
        },
          h(Stepper, { byState, filter, setFilter })),
        filter ? h(Card, { title: `${filter} · ${shown.length}`, extra: h('button', { ...panel.btn(), onClick: () => setFilter(null) }, '清除筛选') },
          shown.length
            ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto', paddingRight: '2px' } },
              shown.map((f) =>
                h(FindingCard, { key: f.id, f, expanded: openId === f.id, onToggle: () => setOpenId(openId === f.id ? null : f.id), refresh })))
            : h('div', panel.muted(0.4), '该状态无记录')) : null,
        h('div', {
          style: {
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', // 窄面板自适应(§4.8 容器查询降级)
            gap: '8px', alignItems: 'start',
          },
        }, COLUMNS.map((col) => {
          const items = shown.filter((f) => col.states.includes(f.state))
          return h('div', { key: col.key, ...panel.card, style: { ...panel.card.style, background: 'transparent', display: 'flex', flexDirection: 'column', minWidth: 0 } },
            h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' } },
              h('span', panel.cardTitle, col.label),
              h('b', { style: { fontSize: '12px' } }, String(macro[col.key] ?? 0))),
            // R5: 列体固定高度 + 列内滚动 —— 115 条 candidate 不再把页面顶出三屏
            items.length
              ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '360px', overflowY: 'auto', paddingRight: '2px' } },
                items.map((f) =>
                  h(FindingCard, { key: f.id, f, expanded: openId === f.id, onToggle: () => setOpenId(openId === f.id ? null : f.id), refresh })))
              : h('div', panel.muted(0.4), '空'))
        })))
    }

    // ══════════ index.js — 插件入口: better-sidebar tab 注册(软依赖) ══════════
    // 软依赖: cordis inject=['betterSidebar'] 保证服务就绪才激活; 未安装 better-sidebar
    // 时本 client 恒 pending(dsh-sentinel 模式), host 半路由不受影响。
    const inject = ['betterSidebar']

    function apply(ctx) {
      const svc = ctx.betterSidebar
      if (!svc) {
        ctx.log?.('d2d-panel: betterSidebar 服务不可用, tab 注册跳过')
        return
      }
      const cap = (f) => !svc.features || svc.features.includes(f) // 能力探测(老版本降级)

      ctx.effect(() => svc.registerTab({
        id: 'd2d:ops', // 包前缀; 内置区 10-50, 三方区 60 起
        title: () => 'd2d',
        order: 60,
        single: true, // ≡ dedupeKey: () => id
        ...(cap('badge') ? { badge: () => badgeState.workers ?? null } : {}), // 同步缓存读, 不发请求
        component: (props) => h(OpsView, props),
      }), 'd2d-panel: ops tab')

      ctx.effect(() => svc.registerTab({
        id: 'd2d:findings',
        title: () => 'd2d Findings',
        order: 61,
        single: true,
        ...(cap('badge') ? { badge: () => badgeState.verified ?? null } : {}),
        component: (props) => h(FindingsView, props),
      }), 'd2d-panel: findings tab')
    }

    exports.apply = apply
    exports.inject = inject
    return module.exports
  },
})

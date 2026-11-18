    // ══════════ view.workitems.js — 待人工队列(1.6.0 Phase B: superagent 机制移植的处置面) ══════════
    // 数据: /d2d/api/workitems(GET 列表+摘要 / POST 人工迁移 — host 半同文件单一事实源)。
    // 影子态(eval_shadowed)与需人工(needs_human)置顶分列: 放行/否决两动作, 迁移表校验在 host。
    // 注意力规则呈现: 只显示需要人的事项在前, 健康态(assigned/done)折叠为计数行。
    const WI_STATUS_LABEL = {
      trigger_received: '已接收', eval_queued: '待评', accepted: '已受理', eval_shadowed: '影子',
      rejected: '已否决', assigned: '在办', needs_human: '需人工', done: '已完成', expired: '已过期',
    }
    const WI_ACTIONS = {
      eval_shadowed: [{ to: 'accepted', label: '放行', tone: 'ok' }, { to: 'rejected', label: '否决', tone: 'warn' }],
      needs_human: [{ to: 'assigned', label: '放行派发', tone: 'ok' }, { to: 'rejected', label: '否决', tone: 'warn' }],
    }
    // B10-A 状态 badge tone 化(小圆点+半透明底); TONE_DOT 为圆点色值映射
    const WI_TONE = { needs_human: 'danger', eval_shadowed: 'warn', done: 'ok', assigned: 'info', accepted: 'info', expired: 'neutral', rejected: 'neutral', eval_queued: 'neutral', trigger_received: 'neutral' }
    const TONE_DOT = { ok: 'var(--d2d-ok)', warn: 'var(--d2d-warn)', danger: 'var(--d2d-danger)', info: 'var(--d2d-info)', neutral: 'var(--d2d-text-lo)' }

    /** E38+: 面板建单表单(创建也是"点击可用"的功能面——手动触发/复测请求不经文件投递)。
     *  action='create' 走 intake+eval 门全链(影子语义与插件侧一致): 建单后落在
     *  eval_shadowed(影子)或 needs_human/accepted, 视策略。 */
    function WorkItemCreateForm({ onDone }) {
      const [kind, setKind] = useState('manual')
      const [title, setTitle] = useState('')
      const [ext, setExt] = useState('')
      const [replay, setReplay] = useState('')
      const [msg, setMsg] = useState(null)
      const [busy, setBusy] = useState(false)
      const submit = async () => {
        if (!title.trim()) { setMsg('标题必填'); return }
        if (kind === 'retest' && !ext.trim()) { setMsg('复测工单须填 Finding id'); return }
        setBusy(true); setMsg(null)
        try {
          const j = await postJson('workitems', {
            action: 'create', kind, title: title.trim(), externalId: ext.trim(),
            payload: { replay_result: replay },
          })
          setMsg(`已建单 ${j.item?.id ?? ''}${j.duplicate ? ' · 去重命中' : ''}`)
          setTitle(''); setExt(''); setReplay('')
          onDone?.()
        } catch (e) { setMsg(`建单失败: ${e.message}`) }
        setBusy(false)
      }
      return h('div', { style: { display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap', padding: '6px 8px', border: '1px dashed var(--d2d-line)', borderRadius: '8px' } },
        h('select', { ...panel.input(), value: kind, onChange: (ev) => setKind(ev.target.value) },
          h('option', { value: 'manual' }, '手动任务'),
          h('option', { value: 'retest' }, '漏洞复测'),
          h('option', { value: 'general' }, '通用')),
        h('input', { ...panel.input(), style: { ...panel.input().style, flex: 1, minWidth: '140px' }, placeholder: kind === 'retest' ? '复测标题(如: 复测 F-1 SQLi)' : '任务标题', value: title, onChange: (ev) => setTitle(ev.target.value) }),
        kind === 'retest' ? h('input', { ...panel.input(), style: { ...panel.input().style, width: '130px' }, placeholder: 'Finding id', value: ext, onChange: (ev) => setExt(ev.target.value) }) : null,
        kind === 'retest' ? h('select', { ...panel.input(), value: replay, onChange: (ev) => setReplay(ev.target.value), title: '外部执行器重放结论(缺省 manual=无法确认)' },
          h('option', { value: '' }, '结论: 无法确认'),
          h('option', { value: 'pass' }, '重放命中(仍可复现)'),
          h('option', { value: 'fail' }, '重放失败(已修复)')) : null,
        h('button', { ...panel.btn(), disabled: busy, onClick: submit }, busy ? '建单中…' : '建单'),
        msg ? h('span', panel.muted(0.65), msg) : null)
    }

    function WorkItemRow({ w, onAct, busy }) {
      const acts = WI_ACTIONS[w.status] ?? []
      const [copied, setCopied] = useState(false)
      const copyId = () => { try { navigator.clipboard?.writeText(w.id).catch(() => { /* 剪贴板拒绝静默 */ }) } catch { /* 无 clipboard API 静默 */ } setCopied(true); setTimeout(() => setCopied(false), 1200) }
      const tone = WI_TONE[w.status] ?? 'neutral'
      return h('div', { style: { display: 'flex', gap: '8px', alignItems: 'flex-start', padding: '7px 8px', border: '1px solid var(--d2d-line)', borderRadius: '8px', minWidth: 0 } },
        h('div', { style: { flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '3px' } },
          h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
            h('span', { className: 'd2d-codeid', title: '点击复制工单 ID', onClick: copyId },
              copied ? '已复制 ✓' : [w.id, h(IconCopy, { size: 10 })]),
            h('span', panel.chipTone(tone),
              h('span', { style: { width: '6px', height: '6px', borderRadius: '50%', background: TONE_DOT[tone], flex: '0 0 auto' } }),
              WI_STATUS_LABEL[w.status] ?? w.status),
            h('span', panel.chip(), `${w.source}/${w.kind}`)),
          h('div', { style: { fontSize: '12px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: w.title }, w.title || '(无标题)'),
          w.disposition?.reason ? h('div', panel.muted(0.55), `判词: ${w.disposition.reason}`) : null,
          w.url ? h('div', panel.muted(0.5), w.url) : null),
        h('div', { style: { display: 'flex', gap: '5px', flex: '0 0 auto', alignSelf: 'center' } },
          acts.length
            ? acts.map((a) => h('button', {
                key: a.to, style: { ...panel.btn().style, ...(a.tone === 'ok' ? { borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' } : {}) },
                disabled: busy === w.id, onClick: () => onAct(w, a.to),
              }, busy === w.id ? '…' : a.label))
            : h('span', panel.muted(0.4), '—')))
    }

    function WorkItemsView(props) {
      const { visible } = props
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      const [busy, setBusy] = useState(null)
      const [msg, setMsg] = useState(null)
      const [tick, setTick] = useState(0)
      useEffect(() => {
        if (!visible) return undefined
        // E40-C1: setTimeout 链式(不堆积) + AbortSignal
        const ac = new AbortController()
        let alive = true
        let t = null
        const load = async () => {
          try {
            const j = await fetchApi('workitems', { signal: ac.signal })
            if (alive) { setData(j); setErr(null) }
          } catch (e) {
            if (alive && e?.name !== 'AbortError') setErr(e.message)
          } finally {
            if (alive && !ac.signal.aborted) t = setTimeout(load, 4000)
          }
        }
        void load()
        return () => { alive = false; ac.abort(); if (t) clearTimeout(t) }
      }, [visible, tick])
      const act = async (w, to) => {
        setBusy(w.id); setMsg(null)
        try {
          await postJson('workitems', { id: w.id, to, note: `面板人工${to === 'rejected' ? '否决' : '放行'}` })
          setMsg(`${w.id} → ${WI_STATUS_LABEL[to] ?? to} ✓`)
        } catch (e) { setMsg(`${w.id} 失败: ${e.message}`) }
        setBusy(null)
      }
      if (err && !data) return h(FailClosedBanner, { err: { message: err }, onRetry: () => setTick((t) => t + 1) })
      if (!data) return h('div', panel.root, Style(), h('div', panel.card, h('div', panel.muted(), '加载中…')))
      const priority = (data.items ?? []).filter((w) => ['needs_human', 'eval_shadowed'].includes(w.status))
      const rest = (data.items ?? []).filter((w) => !['needs_human', 'eval_shadowed'].includes(w.status))
        .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      return h('div', panel.root, Style(),
        h('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center' } },
          Object.entries(data.summary ?? {}).filter(([k]) => k !== 'total' && k !== 'rejected').map(([k, v]) =>
            h('span', { key: k, ...panel.chip({ borderColor: k === 'needs_human' && v > 0 ? 'var(--d2d-sev-high)' : k === 'eval_shadowed' && v > 0 ? 'var(--d2d-warn)' : 'var(--d2d-line)' }) },
              `${WI_STATUS_LABEL[k] ?? k} ${v}`))),
        msg ? h('div', panel.muted(0.75), msg) : null,
        h(WorkItemCreateForm, { onDone: () => setTick((x) => x + 1) }),
        priority.length
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            priority.map((w) => h(WorkItemRow, { key: w.id, w, onAct: act, busy })))
          : h('div', panel.card, h('div', panel.muted(), '无待人工事项')),
        rest.length
          ? h(Card, { title: '历史工单', icon: 'history' },
            h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '260px', overflowY: 'auto' } },
              rest.map((w) => h('div', { key: w.id, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
                h('span', { ...panel.mono, style: { ...panel.mono.style, flex: '0 0 auto' } }, w.id),
                h('span', panel.chip(), WI_STATUS_LABEL[w.status] ?? w.status),
                h('span', { style: { fontSize: '11px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, w.title || '(无标题)')))))
          : null)
    }

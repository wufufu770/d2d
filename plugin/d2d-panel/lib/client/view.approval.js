    // ══════════ view.approval.js — T3-3-2 审批 tab(侧边栏对等收口最高优先): 待决列单 + 裁决 ══════════
    // 数据面: 既有 GET/POST /d2d/api/approval(host 半审批路由, 队列模块为 pentest-dsh 兄弟包
    // 单一格式源) — 零后端改动零审批面改动(拍板 4: 审批 tab 只消费, 不碰审批门)。
    // 轮询 3s: 审批是待办语义(快于 viz 慢于快照); badge=待决数(badgeState.approvals, fetchSnapshot 顺带)。
    const APPROVAL_POLL_MS = 3000
    const APPROVAL_TIER_LABEL = { high: '高危' }

    /** 审批队列取数: {approvals:[ticket], count, mode} — 失败抛错(404/409 由裁决动作单独接)。 */
    function useApprovals(visible) {
      const [data, setData] = useState(null)
      const [err, setErr] = useState(null)
      const [rev, setRev] = useState(0)
      useEffect(() => {
        if (!visible) return
        let stop = false
        const tick = async () => {
          try {
            const j = await fetchApi('approval')
            if (!stop) { setData(j); setErr(null) }
          } catch (e) { if (!stop) setErr(e) }
        }
        void tick()
        const poll = setInterval(tick, APPROVAL_POLL_MS)
        return () => { stop = true; clearInterval(poll) }
      }, [visible, rev])
      return { data, err, refresh: () => setRev((r) => r + 1) }
    }

    /** 单票据卡: 命令/上下文/提案人/期限 + 通过|驳回(busy 与错误就地显示, 不中断列表)。 */
    function ApprovalTicket({ t, onDecide, busyId }) {
      const c = t?.context ?? {}
      const created = t?.created_at ? String(t.created_at).slice(5, 16).replace('T', ' ') : '?'
      const expiry = t?.expiry_at ? String(t.expiry_at).slice(11, 16) : '?'
      return h(Card, { title: null, highlight: false },
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
          h('span', panel.chip({ borderColor: 'var(--d2d-sev-high)', color: 'var(--d2d-sev-high)' }), APPROVAL_TIER_LABEL[t?.tier] ?? t?.tier ?? '高危'),
          h('span', { ...panel.mono, style: { ...panel.mono.style, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: t?.command }, t?.command || '(无命令)'),
          h('span', panel.muted(0.5), `${created} · 期限 ${expiry}`)),
        c?.eng || c?.intent || c?.proposer_reason ? h('div', { ...panel.muted(0.55), style: { wordBreak: 'break-all' } },
          [c.eng ? `eng: ${c.eng}` : '', c.recent_task ? `任务: ${String(c.recent_task).slice(0, 80)}` : '', c.intent ? `意图: ${c.intent}` : '', c.proposer_reason ? `理由: ${c.proposer_reason}` : ''].filter(Boolean).join(' · ')) : null,
        c?.gate_summary ? h('div', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.6, wordBreak: 'break-all', fontSize: '10px' } }, `门: ${c.gate_summary}`) : null,
        h('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } },
          h('button', {
            ...panel.btn({ borderColor: 'var(--d2d-ok)', color: 'var(--d2d-ok)' }),
            disabled: Boolean(busyId),
            onClick: () => onDecide?.(t?.id, 'approved'),
          }, busyId === `${t?.id}:approved` ? '通过中…' : '通过'),
          h('button', {
            ...panel.btn({ borderColor: 'var(--d2d-sev-high)', color: 'var(--d2d-sev-high)' }),
            disabled: Boolean(busyId),
            onClick: () => onDecide?.(t?.id, 'rejected'),
          }, busyId === `${t?.id}:rejected` ? '驳回中…' : '驳回'),
          h('span', { ...panel.muted(0.45), style: { marginLeft: 'auto' } }, `${String(t?.id ?? '').slice(0, 8)} · 提案 ${t?.proposer ?? '?'}`)))
    }

    /** 审批 tab 容器: 队列列单 + 裁决动作(POST decideTicket; 重复裁决 409 由 host 转 code)。 */
    function ApprovalView({ visible }) {
      const { data, err, refresh } = useApprovals(visible)
      const [busyId, setBusyId] = useState('')
      const [actErr, setActErr] = useState('')
      const decide = async (id, decision) => {
        if (!id) return
        setBusyId(`${id}:${decision}`); setActErr('')
        try {
          await postJson('approval', { id, decision, decided_by: 'panel-human' })
          refresh()
        } catch (e) { setActErr(String(e?.message ?? e)) } finally { setBusyId('') }
      }
      const list = data?.approvals ?? []
      return h('div', panel.root, Style(),
        h(Card, {
          title: `审批队列 · ${data?.count ?? 0} 待决`,
          extra: h('span', { ...panel.muted(0.5), style: { display: 'inline-flex', gap: '5px', alignItems: 'center' } },
            h('span', panel.chip({ ...(data?.mode === 'off' ? {} : { borderColor: 'var(--d2d-warn)' }) }), `模式 ${data?.mode ?? '?'}`),
            h('span', panel.muted(0.45), 'off=仅记录 · queue=排队待决 · 裁决不经过本面板的任何门')),
        },
          err && !data ? h('div', { style: { fontSize: '11px', color: 'var(--d2d-sev-high)' } }, `审批队列不可用: ${String(err?.message ?? err).slice(0, 120)}`) : null,
          err && data ? h('div', panel.muted(0.45), `刷新失败(显示上次结果): ${String(err?.message ?? err).slice(0, 80)}`) : null,
          !err && !list.length ? h('div', panel.muted(0.45), '队列为空 — 高危操作触发审批门时在此出现(approval-requested 事件同步落 run-log)') : null,
          h('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px' } },
            list.map((t) => h(ApprovalTicket, { key: t?.id, t, onDecide: decide, busyId }))),
          actErr ? h('div', { style: { fontSize: '11px', color: 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, actErr) : null,
          h('div', { ...panel.muted(0.45), style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
            '授权与审批正交: 本面板裁决的是审批队列票据; 授权契约验签在调度环独立执行, 与此处无交互。')))
    }

    // ══════════ cards.ops.js — 运营可交互卡: Fleet 模型矩阵 / 策略库 / 黑名单 / 环容量热调 / 用量 / 性价比 ══════════
    // ---- Fleet 卡: 模型可点开选择列表(并集 + 自定义输入; backup 可清除) ----
    function FleetModelPicker({ role, slot, current, models, catalog, quotaHits, onPick, onCredential, busy }) {
      const [custom, setCustom] = useState('')
      const [keyFor, setKeyFor] = useState(null) // 正在补凭据的 provider
      const [keyVal, setKeyVal] = useState('')
      const [credMsg, setCredMsg] = useState(null)
      const isBackup = slot === 'backup'
      // catalog = dsh 已注册供应商/模型(host 从 settings.yaml + profiles/*/cordis.patch.yml 枚举);
      // models = 历史用过的模型(含手填自定义)。已用但不在 catalog 的单独一组保留, catalog 内的按供应商分组。
      const inCatalog = new Set((catalog ?? []).flatMap((p) => p.models.map((id) => `${p.provider}/${id}`)))
      const usedCustom = [...new Set([current, ...models].filter(Boolean))].filter((m) => !inCatalog.has(m))
      const hit = quotaHits?.includes?.(current)
      const modelBtn = (m, label, opts = {}) => h('button', {
        key: m + (opts.keySuffix ?? ''),
        disabled: busy,
        onClick: () => onPick(role, slot, m),
        title: m,
        ...panel.btn(m === current ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}, opts),
      }, label, m === current ? ' ✓' : '')
      return h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
        h('div', panel.muted(0.55), `选择 ${role}/${slot} 的模型(${(catalog ?? []).reduce((a, p) => a + p.models.length, 0)} 个来自 dsh 配置):`),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '220px', overflowY: 'auto', paddingRight: '2px' } },
          (catalog ?? []).filter((p) => p.models.length).map((p) => h('div', { key: p.provider, style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
            h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'baseline' } },
              h('span', { ...panel.mono, style: { ...(panel.mono.style ?? {}), fontSize: '10px', opacity: 0.75, minWidth: '86px' } }, p.provider),
              p.models.map((id) => modelBtn(`${p.provider}/${id}`, id, { keySuffix: `/${p.provider}` })),
              !p.hasKey ? h('button', {
                ...panel.btn({ padding: '0 6px', opacity: 0.85, borderColor: 'var(--d2d-warn)', color: 'var(--d2d-warn)' }),
                title: `该供应商未配置凭据(${p.apiKeyEnv || 'API KEY'}), 点此粘贴 API key 存入 dsh credentials(0600), 之后可无痕切换`,
                onClick: () => setKeyFor(keyFor === p.provider ? null : p.provider),
              }, '🔑 缺凭据') : null),
            keyFor === p.provider ? h('div', { key: `cred-${p.provider}`, style: { display: 'flex', gap: '4px', width: '100%' } },
              h('input', { ...panel.input({ flex: 1 }), type: 'password', placeholder: `粘贴 ${p.apiKeyEnv || 'API KEY'}(仅写入 dsh credentials 文件)`,
                value: keyVal, onChange: (ev) => setKeyVal(ev.target.value) }),
              h('button', { ...panel.btn(), disabled: busy || !keyVal, onClick: () => onCredential(p.provider, keyVal) }, '保存凭据')) : null)),
          usedCustom.length ? h('div', { key: 'used', style: { display: 'flex', flexWrap: 'wrap', gap: '4px', alignItems: 'baseline' } },
            h('span', { ...panel.mono, style: { ...(panel.mono.style ?? {}), fontSize: '10px', opacity: 0.75, minWidth: '86px' } }, '已用/自定义'),
            usedCustom.map((m) => modelBtn(m, shortModel(m)))) : null,
          isBackup ? h('button', {
            key: 'clear-backup',
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

    // ---- 策略库(#89 吸纳竞品): 知识卡全量浏览 — 关键词/类别过滤 + 战果(wins/hits) + 来源(confirmed/default) ----
    function StrategiesCard({ strategies }) {
      const [kw, setKw] = useState('')
      const [cat, setCat] = useState('')
      const list = (strategies ?? []).filter((s) => {
        if (cat && (s.category || 'general') !== cat) return false
        if (!kw) return true
        const blob = `${s.id} ${s.title} ${(s.applies_to ?? []).join(' ')}`.toLowerCase()
        return kw.toLowerCase().split(/\s+/).filter(Boolean).every((k) => blob.includes(k))
      }).sort((a, b) => (b.stats?.wins ?? 0) - (a.stats?.wins ?? 0) || a.id.localeCompare(b.id))
      const cats = [...new Set((strategies ?? []).map((s) => s.category || 'general'))].sort()
      return h(Card, { title: `策略库 · ${strategies?.length ?? 0} 张`, extra: h('span', panel.muted(0.45), 'confirmed=现役 / default=影子待实战') },
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px' } },
          h('input', { ...panel.input(), placeholder: '关键词过滤(id/标题/applies_to, 空格分隔与语义)', value: kw, onChange: (ev) => setKw(ev.target.value) }),
          h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
            h('button', { ...panel.btn(cat === '' ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}), onClick: () => setCat('') }, '全部'),
            cats.map((c) => h('button', { key: c, ...panel.btn(cat === c ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}), onClick: () => setCat(cat === c ? '' : c) }, c)))),
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '300px', overflowY: 'auto', paddingRight: '2px' } },
          list.slice(0, 80).map((s) => h('div', { key: s.id + s.source, style: { display: 'flex', gap: '7px', alignItems: 'baseline', minWidth: 0 } },
            h('span', { ...panel.mono, style: { ...(panel.mono.style ?? {}), fontSize: '10px', flex: '0 0 auto', opacity: 0.75 } },
              `${s.source === 'confirmed' ? '✓' : s.source === 'shadow' ? '◦' : '?'}${s.stats?.wins ? ` W${s.stats.wins}` : ''}`),
            h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }, title: `${s.id} · ${s.category}` }, s.title || s.id),
            h('span', panel.chip(), s.category || 'general'))),
          list.length > 80 ? h('div', panel.muted(0.5), `… 仅显示前 80/${list.length} 条, 请继续输入关键词收窄`) : null,
          !list.length ? h('div', panel.muted(0.5), '无匹配策略') : null))
    }

    // ---- R6.3: 黑名单独立卡 — 每行一条(域名/IP段), 行内增删改, 固定高度内滚 ----
    function DenylistCard({ snap, refresh }) {
      const [editing, setEditing] = useState(null) // `${kind}|${value}` 正在编辑的行
      const [draft, setDraft] = useState('')
      const [adding, setAdding] = useState(false)
      const [draftKind, setDraftKind] = useState('domains')
      const [draftVal, setDraftVal] = useState('')
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const rows = [
        ...(snap.denylist?.domains ?? []).map((v) => ({ kind: 'domains', v })),
        ...(snap.denylist?.cidr_prefix ?? []).map((v) => ({ kind: 'cidr_prefix', v })),
      ]
      const act = async (body) => {
        setBusy(true); setErr(null)
        try { await postJson('denylist', body); refresh() } catch (e) { setErr(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      const del = (kind, v) => {
        if (confirm(`从黑名单删除 ${v}?\n删除后该资产不再被写门/命令门拦截, 请确认它已不在授权排除清单内。`)) act({ op: 'del', kind, value: v })
      }
      return h(Card, {
        title: '⛔ 排除资产黑名单',
        extra: h('span', panel.muted(0.45), `${rows.length} 条 · 写门/命令门双层硬拦截`),
      },
        err ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)' } }, err) : null,
        !rows.length ? h('div', panel.muted(0.5), '黑名单为空 — denylist.json 未配置') : null,
        h('div', { style: { maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '2px' } },
          rows.map(({ kind, v }) => {
            const ek = `${kind}|${v}`
            return editing === ek
              ? h('div', { key: ek, style: { display: 'flex', gap: '4px', alignItems: 'center' } },
                h('input', { value: draft, autoFocus: true, onChange: (e) => setDraft(e.target.value), style: { flex: 1, minWidth: 0, fontSize: '11px', ...panel.mono.style }, onKeyDown: (e) => { if (e.key === 'Enter') { act({ op: 'update', kind, from: v, to: draft }); setEditing(null) } } }),
                h('button', { ...panel.btn({ padding: '1px 8px' }), disabled: busy, onClick: () => { act({ op: 'update', kind, from: v, to: draft }); setEditing(null) } }, '存'),
                h('button', { ...panel.btn({ padding: '1px 8px' }), onClick: () => setEditing(null) }, '×'))
              : h('div', { key: ek, style: { display: 'flex', gap: '4px', alignItems: 'center', minHeight: '20px' } },
                h('span', { ...panel.mono, style: { ...panel.mono.style, fontSize: '11px', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: kind === 'cidr_prefix' ? 'var(--d2d-warn)' : 'var(--d2d-sev-high)' } }, kind === 'cidr_prefix' ? `${v}* (IP段)` : v),
                h('button', { title: '修改', ...panel.btn({ padding: '0 6px' }), onClick: () => { setEditing(ek); setDraft(v) } }, '✎'),
                h('button', { title: '删除', ...panel.btn({ padding: '0 6px' }), disabled: busy, onClick: () => del(kind, v) }, '✕'))
          })),
        h('div', { style: { display: 'flex', gap: '4px', alignItems: 'center', borderTop: '1px dashed var(--d2d-line)', paddingTop: '4px', flexWrap: 'wrap' } },
          adding ? [
            h('select', { key: 'k', value: draftKind, onChange: (e) => setDraftKind(e.target.value), style: { fontSize: '10px' } },
              h('option', { value: 'domains' }, '域名'), h('option', { value: 'cidr_prefix' }, 'IP段')),
            h('input', { key: 'v', value: draftVal, autoFocus: true, placeholder: draftKind === 'domains' ? 'excluded.example.com' : '203.0.113.', onChange: (e) => setDraftVal(e.target.value), style: { flex: 1, minWidth: '80px', fontSize: '11px', ...panel.mono.style }, onKeyDown: (e) => { if (e.key === 'Enter') { act({ op: 'add', kind: draftKind, value: draftVal }); setAdding(false); setDraftVal('') } } }),
            h('button', { key: 'ok', ...panel.btn({ padding: '1px 8px' }), disabled: busy, onClick: () => { act({ op: 'add', kind: draftKind, value: draftVal }); setAdding(false); setDraftVal('') } }, '加'),
            h('button', { key: 'no', ...panel.btn({ padding: '1px 8px' }), onClick: () => setAdding(false) }, '×'),
          ] : h('button', { ...panel.btn({ padding: '1px 10px' }), onClick: () => setAdding(true) }, '+ 添加排除资产'))
      )
    }

    // ---- W4: 环容量热调卡 — 每环一行数值覆盖(verify/deep-dive/…/总并发/深环并行/水位), 写 caps.json 后
    //      调度器下个 tick 生效(免重启)。✕ 删除覆盖回落 env; 越界值由 host 写侧钳位报错。 ----
    function CapsCard({ snap, refresh }) {
      const [draft, setDraft] = useState({})
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const caps = snap.caps ?? {}
      const kindRows = [
        { key: 'verify', label: '仲裁 verify(独立重放)' },
        { key: 'deep-dive', label: '深挖 deep-dive(高信号)' },
        { key: 'chain', label: '链 chain(攻击链)' },
        { key: 'recon', label: '侦察 recon(覆盖)' },
        { key: 'creative', label: '创意 creative(假设)' },
        { key: 'link', label: '关联 link(跨端点)' },
      ]
      const globalRows = [
        { key: 'maxAgents', label: '总并发 maxAgents(1-8)' },
        { key: 'deepParallel', label: '深环并行 deepParallel(1-8)' },
        { key: 'backlogWatermark', label: '积压水位 watermark(5-500)' },
      ]
      const cur = (k) => (caps.caps && k in caps.caps ? caps.caps[k] : caps[k])
      const numOk = (k) => /^\d+$/.test(String(draft[k] ?? '').trim())
      const dirty = (k) => draft[k] !== undefined && String(draft[k]).trim() !== String(cur(k) ?? '')
      const act = async (updates) => {
        setBusy(true); setErr(null)
        try { await postJson('caps', { updates }); setDraft({}); refresh() } catch (e) { setErr(String(e?.message ?? e)) } finally { setBusy(false) }
      }
      const row = ({ key, label }, isKind) => {
        const override = cur(key)
        const has = override !== undefined && override !== null
        const save = () => { if (numOk(key) && dirty(key)) act(isKind ? { caps: { [key]: String(draft[key]).trim() } } : { [key]: String(draft[key]).trim() }) }
        const clear = () => act(isKind ? { caps: { [key]: '' } } : { [key]: '' })
        // 固定列宽 grid: 标签(1fr·省略) | 覆盖徽标(26px) | 输入(46px) | 存(22px) | ✕(22px) — 单元格恒渲染, 列列对齐
        return h('div', {
          key,
          style: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 26px 46px 22px 22px', gap: '4px', alignItems: 'center', minHeight: '22px' },
        },
          h('span', { style: { fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, label),
          h('span', { title: has ? '当前覆盖值' : undefined, style: { fontSize: '10px', color: 'var(--d2d-brand)', textAlign: 'right' } }, has ? `=${override}` : ''),
          h('input', {
            value: draft[key] ?? '', placeholder: 'env', disabled: busy,
            onChange: (e) => setDraft((d) => ({ ...d, [key]: e.target.value })),
            onKeyDown: (e) => { if (e.key === 'Enter') save() },
            style: { width: '100%', textAlign: 'center', fontSize: '11px', padding: '1px 2px', boxSizing: 'border-box', ...panel.mono.style },
          }),
          h('button', { ...panel.btn({ padding: '0' }), title: '保存覆盖', disabled: busy || !numOk(key) || !dirty(key), onClick: save, style: { ...panel.btn({ padding: '0' }).style, width: '22px', textAlign: 'center' } }, '存'),
          h('button', { ...panel.btn({ padding: '0' }), title: has ? '删除覆盖(回落 env)' : '无覆盖', disabled: busy || !has, onClick: clear, style: { ...panel.btn({ padding: '0' }).style, width: '22px', textAlign: 'center' } }, '✕'),
        )
      }
      return h(Card, {
        title: '⚙ 环容量热调',
        extra: h('span', panel.muted(0.45), caps.updated_at ? `更新于 ${caps.updated_at.slice(5, 16).replace('T', ' ')}` : '无覆盖·跟随 env'),
      },
        err ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)' } }, err) : null,
        h('div', { style: { maxHeight: '240px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '2px' } },
          kindRows.map((r) => row(r, true)),
          h('div', { style: { borderTop: '1px dashed var(--d2d-line)', margin: '3px 0' } }),
          globalRows.map((r) => row(r, false))),
        h('div', panel.muted(0.5), '写入即于调度器下个 tick 生效(免重启); ✕ 删除覆盖回落 env 基准'),
      )
    }

    function FleetCard({ fleet, run, refresh }) {
      const [open, setOpen] = useState(null) // `${role}/${slot}`
      const [busy, setBusy] = useState(false)
      const [err, setErr] = useState(null)
      const [credMsg, setCredMsg] = useState(null) // 凭据保存结果提示(本组件作用域 — 旧版误引 FleetModelPicker 内部 setter, 成功也抛 ReferenceError 且 refresh 不执行)
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
      const saveCredential = async (provider, key) => {
        setBusy(true); setErr(null); setCredMsg(null)
        try {
          await postJson('credential', { provider, key })
          setCredMsg(`${provider} 凭据已存入 dsh credentials`)
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
            open === key ? h(FleetModelPicker, { role, slot: 'primary', current: m.primary, models: fleet.models ?? [], catalog: fleet.catalog ?? [], quotaHits: run?.quotaHits, onPick: pick, onCredential: saveCredential, busy }) : null,
            open === keyB ? h(FleetModelPicker, { role, slot: 'backup', current: m.backup, models: fleet.models ?? [], catalog: fleet.catalog ?? [], quotaHits: run?.quotaHits, onPick: pick, onCredential: saveCredential, busy }) : null)
        }),
        err ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-sev-high)', wordBreak: 'break-all' } }, err) : null,
        credMsg ? h('div', { style: { fontSize: '10px', color: 'var(--d2d-brand)', wordBreak: 'break-all' } }, credMsg) : null)
    }

    // ---- 用量卡: 每模型调度次数(model-usage.jsonl 真实计数) ----
    function UsageCard({ run }) {
      const entries = Object.entries(run?.usage ?? {}).sort((a, b) => b[1] - a[1])
      const c = run?.cost
      const costHead = c ? h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '6px' } },
        h('span', { ...panel.chip({}), style: { fontSize: '9px' } }, `24h 派发 ${c.dispatches24h}`),
        h('span', { ...panel.chip({}), style: { fontSize: '9px' } }, `24h worker ${c.workerMin24h} 分钟`),
        h('span', { ...panel.chip({}), style: { fontSize: '9px' } }, `24h step ${c.steps24h}`),
        h('span', { ...panel.chip(c.quotaEvents24h ? { borderColor: 'var(--d2d-sev-high)', color: 'var(--d2d-sev-high)' } : {}), style: { fontSize: '9px' } }, `24h 额度事件 ${c.quotaEvents24h}`)) : null
      if (!entries.length) {
        return h(Card, { title: '模型用量' }, costHead, h('div', panel.muted(0.45), '无调度记录 — worker 派发后自动入列'))
      }
      const max = Math.max(...entries.map(([, n]) => n), 1)
      const total = entries.reduce((a, [, n]) => a + n, 0)
      return h(Card, { title: '模型用量 · 累计', extra: h('span', panel.muted(0.45), `共 ${total} 次调度`) },
        // R5: 口径标注 —— 这是自安装起跨轮次的累计记账, 不是当前 engagement 的
        costHead,
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', paddingRight: '2px' } },
          h('div', panel.muted(0.45), '自安装起全部轮次的 worker 派发记账(含已停止轮次)'),
        entries.map(([m, n]) => h('div', { key: m, style: { display: 'grid', gridTemplateColumns: 'minmax(64px, 38%) 1fr auto', gap: '6px', alignItems: 'center' } },
          h('span', { ...panel.mono, style: { ...panel.mono.style, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: m }, shortModel(m)),
          h('div', { style: { height: '6px', borderRadius: '3px', background: 'var(--d2d-line)', overflow: 'hidden' } },
            h('div', { style: { height: '100%', width: `${Math.round((n / max) * 100)}%`, borderRadius: '3px', background: run?.quotaHits?.includes?.(m) ? 'var(--d2d-sev-high)' : 'var(--d2d-brand)' } })),
          h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: '.7' } }, `${n} 次`, run?.quotaHits?.includes?.(m) ? ' ⚠' : '')))))
    }

    // ---- 性价比卡(阶段2): 每 10 万 input tokens 的产出密度 — findings/triaged 两个口径。
    //      公式: n_per_100k = n × 100000 ÷ input_tokens(host 侧 costEfficiency 预算, tokens=0 → null)。 ----
    function fmtTokens(n) {
      const v = Number(n ?? 0)
      if (v >= 1e8) return `${(v / 1e8).toFixed(2)}亿`
      if (v >= 1e4) return `${(v / 1e4).toFixed(1)}万`
      return String(Math.round(v))
    }
    function CostCard({ snap }) {
      const c = snap.cost
      const has = Boolean(c && c.inputTokens > 0)
      const row = (value, label) => h('div', { style: { display: 'flex', alignItems: 'baseline', gap: '6px', minWidth: 0 } },
        h('span', { style: { fontSize: '18px', fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: '52px' } },
          value === null || value === undefined ? '—' : String(value)),
        h('span', panel.muted(0.55), label))
      const srcLabel = c?.source === 'per-eng' ? '本项目账本'
        : c?.source === 'global-filtered' ? '全局账本·按项目过滤'
        : '无 token 账本'
      return h(Card, {
        title: '性价比 · 产出密度',
        extra: h('span', panel.muted(0.45), srcLabel),
      },
        has
          ? h('div', { style: { display: 'flex', flexDirection: 'column', gap: '3px' } },
            row(c.findingsPer100k, 'findings / 10万 input tokens'),
            row(c.triagedPer100k, 'triaged / 10万 input tokens'))
          : h('div', panel.muted(0.45), '尚无 input token 账本(runs/<eng>/model-usage.jsonl) — worker 跑起来后自动生成'),
        h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
          h('span', panel.chip({ borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' }), `输入 ${fmtTokens(c?.inputTokens)} tokens`),
          h('span', panel.chip(), `输出 ${fmtTokens(c?.outputTokens)} tokens`),
          h('span', panel.chip(), `派发 ${c?.dispatches ?? 0} 次`)),
        has ? h('div', panel.muted(0.45), `总消耗 ${fmtTokens((c?.inputTokens ?? 0) + (c?.outputTokens ?? 0))} tokens · findings ${c?.findings ?? 0} / triaged ${c?.triaged ?? 0}`) : null)
    }

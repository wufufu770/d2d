    // ══════════ view.xring.js — XR-P2 X-Ring tab: 旁路探索通道只读投影(过程可见, M6) ══════════
    // 数据面: snapshot.xring 节(host 侧 readXringRuns 只读聚合记录面, fail-soft) —— view 不直读
    // 文件系统。红线(拍板 1): 本 tab 零写零动作 —— 无交互控件/无事件处理器/无写端点引用,
    // 不提供任何干预入口; 停止唯一例外 = CLI(node scripts/xring/cli.mjs stop <runDir> 写
    // stop-request, 监控进程消费)。空态=尚未跑过任何 run, 合法形态。

    /** 秒 → 人读时长(smoke 实测 36.5s ~ 预算上限 6h 全覆盖)。 */
    function xringElapsed(sec) {
      if (sec == null) return '—'
      if (sec < 90) return `${sec}s`
      if (sec < 5400) return `${Math.round(sec / 60)}m`
      return `${(sec / 3600).toFixed(1)}h`
    }

    /** 历史 run 行(也用于当前 run 首行): 时间/状态/标识/耗时/工件计数。 */
    function XRingRunRow({ r }) {
      const running = r?.status === 'running'
      return h('div', { style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
        h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.55, flex: '0 0 auto' } }, String(r?.startedAt ?? '').slice(5, 16).replace('T', ' ')),
        h('span', panel.chip({ ...(running ? { borderColor: 'var(--d2d-brand)', color: 'var(--d2d-brand)' } : {}) }),
          running ? 'running' : `stopped${r?.stopReason ? `·${r.stopReason}` : ''}`),
        h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.7, flex: '0 0 auto', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: `${r?.eng}/${r?.runId}` }, `${r?.eng}/${r?.runId}`),
        h('span', panel.muted(0.6), xringElapsed(r?.elapsedSec)),
        h('span', panel.muted(0.5), r?.artifacts ? `A:${r.artifacts.A ?? '?'} B:${r.artifacts.B ?? '?'} C:${r.artifacts.C ?? '?'}` : '工件计数待回流'))
    }

    /** X-Ring tab 容器: 当前 run/预算/工件计数/事件尾窗/历史列表 —— 全部只读投影。 */
    function XRingView({ visible }) {
      const { snap, err, refresh } = useSnapshot(visible)
      if (err && !snap) return h('div', panel.root, Style(), h(FailClosedBanner, { err, onRetry: refresh }))
      if (!snap) return h('div', panel.root, Style(), h(Skeleton, null))
      const x = snap?.xring
      if (!x?.available || !(x.runs ?? []).length) {
        return h('div', panel.root, Style(),
          h(Card, {
            title: 'X-Ring 旁路探索(只读投影)',
            extra: h('span', panel.muted(0.45), '零干预入口 —— 停止: node scripts/xring/cli.mjs stop <runDir>'),
          },
            h('div', panel.muted(0.45), `无 X-Ring run 记录（记录面 ${x?.base || '~/.d2d-data/xring'}）—— 尚未运行过任何 run（合法空态）`)))
      }
      const cur = x.runs[0]
      const kids = [
        h('div', { key: 'chips', style: { display: 'flex', gap: '5px', flexWrap: 'wrap', alignItems: 'baseline' } },
          h('span', panel.chip({ ...(x.activeCount ? { borderColor: 'var(--d2d-brand)' } : {}) }), `活跃 run ${x.activeCount}`),
          h('span', panel.chip(), `历史 ${x.runs.length}`)),
        ...((x.degraded ?? []).map((d, i) => h('div', { key: `dg${i}`, ...panel.chip({ borderColor: 'var(--d2d-warn)' }) }, d))),
        h('div', { key: 'cur', style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px', display: 'flex', flexDirection: 'column', gap: '3px' } },
          h(XRingRunRow, { r: cur }),
          h('div', panel.muted(0.5), cur.budget ? `预算 ${cur.budget.maxHours ?? '?'}h / ${Number(cur.budget.maxTokens ?? 0).toLocaleString()} token 上限` : '预算参数缺（超长 run 推导窗外）'),
          h('div', panel.muted(0.5), cur.lastTick ? `最近预算判定: ${cur.lastTick.ok ? 'ok' : '超限'} · ${cur.lastTick.detail}` : '无预算 tick'),
          h('div', panel.muted(0.5), 'token 计数运行中不可得（dsh 转录会话级落盘, 退出才压缩）—— 时长为主旋钮'),
          cur.artifacts
            ? h('div', panel.muted(0.5), `回流: 写入 ${cur.artifacts.reflow?.written ?? 0} / 留验 ${cur.artifacts.reflow?.held ?? 0} / 错误 ${cur.artifacts.reflow?.errors ?? 0}`)
            : null),
        ...(x.runs.length > 1
          ? [h('div', { key: 'hist', style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px', display: 'flex', flexDirection: 'column', gap: '3px', maxHeight: '160px', overflowY: 'auto' } },
            x.runs.slice(1).map((r, i) => h(XRingRunRow, { key: i, r })))]
          : []),
        h('div', { key: 'events', style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px', display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '220px', overflowY: 'auto' } },
          (cur.events ?? []).length
            ? cur.events.slice().reverse().map((e, i) => h('div', { key: i, style: { display: 'flex', gap: '6px', alignItems: 'baseline', minWidth: 0 } },
              h('span', { ...panel.mono, style: { ...panel.mono.style, opacity: 0.55, flex: '0 0 auto' } }, String(e.ts ?? '').slice(5, 19).replace('T', ' ')),
              h('span', panel.chip(), e.event),
              h('span', { ...panel.muted(0.6), style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, title: [e.reason, e.detail].filter(Boolean).join(' · ') }, [e.reason, e.detail].filter(Boolean).join(' · '))))
            : h('div', panel.muted(0.45), '无事件')),
        h('div', { key: 'note', ...panel.muted(0.45), style: { borderTop: '1px dashed var(--d2d-line)', paddingTop: '5px' } },
          '模型自主循环产物经 host 回流管道入图（A 级必经 verify）—— 本 tab 全数据面 GET 只读, 与主流程零耦合。'),
      ]
      return h('div', panel.root, Style(),
        h(Card, {
          title: 'X-Ring 旁路探索(只读投影)',
          extra: h('span', panel.muted(0.45), '零干预入口 —— 停止: node scripts/xring/cli.mjs stop <runDir>'),
        }, ...kids))
    }

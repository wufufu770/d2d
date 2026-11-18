    // ══════════ chart.js — B13 vendored echarts 封装(EChart 通用组件) ══════════
    // chunk 懒执行: 注册时零副作用, 首个图表挂载才执行 echarts UMD(CJS 分支导出)。
    let __echartsApi = null
    function echartsApi() {
      if (__echartsApi) return __echartsApi
      const reg = globalThis.__dshChunks__ || {}
      if (reg['d2d-echarts']) __echartsApi = reg['d2d-echarts'](() => ({}))
      return __echartsApi || globalThis.echarts || null
    }

    /** EChart 通用组件: option 驱动(canvas), 事件表挂接, 卸载 dispose, 窗口 resize 自适应。 */
    function EChart({ option, height = '260px', onEvents }) {
      const boxRef = { current: null }
      useEffect(() => {
        const ec = echartsApi()
        if (!boxRef.current || !ec) return undefined
        const chart = ec.init(boxRef.current, null, { renderer: 'canvas' })
        chart.setOption(option)
        for (const [ev, fn] of Object.entries(onEvents ?? {})) {
          if (typeof fn === 'function') chart.on(ev, fn)
        }
        const onResize = () => chart.resize()
        window.addEventListener('resize', onResize)
        return () => { window.removeEventListener('resize', onResize); chart.dispose() }
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, [JSON.stringify(option)])
      return h('div', { ref: boxRef, style: { width: '100%', height, minWidth: 0 } })
    }

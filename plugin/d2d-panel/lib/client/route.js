    // ══════════ route.js — B12 hash URL 路由 + 跨页签过滤参数同步 ══════════
    // 宿主路由所有权实证(B11 调研): dsh web 主 bundle 内 location.hash/pushState/
    // replaceState 零出现——hash 命名空间完全自由, 面板用 #d2d?tab=...&k=v 不与宿主冲突。
    function parseD2dHash(defaultTab = 'ops') {
      const raw = String(window.location.hash || '')
      const qIdx = raw.indexOf('?')
      const qs = new URLSearchParams(qIdx >= 0 ? raw.slice(qIdx + 1) : '')
      const tab = qs.get('tab') || defaultTab
      const params = {}
      for (const [k, v] of qs.entries()) {
        if (k !== 'tab' && v !== '') params[k] = v
      }
      return { tab, params }
    }

    function buildD2dHash(tab, params = {}) {
      const qs = new URLSearchParams()
      qs.set('tab', tab)
      for (const [k, v] of Object.entries(params)) {
        if (v != null && v !== '') qs.set(k, String(v))
      }
      return `#d2d?${qs.toString()}`
    }

    /** 面板主路由: hash 双向同步(tab+过滤参数)。navigate 写 hash → hashchange 回流统一
     *  状态源; params 随路由携带(跨页过滤参数, 如 findings 页的 state 筛选)。 */
    function useD2dRoute(validTabs, defaultTab = 'ops') {
      const normalize = useCallback((parsed) => ({
        tab: validTabs.includes(parsed.tab) ? parsed.tab : defaultTab,
        params: parsed.params,
      }), [validTabs, defaultTab])

      const [route, setRoute] = useState(() => normalize(parseD2dHash(defaultTab)))

      useEffect(() => {
        const onHash = () => setRoute(normalize(parseD2dHash(defaultTab)))
        window.addEventListener('hashchange', onHash)
        return () => window.removeEventListener('hashchange', onHash)
      }, [normalize, defaultTab])

      const navigate = useCallback((nextTab, nextParams = {}) => {
        const targetTab = validTabs.includes(nextTab) ? nextTab : defaultTab
        const nextHash = buildD2dHash(targetTab, nextParams)
        if (window.location.hash !== nextHash) {
          window.location.hash = nextHash
        } else {
          setRoute({ tab: targetTab, params: nextParams })
        }
      }, [validTabs, defaultTab])

      return { tab: route.tab, params: route.params, navigate }
    }
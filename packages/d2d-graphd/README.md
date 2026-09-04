# @wufufu770/d2d-graphd

包装 `graphd/`（Python kuzu 图服务）的启动与 HTTP 客户端。

## 客户端（src/client.mjs）

零依赖，stdlib `fetch` 封装：

```js
import { createClient } from '@wufufu770/d2d-graphd/client'
const g = createClient({ baseUrl: 'http://127.0.0.1:8766', hostToken: process.env.P2P_HOST_TOKEN })
await g.health()
const r = await g.query('MATCH (f:Finding) RETURN f LIMIT 10')
await g.writeFinding({ title: 'RCE', severity: 'high', target: '10.0.0.1' })
await g.writeSignal({ kind: 'heartbeat', worker: 'w1' })
await g.transition({ findingId: 'f1', to: 'verified' })
```

- 非 2xx 一律抛 `GraphdError`（携带 `status` 与响应摘要），便于上游区分错误分支；
- `fetch` 可注入（`createClient({ fetch: mockFetch })`），测试零网络。

## postinstall：诚实版，不静默装东西

`src/postinstall.mjs` **默认 noop**，只打印指引。参考实现在 postinstall 里静默 `pip install`
是缺陷（构建机/离线环境炸、供应链面扩大），这里明确不装任何东西。

kuzu 版本钉定说明：`graphd/app.py` 依赖 kuzu（Python 包），版本由仓库根
`requirements.txt` 钉定。需要安装时由用户手动执行：

```bash
pip install -r requirements.txt   # 含钉定版本的 kuzu
python3 graphd/app.py             # 默认 http://127.0.0.1:8766
```

## 启动

本包不负责拉起 Python 进程；`d2d doctor`（见 @wufufu770/d2d-cli）会探测 `/health`。

# d2d-panel — dsh Web UI 侧栏观测台

> d2d 三环渗透系统的只读观测面板: better-sidebar 侧栏双 tab(ops + findings),
> host 半同源路由聚合 graphd 快照, **token 全程不出 host**。规格: `docs/PANEL-UI-SPEC.md`。

## 形态

```
dsh --profile web
├─ host 半(本插件, Node)
│  └─ ctx.webServer.register('/d2d/api')   ← 同源路由 + 浏览器信任栅栏(与 /api 同一道)
│     ├─ GET /d2d/api/health               ← 存活探针
│     └─ GET /d2d/api/snapshot             ← 一条聚合响应(微缓存 0.5s + 单飞合并)
│        └─ 只读 MATCH → graphd :8766(host token, ~/.config/d2d/host-token)
└─ client 半(浏览器, window.__ModuleLoader__ 包)
   ├─ d2d:ops tab(order 60, badge=存活 worker 数)
   │   └─ engagement 卡 / workers 心跳(zombie 前端时钟判定) / 开放信号 tail / fleet 模型矩阵
   └─ d2d:findings tab(order 61, badge=已验证数)
       └─ 七态管线步进器 + 4 宏观列看板(活跃/已验证/已交付/已驳回) + 卡片展开
```

## 安装

```bash
dsh plugin --profile web add dsh-better-sidebar   # 前置: 侧栏底座
dsh plugin --profile web add github:<你>/d2d#main  # 或本地: 见下方开发节
# graphd 需在 :8766 运行(P2P_GRAPHD 可覆盖); host token 在 ~/.config/d2d/host-token
```

本地开发挂载(profile 手工接线):

```bash
# ~/.dsh/profiles/web/package.json
#   dependencies += "d2d-panel": "link:<repo>/plugin/d2d-panel"
#   dsh.profile.bundles += "d2d-panel"
cd ~/.dsh/profiles/web && pnpm install && dsh --profile web
```

## 契约要点

- **只读观测**: 无写端点; 全部查询为 MATCH; wire 不带 evidence 全文与 repro(抽屉件 P3)
- **fail-closed**: graphd 不可达 → 503, 前端 fail-closed 横幅, 不展示过期快照
- **浏览器永不碰凭证**: host 侧读 token 加 X-Auth; 信任栅栏 = Host loopback/受信 + sec-fetch-site + Origin 同源
- **DSW 令牌**: 面板表面 `--dsw-alias-bg-layer-1`, 零硬编码主题色; severity/ring 为安全语义色(局部 CSS 变量, 低饱和)
- **visible 门控**: tab 不可见时轮询完全静默; zombie 判定纯前端时钟(每秒走字不占轮询)
- **渲染安全**: 全部文本走 React 文本节点(结构免疫 XSS), 无 dangerouslySetInnerHTML
- **软依赖**: 未装 better-sidebar 时 client 恒 pending、注册静默跳过, host 半路由不受影响

## 开发

```bash
node --test plugin/d2d-panel/test/snapshot.test.mjs   # host 半聚合单测(8 项)
node plugin/d2d-panel/lib/host/standalone.mjs          # 调试用 loopback 服务(:8790, 无需 dsh web)
```

文件:

| 文件 | 职责 |
|---|---|
| `lib/host/snapshot.mjs` | 快照聚合纯逻辑(字段名与 graphd/app.py schema 逐字对齐)+ graphd 查询客户端 |
| `lib/host/index.mjs` | 插件宿主入口: webServer 同源路由 + 信任栅栏 + 微缓存单飞 |
| `lib/host/standalone.mjs` | 调试 CLI: loopback 观测服务(不依赖 dsh web) |
| `lib/client.js` | 浏览器半(`__ModuleLoader__` 手工内联打包, 零构建; 分节对应原模块) |
| `test/snapshot.test.mjs` | 聚合逻辑单测(node:test) |

## 状态

P0(host 半代理)+ P1(client 骨架)已实施并通过单测; P2(六卡补全/attempt 刻度)、
P3(findings 抽屉/鱼骨轨迹/配额卡)、P4(Playwright 验证)见 PANEL-UI-SPEC §8。

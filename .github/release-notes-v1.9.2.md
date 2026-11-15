# d2d v1.9.2

> 安全清洗与面板可访问批（1.9.0 → 1.9.2；1.9.1 为文档/license 面内部步进未发版，本版一并覆盖）。
> 同期 d2d-panel 0.3.0 → 0.4.0（链接包随仓，不单独发 npm）。

## 安全清洗（Breaking-free 行为零变）

- **测试夹具字面量化**：tests 降级 schema 工厂（3b/3a/3e/351）DDL 变体全部 if 分派字面量（AST
  stub 逐字节实证），fixture URL 收敛 `_api_url`（urljoin + 回环白名单 fail-closed）——扫描器
  误报归零，443 pytest 全绿。
- **生产面显式化**：scheduler `q()/graphdUp()` 与 index.js idleBusyProbe 模板串拼接 → `new URL()`
  标准解析器；loadKnowledge 正则归一链 → `path.resolve + containment 校验`（越界空回落）。

## 面板可访问（d2d-panel 0.3.1）

- 浏览器信任栅栏信任面扩为 回环 ∪ 本机非内部接口地址（每请求现取，DHCP 变更即时生效）——
  LAN 绑定形态宿主机可访问；sec-fetch-site/Origin 两层闸原样（伪造外部 Host 仍 403）。

## 面板图谱独立页 + 风格全量对齐（d2d-panel 0.3.1 → 0.4.0）

- **d2d 图谱独立页**：dsh 侧栏第二入口（VizView 同组件全页直开）。
- **B10 风格批**：DSW alias 首选令牌桥接 + 玻璃卡 + 底线 Tab（emerald 激活 + 图标）+ LIVE pill
  + 彩色数值 metrics + 环容量 3 列 Form Row + 工单 ID code 块复制 + 圆点 tone badge + 模块 pill。
- **交互层**：审计/工具结构化表格 + 搜索；DetailSheet 侧滑抽屉（fixed 快照、Esc/遮罩关闭、
  Copy JSON）；桑基家族渐变 + hover 联动；Card 图标头 28 处。

## 运维

- start-all.sh：egress 8888→18888 缺省（P2P_PROXY_PORT 可覆盖）、WEB_HOST env、wait_port
  host/超时参数化 + 报错文案参数化。

## 质量面

- panel 107/0（含 B10 守卫探针）· align 3/3（30 路由↔21 消费点）· pytest 443 全绿 · mocha 13/0。
- 授权测试专用；安全问题见 SECURITY.md。

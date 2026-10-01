---
id: skill:spa-auth-bypass-replay
title: "SPA 前端守卫↔后端鉴权分离 三点重放"
category: web
version: 1
status: quarantined
signal_affinity:
  - jwt
  - token
  - oauth
  - callback
  - admin
  - 路由守卫
  - 鉴权
rings:
  - deep
evidence:
  - "tests/golden-targets/spa-attack-acceptance.md V1/V2 实证"
  - "verify-result 回放矩阵(positive/negative 双侧)"
refs:
  - "spa-attack-acceptance.md"
  - "OWASP WSTG Session Management"
created_at: 2026-10-01
---

# 触发
SPA 站点(前端框架路由 + REST API)且发现以下任一指纹: 前端路由守卫(localStorage/sessionStorage 存
登录态)、`/api/admin/*` 或 `/api/manage/*` 管理面路径、OAuth/OIDC callback 端点、Bearer token 存放
于浏览器存储。黄金靶实证: V1(/api/admin/stats 无鉴权 200)与 V2(OAuth callback 参数污染)同源。

# 步骤
1. **服务端权威面重放**(先于前端验证): 直 curl `GET /api/admin/*` 全部管理端点(不带任何凭据),
   记录 200/401/403 分布 — 前端守卫存在与否不影响服务端判定。
2. **OAuth callback 污染**: 对 callback 端点逐参数做值替换(state/code/redirect), 观察校验器是否
   信任客户端输入; 记录 token 是否出现在可外带位置(URL/next 参数)。
3. **会话接管判定**: 若 token 可外带, 用外带 token 以全新设备(无 cookie)重放受保护端点,
   确认可接管会话。
4. 每步记录请求/响应全量(五段回放矩阵素材: baseline/positive/negative/impact/stop)。

# 验证
- 阳性: 无凭据直打管理 API 稳定 200 且返回业务数据(非登录页/空壳); 外带 token 在全新设备可复现受保护操作。
- 双重验证: 同一请求加合法低权凭据对比(权限边界清晰), 排除"本来就该公开"的端点。

# 阴性
- 管理端点 401/403 或返回登录页 HTML = 服务端已鉴权, 前端守卫缺失不构成漏洞。
- 仅能读取自身会话数据 = 无越权, 属正常业务。
- callback 参数被服务端 state 校验拒绝 = 防护在位。

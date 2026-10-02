// business-gate-samples.mjs — BG-1 业务形态卡示例(黄金靶集实况; 供 schema 测试与 BG-2 演示)
// 事实来源: tests/golden-targets/baseline.md(DVWA 审计实证)与 spa-attack-acceptance.md(V1-V3 实证)。
// 示例卡内容全部来自公开靶场事实, 不含真实目标信息。

export const DVWA_BUSINESS_CARD = {
  id: 'bizcard:dvwa-golden',
  eng: 'dvwa-golden',
  title: 'DVWA 黄金靶: 登录→指令执行→文件上传 业务面',
  business_workflow: '单容器 Apache+MariaDB: login.php 表单登录(username/password/Login + user_token anti-CSRF) → 漏洞训练页按难度等级渲染(安全级别由 cookie security=low/medium/high 控制且无持久化, 默认 low) → 文件上传落 /hackable/uploads/ 可直接访问执行; 登录判据 dvwaIsLoggedIn 控制 Logout 菜单渲染。',
  expected_constraints: [
    'user_token 逐请求校验(checkToken), 缺 token 的状态变更请求应被拒',
    '安全级别 cookie 服务端应约束可选项, 非法值不生效',
    '上传目录不应允许服务端脚本执行(无 .htaccess 限制是已知故意缺陷)',
    'Logout 仅登录态可见(未登录访问管理面应重定向)',
  ],
  param_semantics: [
    'username/password: 登录凭据(表单字段 login.php:90-97)',
    'user_token: anti-CSRF 会话令牌(login.php:12 checkToken)',
    'security: 难度 cookie(low/medium/high/impossible), 影响漏洞页过滤逻辑',
    'Upload 页表单 file: 上传文件字段, 落 hackable/uploads/',
  ],
  known_gaps: [
    '上传目录 29 个历史 webshell 残留且可执行(baseline.md 实测, 无 .htaccess)',
    '安全级别 cookie 无持久化与强校验(可预测切换)',
  ],
  evidence: ['tests/golden-targets/baseline.md', 'dvwa-reset.sh 审计实证'],
  generated_by: 'bg-1-sample',
  created_at: '2026-09-30',
}

export const SPA_BUSINESS_CARD = {
  id: 'bizcard:spa-golden',
  eng: 'spa-golden',
  title: 'SPA 黄金靶: 前端守卫↔后端鉴权分离 三漏洞业务面',
  business_workflow: 'notes 应用: hash 路由前端(#/login→#/notes→#/admin)带 localStorage 路由守卫(客户端摆设) → 后端 /api/notes CRUD 与 /api/admin/stats 管理统计; V2 OAuth 登录流 callback 校验器受攻击者输入污染; V3 管理面板帧面经 WebSocket 推送渲染(innerHTML sink)。三个故意漏洞横跨 HTTP 可见面(V1)/渲染盲区(V2)/帧盲区(V3)。',
  expected_constraints: [
    '/api/admin/* 必须服务端鉴权(前端守卫只是摆设, 服务端才是权威)',
    'notes CRUD 应校验会话归属(跨用户不可读写)',
    'OAuth callback 的 state/code 校验不得信任客户端可控输入',
    'WS 帧推送的管理面板内容不得进入 innerHTML sink',
  ],
  param_semantics: [
    'Authorization Bearer token: API 会话凭据(V2 实证可外带)',
    'note id: CRUD 定位符(可枚举性是越权测试面)',
    'OAuth callback code/state: 授权码交换参数(V2 污染点)',
    'WS frame payload: 管理面板渲染输入(V3 注入点)',
  ],
  known_gaps: [
    'V1: /api/admin/stats 无任何鉴权(200 直接回)',
    'V2: OAuth callback 校验器参数污染(可外带 token+会话接管)',
    'V3: 跨客户端帧注入三件套(innerHTML sink)',
  ],
  evidence: ['tests/golden-targets/spa-attack-acceptance.md', 'tests/golden-targets/baseline.md §3'],
  generated_by: 'bg-1-sample',
  created_at: '2026-09-30',
}

aliases: demo-src.cn, demo-src.example
# demo-src.com — 示例站点经验(占位域名, 格式示范)

## 登录与身份
- 统一登录在 sso.demo-src.com，业务站 Cookie 跨域共享（SSO 联动测试参考 card:sso-cross-domain）

## 接口习惯
- API 前缀 /api/v2，错误统一 {code,msg}，数字 id 自增（IDOR 优先测）

## 已知坑
- WAF 对单引号拦截但对 %27 放行（历史观察，需复核）
- 验证码只在前端校验（待复核，card:captcha-bypass 四路）

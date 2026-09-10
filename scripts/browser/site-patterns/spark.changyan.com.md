# spark.changyan.com 站点经验（0909 登录态轮）

- 登录态: Cookie 文件在 `~/.d2d-data/credentials/spark-changyan.cookie`（单行, 权限 600）。登录态功能验证用 `curl -b "$(cat ~/.d2d-data/credentials/spark-changyan.cookie)"` 或 `-H "Cookie: $(cat ...)"` 读取。**严禁把 Cookie 值写入报告/图节点/git/提交信息**——只引用文件路径。
- CAS 票据域: `CAS-CONSUMER-*` 签发域为 open.changyan.com；登录态接口（ucenter/会员/AI 对话）优先带全量 Cookie 头。
- 已知登录态面: ucenter 个人中心、会员/权益功能、AI 对话额度与多模型切换、团队/协作角色边界。
- 登录态纪律: 越权测试用**双自建账号对照**，不碰他人数据；只证越权即停，不批量拉取。
- 平台口径: security.iflysec.com 是提交渠道**禁止测试**；test/pre 域与 36.7.172.0/24、117.48.149.0/25 已在 scope 排除；纯 CORS 加固/无 gadget 原型污染类按平台口径跳过。

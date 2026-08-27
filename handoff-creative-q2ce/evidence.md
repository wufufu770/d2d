# Evidence Log - Red Team Theorist (creative-q2ce)

## Session: 2026-08-26T18:xx UTC

### 1. Graph State Analysis

**Refuted Signals (3):**
- s-1787765940750 - type: unknown, no evidence (early probe)
- s-1787765940827 - type: unknown, no evidence (early probe)
- s-1787765940905 - type: unknown, no evidence (early probe)

All three refuted signals lack concrete evidence strings, suggesting early-stage endpoint existence probes that returned negative results. Deprioritized per rules, not absolute blockers.

**Open Hypotheses (18 existing before this session):**
- seed-76nzzk - crAPI recon (strategy: recon_refresh)
- seed-u54lvl - OWASP API Top10 (strategy: inversion)
- hyp-ssrf-deep-inversion - SSRF blind/secondary exploitation
- hyp-idor-vehicle-inversion - IDOR expansion to vehicle/community
- hyp-bfla-mechanic-inversion - BFLA on mechanic endpoints
- hyp-otp-bypass-inversion - OTP bypass without interception
- hyp-jwt-forge-inversion - JWT alg confusion/replay
- hyp-mass-assignment-inversion - Mass assignment on multiple endpoints
- hyp-internal-service-inversion - Direct DB access via .env credentials
- hyp-coupon-race-inversion - Race condition on coupon application
- hyp-actuator-devtools-creative - Spring Boot actuator exposure
- hyp-swagger-docs-creative - Swagger/OpenAPI documentation leak
- hyp-admin-debug-paths-creative - Admin/debug path discovery
- hyp-graphql-hidden-creative - Hidden GraphQL endpoint

**Confirmed Findings (7):**
1. finding-jwt-alg-none-complete - JWT alg:none → full account takeover
2. finding-bola-order-pii - BOLA on orders → PII + payment card exposure
3. finding-admin-account-takeover - Admin takeover via JWT forgery (925156 credit)
4. finding-env-credential-leak - .env exposed → DB credentials
5. finding-jwks-exposed - JWK Set publicly accessible
6. finding-deprecated-login-token - Deprecated v2.7 login-with-token still active
7. finding-internal-service-leak - Internal hostnames leaked via SSRF error

**Endpoints (27 total):** Across identity (14), workshop (6), community (4), static (1).

### 2. Coverage Gap Analysis

**Endpoints NOT linked to any hypothesis before my session:**
- ep-reset-password (/identity/api/v2/user/reset-password)
- ep-add-vehicle (/identity/api/v2/vehicle/add_vehicle)
- ep-orders-all (/workshop/api/shop/orders/all)
- ep-order-detail (/workshop/api/shop/orders/orderId)
- ep-return-order (/workshop/api/shop/return_order)
- ep-community-comment (/community/api/v2/community/posts/postId/comment)
- ep-products (/workshop/api/shop/products)
- ep-unlock (/identity/api/auth/unlock)

### 3. New Hypotheses Created (10 inversion + 2 creative links)

| ID | Strategy | Key Inversion | Target Endpoints |
|----|----------|---------------|------------------|
| hyp-unlock-password-reset-inversion | inversion | unlock/reset-password不校验session归属→任意账户密码重置 | ep-unlock, ep-reset-password, ep-forget-password |
| hyp-return-order-refund-inversion | inversion | return_order接受额外金额/地址字段→超额退款+竞态套利 | ep-return-order, ep-apply-coupon |
| hyp-product-search-injection-creative | creative | products/orders-all搜索参数→NoSQL/SQL注入 | ep-products, ep-orders-all |
| hyp-add-vehicle-mass-assignment-inversion | inversion | add_vehicle接受owner_id/role等额外字段→权限提升 | ep-add-vehicle |
| hyp-community-comment-stored-payload-inversion | inversion | 评论API直接存储HTML/JS→存储型XSS→JWT窃取链 | ep-community-comment |
| hyp-jwt-none-admin-data-extraction | inversion | 已确认JWT alg:none后未深入枚举全量用户PII和GPS | ep-dashboard, ep-orders-all, ep-vehicle-location |
| hyp-content-type-confusion-inversion | inversion | Content-Type切换绕过WAF和输入校验 | ep-change-email, ep-video-convert |
| hyp-http-method-confusion-inversion | inversion | HTTP方法切换绕过POST专用OTP校验 | ep-dashboard, ep-change-email, ep-order-detail |
| hyp-ssrf-file-protocol-deep-inversion | inversion | SSRF利用file://gopher://协议读取敏感文件+PG直连 | ep-video-convert, ep-env-file |
| hyp-internal-api-trust-chain-inversion | inversion | 微服务间无认证→SSRF伪造内部请求→DB直连dump全表 | ep-video-convert, ep-env-file |
| hyp-otp-race-token-reuse-inversion | inversion | OTP token重用窗口+admin密码重置→admin接管 | ep-check-otp, ep-forget-password, ep-verify |
| hyp-order-enumeration-complete-data-inversion | inversion | 遍历order 1-1000提取全量PII+admin视角差异数据 | ep-orders-all, ep-order-detail |

### 4. SUGGESTS Edges Created (24 new edges)

All new hypotheses connected to relevant endpoints via SUGGESTS edges.
Previously unlinked creative hypotheses (actuator, swagger) also linked.

### 5. Highest-Priority Attack Chains for Next Worker

**Chain 1: SSRF → file:// → .env → JWT secret → admin takeover → flag**
- hyp-ssrf-file-protocol-deep-inversion → hyp-internal-api-trust-chain-inversion
- Expected: file:///app/.env or file:///etc/passwd via convert_video SSRF
- Leads to: JWT secret extraction → forge admin token → enumerate all data

**Chain 2: OTP admin password reset → flag**
- hyp-otp-race-token-reuse-inversion
- Expected: forget-password(admin@crapi.io) → OTP in mailhog(:8025) → reset password
- Leads to: Admin account with full data access

**Chain 3: JWT alg:none → full data enumeration → flag**
- hyp-jwt-none-admin-data-extraction
- Expected: Admin token → /orders/all → /vehicle/*/location → full PII + flag

**Chain 4: Unlock endpoint → account takeover**
- hyp-unlock-password-reset-inversion
- Expected: POST /identity/api/auth/unlock with target email → no auth required

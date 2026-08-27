# Evidence Log - Creative Exploration Worker (Red Team Theorist)

## Session Overview
- **Role**: Red Team Theorist
- **Task**: Read failed records and open Hypothesis, invert hypotheses, create new Hypothesis nodes
- **Target**: crAPI (crapi2.apisec.ai) - Microservice vehicle application

## Failed Records Analysis

### Signal_ Nodes (Status: refuted/pruned)
- s-1787765940750 - refuted, evidence empty
- s-1787765940827 - refuted, evidence empty
- s-1787765940905 - refuted, evidence empty

These failure records lack detailed context but represent previous exploration attempts.

## Existing Findings (Confirmed)
1. JWT alg:none Authentication Bypass (critical) - finding-jwt-alg-none-complete
2. BOLA/IDOR on Order Detail (high) - finding-bola-order-pii
3. Admin Account Takeover via JWT Forgery (critical) - finding-admin-account-takeover
4. Environment File Exposed (high) - finding-env-credential-leak
5. JWK Set Publicly Accessible (medium) - finding-jwks-exposed
6. Deprecated v2.7 login-with-token (medium) - finding-deprecated-login-token
7. Internal Service Hostnames Leaked (medium) - finding-internal-service-leak

## New Hypotheses Created (Inversion Strategy)

### 1. SSRF Encoding Bypass (hyp-ssrf-encoding-bypass-v2)
- Rationale: SSRF may be filtered; use encoding bypass or secondary injection
- Techniques: Double URL encoding, Unicode, nested parameter pollution, secondary injection
- Suggests: ep-video-convert

### 2. JWT Algorithm Confusion (hyp-jwt-alg-confusion-v2)
- Rationale: RSA public key exposed; possible algorithm confusion attack
- Techniques: RS256 to HS256 confusion using public key as HMAC secret
- Suggests: ep-dashboard, ep-vehicles, ep-orders-all, ep-community-posts

### 3. Vehicle IDOR Bypass (hyp-idor-vehicle-v2)
- Rationale: Vehicle IDs may use UUIDs; ownership validation may be inconsistent
- Techniques: Enumerate via community service, GPS coordinates via SSRF
- Suggests: ep-vehicles, ep-vehicle-location, ep-add-vehicle

### 4. Mass Assignment on Signup (hyp-mass-assignment-signup-v2)
- Rationale: Spring Boot auto-binding may accept extra fields
- Techniques: Inject role=admin, balance=999999 in signup
- Suggests: ep-signup, ep-login

### 5. OTP Timing Attack (hyp-otp-timing-v2)
- Rationale: OTP verification timing may leak valid/invalid status
- Techniques: Timing analysis, concurrent bypass, predictable generation
- Suggests: ep-check-otp, ep-forget-password

### 6. Internal Service Trust Exploitation (hyp-internal-trust-v2)
- Rationale: Microservices trust each other; forge internal requests
- Techniques: X-Forwarded-For spoofing, SSRF to mailhog:8025
- Suggests: ep-video-convert, ep-service-requests, ep-contact-mechanic

### 7. Race Condition on Coupons (hyp-race-condition-v2)
- Rationale: Apply/validate coupon may have TOCTOU vulnerability
- Techniques: Concurrent apply_coupon requests, coupon ID prediction
- Suggests: ep-apply-coupon, ep-validate-coupon

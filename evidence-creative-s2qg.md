# Red Team Theorist - Evidence Log
**Worker:** eng-mtad1l7b-creative-s2qg  
**Ring:** creative (reflection)  
**Target:** http://crapi2.apisec.ai  
**Date:** 2026-08-27

---

## 1. Prior Knowledge Synthesis

### From Discovery Worker r0z2 (recon-auth chain):
- **IDOR/BOLA on Orders (CRITICAL):** order_id 1,2 → full PII + partial payment card data for muqeed+6@apisec.ai
- **.env Leak (HIGH):** DB creds: postgresdb:5432, mongodb:27017, user=crapi/pass=crapi
- **User Enumeration (MEDIUM):** forgot-password differentiates registered vs unregistered
- **Architecture:** React SPA + Spring Boot, JWT RS256, 4 microservices (identity/workshop/community/vehicle)
- **API Map:** 40+ endpoints discovered across all services

### Confirmed Findings:
1. IDOR on /workshop/api/shop/orders/{orderId} - card data exposed
2. .env file exposure - full database credentials
3. User enumeration via forgot-password

### Refuted Paths (Do Not Re-test):
1. robots.txt - empty
2. Path traversal (../../etc/passwd) - Spring Boot normalization blocks
3. Admin/swagger/h2-console/actuator - all 404
4. 5x concurrent return_order - endpoint returns 404

---

## 2. Inversion Analysis

### Refuted Path → Inverted Hypothesis

| # | Refuted/Assumed | Inversion | New Hypothesis | Priority |
|---|----------------|-----------|----------------|----------|
| 1 | Path traversal blocked by Spring Boot | Other injection vectors (SSTI, SSRF, log injection) not tested | SSRF via convert_video to internal services | HIGH |
| 2 | Standard admin paths (swagger, h2-console) 404 | Non-standard admin paths or auth-gated admin still viable | Admin endpoints behind auth, not missing | MEDIUM |
| 3 | return_order 404 (endpoint doesn't exist) | Other financial endpoints may exist with race conditions | apply_coupon race condition | HIGH |
| 4 | IDOR confirmed on orders only | Same pattern on other resource types | Vehicle + community post IDOR | HIGH |
| 5 | JWT RS256 "secure" | alg:none bypass, key extraction, no-expiry replay | JWT forge via algorithm confusion | HIGH |
| 6 | OTP must be intercepted via mailhog | OTP verification bypass (fixed codes, token reuse) | OTP bypass without interception | CRITICAL |
| 7 | API fields strictly validated | Mass assignment via extra POST body fields | Mass assignment on signup/coupon/change endpoints | HIGH |
| 8 | Microservices isolated from external | Internal service access via SSRF or DB direct connection | Internal service trust exploitation | MEDIUM |

---

## 3. Hypothesis Nodes Created (8 total)

### hyp-ssrf-deep-inversion [HIGH]
- **Text:** SSRF via convert_video is not just reflection - blind/secondary SSRF to internal services
- **Strategy:** inversion
- **SUGGESTS:** ep-video-convert
- **Verification plan:** 
  1. POST /identity/api/v2/user/videos/convert_video with video_url=http://127.0.0.1:8025
  2. Try file:///etc/passwd, file:///etc/shadow
  3. Try internal service hostnames
  4. Try http://127.0.0.1:8000

### hyp-idor-vehicle-inversion [HIGH]
- **Text:** IDOR pattern extends to vehicle IDs and community posts
- **Strategy:** inversion
- **SUGGESTS:** ep-vehicle-location, ep-vehicles, ep-community-post, ep-community-posts
- **Verification plan:**
  1. GET /identity/api/v2/vehicle/vehicles → extract own carId
  2. GET /identity/api/v2/vehicle/{carId}/location → test with other IDs
  3. GET /community/api/v2/community/posts/recent → extract postId
  4. GET /community/api/v2/community/posts/{postId} → test with other IDs

### hyp-bfla-mechanic-inversion [HIGH]
- **Text:** BFLA on mechanic service requests - API doesn't enforce ownership
- **Strategy:** inversion
- **SUGGESTS:** ep-service-requests, ep-contact-mechanic
- **Verification plan:**
  1. GET /workshop/api/mechanic/service_requests → check if returns all users' requests
  2. Try query params: ?user_id=X, ?all=true
  3. POST /workshop/api/merchant/contact_mechanic with different user_id

### hyp-otp-bypass-inversion [CRITICAL]
- **Text:** OTP verification can be bypassed without mailhog interception
- **Strategy:** inversion
- **SUGGESTS:** ep-check-otp, ep-verify, ep-forget-password
- **Verification plan:**
  1. POST forget-password → capture OTP token
  2. Try fixed OTPs: 0000, 1234, 1111, 9999
  3. Try reusing same OTP token multiple times
  4. Check if /auth/v4.0/user/login-with-token accepts weak tokens

### hyp-jwt-forge-inversion [HIGH]
- **Text:** JWT RS256 has multiple weakness vectors
- **Strategy:** inversion
- **SUGGESTS:** ep-login, ep-login-token, ep-dashboard
- **Verification plan:**
  1. Decode JWT → check header for alg, kid, jku fields
  2. Try /identity/.well-known/jwks.json for public key
  3. Try alg:none bypass (change alg to none, remove signature)
  4. Try RS256→HS256 confusion (sign with public key as HMAC secret)

### hyp-mass-assignment-inversion [HIGH]
- **Text:** API accepts extra fields not shown in frontend
- **Strategy:** inversion
- **SUGGESTS:** ep-signup, ep-apply-coupon, ep-change-email, ep-change-phone
- **Verification plan:**
  1. POST signup with {"role":"admin"} extra field
  2. POST apply_coupon with {"credit":99999, "amount":0}
  3. POST change-email without old_email field
  4. POST change-phone without OTP field

### hyp-internal-service-inversion [MEDIUM]
- **Text:** .env credentials enable direct DB access; SSRF can reach internal services
- **Strategy:** inversion
- **SUGGESTS:** ep-env-file, ep-video-convert
- **Verification plan:**
  1. Confirm .env still accessible
  2. Use SSRF to reach internal ports
  3. Test for service-to-service trust relationships

### hyp-coupon-race-inversion [HIGH]
- **Text:** Race condition in apply_coupon for credit multiplication
- **Strategy:** inversion
- **SUGGESTS:** ep-apply-coupon, ep-validate-coupon
- **Verification plan:**
  1. POST validate-coupon to get valid coupon code
  2. POST apply_coupon 5x concurrently
  3. Compare balance before/after

---

## 4. Graph Database State

### Nodes Created:
- **Endpoints:** 26 nodes (ep-video-convert, ep-change-email, ep-change-phone, etc.)
- **Hypotheses:** 8 nodes (all inverted, status=open)
- **Signals:** 12 nodes (5 open, 4 confirmed, 3 refuted - from prior workers)

### Edges Created:
- **SUGGESTS:** 21 edges connecting hypotheses to endpoints

### Hypothesis → Endpoint Coverage:
| Hypothesis | Endpoints Suggested |
|-----------|-------------------|
| hyp-ssrf-deep-inversion | ep-video-convert |
| hyp-idor-vehicle-inversion | ep-vehicle-location, ep-vehicles, ep-community-post, ep-community-posts |
| hyp-bfla-mechanic-inversion | ep-service-requests, ep-contact-mechanic |
| hyp-otp-bypass-inversion | ep-check-otp, ep-verify, ep-forget-password |
| hyp-jwt-forge-inversion | ep-login, ep-login-token, ep-dashboard |
| hyp-mass-assignment-inversion | ep-signup, ep-apply-coupon, ep-change-email, ep-change-phone |
| hyp-internal-service-inversion | ep-env-file, ep-video-convert |
| hyp-coupon-race-inversion | ep-apply-coupon, ep-validate-coupon |

# Handoff - Red Team Theorist to Executor
**Worker:** eng-mtad1l7b-creative-s2qg  
**Ring:** creative (reflection)  
**Target:** http://crapi2.apisec.ai  
**Date:** 2026-08-27

---

## Completed Items

### 1. Graph Enrichment
- Created **26 Endpoint nodes** covering all discovered API paths
- Created **8 inverted Hypothesis nodes** with clear verification plans
- Created **21 SUGGESTS edges** connecting hypotheses to target endpoints
- Verified graph integrity: all edges connect valid nodes

### 2. Inversion Summary (8 Hypotheses)

| Priority | Hypothesis ID | What to Test | Key Endpoints |
|----------|--------------|-------------|---------------|
| **CRITICAL** | hyp-otp-bypass-inversion | Fixed OTP codes (0000,1234), token reuse | /auth/v3/check-otp, /auth/verify |
| **HIGH** | hyp-ssrf-deep-inversion | SSRF → internal services, file:// read | /user/videos/convert_video |
| **HIGH** | hyp-idor-vehicle-inversion | Vehicle ID + post ID IDOR | /vehicle/{carId}/location, /posts/{postId} |
| **HIGH** | hyp-bfla-mechanic-inversion | Mechanic requests cross-user | /mechanic/service_requests |
| **HIGH** | hyp-jwt-forge-inversion | alg:none, RS256→HS256, no-expiry replay | /auth/login, /auth/v4.0/user/login-with-token |
| **HIGH** | hyp-mass-assignment-inversion | Extra fields: role=admin, credit=99999 | /auth/signup, /shop/apply_coupon |
| **HIGH** | hyp-coupon-race-inversion | 5x concurrent apply_coupon | /shop/apply_coupon, /coupon/validate-coupon |
| **MEDIUM** | hyp-internal-service-inversion | .env creds → direct DB, SSRF internal | /.env, convert_video |

---

## Recommended Execution Order (for next worker)

### Phase 1: Quick Wins (2-3 rounds)
1. **OTP Bypass (CRITICAL)** - Try fixed OTPs 0000, 1234 on check-otp endpoint. Zero-cost if works.
2. **IDOR Vehicle/Post** - Use existing JWT, enumerate vehicle IDs and post IDs.
3. **Mass Assignment** - Add extra fields to signup and apply_coupon.

### Phase 2: Deeper Exploitation (3-4 rounds)
4. **SSRF via convert_video** - Test with internal URLs, file:// protocol.
5. **JWT Forge** - Decode token, try alg:none, check JWK endpoint.
6. **Coupon Race Condition** - Get valid coupon, test concurrent apply.

### Phase 3: Flag Exfil (1-2 rounds)
7. **Chain SSRF + Internal Trust** - Use SSRF to access internal services.
8. **Chain BFLA + IDOR** - Harvest all users' data across services.

---

## Known Constraints
- **Test Account:** reconworker@test.com / Test1234! (User ID: 564)
- **JWT:** RS256, no expiry (confirmed)
- **OPSEC:** ≥2s between requests to same endpoint; ≤50 requests per endpoint
- **Budget:** 20% of final rounds must be used for result reporting

---

## What NOT to Re-test (Confirmed Refuted)
- robots.txt (empty)
- Path traversal ../../etc/passwd (Spring Boot blocks)
- Admin/swagger/h2-console/actuator (all 404)
- return_order endpoint (404, doesn't exist)

---

## Target: Flag/Data Locations
Based on crAPI architecture, flag is likely in one of:
1. **Database:** PostgreSQL (crapi DB) - user tables, credit data
2. **Internal service responses:** mechanic diagnostic data
3. **Vehicle GPS data:** location endpoint may contain sensitive coordinates
4. **Payment data:** already partially leaked via IDOR (card last4, expiry)

---

## Test Account Credentials
```
Email: reconworker@test.com
Password: Test1234!
Phone: 1000000001
User ID: 564
```

---

## API Key Already Found (from other target)
- `sk-abc123SECRETLEAK` (Aegis-IoA X on port 8000) - NOT in crAPI scope

---

## Next Worker Should
1. Read evidence-creative-s2qg.md for full verification plans
2. Execute hypotheses in priority order
3. Focus on CRITICAL (OTP bypass) and HIGH (IDOR, SSRF) first
4. Write findings to graph as Finding nodes
5. Collect actual flag/credential samples as evidence

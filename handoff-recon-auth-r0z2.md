# Handoff - recon-auth to next worker
**Target:** http://crapi2.apisec.ai  
**Worker:** eng-mtad1l7b-discovery-r0z2  
**Date:** 2026-08-26

---

## Confirmed Vulnerabilities
1. **[CRITICAL] IDOR/BOLA on Orders** - Enumerate order_id (1,2,3...) to access other users' full order data including PII (email, phone) and partial payment card data (last 4 digits, cardholder name, card type, expiry)
2. **[HIGH] .env File Exposure** - Full database credentials exposed at /.env (PostgreSQL + MongoDB)
3. **[MEDIUM] User Enumeration** - forgot-password endpoint differentiates registered vs unregistered emails

## Test Account Created
- Email: reconworker@test.com
- Password: Test1234!
- Phone: 1000000001
- User ID: 564

## Unresolved Directions for Next Worker
1. **SSRF via video convert** - `/identity/api/v2/user/videos/convert_video` video_url param likely accepts arbitrary URLs (known crAPI vuln). Need to test with internal hostnames from docker network context.
2. **Coupon race condition** - Apply coupon 5x concurrently for credit multiplication (need valid coupon code first via /community/api/v2/coupon/validate-coupon)
3. **Mechanic BFLA** - Test accessing other users' mechanic service requests
4. **Community post IDOR** - Enumerate postId for other users' posts
5. **JWT weakness** - RS256, test for alg:none bypass or key extraction
6. **Change email/phone without OTP** - Test if OTP verification can be bypassed
7. **Large order ID range enumeration** - Scan order IDs 1-1000 for mass data harvesting

## Refuted (Do Not Re-test)
- robots.txt: empty (no Disallow paths)
- Path traversal (../../etc/passwd): blocked by Spring Boot path normalization
- Admin/swagger/h2-console/actuator endpoints: all 404
- 5x concurrent return_order: endpoint not available (404)

## Graph DB Status
- 3 Findings written (IDOR, .env leak, user enumeration)
- 7 Signals written (4 endpoint discoveries + 3 refuted)

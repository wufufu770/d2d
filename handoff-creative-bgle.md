# Handoff Notes - Creative Exploration Worker (Red Team Theorist)

## Completed Tasks
1. Read failed records (3 refuted signals with empty evidence)
2. Read all open Hypothesis nodes (13 existing hypotheses)
3. Analyzed confirmed findings (7 findings)
4. Created 7 new inversion hypotheses with SUGGESTS relationships
5. Documented evidence in evidence-creative-bgle.md

## New Hypotheses Created

| ID | Strategy | Target Endpoints |
|----|----------|-----------------|
| hyp-ssrf-encoding-bypass-v2 | inversion | ep-video-convert |
| hyp-jwt-alg-confusion-v2 | inversion | ep-dashboard, ep-vehicles, ep-orders-all, ep-community-posts |
| hyp-idor-vehicle-v2 | inversion | ep-vehicles, ep-vehicle-location, ep-add-vehicle |
| hyp-mass-assignment-signup-v2 | inversion | ep-signup, ep-login |
| hyp-otp-timing-v2 | inversion | ep-check-otp, ep-forget-password |
| hyp-internal-trust-v2 | inversion | ep-video-convert, ep-service-requests, ep-contact-mechanic |
| hyp-race-condition-v2 | inversion | ep-apply-coupon, ep-validate-coupon |

## Priority Verification Order

### HIGH PRIORITY (Direct path to sensitive data)
1. **hyp-mass-assignment-signup-v2** - Try role=admin in signup -> immediate admin account
2. **hyp-jwt-alg-confusion-v2** - RS256 to HS256 confusion -> forge JWT with any role
3. **hyp-idor-vehicle-v2** - Vehicle location GPS coordinates

### MEDIUM PRIORITY (Requires more steps)
4. **hyp-race-condition-v2** - Coupon race -> free products
5. **hyp-internal-trust-v2** - Internal service access -> mailhog OTP
6. **hyp-otp-timing-v2** - OTP bypass -> account takeover

### LOW PRIORITY (Encoding/filtering dependent)
7. **hyp-ssrf-encoding-bypass-v2** - Encoding bypass -> deeper SSRF

## Next Steps for Successor
1. **Immediate**: Test mass assignment on signup endpoint
   - POST /identity/api/auth/signup with {"email":"test@test.com", "password":"test123", "role":"admin"}
   
2. **Quick win**: JWT algorithm confusion
   - Create HS256 JWT using RSA public key from /.well-known/jwks.json
   
3. **Data extraction**: Vehicle IDOR
   - Test /identity/api/v2/vehicle/1/location, /identity/api/v2/vehicle/2/location, etc.

4. **Credential access**: Internal service trust
   - Add X-Forwarded-For: 172.17.0.2 header to requests
   - Test Host: crapi-identity:8025 for mailhog access

## OPSEC Reminders
- Same endpoint interval: >=2 seconds
- Single endpoint limit: <=50 requests
- No destructive operations
- Focus on data extraction (flag/key samples)

## Graph State
- Total Hypothesis nodes: 20 (13 original + 7 new)
- Total Endpoint nodes: 27
- Total Finding nodes: 7 (all candidate status)
- Failed Signal nodes: 3 (refuted, low weight)

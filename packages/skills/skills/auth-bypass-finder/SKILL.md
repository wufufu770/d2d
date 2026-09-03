---
name: auth-bypass-finder
version: 0.1.0
description: Authentication bypass — missing auth checks, privilege escalation, IDOR, JWT attacks.
category: exploit
when_to_use: When endpoint requires auth (header / cookie / session) and serves user-specific data.
allowed-tools: Bash, Read, Grep, Glob
user-invocable: true
---

# Auth Bypass Finder

## 1. Missing auth
Send request with **no** auth header.
- Returns 200 with user data → bypass confirmed (P0)

## 2. Privilege escalation
- Test low-priv user accessing high-priv endpoint
- Test low-priv user accessing other user's data (IDOR)

## 3. JWT attacks
- `alg=none` → unsigned JWT accepted
- Weak HMAC secret → brute force with jwt_tool
- `kid` injection → path traversal / SQLi
- `jku` / `x5u` → attacker-controlled JWK set

## 4. IDOR
- Replace `user_id=1` with `user_id=2`, `3`, `0`, `INT_MAX`
- Cross-tenant access (replace `tenant_id`)
- Replace `uuid` with version-1 UUIDs of other entities

## 5. Write Finding
- severity: P0 (admin bypass) / P1 (cross-user) / P2 (info leak)
- evidence: 3 test requests + responses
- repro: 2 curl commands (legit + bypass)
- category: authz / idor / jwt

## 6. Constraints
- Never modify or delete other users' data (only read)
- Never escalate to admin level (just demonstrate the chain)
- Always reset to original state after test

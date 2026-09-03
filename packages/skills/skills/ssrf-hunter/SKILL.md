---
name: ssrf-hunter
version: 0.1.0
description: SSRF detection — file/gopher protocols + cloud metadata + OAST callback verification.
category: exploit
when_to_use: When endpoint accepts a URL parameter, webhook, or fetches remote resources.
allowed-tools: Bash, Read, Grep, Glob
user-invocable: true
---

# SSRF Hunter

## 1. Probe targets
- file:// protocol: `file:///etc/passwd`, `file:///proc/self/environ`
- gopher:// protocol: for sending raw TCP payloads
- dict:// protocol: for protocol smuggling
- http://internal hosts: 127.0.0.1, 10.x.x.x, 192.168.x.x
- Cloud metadata: 169.254.169.254 (AWS), metadata.google.internal (GCP)

## 2. OAST verification
1. Register an OAST callback URL (projectdiscovery/interactsh or custom)
2. Inject `http://YOUR-CALLBACK.example.com/test` as the URL param
3. Wait 30s for callback
4. If callback received → SSRF confirmed

## 3. Indicators
- response time delta (file read = fast, network = slow)
- response body contains cloud metadata fields
- response body contains internal-only file content

## 4. Write Finding
- severity: P0 (cloud metadata) / P1 (file read) / P2 (internal scan)
- evidence: OAST callback log + payload + response
- repro: curl with injected URL
- category: ssrf

## 5. Constraints
- Do NOT probe government / military IP ranges
- OAST callbacks only to authorized domains
- Never use SSRF to actually exploit cloud metadata (only confirm)

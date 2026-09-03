# d2d scanner — MITM + ZAP + OAST (Issues #56-#58)

This directory hosts the v0.4.0 Phase 2 scanners. Each is independently loadable:

## mitmproxy addon (#56)
```bash
# Start proxy with d2d addon (captures HTTP/HTTPS to ~/.d2d-data/mitm/)
mitmdump -s src/scanner/mitmproxy_addon.py --listen-port 8080

# Or via the wrapper:
python3 src/scanner/d2d_mitm.py start [--port 8080] [--graph]
python3 src/scanner/d2d_mitm.py status
python3 src/scanner/d2d_mitm.py tail 50
python3 src/scanner/d2d_mitm.py stop
```

Set `D2D_MITM_GRAPH=1` to forward each event as a `Signal_` to graphd via host-token channel.

## Privacy guarantees
- Raw request/response bodies are NEVER persisted unless `D2D_MITM_BODY=1` is set AND content-type is text/json/xml/form.
- Otherwise, only the SHA-256 + size are recorded.
- Event file mode is `0o600`; data dir is `0o700`.

## Event shape
```json
{
  "type": "request|response|error|tcp|ws",
  "ts": "2026-09-04T12:34:56.789Z",
  "method": "POST",
  "scheme": "https",
  "host": "api.example.com",
  "path": "/v1/foo",
  "url": "https://api.example.com/v1/foo",
  "status_code": 200,
  "duration_ms": 145,
  "body": {"present": true, "size": 256, "truncated": true, "sha256": "..."}
}
```

## Tests
```bash
python3 test/scanner/mitmproxy_addon_test.py
```

## Future (#57 ZAP, #58 OAST)
- `zap_client.py` — OWASP ZAP API wrapper
- `oast/interactsh_client.py` — out-of-band testing
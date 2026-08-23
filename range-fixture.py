#!/usr/bin/env python3
"""本地迷你靶场 v2 - 扩展漏洞覆盖面 (127.0.0.1:8080)
漏洞类:
  A. 信息泄露链: robots.txt -> secret.key -> X-Key -> flag.txt   [FLAG1]
  B. SQL注入: /api/user?id=' 触发 sqlite 报错泄露
  C. 路径穿越: /download?file=../../../../etc/hostname -> 读到 flag2 路径线索;
     /download?file=../../../flag2.txt 直接读出                              [FLAG2]
  D. IDOR: /api/user?id=2 返回他人数据(role=admin, 含 api_token) 无鉴权
  E. 反射XSS噪音: /console (应被质量门控降级)
  F. 伪WAF: /admin 带 ?debug=1 绕过鉴权 (逻辑缺陷)
"""
import http.server
import json
import subprocess
from urllib.parse import parse_qs, unquote

KEY = "s3cr3t-k3y-2026"
FLAG1 = "FLAG{mult1_h0p_cha1n_0k}"
FLAG2 = "FLAG{path_tr4vers4l_r34d}"
API_TOKEN_ADMIN = "tok_admin_9f8e7d6c"

HTML_HOME = b"""<!DOCTYPE html><html><head><title>Corp Portal v2</title></head><body>
<h1>Corp Portal v2</h1>
<ul>
<li><a href="/api/user?id=1">user lookup</a></li>
<li><a href="/download?file=reports/q1.pdf">reports</a></li>
<li><a href="/tools/ping?host=127.0.0.1">net tool</a></li>
<li><a href="/console">dev console</a></li>
</ul><!-- legacy files see robots --></body></html>"""


class Handler(http.server.BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype="text/html; charset=utf-8"):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        path, _, query = self.path.partition("?")
        qs = parse_qs(query)

        if path == "/":
            return self._send(200, HTML_HOME)
        if path == "/robots.txt":
            return self._send(200, b"User-agent: *\nDisallow: /secret.key\nDisallow: /flag.txt\nDisallow: /flag2.txt\nDisallow: /admin\nDisallow: /api/\nDisallow: /download\n")
        if path == "/secret.key":
            return self._send(200, KEY.encode(), "text/plain")
        if path == "/flag.txt":
            if self.headers.get("X-Key") == KEY:
                return self._send(200, f"congrats {FLAG1}\n".encode(), "text/plain")
            return self._send(403, b"forbidden: missing X-Key\n")
        if path == "/flag2.txt":
            return self._send(403, b"forbidden\n")
        if path == "/download":
            f = unquote((qs.get("file") or [""])[0])
            if ".." in f:
                # 真实穿越: 只允许读到本进程可访问文件, 用受控白名单模拟结果
                if "flag2" in f:
                    return self._send(200, f"{FLAG2}\n".encode(), "application/octet-stream")
                if "hostname" in f or "passwd" in f:
                    return self._send(200, b"pwned-host\nroot:x:0:0:root:/root:/bin/bash\n", "application/octet-stream")
                return self._send(404, b"no such file\n")
            if f == "reports/q1.pdf":
                return self._send(200, b"%PDF-1.4 fake report\n", "application/pdf")
            return self._send(404, b"not found\n")
        if path == "/tools/ping":
            host = (qs.get("host") or [""])[0]
            if ";" in host or "`" in host or "$(" in host:
                out = subprocess.run(host.replace("ping -c 1 ", ""), shell=True, capture_output=True, text=True, timeout=5)
                return self._send(200, ("CMDOUT:\n" + (out.stdout or out.stderr)[:500]).encode(), "text/plain")
            safe = "".join(ch for ch in host if ch.isdigit() or ch == ".")
            try:
                out = subprocess.run(["ping", "-c", "1", "-W", "1", safe or "127.0.0.1"], capture_output=True, text=True, timeout=6)
                return self._send(200, out.stdout[:300].encode(), "text/plain")
            except Exception:
                return self._send(200, b"ping timeout\n")
        if path == "/api/user":
            uid = (qs.get("id") or [""])[0]
            if "'" in uid:
                err = f'{{"error":"sqlite3.OperationalError: unrecognized token: \\"{uid[:40]}\\""}}'
                return self._send(500, err.encode(), "application/json")
            if uid == "2":
                return self._send(200, json.dumps({"id": "2", "name": "bob-admin", "role": "administrator", "api_token": API_TOKEN_ADMIN, "email": "bob@corp.internal"}).encode(), "application/json")
            return self._send(200, json.dumps({"id": uid or "1", "name": "alice", "role": "guest"}).encode(), "application/json")
        if path == "/admin":
            if qs.get("debug") == ["1"]:
                return self._send(200, b"<h1>ADMIN PANEL (debug bypass)</h1><pre>users: alice,bob-admin</pre>")
            return self._send(401, b"auth required\n")
        if path == "/console":
            return self._send(200, b"<script>var dbg='</script><script>alert(1)</script>';</script><p>debug console</p>")
        return self._send(404, b"not found")


if __name__ == "__main__":
    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 8080), Handler)
    print("[range-v2] ready: SQLi/traversal/IDOR/authbypass/cmd-inj/xss-noise/multihop-flag", flush=True)
    srv.serve_forever()

#!/usr/bin/env python3
"""随机化多漏洞靶场生成器: gen_range.py <round> <port> [seed]
同 round+seed = 同靶场。ground truth 写 ranges/truth_r<round>.json"""
import json, random, subprocess, sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, unquote

CLASSES = ["robots_key_header_flag","path_traversal","sqli_error","idor",
           "auth_bypass_debug","cmd_injection","xss_reflected",
           "open_redirect","backup_disclosure","ssrf_internal"]

def gen_config(round_no, port, seed):
    rng = random.Random(f"{round_no}:{seed}")
    n = rng.randint(5, min(8, len(CLASSES)))
    classes = set(rng.sample(CLASSES, n))
    classes.add("robots_key_header_flag")  # 主链必在
    p = f"r{round_no}"
    return {
        "round": round_no, "port": port, "internal_port": port + 5000,
        "classes": sorted(classes),
        "decoys": rng.sample(["fake_admin_401","version_banner"], rng.randint(0,2)),
        "key": f"k{p}-{rng.randint(10000,99999)}",
        "flags": {"FLAG_A": f"FLAG{{{p}-ch41n}}", "FLAG_B": f"FLAG{{{p}-tr4v}}", "FLAG_C": f"FLAG{{{p}-ssrf}}"},
        "admin_token": f"tok_{p}_{rng.randint(1000,9999)}",
        "api_path": rng.choice(["/api/user", f"/svc{rng.randint(2,9)}/user"]),
        "dl_path": rng.choice(["/download", f"/files{rng.randint(1,9)}/get"]),
        "admin_path": rng.choice(["/admin", f"/manage{rng.randint(1,9)}"]),
        "hint_in_comment": rng.random() < 0.5,
        "robots_present": rng.random() < 0.75,
    }

def build_truth(cfg):
    t = {"round": cfg["round"], "port": cfg["port"], "classes": cfg["classes"], "flags": []}
    m = {"robots_key_header_flag":"FLAG_A","path_traversal":"FLAG_B","ssrf_internal":"FLAG_C"}
    for c, fid in m.items():
        if c in cfg["classes"]:
            t["flags"].append({"id": fid, "value": cfg["flags"][fid], "class": c})
    return t

def make_handler(cfg):
    key, api, dl, admin, iport = cfg["key"], cfg["api_path"], cfg["dl_path"], cfg["admin_path"], cfg["internal_port"]
    C = set(cfg["classes"])

    class H(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def _send(self, code, body, ctype="text/html; charset=utf-8"):
            try:
                self.send_response(code); self.send_header("Content-Type", ctype)
                self.send_header("Content-Length", str(len(body))); self.end_headers()
                self.wfile.write(body)
            except Exception: pass
        def do_GET(self):
            path, _, query = self.path.partition("?")
            qs = parse_qs(query)
            if path == "/":
                hint = "<!-- legacy: robots -->" if cfg["hint_in_comment"] else ""
                return self._send(200, f"<h1>App r{cfg['round']}</h1><a href='{api}?id=1'>user</a>{hint}".encode())
            if path == "/robots.txt" and cfg["robots_present"]:
                L = ["User-agent: *"]
                if "robots_key_header_flag" in C: L += ["Disallow: /secret.key", "Disallow: /flag.txt"]
                if "path_traversal" in C: L.append(f"Disallow: {dl}")
                if "auth_bypass_debug" in C: L.append(f"Disallow: {admin}")
                return self._send(200, ("\n".join(L)+"\n").encode())
            if path == "/secret.key" and "robots_key_header_flag" in C:
                return self._send(200, key.encode(), "text/plain")
            if path == "/flag.txt" and "robots_key_header_flag" in C:
                if self.headers.get("X-Key") == key:
                    return self._send(200, (cfg["flags"]["FLAG_A"]+"\n").encode(), "text/plain")
                return self._send(403, b"missing X-Key\n")
            if path == dl and "path_traversal" in C:
                f = unquote((qs.get("file") or [""])[0])
                if ".." in f:
                    body = cfg["flags"]["FLAG_B"] if ("flag" in f or f.endswith("g")) else "root:x:0:0\n"
                    return self._send(200, (body+"\n").encode(), "application/octet-stream")
                return self._send(404, b"no file\n")
            if path == api:
                uid = (qs.get("id") or [""])[0]
                if "sqli_error" in C and "'" in uid:
                    return self._send(500, json.dumps({"error": f"sqlite3.OperationalError near {uid[:30]} (table users)"}).encode(), "application/json")
                if "idor" in C and uid == "2":
                    return self._send(200, json.dumps({"id":"2","role":"administrator","api_token":cfg["admin_token"]}).encode(), "application/json")
                return self._send(200, json.dumps({"id": uid or "1", "name": "alice", "role": "guest"}).encode(), "application/json")
            if path == admin and "auth_bypass_debug" in C:
                if qs.get("debug") == ["1"]: return self._send(200, b"<h1>ADMIN PANEL</h1>")
                return self._send(401, b"auth required\n")
            if path == "/tools/ping" and "cmd_injection" in C:
                host = (qs.get("host") or [""])[0]
                if any(m in host for m in (";", "`", "$(", "|")):
                    try:
                        out = subprocess.run(host, shell=True, capture_output=True, text=True, timeout=5)
                        return self._send(200, ("CMDOUT:"+(out.stdout or out.stderr)[:300]).encode())
                    except Exception: return self._send(200, b"CMDOUT:err")
                safe = "".join(ch for ch in host if ch.isdigit() or ch==".") or "127.0.0.1"
                try:
                    out = subprocess.run(["ping","-c","1","-W","1",safe], capture_output=True, text=True, timeout=6)
                    return self._send(200, out.stdout[:200].encode())
                except Exception: return self._send(200, b"timeout\n")
            if path == "/goto" and "open_redirect" in C:
                u = (qs.get("url") or [""])[0]
                if u: 
                    self.send_response(302); self.send_header("Location", u); self.end_headers(); return
                return self._send(400, b"missing url\n")
            if path.endswith(".bak") and "backup_disclosure" in C:
                return self._send(200, f"# backup source\nKEY='{key}'  # TODO rotate\n".encode(), "text/plain")
            if path == "/fetch" and "ssrf_internal" in C:
                u = (qs.get("url") or [""])[0]
                if f"127.0.0.1:{iport}" in u:
                    import urllib.request
                    try:
                        data = urllib.request.urlopen(f"http://127.0.0.1:{iport}/internal-flag", timeout=4).read()
                        return self._send(200, data)
                    except Exception: return self._send(502, b"fetch fail\n")
                return self._send(400, b"only internal urls\n")
            if path == "/console" and "xss_reflected" in C:
                q1 = (qs.get("q") or [""])[0]
                return self._send(200, f"<p>debug:{q1}</p>".encode())
            if path.startswith("/x"): pass
            return self._send(404, b"not found\n")

    class HI(BaseHTTPRequestHandler):
        def log_message(self, *a): pass
        def do_GET(self):
            body = cfg["flags"]["FLAG_C"].encode()+b"\n"
            self.send_response(200); self.send_header("Content-Length", str(len(body))); self.end_headers(); self.wfile.write(body)

    return H, HI

def main():
    round_no, port = int(sys.argv[1]), int(sys.argv[2])
    seed = sys.argv[3] if len(sys.argv) > 3 else "base"
    cfg = gen_config(round_no, port, seed)
    truth = build_truth(cfg)
    json.dump({"config": cfg, "truth": truth}, open(f"/home/wff/d2d/ranges/truth_r{round_no}.json", "w"), ensure_ascii=False, indent=1)
    H, HI = make_handler(cfg)
    srv = ThreadingHTTPServer(("127.0.0.1", port), H)
    isrv = ThreadingHTTPServer(("127.0.0.1", port+5000), HI)
    print(f"[range r{round_no}] :{port} classes={cfg['classes']}", flush=True)
    print('[internal] :' + str(cfg['internal_port']), flush=True)
    import threading
    threading.Thread(target=isrv.serve_forever, daemon=True).start()
    srv.serve_forever()

if __name__ == "__main__":
    main()

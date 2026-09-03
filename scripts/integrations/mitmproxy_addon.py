#!/usr/bin/env python3
"""mitmproxy_addon.py — #56 真实 mitmproxy 工具的 d2d 事件桥 (issue #56)

用法:
    mitmproxy -s mitmproxy_addon.py --listen-host 127.0.0.1 -p 8080
    # listen host 默认 127.0.0.1; 如需放开必须显式 --listen-host 0.0.0.0(自担风险)

行为:
    - request/response 钩子把 method/host/path/状态码/耗时 + body 的 sha256+size
      追加写 events.jsonl(mode 0600), 路径由 env D2D_MITM_EVENTS 指定(默认
      ~/.d2d-data/evidence/mitm/events-<ts>.jsonl)。
    - body 明文一律不落盘; 仅 env D2D_MITM_BODY=1 时保存 ≤256B 片段(base64)。
    - 可选 env D2D_GRAPHD_URL + D2D_GRAPH_TOKEN 时把事件 POST 到
      <D2D_GRAPHD_URL>/write/signal (超时 3s, 静默失败, 不阻塞代理)。

导入干净: 仅标准库 + mitmproxy(hook 环境自带); 无 __main__ 副作用。
"""
import base64
import hashlib
import json
import os
import time

from mitmproxy import ctx, http

BODY_SNIPPET_MAX = 256  # 与 scripts/gateway/mitm-proxy.mjs 保持一致
EVENTS_PATH = os.environ.get(
    "D2D_MITM_EVENTS",
    os.path.expanduser("~/.d2d-data/evidence/mitm/events.jsonl"),
)
BODY_MODE = os.environ.get("D2D_MITM_BODY") == "1"
GRAPHD_URL = os.environ.get("D2D_GRAPHD_URL", "").rstrip("/")
GRAPH_TOKEN = os.environ.get("D2D_GRAPH_TOKEN", "")


def _digest(content: bytes) -> dict:
    """只出 sha256+size(+可选片段), body 明文不进事件对象 (#56 安全约定)"""
    d = {"sha256": hashlib.sha256(content or b"").hexdigest(), "size": len(content or b"")}
    if BODY_MODE:
        d["snippet"] = base64.b64encode((content or b"")[:BODY_SNIPPET_MAX]).decode()
    return d


def _emit(event: dict) -> None:
    try:
        os.makedirs(os.path.dirname(EVENTS_PATH), exist_ok=True)
        with open(EVENTS_PATH, "a", encoding="utf-8") as f:  # 打开即 O_APPEND, 0600
            os.chmod(EVENTS_PATH, 0o600)
            f.write(json.dumps(event, ensure_ascii=False) + "\n")
    except OSError as e:
        ctx.log.warn(f"[d2d#56] events 落盘失败(静默): {e}")
    _forward(event)


def _forward(event: dict) -> None:
    """可选 graphd 转发: 3s 超时, 任何异常静默吞掉, 绝不影响代理主流程"""
    if not GRAPHD_URL:
        return
    try:
        import urllib.request

        req = urllib.request.Request(
            f"{GRAPHD_URL}/write/signal",
            data=json.dumps(event).encode(),
            headers={"Content-Type": "application/json", "Authorization": f"Bearer {GRAPH_TOKEN}"},
            method="POST",
        )
        urllib.request.urlopen(req, timeout=3).read()
    except Exception:
        pass


class D2dEventAddon:
    def __init__(self) -> None:
        self._start: dict = {}

    def request(self, flow: http.HTTPFlow) -> None:
        self._start[id(flow)] = time.monotonic()

    def response(self, flow: http.HTTPFlow) -> None:
        duration_ms = int((time.monotonic() - self._start.pop(id(flow), time.monotonic())) * 1000)
        _emit(
            {
                "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                "kind": "http",
                "method": flow.request.method,
                "host": flow.request.host,
                "path": flow.request.path,
                "status": flow.response.status_code if flow.response else 0,
                "durationMs": duration_ms,
                "req": _digest(flow.request.raw_content),
                "res": _digest(flow.response.raw_content if flow.response else b""),
                "src": "mitmproxy-addon",
            }
        )


addons = [D2dEventAddon()]

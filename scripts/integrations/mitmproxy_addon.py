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
import logging
import os
import time

from mitmproxy import http

# 复审#10: ctx.log 在 mitmproxy ≥9 已移除(本机 12.x 无 ctx.log) → 标准库 logging
log = logging.getLogger("d2d.mitm")

BODY_SNIPPET_MAX = 256  # 与 scripts/gateway/mitm-proxy.mjs 保持一致
EVENTS_PATH = os.environ.get(
    "D2D_MITM_EVENTS",
    os.path.expanduser("~/.d2d-data/evidence/mitm/events.jsonl"),
)
BODY_MODE = os.environ.get("D2D_MITM_BODY") == "1"
GRAPHD_URL = os.environ.get("D2D_GRAPHD_URL", "").rstrip("/")
GRAPH_TOKEN = os.environ.get("D2D_GRAPH_TOKEN", "")

# 复审#10: 常驻句柄 + os.open(O_APPEND|O_CREAT, 0o600) — 文件创建即 0600
# (老实现"先 open 再 chmod"存在窗口期; 且每次事件都重开文件浪费 fd/系统调用)
_events_fd = None


def _events_fileno() -> int:
    global _events_fd
    if _events_fd is None:
        d = os.path.dirname(EVENTS_PATH)
        if d:
            os.makedirs(d, exist_ok=True)
        _events_fd = os.open(EVENTS_PATH, os.O_WRONLY | os.O_APPEND | os.O_CREAT, 0o600)
    return _events_fd


def _digest(content: bytes) -> dict:
    """只出 sha256+size(+可选片段), body 明文不进事件对象 (#56 安全约定)"""
    d = {"sha256": hashlib.sha256(content or b"").hexdigest(), "size": len(content or b"")}
    if BODY_MODE:
        d["snippet"] = base64.b64encode((content or b"")[:BODY_SNIPPET_MAX]).decode()
    return d


def _emit(event: dict) -> None:
    try:
        os.write(_events_fileno(), (json.dumps(event, ensure_ascii=False) + "\n").encode("utf-8"))
    except OSError as e:
        log.warning("[d2d#56] events 落盘失败(静默): %s", e)
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
    # 复审#10: 起始时间戳挂在 flow.metadata(id() 地址可被 GC 复用串号);
    # 并补 error 钩子清理, 避免异常 flow 在 metadata 里留脏数据。
    def request(self, flow: http.HTTPFlow) -> None:
        flow.metadata["d2d_start"] = time.monotonic()

    def response(self, flow: http.HTTPFlow) -> None:
        start = flow.metadata.pop("d2d_start", None)
        duration_ms = int((time.monotonic() - start) * 1000) if start is not None else 0
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

    def error(self, flow: http.HTTPFlow) -> None:
        flow.metadata.pop("d2d_start", None)


addons = [D2dEventAddon()]

#!/usr/bin/env python3
"""
@wufufu770/d2d-cli — mitmproxy addon (Issue #56)

Captures HTTP/HTTPS request + response + error events from mitmproxy's
streaming interface and persists them to ~/.d2d-data/mitm/events.jsonl.

Optionally forwards each event to graphd /write/signal (when D2D_MITM_GRAPH=1).

The addon is a pure-logic module — it doesn't bind to sockets or spawn
mitmdump itself. The CLI wrapper (`cli/src/bin/d2d-mitm`) loads this via
`mitmdump -s mitmproxy_addon.py`.

Usage (manual):
    mitmdump -s mitmproxy_addon.py --set d2d_data_dir=/path/to/.d2d-data
    D2D_MITM_GRAPH=1 mitmdump -s mitmproxy_addon.py  # also write to graphd

Tested on Python 3.10+ (mitmproxy 10.x).
0 runtime deps beyond mitmproxy (system install via apt).
"""

from __future__ import annotations

import json
import os
import sys
import time
import hashlib
from pathlib import Path
from typing import Any, Optional


# === mitmproxy imports (graceful fallback for non-mitmproxy test env) ===
try:
    from mitmproxy import ctx, http  # type: ignore
    from mitmproxy.addonmanager import Loader  # type: ignore
    _HAS_MITMPROXY = True
except ImportError:
    # Tests run without mitmproxy — provide stubs so the module still imports.
    _HAS_MITMPROXY = False
    ctx = None  # type: ignore
    http = None  # type: ignore

    class Loader:  # type: ignore
        def add_option(self, *args: Any, **kwargs: Any) -> None:
            pass


# === Config ===
DEFAULT_DATA_DIR = os.environ.get(
    "D2D_DATA_DIR",
    os.path.join(os.path.expanduser("~"), ".d2d-data"),
)
DEFAULT_GRAPH_URL = os.environ.get("P2P_GRAPHD", "http://127.0.0.1:8766")
DEFAULT_HOST_TOKEN = os.environ.get("P2P_HOST_TOKEN", "")

# Body truncation (privacy + disk: we never persist full request/response bodies
# unless the operator explicitly opts in via D2D_MITM_BODY=1)
BODY_SNIPPET_BYTES = 256
ALWAYS_LOG_BODY_TYPES = frozenset({"application/json", "application/x-www-form-urlencoded"})


# === Helpers ===
def _now_iso() -> str:
    return time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()) + f".{int((time.time() % 1) * 1000):03d}Z"


def _sha256(s: str) -> str:
    return hashlib.sha256(s.encode("utf-8", errors="replace")).hexdigest()


def _host_of(url: str) -> str:
    """Extract host (no port) from URL. Falls back to 'unknown'."""
    try:
        from urllib.parse import urlparse
        return urlparse(url).hostname or "unknown"
    except Exception:
        return "unknown"


def _truncate_body(content: Optional[bytes], content_type: str = "") -> dict:
    """Return a body summary without exposing the full payload."""
    if content is None:
        return {"present": False}
    size = len(content)
    if size == 0:
        return {"present": True, "size": 0}
    is_text = (
        content_type.startswith("text/")
        or content_type in ALWAYS_LOG_BODY_TYPES
        or "json" in content_type
        or "xml" in content_type
        or "form" in content_type
    )
    if is_text and size <= BODY_SNIPPET_BYTES:
        try:
            text = content.decode("utf-8", errors="replace")
            return {"present": True, "size": size, "snippet": text, "truncated": False}
        except Exception:
            pass
    # Otherwise, hash + size only — no raw bytes on disk
    return {
        "present": True,
        "size": size,
        "truncated": True,
        "sha256": _sha256(content.decode("utf-8", errors="replace")),
    }


# === Event serialization ===
def make_request_event(flow: Any) -> dict:
    """Build a JSONL event for an incoming request."""
    req = flow.request
    return {
        "type": "request",
        "ts": _now_iso(),
        "method": req.method,
        "scheme": req.scheme,
        "host": req.pretty_host,
        "port": req.port,
        "path": req.path,
        "url": req.pretty_url,
        "http_version": getattr(req, "http_version", "HTTP/1.1"),
        "headers_count": len(req.headers),
        "headers_hash": _sha256(repr(sorted(req.headers.items()))),
        "content_type": req.headers.get("content-type", ""),
        "content_length": int(req.headers.get("content-length", "0") or 0),
        "body": _truncate_body(req.raw_content, req.headers.get("content-type", "")),
    }


def make_response_event(flow: Any) -> dict:
    """Build a JSONL event for an outgoing response."""
    resp = flow.response
    req = flow.request
    duration_ms = 0
    if hasattr(flow, "request") and hasattr(req, "timestamp_start") and resp is not None:
        try:
            duration_ms = int((resp.timestamp_end - req.timestamp_start) * 1000)
        except Exception:
            pass
    return {
        "type": "response",
        "ts": _now_iso(),
        "method": req.method,
        "url": req.pretty_url,
        "host": req.pretty_host,
        "status_code": resp.status_code,
        "reason": resp.reason,
        "http_version": resp.http_version,
        "headers_count": len(resp.headers),
        "headers_hash": _sha256(repr(sorted(resp.headers.items()))),
        "content_type": resp.headers.get("content-type", ""),
        "content_length": int(resp.headers.get("content-length", "0") or 0),
        "body": _truncate_body(resp.raw_content, resp.headers.get("content-type", "")),
        "duration_ms": duration_ms,
    }


def make_error_event(flow: Any) -> dict:
    """Build a JSONL event for a flow error (DNS failure, TLS handshake, etc.)."""
    err = flow.error
    req = flow.request
    return {
        "type": "error",
        "ts": _now_iso(),
        "method": req.method,
        "url": req.pretty_url,
        "host": req.pretty_host,
        "error_type": type(err).__name__ if err else "Unknown",
        "error_msg": str(err)[:512] if err else "",
    }


# === Addon ===
class D2DMitmAddon:
    """mitmproxy addon that captures HTTP events to a JSONL stream."""

    def __init__(self) -> None:
        self.data_dir: str = DEFAULT_DATA_DIR
        self.graph_url: str = DEFAULT_GRAPH_URL
        self.host_token: str = DEFAULT_HOST_TOKEN
        self.forward_to_graph: bool = bool(int(os.environ.get("D2D_MITM_GRAPH", "0")))
        self.events_path: Optional[Path] = None
        self.stats: dict = {
            "started_at": "",
            "total_requests": 0,
            "total_responses": 0,
            "total_errors": 0,
            "by_status": {},
            "by_host": {},
            "by_method": {},
        }

    # === mitmproxy lifecycle ===
    def load(self, loader: Loader) -> None:
        loader.add_option(
            name="d2d_data_dir",
            typespec=Optional[str],
            default=None,
            help="Override D2D data directory for event storage.",
        )

    def running(self) -> None:
        """Called once mitmdump is up. Set up filesystem."""
        if _HAS_MITMPROXY and ctx is not None:
            try:
                override = getattr(ctx.options, "d2d_data_dir", None)
                if override:
                    self.data_dir = override
            except AttributeError:
                # ctx.options only exists inside a running mitmdump; skip override
                pass
        self.events_path = Path(self.data_dir) / "mitm" / "events.jsonl"
        self.events_path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.stats["started_at"] = _now_iso()
        if _HAS_MITMPROXY and ctx is not None:
            try:
                ctx.log.info(f"[d2d-mitm] events → {self.events_path}")
                ctx.log.info(f"[d2d-mitm] graphd forward: {self.forward_to_graph}")
            except AttributeError:
                pass

    def done(self) -> None:
        """Flush stats on shutdown."""
        self._write_stats()

    # === per-flow hooks ===
    def request(self, flow: Any) -> None:
        try:
            event = make_request_event(flow)
            self._append_event(event)
            self._update_stats(event)
        except Exception as e:
            self._log_error("request", e)

    def response(self, flow: Any) -> None:
        try:
            event = make_response_event(flow)
            self._append_event(event)
            self._update_stats(event)
        except Exception as e:
            self._log_error("response", e)

    def error(self, flow: Any) -> None:
        try:
            event = make_error_event(flow)
            self._append_event(event)
            self._update_stats(event)
        except Exception as e:
            self._log_error("error", e)

    # === tcp / websocket passthroughs (no-op safety wrappers) ===
    def tcp_message(self, flow: Any) -> None:
        """Capture TCP messages — privacy-sensitive, so hashed-only."""
        try:
            msg = getattr(flow, "messages", None)
            if not msg:
                return
            last = msg[-1]
            content = getattr(last, "content", b"") or b""
            event = {
                "type": "tcp",
                "ts": _now_iso(),
                "host": getattr(flow, "pretty_host", "unknown"),
                "size": len(content),
                "sha256": _sha256(content.decode("utf-8", errors="replace")) if content else "",
            }
            self._append_event(event)
            self.stats["total_requests"] = self.stats.get("total_requests", 0)
        except Exception as e:
            self._log_error("tcp_message", e)

    def websocket_message(self, flow: Any) -> None:
        """Capture WS messages — privacy-sensitive, so hashed-only."""
        try:
            msg = getattr(flow, "messages", None)
            if not msg:
                return
            last = msg[-1]
            content = getattr(last, "content", b"") or b""
            event = {
                "type": "ws",
                "ts": _now_iso(),
                "host": getattr(flow, "pretty_host", "unknown"),
                "from_client": bool(getattr(last, "from_client", False)),
                "size": len(content),
                "sha256": _sha256(content.decode("utf-8", errors="replace")) if content else "",
            }
            self._append_event(event)
        except Exception as e:
            self._log_error("websocket_message", e)

    # === internals ===
    def _append_event(self, event: dict) -> None:
        if self.events_path is None:
            return
        line = json.dumps(event, ensure_ascii=False) + "\n"
        # Append + fsync for durability under crash
        fd = os.open(str(self.events_path), os.O_WRONLY | os.O_CREAT | os.O_APPEND, 0o600)
        try:
            os.write(fd, line.encode("utf-8"))
            os.fsync(fd)
        finally:
            os.close(fd)
        # Optional: forward to graphd
        if self.forward_to_graph:
            self._forward_to_graph(event)

    def _forward_to_graph(self, event: dict) -> None:
        """POST event to graphd /write/signal (host-token channel)."""
        if not self.host_token:
            return
        try:
            import urllib.request
            import urllib.error
            payload = json.dumps({
                "cypher": "MERGE (s:Signal_ {id: $id}) SET s.type = $type, s.host = $host, s.url = $url, s.ts = $ts, s.meta = $meta",
                "params": {
                    "id": _sha256(event.get("url", "") + event.get("ts", "")),
                    "type": event.get("type", "unknown"),
                    "host": event.get("host", ""),
                    "url": event.get("url", ""),
                    "ts": event.get("ts", ""),
                    "meta": json.dumps({k: v for k, v in event.items() if k not in ("type", "ts", "host", "url")})[:1024],
                },
            }).encode("utf-8")
            req = urllib.request.Request(
                f"{self.graph_url}/write/signal",
                data=payload,
                headers={
                    "Content-Type": "application/json",
                    "X-Auth": f"host {self.host_token}",
                },
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=5) as resp:  # nosec
                resp.read()
        except Exception:
            # Best-effort; do not let graphd failure disrupt capture
            pass

    def _update_stats(self, event: dict) -> None:
        et = event.get("type")
        if et == "request":
            self.stats["total_requests"] += 1
            m = event.get("method", "?")
            self.stats["by_method"][m] = self.stats["by_method"].get(m, 0) + 1
            h = event.get("host", "?")
            self.stats["by_host"][h] = self.stats["by_host"].get(h, 0) + 1
        elif et == "response":
            self.stats["total_responses"] += 1
            s = str(event.get("status_code", "?"))
            self.stats["by_status"][s] = self.stats["by_status"].get(s, 0) + 1
        elif et == "error":
            self.stats["total_errors"] += 1

    def _write_stats(self) -> None:
        if self.events_path is None:
            return
        stats_path = self.events_path.parent / "stats.json"
        try:
            stats_path.write_text(json.dumps(self.stats, indent=2), encoding="utf-8")
            os.chmod(stats_path, 0o600)
        except Exception:
            pass

    def _log_error(self, hook: str, err: Exception) -> None:
        msg = f"[d2d-mitm] {hook} hook failed: {err}"
        if _HAS_MITMPROXY and ctx is not None:
            try:
                ctx.log.warn(msg)
                return
            except AttributeError:
                pass
        try:
            sys.stderr.write(msg + "\n")
        except Exception:
            # Last resort — swallow. Logging must never crash the addon.
            pass


# === mitmproxy entry point ===
addons = [D2DMitmAddon()]
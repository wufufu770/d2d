"""
@wufufu770/d2d-cli test - mitmproxy addon (Issue #56)

Uses mocked flow objects (no real mitmdump required). Run with:
  python3 -m pytest packages/cli/test/scanner/mitmproxy_addon_test.py -v
or:
  python3 -m unittest packages.cli.test.scanner.mitmproxy_addon_test -v
"""

import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Ensure the addon module is importable
_HERE = Path(__file__).resolve().parent
_REPO = _HERE.parents[1]  # packages/cli/test/scanner → packages/cli
sys.path.insert(0, str(_REPO / "src" / "scanner"))

from mitmproxy_addon import (  # noqa: E402
    D2DMitmAddon,
    make_request_event,
    make_response_event,
    make_error_event,
    _truncate_body,
)


def _make_flow(method="GET", url="http://example.com/path?q=1", status=200, body=None, err=None):
    """Build a mock mitmproxy HTTPFlow."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    flow = MagicMock()
    req = MagicMock()
    req.method = method
    req.scheme = parsed.scheme
    req.pretty_host = parsed.hostname or "unknown"
    req.host = parsed.hostname or "unknown"
    req.port = parsed.port or (443 if parsed.scheme == "https" else 80)
    req.path = parsed.path or "/"
    req.pretty_url = url
    req.http_version = "HTTP/1.1"
    req.headers = {"content-type": "application/json", "content-length": str(len(body or b""))}
    req.raw_content = body
    flow.request = req

    if err is not None:
        flow.error = err
        flow.response = None
    else:
        flow.response = MagicMock()
        flow.response.status_code = status
        flow.response.reason = "OK" if status < 400 else "ERR"
        flow.response.http_version = "HTTP/1.1"
        flow.response.headers = {"content-type": "application/json", "content-length": "100"}
        flow.response.raw_content = body or b'{"x":1}'
        # timestamps
        flow.response.timestamp_end = 1000.5
        req.timestamp_start = 1000.0

    return flow


class TestTruncateBody(unittest.TestCase):
    def test_none_body(self):
        out = _truncate_body(None)
        self.assertEqual(out, {"present": False})

    def test_empty_body(self):
        out = _truncate_body(b"")
        self.assertEqual(out, {"present": True, "size": 0})

    def test_small_json_body_returns_snippet(self):
        out = _truncate_body(b'{"a":1}', "application/json")
        self.assertTrue(out["present"])
        self.assertFalse(out.get("truncated", False))
        self.assertIn("snippet", out)
        self.assertEqual(out["snippet"], '{"a":1}')

    def test_large_body_hashed_not_raw(self):
        big = b"X" * 1000
        out = _truncate_body(big, "application/json")
        self.assertTrue(out["present"])
        self.assertTrue(out["truncated"])
        self.assertNotIn("snippet", out)
        self.assertIn("sha256", out)
        self.assertEqual(out["size"], 1000)


class TestEventSerialization(unittest.TestCase):
    def test_request_event_shape(self):
        flow = _make_flow(method="POST", url="http://api.example.com/v1/foo", body=b'{"x":1}')
        event = make_request_event(flow)
        self.assertEqual(event["type"], "request")
        self.assertEqual(event["method"], "POST")
        self.assertEqual(event["host"], "api.example.com")
        self.assertEqual(event["path"], "/v1/foo")
        self.assertEqual(event["scheme"], "http")
        self.assertIn("ts", event)
        self.assertIn("headers_hash", event)

    def test_response_event_shape(self):
        flow = _make_flow(status=200)
        event = make_response_event(flow)
        self.assertEqual(event["type"], "response")
        self.assertEqual(event["status_code"], 200)
        self.assertEqual(event["method"], "GET")
        self.assertEqual(event["host"], "example.com")
        self.assertEqual(event["duration_ms"], 500)  # 1000.5 - 1000.0 = 0.5s = 500ms

    def test_error_event_shape(self):
        err = TimeoutError("DNS resolution failed")
        flow = _make_flow(err=err)
        event = make_error_event(flow)
        self.assertEqual(event["type"], "error")
        self.assertEqual(event["error_type"], "TimeoutError")
        self.assertIn("DNS", event["error_msg"])


class TestAddon(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp(prefix="d2d-mitm-")
        self.addon = D2DMitmAddon()
        self.addon.data_dir = self.tmp
        self.addon.forward_to_graph = False
        self.addon.running()  # init filesystem

    def tearDown(self):
        import shutil
        shutil.rmtree(self.tmp, ignore_errors=True)

    def test_running_creates_data_dir_with_mode_0o700(self):
        p = Path(self.tmp) / "mitm" / "events.jsonl"
        self.assertTrue(p.parent.exists())
        mode = p.parent.stat().st_mode & 0o777
        self.assertEqual(mode, 0o700)

    def test_request_writes_jsonl(self):
        flow = _make_flow()
        self.addon.request(flow)
        events_path = Path(self.tmp) / "mitm" / "events.jsonl"
        self.assertTrue(events_path.exists())
        lines = events_path.read_text(encoding="utf-8").strip().split("\n")
        self.assertEqual(len(lines), 1)
        ev = json.loads(lines[0])
        self.assertEqual(ev["type"], "request")

    def test_response_updates_stats(self):
        flow = _make_flow(status=404)
        self.addon.response(flow)
        self.assertEqual(self.addon.stats["total_responses"], 1)
        self.assertEqual(self.addon.stats["by_status"]["404"], 1)
        # by_host is only incremented on request, not response
        self.assertNotIn("example.com", self.addon.stats["by_host"])

    def test_error_event_increments_errors(self):
        flow = _make_flow(err=ConnectionError("refused"))
        self.addon.error(flow)
        self.assertEqual(self.addon.stats["total_errors"], 1)

    def test_multiple_events_appended(self):
        for i in range(5):
            self.addon.request(_make_flow(method="GET"))
        for i in range(3):
            self.addon.response(_make_flow(status=200 + i))
        events_path = Path(self.tmp) / "mitm" / "events.jsonl"
        lines = events_path.read_text(encoding="utf-8").strip().split("\n")
        self.assertEqual(len(lines), 8)
        self.assertEqual(self.addon.stats["total_requests"], 5)
        self.assertEqual(self.addon.stats["total_responses"], 3)

    def test_events_file_mode_0o600(self):
        self.addon.request(_make_flow())
        events_path = Path(self.tmp) / "mitm" / "events.jsonl"
        mode = events_path.stat().st_mode & 0o777
        self.assertEqual(mode, 0o600)

    def test_done_writes_stats(self):
        self.addon.request(_make_flow(method="POST"))
        self.addon.response(_make_flow(status=200))
        self.addon.done()
        stats_path = Path(self.tmp) / "mitm" / "stats.json"
        self.assertTrue(stats_path.exists())
        stats = json.loads(stats_path.read_text(encoding="utf-8"))
        self.assertEqual(stats["total_requests"], 1)
        self.assertEqual(stats["total_responses"], 1)
        self.assertIn("started_at", stats)

    def test_body_not_persisted_raw_privacy(self):
        flow = _make_flow(body=b"SECRET-LEAK-XYZ" * 100)
        self.addon.request(flow)
        events_path = Path(self.tmp) / "mitm" / "events.jsonl"
        content = events_path.read_text(encoding="utf-8")
        # Raw body must NEVER appear in the JSONL (privacy guarantee)
        self.assertNotIn("SECRET-LEAK-XYZ", content)
        # But metadata is present
        ev = json.loads(content.strip().split("\n")[0])
        self.assertIn("body", ev)
        self.assertTrue(ev["body"]["truncated"])
        self.assertIn("sha256", ev["body"])

    def test_forward_to_graph_called_when_enabled(self):
        self.addon.forward_to_graph = True
        self.addon.host_token = "test-token"
        with patch.object(self.addon, "_forward_to_graph") as mock_fwd:
            self.addon.request(_make_flow())
            mock_fwd.assert_called_once()
            args, _ = mock_fwd.call_args
            self.assertEqual(args[0]["type"], "request")

    def test_forward_to_graph_swallows_errors(self):
        self.addon.forward_to_graph = True
        self.addon.host_token = "test-token"
        # Simulate urllib failure — addon must not raise
        with patch("urllib.request.urlopen", side_effect=ConnectionError("graphd down")):
            self.addon.request(_make_flow())  # should not raise

    def test_forward_to_graph_skipped_without_token(self):
        self.addon.forward_to_graph = True
        self.addon.host_token = ""  # no token
        with patch("urllib.request.urlopen") as mock_urlopen:
            self.addon.request(_make_flow())
            mock_urlopen.assert_not_called()

    def test_invalid_flow_does_not_crash(self):
        """A flow with missing attributes must be handled gracefully."""
        bad_flow = MagicMock(spec=[])  # no request attribute
        # Should not raise (caught by _log_error)
        self.addon.request(bad_flow)

    def test_stats_by_method(self):
        self.addon.request(_make_flow(method="GET"))
        self.addon.request(_make_flow(method="GET"))
        self.addon.request(_make_flow(method="POST"))
        self.assertEqual(self.addon.stats["by_method"]["GET"], 2)
        self.assertEqual(self.addon.stats["by_method"]["POST"], 1)


class TestMitmProxyAddonEntry(unittest.TestCase):
    def test_addons_module_attribute_exists(self):
        """The addon module must expose `addons = [D2DMitmAddon()]` for mitmdump -s."""
        from mitmproxy_addon import addons
        self.assertEqual(len(addons), 1)
        self.assertIsInstance(addons[0], D2DMitmAddon)


if __name__ == "__main__":
    unittest.main()
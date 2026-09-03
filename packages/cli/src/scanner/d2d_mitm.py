#!/usr/bin/env python3
"""
@wufufu770/d2d-cli — `d2d mitm` subcommand wrapper (Issue #56)

Manages the mitmdump lifecycle + addon. Subcommands:
  start   — spawn mitmdump with the d2d addon loaded
  stop    — kill the running mitmdump process (PID file)
  status  — show events captured + last stats
  tail    — print last N events (default 20)

PID file: ~/.d2d-data/mitm/mitmdump.pid
Logs:     ~/.d2d-data/mitm/mitmdump.log
"""

from __future__ import annotations

import json
import os
import signal
import subprocess
import sys
import time
from pathlib import Path
from typing import Optional


DEFAULT_DATA_DIR = os.environ.get(
    "D2D_DATA_DIR",
    os.path.join(os.path.expanduser("~"), ".d2d-data"),
)


def _state_dir() -> Path:
    p = Path(DEFAULT_DATA_DIR) / "mitm"
    p.mkdir(parents=True, exist_ok=True, mode=0o700)
    return p


def _pid_path() -> Path:
    return _state_dir() / "mitmdump.pid"


def _log_path() -> Path:
    return _state_dir() / "mitmdump.log"


def _events_path() -> Path:
    return _state_dir() / "events.jsonl"


def _stats_path() -> Path:
    return _state_dir() / "stats.json"


def cmd_start(args: list) -> int:
    """Spawn mitmdump with d2d addon loaded."""
    port = 8080
    graph = False
    body = False
    i = 0
    while i < len(args):
        a = args[i]
        if a == "--port" and i + 1 < len(args):
            port = int(args[i + 1])
            i += 2
        elif a == "--graph":
            graph = True
            i += 1
        elif a == "--body":
            body = True
            i += 1
        else:
            i += 1

    if _pid_path().exists():
        try:
            pid = int(_pid_path().read_text().strip())
            os.kill(pid, 0)
            print(f"[d2d-mitm] already running (pid={pid})", file=sys.stderr)
            return 1
        except (ProcessLookupError, ValueError):
            _pid_path().unlink(missing_ok=True)

    addon_path = Path(__file__).parent / "mitmproxy_addon.py"
    if not addon_path.exists():
        print(f"[d2d-mitm] addon not found: {addon_path}", file=sys.stderr)
        return 2

    env = os.environ.copy()
    env["D2D_DATA_DIR"] = DEFAULT_DATA_DIR
    if graph:
        env["D2D_MITM_GRAPH"] = "1"
    if body:
        env["D2D_MITM_BODY"] = "1"

    log_f = open(_log_path(), "ab", buffering=0)
    proc = subprocess.Popen(
        [
            sys.executable, "-m", "mitmproxy_rs",
            # fall back to mitmdump if mitmproxy_rs unavailable
        ] if False else [
            "mitmdump",
            "-s", str(addon_path),
            "--listen-port", str(port),
            "--set", f"d2d_data_dir={DEFAULT_DATA_DIR}",
        ],
        env=env,
        stdout=log_f,
        stderr=log_f,
        stdin=subprocess.DEVNULL,
        start_new_session=True,
    )
    _pid_path().write_text(str(proc.pid) + "\n", encoding="utf-8")
    _pid_path().chmod(0o600)
    print(f"[d2d-mitm] started (pid={proc.pid}, port={port}, graph={graph})")
    return 0


def cmd_stop(args: list) -> int:
    if not _pid_path().exists():
        print("[d2d-mitm] not running")
        return 0
    try:
        pid = int(_pid_path().read_text().strip())
        os.kill(pid, signal.SIGTERM)
        for _ in range(10):
            time.sleep(0.5)
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                break
        else:
            os.kill(pid, signal.SIGKILL)
        print(f"[d2d-mitm] stopped (pid={pid})")
    finally:
        _pid_path().unlink(missing_ok=True)
    return 0


def cmd_status(args: list) -> int:
    pid: Optional[int] = None
    if _pid_path().exists():
        try:
            pid = int(_pid_path().read_text().strip())
            os.kill(pid, 0)
        except (ProcessLookupError, ValueError):
            pid = None
            _pid_path().unlink(missing_ok=True)
    print(f"running: {'yes' if pid else 'no'}")
    if pid:
        print(f"pid: {pid}")
    if _stats_path().exists():
        s = json.loads(_stats_path().read_text(encoding="utf-8"))
        print(f"events: requests={s.get('total_requests', 0)} responses={s.get('total_responses', 0)} errors={s.get('total_errors', 0)}")
    else:
        print("events: (none yet)")
    if _events_path().exists():
        print(f"events.jsonl: {_events_path()} ({_events_path().stat().st_size} bytes)")
    return 0


def cmd_tail(args: list) -> int:
    n = 20
    if args and args[0].isdigit():
        n = int(args[0])
    if not _events_path().exists():
        print("[d2d-mitm] no events yet")
        return 0
    lines = _events_path().read_text(encoding="utf-8").strip().split("\n")
    for line in lines[-n:]:
        try:
            ev = json.loads(line)
            t = ev.get("type", "?")
            ts = ev.get("ts", "?")
            if t == "request":
                print(f"{ts} REQ  {ev.get('method','?'):6} {ev.get('url','?')}")
            elif t == "response":
                print(f"{ts} RES  {ev.get('status_code','?'):3} {ev.get('method','?'):6} {ev.get('url','?')} ({ev.get('duration_ms',0)}ms)")
            elif t == "error":
                print(f"{ts} ERR  {ev.get('error_type','?')} {ev.get('url','?')} {ev.get('error_msg','')[:80]}")
            elif t in ("ws", "tcp"):
                print(f"{ts} {t.upper():4} {ev.get('host','?')} size={ev.get('size',0)}")
            else:
                print(f"{ts} ???  {line[:120]}")
        except Exception:
            print(line[:120])
    return 0


def main(argv: list) -> int:
    if len(argv) < 2:
        print("usage: d2d-mitm <start|stop|status|tail [N]>")
        return 2
    cmd = argv[1]
    rest = argv[2:]
    if cmd == "start":
        return cmd_start(rest)
    if cmd == "stop":
        return cmd_stop(rest)
    if cmd == "status":
        return cmd_status(rest)
    if cmd == "tail":
        return cmd_tail(rest)
    print(f"unknown command: {cmd}")
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
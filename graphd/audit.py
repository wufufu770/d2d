"""
graphd/audit.py — M security hardening

Structured audit logging for security-relevant events. Writes JSONL to
~/.d2d-data/audit/security.jsonl. PII is redacted before write.
"""
import json
import os
import time
import threading
from pathlib import Path

# Lazy PII redaction — try to import from app.py; fall back to no-op
try:
    from app import redact_pii  # type: ignore
except ImportError:
    def redact_pii(s: str):
        return s, 0


_AUDIT_LOCK = threading.Lock()
_AUDIT_PATH = None  # lazy init
_AUDIT_ENABLED = os.environ.get("P2P_AUDIT", "1") != "0"


def _ensure_audit_path() -> str:
    global _AUDIT_PATH
    if _AUDIT_PATH is not None:
        return _AUDIT_PATH
    # Resolve audit dir from env or default ~/.d2d-data/audit
    data_dir = os.environ.get("D2D_DATA_DIR") or os.path.expanduser("~/.d2d-data")
    audit_dir = Path(data_dir) / "audit"
    audit_dir.mkdir(parents=True, exist_ok=True)
    _AUDIT_PATH = str(audit_dir / "security.jsonl")
    return _AUDIT_PATH


def _audit_log(event: str, payload: dict) -> None:
    """Write a structured audit log entry. Thread-safe."""
    if not _AUDIT_ENABLED:
        return
    try:
        # Redact PII in payload values (strings only, shallow)
        safe_payload = {}
        for k, v in payload.items():
            if isinstance(v, str):
                redacted, _ = redact_pii(v)
                safe_payload[k] = redacted[:500]  # cap length
            else:
                safe_payload[k] = v

        entry = {
            "ts": time.time(),
            "event": event,
            **safe_payload,
        }
        path = _ensure_audit_path()
        with _AUDIT_LOCK:
            with open(path, "a", encoding="utf-8") as f:
                f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        # Audit logging must never break main flow
        pass


def audit_auth_failure(reason: str, got_token_prefix: str = "") -> None:
    _audit_log("auth_failure", {"reason": reason, "token_prefix": got_token_prefix[:8]})


def audit_denylist_hit(asset: str, path: str) -> None:
    _audit_log("denylist_hit", {"asset": asset, "path": path})


def audit_transition_violation(from_state: str, to_state: str, actor: str) -> None:
    _audit_log("transition_violation", {"from": from_state, "to": to_state, "actor": actor})


def audit_token_perm_issue(path: str, mode: int, owner: int) -> None:
    _audit_log("token_perm_issue", {"path": path, "mode": oct(mode), "owner": owner})


def audit_gate_block(gate: str, reason: str, context: dict = None) -> None:
    _audit_log("gate_block", {"gate": gate, "reason": reason, "context": context or {}})

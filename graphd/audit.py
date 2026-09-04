#!/usr/bin/env python3
"""graphd 审计日志(issue #73) — 认证失败 / denylist 命中 / 非法状态迁移统一追加 JSONL。

与 graphd/app.py 的关系: app.py 以 try/except 降级导入本模块(缺失/损坏时审计退化为
无操作) —— 审计是尽力而为(best-effort)旁路, 永不阻断或改变门控判定结果。

格式: 每行一个 JSON 对象 {"ts": <iso8601 utc>, "kind": <str>, "detail": <obj>}
落盘: P2P_AUDIT_LOG 环境变量优先, 默认 ~/.d2d-data/logs/audit.log
加固: 目录创建 0700 / 文件 0600(且每次写前 fchmod 收窄, 防外部 chmod 放宽) /
      O_NOFOLLOW(防符号链接替换导向任意路径写, 与 app.py token 落盘同口径)。
失败语义: 写失败静默计数(stderr 仅提示一次, 防写失败被用来刷屏), 后续失败只累计。
"""
import json
import os
import sys
import threading
from datetime import datetime, timezone

_lock = threading.Lock()
_fail_count = 0
_warned = False


def _audit_path():
    """审计文件路径 — 调用时读取环境变量(测试可逐用例重定向到临时目录)。"""
    return os.environ.get(
        "P2P_AUDIT_LOG",
        os.path.join(os.path.expanduser("~"), ".d2d-data", "logs", "audit.log"))


def audit_event(kind, detail) -> bool:
    """追加一条审计事件(JSONL 单行)。返回 True=落盘成功 / False=静默失败(已计数)。
    本函数永不抛异常 —— 调用点(_auth / denylist 门 / transition 门)不允许被审计故障阻断。"""
    global _fail_count, _warned
    try:
        path = _audit_path()
        parent = os.path.dirname(path)
        if parent:
            # 目录 0700(创建时 mode; umask 只可能收紧不会放宽)
            os.makedirs(parent, 0o700, exist_ok=True)
        line = json.dumps({"ts": datetime.now(timezone.utc).isoformat(),
                           "kind": str(kind or ""), "detail": detail},
                          ensure_ascii=False) + "\n"
        with _lock:
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
            try:
                os.fchmod(fd, 0o600)  # 既有文件被外部放宽时, 每次写前收窄回 0600
                os.write(fd, line.encode("utf-8"))
            finally:
                os.close(fd)
        return True
    except Exception as _e:
        with _lock:
            _fail_count += 1
            _first = not _warned
            _warned = True
        if _first:
            print(f"[audit] audit log write failed (subsequent failures silent, count continues): {_e}",
                  file=sys.stderr, flush=True)
        return False

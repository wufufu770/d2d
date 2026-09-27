#!/usr/bin/env python3
"""graphd 审计日志(issue #73) — 认证失败 / denylist 命中 / 非法状态迁移统一追加 JSONL。

与 graphd/app.py 的关系: app.py 以 try/except 降级导入本模块(缺失/损坏时审计退化为
无操作) —— 审计是尽力而为(best-effort)旁路, 永不阻断或改变门控判定结果。

格式: 每行一个 JSON 对象 {"ts": <iso8601 utc>, "kind": <str>, "detail": <obj>}
落盘: P2P_AUDIT_LOG 环境变量优先, 默认 ~/.d2d-data/logs/audit.log
加固: 目录创建 0700 / 文件 0600(且每次写前 fchmod 收窄, 防外部 chmod 放宽) /
      O_NOFOLLOW(防符号链接替换导向任意路径写, 与 app.py token 落盘同口径)。
失败语义: 写失败静默计数(stderr 仅提示一次, 防写失败被用来刷屏), 后续失败只累计。
8-2: 可用性显式化 —— status() 纯读访问器暴露 写失败计数/首错摘要(导入级状态由 app.py
持有, 见 app.py _audit_mod/_audit_import_error); 写路径语义零改动, 只是失败不再不可见。
"""
import json
import os
import sys
import threading
from datetime import datetime, timezone

_lock = threading.Lock()
_fail_count = 0
_warned = False
_first_error = ""  # 8-2: 首错摘要(status() 暴露; 仅记录第一条, 后续失败只累计不覆盖)


def status():
    """8-2: 审计可用性状态快照(纯读零副作用, /health 回显消费 —— app.py _audit_degraded_status
    经此访问, 避免触 _fail_count/_warned 私有名)。返回:
      {"available": True —— 本函数能被调用即证明模块已成功导入(导入级降级由调用方判 None),
       "write_failures": <int 累计写失败次数>,
       "first_error": <str 首错摘要, 无失败为空串>}
    本函数只读锁内全局, 恒不抛、恒返回 dict —— /health 健康面读取不得成为新故障面。"""
    with _lock:
        return {"available": True, "write_failures": int(_fail_count), "first_error": _first_error}


def _audit_path():
    """审计文件路径 — 调用时读取环境变量(测试可逐用例重定向到临时目录)。"""
    return os.environ.get(
        "P2P_AUDIT_LOG",
        os.path.join(os.path.expanduser("~"), ".d2d-data", "logs", "audit.log"))


def audit_event(kind, detail) -> bool:
    """追加一条审计事件(JSONL 单行)。返回 True=落盘成功 / False=静默失败(已计数)。
    本函数永不抛异常 —— 调用点(_auth / denylist 门 / transition 门)不允许被审计故障阻断。"""
    global _fail_count, _warned, _first_error
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
            if not _first_error:  # 8-2: 首错摘要仅供 status() 暴露, 不改变既有静默计数语义
                _first_error = f"{type(_e).__name__}: {_e}"[:200]
        if _first:
            print(f"[audit] audit log write failed (subsequent failures silent, count continues): {_e}",
                  file=sys.stderr, flush=True)
        return False

#!/usr/bin/env python3
"""graphd 转态旁路日志(8-1) — 三转态端点成功路径统一追加 JSONL(append-only)。

与 graphd/audit.py 的关系: 同属 JSONL 审计旁路族 —— 逐字镜像其落盘惯例
(audit.py:24-28 env 调用时实读 / :36-50 目录 0700+O_APPEND|O_NOFOLLOW+0600+fchmod 收窄 /
 :52-60 失败静默计数 stderr 仅一次)。差异: audit 记「拒绝与失败」(auth-fail/denylist-hit/
 transition-illegal), 本模块记「转态成功本体」(谁把哪个节点从什么态推到什么态)。
与 graphd/app.py 的关系: app.py 以 try/except 降级导入本模块(缺失/损坏时转态日志退化为
无操作) —— 日志是尽力而为(best-effort)旁路, 永不阻断或改变转态判定与响应
(_audit_event 同款哲学, app.py:29-33 先例)。

格式: 每行一个 JSON 对象, 恒 8 字段:
  {"transition_id": <uuid4>, "node_id": <str>, "from_status": <str>, "to_status": <str>,
   "actor": <str>, "reason": <str>, "source_batch": <str>, "timestamp": <iso8601 utc>}
落盘: P2P_TRANSITION_LOG 环境变量优先(调用时读取, 不 import 时缓存 —— pytest
      monkeypatch 可逐用例重定向, audit.py:25 同款设计), 默认 ~/.d2d-data/logs/transition-log.jsonl。
加固: 目录创建 0700 / 文件 0600(且每次写前 fchmod 收窄, 防外部 chmod 放宽) /
      O_NOFOLLOW(防符号链接替换导向任意路径写, audit.py:45 与 app.py token 落盘同口径)。
append-only: 只以 O_APPEND 追加单行, 从不读/改/删已有行(单次 os.write 原子落行)。
红线注记: /write/transition 的 reason 受 app.py:471 denylist 扫描豁免(合规隔离转移需引用
      红线资产本身), 故本日志文件可能含红线资产字符串 —— 权限模型必须与 audit.log 同级
      (0600/0700, 本模块恒定执行)。
失败语义: 写失败静默计数(stderr 仅提示一次, 防写失败被用来刷屏), 后续失败只累计;
      恒不抛 —— 三转态端点成功路径不允许被日志故障阻断。
无 SQL 无出网: 纯本地文件追加(无 kuzu 依赖, 无任何网络调用)。
"""
import json
import os
import sys
import threading
import uuid
from datetime import datetime, timezone

_lock = threading.Lock()
_fail_count = 0
_warned = False

# 字段长度上限(超长截断 —— 端点侧只做必填校验, 截断收敛在单点; 长度惯例对齐树内先例:
# actor/reviewer :80(app.py 审计事件先例) / node_id :200 / 态名 :64 / reason :2000
# (replay_matrix 同款) / source_batch :200(report_status 同款))
_MAX = {"node_id": 200, "from_status": 64, "to_status": 64,
        "actor": 80, "reason": 2000, "source_batch": 200}


def _transition_log_path():
    """转态日志文件路径 — 调用时读取环境变量(测试可逐用例重定向到临时目录;
    audit.py:24-28 _audit_path 逐字镜像, 仅换 env 名与缺省文件名)。"""
    return os.environ.get(
        "P2P_TRANSITION_LOG",
        os.path.join(os.path.expanduser("~"), ".d2d-data", "logs", "transition-log.jsonl"))


def _rotate_if_needed(path):
    """HYG-1: 写入侧日志轮转 — 上限默认 50MB、保留 5 份(P2P_LOG_MAX_MB/P2P_LOG_KEEP 可调);
    audit.py _rotate_if_needed 同源镜像(两写入侧同批同改)。调用于锁内追加前; 轮转失败
    静默跳过(不阻断转态日志写入, 与本模块"日志故障不阻断转态"同义, 下次写入重试)。
    读侧兼容: 面板 sankey 尾读活跃路径(snapshot.mjs sankeyLines 20000 上限按文件语义
    不变), 轮转=活跃文件换新, 尾读语义不变。"""
    try:
        max_bytes = int(os.environ.get("P2P_LOG_MAX_MB", "50")) * 1024 * 1024
        keep = max(1, int(os.environ.get("P2P_LOG_KEEP", "5")))
        if os.path.getsize(path) < max_bytes:
            return
        for i in range(keep - 1, 0, -1):
            if os.path.exists(f"{path}.{i}"):
                os.replace(f"{path}.{i}", f"{path}.{i + 1}")
        os.replace(path, f"{path}.1")
    except Exception:
        pass  # 已记因: 轮转失败不阻断转态日志写入(下次写重试); 静默与本模块失败语义一致


def log_transition(entry) -> bool:
    """追加一条转态日志(JSONL 单行)。返回 True=落盘成功 / False=静默失败(已计数)。
    本函数永不抛异常 —— 调用点(三转态端点成功路径)不允许被日志故障阻断。
    entry 为 dict 形参 {transition_id?, node_id, from_status, to_status, actor, reason,
    source_batch?, timestamp?}: transition_id 缺省服务端生成 uuid4(stdlib), timestamp
    缺省 UTC ISO(与 audit.py:41 同式); 调用方传值则原样透传(截断后落盘)。"""
    global _fail_count, _warned
    try:
        e = entry if isinstance(entry, dict) else {}
        rec = {
            "transition_id": str(e.get("transition_id") or uuid.uuid4()),
            "node_id": str(e.get("node_id") or "")[:_MAX["node_id"]],
            "from_status": str(e.get("from_status") or "")[:_MAX["from_status"]],
            "to_status": str(e.get("to_status") or "")[:_MAX["to_status"]],
            "actor": str(e.get("actor") or "")[:_MAX["actor"]],
            "reason": str(e.get("reason") or "")[:_MAX["reason"]],
            "source_batch": str(e.get("source_batch") or "")[:_MAX["source_batch"]],
            "timestamp": str(e.get("timestamp")
                             or datetime.now(timezone.utc).isoformat()),
        }
        path = _transition_log_path()
        parent = os.path.dirname(path)
        if parent:
            # 目录 0700(创建时 mode; umask 只可能收紧不会放宽) — audit.py:40 同款
            os.makedirs(parent, 0o700, exist_ok=True)
        line = json.dumps(rec, ensure_ascii=False) + "\n"
        with _lock:
            _rotate_if_needed(path)  # HYG-1: 上限轮转(失败静默, 见 helper 注释)
            fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_APPEND | os.O_NOFOLLOW, 0o600)
            try:
                os.fchmod(fd, 0o600)  # 既有文件被外部放宽时, 每次写前收窄回 0600(audit.py:47 同款)
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
            print(f"[transition-log] log write failed (subsequent failures silent, count continues): {_e}",
                  file=sys.stderr, flush=True)
        return False

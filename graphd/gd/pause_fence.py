"""取消文件须与同一写锁窗口内的 engagement 快照对账，不新增 schema。"""


def pause_applies(pause, row):
    if not isinstance(pause, dict) or not pause.get("paused") or not row:
        return False
    status, cancel, owner, lease_at = row
    if pause.get("v") == 2:
        # stop CAS 释放 owner，但保留取消世代；新 owner 认领会清 cancel/更新 lease_at。
        return (status in ("frozen", "completed", "exhausted")
                and str(cancel).lower() == "true" and not owner
                and isinstance(pause.get("lease_at"), int)
                and pause["lease_at"] == lease_at)
    # v1 文件没有世代；旧 by 或完全不带 by 的文件不能阻断新 active owner。
    if status == "active":
        return False
    return True

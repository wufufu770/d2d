"""gd.auth — token 认证纯判定(host/worker/遗留 P2P_TOKEN)与 token 文件路径白名单。
纯代码搬移自 graphd/app.py(巨型文件拆分), 判定逻辑逐字保留零改动;
app.py 侧 re-export 保持 `from graphd.app import X` 既有导入路径不变。"""
import hmac
import os
import sys


def legacy_token_ok(got, tok, host="", worker=""):
    """中危审计修复(11)(纯函数供 pytest): 遗留 P2P_TOKEN 门。优先级 —— host/worker token 为准,
    P2P_TOKEN 仅兼容旧客户端: 三者任一与 X-Auth 恒等匹配即过(旧实现只认 P2P_TOKEN, 与
    host/worker token 并存时形成认证矩阵死锁)。全部为空 → False(fail-closed)。"""
    got = got or ""
    if not got:
        return False
    if tok and hmac.compare_digest(got, tok):
        return True
    if host and hmac.compare_digest(got, host):
        return True
    if worker and hmac.compare_digest(got, worker):
        return True
    return False


def auth_check(level, got):
    """#73 拆分: 纯判定逻辑(_auth 负责失败审计包装), 判定规则与原 _auth 完全一致。
    (纯代码搬移自 Handler._auth_check: X-Auth 头读取上移为参数 got, 由调用方传入,
    判定主体逐字保留 —— env 读取与比较顺序均未改动。)"""
    # #32 严格版: 无任何开放回退 —— 未配置 token 的端点一律拒绝
    host = os.environ.get("P2P_HOST_TOKEN", "")
    worker = os.environ.get("P2P_WORKER_TOKEN", "")
    # 中危审计修复(12): P2P_TOKEN_REQUIRED=1(生产模式)此前只在启动日志打印, 判定处从不
    # 消费 = 死开关。现接上: required 时对应级 token 未配置一律拒绝(不再退到开放回退)。
    if os.environ.get("P2P_TOKEN_REQUIRED") == "1":
        if level == "host" and not host:
            return False
        if level != "host" and not (worker or host):
            return False
    if level == "host":
        return bool(host) and bool(got) and hmac.compare_digest(got, host)
    # #33修复: host token 单独配置时也放行宿主写入
    if worker:
        if got and worker and hmac.compare_digest(got, worker):
            return True
        if got and host and hmac.compare_digest(got, host):
            return True
        return False
    # I-013: range 开放改为显式 opt-in(P2P_OPEN_RANGE=1), 默认 fail-closed
    if os.environ.get("P2P_OPEN_RANGE") == "1":
        return True
    return False


def _safe_token_path(p):
    """路径参数白名单: token 文件仅允许位于 ~/.config/d2d/ 下(防 env 污染导向任意路径读写)"""
    base = os.path.realpath(os.path.expanduser("~/.config/d2d"))
    r = os.path.realpath(os.path.expanduser(p))
    if not r.startswith(base + os.sep):
        print(f"[graphd] token path rejected (outside {base}): {p}", flush=True)
        sys.exit(1)
    return r

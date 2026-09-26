"""gd.injection_sampling — 4-3b 段3: 注入检测 0.1% 原文采样留存(事后取证)。

落点(用户拍板): ${DATA_DIR}/logs/injection-samples/ — DATA_DIR 必须跟随 D2D_DATA_DIR env:
    os.environ.get('D2D_DATA_DIR', os.path.expanduser('~/.d2d-data'))
 仓内正确先例 = graphd/app.py:238 _D2D_PAUSE_FILE 同式(调用时实读, pytest monkeypatch 即时
 生效); 不要照抄 gates.py:21 denylist 先例(硬编码 ~/.d2d-data 不跟 env)。config.dataDir 为
 JS 特例(scheduler.js:64), Python 读端不读 JS config —— 实现要求非 mismatch(段2
 gd/injection_patterns.py 注释同源)。JS 读端 = plugin/pentest-dsh/scheduler/injection-sampling.mjs
 (同式同模, sha256 跨端一致)。

文件名 = UTC 时间戳 + 随机 ID(uuid4 短码), JSON 字段:
  original(原文) / sanitized(消毒后) / matched(匹配模式) / tool(来源工具) / ts(时间戳)。

两层采样(拍板): ① 命中强制入样 —— 注入检测命中(matched='high'/'soft')即入样, 不受采样率限;
② 0.1% 确定性采样 sha256(原文)%1000==0(重放一致, 避免随机漏采; 全 hex 大整数取模, 散布均匀)。
PII 红线: 调用点一律位于 redact_pii 之后(app.py「先脱敏后检测」既有顺序, 本模块只挂采样不
改顺序), 入参文本不含 PII 明文 —— 样本原文头 ≤2000 字符(sanitized 由端点长度门天然钳界)。
失败静默+计数器: 全程 try/except 吞异常并计数(stats() 可观测), 恒不抛 —— 采样故障绝不影响
门/闸/端点语义。权限红线: 目录 0700 / 文件 0600(mkdir/写后显式 chmod 定型, 不吃 umask)。
"""
import datetime as _dt
import hashlib
import json
import os
import uuid

SAMPLE_RATE_MODULUS = 1000  # ② 0.1% 确定性采样模数(sha256(原文) % 1000 == 0)
ORIGINAL_HEAD_MAX = 2000    # 原文只留头部 2000 字符(样本体积上限, 拍板)

_STATS = {"writes": 0, "failures": 0}  # 失败静默的可见面: 成功/失败计数器


def data_dir():
    """DATA_DIR 根: 跟随 D2D_DATA_DIR env, 缺省 ~/.d2d-data(app.py:238 同式)。
    调用时实读非 import 时缓存 —— redact_pii 开关的 env 实时读形态同款(:222 注释)。"""
    return os.environ.get("D2D_DATA_DIR", os.path.expanduser("~/.d2d-data"))


def sample_dir():
    """采样留存目录: ${DATA_DIR}/logs/injection-samples/。"""
    return os.path.join(data_dir(), "logs", "injection-samples")


def sha256_mod(text, modulus=SAMPLE_RATE_MODULUS):
    """sha256(text) 全 hex 十六进制整值对 modulus 取模 —— 确定性采样散步函数
    (JS 读端 injection-sampling.mjs 同式同模, 同输入跨端同结果)。str() 化对齐
    experience_injection_scan 的入参容忍形态。"""
    return int(hashlib.sha256(str(text or "").encode("utf-8")).hexdigest(), 16) % int(modulus)


def should_sample_rate(text):
    """② 0.1% 确定性采样判定: sha256(原文)%1000==0。异常静默 False(采样故障不外溢)。"""
    try:
        return sha256_mod(text) == 0
    except Exception:
        return False


def stats():
    """观测计数器(writes/failures)快照 — 生产只读, 测试锚定失败静默行为。"""
    return dict(_STATS)


def _reset_stats_for_test():
    """测试隔离用: 清计数器(生产路径无需调用)。"""
    _STATS["writes"] = 0
    _STATS["failures"] = 0


def record_injection_sample(tool, original, sanitized, matched):
    """采样统一入口(唯一写盘面): ①命中(matched∈{'high','soft'}, 非空非'clean')强制入样;
    否则走 ②0.1% 确定性采样。目录自动创建(0700), 文件 0600 + O_EXCL 防覆盖(取证件不踏写)。
    全程 try/except 吞异常+计数, 恒不抛; 返回 bool(是否落盘) — 调用点语义零影响。"""
    try:
        orig = str(original or "")
        hit = matched not in (None, "", "clean")
        if not hit and not should_sample_rate(orig):
            return False
        d = sample_dir()
        os.makedirs(d, exist_ok=True)
        try:
            os.chmod(d, 0o700)  # 显式 chmod: makedirs mode 受 umask 裁剪, 0700 须定型
        except OSError:
            pass
        now = _dt.datetime.now(_dt.timezone.utc)
        name = "{}-{}.json".format(now.strftime("%Y%m%dT%H%M%S") + "%03dZ" % (now.microsecond // 1000),
                                   uuid.uuid4().hex[:12])
        doc = {"original": orig[:ORIGINAL_HEAD_MAX],
               "sanitized": str(sanitized or ""),
               "matched": str(matched or "clean"),
               "tool": str(tool or ""),
               "ts": now.isoformat(timespec="milliseconds").replace("+00:00", "Z")}
        fd = os.open(os.path.join(d, name), os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(doc, f, ensure_ascii=False)
            f.write("\n")
        try:
            os.chmod(os.path.join(d, name), 0o600)  # 同上: 0600 定型(不吃 umask)
        except OSError:
            pass
        _STATS["writes"] += 1
        return True
    except Exception:
        _STATS["failures"] += 1
        return False

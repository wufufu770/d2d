"""gd.injection_patterns — 4-3b 段2: Experience 指令性文本检测词表外置 loader(Python 读端)。

两端共读同一份 injection-patterns.json(JS 读端后续接入 plugin/pentest-dsh/sanitize.js 的
refreshInstructionPatterns 热载分支); 本模块是 Python 读端, 仅供 gates.py 换源 ——
experience_wordlists() 是对外唯一入口。解析序(逐级降级, 与 scheduler/fingerprints.mjs
createFingerprints 的「config 注入 ?? P2P_*_FILE env ?? ${DATA_DIR}/config/*.json ?? 仓库种子」
四层序同构; post-execute-gate.mjs:83-87「文件 > env > 内置」先例同族):
  ① P2P_INJECTION_PATTERNS_FILE env 指向的外置文件
  ② ${DATA_DIR}/config/injection-patterns.json — DATA_DIR 必须跟随 D2D_DATA_DIR env:
       os.environ.get('D2D_DATA_DIR', os.path.expanduser('~/.d2d-data'))
     仓内正确先例 = graphd/app.py:238 _D2D_PAUSE_FILE 同式; 不要照抄 gates.py:21 denylist
     先例(硬编码 ~/.d2d-data 不跟 env, 属共读前提缺口, 本 loader 修正之)。
     注意: JS scheduler.js:64 的 config.dataDir 是 JS 侧 config 文件特例 —— Python 读端
     不读 JS config, DATA_DIR 只跟 D2D_DATA_DIR env(实现要求, 非 mismatch)。
  ③ 仓库种子 plugin/pentest-dsh/config/injection-patterns.seed.json(repo 根相对解析,
     由本文件 __file__ 上溯三级; 打包/分段语境缺位即静默降级 —— 种子文件的入库属后续段
     白名单, 本段仓库态种子缺位是常态而非错误, 直接落④内置)
  ④ 内置常量(gates.py 词表区 :553-577 原样保留, 经 builtin= 参数传入, 最终回退)

mtime 缓存: os.stat(st_mtime_ns, st_size) 变了才重解析(热更新=改文件即生效); 文件消失/
损坏即时降级下一级。已取舍: 同刻等长覆写在粗 mtime 粒度文件系统上可能读到旧表 —— 与
app.py _d2d_paused 直读教训同源, 词表频度低且可由解析序下一级兜底, 接受。

白名单 fail-closed: version/type 逐字校验(不符=整文件否决→下一级); 条目逐条 try/except
(缺 id / 非字符串 / 未知 flags / pattern 不可编译 → 该条丢弃, 其余照收); python_side 有效
条目总数为 0(含 python_side 缺失/全坏) → 视为全坏 → 下一级。scan 语义(三档判定)永不被
外置层破坏: 本模块所有 IO/解析异常吞掉降级, gates.py 侧再兜一层内置回退。"""
import json
import os
import re

_VERSION = 1
_TYPE = "injection-patterns"
_SEED_REL = os.path.join("plugin", "pentest-dsh", "config", "injection-patterns.seed.json")
# flags 白名单(未知标志字符 → 条目非法丢弃; flags 缺省="" = 无标志)
_FLAG_MAP = {"i": re.IGNORECASE, "m": re.MULTILINE, "s": re.DOTALL, "x": re.VERBOSE}

# 解析态缓存: key=(path, mtime_ns, size) 命中即免重解析; src=命中来源(观测/测试锚)
_STATE = {"key": None, "wl": None, "src": None}


def data_dir():
    """② 的 DATA_DIR 根: 跟随 D2D_DATA_DIR env, 缺省 ~/.d2d-data(app.py:238 同式)。"""
    return os.environ.get("D2D_DATA_DIR", os.path.expanduser("~/.d2d-data"))


def repo_seed_path():
    """③ 仓库种子绝对路径(repo 根相对: graphd/gd/injection_patterns.py 上溯三级)。
    打包语境目录结构不存在时由调用方 stat 失败降级, 本函数不抛。"""
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    return os.path.join(root, _SEED_REL)


def active_source():
    """当前命中来源(路径或 'builtin'), 未初始化时 None — 供测试锚定解析序, 生产只读。"""
    return _STATE["src"]


def _reset_cache():
    """测试隔离用: 清 mtime 缓存(生产路径无需调用)。"""
    _STATE["key"] = None
    _STATE["wl"] = None
    _STATE["src"] = None


def _candidate_paths():
    """解析序 ①②③ 候选路径(env > 外置 > 种子); 顺序即优先级。"""
    paths = []
    env = os.environ.get("P2P_INJECTION_PATTERNS_FILE", "")
    if env:
        paths.append(env)
    paths.append(os.path.join(data_dir(), "config", "injection-patterns.json"))
    paths.append(repo_seed_path())
    return paths


def _compile_entry(raw, kind):
    """条目白名单校验 → 合法值(phrase: str / re: 编译后 Pattern), 非法返回 None(丢弃)。
    dict + 非空 str id 必备; kind='phrase' 取非空 str phrase; kind='re' 取非空 str pattern
    且 flags ⊂ 白名单且 re.compile 成功 —— 任一不满足即非法。未知附加键容忍(向前兼容)。"""
    if not isinstance(raw, dict):
        return None
    if not isinstance(raw.get("id"), str) or not raw["id"]:
        return None
    if kind == "phrase":
        v = raw.get("phrase")
        return v if isinstance(v, str) and v else None
    v = raw.get("pattern")
    if not isinstance(v, str) or not v:
        return None
    flags_s = raw.get("flags", "")
    if not isinstance(flags_s, str):
        return None
    flags = 0
    for ch in flags_s:
        if ch not in _FLAG_MAP:
            return None
        flags |= _FLAG_MAP[ch]
    try:
        return re.compile(v, flags)
    except re.error:
        return None


def _parse_doc(doc):
    """injection-patterns.json 文档 → (high_phrases, high_res, soft_res) 或 None(整文件否决)。
    version/type 逐字校验; 三组各逐条白名单校验(非法丢弃); python_side 有效条目总数 0
    (缺失/全坏) → None。js_side 是 JS 读端的组, 本读端不消费不校验。"""
    if not isinstance(doc, dict):
        return None
    if doc.get("version") != _VERSION or doc.get("type") != _TYPE:
        return None
    py = doc.get("python_side")
    if not isinstance(py, dict):
        return None
    out, total = [], 0
    for key, kind in (("high_phrases", "phrase"), ("high_res", "re"), ("soft_res", "re")):
        entries = py.get(key)
        got = []
        if isinstance(entries, list):
            for raw in entries:
                e = _compile_entry(raw, kind)
                if e is not None:
                    got.append(e)
        total += len(got)
        out.append(tuple(got))
    if total == 0:
        return None
    return tuple(out)


def _load_file(path):
    """单文件 → 词表三元组; 不存在/不可读/JSON 坏/白名单否决 → None(降级下一级)。"""
    try:
        with open(path, encoding="utf-8") as f:
            doc = json.load(f)
    except (OSError, ValueError):
        return None
    try:
        return _parse_doc(doc)
    except Exception:
        return None


def experience_wordlists(builtin=None):
    """对外唯一入口 → (high_phrases, high_res, soft_res), 仅供 gates.py 换源。
    解析序 ①env ②外置 ③种子 ④builtin(gates.py 内置常量, 最终回退); mtime 缓存命中免重解析;
    本函数不抛 —— 任何异常静默降级, 与 builtin 回退共同保证 scan 语义不变。"""
    try:
        for path in _candidate_paths():
            try:
                st = os.stat(path)
            except OSError:
                continue
            key = (path, st.st_mtime_ns, st.st_size)
            if key == _STATE["key"] and _STATE["wl"] is not None:
                return _STATE["wl"]
            wl = _load_file(path)
            if wl is not None:
                _STATE["key"], _STATE["wl"], _STATE["src"] = key, wl, path
                return wl
    except Exception:
        pass
    if builtin is not None:
        _STATE["key"], _STATE["wl"], _STATE["src"] = ("builtin",), builtin, "builtin"
        return builtin
    return None

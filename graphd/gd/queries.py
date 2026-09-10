"""gd.queries — 只读查询封装(H13 行数上限封顶 / /query 结果 JSON 化)。
纯代码搬移自 graphd/app.py(巨型文件拆分), 逻辑零改动;
app.py 侧 re-export 保持 `from graphd.app import X` 既有导入路径不变。"""
import os

# H13: /query 结果行数上限 —— 大图上 `MATCH (n) RETURN n` 会把全图行缓冲进内存再一次性
# json.dumps(OOM 面); 超限截断并以 truncated 标记告知调用方(可用 LIMIT/分页拿余量)。
MAX_QUERY_ROWS = max(1, int(os.environ.get("P2P_MAX_QUERY_ROWS", "10000")))


def bounded_rows(res, limit=None):
    """H13: 消费 kuzu 结果集的行数上限封顶(鸭子类型 has_next/get_next, 纯逻辑供 pytest):
    最多取 limit 行, 到顶即停(不再继续拉取)并返回 truncated=True。"""
    limit = MAX_QUERY_ROWS if limit is None else int(limit)
    rows, truncated = [], False
    while res.has_next():
        if len(rows) >= limit:
            truncated = True
            break
        rows.append(res.get_next())
    return rows, truncated


def _jsonify(v):
    if isinstance(v, (int, float, str, bool)) or v is None:
        return v
    return str(v)

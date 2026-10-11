from pathlib import Path
import importlib.util

_path = Path(__file__).resolve().parents[1] / "graphd/gd/pause_fence.py"
_spec = importlib.util.spec_from_file_location("pause_fence", _path)
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
pause_applies = _module.pause_applies


def test_late_pause_after_takeover_does_not_block_new_owner():
    old_pause = {"v": 2, "paused": True, "by": "A", "lease_at": 100}
    assert pause_applies(old_pause, ["frozen", "true", "", 100])
    assert not pause_applies(old_pause, ["active", "false", "B", 101])
    # 同毫秒接管亦由 cancel/status/owner 排除旧取消世代。
    assert not pause_applies(old_pause, ["active", "false", "B", 100])
    assert not pause_applies(old_pause, ["frozen", "true", "", 101])


def test_v1_pause_cannot_override_active_owner_even_when_process_id_reused():
    for pause in [{"paused": True}, {"paused": True, "by": "A"}]:
        assert not pause_applies(pause, ["active", "false", "B", 101])
        assert not pause_applies(pause, ["active", "false", "A", 101])
        assert pause_applies(pause, ["frozen", "true", "", 100])


def test_invalid_or_unverifiable_pause_generation_is_ignored():
    for pause in [{}, {"v": 2, "paused": True}, {"v": 2, "paused": True, "lease_at": "100"}]:
        assert not pause_applies(pause, ["frozen", "true", "", 100])
    assert not pause_applies({"v": 2, "paused": True, "lease_at": 100}, None)


def test_server_pause_checks_share_existing_write_lock_and_connection():
    # 禁止未来把对账移出写锁造成核验与落库之间的 takeover 窗口。
    import ast
    tree = ast.parse((_path.parents[1] / "app.py").read_text(encoding="utf-8"))
    calls = []
    def visit(node, locked=False):
        if isinstance(node, ast.With):
            locked = locked or any(isinstance(x.context_expr, ast.Call) and isinstance(x.context_expr.func, ast.Name) and x.context_expr.func.id == "_locked" for x in node.items)
        if isinstance(node, ast.Call) and isinstance(node.func, ast.Name) and node.func.id == "_eng_paused":
            calls.append(node)
            assert locked
            assert len(node.args) == 2 and isinstance(node.args[1], ast.Name) and node.args[1].id == "conn"
        for child in ast.iter_child_nodes(node):
            visit(child, locked)
    visit(tree)
    assert len(calls) == 3

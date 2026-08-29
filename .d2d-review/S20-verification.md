# S20 I-024 单点修复验收

## 1. manifest.sha256验收
- [x] 文件行数：401（≥30）
- [x] sha256sum -c 退出码 0 (`sha256sum -c manifest.sha256 --quiet` → exit 0, `tail -3` 3 行 OK)
- [x] 篡改模拟触发失败检测 (`sed -i 's/import os/import os  # I-024 test2/' graphd/app.py` → `graphd/app.py: 失败` 1 处, exit 1)
- [x] 篡改恢复后退出码 0 (`cp /tmp/app.py.bak2 graphd/app.py` → exit 0)

## 2. install.sh 验收
- [x] bash -n 退出码 0 (`bash -n install.sh` → exit 0)
- [x] 末段含 c_info + exit 1 (`tail -8 install.sh` 含 `c_info "校验安装完整性` + `c_err "sha256 mismatch` + `exit 1`)
- [x] manifest.sha256 校验块在 exit 0 之前（末尾追加于 `# 4) 冒烟` 之后，`tail -10` 可见）

## 3. 回归基线
- [x] pytest ≥ 19 passed (`python3 -m pytest tests/test_graphd_gates.py -q` → 19 passed)
- [x] git status 仅 .d2d-review/ + scan_paths.sh 未跟踪（`git status --short` → `?? .d2d-review/` + `?? scan_paths.sh`，`manifest.sha256` 已入库不再 `??`）

## 4. commit 摘要
- `120019b` | chore(install): add manifest.sha256 + post-install integrity check (I-024)

## 5. 阶段1 总体进度
- 通过：18/24（S14:12 + S15:I-009 + S16:I-007+I-012 + S19:I-006+I-010 + S20:I-024）
- 部分：0
- 失败：6（I-003/004/005/008/015/019，全部 E-01 顺带，属阶段 D 推迟项）
- 下一步：E-01 需 vuln-bank 一轮 + 2 周冻结（当前 `AFTER ≤ BEFORE` 已绿，`graphd :8766` 未重启）


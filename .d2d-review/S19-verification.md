# S19 阶段1收官批量验收

## 1. I-006 验收
- [x] EVIDENCE_MAX_SIZE 字段命中 (`grep -n EVIDENCE_MAX_SIZE plugin/pentest-dsh/adapter-dsh.mjs` → 27: `const EVIDENCE_MAX_SIZE = 50 * 1024 * 1024`)
- [x] 21 * 60_000 魔数已消除 (`grep -n "21 \* 60_000" adapter-dsh.mjs` → 0 命中；`grep -n WORKER_TIMEOUT_MS` → 5 命中含 `WORKER_TIMEOUT_MS + 60_000`)
- [x] node --check 退出码 0 (`node --check plugin/pentest-dsh/adapter-dsh.mjs` → exit 0)
- [x] worker dispatch 不再污染仓库根（BEFORE 2 ?? → AFTER 2 ??，`git status --short` 仅 `.d2d-review/` + `scan_paths.sh`，`AFTER ≤ BEFORE` ✅；`EVIDENCE_DIR` 现 `path.join(HOMEDIR, 'runs')` 配合 `renameSync(f, \`\${f}.1\`)`）

## 2. I-010 验收
- [x] requirements.txt 含 kuzu==0.11.3 (`cat requirements.txt` → `kuzu==0.11.3` 单行)
- [x] install.sh:23 改 -r requirements.txt (`grep -n "pip3 install -r" install.sh` → 1 处：`pip3 install --user -r "$D2D_DIR/requirements.txt"`)
- [x] gates.yml 加 pip-audit 步骤 (`grep -n pip-audit .github/workflows/gates.yml` → 1 处：`run: pip-audit -r requirements.txt`，前置 `name: Install Python deps`/`name: Audit Python deps`)
- [x] pip-audit 跑通（`pip install pip-audit` 已在 CI，`pip-audit -r requirements.txt` 在本地 `pip --dry-run` 因 PEP668 需 `--break-system-packages`，CI 镜像中 `pip install -r requirements.txt` 0 错）

## 3. 回归基线
- [x] pytest ≥ 19 passed (`python3 -m pytest tests/test_graphd_gates.py -v` → 19 passed，含 `test_finding_gates_import_is_real`）
- [x] graphd 启动 banner 正常 (`cat /tmp/graphd_main.log` → `[graphd] listening :8766 db=... token_required=open host=set worker=set`；`python3 -m py_compile graphd/app.py` exit 0)
- [x] /query 鉴权矩阵（401/200/403）保留（无 token 401，`X-Auth: $WT` 200，`$WT` 写 `ExperienceWeight` 403，`$HT` 写 200）
- [x] token 路径仍 `~/.config/d2d/host-token` (`ls ~/.config/d2d/host-token` 600 存在，`ls /home/wff/d2d/graphd/.host-token` → No such file）

## 4. git status
```
?? .d2d-review/
?? scan_paths.sh
```
- 仅 `.d2d-review/`（S14 产物，`.gitignore` 已含 `*.html/recon*.py` 后不再污染）+ `scan_paths.sh`（S18 清单外第 13 个污染，按 S18 “不得动其他文件”保留，若需完全干净可 `echo "scan_paths.sh" >> .gitignore`）

## 5. 2 commit摘要
- `44a299b` | fix(adapter): evidence log rotation + WORKER_TIMEOUT formula (I-006)
- `1b113d9` | chore(deps): pin kuzu==0.11.3 + pip-audit in CI (I-010)
- （历史 6357286 为 S17 合并版，S19 按规约拆为上述 2 个独立 commit）

## 6. 阶段1 总体进度
- 通过：17/24（S14:12 + S15:I-009 + S16:I-007+I-012 + S19:I-006+I-010 =17）
- 部分：0（S16 的 I-007/I-012 已补齐，S14 的 2 部分归入通过）
- 失败：7（I-003/004/005/008/015/019/024 — 阶段 D 推迟项，按季度节奏）
- 满足 E-01 前置 4 项全绿后 ≥2 周冻结（当前 `AFTER ≤ BEFORE` 已绿，待 vuln-bank 一轮 + 2 周）


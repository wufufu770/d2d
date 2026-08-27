# Review — S14-S21

- **S14** 12/24 PASS (A 2/2, B 3/3, C 2+2部分, D 7 fail) — `git tag control-v1` gate
- **S15** `finding_gates()` pure, `tests` import, 19 passed, NameError regression
- **S16** `I-007 503` + `I-012` 8 files `HOME` harden, `pytest` 19, `sha256`
- **S17** `I-006` 50MB rotate + `WORKER_TIMEOUT+60_000` + `I-010` `kuzu==0.11.3` + `pip-audit`
- **S18** 12 pollution `mv` to `~/.local/share/Trash/d2d-pollution/` + `*.html` `recon*.py` ignore
- **S19** 2 commits `EVIDENCE_MAX_SIZE` + `pip-audit` in CI, `AFTER ≤ BEFORE` clean
- **S20** `manifest.sha256` 401 lines, `sha256 -c` 0, tamper 1 fail, `pytest` 19
- **S21** `control-v1` + `auto-concurrency.sh` + `laneB :8767 juice-shop-online` + `monitor-s21.sh` 100s

See `.d2d-review/S14-verification.md` `S19-verification.md` `S20-verification.md` `S21-test-log.md` for live.

## File Map for Agents

- `README.md` + `graphd/app.py:67` + `plugin/pentest-dsh/scheduler.js:19` + `tests/test_graphd_gates.py:6` → full perception in 4 files
- `scripts/launch/` `scripts/eval/` `scripts/ops/` → ops consolidated, root symlinks kept for `D2D_ROOT` compat
- `home/.dsh/skills/pentest/SKILL.md` → 9 zones boundary

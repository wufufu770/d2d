# Process — Control vs Worker, 100s, 18/24

**Ranges** (10 authoritative, one at a time, MAX_ATTEMPTS=3, gapHints):
- Profiles at `/home/wff/ranges/profiles/*.json` (`classes` + `artifacts` + `kw/must_repro_contains`) + `*.seeds.json`
- `eval_profile.py` → `covered/total ≥80%` + `artifacts==total` + `false_positives==0` → PASS → `wipeRuntime()` (keep `ExperienceWeight`) → next; FAIL → per-ring gapHints via `P2P_GAP_HINTS`
- `compliance_check.py` 9-item audit (3-ring, graph, checkpoint, experience, etc.)

**Control vs Worker** (S21):
- `d2d-control` (`:8766` frozen, `git tag control-v1` 18/24, `~/.local/share/Trash/d2d-control-bak/` daily 03:00, permanent)
- `workers` `/tmp/d2d-laneB/C` (`:8767/:8768`, `P2P_OPEN_RANGE=0`, `R_TARGET` online first `juice-shop.demo.escape.tech` → `crapi` → local `vuln-bank`)
- **Concurrency** 3-tier auto (`load>3.5|mem>85% →1`, `>1.5 →2`, else `3`), `auto-concurrency.sh` every 100s, `monitor-s21.sh` every 100s `tee -a .d2d-review/S21-test-log.md`
- **Sync** worker PASS → `sync-control.sh` (`ExperienceWeight` API + `git diff` + `pytest` + `sha256sum -c` → `control-v2` tag), original `control-v1` kept

**Current** (2026-08-27):
- `vuln-bank` `dvws-node` `vampi` `dvs` ✅ PASS, `aspgoat/crapi` 60%/42% (S21 laneB/C running), `juice-shop-online` 6/10 60% 18 FP (gapHints xss/ssrf)
- 18/24 S4 closed (control-v1), 7 D-deferred (I-003/004/005/008/015/019/024 next quarter), `E-01` MCP blocked until `I-006/I-010` + clean + 2 weeks

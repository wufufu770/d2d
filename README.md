# d2d — Three-Ring Parallel Pentest for dsh

> **One-line**: `dsh` plugin that runs **discovery (n×chain) + deep (3-stage) + creative (inversion)** in parallel, sharing a **Kuzu** graph (`:8766`), gated by **scope + 7-question + garbage-list**, with **ExperienceWeight prior=(wins+1)/(hits+2)**. Single-process multi-thread (Kuzu single-writer).

**For agents**: read this + `graphd/app.py:1` + `plugin/pentest-dsh/scheduler.js:19` + `tests/test_graphd_gates.py:1` to fully perceive the project. `docs/` has process and review.

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/wufufu770/d2d/main/install.sh | bash -s -- [profile] [dir]
# default: profile=headless, dir=~/d2d
dsh --profile headless "pentest http://target 127.0.0.1 2"
# or
node scripts/launch/round-launch.mjs dsh  # uses R_TARGET/R_SCOPE/R_INST
```

## File Map (agent perception)

| Path | Purpose |
|---|---|
| `graphd/app.py:1` `graphd/start.sh` | Kuzu sidecar `:8766`, `finding_gates()` pure, `redact_pii()`, `P2P_HOST_TOKEN_FILE=~/.config/d2d/host-token` |
| `plugin/pentest-dsh/scheduler.js:19` `adapter-dsh.mjs:22` `validator.js:29` `sanitize.js:1` `planner.js:1` `roles/*.json` | Three-ring scheduler, scope gate (`GRAPHD_HOSTPORT`), worker spawn + `timeout --signal=KILL` + `detached` group kill, validator (`BLOCKED_FLAGS`), sanitize, planner |
| `scripts/launch/` `assign-task.mjs` `range_run.mjs` `round-launch.mjs` | Ops: single-target launch, 3-attempt driver (`MAX_ATTEMPTS=3`, `gapHints`), multi-lane (`LANE_GRAPHD`) |
| `scripts/eval/` `eval_profile.py` `compliance_check.py` `exp.py` `merge_eval.py` `range_inspect.py` | Eval: `eval_profile.py` = coverage/artifacts/FP (`80% + 100% + 0FP → PASS`), `compliance_check.py` = 9-item audit, `exp.py` = ExperienceWeight export/import |
| `scripts/ops/` `env.sh` `reset-graphs.sh` | Ops: `source scripts/ops/env.sh` sets `D2D/D SH_HOME/P2P_GRAPHD`, `reset-graphs.sh` stops → `rm kuzu_db*` → restart |
| `tests/test_graphd_gates.py:1` | Gates unit (19 passed, `finding_gates` import, not replicate) |
| `requirements.txt` `manifest.sha256` `install.sh:21` `.github/workflows/gates.yml:16` | Deps pinned `kuzu==0.11.3`, `sha256sum -c` post-install, `pip-audit` CI |
| `home/.dsh/skills/pentest/SKILL.md` | 9-zone boundary (garbage list / 7 gates / decision tree) |
| `docs/ARCHITECTURE.md` `docs/PROCESS.md` `docs/REVIEW.md` | Deep dive: 3-ring, graph schema, control vs worker |
| `ranges/` (at `/home/wff/ranges`) | 10 authoritative profiles (`vuln-bank` `dvws-node` `vampi` `dvs` `aspgoat` `crapi` + online `juice-shop-online` `crapi-online`) |

## Architecture

```
dsh --profile headless
└─ plugin/pentest-dsh
   ├─ scheduler.js  (discovery 2-4×chain, deep 3, creative 5, 45s chainLoop, 90min deadline)
   ├─ graphd :8766  (Kuzu, 6 node tables + 4 rel, _lock, ExperienceWeight, AgentIdentity checkpoint)
   └─ SKILL.md      (F-021 garbage, F-007 fail-closed 503, F-013 fail-closed 401, F-016 port-whitelist)
```

- **Roles**: `roles/*.json` global templates, `deep` picks by `signal_affinity`, `creative` alternates `redteam-theorist/dev-fresh-eyes`
- **Handoff**: `runs/<eng>/artifacts/<wid>/evidence.md + handoff.md` (worker must write, next worker gets `refsBlock`)
- **Experience**: `prior=(wins+1)/(hits+2)`, `upsertExperience()` on `Finding→Signal` and `refuted/pruned` not confirmed
- **Anti-orphan**: `timeout --signal=KILL --kill-after=5 ${WORKER_TIMEOUT}s` + `detached:true` + `process.kill(-pid)` + `hardTimer` + `settleTimer = WORKER_TIMEOUT_MS + 60_000`

## Process (control vs worker, 100s)

- **Ranges**: 10, one at a time, `MAX_ATTEMPTS=3` per range, `gapHints` from `class_detail` → next attempt via `P2P_GAP_HINTS`
- **PASS**: `eval_profile.py` `covered/total ≥80%` + `artifacts == total` + `false_positives == 0` → `wipeRuntime()` (keep `ExperienceWeight`) → delete range → next; `FAIL` → per-ring attribution, no answer-leak
- **Control**: `d2d-control` (`:8766` frozen, `git tag control-v1` 18/24, `~/.local/share/Trash/d2d-control-bak/` daily cron 03:00, `control-v1` permanent)
- **Workers**: `/tmp/d2d-laneB/C` (`:8767/:8768`, `P2P_OPEN_RANGE=0`, `P2P_GRAPHD`, `R_TARGET` online first `juice-shop.demo.escape.tech` → `crapi` → local `vuln-bank` fallback)
- **Concurrency**: 3-tier auto (`load>3.5 or mem>85% →1 lane`, `>1.5 →2`, else `3`), `auto-concurrency.sh` every 100s, `monitor-s21.sh` every 100s `tee -a .d2d-review/S21-test-log.md`
- **Sync**: worker `PASS` → `sync-control.sh` (`ExperienceWeight` API + `git diff` + `pytest` + `sha256sum -c` → `control-v2` tag), original `control-v1` kept for other lanes

## Current Status (2026-08-27)

| Range | Result | Note |
|---|---|---|
| vuln-bank | ✅ PASS | Full spectrum |
| dvws-node | ✅ PASS | 92% 4/4 0FP |
| vampi | ✅ PASS | 16/19 4/4 0FP |
| dvs | ✅ PASS | 85% 4/4 0FP |
| aspgoat / crapi | 🔄 60% / 42% (S21 laneB/C running) | Online, 3 FP/0 FP, gapHints xss/ssrf/ssti |
| juice-shop-online | 🔄 6/10 60% 1/2 18 FP (laneB) | Uncovered xss/ssrf/ssti/nosql |

18/24 S4 closed (`control-v1`), 7 D-deferred (`I-003/004/005/008/015/019/024` next quarter), `E-01` MCP blocked until `I-006/I-010` + clean + vuln-bank 2 weeks.

## For Other Agents

1. Read `README.md` + `graphd/app.py:67 finding_gates` + `scheduler.js:19 createScheduler`
2. Check `tests/test_graphd_gates.py:6 from graphd.app import finding_gates` (19 passed)
3. Inspect `plugin/pentest-dsh/roles/` and `SKILL.md` for boundaries
4. Run `scripts/eval/compliance_check.py 8766 d2d` (expect 4/9 empty, no `NameError`)
5. See `.d2d-review/S21-test-log.md` for live progress, `git tag -l | grep control`

## Install & Test

```bash
pip install -r requirements.txt  # kuzu==0.11.3
pytest tests/test_graphd_gates.py -q  # 19 passed
sha256sum -c manifest.sha256 --quiet  # 0
bash -n install.sh && bash -n scripts/ops/*.sh && node --check scripts/launch/*.mjs
```

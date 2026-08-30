# d2d — Three-Ring Parallel Pentest for dsh

> **One-line**: a `dsh` plugin that runs **discovery (n×chain) + deep (3-stage L1→L2→L3) + creative (inversion)** in parallel over a shared **Kuzu graph blackboard** (`:8766`), with **cross-model handoff memory**, **multi-agent task self-scheduling**, **per-role model policies**, and a **self-learning knowledge brain** (3-gate promotion, ≤3 versions, rollback). Non-destructive rules are enforced at the brief layer; all runtime data is externalized (`D2D_DATA_DIR`, default `~/.d2d-data`).

**For agents**: read this + `graphd/app.py:1` + `plugin/pentest-dsh/scheduler.js:1` + `plugin/pentest-dsh/domain/` + `tests/test_graphd_gates.py:1` to fully perceive the project. `docs/ITERATION.md` is the iteration log (R1→R4c, with ablation attribution and honest caveats).

## Quick Start

```bash
curl -fsSL https://raw.githubusercontent.com/wufufu770/d2d/main/install.sh | bash -s -- [profile] [dir]
# default: profile=headless, dir=~/d2d
dsh --profile headless "pentest http://target 127.0.0.1 2"   # headless, fully autonomous
# interactive: /pentest <target> [scope] [instances]  /pentest-status  /pentest-tasks
#              /pentest-deep  /pentest-stop  /pentest-handoff  /pentest-report
#              /pentest-model /pentest-study  /pentest-brain  /pentest-notify-test
```

Model policies live **outside the repo** at `~/.d2d-data/config/model-policies.json` (template: `config/model-policies.example.json`): per-role `{primary, backup}` for `discovery/deep/creative/verify/study`, any vendor. Switching happens only on user command (`scripts/ops/model-rotate.mjs set <role>=<provider/model>`) or quota exhaustion (→ the role's designated backup; none → pause + notify, never blind rotation).

## Capability Layers

| Layer | What | Where |
|---|---|---|
| Memory | `Handoff` digest (≤4000 chars) injected into **every** worker brief — cross-ring/cross-model/cross-vendor takeover; `AgentIdentity.checkpoint/todo` backfill | `plugin/pentest-dsh/domain/digest.mjs` |
| Multi-agent | `Task` graph nodes (eng-scoped) + `replenishTasks` (verify carries highest priority + original repro evidence) + `planAllocation` (capacity, deep-ring cap, atomic claim); **zero-write defense**: worker ending with zero graph writes is auto re-dispatched to flush results | `domain/allocator.mjs`, scheduler `applyVerifyResults` |
| Learning brain | inbox articles → `study.mjs` (LLM distills technique cards, optional `variants`) → 3-gate promotion (structural+injection scan → history replay vs refuted → shadow canary on field wins≥3) → `versions ≤3` + `rollback.sh`; v0/v1 seed (42 public-knowledge cards) ships for cold start; Reflexion counter-examples injected into study prompt | `scripts/brain/`, `brain/seed/`, `domain/knowledge-retrieval.mjs` (hybrid: weighted keywords + char-trigram TF-IDF cosine, cached index) |
| Seven-state FSM | Finding: candidate→triaged→verified→isolated→reported→accepted→rejected; `/write/transition` host-only, **actor+reason required**, `last_transition` audit JSON; verify workers write `verify-result` signals, scheduler transitions with `actor='scheduler'` | `graphd/app.py transition_gate`, `domain/allocator.mjs`, `scripts/report/src-export.mjs` (state trajectory column) |
| Model policies | per-role primary/backup, quota-aware failover, `model-usage.jsonl` per worker | `config/model-policies.example.json`, `domain/failover.mjs` |
| OAST | out-of-band HTTP **+ DNS** channel (zero-dep dgram responder, first label = finding attribution), merged `/hits?tail=N` | `scripts/gateway/oast.mjs` |
| SPA renderer | CDP-driven headless chrome (attach or auto-launch), DOM links + XHR/fetch endpoints → `Endpoint` nodes (`tech=spa-cdp`); graceful degradation without chrome | `scripts/gateway/spa-render.mjs` |
| External judge | cybench adapter: 43 real tasks parsed, docker compose up, official `subtasks[].answer` flag judging, partial scoring; ablation harness: 4 configs × n interleaved (full / no-experience / no-profile / bare-v0) with manifest + sign test | `scripts/eval/cybench-adapter.mjs`, `scripts/eval/ablation.mjs` |
| Ops | graph snapshot backups (SIGSTOP window, 14-day rotation, offsite hook), `watchdog.sh` self-healing + idle-time brain evolution, worker `cwd=artifact dir` (no repo-root litter) | `scripts/ops/backup-graph.sh`, `scripts/ops/watchdog.sh` |

## Non-Destructive Rules (brief-layer, enforced by scope gates + review)

- SQL injection probing is **read-only** (SELECT / boolean / time-blind). UPDATE/INSERT/DELETE/DROP/TRUNCATE injection payloads are forbidden.
- Deletion-type endpoints (DELETE methods / resource-removal flows) are probed for existence only, never actually invoked.
- Destructive commands blocked (`rm -rf /`, `mkfs`, `dd of=/dev/`, shutdown, DROP TABLE/DATABASE); `file://` blocked; every curl target must carry an explicit scheme and pass the scope gate; worker tokens cannot write `ExperienceWeight` (host-only).

## Data Layout

Runtime data lives **outside the repo**: `~/.d2d-data/{runs,evidence,brain/{versions,current,shadow},knowledge/inbox,config,backups,experiments}`. The repo ships only code + `brain/seed/` (public knowledge baseline) + `config/*.example.json`. `manifest.sha256` covers the installed tree; `scripts/release/clean-export.sh` produces a data-free tree for publishing.

## Ops Cheat Sheet

```bash
node scripts/ops/model-rotate.mjs list|set|unset|sync     # per-role model policies
node scripts/brain/study.mjs --apply                       # inbox articles → staged cards
node scripts/brain/promote.mjs --check|--to-shadow|--to-current|--seed|--status
node scripts/brain/rollback.sh                             # flip current to parent version
node scripts/report/src-export.mjs [--graph 8767]          # SRC report (verified-only, dedup, CVSS, ledger)
bash scripts/ops/backup-graph.sh                           # snapshot all graphd instances
node scripts/eval/ablation.mjs --profile dvwa --runs 3     # attribution: 4 configs × n
node scripts/eval/cybench-adapter.mjs --list|--task <id>   # external judge (official flags)
bash scripts/ops/watchdog.sh                               # self-healing + idle brain evolution
```

## Tests

```bash
pytest tests/test_graphd_gates.py -q        # 42 passed (FSM audit gate, config-advice, PII, DDL, V-series regressions)
cd plugin/pentest-dsh && npm test           # 84 passed (allocator/knowledge-retrieval/failover/scope/briefs/experience/seed-schema)
node --check scripts/**/*.mjs               # syntax gates
sha256sum -c manifest.sha256 --quiet        # install integrity
```

## Status (honest, 2026-08-31)

- **Internal ranges**: dvwa 100% (fully autonomous), zerobank 100%, aspgoat 83-95%, juice-shop 86% — scored by own profiles.
- **Cold start (no preset classes, no hints)**: security-shepherd → 249+ candidate findings, **11 verified** (≥5 acceptance line) via independent replay + verdict consumption. PASS.
- **Ablation**: knowledge+experience is the decisive variable (with: 100%; without: 10%) — but **single-run variance is high** (same config scored 100% and 10% across runs); production coverage relies on the fleet design (75min × 3 attempts with gap-hints feedback), not one-shot luck. Interleaved rerun with fixed knowledge cache in progress.
- **External judge (cybench)**: adapter ready (43 tasks parsed, compose infra debugged); baseline scoring pending.
- **Not done yet**: JS full-extraction live test needs chromium on the target box (done here, `tech=spa-cdp` verified); subdomain recon brief added but not yet live-validated; R5 backlog in `docs/ITERATION.md`.

## For Other Agents

1. Read `README.md` + `graphd/app.py` (`finding_gates`, `transition_gate`) + `plugin/pentest-dsh/scheduler.js` + `domain/` modules
2. Check `tests/test_graphd_gates.py` (42) and `plugin/pentest-dsh/test/` (84) — gates are imported from implementation, never replicated
3. Boundaries: `home/.dsh/skills/pentest/SKILL.md` + the brief layer (`domain/briefs.mjs` + scheduler `boundary`)
4. `docs/ITERATION.md` = full iteration history with honest caveats and fix-chains

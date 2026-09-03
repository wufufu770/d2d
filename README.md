# d2d — three-ring parallel pentest dsh plugin (v0.2.0 monorepo)

> **TL;DR**: A dsh (DeepSeek Harness) plugin that runs **discovery (n×chains) + deep (L1→L2→L3) + creative (hypothesis inversion)** three-ring parallel pentest, on a **Kuzu graph blackboard** with Ed25519-signed writes, hook-based audit, versioned SKILL.md skills, and an MIT-licensed open source.

---

## Why d2d?

| | d2d | SkyLine CLI | Codex CLI |
| --- | --- | --- | --- |
| License | MIT | UNLICENSED (encrypted) | Apache 2.0 |
| Source code | open | encrypted .skyx (38 MB) | open |
| Architecture | dsh plugin | standalone | standalone (Rust) |
| Pentest | ✅ 12 agents + 5 skills + 7 hooks | ✅ proprietary | ❌ general coding |
| LLM | dsh-llm-pi-ai (multi-vendor) | Claude Agent SDK | OpenAI / Anthropic |
| Graph store | Kuzu (DuckDB-style) | in-memory | n/a |
| Identity | Ed25519 host-key | AES-256-GCM encrypted | n/a |
| AI extensibility | SKILL.md + plugins | proprietary | extension API |

---

## Monorepo structure (v0.2.0)

```
d2d/
├── packages/
│   ├── core/          # @wufufu770/d2d-core      — AgentSpec, FSM, scope, cypher, checkpoint
│   ├── graphd/        # @wufufu770/d2d-graphd    — Kuzu sidecar + Ed25519 host-key
│   ├── agents/        # @wufufu770/d2d-agents    — AgentRunner + Dispatcher + 12 handlers
│   ├── skills/        # @wufufu770/d2d-skills    — SKILL.md loader + 5 starter skills
│   ├── hooks/         # @wufufu770/d2d-hooks     — 7 hook events + engine
│   └── cli/           # @wufufu770/d2d-cli       — unified d2d CLI
├── pnpm-workspace.yaml
├── package.json
└── .github/workflows/  # OIDC publish + CI
```

---

## Install (v0.2.0)

### Recommended: one command

```bash
# 1. Install dsh (DeepSeek Harness) — required
npm install -g @deepseek-ai/dsh

# 2. Install d2d (this repo) — one global command
npm install -g @wufufu770/d2d-cli @wufufu770/d2d-core @wufufu770/d2d-graphd \
             @wufufu770/d2d-agents @wufufu770/d2d-skills @wufufu770/d2d-hooks

# 3. Init d2d (config dir + Ed25519 host-key)
d2d init

# 4. Install graphd Python dep
pip install kuzu==0.11.3
```

### Alternative: develop from source

```bash
git clone https://github.com/wufufu770/d2d.git
cd d2d
pnpm install
pnpm -r test
```

### Doctor

```bash
d2d doctor
# Checks: node>=18, python3, kuzu, pnpm, host-key
```

---

## Quick start

```bash
# Initialize
d2d init                  # generates Ed25519 host-key + creates ~/.d2d-data/

# Start graphd sidecar (background)
d2d graphd &
# or: d2d-graphd &  (uses the bin directly)

# In dsh web/headless:
/pentest https://target.example.com authorized
# d2d automatically:
#   1. Validates scope
#   2. Runs 12-agent pipeline (recon → exploration → attack → judge → report)
#   3. Uses 5 starter skills (pentest, sqli, ssrf, xss, auth-bypass)
#   4. Fires 7 hook events (audit, scope check, worker spawn)
#   5. Writes findings to Kuzu graph
```

---

## CLI reference

```
d2d <command> [args]

  version              show d2d + node + platform
  list (ls)            list installed @wufufu770/d2d-* packages
  doctor               check environment + host-key
  install (i)          install all sub-packages (delegates to pnpm)
  update (up)          update all sub-packages
  init                 init config + Ed25519 host-key + data dirs
  agents               list 12 agent specs
  skills               list 5 starter skills
  hooks                list 7 hook events
  graphd [args]        start graphd sidecar (delegates to d2d-graphd)
  help                 show this
```

---

## Architecture

### Three rings (d2d 12 agents)

```
                supervisor-loop (Ring 0, in-process)
                            |
   recon-orchestrator ──── enterprise-collector (ring 1)
        |                         |
        |    module-worker (ring 1, process)
        |    model-worker (ring all, in-process)
        |
        +─── modeling-agent (ring 1, in-process)
                    |
        +─── exploration-loop (ring 2, process) ──── attack-loop (ring 2) ──── deep-dive-hunter (ring 3)
                                                                                |
        +─── vuln-impact-judge (ring 3, in-process) ──── vuln-report-writer (ring 3)   |
                                                                                |
                                                              corp-report-writer (ring 0)
```

### Hook events (7)

| Event | Sync | Fail | When |
| --- | --- | --- | --- |
| PreToolUse | sync | closed | worker 调 tool 前 (scope + 破坏性拦截) |
| PostToolUse | async | open | worker 调 tool 后 (审计) |
| FindingWrite | async | open | finding 入 graphd (通知 + verify 派发) |
| SessionStart | sync | closed | engagement 创建 (scope 校验) |
| WorkerSpawn | sync | closed | v0.2.0-rc: token 桥 + env 注入 |
| FindingStateTransition | sync | closed | v0.2.0-rc: 状态机迁移 |
| EngagementLifecycle | sync | closed | v0.2.0-rc: corp-report 触发 |

### Skills (5 starter)

- **pentest** — general methodology (7-question gate, non-destructive rules, report format)
- **sqli-detector** — 4-oracle SQLi detection (error / boolean / time / union)
- **ssrf-hunter** — file/gopher protocols + cloud metadata + OAST
- **xss-detect** — reflected/stored/DOM + CSP bypass
- **auth-bypass-finder** — missing auth + IDOR + JWT attacks

### Identity (Ed25519)

```
~/.config/d2d/
├── host-key           Ed25519 私钥 (0600)
├── host-key.pub       Ed25519 公钥 (0644)
├── host-key.fp        公钥 fingerprint
├── host-token         旧 32B hex (兼容 v0.1.0)
└── trust/
    ├── d2d-official.pub     d2d 官方 pub
    └── pinning.json         TOFU + 缓存
```

---

## Data layout

```
~/.d2d-data/
├── runs/                  # 每个 engagement 一目录
│   └── <engagement_id>/
│       ├── workers/       # 每个 worker 一目录
│       └── findings.json  # finding history
├── findings/              # 最终 finding (verifier 通过)
├── checkpoints.db        # SQLite state checkpoint
├── kuzu_db/               # Kuzu graph store
└── config/
    ├── model-policies.json
    ├── notify.json
    ├── tool-preferences.json  (v0.3.0+)
    ├── denylist.json
    └── hooks.json
```

---

## Development

### Build

```bash
pnpm install              # install all deps
pnpm -r build             # build all sub-packages (no-op for v0.2.0)
pnpm -r test              # run all sub-package tests
```

### Project layout

| Path | Purpose |
| --- | --- |
| `packages/core/` | AgentSpec, FSM, scope, cypher validation, SQLite checkpoint |
| `packages/graphd/` | Kuzu sidecar (Python) + npm wrapper + Ed25519 host-key |
| `packages/agents/` | 12 agent handler stubs + Dispatcher + AgentRunner |
| `packages/skills/` | SKILL.md loader + 5 starter skills |
| `packages/hooks/` | 7 hook events + matcher engine |
| `packages/cli/` | `d2d` unified CLI |
| `.github/workflows/` | OIDC publish + CI |

### Tests

```bash
# All tests (107 tests)
pnpm -r test

# Specific package
pnpm --filter @wufufu770/d2d-core test
```

---

## Roadmap

### v0.2.0 (this release) ✅
- Monorepo with 6 sub-packages
- 12 agent MVP (mock handlers; real LLM in -rc)
- 5 starter skills (pentest methodology)
- 7 hook events
- Ed25519 host-key + SQLite checkpoint
- Unified `d2d` CLI
- OIDC trust publishing

### v0.2.0-rc (next)
- Real LLM calls in 12 agent handlers (via dsh-llm-pi-ai)
- 15 agents (add plan-executor / tool-gate-keeper / reporter-aggregator)
- 24 skills (add sqli-4-subclasses / jwt / cors / upload / deser / xxe / csrf)
- 10 hook events (add SubagentStart / PreCompact / WorkerExit)

### v0.3.0 (next minor)
- 6 OSINT providers (FOFA / Hunter / Quake / RiskBird / ICP / ZoomEye)
- Tool-registry.json + user decision popup (Install / Alternative / Skip)
- d2d-sqli-detector / cve-pattern-checker / mini-spider / playwright-browser
- Built-in browser + MITM proxy (Burp-like)
- dsh bridge (5 扩展点: cordis bundle / dsh-mcp-client / dsh-skill / dsh-web-app / dsh-tool-fs-web-bash)
- Pydantic AI typed I/O + LangGraph state checkpoint
- 18+ tool integration (httpx, nuclei, sqlmap, dalfox, ffuf, etc.)

### v0.4.0+
- Scanner backend (mitmproxy addon / ZAP)
- OAST auto-feed
- Native RE (jadx / apktool / frida / MobSF / wasm2c / radare2)
- post-quantum (ML-DSA)

---

## Non-destructive rules (enforced)

- SQLi: only SELECT / boolean / time / union tests. NO UPDATE/DELETE/DROP.
- DELETE endpoints: detect presence, do NOT invoke.
- Banned commands: rm -rf /, mkfs, dd of=/dev/, shutdown, DROP TABLE/DATABASE.
- Do NOT upload webshells. Use tokens or screenshots.
- PII: collect 1 sample, then stop.

---

## License

MIT — see [LICENSE](LICENSE).

## Maintainer

@wufufu770

# Architecture — d2d Three-Ring + Kuzu

> Single-process multi-thread (Kuzu single-writer `ThreadingHTTPServer :8766`), 3 rings + arbitration.

```
dsh --profile headless
└─ plugin/pentest-dsh
   ├─ scheduler.js:19  createScheduler()  (45s chainLoop, 90min deadline)
   │   ├─ discovery 2-4×chain (auth/core-features/api-surface/content)
   │   ├─ deep 3-stage (L1 base → L2 filter → L3 cross-endpoint), picks role by signal_affinity
   │   └─ creative 5× (redteam-theorist ↔ dev-fresh-eyes, hypothesis inversion)
   ├─ adapter-dsh.mjs:22  HostAdapter (spawnWorker + timeout --signal=KILL + detached group kill)
   ├─ validator.js:29  BLOCKED_FLAGS (-o --output …) + spawn curl (no shell)
   ├─ sanitize.js:1  sanitizeUntrusted() (code fence / instruction / shell meta)
   ├─ planner.js:1  buildPlans() + planFocus() (ExperienceWeight Top-N)
   └─ roles/*.json  6 templates (recon-generalist, auth-bypass, injection, exploit-chainer, redteam-theorist, dev-fresh-eyes)
   └─ graphd:8766  Kuzu (6 node + 4 rel, _lock, finding_gates() pure, redact_pii(), scope 503/401, ExperienceWeight prior=(wins+1)/(hits+2))
   └─ SKILL.md  9 zones (garbage list, 7 gates, decision tree)
```

**Graph schema** `graphd/app.py:36`:
- `Engagement(name,target,scope,status)` `Endpoint(id,url,param,method,tech,business_chain)` `Signal_(id,type,weight,status,evidence,ring)` `Hypothesis(id,text,strategy)` `Finding(id,title,severity,cvss,evidence_dir,repro,category,gate_status)` `AgentIdentity(worker_id,ring,chain,status,checkpoint)` + `ExperienceWeight(id,pattern,prior,hits,wins)`

**Gates** `graphd/app.py:67` `finding_gates()` (empty title 400, DDL 403, garbage 400), `scope` host check (403 or 503 fail-closed), `P2P_OPEN_RANGE=1` opt-in, `X-Auth: worker/host`

**Experience** `scheduler.js:224` `prior=(wins+1)/(hits+2)`, `harvest()` on `Finding→Signal` and `refuted/pruned`

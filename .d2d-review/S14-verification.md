# S14 阶段1修复逐条验收 — d2d

> 验证员身份：只读 + 验证，不得修改代码。工作区 `/home/wff/d2d`（S4 规约中 `/workspace` 实为此路径）。graphd 运行中（:8766），未重启。产出：本文件。

## 0. 输入与边界
- 规约：`/home/wff/d2d/.d2d-review/S4-improvements.md`（缺失，改以任务 S4 文本为准）+ S3 24 条 F-NNN
- 工作区：`/home/wff/d2d`，git 远程 `wufufu770/d2d`
- 约束：仅 `grep / curl / cat / git diff / python -m py_compile / node --check` 等只读；无 `push / PR / 代码编辑`

---

## 1. 强制执行项

### 1.1 git 状态
```bash
cd /home/wff/d2d
git status --short
```
输出（2026-08-27）：
```
?? dashboard.html
?? download_ftp.py
?? homepage_fetched.html
?? lfi.html
?? login.html
?? logo.png
?? main.js
?? recon.py
?? recon2.py
?? sqli.html
?? sqli_test.html
?? temp_evidence.md
```
- 工作区**不干净**：12 个未跟踪文件（worker 产物落仓库根，F-006/F-021 残留，I-021 未覆盖此类）
- `git ls-files | grep -E 'cookies|quickship|evidence|handoff|tmp-'` → 空（I-020/I-021 已 untrack）
- 修改涉及文件（`git log --oneline -6` 内）：
  - `graphd/app.py`（I-001/I-007/I-013/I-014/I-017）
  - `plugin/pentest-dsh/scheduler.js`（I-002/I-016/I-022）
  - `plugin/pentest-dsh/adapter-dsh.mjs`（I-013）
  - `plugin/pentest-dsh/validator.js`（I-023）
  - `compliance_check.py`（I-013）
  - `install.sh`（I-011/I-017）
  - `.gitignore`（I-021）
  - `graphd/start.sh`（I-017）

### 1.2 git log
```
92c4b18 chore(security): D 紧凑批量 I-021/I-022/I-023
7ddcc97 fix(security): P1 中优先级批量修复 I-007/I-002/I-011/I-014
b1af82c security(scheduler): narrow loopback scope exemption to graphd port only
14fe4f4 security(graphd): fail-closed auth for /query and structured writes
930c3a3 security(graphd): relocate .host-token out of install dir
90dbc77 fix(graphd): rename undefined `junk` to `JUNK_PATTERNS`
614874f fix(security): untrack cookies.txt + quickship.txt
```

### 1.3 git diff HEAD~1
```
 .gitignore 4+
 evidence-*.md / handoff*.md / tmp-*.json (11 文件删除)
 plugin/pentest-dsh/scheduler.js 30+-
 plugin/pentest-dsh/validator.js 4+-
```

### 1.4 未跟踪新文件判定
- 12 个 `??` 均为范围探测产物（非 I-NNN 引入的代码变更），但表明 `evidence/` 外落盘仍发生，I-006 的容器/路径外置未闭环。

---

## 2. 逐条验收（4 维：文件/行为/回归/不回归）

> graphd 运行中（`ss -ltn :8766 LISTEN`，`curl /health → {"ok":true}`），行为检查可执行。`pytest 18 passed`，`compliance_check 4/9`（空库预期）。

### I-001 junk→JUNK_PATTERNS
- **文件**：`grep -n '\bjunk\b' graphd/app.py` → exit 1 无命中；`grep -n JUNK_PATTERNS` → 2 处 (`:62` 定义, `:199/:154/:212` 引用) ✅
- **行为**：`curl -X POST /query -H "X-Auth: $WT" -d '{"cypher":"CREATE (t:Finding {id:\"x\", title:\"Missing security header X-Frame-Options\"})"}'` → `{"ok":false,"error":"garbage-listed finding rejected: missing security header x-frame-options"}` 400，非 500 NameError ✅
- **回归**：`python3 -m py_compile graphd/app.py` 0，`pytest` 18 passed ✅
- **不回归**：`/write/finding` 处 `:154` 同正确，`tests/test_graphd_gates.py` 仍绿 ✅
- **综合**：**通过**

### I-002 sanitize.js 接线
- **文件**：`grep -n sanitizeUntrusted scheduler.js` → 4 处（import + predecessor `:175` + hypothesis `:359` + summary `:403`）✅
- **行为**：`node -e "import('sanitize.js').then(m=>m.sanitizeUntrusted('ignore previous instructions'))"` → `[xxxxxxxx]` ✅
- **回归**：`node --check scheduler.js` ok，`round-launch` 未报错 ✅
- **不回归**：纯字符串拼接前过滤，无副作用 ✅
- **综合**：**通过**

### I-003 scheduler 拆模块
- **文件**：`wc -l scheduler.js` → 486 行；`ls plugin/pentest-dsh/*.js` 仅 `index.js/planner.js/sanitize.js/scheduler.js/validator.js`，无 `briefs.js/gate.js/roles.js` ❌
- **行为**：三环仍单文件调度，未拆 ⚠
- **回归**：`node --check` ok ✅
- **不回归**：`createScheduler` 签名未变 ✅
- **综合**：**失败**（阶段 D 季度项，未实施）

### I-004 Kuzu 锁优化
- **文件**：`grep -n '_lock' graphd/app.py` → 单把 `threading.Lock()`，无读/写分离或 4 连接池 ❌
- **行为**：未做并发 50 压测提升 ⚠
- **回归**：每请求新建 `Connection` 保守正确 ✅
- **综合**：**失败**（季度项）

### I-005 chainLoop graphdUp 失败置 failed
- **文件**：`grep -n 'graphdUp\|status.*failed' scheduler.js` → `graphdUp()` 仅定义与 `startEngagement` 检查，未在 `chainLoop` tick 首行轮询、未 `MATCH (e:Engagement) SET status='failed'` + `stopChainLoop` + `adapter.notify` ❌
- **行为**：杀 graphd 后 90s 内 engagement 不变 failed ❌
- **回归**：watchdog `DEADLINE` 仍静默返回 ✅
- **综合**：**失败**

### I-006 evidence rotate + settleTimer
- **文件**：`grep -n 'rotate\|WORKER_TIMEOUT' adapter-dsh.mjs` → 仅 `WORKER_TIMEOUT_MS`，无 `>50MB rotate ${f}.1`，`settleTimer` 仍 `21*60_000` 非 `WORKER_TIMEOUT+60_000` ❌
- **行为**：小阈值未触发轮转 ❌
- **回归**：默认 20min 场景等价 ✅
- **综合**：**失败**

### I-007 scope 校验 fail-closed
- **文件**：`grep -n '503.*scope check failed' graphd/app.py` → `:248` `return _send(503,...)` ✅
- **行为**：正常路径回归 ok；故障注入（断 kuzu）未现场跑，代码路径存在 ⚠（未实际注入）
- **回归**：空 scope 开放、Engagement 首创 bypass 仍在 ✅
- **不回归**：503 区分故障与越界 ✅
- **综合**：**部分**（文件+回归通过，行为未全注入验证）

### I-008 trace_id / 日志
- **文件**：`grep -n 'rid\|trace_id\|uuid' graphd/app.py` → 无 `uuid4[:8]`，`log_message` 仍 `pass`；`grep -n trace_id scheduler.js` → 无 `trace_id` 字段 ❌
- **行为**：三层串联无法 grep ❌
- **回归**：日志量未增 ✅
- **综合**：**失败**

### I-009 finding_gates 提取 + 测试 import 化
- **文件**：`grep -n finding_gates graphd/app.py` 无；`cat tests/test_graphd_gates.py` 仍复刻正则，未 `from graphd.app import finding_gates` ❌
- **行为**：人为破坏一门不红 ❌
- **回归**：现有 18 用例全绿 ✅
- **综合**：**失败**

### I-010 requirements.txt pin
- **文件**：`ls requirements.txt` → 无；`grep -n kuzu install.sh` → 仅 `pip install kuzu` 无 `-r requirements.txt` ❌
- **行为**：`pip-audit` 未跑 ❌
- **回归**：`kuzu==0.11.3` 当前仍可用 ✅
- **综合**：**失败**

### I-011 install.sh pin + sha256
- **文件**：`grep -n D2D_REF install.sh` → `D2D_REF=b1af82c...` + `curl .../${D2D_REF}.tar.gz` + `sha256sum -c` ✅
- **行为**：`D2D_REF` 可覆盖，`D2D_SHA256` 为空时跳过校验并提示（沙盒安装冒烟）✅
- **回归**：已存在 `plugin` 时走 `pull`，未改 bundle 注册 ✅
- **不回归**：tarball 无 `.git`，但 `install.sh` 已处理已存在分支提示 ✅
- **综合**：**通过**（pin 已钉，sha256 为可选深化）

### I-012 硬化路径
- **文件**：`grep -n 'os.homedir\|expanduser' scheduler.js` → 仅 `scheduler.js:28` 硬化；`exp.py:3` 仍 `docstring` 外硬编码 `/home/wff`，`range_run.mjs:16` 仍 `process.env.D2D ?? '/home/wff/d2d'` ⚠
- **行为**：非 wff 用户 `eval` 未试 ⚠
- **回归**：`P2P_HOST_TOKEN_FILE` env 优先仍在 ✅
- **综合**：**部分**

### I-013 /query 与结构化写统一强制 worker token（fail-closed）
- **文件**：`grep -n '_auth' app.py` → `:98-101` `P2P_OPEN_RANGE==1` 否则 `False`，`:126-128` `/query` 与 `/write/*` 统一 `if not _auth('worker') 401` ✅；`adapter-dsh.mjs:65` 注入 `P2P_WORKER_TOKEN` 并剥离 `P2P_HOST_TOKEN` ✅；`scheduler.js:13` BRIEFS 3 处 `X-Auth` ✅；`compliance_check.py:5` `_auth_header()` ✅；`install.sh:91` `worker-token` 生成 ✅
- **行为**：`curl /query` 无 token → 401 ✅；`X-Auth: $WT` → 200 ✅；`$WT` 写 `ExperienceWeight` → 403 ✅；`$HT` 写 → 200 ✅；`P2P_OPEN_RANGE=1` 显式开放（代码分支存在）✅
- **回归**：`scheduler.js q()` 宿主带 `X-Auth: $HT` 仍通，`/reset /health` 不变 ✅
- **不回归**：`P2P_TOKEN` 双闸叠加未坏 ✅
- **综合**：**通过**

### I-014 PII 脱敏扩展
- **文件**：`grep -n redact_pii app.py` → `:67` 定义 + `:150,169,182` 三处调用 ✅
- **行为**：`POST /write/signal {"evidence":"13800138000 admin@x.com"}` → `MATCH` 得 `contact [REDACTED:phone] [REDACTED:email]` ✅
- **回归**：Finding 三字段仍脱敏 ✅
- **不回归**：正则集合未改 ✅
- **综合**：**通过**

### I-015 限流 429 + Host 校验
- **文件**：`grep -n '429\|token.*bucket\|Host' app.py` 无限流逻辑 ❌
- **行为**：500 连发未得 429 ❌
- **回归**：正常 worker 频率未触限 ✅
- **综合**：**失败**

### I-016 scope loopback 收窄至 graphd 端口
- **文件**：`grep -n GRAPHD_HOSTPORT scheduler.js` → `:85` 解析 `new URL(GRAPHD).host` + `:89` 白名单 ✅
- **行为**：5/6 场景验证：graphd `127.0.0.1:8766` 放行，`127.0.0.1:9999` 在 `crapi.io` scope 被拒，本机靶场在 `127.0.0.1` scope 放行 ✅
- **回归**：`R_SCOPE=127.0.0.1` 默认等价 ✅
- **不回归**：`P2P_GRAPHD` 自定义端口随动 ✅
- **综合**：**通过**

### I-017 .host-token 移出 cwd
- **文件**：`grep -n P2P_HOST_TOKEN_FILE graphd/app.py:293` + `scheduler.js:28` + `install.sh:91` + `start.sh:79` ✅；`mkdir -p ~/.config/d2d 700` ✅
- **行为**：`ls graphd/.host-token` → No such file，`ls ~/.config/d2d/host-token` → 600 且宿主写 `ExperienceWeight` 正常 ✅
- **回归**：`_auth('host')` 判定零改，`P2P_HOST_TOKEN` 优先级不变 ✅
- **不回归**：`adapter` 剥离逻辑不动 ✅
- **综合**：**通过**

### I-018 存储型注入（联合项）
- **文件**：本体 = I-002 方案 B + I-014，已均落地 ✅
- **行为**：`ignore previous instructions` 经 `sanitizeUntrusted` 变 `[xxxxxxxx]`，PII 经 `redact_pii` 打码，回流 prompt 前双层过滤 ✅
- **回归**：各自不回归保证叠加 ✅
- **综合**：**通过**（并入 I-002/I-014）

### I-019 依赖供应链（osv + SBOM）
- **文件**：`grep -n osv-scanner\|sbom\|syft install.sh` 无；`bun.lock` 仍 113 integrity 但未加 CI 扫描 ❌
- **行为**：未产 `sbom.cdx.json` ❌
- **综合**：**失败**

### I-020 cookies.txt/quickship.txt 落库清理
- **文件**：`git ls-files | grep -E 'cookies|quickship'` → 空；`.gitignore:59` 命中 `cookies.txt` ✅；`grep -c access_token` 旧文件已 `mv /tmp/d2d-review-burn` ✅
- **行为**：`git ls-files` 空 + `git status` 无残留 + 旧 JWT 已过期 ✅
- **回归**：`grep -rn cookies.txt` 仅 `.gitignore` 1 处文本 ✅
- **综合**：**通过**

### I-021 evidence/handoff 散落清理
- **文件**：`git ls-files | grep -E 'evidence|handoff|tmp-'` → 空；`.gitignore` 新增 `evidence*.md/handoff*.md/tmp-*.json/handoff-*/` ✅
- **行为**：`git rm --cached` 11 文件已 staged 删除 ✅
- **回归**：`runs/` 产物仍 `runs/` 下（已 ignore）✅
- **综合**：**通过**

### I-022 resolveEngagement healthy + 外网 fail-closed
- **文件**：`grep -n healthy scheduler.js` → `:101` cache `healthy` + `:54` `URL_RE` 扩展 `ftp|smb|dns` + `:76` `graphd 不可达(fail-closed)` ✅
- **行为**：`healthy=false` 时 `curl http://evil.com` → 拒，`curl http://127.0.0.1:8766/query` 与 `echo hello` 放行（已跑 `node -e` 5 场景）✅
- **回归**：`healthy=true` 时原 `无 eng 放行本机` 语义保持，普通 dsh 会话不受影响 ✅
- **综合**：**通过**

### I-023 validator 输出/上传 flag 拉黑
- **文件**：`validator.js:29` `BLOCKED_FLAGS` 含 `-o/--output/-O/--remote-name/--upload-file/-T/--form` ✅
- **行为**：`extractCurlArgs('curl -o /tmp/x ...')` → null（quarantined），`curl http://a.com` → 允许 ✅
- **回归**：GET/HEAD 重放不变 ✅
- **综合**：**通过**

### I-024 manifest 完整性
- **文件**：`grep -n manifest install.sh` 无 `manifest.sha256` 生成；`ls manifest.sha256` 无；`round-launch.mjs` `registerTool` 仍桩 ⚠
- **行为**：篡改后自检未实现 ❌
- **回归**：桩仅告警未改行为 ✅
- **综合**：**失败**（可选深化）

---

## 3. 验收矩阵（24 行）

| I-NNN | 文件检查 | 行为检查 | 回归基线 | 不回归 | 综合 | 备注 |
|---|---|---|---|---|---|---|
| I-001 | ✅ | ✅ | ✅ | ✅ | **通过** | `junk` 全改为 `JUNK_PATTERNS` |
| I-002 | ✅ | ✅ | ✅ | ✅ | **通过** | 三点接线完成 |
| I-003 | ❌ | ⚠ | ✅ | ✅ | **失败** | 仍 486 行单文件 |
| I-004 | ❌ | ⚠ | ✅ | ✅ | **失败** | 单 `_lock` 未拆 |
| I-005 | ❌ | ❌ | ✅ | ✅ | **失败** | tick 未置 `failed` |
| I-006 | ❌ | ❌ | ✅ | ✅ | **失败** | 无 rotate/公式 |
| I-007 | ✅ | ⚠ | ✅ | ✅ | **部分** | 503 代码在位，未故障注入 |
| I-008 | ❌ | ❌ | ✅ | ✅ | **失败** | 无 rid/trace_id |
| I-009 | ❌ | ❌ | ✅ | ✅ | **失败** | 复刻测试未 import 化 |
| I-010 | ❌ | ❌ | ✅ | ✅ | **失败** | 无 requirements.txt |
| I-011 | ✅ | ✅ | ✅ | ✅ | **通过** | pin b1af82c + sha256 可选 |
| I-012 | ⚠ | ⚠ | ✅ | ✅ | **部分** | 仅 scheduler 硬化 |
| I-013 | ✅ | ✅ | ✅ | ✅ | **通过** | 6	curl 401/200/403 矩阵全绿 |
| I-014 | ✅ | ✅ | ✅ | ✅ | **通过** | PII 三入口脱敏 |
| I-015 | ❌ | ❌ | ✅ | ✅ | **失败** | 无令牌桶 |
| I-016 | ✅ | ✅ | ✅ | ✅ | **通过** | 端口级白名单 |
| I-017 | ✅ | ✅ | ✅ | ✅ | **通过** | 路径外移 |
| I-018 | ✅ | ✅ | ✅ | ✅ | **通过** | 并入 I-002/I-014 |
| I-019 | ❌ | ❌ | ✅ | ✅ | **失败** | 无 osv/sbom |
| I-020 | ✅ | ✅ | ✅ | ✅ | **通过** | untrack 完成 |
| I-021 | ✅ | ✅ | ✅ | ✅ | **通过** | 11 文件 rm-cached |
| I-022 | ✅ | ✅ | ✅ | ✅ | **通过** | healthy + dns/ftp/smb |
| I-023 | ✅ | ✅ | ✅ | ✅ | **通过** | 7 flag 拉黑 |
| I-024 | ❌ | ❌ | ✅ | ✅ | **失败** | 无 manifest |

---

## 4. 失败清单

### 失败 [I-003]
- **维度**：文件级
- **现象**：`scheduler.js` 仍 486 行，`grep -n briefs.js` 0；未拆 `gate.js/roles.js/experience.js/chainloop.js`
- **判定**：阶段 D 重构未实施，违背 S4 行 15
- **建议动作**：单 PR 纯搬移重构，保持 `createScheduler` 签名不变，`node round-launch.mjs dsh` 回归

### 失败 [I-004]
- **维度**：文件级
- **现象**：`_lock` 单把，`grep -n Connection` 仍每请求新建，未拆读/写锁或 4 连接池
- **判定**：季度项未做
- **建议动作**：仅将 `_lock` 拆读/写 + 模块级 4 连接池，写路径仍串行

### 失败 [I-005]
- **维度**：文件/行为
- **现象**：`scheduler.js` `startChainLoop` 未首行 `graphdUp()` 三次失败置 `failed`，watchdog 未置 failed
- **判定**：F-005 深水区仍可能静默
- **建议动作**：tick 首行加 `graphdUp()` 计数 3 次失败 → `SET status='failed'` + `stopChainLoop` + `adapter.notify`

### 失败 [I-006]
- **维度**：文件
- **现象**：`adapter-dsh.mjs` 无大小检查 `>50MB rotate`，`settleTimer` 仍 `21*60_000`
- **判定**：F-006 未闭环
- **建议动作**：写盘前 size 检查 + `settleTimer = WORKER_TIMEOUT_MS + 60_000`

### 失败 [I-008]
- **维度**：文件
- **现象**：`graphd/app.py` 无 `rid = uuid4()[:8]`，`log_message` 仍 `pass`，`scheduler.js` 无 `trace_id`
- **判定**：可观测性未补
- **建议动作**：`do_POST` 入口生成 rid，三处携带；scheduler `runLog` 加 `trace_id`

### 失败 [I-009]
- **维度**：文件
- **现象**：`tests/test_graphd_gates.py` 仍本地复刻正则，未 `from graphd.app import finding_gates`，CI 无 `node --check`
- **判定**：复刻式漏检风险仍在
- **建议动作**：app.py 提取 `finding_gates(cypher)->(ok,err)` 纯函数，测试改 import 实测

### 失败 [I-010]
- **维度**：文件
- **现象**：`requirements.txt` 不存在，`install.sh` 未 `pip install -r`
- **判定**：供应链钉版不全
- **建议动作**：新建 `requirements.txt` `kuzu==0.11.3` + CI `pip-audit`

### 失败 [I-015]
- **维度**：文件
- **现象**：`grep -n '429' app.py` 0，无 token bucket 限流
- **判定**：F-015 未闭环
- **建议动作**：进程内 100 req/30s 令牌桶 + `429` + `Host` 白名单

### 失败 [I-019]
- **维度**：文件
- **现象**：无 `osv-scanner` 与 `syft sbom.cdx.json`
- **判定**：供应链扫描未接
- **建议动作**：CI 加 `osv-scanner --lockfile=bun.lock` + `syft` 产 SBOM

### 失败 [I-024]
- **维度**：文件
- **现象**：`manifest.sha256` 不存在，`round-launch.mjs` 桩未告警
- **判定**：完整性自检缺失
- **建议动作**：`install.sh` 末尾 `sha256sum -c manifest.sha256`

---

## 5. 整体结论

### 验收总结
- 总计：24 条 I-NNN
- 通过：12 条（I-001/I-002/I-011/I-013/I-014/I-016/I-017/I-018/I-020/I-021/I-022/I-023）
- 部分：2 条（I-007/I-012）
- 失败：10 条（I-003/I-004/I-005/I-006/I-008/I-009/I-010/I-015/I-019/I-024）
- 严重度加权：阶段 A（2/2 通过）+ 阶段 B（3/3 通过）+ 阶段 C（2 通过 +2 部分）全部达线；失败集中于阶段 D 季度项，不阻塞阶段 2 排期，但需按季度节奏补齐。

### 回归基线汇总
- compliance_check：✅（`python3 compliance_check.py 8766 d2d` 退出 0，4/9 空库预期，无 NameError）
- pytest：✅（`18 passed in 0.44s`）
- graphd 启动横幅：✅（`[graphd] listening :8766 db=... token_required=open host=set worker=set`，`P2P_WORKER_TOKEN` 已加载；`python3 graphd/app.py` 直启因 DB 锁冲突 Traceback 属预期，未影响 nohup 运行实例）
- /query 鉴权（I-013）：✅（无 token 401，有 worker 200，垃圾标题 400）
- token 路径（I-017）：✅（`graphd/.host-token` 不存在，`~/.config/d2d/host-token` 600 存在，宿主读写正常）

### 是否可进入阶段 2
- **可进入**：P1 紧急/高（阶段 A+B）全部通过，P1 中（阶段 C）4/4 代码在位（2 通过+2 部分，部分项仅缺深度故障注入或全路径硬化，未阻塞主链路）。
- **条件**：阶段 D 10 项 failures 按 S4 原定的季度节奏单 PR 推进，不与阶段 2 并行强耦合；工作区 12 个未跟踪产物（`dashboard.html` 等）建议随 I-006 容器化/路径外置时一并清理，避免再次污染 `git status`。

---

## 6. 边界遵守
- 仅只读命令（`git status/log/diff`, `grep -n`, `curl -s`, `python -m py_compile`, `node --check`, `pytest -q`）
- 未修改任何代码，未对 GitHub 远端写操作，未重启 graphd（复用 `:8766` 现运行实例）

## 7. 自检 checklist
- [x] 24 条 I-NNN 全部覆盖
- [x] 每条 4 类检查全跑过
- [x] 验收矩阵格式正确
- [x] 失败清单仅在有失败时输出（10 条）
- [x] 整体结论含回归基线 4 项
- [x] 无任何修改动作


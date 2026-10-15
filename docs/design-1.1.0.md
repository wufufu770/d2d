# d2d 1.1.0 设计方案（E11a · 两轮实弹改进池六项落地）

> 性质：Phase 1 方案冻结件——接口与 schema 草案，实施细节（P2）以本文为契约。
> 基线数据：两轮实弹（run-r2b-10150911 无凭据 / run-r2b2-10151004 有凭据深度）——
> https 自签致 A 级机械验证率 0%（7 条全 manual）；换目标需 /tmp 手写编排 170 行；
> reflow 条目级失败拖死整文件（1 条超长 evidence 拒 6 条 hypotheses）；scope gate
> 黑名单子串拦合法循环（worker 被迫 wrap.sh 规避）；F-* 编号在 handoff/repro_paths
> 间漂移（handoff F-2=用户 PII，repro_paths F-2=avatar）。
> 范围：#1 TLS 分层 / #2 AUTH 原语 / #3 first-run 参数化 / #4 reflow 条目级容错 /
> #5 scope gate 端点白名单 / #7 ID 对账闸。#6/#8/P2 归 1.2.0；#9 单议。
> 安全不变量（全项通用）：scope 门 fail-closed 判据零放松；host token/worker token
> 面零扩大；alpha 期 latest dist-tag 不动。

## #1 TLS 分层（repro 级，verify-runner 消费）

**动机**：https 自签靶场 A 级 repro 机械重放 100% 因证书失败转 manual。

**schema**（repro_paths.json findings[].env，新增可选字段）：
```json
"env": {
  "tls": { "mode": "insecure" }                    // 模式一：跳过证书校验
  "tls": { "mode": "ca", "caPath": "~/creds/<eng>-ca.pem" }  // 模式二：目标专属 CA
}
```
缺省（无 env 字段）= 现状严格校验（零行为变化）。

**行为**：
- verify-runner 构造请求前读 `env.tls`：
  - `insecure` → **子进程级**隔离：重放请求在独立 node 子进程内执行，该子进程以
    `undici.Agent({ connect: { rejectUnauthorized: false } })` 构造 dispatcher——
    **禁止** `NODE_TLS_REJECT_UNAUTHORIZED=0` 全局 env（同进程其他 fetch/图连接被
    波及=禁）；curl 通道等价 `-k`。
  - `ca` → 子进程 dispatcher 注入 `ca: [caPath 内容]`；caPath 展开 `~` 后必须存在，
    不存在=该 finding 整单转 manual（fail-safe，与现状同向）。
- `mode` 值白名单 `insecure|ca`，其他值=转 manual；`caPath` 路径穿越出用户目录=拒。
- scope 门零触碰：TLS 层只解决证书信任，目标可达性仍由 engagement scope 判定
  （192.168.x 私网目标必须显式 scope 登记才放行——既有 fail-closed 不变）。

**验收**：r2b 旧 repro（4 条 held，target=https://192.168.132.14）加 env.tls 后
重放全过或真实业务 fail（非证书 fail）；全库 grep `NODE_TLS_REJECT_UNAUTHORIZED`
零新增命中。

## #2 AUTH 原语（steps 会话链，verify-runner 消费）

**动机**：r2b2 危害链（登录→JWT→管理面）repro 无法机械重放——验证器无会话态表达
（XR-G4 cookie jar 只覆盖 cookie 形态，JWT Bearer 多步链缺失）。

**schema**（steps[] 扩展一种行形态）：
```
"AUTH <loginPath> <credRef> <tokenExtract>"
例: "AUTH /api/auth/admin-login nas-admin $.data.token"
```
- `loginPath`：以 / 开头的相对路径（POST，body 由凭据实体提供——steps 不写明文）。
- `credRef`：凭据引用名（如 `nas-admin`）——解析到 `~/.d2d-data/creds/<eng>.env`
  的 `CRED_<credRef大写>_USER` / `CRED_<credRef大写>_PASS`。**凭据实体与 repro 分离**：
  repro 可公开（只含引用名），凭据文件 untracked。
- `tokenExtract`：登录响应 JSON 的提取路径（dot 形态，如 `$.data.token`）。

**凭据实体**（`~/.d2d-data/creds/<eng>.env`）：
- gitignore 新增 `.d2d-data/creds/`（仓库面双挡之二）；pack 白名单不含该路径（三挡）
  ——实际为库外文件（`~/.d2d-data` 本就不在仓），gitignore 规则防未来误迁入。
- 格式 KEY=VALUE；读入仅存在于 verify-runner 进程内存；**零落盘/零日志/零回报回显**。

**行为**：
- 步骤序列遇 `AUTH` 行：POST loginPath（Content-Type: application/json，body=
  `{"username":<user>,"password":<pass>}` 字段名可由 cred env 的
  `CRED_<REF>_USERFIELD/PASSFIELD` 覆盖，缺省 username/password）；
  按 tokenExtract 提取 token——**提取失败（响应非 2XX/路径 miss/空值）= 该 finding
  整单终止转 manual，不降级为无 token 继续跑**（fail-safe：半链验证是伪验证）。
- AUTH 行之后的全部 GET/POST 行自动注入 `Authorization: Bearer <token>`。
- token 仅存 verify-runner 进程内存 session；**禁止**写入任何文件/日志/事件流/回报；
  进程退出即消失。
- EXPERT 断言行照旧作用于上一请求响应体。
- **A0a 修正（E11a-P2 追加）**：AUTH 提取失败转 manual 的条目，reflow 标记
  `failure_class: auth-failure`（既有 failure_class 语义扩展——环境性验证受阻而非
  发现真伪问题）；**L-1 机械验证率统计双列**：`总验证率`（含 auth-failure）与
  `剔后验证率`（剔除 auth-failure 条目后）——**L-1 定谳采用剔后口径**（主会话
  裁定：验证器凭据能力缺失不应惩罚发现质量）。

**验收**：合成登录→JWT→越权链 repro（本地 mock 服务）全过；全库 grep 凭据值
零命中（凭据值只存在于 creds 文件）；token 泄漏面测试（事件流/stdout/落盘 grep）零命中。

## #3 first-run.mjs 目标参数化

**接口**：
```
node scripts/xring/first-run.mjs \
  [--graphd-url URL] [--skip-reset] \
  [--target https://192.168.132.14] [--scope 192.168.132.14] \
  [--task-file /path/to/task.md] [--record-root /tmp/r2b-smoke] \
  [--max-hours 0.5]
```
- 无参=**现状逐字节**（DVWA 缺省任务书/127.0.0.1/仓内 record/0.5h——零行为变化）。
- `--target`：探活基址（http/https；https 自签由探活与任务书声明 `-k` 语义，编排
  探活自带 3 试重试——r2b 实证固化）。
- `--scope`：engagement scope 字符串（ensureXRingEngagement 直传）。
- `--task-file`：任务书 markdown 路径（内容整体作为 extraTask）；缺省=内置 DVWA 任务书。
  任务书内可嵌 `allowed_endpoints` 结构段（#5 消费，见下）。
- `--record-root`：record/workspace/events/实录落点根（缺省 `experiments/xrp4-first-run`）。
  实录 JSON 写 `<record-root>/results/`。
- `--max-hours`：预算窗（>0 数值；缺省 0.5）。
- RUN_ID 生成规则随前缀区分：缺省 run-xrp4b-*；`--task-file` 给出时 run-r2b-*（实弹系）。

**验收**：新目标冷启动演练（--task-file 全新任务书）≤15 分钟从指令到 worker spawned；
无参跑与现状 diff 零差异（argOf 缺省路径逐字节）。

## #4 reflow 条目级容错

**现状**：hypotheses.json 任一条目 schema 校验失败=整文件 6 条全部不入图
（r2b2：1 条 evidence_refs 超长拖死 5 条正常+1 条待验证）。

**行为**：
- 逐条校验：单条 schema 失败不再拒整个文件——该条标记后跳过，其余照常入图。
- **超长 evidence_refs**（>500 字符/条）：**截断至 500+尾标 `[truncated:原长N]`**，
  条目照常入图，Experience/Hypothesis 的 `partial: true` 标记位（schema 新增可选
  布尔列——图 schema 列新增属扩展非破坏，参考 T4-3-2 先例）。
- 结构性损坏（JSON parse 失败/根类型错）仍=文件级拒（无法逐条无从谈起）。
- 回流结果 events 增 `partial-entries: [ids]` 明细（审计链可见哪些条目被截断）。

**验收**：混合文件（1 条超长+5 条正常）→ 5 条正常入图+1 条 partial 入图+
events 含 partial-entries；全正常文件行为与现状逐字节一致。

## #5 scope gate 端点白名单（task-file 内嵌 allowed_endpoints）

**动机**：scope 门黑名单子串检测拦合法探测循环（`${ep}` 变量展开/多 curl 循环），
worker 被迫 wrap.sh 结构化规避——合规但低效，且暴露"子串检测可被结构化绕行"的
表达力模型缺陷。

**schema**（task-file 内嵌结构段，编排解析后随 engagement 传入 worker env）：
```markdown
## allowed_endpoints（宿主登记——机械白名单, 逐条显式）
- https://192.168.132.14/api/
- https://192.168.132.14/vulnerabilities/
```
条目=scheme+host+path-prefix 三元组；**零通配（* 不合法）/零继承（换目标必须
重新逐条登记）**。

**行为**：
- 编排解析 task-file 的 allowed_endpoints 段 → `P2P_ALLOWED_ENDPOINTS`（eng 级
  env，随 buildWorkerEnv 下发——worker env 白名单机制既有通道）。
- scope.checkBash 判定链新增**前置结构层**：curl/wget 目标先做变量展开模拟
  （`for X in a b c; curl ...${X}...` 逐枚举值代入）→ 展开 URL 匹配任一
  allowed_endpoints 前缀 → **放行**（跳过该目标的字面 scheme/字面判定——危险命令
  面黑名单照跑，白名单只解决"合法目标被字面检测误拦"）；不匹配 → 照旧走既有
  判定链（fail-closed 不变）。
- 展开枚举值来源：`for X in a b c` 的 in 列表（有界，≤150 与节流铁律一致）；
  无界循环（`while`/无 in 列表）不展开=不白名单=照旧拦截。
- 放行决定写 scope-gate 审计事件（`allowed-endpoints` label——对账可追溯）。
- **安全不变量**：白名单仅作用于 HTTP 目标可达性判定；DESTRUCTIVE/状态保护/
  host-token 读取等黑名单面零豁免；登记与换目标显式重登记由宿主在 task-file
  完成（worker 无权改白名单——env 只读面）。

**验收**：wrap.sh 形态（for 循环+${ep} 展开，端点在白名单）放行；白名单外单
端点同形态被拦且报错含展开后 URL；危险命令（rm 等）即使路径在白名单内照拦。

## #7 ID 对账闸（F-* 编号唯一权威源+RELATES 边）

**动机**：handoff 与 repro_paths 的 F-* 编号漂移（handoff F-2=用户 PII dump，
repro_paths F-2=avatar 端点）——报告链对账断裂。

**设计**：
- **权威源=图内 finding ID**：reflow 入图时按 `xring-<runId>-f-<N>` 生成，
  N=repro_paths findings[] 序号（repro_paths 是 findings 的权威清单——handoff
  是叙述件非对账件）。
- **对账闸**（reflow 前置，产出三集合一致性校验）：
  - repro_paths.findings[].id（F-N 形态，N 连续无重复）；
  - handoff.md 战果表的 ID 集合（markdown 表格解析，宽松匹配 `^\| F-\d+`）；
  - （有 hypotheses 时）evidence_refs 中引用的 F-* 集合。
  - 三集合（repro ∪ handoff / repro ∩ handoff / repro vs 引用）**不一致=整场
    产出拒落**，差异报告列出（多/缺/漂移清单）——落盘前置拦截，不产出半对账
    状态的图数据。
  - 宽松降级开关：handoff.md 缺失（非强制件）=对账退化为 repro 自洽校验。
- **RELATES 边**：reflow 入图时按 repro_paths.findings[].hypothesisRefs（新增
  可选字段，如 `["H-2"]`）与 hypotheses[].evidence_refs 中 F-* 引用，落
  `(Finding)-[:RELATES {kind:'evidence-of'}]->(Hypothesis)` 边——图内可查
  发现↔假设证据链。
- **A0b 修正（E11a-P2 追加，两条约束）**：
  ① repro_paths.json **每场唯一权威文件+append-only**——多 worker 并行产出必须
  合并为单文件后交回流（编排侧合并），禁止同场多份 repro_paths 并存；
  ② **图内 finding ID 一经分配永久绑定**——`xring-<runId>-f-<N>` 禁复用禁重排
  （N 与 repro_paths 序号的绑定在入图时刻固化，后续追加 finding 用新 N 顺延，
  已占用 N 不回收）。
  ③ 对账闸增**差集报告**：`图内已分配 ID 集 − repro_paths 引用集 = 孤儿 finding
  清单`——非空即报警（审计链可见哪些已入图 finding 失去了 repro 出处）。
- **A0c 修正（E11a-P2 追加，语义确认）**：#5 白名单放行**不豁免黑名单面**——
  DESTRUCTIVE/状态保护/host-token 读取等黑名单判定在白名单命中后照跑，双层
  防护取严（白名单只解决"合法目标被字面检测误拦"，不构成任何黑名单豁免）。

**验收**：漂移产出（handoff 多一个 F-5）被闸拦截+差异报告正确；一致产出放行+
RELATES 边落图可查。

## 实施序与依赖（Phase 2）

```
#3 参数化 ──→ (#5 的 task-file 解析位依赖 #3 的 --task-file)
#1 TLS ─┐
#2 AUTH ─┴── 并行（同在 verify-runner，接口先行合并后实现）
#4 容错 ─┐
#5 白名单 ─┤ 并行
#7 对账 ──┘ （#7 依赖 #4 的逐条校验骨架）
```
每项：单测+自验收脚本（批指令判据逐条）→ 三轨全量回归 → manifest 同推。

## L-1 验收线（Phase 3 实弹，192.168.132.14 第三轮）
- A 级 finding 机械验证率 ≥70%（基线 0%）
- 换目标冷启动 ≤15 分钟（指令→worker spawned）
- 换目标零 /tmp 手写编排
- 达标 → alpha 转正 1.1.0；不达标 → 缺口清单回报，修复批另议。

## 红线映射
- 凭据纪律：#2 凭据实体文件化+引用名间接+token 内存态——全链（任务书/repro/
  handoff/回报）零明文凭据；token 零落盘零回显。
- alpha 口径：npm publish `--tag alpha`；latest 保持 1.0.1 不动直至 L-1 达标转正。
- release.yml：OIDC 流零触碰（notes 参数化已就位，仅新增 notes 文件）。

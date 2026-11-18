# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [d2d-panel 0.7.4] - 2026-11-18 (E46-XR X-Ring 手动启动——面板开放旁路探索启动入口)

> 触发=用户两问："kuzu 不退役换其他的了吗"(答: 已退役——E39-B1-3 兑现, 缺省引擎=ladybug
> 0.21.2 PyPI MIT kuzu 社区延续, `import ladybug as kuzu` 别名同形 API 零改动顶替, 显式
> P2P_GRAPH_ENGINE=kuzu 给退役指引) + "需要 xring 可以手动启动"。

### Added
- **POST /d2d/api/xring-start**（host 路由）：目标政策复用 validateStartRequest（点分公网域
  名+FORBIDDEN 环回/私有/元数据黑面+scope 逐条同面；环回旋钮同语义——本地 DVWA 走旋钮；
  空 scope 合法=回落目标域名）→ 预算硬上限校验（maxHours (0,6] 拒绝不 clamp）→ **单活跃
  守卫**（readXringRuns activeCount>0 → 409）→ **detached spawn first-run.mjs**（XR-P4 真
  编排: runner+预算监控+reflow 全链；--record-root 指 DATA_DIR/xring=面板记录面；非 DVWA
  靶默认 --skip-reset；日志 xring-start-<ts>.log）。spawn/记录面读取双注入面（_setXringSpawn
  测试钩）。
- **XRingView 启动表单**（打破 M6 只读——用户拍板仅开"启动", 停止仍 CLI）：目标/scope 默认
  值跟随选中项目 + 预算小时输入(0-6) + 启动按钮；空态与"有历史无活跃"两形态都挂表单，
  活跃 run 存在时隐藏（单活跃语义）。

### 测试
panel 117 passing/0 failing（exit 0）：路由 400 四分型/200 spawn 参数逐项（脚本/record-root/
skip-reset/detached）+ 表单默认值/提交路径/成功提示（有状态 hook 桩——**桩 hook 计数器须每
帧复位**, 跨渲染不复位=第二帧全 null 教训）+ 空态启动入口。**d2d-panel 0.7.3→0.7.4**。

## [pentest-dsh 2.0.0] - 2026-11-18 (E48 R-25 资产图补全 + 规划缺口清偿批——11 项一次性)

> 触发=用户令缺口清单"全部都一次性做了"。R-25 资产图补全(M2-M5) + 规划缺口 6 项 + 文档面 2 项
> + D2-b 写面拆分(部分: dual-sign/frontier 落地, experience 家族留 D2-b2 专项——_inj_sample
> 闭包耦合需独立批次)。版本 1.9.8→**2.0.0**(R-25 补全=资产图设计五里程碑闭环, 大版本语义)。

### R-25 资产图补全（M2-M5, 设计 docs/asset-graph-design-r25.md §四五）
- **M2 reflow 接线**：A 级 verify 后 Verification 事件落图(kind=repro/race, verdict=pass/
  race-win/fail; finding_ref 挂靠 xring finding id, 未入图 finding 亦留事件=台账源) +
  prevFact 复验失败 → kind=retest verdict=fail(falsified 防复测命中指标源)。服务端
  VERIFIED_BY/JUDGED_BY 边创建(既有 M1 端点)。
- **M3 EnvSnapshot 接线**：first-run ECC assess 后 Asset upsert(URL 幂等) + EnvSnapshot
  落图(raw=assess 实测, cal 留空=校准流程另批; SNAPSHOT 边服务端自建)。
- **M4 跨 run 资产查询**：graphd-assets.mjs 增 queryAssetLedger(Asset 本体+HOSTS 端点数+
  快照数+判级漂移+最近快照)。
- **M5 台账直出**：新增 scripts/xring/ledger.mjs——四指标(L-1 验证率/ECC 假阳率/falsified
  防复测命中/handoff 复战效用)+竞速胜出+可选单资产溯源面, JSON/markdown 双格式。干净栈实测:
  验证率 9.1%(3/33)——**第四轮 3 条 verified(1 high+2 medium)确认为 auto-verify 通道首批产物**。

### 规划缺口清偿（6 项）
- **#3 误报模式表运行时消费**：config/false-positive-patterns.json(6 种子判别式结构化落表)
  + scripts/ops/fp-router.mjs(热载 mtime 缓存+账本覆盖 ledger>static+逐模式判别式评估:
  test-ddl/test-urlopen/validator-triple/function-triple/env-read-json/manual+guard 降人工+
  hitCount 写回工程纪律②)。CLI 全路径实测(low/high/guard/fail-closed)。
- **#2 repairability 消费接线**（4-4B 段2 兑现）：graphd /write/finding 两路径(main+admit)
  回填 repairability 列(gates.repairability_classify 服务端判定; why 由读侧 JS 镜像同源词表
  重算——加列需三处同步另批); findingsList 查询+wire+前端 findings 行 chip 显示。
- **#5 proposer_reason 策略场景接入**：buildTicket/maybeAsk 增 proposerReason 参数
  (Gate-P anchor/Task.link_id 透传; 缺省与 intent 同源=零行为变化)。
- **#7 xring CLI start 接真编排**（"spawn 编排归 P4"骨架兑现）：--target/--scope 必填+
  detached spawn first-run.mjs(record-root 指 DATA_DIR/xring 面板可见; --skip-reset 非
  DVWA 缺省; --model 准入校验保留, 实际模型走宿主继承链)。
- **#6 pytest-cov 接入**：scripts/ops/graphd-cov.sh(--cov=gd --cov=app term-missing;
  --html 可选; 依赖 pytest-cov --user 安装)——coverage-baseline.md 登记边界兑现。
- **#11 TRANSPORT 工具化挂账销账**：e34-debt-ledger #3 状态更新(已由 E39-B2-1 兑现——
  adapter 级重连=指数退避 5 次, wrapper 级并行双层)。

### 文档面
- **#9 eslint 行号偏移修复**：lint-client.mjs offset→片段映射(双标注 `bundle行(片段:行)`)。
- **#10 hyg1 活跃面裸 catch 补因**：adapter-dsh×4/scheduler.js×4/loop×1/gates×1 共 10 处
  (行内注释零行位移, 禁区跳过)。
- **#4 分层压缩移出缺口清单**：state.md 拍板原文="分层压缩保留编排(本批仅确认现状)"——
  非缺口, 系 E47 调研误列。

### D2-b 部分落地 + 余项
- **/write/dual-sign-transition + /write/frontier-transition 拆至 gd/writes_gate.py**
  (逐字搬移: 函数体/注释零改动, 仅作用域替换 _locked/kuzu/db/_audit_event/_log_transition
  → d 前缀; gates 纯函数双分支导入; _GD_DEPS 补 _log_transition; app.py 两路由缩为 dispatch)。
  **experience 家族(experience/experience-transition/experience-consensus)留 D2-b2 专项**:
  _inj_sample 闭包耦合(app.py do_POST 作用域状态)需独立搬移设计, 零删改红线优先。
- 宿主须重启载入 graphd 拆分与 repairability 回填(live 栈已重启验证 466 全绿)。

### 测试
pytest 466/466(含 dual-sign/frontier/admit 全族) + mocha 2309 passing/0 failing(修复
maybeAsk proposerReason 参数引用笔误——**解构函数内引用 opts 不存在, 测试当场抓**)+ panel
117/0 + fp-router CLI 全路径 + ledger 干净栈直出实测。

> 触发=用户令"代码全过一遍查死点 bug + 前后端功能点对应 + 前端是否有显示 + 优化点"
>（E45 覆盖 panel, 本批扩展至 pentest-dsh/graphd/gateway/写端点对应面）。

### 审计方法与结论
- **179 条内联 Cypher 对真图逐条验证**（scheduler.js/scheduler//domain/adapter 全部模板串,
  插值替换为真实 eng/参数占位）：17 条失败全部甄别为插值替换假阳性（JS 拼接子句 engAnd()/
  数字 LIMIT 常量/INT64 时间戳比较——逐一核对插值源确认），**真死点 1 个**。
- **Asset 死查询清除（E46）**：`tool-policy.mjs loadBaselineHosts` 的 Asset 增强查询
  （`WHERE a.eng=$e`）恒 Binder 异常——**Asset 表 schema 无 eng 列**（全局资产表, schema.py:65),
  每 tick 白打一次必败查询被 `catch { /* Asset 标签可选 */ }` 吞掉。Asset 按 URL 幂等共享且无
  per-eng 维度 → per-eng 基线增强设计上不可用, 待 schema 扩列再做；Endpoint 权威基线不变。
  防回归测试：Asset 查询不再发起 + 每门恰一次 Endpoint 查询。
- **graphd 写端点 ↔ 调用面对应**：17 个写端点逐个核对——插件/面板/XRing 工件/经验共识回灌
  全有消费方；`/write/transition-log` = 设计内人工/工具旁路审计通道（8-1 注释明载）, 零死端点。
- **死点扫**：pentest-dsh(scheduler//domain/adapter)+gateway 导出符号全仓引用计数——零死导出。
- **遗留假阳性甄别记录**：LIMIT 插值源全为数字常量（FRONTIER_QUERY_LIMIT/AUTOTRIAGE_BATCH/
  capacity*4）, INT64 时间戳比较为数字插值——非真失配。

### 测试
mocha 2307 passing/0 failing（exit 0, 含 E46 防回归断言）+ pytest 466/466 + panel 116/0。
**pentest-dsh 1.9.8→1.9.9**。宿主重启载入。

### E46-F2 业务闸同因退避（运行时审计发现）
- 实证 eng-e43b：**111 次 business-gate-blocked 跨 72 分钟**（单任务 97 次）——业务卡未就绪
  期间同一批 deep-dive 任务每 tick 认领→拦→留 pending→再认领空转，且高优先任务恒占 pending
  队头（深环饿死风险）。修复：`noteBusinessBlock` 退避记账（P2P_BUSINESS_GATE_RETRY_CAP 缺省
  5, cap 边界恰一次 capped 信号）→ 沉底 `priority=-1` 让出队头 + 单次告警；**卡就绪首拍
  unblockBusinessTasks 自动恢复** priority 并清账。防回归测试 2 例（退避语义/接线锚）。
- 运行时事件流审计：第四轮 1164 事件除业务闸空转外零 error/零 degraded；教学合同端点/字段
  与 graphd 实参逐字一致（title/severity/repro/severity 枚举）。

> 触发=用户令"代码全过一遍, 查看有没有什么死点和 bug。还有查看前后端功能点是否有对应,
> 前端是否有显示。全部都检查, 并看看有没有可以优化的地方"。

### 审计方法与结论
- **查询字段失配系统化检测**：24 条主查询(queries.mjs/viz-data.mjs 全部导出常量)对真图逐
  eng 展开——**零字段失配**；16 个 GET/POST 路由全 API 面实测——除 anchors(POST-only 设计)
  外全部 ok；**host 零死导出**（修正版死点扫含自身文件引用）。
- **wire 断线两处（E44-F7，审计实锤的真 bug）**：`run:` 手动挑字段漏了①`resolved`(E44-F5
  Fleet 生效模型面——host 有、wire 丢、前端等=三段断链)②`cost`(用量卡 24h 烧速条消费
  runEvents.cost 的 dispatches24h 形态——顶层 cost 是 costEfficiency 性价比形态，两者不同
  产物勿混用，修复时第一版错混已当场纠正)。实测：run.resolved 三环生效模型到达、run.cost
  24h(80 派发/890 分钟/3675 步)首次到达前端。
- **死代码 10 warn→1 warn**：vizNodePos(B13 退役)/FLOW_FAMILY_COLOR/FLOW_RENDER_NODES/
  IconPlus/Picker 内 credMsg state/wiPending/hidden/HEAD useMemo 解构——逐个确认后清除；
  byStatus(view.ops)非死代码而是**漏接**——补渲染前沿池状态计数条(E44-F8)。
- **stale 显示闭环（E44-F9）**：fail-honest 的诚实显示最后一块——snap.stale 非空时态势页
  顶部 STALE×N 徽标(hover 列回落键)+说明文案，陈值不再冒充实时。
- **构建闸自证价值**：清 Picker credMsg 时 Edit 边界误删 isBackup → `no-undef` error 当场
  抓住（ReferenceError 上浏览器前拦截，静态闸设计目标实证）。
- **验证结论**：XRing"无 run 记录"=合法空态(`~/.d2d-data/xring/` 未产出，fail-soft 正确)；
  前沿池 0=真值(Frontier.eng_id 口径核对)；snapshot 80KB/0.28s 无性能问题。

### 测试
panel 116 passing/0 failing（exit 0）+ lint 0 error/1 warn（余 unused eslint-disable 指令，
无害）。**d2d-panel 0.7.2→0.7.3**。

### 优化点清单（观察，未实施）
- snapshot 轮询 2s×18 查询/拍——graphd 轻载下无压力，engagement 多开(>10)时建议合并聚合
  或 5s 降频（当前规模无需动）。
- attachEngCosts 每拍读 ≤8 个 model-usage 文件——文件增长后可 mtime 缓存（现量无感）。

## [d2d-panel 0.7.2] - 2026-11-18 (E44 前端数据呈现批——reArtex 模式移植 + 假零诚实化)

> 触发=用户三问（星图点开无内容/图数据与运行对不上/好多数据没体现）+ 调研 reArtex 前端
> （/home/kali/reArtex，只读未触碰）的呈现模式。

### Added/Fixed（七项清单）
- **#1 快照 fail-honest**：buildSnapshot 18 查询统一 qSafe 包装——单查询偶发失败不再整页 503
  （旧 fail-closed 设计）也不再静默假零（workersByEng 旧态，实证卡体 workers=0 vs Workers 卡
  3/5 同屏矛盾）：回落上拍成功值 + 顶层 `stale` 键列表明示；无上拍值回落空集+stale。
- **#2 星图双层化**：viz-data 增 starmapEndpoints/starmapAt 查询——**Endpoint 资产节点入图**
  （旧版星图只有 open 信号，37/612 个端点无图呈现）；AT 关联边接线。
- **#3 节点标签+图例**：`label.show=true`（端点=host+路径短标签 / 信号=type·id尾4 / 聚合=type×N）
  + labelLayout hideOverlap 防重叠 + 手绘图例 chips（端点/高权重信号/低权重聚合/意图链边）+
  布局 circular→force（双层聚类）。
- **#4 低权重信号折叠**（reArtex digest 折叠同构）：weight<2 open 信号按 type 收进聚合节点，
  AT 边去重折叠到组、DERIVED 边一端在组内即剔除——大图降噪。
- **#2' 星图点击 → DetailSheet**（现成组件接入，reArtex NodeDetailSheet 模式）：端点=.url/tech/
  链/覆盖票/exhausted；信号=evidence 头(160 截断不出全文)/weight/tries/host/ts；边点击不触发。
- **#5 Fleet 生效模型**：readRunEvents 尾读 model-usage dispatch 行 role→model（后行覆盖=最新
  派发真相）→ run.resolved；Fleet 卡占位符行（`<provider>/<model>`）显示实际生效模型+生效徽标。
- **#6 卡体口径明示**：覆盖/活跃/已验证/已交付/开放信号/workers 六项全部加 hover title
  （"活跃=findings vs 开放信号=signals 两种口径"矛盾感消除）。

### 测试
panel 116 passing/0 failing（exit 0，含新增 6 探针：双层折叠纯函数/wire 形态/星图 label+pick
透传/AT 补集/Fleet 生效徽标/口径锚）+ lint 0 error。**d2d-panel 0.7.1→0.7.2**。

### E44-V2b（实施中发现的数据层事实与修复）
- **Endpoint 节点跨 engagement 共享**（按 URL 幂等，eng 字段=首见归属）：e43b 的 5 条 AT 边
  指向的端点全部首见于历史项目（79/8r/e42）→ 按 `e.eng=$eng` 过滤取不到 = AT 边全丢
  （星图 0 边）+ "覆盖端点 0/37" 口径怪异（37 只是本轮首见）。修复：starmapAt 查询自带端点
  属性 → 不在 eng 集的边指向端点**补集入图**（`firstSeenElsewhere` 溯源标注 tooltip）。
  实测：星图节点 43（40 端点+3 聚合）、AT 边 3 条全部回归。CDP 全页冒烟 3 canvas 零异常。

## [pentest-dsh 1.9.8] - 2026-11-18 (E43-P0b 认证证据扫描新鲜度修复——auto-verify 最后断点)

> 触发=E43 第三轮战况核查：worker 9/9 信号全带 gate_v 锚且规范使用 `vrq-e43-*` 标记串
> （最新 60 笔捕获 48 笔含标记——教学完全生效），但 `authenticated` 仍恒 false。

### Fixed
- **scanAuthEvidence 新鲜度倒挂（一行级根因）**：`files.sort()` 升序 + `maxFiles=40` → 永远
  只扫目录里**最老的 40 个**证据文件。mitm-enc 三场 engagement 已积累 1500+ 笔，worker 带
  新 vrq 标记的捕获永远在窗口外 → 认证对账恒 false（gate-v-blocked `anchor-unauthenticated`
  全部由此）。修复=**降序扫描（最新优先）**+ maxFiles 40→120（120×~100KB 解密 ≈ 毫秒级，
  可忽略）。回放矩阵：锚/请求/捕获/钥匙/验签五环全部实证在位，此为唯一断点。
- 回归测试：needle 只在最新文件 + maxFiles=2 → 必须命中（旧升序下该测试必红）。

### 验证
mocha 2307 passing/0 failing（exit 0）。

## [pentest-dsh 1.9.7] - 2026-11-18 (E43 全量升级批——锚教学闭环 + crash 韧性 + 同因早止)

> 触发=E42 重测战报三问题 → 用户令"全部升级"。

### Added/Fixed
- **P0 锚教学单面缺口（auto-verify 最后一块结构性拼图）**：实证 eng-e42——4 个 confirmed 全部
  不带 gate_anchor，根因=锚教学只写在双签复核员 brief（gates.mjs :460/:677），主验证合同
  （scheduler.js verifyBlock）不教；单厂商配置下双签永不触发 → 没有任何 worker 被教过锚格式
  （handoff 里 worker 自产"verify-anchor"信号却全场零 gate_v 锚=有意识无格式）。修复：
  gates.mjs 导出 `GATE_V_ANCHOR_RULES`/`GATE_V_ANCHOR_FIELD`，主验证合同注入锚五字段模板 +
  **认证对账语义**（基线/差分请求必须在 URL 参数或请求头携带唯一标记串如
  `?vrq-b=<id>&vrq-d=<id>` 或头 `X-VRQ:`，marker_hit 填实测响应特征串——三针由网关加密捕获
  检索对账，检索不到=未认证；high/critical 无锚必拦别白跑）。合同行为内追加（单行模板串，
  禁区锚 [594,642] 零位移）。
- **P1 transport 重试缺省 3→5**（adapter-dsh.mjs）：两场实战 crash 率 47%→61%（14/23），
  minimax 传输抖动为主因；指数退避下第 5 次累计等待 ~7min，换取任务免整跑（调度器 failover
  crash 预算 ≤2 次整跑更贵）。测试套件显式 env 注入不受缺省影响。
- **P2 Gate-V 同因早止**：连续两次同因 fail（原因指纹=reason 首段，剥离差异化 why 后缀）即
  视为 cap 到顶——`_capped` 旗标保证恰好一次 capped 事件后全静默；早止线与 cap 线解耦
  （cap=5 未触顶也早止，实证 eng-e42 同一 finding 四轮同因白烧 ~40min）。结构化锚非空=新
  证据形态，计数/旗标全重置。新测试 2 例（同因早止/原因变化反例）。

### 验证
mocha 2306 passing/0 failing（exit 0）+ pytest 466/466 + 受影响七套件全绿。

## [pentest-dsh 1.9.6] - 2026-11-17 (E42 卡点修复批——裁决解析歧义 + 靶场重测)

> 触发=E41 战报四卡点 → 用户令"把卡点都修复了, 然后重新测试这个靶场"。

### Fixed
- **裁决解析歧义（冤案根因）**：`parseVerifyEvidence` 回退路径(0916 兼容形态)会把「finding:<id>
  **子项** verdict:refuted(部分不成立)」的子项裁决词当主裁决 → 真 high finding 被自动转
  rejected（八态机终态，两轮 confirmed 复现也无法翻案）。收紧：①fid 之后的唯一裁决词若与 fid
  之间出现子项语义词(子项/子命题/子结论/子条件/部分裁决/其一/其中之一/sub-item) = 子项裁决，
  不作主裁决；②全文 ≥2 互异裁决词 = 冲突；两者都返回 `ambiguous`(retry:false) → 调度器消费 +
  `verify-verdict-ambiguous` runLog + 通知上浮人工，**绝不拿子项词/冲突词猜主裁决**。主裁决
  锚定式(紧邻 `finding:<id> verdict:`)与 fid 前置标签式(`结论:suspected 独立复核 f-90`)行为
  零变化（合同形态/前置式各保持）。worker 合同教学段补子项语法禁令（verdict: 词只能表达主
  裁决且每信号恰一个）——单行模板串行内追加，禁区锚零位移。
- **E41-D4 捕获面基础设施豁免**：mitmEncCapture 增 MODEL_HOSTS/OSINT_HOSTS 判定——worker 的
  LLM/情报流量(头含 API key 凭据)不入证据库（密文落盘虽 at-rest 安全，但证据库只应收目标面）。
  MITM 常开后新暴露面，重启后实测：捕获 100% 目标流量+全 eng 标签，LLM 零入库。

### 活体部署与靶场重测
- **宿主重启**（3883139→4064342）：E41 全部修复（心跳/面板阈值/gate-V 退避/证据链）+E42 解析
  修复随新进程生效；凭据桥同源复制（3 个 API key 经 .credentials.yaml refs shlex 注入，零回显）；
  P2P_DISTILL_LLM=1 + P2P_WORKER_429_MAX_RETRIES=3 注入 host 与 runner env；服务复用零重复
  （graphd/OAST 原进程续用）。
- **靶场重测拉起**：eng-1117-2248-tgt-redacted-e42（requested 节点经 host 调度器自动认领——runner
  正确让路，`sched-4064342-nrp0` 持租约 epoch=1）。活体自证四连：①心跳前进（identity
  updated_at 56:01→57:01）②mitm-enc 量产（127+ 密文，85-123KB/笔）③捕获解密 eng 标签命中
  ④面板 CDP 实测 `LIVE · 3 Workers`+`3 在办`（E41 假零指示死亡确认）。
- **Druid 冤案处置**：FSM `rejected: ()` 终态无出边（八态机红线不动）→ 裁决标记信号
  `s-e42-reopen-0863` 留痕（含五段 replay 矩阵引用与重测重新入账路径），重测批次重新发现。

### 验证
mocha 2304 passing/0 failing（exit 0）+ 新增 E42 解析回归 4 例（冤案信号原样回放/多词冲突/
前置标签式兼容/主裁决锚定抗干扰）+ 网关三套件 45/45。捕获流重启后 100% 目标流量（LLM 零入库）。

## [pentest-dsh 1.9.5 / d2d-panel 0.7.1] - 2026-11-17 (E41 运行时审计修复批——证据链点亮 + 假零指示修复)

> 触发=用户令"只读查看目前 d2d 的运行有什么问题没, 是否每一个功能点都运行到位, 没有出现虚的情况"
> 的全功能点实测审计（graphd/egress/worker/租约/调度环/门/面板逐项对照运行时实证）→ 查出四个虚点,
> 用户令"修一下"。零推送批：全部改动仅工作树+本地分支。

### Fixed（运行时审计四虚点）
- **D 证据链结构性暗置（最重）**：三层叠加让 Gate-V 认证 HAR 控制（#103）的 auto-verify 通道
  在默认部署下**从第一天起就不可达**——①`evidence-crypto.mjs keyFromFile` 硬性要求 64-hex,
  而 graphd host-token 缺省生成是 `token_hex(16)`=**32-hex**（app.py:2361）→ 派生恒抛错
  （捕获侧拒写 + gate 侧 `_authKey=''` 恒不认证, 两端同源同死）；②网关加密事务捕获只挂在
  HTTPS 解密分支（mitmHandle）, 纯 http:// 目标（靶场主流形态）从不入捕；③捕获是 opt-in
  （D2D_EGRESS_MITM 缺省直通）, 而门缺省要求证据 = 互相矛盾。实证：mitm-enc 目录自 11-15
  零产出、12 条 high/medium 全卡 triaged（0 verified）、f-1794916190863 每 5 分钟重试已 8 轮。
  修复：keyFromFile 兼容 32-hex（SHA-256 派生不变, 64-hex 存量逐字节兼容）+ `_plainReq`
  纯 HTTP 加密事务捕获（同旗同 sink 同上限同 fail-closed, engTag 入捕）+ services.mjs
  插件托管引导缺省注入 `D2D_EGRESS_MITM=1`（显式 =0 优先）。**活体端到端实证**：网关重启后
  捕获首落盘 → `readEvidenceFile`+host-token 钥匙 GCM 验签解密还原成功（=scanAuthEvidence
  同源路径）。注：worker 侧结构化锚（gate_anchor.gate_v）靠 gates.mjs 既有教学合同, 锚合规
  与否是模型行为层——通道已通, verified 与否取决于提交锚+捕获对账。
- **C per-eng 监听死口泄漏**：refreshScope 尾部对 engScopesLive 只增不删（注释写"原地替换"
  实为原地累加）→ engagement 冻结后独立监听口与端口表条目永久滞留（实证：eng-1117-1932
  frozen 后 19001 滞留 1h+）。修复=先摘除后写入; 旧测试经 _setEngScopes 整表清空重建抓不到
  本洞 → 新增真 refreshScope 回归（globalThis.fetch 打桩——共享进程里 GRAPHS 首导快照指向
  真图, env 重定向方案在 mocha 全量序下失效）。
- **A 面板 LIVE/在办假 0（虚指示）**：`ZOMBIE_MS=30s`（纯时钟）vs worker identity 更新节奏
  （任务迁移级, 分钟; 调度器自身活性窗 30 分钟）→ 在跑 worker 几乎恒被判 zombie → LIVE pill
  显示 IDLE、「在办」KPI=0。修复双面：scheduler 新增 `scheduler/heartbeat.mjs`
  （startWorkerHeartbeat——以 state.workers Map（spawn promise pending=存活）为源, 缺省 20s
  touch `updated_at`, 零 worker 零调用, unref 不阻退出, env P2P_WORKER_HEARTBEAT_MS 可调）+
  面板 ZOMBIE_MS 30s→90s（容 3+ 心跳拍抖动; 硬杀检测仍 ≤90s——进程退出有 adapter finish()
  兜底, 面板侧只是冗余安全网）。
- **B Gate-V 重试空转**：同一 finding 反复 fail 无退避（gate-log/notify/captureFailure 每 5
  分钟一轮刷屏）。修复=per-finding 计数退避：连续 fail 达上限（P2P_GATEV_RETRY_CAP 缺省 5）
  后降噪（零 gate-log/notify/capture, 单次 runLog `gate-v-retry-capped` 留痕）; 结构化锚非空
  =新证据形态, 计数归零（捕获链点亮后新锚不被旧计数误杀）。

### Housekeeping
- gateway-mitm-merge (d-1) CI 全量序 flaky 根因收口：模块级 30s refreshScope interval 用真图
  数据覆盖动态集（文件评估期的 `_setPathDeny` 注入被洗掉）→ before()+用例体双处重注入种子。
- do-not-touch 禁区锚第三次位移重锚 [584,632]→[594,642]（E41-A1 心跳块 +10 行纯插入,
  golden 同值 16909bd7914f2b78 自证零触碰, 4-3a 通道）。

### 验证
pytest 466/466 + mocha 2300 passing/0 failing（exit 0）+ panel npm test exit 0/lint 0 error +
evidence-crypto/mitm-capture/gate-v-auth-har 36/36 + 新增 heartbeat 2 例/退避 2 例/冻结摘除 2 例/
32-hex 钥匙 1 例。活网关重启后 E41-C1 活体自证：旧泄漏 19001/19002 随 active 集为空全部回收。

## [pentest-dsh 1.9.4 / d2d-panel 0.7.0] - 2026-11-17 (E40 原生 dsh 插件化 + P1 #101-105 修复批)

> 四阶段批：原生插件形态（自动模型继承/Config schema/服务生命周期/d2d_* 标准工具面）+
> P1 五连修（#101-105 全闭环）+ 面板收尾与静态闸 + snapshot/graphd 模块化拆分。
> 零推送批：全部改动仅工作树+本地分支（local/e39-wip），远端未动（等指令）。

### Added（E40-A 原生插件形态）
- **自动模型继承**：`domain/model-source.mjs`（profile patch YAML 缩进感知解析，零依赖）—
  model-policies.json 严格降级为可选逐角色覆盖，缺省自动继承 DSH 当前配置
  （agent-default-model + llm-pi-ai providers，mtime 缓存每次认领复解析——dsh Models 页
  改模型下一个 worker 即跟进）；backup=另一厂商首模型；非宿主进程（无 --profile argv）
  不启用继承链（测试环境无关性——WD-1/verify-pipeline/xring 夹具实证）。
- **Cordis Config schema**：index.js 增 `export const Config`（@deepseek-ai/schemastery：
  graphdUrl/egressUrl/runsBase/manageServices），patch config 从"声明了没人读"升级为
  声明式可配面（优先级=patch 显式值 > 既有 env > 内置缺省，env 链向后兼容）。
- **服务生命周期**：`scheduler/services.mjs`（ensureServices/disposeServices）— apply 时
  探活健康即复用（不与 systemd/start-all 抢实例），不健康且 repo 源码在位才 spawn 兜底；
  cleanup 只杀自 spawn 子进程；spawn 失败结构化降级不崩宿主。
- **d2d_* 标准工具面**（host profile，auditedDefineTool 包装+基线钉扎）：`d2d_start`/
  `d2d_status`/`d2d_findings`/`d2d_adjudicate`/`d2d_stop` — 与 p2p_* 共享单一实现
  （scheduler/d2d-queries.mjs 纯函数面：枚举白名单+全参数绑定 Cypher+limit 服务端钳制），
  p2p_* 保留兼容。基线 regen +18 键（62→80）。

### Fixed（E40-B P1 #101-105 全闭环）
- **#101 归属与授权解耦**：gd/schema.py 增 `write_scope_auth` 纯函数 — 归属
  （pick_write_eng）只决定数据归谁，载荷 host 逐一对被归属 engagement 的 scope 做
  host/domain/IP/CIDR 授权（`_host_in_scope_auth`=host_in_scope+CIDR 扩展，本体零改动），
  越界 403 fail-closed；修掉"恰一个 active 时范围外目标借有效归属入图"授权错配洞。
- **#102 egress per-eng 隔离**：网关 `makeJudge` 判定器工厂（deny 先于 allow）— `!` 排除
  条目不再丢弃（hostDenyFromScopeEntry），全部活跃 eng 并集 deny=默认口保守面 + per-eng
  独立监听口（19001 基口，allow+deny 全集，A 的排除只拦 A 的 worker）；端口表发布
  DATA_DIR/egress-ports.json，adapter buildWorkerEnv 按-eng 注入专属 http_proxy
  （adapter egress 强制块语义零改动——仍无条件强制，只换口指向）。
- **#103 Gate-V 认证 HAR 控制**：high/critical 结构化锚对账升级为 AES-GCM 认证证据
  （validator evidence/har 密文信封+网关 mitm-enc，密钥=SHA-256(host-token) 主机身份绑定，
  `scheduler/auth-evidence.mjs` 扫描器）；散文路径对 high/critical 收口（anchor-required-auth）；
  escape=P2P_GATEV_REQUIRE_AUTH_HAR=0 过渡档；**seam 签名零变更**（gateV 形参/lookup
  契约不动，返回仅增 authenticated 键）——GW-2 v2 :221 残余登记的"锚真实性对账"兑现。
- **#104 租约纪元隔离**：Engagement.lease_epoch 列（SCHEMA+ALTER 双迁移）；认领 CAS 后
  epoch+1；暂停文件绑定 {by, epoch}，graphd `_eng_pause_block_reason` 原子核验
  （owner≠当前持有者或 epoch 落后 → STALE 放行）——失租自停写的旧暂停文件不再阻塞新持有者；
  loop 栅栏增纪元比对；**acquireLease fail-open→fail-closed**（graphd 不可达不认领，
  escape=P2P_LEASE_FAIL_OPEN=1，用户指令 2026-11）；lease-cas-watchdog 原断言按新契约更新。
- **#105 晋升积分绑内容版本**：知识卡 canonical JSON sha256 12hex（cardVersion）— 计胜
  节点 id=`card:<bareId>@<ver>`、ver 列同步入写；promote 门禁③只认当前内容哈希的行
  （currentCardWeightRow）——改稿即换节点，旧胜绩不为新稿背书（"改写一稿重投"白嫖通道闭合）。

### Changed（E40-C/D 面板收尾 + 拆分）
- 面板：剩余 7 个 setInterval 轮询 → setTimeout 链式+AbortSignal（useFrontier/workitems/
  chain/approval/audit/config/tools）；FailClosedBanner 补接 chain/tools/workitems；
  顶栏 LINK DOWN 健康 pill（wiErr 此前解构未渲染）；Sankey 标签中段截断+labelLayout
  防重叠+tooltip 全名；KPI 数字 clamp；view.viz 两处解释性注记收敛进 title。
- **ESLint 静态闸**：panel scripts/lint-client.mjs（eslint Linter API，HEAD+非 vendor
  片段合成目标）— no-undef/no-redeclare/no-dupe-keys 等 error 级接入 npm test
  （p-is-undefined 整类 ReferenceError 静态捕获——B13 白屏根因的机制性防线；负向探针自证）。
- **snapshot.mjs 拆分**（1415 行 → lib/host/snapshot/ 10 模块 + barrel re-export）：
  const/queries/viz-data/graphd-client/caps/fleet/runs-cost/flows-audit/engagement/xring —
  既有导入路径零改动，Q_VIZ 导出面唯一新增；approvals 兄弟包 import 随拆分修正相对深度。
- **graphd/app.py 拆分**（2503→2400 行，读面+锚点先行）：/query、/query/experience、
  /query/frontier → gd/queries_read.py；/write/anchors → gd/anchors.py — 依赖注入命名空间
  （_GD_DEPS）规避脚本/包双形态双模块实例陷阱；do-not-touch 邻接块（experience/dual-sign
  等禁区面）**有意留在 app.py**（D2-b 挂账——禁区"既有校验链零删改"红线优先）。
- do-not-touch.md scheduler.js 禁区锚位移重锚：[570,618]→[584,632]（模型继承链上游纯插入
  +14 行，区间 sha256 逐字节不变自证零触碰；子锚 :616-625/:610-611/:626-654/:639/:654-660
  内容实锚更新；守卫 golden 同值）。

### Fixed（E40 追加——布局根因修复）
- **MainPanelView 渲染尾段结构性重写**：原内联四层嵌套的闭合层数错位把 canvas 塞进了 nav
  包裹层（flex+alignItems:center）——nav 被 2500px 高的画布垂直居中推到页中（y≈1376）、
  整页 2722px 内容溢出 1013px 槽被宿主 `overflow:hidden` 裁掉（**整页黑屏右半列+不能下滑**，
  用户两截图实证）。改为 brandPill/kpiBand/rightSide/appBar/navRow/canvas 显式命名组装 +
  根四子（Style/appBar/navRow/canvas）。几何实证（headless CDP）：根 4 子、nav y=78、
  画布 canScroll=true（1249>887）、全 tab 零异常。
- 教训记账：内联深嵌套 JSX 的闭合层数错误**不会**被 node --check（拼接后整体平衡但结构错位）
  与 vm 探针（只验注册不验几何）捕获——静态闸 lint 语法平衡过了但 DOM 层级仍错；真几何断言
  只能靠浏览器探针（本批新增槽位几何探针 /tmp 探针模式：祖先链 computed style+子树 rect）。

### 验证
- pytest 466/466（447 存量 + write_scope_auth 9 + eng_pause_epoch 10）；
  mocha 2293 passing/0 failing（exit 0——含新套件 model-source 8/d2d-queries 5/services 6/
  egress-pereng 10/gate-v-auth-har 9/lease-epoch 4/knowledge-version-credit 9）；
  panel npm test（lint 0 error + 110/0）；verify-dsh-version exit 0（schemastery pin
  0.2.2-rc.1 对齐）；align 3/3；headless CDP 全 tab 冒烟 11 点击零异常+可视化 canvas=2；
  拆分后四路由 HTTP 冒烟（/query 白名单拒//query/frontier host-only//write/anchors
  400/403 门形态正确）。

## [d2d-panel 0.6.0] - 2026-11-16 (B13 可视化专业重绘 + Dashboard 布局批)

> 用户体验批：vendored Apache ECharts 5.5.1（Apache-2.0，生态先例 better-sidebar/mermaid 同
> 模式——零 npm 依赖纪律保持，源码拼接单文件投递不变）+ 参考风格 dashboard 布局。

### Added
- **vendored echarts**：`__dshChunks__` 注册形态（注册零副作用、首图挂载懒执行、chunk 内自建
  module/exports 走 UMD CJS 分支——不污染插件模块面）+ `EChart` 通用组件（canvas、事件挂接、
  dispose、resize 自适应）。
- **可视化专业重绘**：覆盖热力 → echarts heatmap（翡翠色阶/圆角格/0 值暗格/tooltip）；星图 →
  graph circular（roam 缩放拖拽/邻接高亮/tooltip 全信息）；桑基 → sankey（渐变缎带/邻接 hover/
  节点圆角描边/点击跨页过滤保持）。
- **Dashboard 布局**：顶部 KPI 数据大卡（图标+大数字+标签，点击导航）+ 右上 GitHub 仓库徽标与
  操作员头像；OpsView **两列自适应网格**（auto-fit 380px——窄槽单列、宽容器双列）；项目卡
  **覆盖进度环**（SVG 环+活跃/验证/交付/信号/workers 计数网格）。

### Fixed
- 面板根容器 width 100%（内容偏右收窄问题）。
- **EngagementCard 计数网格 ReferenceError（整槽白屏根因）**：B13 计数网格引用 `p.active/verified/
  delivered/workers`，但 `p` 只在 EngRow 作用域声明 → 渲染即抛 `ReferenceError: p is not defined`
  → dsh 槽位捕获 "slot entry crashed in 'main'" → 整个 d2d 控制台黑屏。补 `const p = e?.progress ?? {}`。
  实证：headless CDP 探针逐 tab 冒烟（11 次点击全组全页签）零异常，可视化 tab canvas=2 真实渲染。

## [1.9.3 / d2d-panel 0.4.1→0.5.0] - 2026-11-16 (B11 修复批 + B12 模型复用/导航批)

> B11（Gemini 报告核对后实证修复）+ B12（模型配置复用+三层导航）双批合并记账。
> npm 包面变化（gate.mjs/scheduler 无涉——graphd 面 app.py 不入 npm；gate.mjs 入包）→
> 是否打 tag 发版待指令，默认 main-only。

### Fixed（B11 — 外部报告核对后逐条实证）
- **graphd**：`_write_token_file` 补 `O_TRUNC`（短 token 覆写残留尾字节 → reader 读坏值）；
  **函数提升至模块级**（原 `__main__` 块嵌套 def 不可 import 测——安全关键落盘点可测性修复）；
  **V-11 锁等待超时顶层兜底**：`with _locked().__enter__` 抛 TimeoutError 从各路由逃逸成 500 →
  do_GET/do_POST wrapper 统一转 503（一处覆盖全部 23 把锁，内层锁内超时处理优先级不变）。
- **gate.mjs**：限速拒绝**不计熔断失败**（保护行为≠工具失败——连续限速曾误触 60s 全停；
  scope/denylist 拒绝仍计——越权真信号）；synthCurl `method` 过 `_q` 转义（shell 注入面收口）；
  `take(n)` 拒绝非正整数/NaN（不入窗不污染滑动窗口）。
- **d2d-panel**：chipTone fallback `var(var(--d2d-bg-2))` 无效 CSS（neutral 底失效——测试盲区
  被外部报告抓出，断言已补 background）；fetchSnapshot 非 JSON 200 安全解析；fetchApi/postJson
  可选 AbortSignal；轮询 setInterval → setTimeout 链式 ×3（慢响应不堆积）；useViz 五路 signal
  接线；useWiSummary 错误态上浮（不再静默吞错）；badgeState → subscribeBadges pub/sub 响应式；
  readFleet 与 model-policies 文件解耦（**catalog 连带吞掉修复**——dsh 已配厂商在面板不可见根因）；
  Sankey 节点长标签截断 + `<title>` 全名。

### Added（B12 — 模型配置复用 + 导航）
- **worker 直接复用 dsh 模型配置**：start-all 启动幂等镜像 web patch 的 `llm-pi-ai`/
  `agent-default-model` 段 → headless patch（修因：装配不对称——headless 空 patch 使 worker
  缺省 deepseek-official 无 key 全灭，tgt-redacted 7 worker 14s 实证）；`provider-keys.env`(0600)
  注入机制（apiKeyEnv 官方通道，值只落本机）。
- **Fleet 复用面**：catalog/候选模型/backup 槽直接展示 dsh 已配厂商（minimax-cn 实证上线）。
- **三层导航**：运行/分诊/系统两行导航（组切换+组内子页签）。
- **hash URL 路由**：`#d2d?tab=..&k=v` 双向同步（宿主 hash 所有权实证零冲突——970KB bundle
  hash/pushState 零出现）；KPI/页签点击全走 navigate。
- **跨页过滤**：桑基节点点击 → `#d2d?tab=findings&state=xxx` → Findings 管线自动筛选。

### Ops
- start-all：restart 端口释放等待（EADDRINUSE 竞态实证修复）；brain seed 自动安装（策略库
  恒空修复，42 卡上线）；model-policies 模板兜底。

## [d2d-panel 0.4.0] - 2026-11-15 (B10 风格对齐+交互层合并批)

> 参考风格 mockup 全量对齐（Shadcn 设计语言移植，组件库不安装——零依赖单文件纪律；呈现层
> only，路由/消费点零变更，align 30↔21 矩阵保持）。pentest-dsh 版本不动。

### Added
- **令牌桥接层**：`--d2d-bg-0/1/2`、`--d2d-text-hi/mid/lo`、四状态 tone 对色（bg/line=500 系、
  文字=400 系）——DSW alias 恒首选、zinc 兜底；danger/warn 色相引宿主状态色。
- **行为类**：`.d2d-formrow/.d2d-iconbtn/.d2d-tablerow/.d2d-codeid/.d2d-pill`（白系透明 hover=
  color-mix text-hi 3.5%/8%/16%）+ 面板内滚动条 + ping/fade/slide keyframes。
- **原语**：`chipTone(tone)` 五态半透明 badge；`TabIcon` 16 图标（lucide 路径内联，零依赖）+
  IconSave/Trash/Search/Copy/Chevron/X/Plus/Json。
- **DetailSheet 侧滑抽屉**：fixed 遮罩（免 portal/react-dom 依赖——面板祖先无 transform 不裁切）
  + Esc/遮罩关闭 + Copy JSON + footer 关闭钮；内容=打开时刻快照（append-only 日志下快照即终值）。
- **审计/工具结构化表格**：grid 列（Time/Action/Payload、Time/Action/Worker/Data）+ tone badge
  （fail/illegal=danger、write=ok、transition=info）+ 纯前端搜索框（icon 内嵌）。
- **桑基渐变**：家族级 linearGradient（沿流向 0.5→0.22 衰减）+ hover 联动（悬停提亮加粗、其余
  降 .12）+ 透明宽命中路径（细缎带可 hover）+ 节点深底化。

### Changed
- 卡片玻璃化：`color-mix bg-1 65% + blur(12px) + 白系 8% 边 + radius 12`（mockup 玻璃卡）。
- 顶栏：tab 加图标、激活=emerald 底线+微底色；brand=ping 双圈+`LIVE · N Workers` pill（无在办
  =IDLE 灰）；KPI 统一 neutral 容器+彩色数值（在办 emerald/待人工 rose/Findings blue/审批 amber）。
- 画布限宽 1280→1700；环容量 3 列 Form Row（icon 操作对）；工单 ID code 块+copy 图标；状态
  badge 圆点 tone 化；Stepper 实线 chevron+数值 chip（有数 emerald/无数灰）；模块条 pill 化；
  全部卡头加图标+底边线（Card icon prop，28 处）。

## [1.9.2] - 2026-11-14

> 面板可访问+图谱独立页+Linear 级降噪+测试夹具装配器批。npm 包面零变化（不发 tag 不触发
> release/npm）；d2d-panel 0.3.0→0.3.2、start-all.sh 运维面、测试夹具面。

### Fixed
- **面板浏览器信任栅栏 LAN 放行**（d2d-panel 0.3.1）：信任面=回环∪本机非内部接口地址
  （每请求现取）；sec-fetch-site/Origin 两层闸原样——伪造外部 Host 实测仍 403。
- **start-all.sh 过时面**：egress 等待/导出 8888→18888 缺省（P2P_PROXY_PORT 可覆盖）；
  WEB_HOST env（dsh 拒通配，LAN 绑定传具体接口 IP）；wait_port host/超时参数化（dsh web
  30s 冷启窗口）。

### Added
- **图谱独立页**（d2d-panel 0.3.1）：dsh 侧栏第二入口「d2d 图谱」（VizView 同组件全页直开，
  轮询/护栏/令牌全复用）；控制台/图谱双入口并存。
- **测试夹具装配器**（tests/test_graphd_gates.py）：`_node_ddl`/`_api_url` 具名 helper 收敛
  DDL/URL 拼接（装配结果与原串逐字节一致，行为零变；443 pytest 全绿）——扫描器噪音归零。

### Changed
- **面板 Linear 级降噪**（d2d-panel 0.3.2）：设计令牌层方角化（chip/btn 999px→5/6px）、卡题
  句式化（去 uppercase/字距装饰）、fail-closed 横幅三行→一行；~50 处标语/布道句/操作教学/
  次要括注砍除；桑基图例入图（布局即图例）。功能面对齐闸实证零削减（30 路由↔21 消费点）。

## [1.9.0] - 2026-11-14

> 1.9.0 里程碑=PLAN-2 提升批 B4-B7（superagent 深化+产品面+质量健康+智能化收尾）。版本步进
> 纪律延续（1.8.0→1.8.9 九 patch，本次 1.8.9→1.9.0 minor 进位）。全程本地零推送。

### Added
- **Eval 门 assessor 判级层**（workitems.mjs assess，superagent MasterAssessor 同形）：三态
  fail-safe（决策采信/规则回落/抛错 fail-closed 影子）；**decision 词表=规则词表**（词表错位
  真 bug 由测试抓出即修）；tick 注入缺省不传=纯规则零行为变化；宿主 LLM 判级接口预留。
- **webhook source 走 oast 通道**（零新入站端口）：POST /hook/workitems（X-Auth timingSafe
  Equal 常量时间比较 + kind 白名单 + body 上限）→ 规范化落投递箱（单一事实源路径，插件 tick
  拾取）；活体四态验证。
- **飞书/钉钉 Source 骨架**（cookbook 008 同形）：parseFeishuMessages/parseDingtalkPayload
  纯解析 + pollFeishu 轮询形态（tenant token env 直供，应用凭据流程归实现批）；env 注册位
  缺省关；钉钉差异如实登记（Stream 长连接形态，无 poll）。
- **资产反查可视化**：host backlinks 路由（?ref→已锚资产 / ?asset→发现+任务）+ Findings
  展开区"已锚定资产"chips。
- **报告导出 UI**：host report-export 路由（代理 src-export.mjs CLI）+ ConfigView 导出卡。
- **季度归档自动化**：graphd-archive.sh + d2d-archive.service/.timer + install.sh timer
  安装循环（1.8.0 段，此处补记）。

### Changed
- **工作台 DSW 风格对齐**：KPI/页签字体换用 `--dsw-font-xxs-12/xxxs-11/xs-13` 令牌族
  （better-sidebar 同源）；KPI 分显细化（待人工红/影子黄分色）。
- **前端深清洁**（砍标语/提示文字/次要标签）：App Bar "影子 on" chip / 空态长文案 /
  未锚定提示括号 / 导出卡 extra 说明——布局自解释替代文字提示。
- **AGENTS.md 增 E39 常设开发纪律节**（对齐机器闸/版本步进/推送纪律/前端文本纪律）。

### Fixed
- snapshot quarantine 查询 TIMESTAMP 混型（T4-3-2 迁移后遗留 Binder exception）→ 503 整体
  fail-closed 修复。
- **deployment 提醒**：kuzu_db.wal 残留会让 LadybugDB 拒开旧库——生产走 runbook §八
  EXPORT→IMPORT 迁移不可省（本地实测实证）。

### 内部
- E2E 驱动入仓 + 覆盖率基线（行 90.19%）+ align 闸 CI 化 + scheduler 禁区结构守卫四层断言
  （golden 16909bd7914f2b78）+ 裸吞分级登记（54 处 7A/47B）——测试基线 pytest 443 /
  mocha 2264 / panel 97 / align 3/3（30 路由↔21 消费点）。

## [1.8.0] - 2026-11-14

> 1.8.0 里程碑=PLAN-2 提升批 B1-B3（测试基建与存储收尾+实战效能两批）。版本步进纪律：
> 每确认更改 +0.0.1（1.7.0→1.7.9, 下一次更改进位 1.8.0）。全程本地零推送。

### Added
- **E2E 驱动入仓**（scripts/e2e/run.mjs）：五套件（align 静态对齐闸/a 数据面/b WorkItems
  生命周期/c 双图锚点/d engagement 启动流）+ 服务预检 + 退出码语义；`npm run e2e` /
  `e2e:align`。**对齐机器闸=E39 纪律的执行点**（28 路由↔19 消费点+5 动态白名单）。
- **覆盖率基线**：c8 接入 `npm run test:cover`；首跑**行 90.19% / 分支 75.53% / 函数
  93.64%**（95 文件）；基线与低覆盖热点入 docs/coverage-baseline.md。
- **季度归档自动化**：scripts/ops/graphd-archive.sh（EXPORT DATABASE→3 份滚动+失败不
  静默）+ d2d-archive.service/.timer（季度首月 03:00 Persistent）+ install.sh timer 安装。
- **TRANSPORT adapter 级自愈**（债项#3 收口）：E23 限流退避同构——非零退出且尾部含
  TRANSPORT 形态词→指数退避重试（缺省 3 次，env 可调）；spawnImpl 注入点（生产零变化）；
  契约 {code,text} 逐字保持；429 分支优先级不受影响。
- **cold_digest 大 brief 冷摘要**：恒等承诺（≤9KB 零改动）+ 分级压缩（falsified/negative/
  fp 白名单零压缩 > facts 截断 > leads 排序截断，迭代收敛+终极兜底）+ CLI + first-run
  接线（P2P_HANDOFF_CAP）——scheduler 禁区零触碰（输入侧）。
- **步数帽 per-ring 策略表**：P2P_MAX_STEPS_<RING> 覆盖 > 全局 > 60（env 缺省不过=零
  行为变化；E35 步数分布数据源）。
- **任务书两纪律块**（prompt.md 运行前提，禁词集 34/34 绿）：秘密/flag 同级计分排位
  前移 + 报告成稿同排位（预算 70% 强制点）。
- **报告强制点机器注入**：first-run 按 --max-hours×70% 注入收束成稿硬提醒。

### Changed
- **egress 网关缺省端口 8888→18888**（env P2P_PROXY_PORT 仍可覆盖；本机 Java 服务撞车
  实证）——网关/两 systemd 单元/install.sh/passive/adapter-dsh/cdp-proxy 缺省值/README
  同步十处。
- **AGENTS.md 增 E39 常设开发纪律节**：前后端对齐机器闸/版本步进/推送纪律/前端文本
  纪律/零推送本地作业形态。

### Fixed
- **snapshot quarantine 查询 TIMESTAMP 混型**（潜伏 bug，T4-3-2 迁移后遗留）：coalesce
  混 '' STRING 触发 Binder exception → snapshot 整体 503——空值兜底改 TIMESTAMP 字面量。

## [1.7.0] - 2026-11-13

> 1.7.0 语义=1.7.0 债项清偿批——复测三态会话 + 双图锚点（reArtex 语义移植第二批）。
> **版本纪律**：1.6.0→1.7.0 小步递增。**安全面纪律**：复测结论写回走既有 host-only
> /write/verification（append-only+去重门）；锚点写面新增 /write/anchors 同口径 host-only
> 幂等+双端引用 404 fail-closed；零入站端口面不变。

### Added
- **复测三态会话（scripts/xring/retest-tri.mjs）**：reproducible(仍可复现)|fixed(已修复)|
  unconfirmable(无法确认) 三态显式化——classifyRetest 纯映射（verify-runner pass/fail/manual
  词表→三态→/write/verification 既有枚举 pass/fail/held-unreviewed，未知词 fail-closed 归
  unconfirmable）；runRetest 编排（重放异常吞为 unconfirmable 照常写回，编排永不因重放异常
  失声）；与既有 retest.mjs(retestFacts 重放执行层, first-run 消费) 正交零触碰——本模块只做
  结论显式化+入图+工单闭环；CLI `--finding/--replay-result/--complete-workitem/--dry-run`。
- **WorkItems 复测执行面**：assigned 且 kind='retest' 工单 reconcile 自动派发复测 CLI
  （detached；去重=进程内 dispatched Set+done 态收敛+graphd 去重门三重幂等——跨重启至多
  重派一次, 结论零重复）；重放执行=外部执行器（payload.replay_result 显式携带）或缺省
  manual（无法确认——宿主侧无靶环境重放执行器, 诚实归人工）。
- **双图锚点（graphd 加性, reArtex 双图互查语义）**：FINDING_ON(Finding→Asset)/
  TOUCHED(Task→Asset) 两锚点边（CREATE IF NOT EXISTS 纯加性, 既有 12 节点表/八态机/
  actor+reason/host-only 认证零触碰）+ `/write/anchors` 写端点（host-only 幂等, 既有边
  零新建, 双端引用缺一 404 fail-closed）+ 资产反查查询形态（MATCH (f:Finding)-[:FINDING_ON]
  ->(a:Asset) 经既有 /query host-token 通道, 零新读端点）；graphd VERSION 1.7.0→1.8.0
  （schema 变更强制实例换装, preflight 版本握手）。
- pytest 7 例（test_graphd_anchors_e38.py：写边+反查/幂等/双端 404/参数校验/worker token
  403/schema 纯加性护栏）+ mocha 8 例（retest-tri.test.mjs：三态映射/编排异常吞/工单收口）。

### Changed
- graphd VERSION 1.8.0（见上）。

### 内部
- **债项再挂账（归后续批）**：cold_digest 大 brief 压缩（消费接线邻接 scheduler.js:570-618
  brief 组装序禁区, 需显式授权批）; 意图运行时契约（reArtex intent_guard/normalizer +
  progress receipts, 牵动任务书模板面）; 双图锚点面板可视化（资产反查卡）。

## [1.6.0] - 2026-11-13

> 1.6.0 语义=dsh 0.2.2 成对适配 + superagent 机制移植（事件驱动入口/工单状态机/影子模式）
> + dsh workspace 主面板全页 UI。**版本纪律**：1.5.2→1.6.0 小步大特性里程碑（包面真实增量）。
> **安全面纪律**：WorkItems 影子模式缺省开（主动触发只记录不派发）；拉式源零入站端口；
> 写面/范围门/出口治理三层不变。

### Added
- **WorkItems 事件驱动框架（superagent 机制移植）**：Source→Trigger→WorkItem 状态机
  （trigger_received→eval_queued→accepted|eval_shadowed|rejected|needs_human→assigned⇄
  needs_human→done|expired，迁移表 fail-closed 校验）；Eval 规则门四判（影子>源名单>作者
  名单>容量>accept，纯规则不调模型）；拉式源两类=文件投递箱（`$D2D_DATA_DIR/sources/inbox/`，
  处理完挪 .processed/）+ GitHub issues 轮询（`P2P_WORKITEMS_GITHUB`，水位去重）；影子模式
  缺省开（`P2P_WORKITEM_SHADOW=0` 解除）；注意力通知（needs_human/done 才说话，一次一个
  具体问题）走既有 notify webhook。模块 `workitems.mjs`（纯注入式可测）+ 单测 15 例。
- **面板 WorkItems 数据面**：host 半 `/d2d/api/workitems` GET 列表+摘要 / POST 人工迁移
  （迁移校验复用 workitems.mjs 跨包单源）；客户端「待人工」视图（影子/需人工置顶分列，
  放行/否决动作，健康态折叠）。
- **dsh workspace 主面板全页（d2d-panel 0.3.0）**：`ctx.slots.inject('main')` 全页注册 +
  `sidebar.panellist` 左栏图标（dsh-superagent-prototype panel 同机制）——态势/待人工/
  Findings/可视化/审批/链路/工具/审计/配置/XRing 十签顶栏导航，复用既有视图层（零新视图，
  轮询随激活签 visible 门控）；better-sidebar 侧栏 tab 保留为快捷入口（两形态并存）。
- client.inject 增加 layout/workspace/renderer/sidebar 四包（superagent 同款清单）。

### Changed
- **dsh 版本基线重锁（E37 批）**：六包 0.2.1-rc.2→0.2.2-rc.1（dsh-tools exports 面零破坏
  实证）；install.sh CLI pin 同步（行号守恒）；dsh-better-sidebar 0.24.1→0.31.1 成对升级
  （peers 钉 dsh ^0.2.2-rc.1 + cordis ^4.0.5 实证；兼容表 0.2.2 区间转当前基线）。
- **dsh 0.2.2 破坏性变更适配**：宿主移除 `webRuntime` 服务（0.2.1 尚有）——面板 host 半
  inject 去除之，trustedHosts 贡献面以空兜底替代（信任栅栏回环判定+同源闸保留，缺省
  127.0.0.1 绑定形态行为不变）。

### Fixed
- 面板主面板注册与侧栏解耦：betterSidebar 服务缺失时主面板仍注册（软依赖降级分层——
  tabs 跳过、main 槽位照常），测试覆盖两形态。

### 内部
- devlog E37 批登记；SIDEBAR_COMPAT_TABLE 第五行（0.2.2-rc.1↔0.31.1 当前基线）；
- **债项（归 1.7.0）**：双图锚点（graphd schema 邻接禁区，需显式授权批）；漏洞复测三态
  会话（verifyRunner 语义链，XR-G7 分层面）；reArtex 意图运行时契约/cold_digest。

## [1.5.2] - 2026-10-26

> 1.5.2 语义=dsh 0.2.1-rc.2 统一重锁（宿主升级引发的成对适配）+X-Ring 契约归一化前置闸+
> 平台-图对账旗标+夜链组件入仓。
> **版本纪律**：1.5.1→1.5.2 小步递增（大数字跳变仅限大版本迭代）。
> **加性纪律**：required: false 删除与数组类型形态改写均经语义等价论证（校验真值判断/
> 编译产物同形），worker 调用面零行为变化。

### Changed
- **dsh 版本基线重锁（E36-r0）**：六包 @deepseek-ai/dsh-* 0.1.1-rc.2→0.2.1-rc.2（与宿主 CLI
  内置版本对齐；dsh-tools exports 面逐字一致、defineTool(options) 签名不变——API 面零破坏
  实证）；install.sh CLI pin 同步（行号守恒）；dsh-better-sidebar 0.17.1→0.24.1 成对升级
  （兼容表 0.2.x 区间转当前基线，docs/dsh-sidebar-compat.md 同步注记）。
- **defineTool author DSL 收紧适配**：required 属性出现必须为 true（required: false 20 处
  全删——d2d 自家校验真值判断语义等价）；string[]/object[] 类型简写不再支持，改
  array+items 显式形态（items 位 object 显式 additionalProperties）。
- web profile 移除 dsh-sidebar-leap（0.3.2 为最新版但 peers 钉 client-runtime ^0.1.0-rc.8，
  被 0.2.x 宿主拒载——上游发兼容版后回加；导航增强件非功能依赖，panel 走 better-sidebar
  通道不受影响）。

### Added
- **契约归一化前置闸（E34-r0）**：normalizeRepro/normalizeHypotheses/normalizeLessons 纯函数
  （id 缺连字符稳定重映射/variants ≤5 裁切/枚举串场归位/时区补全，合规输入恒等零改动）
  接入 reflow 三段，归一履历 contract-normalized 事件入流；回放验收 39 项归一化全过。
- **平台-图对账旗标（E34-r0）**：first-run --score-panel 起跑基线+终态对账，分涨图零增触发
  platform-graph-divergence 告警（Goodhart 脱钩机器级监测）。
- **night-chain 组件入仓（E35-r2）**：scripts/ops/night-chain/（chain-wrapper.sh+seed-gen.py）
  ——4 槽链式无人值守（文档续接种子/治理五件/靶场健康预检/完成传播/周窗限流 park）。
- first-run 补 --max-tokens 旗标（cap 2M 拒绝不 clamp；E35-r1）。

### Fixed
- adapter-inprocess 测试 mock 对齐 0.2.x 事件词汇（assistant/message 事件必带
  stream: AssistantStreamRecord[]——dsh-session types 权威；真实 agent 产物自带该字段，
  生产路径无恙）。

### 内部
- manifest node_modules 段重生成（六包 0.2.1-rc.2 哈希 18 条）；verify-dsh-version
  SIDEBAR_COMPAT_TABLE 基线注记同步；pentest-dsh README 双轨说明注记 2026-10-26 重锁对齐。

## [1.5.1] - 2026-10-19

> 1.5.1 语义=ECC 判级校准+竞速变体契约形态示例修复+资产图数据层（M1）——小步迭代
> （版本纪律：1.5.1→后续 1.5.2/1.5.3 小步递增，大数字跳变仅限大版本迭代）。
> **加性纪律（升级零行为变化）**：ECC 校准缺省关闭等价于旧判级路径下无 401-JSON 证据
> 场景的判读（正常形态判 none 与旧口径一致）；资产图表为新增纯加性；契约示例修复=
> 文档面对齐（schema 权威零改动）。

### Added
- **资产图数据层**：Asset（目标级聚合）/EnvSnapshot（环境快照 append-only，双判级字段）/
  Verification（验证事件 append-only——"结论可被新验证推翻，历史不改写"）三节点+四边
  （HOSTS/SNAPSHOT/VERIFIED_BY/JUDGED_BY）+三写端点（host-only）+事件去重门（同
  run+kind+引用幂等拒重，重放安全）+编排侧 helper。
- **ECC 判级校准**：单轮判据的 401-JSON 在场性抵扣——多路径同指纹（SPA fallback 形态）
  与 tarpit 同形时，组外真实 auth 层证据使置信降档；跨轮漂移在"恢复向切换"上同型假阳的
  复合降档。正常形态判读 none 与旧口径一致（校准零干扰对照测试背书）。

### Fixed
- **竞速变体契约形态示例**：产出契约表补 variants 形态显式示例（字符串数组的数组——
  与 schema 强制形态对齐）+env 字段仅 https 自签靶需要的说明——此前引导语无示例导致
  worker 自然形态（对象数组）被 schema 整份拒收。
- selfcheck TLS 分层检自包含化（内建本地自签靶+仓内 fixture——零外部依赖）。

### 内部
- 公开面卫生：测试面靶场关联字面量代号化（语义等价零信息损失）+push 前扫描闸
  （scripts/ops/push-scan.mjs）+场验实录移出版本库跟踪。

## [1.4.0] - 2026-10-18

> 1.4.0 语义=Advisor 触发源扩展+竞速变体生产契约（修正窗）+P2 折并清债 8 项+hook 静默
> 失败防御+429 限流退避重启（模型韧性层）。
> **包面口径（vs 1.2.0/1.3.0 的版本对齐语义——本版含真实包面增量）**：hook-guard.mjs
> （新增）与四处 hook 入口包裹（index.js/adapter-dsh.mjs/adapter-inprocess.mjs/scheduler/
> post-execute-gate.mjs）+429 退避（adapter-dsh.mjs，opt-in）；编排层增量（Advisor 三信号/
> 竞速变体契约/P2 折并 8 项/reflow verdicts 三分）在仓内 scripts/xring——包面不含该层
> （先例口径维持）。npm pack 对账：本版 vs 1.3.0 增量恰=上述五文件，零意外面。
> **加性纪律（升级零行为变化）**：429 退避缺省 P2P_WORKER_429_MAX_RETRIES=0（单次 spawn
> 零变化，缺省对照测试背书）；Advisor 三信号为 opt-in 观察面；竞速变体契约=可选声明面；
> 探活参数化缺省=既有 3×10s 语义。
> **包文件集修复**：hook-guard.mjs 入 files 白名单——1.3.0 发布后插件面 hook 入口包裹
> 引用它而不在白名单（装包即断链的半截实施），本版收尾修复。

### Added
- **hook 静默失败防御（hook-guard.mjs，包面）**：五处安全链 hook 入口（approval/request、tools/pre-execute ×2、tools/post-execute ×2）guardHook 包裹——hook 异常先落 hook-guard.log（ts/hook/error/stack JSON 行）再原样重抛；宿主吞错形态的定位法产品化。
- **429 限流退避重启（adapter-dsh.mjs，包面）**：worker 非零退出且输出尾部含 RATE_LIMIT/rate_limit_error 时按指数退避（P2P_WORKER_429_BASE_MS，缺省 60000ms）重启，至多 P2P_WORKER_429_MAX_RETRIES 次（**缺省 0=零行为变化**）；模型面单点环境（无备用 provider）下的关键韧性层。
- **Advisor 触发源扩展（编排层）**：三信号=①探索停滞（跨轮零新增认识论内容）②封锁检测（401/403/429 ≥3）③证伪连击 ≥2 且零建设；防过触发三件套（单发/阈值可配/与连败信号互斥）。
- **竞速变体生产契约（编排层）**：prompt.md 引导 worker 自发声明 repro findings[].variants（≤5 组 steps 变体）——竞速模式的生产侧入口（此前只有消费侧）。
- **verify-runner HEADER 行**：`HEADER <Name>: <value>` 声明式请求头（机械语法解析，坏形态归 manual）——repro 表达力扩展。

### Fixed
- **files 白名单补 hook-guard.mjs**（包文件集增量对账见上）。
- reflow verdicts 三分：held∩verdicts pass→facts（verified_in）/fail→falsified（operator 判伪）/未补录→heldUnreviewed 照旧 leads——held 验证补录链闭环。
- first-run 探活参数化：`--probe-tries`/`--probe-timeout-s`（缺省 3×10s 语义不变）。
- selfcheck 扩至 12 检（+三信号/hook-guard 两检）；mocha 2205→2208（+429 退避三例：缺省零变化对照/重试成功/非限流零重试）。

## [1.3.0] - 2026-10-17

> 1.3.0 语义=意图运行时+第二视角+竞速验证+修复后复测（外部调研四源思想的原生实现，零外部依赖）。
> **包面诚实口径（承 1.2.0 先例）**：四项能力为编排层（仓内 scripts/xring）能力——npm 包面
> 不含该层，本版发布为版本对齐语义；包文件集与 1.2.0 全同。
> **验证口径**：离线合成断言闭环（Intent 继承/Advisor 触发与缺省零行为/竞速胜出与缺省关/
> 复测流转——全 fake adapter 零真进程）+三轨全绿；**编排层能力已经两轮单目标授权环境真实
> 场验**（ECC 判级/接力消费/报告产出的实弹形态见 1.2.0 台账首批数据）；四项新能力的实弹
> 首考列入持续验证台账待入项。

### Added
- **Intent 意图运行时（编排层）**：handoff 契约第五载体 intents（id/direction/status[pending|completed|abandoned]/spawned_from）——worker 收尾自声明（可选 intents.json），跨 run 只继承 pending；注入优先级带=低于 facts 复验、高于新 leads（与 leads[未验证假设]语义互斥：leads=有证据没验，intent=已决定方向）。
- **Advisor 第二视角（编排层）**：验证连败 ≥3 次（可配）触发——同模型新开干净上下文（历史摘要+失败序列+硬边界+上轮建议防重复），只输出建议不执行工具；建议落 workspace/advisor.md（主 worker 可读面）+handoff leads（origin=advisor 传承，防重复同一死法）。
- **竞速验证（编排层，默认关）**：repro findings[].variants（≤5 组 steps 变体）并行重放——先 pass 者胜、败者结果弃置入档（evidence race✓ 行）；与机械验证互补，ECC 可疑时多策略同答=环境可疑旁证。
- **修复后复测（编排层）**：remediated.json 人工/上游修复标记（run workspace）+`first-run --retest <run 目录>`——facts∩标记机械重放（零 worker 零 LLM）；语义对偶=falsified 证伪防复测 / remediated 修复后复测（exit 3=存在复测失败）。

### Changed
- prompt.md 产出契约表加可选 intents.json 行（worker 收尾方向声明——不写=无方向继承）。

### 池登摘要（R-25~R-29，详见 docs/roadmap-1.2.0.md）
资产图跨任务共享/报告证据与局限字段/长 run 记忆压缩/auto-fix 造修复（攻不守定位观察项）/渐进式披露三层加载。

## [1.2.0] - 2026-10-17

> 1.2.0 语义=P1 产品环（复战→抗欺骗→交付——R-05/R-03/R-04）。
> **包面诚实口径**：产品环为编排层（仓内 scripts/xring）能力——npm 包面不含该层，
> 本版发布为版本对齐语义（npm 版本与仓内里程碑同步）；包文件集与 1.1.0 全同。
> **验证口径**：离线合成 e2e 七断言闭环（复战环：消费/注入/falsified/ECC 单轮/跨轮漂移/
> 报告分面/基线再产出）+三轨全绿=机制级证据；实弹面转持续验证台账（ECC 真实目标
> 假阳率/handoff 复战效用/报告面实弹产出=台账待入项）。

### Added
- **跨 run 接力（R-05，编排层）**：handoff 契约（xring/handoff@1）——认识论标签制四载体（facts 已验证/leads 未验证假设/falsified 已证伪/env 路径级指纹基线）；reflow 收尾自动产出 handoff.json，first-run `--from-record` 消费注入（leads 以假设形态注入复验不采信；falsified 入排除表防复测；无 handoff=首战零注入向后兼容）。
- **环境一致性检验 ECC（R-03，编排层）**：tarpit/形态突变 **advisory 信号**（非硬闸）——单轮异构路径指纹趋同/同路径双探翻转（L-3 冻结判据）+跨轮指纹漂移（消费 handoff 基线）+CSP 外部 origin（L-4）；信号入任务书注入+环境画像+报告 caveat，worker 据此自行降档（`--no-ecc` 逃生）。
- **报告自动化（R-04，编排层）**：run 收尾 verified findings → 三外部格式（butian/vulbox/edu-src，docs/report-templates/ 字段映射）自动产出至 run 目录 report/；**分面规则**=外部面只吃已验证 findings，ab-report.md 内部面吃全量（含 leads/falsified/环境评估/接力消费摘要/caveat）。

### Fixed
- selfcheck 扩面至 8 检（+R-05 契约与注入语义/R-03 L-3 判据/R-04 分面——纯函数离线判据）。

## [1.1.0] - 2026-10-16

> 1.1.0-alpha 转正（latest 移动至本版；alpha dist-tag 保留指 1.1.0-alpha）。
> **诚实口径**：L-1 验证率线（A 级机械验证率 ≥70%）因第三轮靶场形态突变（tarpit
> 特征，A 级真漏洞零出现、仅 2 条 info 环境特征）悬置——分母缺失使该线无现场语义，
> 工具未被考到而非考砸。自本版起转为**持续验证契约**：此后每次实弹验证率入
> docs/devlog.md 台账，1.1.1 兑现定谳。换目标冷启动 1m37s（线 15min）与零 /tmp 手写
> 两线达标；验证机器本身经离线合成 e2e 闭环实证（AUTH 合成链/TLS 双模式/reflow
> env.tls 载体全链真网络重放入图）。

### Added（承 1.1.0-alpha 全量）
- verify-runner TLS 分层：repro `env.tls`（insecure 子进程隔离路径/ca 注入）——https 自签靶场机械验证恢复（E11a#1）。
- verify-runner AUTH 原语：`AUTH <loginPath> <credRef> <tokenExtract>` 登录→token 会话链；凭据实体间接引用，token 进程内存零落盘（E11a#2）。
- first-run 目标参数化：`--target/--scope/--task-file/--record-root/--max-hours`（E11a#3）。
- reflow 条目级容错+超长 evidence 截断+`partial` 标记（E11a#4）。
- scope gate 端点白名单：三元组登记+循环变量展开+前缀匹配；黑名单面零豁免（E11a#5）。
- 回流 ID 对账闸：三集合一致性校验+漂移拒落+孤儿差集审计（E11a#7）。
- DSH 0.2.0-rc.2 兼容：会话文件候选表前插 v4 代（0.1.x 零行为变化）。
- **repro schema `findings[].env` 载体补全（本转正批）**：design#1 契约要求的新增可选字段落 schema——env.tls 发现可带 TLS 模式入回流管道（此前 schema additionalProperties 拒收=管道内恒 manual 的断链；离线合成 e2e 闭环实证 A 级直写）。

### Fixed
- E11b：GRAPHD 值启动校验+brainDir 归一守卫（宿主配置面真修，行为零变化）；4-3a 切点断言行号锚→内容锚。
- E13：mocha 挂死根修（xring-p1 真子进程弃管→killAllWorkers 收割+有界等 close）——ci 摘除 `--exit`（技术债到期），套件时长方差收敛。
- E14-B：selfcheck #2 凭据探针外置（`P2P_SCAN_NEEDLE` env，SWEEP-1 同款模式；原版真值字面量入库+管道 rc 恒 0 双缺陷）。

### Security
- AUTH 失败语义：登录/token 提取失败整单转 manual 且标 `auth-failure`（不降级）；凭据全链零落盘零回显（承 alpha）。
- E11b：GRAPHD 配置注入面 fail-closed 启动校验（协议白名单+host 非空）。

## [1.1.0-alpha] - 2026-10-15

> 预发布版（npm dist-tag=alpha；latest 保持 1.0.1 不动直至 Phase 3 实弹验收达标转正）。

### Added
- verify-runner TLS 分层：repro `env.tls`（insecure 子进程隔离路径/ca 注入）——https 自签靶场机械验证恢复（E11a#1）。
- verify-runner AUTH 原语：`AUTH <loginPath> <credRef> <tokenExtract>` 登录→token 会话链；凭据实体 `~/.d2d-data/creds/<eng>.env` 间接引用，token 进程内存零落盘（E11a#2）。
- first-run 目标参数化：`--target/--scope/--task-file/--record-root/--max-hours`，无参缺省零行为变化（E11a#3）。
- scope gate 端点白名单：task-file 内嵌 `allowed_endpoints` 三元组登记，循环变量展开模拟后前缀匹配放行；黑名单面零豁免取严（E11a#5）。
- 回流 ID 对账闸：handoff/repro_paths/图内三集合一致性校验，漂移整场拒落+差集报告（E11a#7）。
- DSH 0.2.0-rc.2 兼容性支持：会话文件候选表前插 v4 代会话名（v4/v3/旧名回退序，0.1.x 下零行为变化；dsh-022 盘点零 blocking 并入）。

### Fixed
- 回流条目级容错：单条 schema 失败不再拖死整文件——超长 evidence 截断（总长含尾标≤上限）+`partial` 标记入图（E11a#4）。

### Security
- AUTH 失败语义：登录/token 提取失败整单转 manual 且标 `failure_class: auth-failure`（不降级为无凭据伪验证）；凭据值全链零落盘零回显（E11a#2 伴生，A0a 修正）。

## [1.0.1] - 2026-10-09

### Security
- 召回窗内脱敏补扫落地（SWEEP-1）：站点情报样例出库（迁本地经验库 `D2D_SITE_PATTERNS` 路径）、engagement ID 注释级形式化（7 处注释/文档；测试夹具与运行时字面量按豁免表保留）、运营计数注释脱目标化。
- scan-clean 门禁接线：泄露面扫描命中退出码修正（exit 1）+入库面（git 跟踪文件）语义+规则精修；`verify-main` 消费接线（目标名单走环境变量，不入代码/CI）。
- Mimosa 运行态确认零公开面（gitignore+包白名单双挡，豁免表登记）。

### Fixed
- lockfile 版本与 package.json 同步（1.0.0 发布时序遗漏）。
- graphd 引擎描述更新（ladybug 转正后事实）。

**零功能变更**：代码行为与 1.0.0 逐字节等价（除版本号与注释/文档字符串）。

## [1.0.0] - 2026-10-09

### Added
- 三环并行自主渗透测试框架首个公开发布（发现/深度攻击/创造探索三类 agent 并行竞速+graphd 图黑板+观测面板）。
- X-Ring 受控自主测试通道：任务书契约/预算双路径熔断/verifyRunner 机械重放（证据链 pass+独立复现分层标注）/held 人工裁决回灌（adjudicate held-finding）。
- 引擎分轨定型：生产 ladybug + 测试双轨（kuzu/ladybug 全量等值书档）。
- 报告交付三平台字段映射样例（补天/漏洞盒子/教育 SRC，脱敏版，docs/report-templates/）。

### Security
- 写面分级（worker 结构化写/host-only 裁决面）+OPSEC scope 门（engagement 上下文 fail-closed）。
- worker env 白名单双层剥离（进程级 strip+spawn 级 buildWorkerEnv——host 凭据面零残留）。
- egress-gateway 出口治理（resolve once/connect validated+CONNECT 端口 pin+硬黑面）。
- 双签验证链（dual_sign 状态机+disputed 人工仲裁闭环）+审计四面 append-only。

[Unreleased]: https://github.com/wufufu770/d2d/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/wufufu770/d2d/compare/v0.3.0...v1.0.0

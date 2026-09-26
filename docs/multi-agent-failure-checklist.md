# Multi-Agent Failure Checklist（#26）

> 多 agent 协作失败模式清单。每条目四要素：现象 / 根因 / 处置 / 证据指针。
> 条目 ID MF-xx 预留与 #1 失败分类学的映射位。来源：阶段 2 前置审计 11 条初稿（方案 c），#1 七类扩展条目待补 [用户方案转述-待拍板]。
> preEngagement 只注入本文件路径 + Top3（MF-01/MF-02/MF-07，≤1KB），全文由 worker 按需读取。

## MF-01 quota 熔断与备用模型切换（#1 映射位：quota）
- 现象：worker 连续报 quota 类失败；同链反复重派；上游 429/配额耗尽。
- 根因：模型供应商配额耗尽或限流；单模型无退路时链路停摆。
- 处置：依赖 failover 重派路径重走 runWorker（scheduler.js:682-688）与 quotaCircuit 熔断；备用模型切换语义为绝不碰项，不得绕过；操作者应等待熔断窗口而非手动重试。
- 证据指针：plugin/pentest-dsh/scheduler.js:682-688；plugin/pentest-dsh/domain/failover.mjs（QUOTA_RE/quotaCircuit，绝不碰）。

## MF-02 graphd 不可达/抖动（#1 映射位：network）
- 现象：查询/写图失败、信号丢拍、状态读取为空。
- 根因：graphd 进程重启、端口抖动、瞬时网络错误。
- 处置：写侧 H6——请求失败 continue 留待下拍，不消费信号；判稳侧 H1——签名集查询失败不参与稳定判定，防误判 completed。
- 证据指针：plugin/pentest-dsh/scheduler/gates.mjs（H6）与 scheduler/loop.mjs（H1），见 commit d861690e。

## MF-03 双签流程结构性失败（#1 映射位：other）
- 现象：第二签永不发生或 409；双签在途态卡死（rejected+pending 死路）；终态残留 dual_sign 簿记。
- 根因：C1 合同插值 literal id 致下游 409；C2 派发面过宽/自动分诊吞掉在途态；H7 并发簿记竞态。
- 处置：合同以真实 fid 插值且签码以「finding:<fid> verdict:<词> sign:2 <nonce>」开头；双签只在 candidate/triaged 派发；簿记走 CAS 条件写；终态残留清扫降 single 留痕。
- 证据指针：plugin/pentest-dsh/scheduler/gates.mjs（C1/C2/H7，commit d861690e）。

## MF-04 验证进度失败（#1 映射位：other）
- 现象：verified 计数反复变化但不再验证；容量判定漏计在途验证派发导致超发 worker。
- 根因：验证器环被当一次性消费（H2）；容量判定未计入 _verifyDispatching（H8）。
- 处置：verified 相对 _validatedVerifiedCount 再变即重验；spawn 在 then/catch 递减 _verifyDispatching。
- 证据指针：plugin/pentest-dsh/scheduler/loop.mjs:609-613（H2）；scheduler/gates.mjs:219 与 :248-249（H8，commit d861690e）。

## MF-05 收敛判定失败（#1 映射位：other）
- 现象：空集两拍恒等被误判稳定导致假 completed；drain 窗口饿死三门；老信号被误剪。
- 根因：lastFindingSet 初值 '' 使空集恒等（H1）；drain 旁路接力（C5）；升权不刷 ts 被 pruneStaleSignals 剪掉（H3）。
- 处置：初值改 undefined；drain 跳过 chain-state 接力与覆盖象限 deep-dive；升权同步刷 s.ts。
- 证据指针：plugin/pentest-dsh/scheduler/state.mjs:12；scheduler/loop.mjs（C5/H3，commit d861690e）。

## MF-06 档位/验证误判（#1 映射位：other）
- 现象：诚实记录登录态被机械钳降到 medium；单关键词（如 mysql/root:x）跨类灌过 Gate-V。
- 根因：authTierMismatch 旧关键词对撞逻辑（C4）；gateV 任一锚跨类即放行。
- 处置：结构化鉴权档位解析（零cookie/游客/登录态），登录态或有成功证据绝不降；跨类须 ≥2 个不同类锚去重同中，无锚 fail-closed。
- 证据指针：plugin/pentest-dsh/domain/triage.mjs（C4）、domain/verify-verdicts.mjs（gateV，commit d861690e）；软依赖 5f384bf 的 auth_tier_gate 结构化标注。

## MF-07 scope 红线（#1 映射位：other）
- 现象：越权探测 scope 外目标；verified Finding 背书越权产物。
- 根因：denylist/排除清单缺失或未加载。
- 处置：engagement 启动前确认 denylist 就位；红线事件一票否决，不得以产出质量抵偿。
- 证据指针：GitHub issue #13（scope 排除清单/denylist 红线案例）；graphd/gd/gates.py DENYLIST 管线。

## MF-08 取消/暂停传达失效（#1 映射位：other）
- 现象：面板暂停后 worker 仍跑完剩余步数。
- 根因：运行中无主动注入通道（stdin 关闭），取消只能经写图 409(d2d-paused) 传达。
- 处置：worker 收到 409(d2d-paused) 即任务已停语义，立即收束不续跑；操作者知晓该语义的延迟边界。
- 证据指针：plugin/pentest-dsh/domain/briefs.mjs:96；adapter-dsh.mjs:223（stdio 无 stdin）。

## MF-09 上下文/缓存假设错误（#1 映射位：other）
- 现象：假设跨 worker 复用 KV 前缀或会话可 resume，导致提示词设计失效。
- 根因：每 worker 系统提示词含随机 wid 的 cwd 后缀；headless 每 spawn 新建会话且不传 --resume。
- 处置：不假设跨 worker 前缀命中；状态快照只在派发时刻随 brief 下发；跨派发接力走图 checkpoint + handoff。
- 证据指针：plugin/pentest-dsh/scheduler.js:488-489；dsh-headless（one task per invocation）；adapter-dsh.mjs:182。

## MF-10 #1 失败分类学七类扩展条目（#1 待补）
- 现象：待补——用户未提供 #1 七类扩展条目原文。
- 根因：待补。
- 处置：待用户提供后按 MF-xx 并轨；本条为占位，保留 ID 映射位。
- 证据指针：#1 失败分类学现状四类 ok/quota/network/other（plugin/pentest-dsh/domain/failover.mjs classifyFailure）[用户方案转述-待拍板]。

## MF-11 与 #25 Agent 状态栏联动（注记条目）
- 现象：处置 MF-02 至 MF-05 缺乏运行时计数的可视性。
- 根因：状态散在图与内存字段（收敛/双签/容量计数）。
- 处置：#25 实施后 <agent_status> 暴露的计数可直接作为 MF-02 至 MF-05 的判据；本条为联动注记，非独立失败模式。
- 证据指针：阶段 2 前置审计草案 A 状态字段表 [推断-待拍板]。

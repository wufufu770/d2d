# XR-P3 token 可观测面调查实录（拍板 2 调查先行，2026-10-06）

> 结论：**选项 (a) 落地**——运行中转录尾近实时可解析；两处 P1/P2 误诊就此纠正
> （桶名公式错 + totalTokens 累计语义误读）。本调查由三路证据构成：dsh 源码级、
> live 探针（真 worker 62.7s）、历史转录跨样本。

## 一、dsh 源码级（~/.npm-global/.../@deepseek-ai/dsh 0.1.5-rc.1 内持久层包
dsh-session-persistence-jsonl/lib/index.js）

| 事实 | 锚点 |
|------|------|
| 追加经 **200ms 批窗**持久落盘：`enqueueLive` → `setTimeout(drainLive, 200)` → `persistContiguous` → `storage.persistBatch` → `appendLines`（`open(path,'a')` + fsync） | index.js:183-192 / 220-236 / 3046-3062 |
| 转录文件**首写惰性物化**后即持续追加——运行中存在且增长 | index.js:2724（"lazily materializes on the first write"） |
| 桶名=**projectKey(cwd)**：分隔符（`/ \ :`）游程折叠单 `-`；`[A-Za-z0-9._-]` 保留；其余 `~XXXX` 转义；剥前导 `-` 后 `--…--` 双杠包裹（截 251） | index.js:874-897 |
| 编码可配 `.jsonl.zstd` / 明文 `.jsonl`（本机安装为 zstd） | index.js:744-761 |

**推论**：P1 定谳的"会话级落盘时序——运行中 token 增量不可得"**不成立**（该结论把
扫描器 bug 误诊为落盘时序）。

## 二、live 探针实录（真 worker 微任务 62.7s，1s 采样 projectKey 桶）

| 观测 | 值 |
|------|-----|
| 桶首现时刻 | **t=25s**（模型首事件后物化；此前窗口=纯时长口径） |
| 转录增长 | 22,737B（t=25）→ 36,934B（t=59），逐秒可见 |
| 运行中解码 | **t=60.1 `unzstd -c` 成功**：16 usage 行、lastTotal=11,660（近实时） |
| 退出精确值 | 18 usage 行、lastTotal=**12,149**（last==max） |
| 代理 vs 精确偏差 | 末采样 11,660 vs 12,149 = **-4.0%**（末两行落在末采样与退出之间；稳态批窗滞后 <1s） |
| 旧求和语义对照 | 同一转录 sumAll=**198,356** vs 真值 12,149 = **高估 16.3×** |

## 三、累计语义跨样本复核（历史真实转录）

3 样本（eng-* engagement 会话，25/91/57 usage 行）：totalTokens 单调递增（其中 1 样本
5 处 -14~-229 的 cache 抖动微降），**last==max 恒成立**。定谳：`usage.totalTokens`=
会话累计值，正确读法=**last-wins**（旧 `accumulateUsage` 求和语义作废）。

## 四、落地（本批代码族）

1. `sessionsBucketFor` 重写为 projectKey 源码级公式（monitor.mjs）——P1/P2 全部
   files=0 的真因（旧公式少一个尾杠恒 mismatch）。
2. `accumulateUsage` 改 last-wins；`collectTranscriptUsage` 增 bytes/idleMs（停滞遥测）。
3. `startMonitor` tick：budget-tick 事件增 `tokens`（运行中转录尾代理）/`transcriptBytes`/
   `idleMs`；budgetCheck 的 tokensUsed 即该值——token 熔断从"退出后可判"升格
   "运行中近精确"（批窗 200ms+fsync；转录未现前=0，纯时长口径兜底）。
4. 面板：lastTick.tokens 投影+view"token 代理（转录尾; 近精确）"注记替换旧
   "时长为主旋钮"注记（口径诚实随调查升级）。
5. smoke-budget 合成转录改累计语义（40000→80000→120000，末值触发）。

## 五、未采纳路径（拍板 2 备选）

- **(b) 存在性+时长×保守速率估计**：无需——(a) 成立，估计器引入无据常数。
- **(c) egress 网关审计面只读关联**：弃。(a) 已给近精确值且天然按 run 归因
  （桶=workspace 派生），无需"单活跃守卫下窗口内流量≈该 run"的弱归因假设；
  网关零改动。

## 六、探针工件

/tmp/xrp3-probe-23a9bZ/{timeline.json}（1s 采样时间线全文；tmp 易失——关键数值
已录入本文件 §二）。

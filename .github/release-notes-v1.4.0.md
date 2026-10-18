# d2d v1.4.0 — hook 静默失败防御+429 限流退避+修正窗固化

pentest-dsh 1.4.0：模型韧性层+插件可观测性里程碑（**本版含真实包面增量**——区别于 1.2.0/1.3.0 的版本对齐语义），并固化上一窗口的编排层增量（Advisor 三信号/竞速变体生产契约/P2 折并清债）。

**全部默认关闭或加性——升级零行为变化。**

## 包面增量（npm 包真实变化）

### 1. hook 静默失败防御（hook-guard）
- 五处安全链 hook 入口（approval/request、tools/pre-execute ×2、tools/post-execute ×2）统一 guardHook 包裹：hook 异常**先落 hook-guard.log**（ts/hook/error/stack JSON 行）再原样重抛。
- 解决的形态：宿主侧吞掉插件 hook 内抛错的静默失败——异常证据在盘上可定位，而非无痕消失。
- 零行为变化：hook 正常路径零感知；异常路径多一份日志落盘。

### 2. 429 限流退避重启（adapter-dsh）
- worker 非零退出且输出尾部含 RATE_LIMIT/rate_limit_error 时，按指数退避自动重启（基线 `P2P_WORKER_429_BASE_MS`，缺省 60000ms；至多 `P2P_WORKER_429_MAX_RETRIES` 次）。
- **缺省 `P2P_WORKER_429_MAX_RETRIES=0`——单次 spawn 零行为变化**（缺省对照测试背书）；开启后仅对限流形态退出生效，其他失败形态零重试。
- 背景：上游 LLM 客户端内部重试为秒级连发，配额耗尽期即死；本层为适配器侧的关键韧性（模型面单点环境下的可作战性）。

### 3. 包文件集修复
- `hook-guard.mjs` 入 npm files 白名单——上一版本后插件 hook 入口包裹引用它而未入白名单（装包即断链），本版收尾修复。npm pack 对账：本版 vs 1.3.0 增量恰=五文件，零意外面。

## 编排层增量（仓内 scripts/xring，包面不含该层——先例口径维持）

### 4. Advisor 触发源扩展
- 三信号：探索停滞（跨轮零新增认识论内容）/封锁检测（401/403/429 ≥3）/证伪连击（≥2 且零建设）——单发+阈值可配+与既有连败信号互斥（防过触发三件套）。

### 5. 竞速变体生产契约
- 任务书引导 worker 自发声明 repro `variants`（≤5 组 steps 变体）——竞速验证模式补齐生产侧入口（此前只有消费侧）。

### 6. 其他
- reflow verdicts 三分（held 验证补录链闭环：pass→facts/fail→falsified/未补录→leads）。
- verify-runner `HEADER` 行（声明式请求头）；first-run 探活参数化（`--probe-tries`/`--probe-timeout-s`，缺省语义不变）。
- P2 折并清债 8 项落地（任务书纪律块/内容锚指南/长度策略统一表/NAS-SPA 任务书模板等——详见 roadmap）。

## 验证口径（诚实声明）
机制级证据=全量 mocha 2208 passing（+429 退避三例：缺省零变化对照/限流重试成功/非限流零重试）+selfcheck 12/12+三轨全绿；npm pack 增量对账零意外。429 退避的实弹验证（真实限流窗内的重启行为）列入持续验证台账待入项。

## 资产
SBOM（CycloneDX）+三平台报告字段映射样例（脱敏版）。

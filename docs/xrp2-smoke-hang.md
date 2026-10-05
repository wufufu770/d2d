# XR-P2 smoke 挂起根治记录（2026-10-05）

> XR-P1 登记项（"smoke 重跑非确定性挂起"P2 排查）收口：根因定位为确定性同步阻塞，
> 修复+复跑验证闭环。本文件为归因证据链留档（smoke-e2e.mjs 修复注释引用处）。

## 一、签名与实证

| 签名 | 实证 |
|------|------|
| 重跑挂起（收集段） | 三次复跑（final2/final3/X1eTTF）sync log 尾行全部停在 `worker promise resolved`——卡在 worker promise 之后的 `collectTranscriptUsage` 收集段 |
| 8 分钟强杀不触发 | 收集段为 `spawnSync('unzstd')` 逐文件循环=**纯同步阻塞**；事件循环冻结期间 setTimeout 计时器全停，watchdog（8min）在阻塞解除前无法触发 |
| "事件循环卡死" | 非死循环——阻塞解除瞬间 watchdog 补触发（process.exit(3)），进程无残留；watchdog 消息走裸 console.error 不进 sync log，故日志看似戛然而止（排查黑洞，本批一并修复：watchdog 改走 log()） |
| "非确定性" | 实为量变：扫描成本随 `~/.dsh/sessions` 历史积累线性增长（本机 3130 桶/3305 文件/609MB）；"独立复刻 45ms 正常"=小样本/桶限定形态 |

## 二、测量（本机实测，2026-10-05）

- 40 文件采样：11.46s，**286.6ms/file**（spawnSync unzstd + utf8 解码 + maxBuffer 2e8）
- 外推全机 3305 文件 ≈ **947s（15.8 分钟）连续同步阻塞 > 8min watchdog 窗**
- 全机扫描真跑（timeout 240s 护栏）240s 内未完成（无输出被击杀）——与外推一致

## 三、根因

`smoke-e2e.mjs` 收集段（原 :109）调 `collectTranscriptUsage(sessionsDir)` **漏传
subBucket**——全机桶扫描。XR-P1 批内修复 monitor 轮询路径时（monitor.mjs:134 桶限定）
漏改了 smoke 的独立调用点（XR-P1 实录 §三.1 修复的同一面只改了一半）。

## 四、修复与验证

1. 收集段改 `collectTranscriptUsage(sessionsDir, null, sessionsBucketFor(WORKSPACE))`
   （与 monitor 轮询同构；单桶 1-2 文件，亚秒级）。
2. watchdog 超时消息改走 `log()`（同步落 /tmp/xrp1-smoke-sync.log，强杀现场可追溯）。
3. **复跑验证：exit=0 全链 61.2s**（独立 graphd 测试实例+真 worker 自然退出 code=0+
   回流 written=2+图内验证 Experience×1/Hypothesis×1；resolve→终态零间隙）。
   实录：experiments/results/xrp1-smoke-e2e.json（本批复跑覆盖更新）。

## 五、残余形态（登记，非缺陷）

- 转录压缩（teardown rename .zstd）落后于 worker 进程退出片刻——退出即扫仍可能
  files=0（本批复跑实测；面板注记"token 计数运行中不可得——时长为主旋钮"已覆盖该
  语义；即时计数如需补齐归 XR-P3 接会话 tail）。
- budget SIGKILL 熔断路径的转录是否压缩由 dsh teardown 决定（X1eTTF/zPYczT 桶实测
  均有 .zstd 落盘）——不影响熔断语义（预算止损以事件流为准）。

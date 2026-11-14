# E39-B6-3 增量裸吞分级登记（SC-1 后新增面——2026-11-14 机器采集）

> 口径：单行 `catch {}` 精确形态（多行 catch 开头行不计——SC-1 后新增代码的增量面，
> 与 hyg1 §一 2026-10-03 基线互补）。54 处 / 19 文件。分级启发式：行内含 abort/dispose/
> delete/unref/kill = A(防御清理面——模式性不修)；其余 B(待审——后续批按文件上下文补因)。
> 采集命令：`grep -rEn "catch \{?\s*\}\s*$" --include="*.mjs" --include="*.js" plugin scripts | grep -vE "node_modules|\.stryker"`

| 文件 | 行号 | 分级(启发式) |
|------|------|------|
| plugin/pentest-dsh/adapter-inprocess.mjs | 122 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 124 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 138 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 193 | A(防御清理面) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 196 | A(防御清理面) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 212 | A(防御清理面) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 308 | A(防御清理面) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 309 | A(防御清理面) |
| plugin/pentest-dsh/adapter-inprocess.mjs | 312 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/idle-tasks.mjs | 135 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/caps.mjs | 70 | B(待审-上下文补因) |
| plugin/pentest-dsh/index.js | 43 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/experience-bridge.mjs | 41 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/experience-bridge.mjs | 52 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/gates.mjs | 61 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/gates.mjs | 65 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/gates.mjs | 112 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/lifecycle-ops.mjs | 263 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/lifecycle-ops.mjs | 323 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/supervisor-tools.mjs | 115 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/supervisor-tools.mjs | 181 | A(防御清理面) |
| plugin/pentest-dsh/scheduler/distill-experience.mjs | 313 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/distill-experience.mjs | 479 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/experience-ref.mjs | 206 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/experience-ref.mjs | 228 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/experience-ref.mjs | 260 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/digest-bridge.mjs | 23 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler.js | 61 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler.js | 111 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler.js | 300 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler.js | 419 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler.js | 656 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler.js | 673 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler.js | 734 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/loop.mjs | 313 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/loop.mjs | 338 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/loop.mjs | 408 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-dsh.mjs | 81 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-dsh.mjs | 121 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-dsh.mjs | 144 | A(防御清理面) |
| plugin/pentest-dsh/adapter-dsh.mjs | 233 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-dsh.mjs | 240 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-dsh.mjs | 305 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-dsh.mjs | 307 | B(待审-上下文补因) |
| plugin/pentest-dsh/adapter-dsh.mjs | 373 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/bias-block.mjs | 83 | B(待审-上下文补因) |
| plugin/pentest-dsh/scheduler/bias-block.mjs | 91 | B(待审-上下文补因) |
| scripts/e2e/run.mjs | 67 | B(待审-上下文补因) |
| scripts/browser/logic-tester.mjs | 51 | B(待审-上下文补因) |
| scripts/browser/logic-tester.mjs | 151 | B(待审-上下文补因) |
| scripts/browser/form-fuzzer.mjs | 117 | B(待审-上下文补因) |
| scripts/browser/cdp-proxy.mjs | 32 | B(待审-上下文补因) |
| scripts/browser/cdp-proxy.mjs | 74 | B(待审-上下文补因) |
| scripts/browser/cdp-proxy.mjs | 102 | B(待审-上下文补因) |

## 处置
- A 类（防御清理面）：模式性不修（SC-1 A 类同口径）。
- B 类：后续批按文件上下文补因（优先级=改动频次：adapter×2/scheduler.js/loop.mjs 为活跃改动面）。
- 本清单随批刷新（每次里程碑批重新采集，增量=新欠账）。

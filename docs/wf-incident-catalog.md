# 工作流事故目录与机制映射（WF-1 需求文档）

> 来源：八批落库/推送工作流事故逐条归集（devlog 条目+批次实录）。
> 每条标注：签名 / 根因 / 当时处置 / 复发次数 / 消解层。
> 消解层：L1=模板库（scripts/wf/templates）· L2=预检 linter（scripts/wf/lint.mjs）·
> L3=agent 失败钩子（证据包+有界自修正）· L4=终态核验分类 · P=流程纪律（AGENTS.md 既有条款）。

## 一、事故明细

### A. journal 缓存重放（三现）
| 项 | 内容 |
|---|---|
| 签名 | AmendWorkflow 修订版的前置读命令与旧 run 同参 → 缓存命中重放陈旧态（旧 status/旧探测结果喂给新控制流） |
| 根因 | 重放按 (命令,参数) 对账命中 journal；读命令结果已被自身写入或时间推移作废 |
| 当时处置 | 事后考古发现陈旧值 → 手工 perturb 重提 |
| 复发 | 3（XR-P2 首现 / XR-P3 二现 / KEYS-1 终态探针） |
| 消解 | **L1**（模板产出一次性落库脚本，重入场景由组装器生成全新参差形态）+ **L3**（重入前置核验=hook 证据包重新采集，非重放）+ P（AGENTS 16 系） |

### B1. perturb 语义破坏①：locale 覆盖破坏比较口径
| 项 | 内容 |
|---|---|
| 签名 | `LC_ALL=C sort` 进 comm 两侧——comm 以环境 locale 比较，两侧 C 序与它错位 → 连 `.github/CODEOWNERS` 都误报缺口，工作流误判止损（WD-2 v2 重入推送） |
| 根因 | perturb 只改 argv 未核语义：env 前缀改变下游比较工具的排序口径 |
| 当时处置 | 本地对照两形态定位 comm 报"not in sorted order" → 回退语义保持 perturb（`ls-files --cached`/`grep -v -E`/`sort -s`） |
| 复发 | 1 |
| 消解 | **L2 R1**（locale 赋值进命令串=拒绝；LC_ALL=C sort 为 canonical 负例 fixture） |

### B2. perturb 语义破坏②：静默旗标吞检查输出
| 项 | 内容 |
|---|---|
| 签名 | `sha256sum -c --quiet` 使成功面零输出——下游按 stdout 计数（`grep -cv ': OK$'`）或按 FAILED 行计数的检查空转/口径分叉（BG-1/BG-2 落库草稿形态，T0A 草稿已记 `--quiet` 退出码歧义） |
| 根因 | 旗标改变检查所依赖的输出契约：检查"通过"的判据被旗标静默 |
| 当时处置 | 各脚本口径漂移（有的看 stdout、有的看 exit code），判据不统一 |
| 复发 | 2+（多处草稿形态各异） |
| 消解 | **L2 R2**（`--quiet`/`-q`/`--silent` 与 stdout 计数检查同串=拒绝）+ **L1**（regen 模板固化唯一判据形态：无 `--quiet` + `grep -cv ': OK$'` + `; true` 守卫） |

### B3. perturb 语义破坏③：注释吞包装收口
| 项 | 内容 |
|---|---|
| 签名 | 给 `node -e` 代码串追加 `\n// 注释` 制造 cache miss——harness 的包装闭包收口 `}})(...)` 落在追加行之后同一行，被行注释吞掉 → SyntaxError（WD-2 补笔 v3a） |
| 根因 | 追加文本进入被包装执行的代码串，行注释作用域延伸到包装收口 |
| 当时处置 | 改为代码内 log 文本变化（`' (wd2-supplement-v3b)'`）完成 perturb |
| 复发 | 1 |
| 消解 | **L2 R3**（代码串含行注释注入形态=拒绝）+ **L1**（regen perturb 一律走 log 文本参数位） |

### C. 网络窗口盲推
| 项 | 内容 |
|---|---|
| 签名 | push 前探测全连不上仍以固定节奏盲试到轮数上限：XR-P0 批 push exit 128 三轮 200/超时交替（devlog:338）；WD-2 单批累计 28 轮探测+3 度开合，单次工作流最多 10 轮同参失败 |
| 根因 | 探测失败无分类（窗口关闭 vs 远端漂移 vs 权限），退避缺失，慢探针（git 21s 超时）反复烧窗 |
| 当时处置 | 连续双探测定式（devlog:338）+ 主 agent 外部轮询等窗后重入 |
| 复发 | 4+ 批 |
| 消解 | **L1 push 模板**（curl 快探针先行[200=窗开]→ls-remote 慢探针→merge-base 守卫→指数退避）+ **L3 S1 策略**（窗口态=等窗重试，分类驱动）+ **L4**（失败分类函数） |

### D1. grep -c 零匹配 exit 1（stdout-vs-exit-code 纪律）
| 项 | 内容 |
|---|---|
| 签名 | `sha256sum -c \| grep -cv ': OK$'` 在全 OK 时 grep 零匹配退出码 1——依赖 stdout 的判据被 exit code 假阳性劫持（WRAP-3 manifest 自校验） |
| 根因 | 管道末命令退出码≠判据本意；grep -c 家族零匹配即非零退出 |
| 当时处置 | 判据改 stdout 计数 + `; true` 兜底退出码 |
| 复发 | 1（+EV-1 相邻教训：world.run stdout 捕获对部分子进程不稳，快速门统一纯 exit-code 口径——两教训合成本纪律） |
| 消解 | **L2 R4**（`grep -c` 无退出码守卫且判据走 stdout=拒绝）+ **L1**（模板唯一形态） |

### D2. regen 后漏 re-add
| 项 | 内容 |
|---|---|
| 签名 | regen 改写 manifest.sha256 后未 `git add` → commit 缺 manifest 更新 → gates FAILED（WRAP-3 补笔） |
| 根因 | regen 与 re-add 两步分离，中间可断 |
| 当时处置 | regen 收口补笔（单独 commit 修复） |
| 复发 | 1 |
| 消解 | **L2 R5**（regen 与后续 commit 之间无 re-add=拒绝）+ **L1**（regen 模板把 re-add 焊进全序）+ **拍板：fold 模式**（regen 并入同族 commit，manifest-only 笔消失——WD-2 六笔中三笔为 manifest-only，开销 5:1 的主要成分） |

### D3. regen 前无 add -A → untracked 漏收
| 项 | 内容 |
|---|---|
| 签名 | regen 用 `git ls-files`（只含 tracked/index）取全集，新文件未 add → 漏出完整性锁，B 层复核才发现（XR-P2：view.xring.js/xrp2-smoke-hang.md 漏收） |
| 根因 | ls-files 口径与工作树现实差一个 add |
| 当时处置 | AGENTS 16② 固化：`git add -A` 先行 → regen → 自校验 → 全集核对 → commit |
| 复发 | 1 |
| 消解 | **L2 R6**（regen 前无 add -A=拒绝）+ **L1**（全序模板） |

### D4. 作用域/重入边界类（脚本自笔 bug）
| 项 | 内容 |
|---|---|
| 签名 | ①工作流脚本止损条件与重入场景冲突（WD-2 v1 `工作树净即止损` 在"已落库待推送"重入态必炸）；②跨作用域引用闭包变量（KEYS-1 追加 describe 摸 dataDir 闭包两跳定位——测试面同构教训） |
| 根因 | 脚本条件只写了首发场景；跨块引用未核闭包 |
| 当时处置 | 修订脚本放宽条件；测试面改直驱 |
| 复发 | 2 |
| 消解 | **L1**（模板前置核验分首发/重入双态判定）+ **L2 R14**（同参 world.run 重复=重入重放风险告警）+ **L3**（证据包带 live 态，重入判定有据） |

### E. 终态探针误判
| 项 | 内容 |
|---|---|
| 签名 | 推送后终态 ls-remote 撞窗口关闭→空输出→误判"remote≠local 不一致"（KEYS-1；本地实测 push 实成） |
| 根因 | 探针失败形态（空/超时/连接拒绝）与确定性失配（有 sha 且 ≠ 期望）未分类 |
| 当时处置 | 终态核验容错重试定式（确定性失配才判负） |
| 复发 | 1 |
| 消解 | **L4**（classifyProbeFailure 纯函数：window-closed/mismatch/ok/unknown 四态；空输出=window 态不判负）+ **L2 R9**（终态核验无重试上界/无分类=拒绝） |

### F. 通道误走（交互 commit/push 被 L3 拦）
| 项 | 内容 |
|---|---|
| 签名 | 交互 Bash `git commit` 被全仓口径扫描拦（对抗载荷行误中）且 deny=reset 回滚暂存（T4-3-3 W5"暂存卸载怪象"，devlog:297）；交互 `git push` 同拦（LBD-1b，devlog:309）；WD-2 更正笔再次误走（批次实录） |
| 根因 | 肌肉记忆走交互通道；L3 拦截面=全仓 docs 增量同拦 |
| 当时处置 | 重走 world.run 通道（暂存需重建） |
| 复发 | 3 |
| 消解 | **P**（AGENTS 17：commit/push 一律 world.run 通道）+ **L1**（模板只产出 world.run 形态）+ **L2 R10**（`--no-verify`/`core.hooksPath` 等禁用旗标=拒绝，AGENTS 17）+ **L2 R11**（命令白名单外=告警） |

### H.（WF-1 dogfood 首演自伤）工具默认值硬编码环境路径
| 项 | 内容 |
|---|---|
| 签名 | wf-assemble 三测试 CI 全红：assemble.mjs 缺省 repo 硬编码 `/home/kali/d2d`——CI 检出在 `/home/runner/work/d2d/d2d`，族路径存在性检查必炸（AGENTS 14 环境路径纪律的工具侧新形态） |
| 根因 | 环境相关值不只 world.run 参数与测试 fixture——**工具自身缺省值也是环境依赖**；本地全绿恰好掩盖（本机路径存在） |
| 当时处置 | 缺省改=组装器自身 import.meta.url 推导仓根（真·环境无关）；CI 兜住即机制工作 |
| 复发 | 1（首演即抓——dogfood 的价值兑现） |
| 消解 | **L1**（组装器缺省自推导）+ **P**（AGENTS 14 广义化登记）；注：linter R 系不覆盖工具源码缺省值——该面由"新测试先单跑+跨环境跑"纪律兜底，登记为机制边界 |

### G.（相邻）world.run stdout 捕获不稳
| 项 | 内容 |
|---|---|
| 签名 | npm/npx 等子进程 stdout 偶发空输出（EV-1），依赖 stdout 的快速门假阴/假阳 |
| 根因 | harness 捕获面与子进程缓冲交互 |
| 当时处置 | 快速门统一纯 exit-code 口径；数字断言移交复核员实跑 |
| 复发 | 1 |
| 消解 | **L2 R4** 同条（stdout 判据必须带 exit-code 侧写或 `; echo rc=$?` 显式回传）+ **L1**（模板判据形态固化） |

## 二、四层机制与消解矩阵

| 事故 | L1 模板 | L2 linter | L3 钩子 | L4 分类 | P 纪律 |
|---|---|---|---|---|---|
| A journal 重放 | 全新参差形态 | R14 告警 | 证据包重采集 | — | AGENTS16 |
| B1 locale | — | R1 拒绝 | — | — | — |
| B2 静默旗标 | regen 唯一判据 | R2 拒绝 | — | — | — |
| B3 注释注入 | log 文本 perturb 位 | R3 拒绝 | — | — | — |
| C 盲推 | curl 快探针+退避 | R7/R8 拒绝 | S1 等窗重试 | — | 双探测定式 |
| D1 grep -c | 唯一判据形态 | R4 拒绝 | — | — | EV-1 口径 |
| D2 漏 re-add | 焊进全序+fold | R5 拒绝 | S2 重跑 manifest 门 | — | AGENTS16 |
| D3 漏 add -A | 焊进全序 | R6 拒绝 | S2 | — | AGENTS16② |
| D4 作用域/重入 | 双态前置核验 | R14 | 漂移守卫 | — | — |
| E 终态误判 | 终态模板 | R9 拒绝 | S1 | classify 四态 | 容错定式 |
| F 通道 | world.run-only | R10/R11 | — | — | AGENTS17 |
| G stdout 不稳 | 判据形态 | R4 | — | — | exit-code 口径 |
| H 环境路径自伤 | 组装器缺省自推导 | —（工具源码缺省值不归 R 系——登记机制边界） | — | — | AGENTS14 |

## 三、agent 权限面（N-0 实锚）

1. **原语实锚**：dynamic-workflows facade 原生提供 `agent(name, persona)`——workflow 脚本内可派子代理（typed ask/串行队列/升级通道）→ 层 3 走**原生形态**；降级形态（evidence-only 模式）仍并行实现为组装器开关。
2. **L3 门对 agent 生效（机制保证）**：AGENTS.md 实施员节实锚「子代理 Bash 走 hook，world.run/harness 通道不经」→ workflow 内 agent 的自有 Bash 同受 Mimosa git-gate 管辖，不可绕 L3；world.run 命令集提交时经用户批准（编译期字面量约束），agent 不能给脚本增命令。
3. **scope 约束（三层）**：①persona 固化绝版清单与三类策略边界（组装器注入批参数 `forbidden`）；②linter R13：脚本内 agent() 调用缺约束样板=拒绝；③对抗测试：越界请求（改文件/commit/push）必须被拒（dogfood 演练工作流 + B 层复核双证）。
4. **agent 角色=协助执行**：诊断员只在预声明策略表（S1 等窗重试/S2 重跑 manifest 门/S3 停下留证）内选择，不发明动作；自修正 ≤2 轮，每轮前置漂移守卫（merge-base 祖先+工作树态），超界=S3 停下回报（证据包现成）。

## 四、基线对照（WD-2）

| 维度 | WD-2（手写脚本） | WF-1 dogfood 目标 |
|---|---|---|
| commit 数 | 6（3 笔 manifest-only） | 5 族全 fold → manifest-only 笔 0 |
| 窗口周期 | 3 度开合、累计 28 轮探测 | 快探针分类+退避，≤1 窗口周期 |
| 更正周期 | 2 次（LC_ALL 口径+注释吞收口） | 0（linter 提交前拦截） |
| 通道误走 | 1（交互 commit 被拦） | 0（模板 world.run-only） |

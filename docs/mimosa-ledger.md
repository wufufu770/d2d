# Mimosa 存量告警对账台账（E11b · 2026-10-16）

> 性质：commit/push/tag 三面拦截的对账总台账与处置定谳。触发器=Mimosa 1.0.3
> （ZCode hook 层，规则包 mimosa-offline.mimosa 为加密封闭面——豁免语法不可探，
> ~/.mimosa/finding-ledger 为事件台账非豁免 API——两者均已探查登记）。

## 一、拦截载荷对账（三次确定性拦截的并集）

### plugin 面 7H（E11a-P2 对齐笔 commit 触发）
| # | 位置 | 级别 | 类型 | 数据流起点 | 定性 |
|---|---|---|---|---|---|
| P1 | scheduler.js:91 | high | SSRF | `GRAPHD`（宿主 config/env） | **架构级误报**——图服务地址为宿主全权配置面，框架语义即"宿主指定图端点" |
| P2 | scheduler.js:102 | high | SSRF | 同上（/health 探活） | 同上 |
| P3 | scheduler.js:144 | high | path-traversal | `P2P_BRAIN_DIR` env | **架构级误报**——知识脑目录为宿主 env 面 |
| P4 | scheduler.js:145 | high | path-traversal | 同上 | 同上 |
| P5 | index.js:527 | high | SSRF | `GRAPHD`（idle-tasks 探活） | 同 P1 |
| P6 | validator.js:429 | high | 命令选项注入 | `args` 数组（curl 参数） | **误报**——spawn 数组形态=防注入最佳实践；args 含合法 URL 查询串（?&=），加元字符校验即破坏功能 |
| P7 | validator.js:429 | high | 命令选项注入 | 同上 | 同 P6 |

### tests 面 30H（manifest 笔 commit/tag push 触发）
| 位置 | 级别 | 类型 | 定性 |
|---|---|---|---|
| tests/test_graphd_gates.py :1524/:1525/:1635/:1911/:2090/:3128/:4688/:5113（SQL 注入×8）/:1814/:1989/:2208/:2782/:4688 附近（SSRF 等） | high ×30 | SQL 注入/SSRF | **夹具用途本身**——T3-1 注入 fixture（真锚 :1524/1525/1635/1814 等，28H+9M 段已登记）：以真形态注入样本验证图门扫描/拦截行为，属"测试即攻击样本"的正当形态 |

### 既有 28H+9M（docs/do-not-touch.md 登记）
- tests/test_graphd_gates.py 注入 fixture（与 tests 面 30H 部分重叠——同一批 fixture 的两次扫描口径）
- validator.js:334 extractCurlArgs curl 黑名单防线区（存量防线非漏洞）
- 处置口径（既有）：实施员 commit 被拦 → 变更就绪 → 工作流通道落 commit（先例 13）

## 二、处置定谳

### plugin 面 7H
- P1/P2/P5（SSRF×3）：**加入口守卫**——GRAPHD 值启动校验（协议必须 http/https、host 非空），
  校验不过=启动失败（fail-closed）。行为零变化（现值恒合法）。守卫为真实防御（防配置注入
  恶意 URL——自研框架的配置面本就该校验）。
- P3/P4（path-traversal×2）：**加 brainDir 归一守卫**——目录路径 resolve 后必须落在
  `DATA_DIR`/`P2P_BRAIN_DIR` 自身（env 面语义不变），异常值=空知识库回退（既有 catch 语义）。
- P6/P7（spawn 注入误报×2）：**不修**（修=破坏 URL 功能）——台账登记误报论证。

### tests 面 30H
- **标注豁免不可用**（Mimosa 1.0.3 规则包加密、无 nosemgrep/suppress 语法、ledger 非 API
  ——三者均实证探查）。
- **fixture 改造=伪装红线禁**（改样本构造躲扫描=违反"不拆碎改动伪装"精神）。
- **处置=台账登记**（本文件即登记）；拦截的解除依赖 Mimosa 上游（baseline/目录降权 API
  ——上游反馈条目已立，见第五步）。

## 三、上游反馈草案（代拟不代发）
标题：Mimosa 1.0.3 请求三能力——(1) baseline/存量告警接受 API（ledger 消费于 commit/push
拦截决策）；(2) test/fixture 目录扫描降权或 `mimosa-ignore` 内联标注语法；(3) 扫描覆盖度
声明（当前"覆盖不完整"自述与确定性拦截的矛盾——采样拦截使 CI 通道不可预期）。
背景：d2d 仓（自动化渗透框架）存量告警全部为宿主配置驱动信任面误报（本台账第一节）与
攻击样本 fixture（第二节），修复=破坏功能或破坏测试语义，唯一出路=上游能力。

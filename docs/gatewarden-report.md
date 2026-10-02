# gatewarden 对抗度量报告（T4-3-1 / 8-3 首期；样本库=tests/gatewarden/ + plugin test/gatewarden-*.test.mjs）

> 攻击者视角纯粹性纪律：本报告登记的 gap **只登记不修**（修复归后续批）；每条 gap 附绕过
> 路径；样本库为结构化可复跑测试集（双向断言：blocked=回归守护 / gap=登记+反向守护——
> 修复后 gap 用例自动失败提示从本报告撤下，防清单腐烂）。
> 数据时点 2026-10-02；全部用例实测驱动（零推测载荷）。

## 一、样本库规模与分布

| 样本库 | 用例 | gap 登记 | blocked 回归 | 覆盖门 |
|---|---|---|---|---|
| tests/gatewarden/test_gatewarden_graphd.py | 26 | 13 | 13 | graphd 侧 G2/G3/G4/G5/G6/G7/G8/G9/G10（9 门族） |
| plugin/pentest-dsh/test/gatewarden-plugin.test.mjs | 24 | 15 | 9 | plugin 侧 门1 scope/门2 policy/门4 tool-gate/门7+8 Gate-V/门9 validator/门12 sanitize（6 门族） |
| plugin/pentest-dsh/test/gatewarden-combo.test.mjs | 8 | 8 | 0 | 跨门组合链 8 条（graphd 3 + plugin 5） |
| **合计** | **58** | **36** | **22** | 15 门族 + 8 组合链 |

攻击类六基线均有覆盖（逐条类标见 §二各行与样本库用例 id 的 -A/-B/-C/-D/-E/-X 段）；**首期对抗即 36 条 gap**——其中 29 条为动态复现的双证 gap，7 条为纯静态登记（**成员=§二编号 9/11/12/13/16/22/23**：HTTP 层 oracle 或需可控环境复现，归评测集/后续批）。
blocked 分列（13/9/0）为记账口径（总数−gap it 数；G8 三 sev 为同一 gap 的 3 it），非字面 it 分类计数。

## 二、gap 清单（分级：🔴可绕过 / 🟡降级拦截 / 🔵告警缺失；★=双证复现）

### graphd 侧（13）

| # | 级 | 门 | gap | 绕过路径（复现步骤） |
|---|---|---|---|---|
| 1 | 🔴★ | G2 worker /query | WORKER_FULLSCAN_RE 标签闭集缺 Frontier/Engagement/ExperienceWeight/Plan/Handoff —— 跨项目全表读 | worker token POST /query `MATCH (x:Frontier) RETURN x.eng_id, x.direction, x.evidence`（无谓词无变更词，三门全过）——跨项目提案池含评审意见；Engagement 同理读全项目 scope/target |
| 2 | 🔴 | G2×/query/frontier | 同根：/query/frontier 缺省全态、eng 过滤可选 | worker token 拉全项目提案池（app.py:1618-1653） |
| 3 | 🔴★ | G7 容量门 | is_engagement_create 子串判定不含 MERGE —— 容量上限整体绕过 | host /query `MERGE (g:Engagement {name:'x'}) RETURN g.name`（P2P_MAX_ACTIVE 失效） |
| 4 | 🟡★ | G4 finding_gates | severity/title 参数化（$t/$sev）使空标题/junk/档位三正则子门全 miss | host /query `CREATE (f:Finding {title:$t, severity:$sev})` + params 载任意标题+high |
| 5 | 🟡★ | G4 junk 清单 | 词表匹配无空白归一 | title 多空格/制表符变体（`no\t rate\t limit`）逃逸垃圾拒收 |
| 6 | 🟡 | G5 档位门 | 标注只验在场不验真伪（文档化设计——真伪钳位归 auto-triage） | high finding 标题加一行"鉴权档位： 零cookie"即过 |
| 7 | 🔴★ | G7×G5×G8 组合 | 档位谎报+high 豁免水位 = 灌水链三门全过（组合用例 GW-CB-G5G8-E-001 双证） | 见样本库组合链 |
| 8 | 🟡★ | G10 denylist | 全角点号/十进制整数 IP 变体 miss | evidence 内嵌 `demo-src。com` 或 `http://2130706433/`（双轮 percent 编码已覆盖✓） |
| 9 | 🔵 | G10×host /query | params 仅在 cypher 含 "Endpoint" 时并入扫描（代码注释自认留白） | host /query `MERGE (w:ExperienceWeight...) SET w.note=$u` + params 带红线资产 |
| 10 | 🟡 | G9 L1 vs scope | l1_gate 精确匹配 vs scope 写面后缀匹配口径不一致 | scope=example.com 时 sub.example.com 写面放行而 L1 验证面拒绝 |
| 11 | 🔵 | G6 转态 | replay_matrix/report_status 只截断不校验不脱敏即落图（静态登记） | transition to=verified 附任意 2000 字符 |
| 12 | 🟡 | G2（oracle） | denylist 红线扫描先于 4 条路由认证（app.py:524 vs :892/:1052/:992/:1233/:1440）——无凭据 403/401 差分 oracle + 每探测耗一次锁（静态登记；生产 P2P_TOKEN 恒置时面收窄） | 无凭据 POST /write/experience 载候选资产串观察 403 vs 401 |
| 13 | 🟡 | 暂停门 | stopAll 暂停仅盖四结构化写端点——/write/experience、/write/frontier、host /query 写、三转态不查暂停（静态登记） | 暂停期间经上述通道继续写图 |

### plugin 侧（15）

| # | 级 | 门 | gap | 绕过路径 |
|---|---|---|---|---|
| 14 | 🔴★ | 门1 scope DESTRUCTIVE | `rm\s+-rf?\s+\/(?!tmp)` 被引号/转义/相对路径打断 | `rm -rf '/etc/nginx'`、`rm -rf "/etc"`、`rm -rf \/etc`、`cd / && rm -rf etc/nginx`（四变体双证） |
| 15 | 🔴★ | 门1×门3 组合 | bash 重定向写系统路径零拦截（write-gate 只看 write/edit 工具名；DESTRUCTIVE 无重定向规则）——**P0 级**：`printf x > /etc/cron.d/evil`、`cat > ~/.ssh/authorized_keys`、`echo x >> /etc/hosts` 三连双证 | bash 一行重定向 |
| 16 | 🔴 | 门4 tool-gate（缺省配置面） | 缺省 P2P_APPROVAL_MODE=off 下 7 高危工具 ask 全降级 allow（web_fetch 元数据端点分类层仅 ask；编排层降级静态锚 index.js:191-194） | 缺省部署即裸奔态——gap②出网直连在此配置下实质开放 |
| 17 | 🟡 | 门2 tool-policy | detectTools 词边界提及判定——改名副本绕限速/基线 | `cp $(command -v nmap) /tmp/n && /tmp/n -p-`（/tmp/n 不命中表；组合用例双证 scope 门同样放行） |
| 18 | 🔴★ | 门8 Gate-V | 证据关键词塞料过跨类双锚（无需真实复现）——verified 假阳性直通 | evidence 含 `root:x:0:0` + `sql syntax error` 两词，high/critical/medium 全放行（三 sev 双证） |
| 19 | 🔴★ | 门7 gate_anchor | 结构化锚只验形态不验真实性（req_id/marker_hit 无存在性校验） | 伪造 gate_v 锚 JSON 直接过 V（双证）；与 18 组成 verified 假阳性全链（combo GW-CB-T7T8） |
| 20 | 🟡★ | 门12 sanitize | 指令词表词面闸门——零宽字符/同形字插词穿透 | `ign\u200bore all previous instructions`、`ignοre previous`（原样放行双证；graphd G11 词表同源同病） |
| 21 | 🟡 | 门9 validator | originOf 从 repro 文本提取 L0 探测目标——finding 文本可操纵探测指向（元数据/内网地址原样提取；直连面在 P2P_PROXY_URL 未配时开放——L0 无授权门是设计） | 往图内写 repro 首行含 `http://169.254.169.254/` 的 finding |
| 22 | 🔵 | 门11 cap | observe 只计数不拒绝（文档化边界）——off 模式横向 spawn 无事前上限（静态登记） | subagent 事件恒入账 breach 后不阻断 |
| 23 | 🔴 | 门6 egress（D） | resolvedIpsAllowed 30s 解析缓存 × 上游 hostname 二次解析 = DNS rebinding 窗口（静态登记——复现需可控权威 DNS，归评测集） | TTL=0 域首查公网→缓存窗内切 A 记录至 169.254.169.254 |
| 24 | 🟡 | 门6 egress（E） | MODEL_HOSTS/OSINT_HOSTS 豁免 scope（豁免≠免治理但内容面不检）；CONNECT host 级不 pin 端口 | crt.sh 查询参数带外外传；scope http:80 host 可 CONNECT :6379 |
| 25 | 🔵 | 门2（D） | 熔断账本失败口径=门拒绝次数非真实执行结果（gap ⑥ 既有登记）——违规/合规交替永不入冷却 | 交替形态探测门边界 |
| 26 | 🔵 | 门3（B） | write-gate 字符串层不跟 symlink——eng 子树内符号链接穿透（文件头自述残余；兜底=宿主 sandbox） | bash 建链 + write file_path=链内路径 |
| 27 | 🔵 | 门12（E） | `value` 决策与二进制块原样放行（消毒闸结构性边界） | 带值结果的注入内容不经消毒 |
| 28 | 🔵 | 门1（E） | denylist cidr_prefix 配置写成规范 `/24` 形态时静默不命中（配置语义面） | 配置 `203.0.113.0/24` vs 期望的 `203.0.113.` 前缀形态 |

### 与 docs/gate-coverage-gaps.md 既有登记对照

- **主缺口①（write/edit 任意路径写）**：工具面已由 T0-C-2 关闭；本批 gap 15 证明 **bash 写面零拦截**为该缺口的真实残余——升级登记。
- **主缺口②（出网直连）**：gap 16 证明缺省配置下实质开放（ask 降级链）——既有登记的配置条件面被本批量化。
- **主缺口③（41 工具仅 bash 过链）**：现状确认（10 名门集不变）；post-execute 消毒闸为唯一兜底且自身有 gap 20/27。
- **gap7（审计无 risk/tier）**：graphd audit.py 同病确认（G16 盘点）——跨侧统一登记。
- **新发现超出既有登记面**：G2 标签闭集（1/2）、G7 MERGE 绕过（3）、G4 参数化（4）、G5G8 灌水链（7）、Gate-V 塞料（18）、假锚（19）、bash 重定向（15）——7 条为 gate-coverage-gaps.md 之外的新发现。

## 三、盘点预测 vs 实测（诚实账）

| 盘点预测 | 实测结论 |
|---|---|
| G2 标签面绕过（graphd 派 P0-1） | ✅ 实锤（6 标签全放） |
| MERGE 绕容量（P1） | ✅ 实锤 |
| 参数化绕过 + junk 空白（P1） | ✅ 实锤 |
| DESTRUCTIVE 引号变体绕过（plugin 派 P1-3） | ⚠️ 首轮探针因 fixture 形态错误误判"全拦"，四轮修正后 **实锤绕过** |
| bash 重定向写零拦截（P0-2） | ⚠️ 同上——首两轮误判"已有覆盖"，修正签名后 **实锤零拦截** |
| Gate-V 塞料（P1-2） | ✅ 实锤（且发现 medium 也在锚校验范围） |
| 消毒零宽绕过（P3） | ✅ 实锤 |

**方法论沉淀（本批最大教训）**：对抗测试的 fixture 必须以被测门**真实签名与真实 fixture 形态**驱动
（checkBash 三参位置调用 + eng={scope} 直接对象；对象形态调用产生全量虚假 DENY——错误 fixture
差点把两条 🔴 P0 级 gap 洗成"已覆盖"）。已写入样本库头注释。

## 四、后续批衔接

- **评测集跑测（T4-3-1 与 T4-3-2 之间，拍板排期）**：本样本库=同源靶场地基——eval 场景可直接复用 58 用例做门禁对抗维度 + gap 23 的 DNS rebinding 需可控 DNS 环境（评测集靶场提供）。
- **修复批候选**（归用户排批）：🔴 15（bash 重定向写）/ 14（DESTRUCTIVE 编码面）/ 18+19（Gate-V 假阳性链）/ 3（MERGE 容量）/ 1（FULLSCAN 标签）——建议一个"门禁收紧批"集中修，与本批攻击者身份分离。

---

## 处置态全景（GW-2 门禁收紧批落账，2026-10-02）

> 修复 commit 指针见 git log（fix(gatewarden) 族均带 gap 编号）；反向守护已翻转的用例
> 在样本库中作为新行为守护（gap 用例断言翻转=非删除）。处置三态：已修/延后[原因]/豁免[理由]。

### 终态统计
**36 条 = 已修 12 + 豁免 7 + 延后 17**；组合链 8 条 = 闭合 2（G2G12/G4G6）+ 部分收窄 1（T7T8）+ 保留 5。
样本库终态：graphd 26 用例（gap 3/blocked 21/exempt 1）+ plugin 29 it（gap 余 6 项）+ combo 8。

### 逐条处置表
| 编号 | 处置 | 说明/理由 |
|---|---|---|
| 1 | ✅已修 | FULLSCAN 闭集扩 Frontier/Engagement/Plan/Handoff；Experience/ExperienceWeight 维持 by-design 豁免（决策 #7/#9/#10） |
| 2 | ✅已修 | /query/frontier 升 host-only（生产消费方全 host 实证；worker 读本 eng 走 raw /query+WHERE） |
| 3 | ✅已修 | is_engagement_create 谓词扩 MERGE（保留子串语义不加词边界——只紧不松） |
| 4 | ⏸延后 | 需 finding_gates 接受 params 第二参=签名扩展（红线排除）；参数化载荷仍登记 |
| 5 | ✅已修 | junk 匹配前空白归一（归一只用于匹配副本） |
| 6 | ⛔豁免 | 档位在场性检查=文档化设计，真伪钳位归 auto-triage authTierMismatch（下游已有） |
| 7 | ⏸延后 | 灌水链随 #4 参数化延后不闭合（谎报+high 豁免均为设计豁免）；组合用例保留守护 |
| 8 | ✅已修 | denylist 全角点归一+十进制整数 IP 还原副本（7-10 位数字 run→点分） |
| 9 | ⛔豁免 | params 扫描留白=代码注释自认已知留白且面在 host-only 通道；扩 params 全扫有性能语义代价，登记不修 |
| 10 | ⛔豁免 | L1 精确匹配=授权表作者意图（fail-closed 方向，无绕过）；改后缀匹配=权限扩大违红线 |
| 11 | ✅已修(收窄) | replay_matrix/report_status 落列前 redact_pii（PII/凭据脱敏）；格式校验仍留待后续 |
| 12 | ⏸延后 | 认证前 denylist 扫描顺序=端点编排改造+HTTP 测试基建；生产 P2P_TOKEN 恒置时面收窄（静态登记维持） |
| 13 | ⏸延后 | 暂停门扩面=四端点编排改造+暂停语义拍板联动（stopAll 语义是否覆盖 experience/frontier 写入归用户）；登记不硬扩 |
| 14 | ✅已修 | DESTRUCTIVE 候选副本集（引号/转义归一+cd 锚定；runs//tmp 工作区豁免最小化） |
| 15 | ✅已修 | 重定向/tee/dd sink 判定（SYSTEM_PREFIXES 与 write-gate 同源 import+.ssh 段判定；相对路径/变量不判定=登记） |
| 16 | ✅已修(部分) | web_fetch 硬黑面任意模式 deny（共享模块 forbidden-target.mjs 抽取+egress re-export）；**残余=内网/环回 off 降级依旧**（签名零变更下不可闭合，延后登记） |
| 17 | ⛔豁免 | 改名副本检测=进程白名单架构（`cp $(command -v nmap)` 静态不可判）；工具纪律表设计边界，登记 |
| 18 | ✅已修(收窄) | 跨类双锚分行判定（单行塞料拒）；**残余=分两行塞料仍过**——彻底闭合需锚真实性对账（IO），与 19 同归 Gate-V 架构批 |
| 19 | ⏸延后 | 锚真实性对账需图/MITM 查询通道+证据格式契约（IO 架构）；纯函数层格式正则经评估否决（无权威命名空间，伪造者零边际成本+误杀已实证 0916 学费） |
| 20 | ✅已修(部分) | 零宽/方向控制字符剥离先于词表；**残余=同形字(omicron)**（NFKC 全量归一有语义风险，延后） |
| 21 | ⏸延后 | originOf L0 探测=设计（L0 无授权门）；修复=强制代理或 origin 白名单（部署面+授权语义），登记 |
| 22 | ⛔豁免 | observe 只计数=文档化边界（拒绝面被禁区注释明确不做）；off 模式 spawn 上限随 #16 off 语义一并延后 |
| 23 | ⏸延后 | DNS rebinding 修复=连接 pin IP+mitm servername 回填（三连接点架构改造+端到端靶场验证）；EV-1 受控仿真用例保留为窗口存在性守护 |
| 24 | ⏸延后 | MODEL/OSINT 豁免=设计（豁免面已知+限速审计在）；CONNECT 端口 pin 伤非标端口合法扫描——使用模式冲突 |
| 25 | ⏸延后 | 熔断口径=既有 gap ⑥（真实执行结果口径需跨层遥测）；登记维持 |
| 26 | ⛔豁免 | symlink 穿透=文件头自述残余，兜底=宿主 dsh-tool-fs sandbox（盘外包）；登记 |
| 27 | ⛔豁免 | value 决策/二进制块原样放行=消毒闸结构性边界（设计），登记 |
| 28 | ✅已修 | cidr_prefix 规范 CIDR 形态归一为点分前缀（仅 v4 数字前缀；checkBash deniedHit 消费点） |
| 组合链 | 闭合 2 | G2G12（FULLSCAN 已扩）/G4G6（redact 已落）；T7T8 部分收窄（塞料单行拦/假锚延后）；G5G8/T2T1/T4CAP/T6DNS/T4OFF 随根因延后或豁免保留守护 |

### 遗留跟踪（归后续批）
1. **Gate-V 架构批**：#18 分行残余+#19 假锚——锚真实性对账（graphd/审计查询通道+证据格式契约）
2. **端点编排批**：#12 认证顺序+#13 暂停扩面（HTTP 测试基建+暂停语义拍板）
3. **部署/授权面拍板**：#16 内网 off 降级残余+#21 L0 探测+#24 CONNECT 端口（使用模式归用户）
4. **检索/评测联动**：无（评测集与门禁面分立已证）

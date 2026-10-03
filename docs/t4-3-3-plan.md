# T4-3-3 前置审计与异构语义方案（阶段 8-2 双签升级；只读批 T4-3-3-0 产出）

> 口径：只读审计+#26 行为修复（承前补办，授权=HYG-1 拍板 10）+夹具纪律登记+dependabot 核查。
> **异构语义方案卡（§二）为回报核心交付物——等用户确认后进 T4-3-3 实施**（8-2 是定义缺失
> 最重子项，按拍板①"按仓内材料还原最小方案"设计）。
> 增量口径：v1 双签链按 T4-3-2/HYG-1 后 HEAD（e63ffb61）重新实锚；t4-3-plan 记"6 处直写"
> 实测为 **11 处**（HEAD 漂移对账，§一）。

## 一、审计项 1：v1 双签现状全链实锚（增量）

| 环节 | 实锚 | 现状 |
|---|---|---|
| 触发判定 | domain/gates.mjs:119 `needsDualSign` | critical/high；`P2P_DUAL_SIGN=off` 关闭（建议项制） |
| 容量判定 | domain/gates.mjs:127 `canSpawnDualSign` | verify 预留（capVerify=3）+总量硬顶 +2；0914 饿死修复在位 |
| 对象锁定 | scheduler/gates.mjs:288 | 只在 candidate/triaged 派（needs-scope/rejected 上挂 pending=死路，0917 C2） |
| pending CAS | scheduler/gates.mjs:304 | `WHERE dual_sign IS NULL OR ''` 条件写（0917 H7 防双复核员） |
| 第二模型 | scheduler/gates.mjs:279/:463 `resolveBackup('verify')` | 单槽静态配置（M3 主/M2.7 备=同 vendor 不同 model id——**半异构现状**） |
| 模型死亡 | :282 | backup 熔断名单命中→blocked 留人工+notify |
| 派发签码 | :318 `_dualExpect[fid]=nonce`（randomBytes(4)） | 一次性签码，respawn 节流登记 |
| 假签防线 | :232-264 | pending 只接受 sign:2 署名+签码相符 confirmed；无署名/不符→不构成仲裁维持 pending |
| 结果态 | :251(disputed)/:382,:390(signed) | disputed 留人工（disputed-locked）；一致过 Gate-V 补盖 signed |
| **直写收编差距** | scheduler/gates.mjs **11 处** `SET f.dual_sign`（:251/282/304/335/339/382/390/467/484/494/514） | 全部经 host /query 直写——收编目标=graphd 转态门端点化（状态机白名单+host-only），scheduler 簿记改调端点 |

**与 T4-3-2 新面交互结论**（审计定）：
1. **/write/experience-consensus 不入双签面**——双签对象=Finding 的 verdict 裁决信号面
   （to=verified 需第二意见）；experience-consensus 是 host-only 数据治理回写（host 即授权
   源，无"单一模型自评"风险面）。维持独立，不加双签。
2. **reasoning_path 是 8-2a 天然接点**（成立，见 §二.2）——但受净室原则约束（给先验≠给结论）。

## 二、审计项 2：异构语义方案卡（核心交付物——等用户确认）

### 维度一：异构选型（三维度对比）

| 维度 | 形态 | 成本 | 收益 | 与"调度器代签"拍板兼容 | 推荐 |
|---|---|---|---|---|---|
| **模型异构** | 强制 backup 槽 model id ≠ primary model id（id 级即异构，不强制 vendor 级——vendor 强制会把 M3/M2.7 现状判违） | S（resolveBackup 读取处断言+启动告警+strict 开关） | 同款模型同款盲区风险消除；现状 M3/M2.7 已满足=零配置迁移 | 兼容（代签拍板不涉模型选择） | **★本批主选** |
| 密钥异构 | 双签两把钥不同源（ed25519 平行模块，evidence-crypto 原语复用，密钥=调度器代签） | M-L | 签名不可伪造升级（nonce→密码学） | 兼容（代签=调度器持钥） | 可选件——建议独立小批（本批不含，见 §四） |
| 实现异构 | 复核走独立代码路径（不复用 verify-result 链/gateV） | L | 低（gateV 是确定性门非模型面，共享恰是确定性来源） | 冲突（代签合同=sign:2 回显同一信号面） | 不推荐（登记不选） |

### 维度二：复核材料增强（8-2a）——reasoning_path 消费接点

- 现状：净室 dualFocus 材料仅 **sanitize(frow.repro) 截断**一件（不给第一签结论/verifyEvidence/anchor）。
- 接点设计：dualFocus 追加**背景参考段**——图内读取该 finding 关联 eng 的 Experience
  （`consensus_status` 非空行 + reasoning_path 截断），标注"背景参考（经验池先验，非任何
  先前结论）"——与净室原则兼容：reasoning_path 是经验池知识（v2 前已可经知识注入到达复核员），
  非第一签结论。
- **开关缺省 off**：`P2P_DUAL_BRIEF_EXP=1` 启用（最小方案原则——先验锚定效应留实验余地）；
  读取走 host 通道一次查询（参数绑定），空池/不可达静默省略段。
- 工作量 S（scheduler/gates.mjs dualFocus 组装段 + 测试）。

### 维度三：强制边界

- **异构强制档位=维持 needsDualSign 现状**（critical/high——与 Gate-V 严档对齐先例
  [T4-3-2 C 子批 high/critical 严]一致）；medium 维持单签（双签成本/收益不匹配）。
- **异构强制的落点=配置约束**（c 层核心）：`P2P_HETERO_ENFORCE` 三档——缺省 `warn`
  （启动时 primary==backup model id → 响亮告警+gate-log）；`=strict` → 拒配（fail-closed，
  双签功能停用并 notify）；`=off` → 静默。现状 M3/M2.7 在三档下均正常。
- 单签保留面不变：backup 未配置（单签放行留痕）/模型死亡（blocked）/容量满（skip 留痕）。

### c 层配套：graphd dual_sign 转态门收编（11 处直写端点化）

- 新 host-only 端点 `/write/dual-sign-transition`：状态机白名单
  （''/single→pending；pending→signed|disputed|blocked；signed/blocked/disputed 终态不可迁——
  迁移表收敛 gates 纯函数供 pytest）；CAS 语义保留（WHERE dual_sign 条件写移植端点内）。
  **【T4-3-4 勘误】上行三段式为设计稿草图，与实现有出入**：实施时以 11 处直写实测全边集
  为准（graphd/gd/gates.py DUAL_SIGN_TRANSITIONS，10 边）——草图漏 6 条真实边：''→blocked
  （:282 派发时模型已死亡）/''→single 与 pending→single、blocked→single（:335/:339/:467/:484
  降级留痕）/**blocked→pending（:514 解冻边，0915 B1 先例——backup 恢复存活自动重派）**；
  **blocked 非终态（可解冻挂起态），真终态仅 signed/disputed**。未来读者以
  graphd/gd/gates.py 迁移表及其 pytest 全表用例为权威，勿信本草图。
- scheduler 11 处 `q(SET f.dual_sign…)` 改调端点（每次簿记语义逐字保留：话术/runLog/审计不变）。
- 收编收益：dual_sign 迁移获得服务端状态机校验（现状 scheduler 直写无图侧防线，伪造 host
  通道可任意置态——与 experience-transition 拍板⑧同族风险收口）。

### 推荐组合（等用户确认）

**a 复核材料增强（S，开关缺省 off）+ c 异构强制（模型维度，warn 缺省/strict 开关）+
dual_sign 转态门收编（11 处端点化）** = T4-3-3 实施批；密钥异构（密码学背书）独立小批候选；
实现异构不选。

## 三、审计项 3：禁区预比对 + 按行授权申请

| 预期面 | 比对 | 处置 |
|---|---|---|
| auth-contract.mjs | **零触碰**（平行模块若做=新文件复用原语） | 承诺兑现 ✓ |
| scheduler/gates.mjs :251-514 dual_sign 簿记 11 处 | 已落地对象（GW-2 v2 授权过该文件 seam 面） | **按行授权申请①**：dual_sign 簿记 11 处改调端点（语义逐字保留） |
| scheduler/gates.mjs dualFocus 组装段 | 同文件 8-2a 面 | **按行授权申请②**：背景参考段追加（开关缺省 off） |
| domain/gates.mjs needsDualSign/canSpawnDualSign | 不动 ✓ | 零触碰 |
| model-policies 读取处（model-rotate/resolveBackup 邻接） | 非禁区 | 断言落点 ✓ |
| graphd /write/dual-sign-transition 新端点 | transition 先例同款纯新增 | **按行授权申请③**：新路由+gates 迁移表纯函数 |
| 本批已做 #26 | write-gate.mjs（文件头/测试头注设计边界已按授权修订） | HYG-1 拍板 10 兑现 ✓ |

## 四、审计项 4：拆批方案

- **T4-3-3（单批实施，预估 3-4 族）**：①a 材料增强（scheduler dualFocus+开关+测试）②c 异构
  强制（model-policies 断言+strict 开关+启动横幅）③dual_sign 收编（graphd 端点+迁移表纯函数+
  scheduler 11 处改调+pytest/mocha）④docs+manifest。验收：异构断言三档行为用例/迁移表全路径
  pytest/11 处收编后 runLog 话术逐字回归/复核材料开关行为/三轨零回归。
- **T4-3-4（衔接既定）**：d 调和流程+8-4 L1 只读稳定视图+阶段 8 收官（tag）。
- 密码学背书平行模块：独立小批候选（M-L，不进 T4-3-3——本批已含收编 M 面工作量）。

## 五、假设与未确认项

- 异构=模型 id 维度（不含 vendor 强制/数量扩展）——"最小方案"还原；用户确认可上调。
- 复核材料增强的先验锚定效应风险以缺省 off 对冲——启用后的对照实验归评测集候选。
- dual_sign 收编后 scheduler 对端点的失败降级语义=维持现状（.catch 留痕，不阻断主流程）。

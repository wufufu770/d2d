# T3-2-2b 角色过滤接线收官记录（6-1 经验→技能整项全清）

> 授权依据: docs/skill-design.md §三（条件性批准, 三实质=硬门禁）· 基线: 远端 HEAD `03cebde`
> diff 取证: **三文件 +59/-0**（scheduler.js +5 / experience-ref.mjs +35 / role-card-filter.mjs +19, 删除行数全 0）

## 一、三实质达成证明

1. **纯新增行**：`git diff` 删除行数 = 0（三文件分别 0/0/0, BG-2 +5/-0 同构口径）。
2. **3.5-3 语义零改动**：experience-ref.mjs 既有 fetchExperiences/rankExperiences/
   buildExperienceRefBlock/buildExperienceRef 全部既有行零触碰（源码断言测试锁定既有编排内
   不得调用新函数——独立调用接入, 不重写不包裹）；scheduler.js :620 既有调用行/BG-2 注入行/
   taskFull 行原样（源码断言锁定）。
3. **回退开关 + 端到端**：`P2P_ROLE_FILTER === '0'` 关闭（缺省启用）, 双覆盖（scheduler 接线行
   前置 + buildExperienceRefFiltered 编排层内部前置）; 三态端到端实测（mock httpLike 零成本）:
   ①有 role+匹配条目 → block 仅含命中条目 ②无 role → 空 block（调用方保留既有 block=全量降级）
   ③开关=0 → 空 block; 附加 httpLike 失败 → 空 block（绝不 throw）。

## 二、§三 授权材料 vs 实施的漂移修正清单（回报留痕）

| # | §三 原文 | 实施修正 | 依据 |
|---|---|---|---|
| 1 | 面 1 改法 =「buildExperienceRef 增加可选 opts.role + rankExperiences 结果追加过滤 + scheduler :620 传参」 | **形态修正**: experience-ref.mjs 文件末尾纯新增导出 `buildExperienceRefFiltered`（组合既有导出 fetchExperiences/rankExperiences/buildExperienceRefBlock + domain filterExperiencesByRole）+ scheduler 侧纯新增条件覆盖行（`_expRef.block = ...`） | §三原改法必须修改既有签名行与调用行 → 违反硬门禁 1/2; 修正形态满足三实质且与 BG-2 编排文件同形态 |
| 2 | 面 2 =「knowledgeBlock 装配后追加 filterCardsByRole 过滤」 | **不实施（时序死结实锚）**: knowledgeBlock 装配在 :361-402, 而 role 赋值在 :460-476——装配点 role 不可得; join/裁剪在 [570,618] 禁区边缘且为字符串 | 时序倒挂实锚（scheduler.js 行号 51c941c→03cebde 零漂移） |
| 3 | 匹配口径 =「signal_affinity × 卡 domain」 | **修正**: domain=业务领域词（教育/AI SaaS 等）与 24 攻击面专才 role 不对齐（T3-2-2 审计项 3 已发现）; 实施口径 = signal_affinity × Experience 条目 title/content **拆词**（拉丁词≥2+CJK 二元组——整串比对会让 'sqli'↔'SQL 注入' 不互含, 测试实证后修正）+category | 词面口径实测修正 |

## 三、开关正交与代价

- `P2P_ROLE_FILTER` 只管过滤层; `P2P_EXPERIENCE_INJECT` 仍管整个注入层。正交实现: scheduler
  接线行前置 `EI !== '0' && RF !== '0' && role`（EI 关 → 注入层整体关, 过滤层不独立复活注入）,
  编排层内部再兜 RF 一层。四象限语义: EI 开+RF 开=过滤生效 / EI 开+RF 关=全量注入 / EI 关=整体关
  （RF 无意义）/ 双关=整体关。
- **双 IO 代价**: role 场景下 experience 检索执行两次（:620 既有调用 + 过滤编排内重取）——授权
  修正形态的显式代价, runLog `experience-role-filtered` 留痕; 无 role（task-consumer 等）与开关
  关闭场景零额外 IO。空转期常态（/query/experience 只回 active, 现库 9 条全 quarantined）下该
  路径几乎不触发, 实战影响极小。

## 四、6-1 整项全清确认

skill 对象+三门通道+抽取管道+示例 2 张（T3-2-2）/ domain 补齐（T3-2-2）/ 角色过滤接线+
回退开关（本批）——6-1 三个切片全部落地。剩余开放项: skill wins 自动归因（开放项 20）、
distill LLM 蒸馏步骤（开放项 21）, 均为实战积累后立项项, 非本子项范围。

## 五、测试（本批新增 10 例）

filterExperiencesByRole 命中/降级三态; buildExperienceRefFiltered 三态+httpLike 失败;
接线源码断言（覆盖行在位且在 taskFull 前/EI×RF 正交前置/3.5-3 既有行原样/独立导出零包裹/
开关正交注释）。回归: experience-ref 既有测试（35 例文件级）零回归——既有编排行未动。

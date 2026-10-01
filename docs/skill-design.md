# skill 对象设计与 T3-2-2b 授权申请（T3-2-2 交付）

> 批次: T3-2-2 经验→技能升级（6-1）· 审计基线: 远端 HEAD `08a2b39`
> 裁决 B 已触发（审计项 1）：角色过滤**接线**拆 T3-2-2b 独立授权段，本批只落纯函数与材料。

## 一、审计项 1 裁决：3.5-3 边界（结论 B）

**实锚**（`08a2b39`）：
- `scheduler/experience-ref.mjs`（231 行）链路 = fetchExperiences（/query/experience）→
  **rankExperiences**（综合分 = scope×0.6 + utility×0.2 + freshness×0.2，top-5）→
  buildExperienceRefBlock（条目消毒 + 2KB 自限）→ buildExperienceRef（编排，绝不 throw）。
- role 信息在 scheduler 调用点可得（:622 runLog `role?.id`），但**过滤必须发生在选卡阶段**
  （rankExperiences 或其输出侧）才能改变注入内容——那是 3.5-3 禁区文件既有行。
- scheduler 侧纯新增行（BG-2 :620 后同构）只能对**已组装的 block 文本**做后处理——需解析
  `<experience_ref>` 内部条目再删行，破坏 3.5-3 的两条不变式（条目消毒纪律 + 2KB 自限纪律），
  且属"注入产物语义"触碰。

**结论 B**：角色过滤接线无法以纯新增行达成（追加式只能做"提示块"弱语义或"文本后处理"脆语义，
均非真过滤）。按拍板 3 宁可拆批：本批落 `domain/role-card-filter.mjs` 纯函数 + 19 例测试，
接线拆 **T3-2-2b** 独立授权段（材料见 §三）。

## 二、skill 对象设计（已落地）

### 2.1 对象与分工
| 对象 | 形态 | 生命周期 | 载体 |
|---|---|---|---|
| Experience | 图节点（单次实战教训） | 隔离池 quarantined→active→deprecated | graphd |
| 知识卡 | JSON（what/when 技法） | versions ≤3 + 三门晋级 | brain/versions |
| **skill** | **SKILL.md + memory.md（how-to 程序）** | **quarantined→shadow→current→deprecated** | **`brain/skills/<id>/`** |

升格建议口径（distill 管道预筛）：同主题经验 ≥2 条聚簇，或知识卡 wins≥2。

### 2.2 存储与三门（全部落地，平行新建零触碰既有链路）
- 存储：`${DATA_DIR}/brain/skills/<skill-id>/SKILL.md`（front-matter+正文）+ `state.json`
  （+`memory.md` 迭代面为后续批预留目录约定）。
- 门①结构（hard）：`domain/skill-schema.mjs validateSkillFull`——front-matter Schema
  （id `skill:` 前缀/category 10 枚举/状态机 4 枚举/signal_affinity 角色绑定键，未定义字段
  fail-closed）+ 正文四小节（触发/步骤/验证/阴性）+ EVIL 注入扫描。
- 门②复盘（hard）：signal_affinity 撞已证伪方向（refuted/pruned 且无胜绩）→ 隔离
  （语义照 promote.mjs historyGate；图不可达降级同口径）。
- 门③证据（soft）：evidence 非空方可转 current（skill wins 自动归因未建——开放项）。
- 附加纪律：管道骨架（`<待人工蒸馏>` 占位）禁止晋级。
- CLI：`scripts/brain/skill-promote.mjs`（list/check/promote/reject）+ `skill-distill.mjs`
  （dry-run 默认，--apply 落 quarantine 骨架；空转保护实证：现素材 0 候选正确退出）。

### 2.3 实跑验收（本批完成）
- 示例 skill ×2（`brain/seed/skill-samples/`，黄金靶实况：SPA 鉴权分离三点重放 / DVWA
  上传执行链）安装 quarantine → check 三门全过 → spa skill 晋级 shadow。
- domain 补齐：v5/v6 **同 5 张**通用技术卡（legacy-command-injection-revalidation 等）补
  空串（无业务领域归属，语义中性）→ Schema 校验 260/260 全过。

## 三、T3-2-2b 授权申请（4-3a 格式，只产出不执行）

### 申请面 1：experience-ref.mjs 选卡过滤（3.5-3 禁区，核心）
- **对象**：`plugin/pentest-dsh/scheduler/experience-ref.mjs` 的 `buildExperienceRef`
  签名行 + `rankExperiences` 调用点（两处既有行）；scheduler.js 调用点 :620（BG-2 已锚）。
- **改动面**：①`buildExperienceRef` 增加可选 `opts.role`（不传时行为逐字节不变——**语义零
  变化的参数扩展**）②rankExperiences 结果上追加一行 role 过滤（filterCardsByRole 纯函数
  已就绪，本批入库）③scheduler.js :620 调用点传 `role: role?.id ?? ''`（一行内改一个实参）。
- **理由**：角色过滤的唯一正确实现点=选卡阶段；提示词层无强制力；文本后处理破坏 3.5-3 不变式。
- **风险与缓解**：opts.role 缺省路径零行为变化（全量 mock 测试锁定）；过滤降级三态
  （无 role/无 affinity/非数组 → 全量返回）保证无角色任务零影响；diff 断言测试锁定
  rankExperiences 权重常量与排序公式零改动。
- **回滚**：单 commit revert；或运行时 `P2P_ROLE_FILTER=0` 短路（与 P2P_BUSINESS_GATE 同形）。

### 申请面 2：knowledgeBlock 装配过滤（scheduler.js :361-402 区，禁区区间外）
- **对象**：scheduler.js 知识卡装配区（mergeChannels/retrieveKnowledge 结果消费点）。
- **改动面**：装配后追加一行 filterCardsByRole 过滤（角色对该区不在 3.5-3 禁区但仍是既有
  函数行为面，故并入同一授权段一次拍板）。
- **理由/风险/回滚**：同上（降级三态 + revert + env 短路）。

### 建议拍板方式
两面同一授权段打包批准或单独批准皆可；批准后 T3-2-2b 为小批（接线 + 测试 + 实测，预估
2-3 commit 族）。

## 四、开放项（只记不修）
- skill wins 自动归因（worker 回写 used_skill → 门③升级 hard）：待实战 used_knowledge
  归因面成熟后对齐（T3-1 度量框架已有归因先例）。
- memory.md 迭代面（per-skill 实战笔记读写纪律）：目录约定已留，读写纪律待 skill 实战后定义。
- distill 管道的 LLM 蒸馏步骤：现为骨架产出（占位纪律防造假），接 LLM 需走零成本测试约束
  评估（study.mjs 同款 dsh 调用形态可复用，素材积累后立项）。

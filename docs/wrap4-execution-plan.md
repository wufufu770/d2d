# WRAP-4b 执行方案（WRAP-4a 族 3 · 发布机制清单+迁移归档方案+执行排序提案）

> 性质=纸面方案（本批零结构操作）。所有"外向不可逆"动作（npm 发布/GitHub Release/
> 分支删除/仓库公开）逐项标注**拍板点**——执行相逐项请示，不批量授权。

## 一、发布机制清单（阶段九原文逐项）
| 项 | 执行条件 | 依赖 | 拍板点 |
|----|----------|------|--------|
| A/B 报告脱敏（前置） | 真实 engagement 名/目标域清洗脚本+样例审计 | experiments/ 实录扫描 | **拍板①**：脱敏范围（仅 experiments/ 或含 docs 实录段） |
| npm Trusted Publishing OIDC | npm 账号+GitHub Actions OIDC 绑定+provenance 配置 | 仓库公开 | **拍板②**：包名/公开时机 |
| SBOM | CycloneDX/syft 生成入 Release 资产 | CI 一步 | 低险随批 |
| provenance | npm publish --provenance（OIDC 后自动） | 拍板② | 随② |
| GitHub Release | tag 打点+Release notes（CHANGELOG 生成） | CHANGELOG 骨架填充 | **拍板③**：v1.0.0 打点时机 |
| npm 双通道 | latest+next 标签策略 | ② | 随② |
| 报告模板三格式（补天/漏洞盒子/教育 SRC） | 模板引擎（现有 report.mjs 扩三模板）+脱敏样例 | 拍板① | **拍板④**：三格式字段映射确认 |
| 双语 SECURITY.md（唯一破例） | 披露流程/支持范围/联系方式 | 安全邮箱决定 | **拍板⑤**：披露联系渠道 |

## 二、迁移与归档方案（执行相操作分解）
1. **归档锚**：现仓打 `archive/pre-clean-<date>` tag（回滚点=全史可达）；现有 10 tags
   保留（v1.0.0-clean/upstream-base 等既有回滚点不动）。
2. **分支处置**（36 远程分支逐条——实测清单）：
   - **删除候选（33）**：feature/issue-17~31（issue 驱动开发期分支——内容已并入 main 或
     废弃，执行相逐条 `git log main..branch` 空核后删）、dependabot/*4（LBD-1 已收编）、
     base/monorepo+feature/issue-*早期、trae/*2（agent 临时分支）、security/p0（已并）、
     feat/*3、docs/handoff、w2-w3/w4（已并）。
   - **保留（2+main）**：mods（研究资产挂起——LBD-1 定性）、（main 本体）。
   - 拍板点⑥：删除前逐条空核清单请示（一次性批拍板）。
3. **迁移步骤序列**（WRAP-4b 内部序）：
   a. archive tag → b. 删除候选分支（拍板⑥后）→ c. 目录重组（蓝图 §一，git mv 保史）→
   d. README/CHANGELOG/SECURITY 落地 → e. docs 精简（40+→4-6）→ f. experiments/ 实录
   脱敏（拍板①后）→ g. CI 三 workflow 适配新路径 → h. 全量测试（双轨+mocha+panel）→
   i. tag v1.0.0（拍板③）→ j. 发布动作（拍板②⑤）。
4. **回滚预案**：a-f 任一步失败=`git reset --hard archive/pre-clean-<date>`+强推 main
   （远端备份分支 `backup/main-pre-clean` 先行推送——回滚双保险）；g-i 失败=结构保留
   回 b 前态。**所有强推/删除动作执行相逐项拍板**。

## 三、执行排序提案（供判定日前拍板——与既有定谳零冲突核对）
```
10-18 LBD-2 判定（HOLD/GO）
  ├─ GO → 变更窗口开启：
  │    1. G5 生产部署（graphd systemd 重启——CHANGELOG 窗口内）
  │    2. WRAP-4b 结构相（§二序列 a-f，纯仓库操作零外向）
  │    3. WRAP-4b 发布相（§二序列 g-j，外向动作逐项拍板②③⑤）
  │    4. 阶段九收官（tag+Release+双通道）
  └─ HOLD → 观察期延段（+2 周），结构相可并行（零引擎耦合——蓝图纯摆放）
跨判定独立项（可先行）：XR-G8 EXTRACT 原语拍板、held=9 人工验收复核、
冷读余项（A 组/B 组非 docs 面）、远端 38 分支卫生批（=§二.2 拍板⑥提前执行亦可）
```
**零冲突自查**：排序未动任何既有定谳——LBD-2 判定仍是结构/发布的门闩（拍板原文
"G5 并入 10-18 判定通过后的变更窗口"）；XR-G8/held 复核与观察期解耦（拍板边界授权）。
冲突点登记：无。

## 四、依赖与风险
- OIDC/发布全部依赖仓库公开（阶段九前置脱敏是硬门）。
- 目录重组触 CI 路径（ci.yml/dsh-compat 的 npm cd 路径）——执行相 g 步专门适配+全量
  回归（本批评估：三 workflow 路径均为 `plugin/pentest-dsh`/`plugin/d2d-panel` 相对路径，
  蓝图 §一保留该布局=CI 零改动；若执行相调整布局需同步 yml）。
- 611 commits 全史=旧仓资产；新仓若重建史（squash）则 decision-archive 是唯一记忆载体
  ——**拍板点⑦：新仓保留全史（推荐：archive tag+继续同仓）vs 重建史（clean-start）**。

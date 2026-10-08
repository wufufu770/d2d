# 发布决议书（WRAP-4b 发布相 · 授权锚）

> **性质**：本文件=序列 g-j（脱敏→tag→发布→披露）全部外向动作的授权锚与审计链载体。
> **授权令**：用户 2026-10-09 午后原文"你来拍板做"——拍板点①-⑤由监督层代拍，本批执行
> 到底（发布即公开），三硬停线除外（见 §四）。
> **代拍声明**：以下每项决定标注 [代拍]，依据=授权令+WRAP-4a 发布机制清单
> （docs/wrap4-execution-plan.md §一）既有选项空间内取值，未超清单边界。

## 一、拍板点决定全文

### 拍板①（脱敏范围）[代拍]
**决定**：对外件全脱敏——范围=（a）A/B 报告（experiments/results/ab-report-20260928-190531.md，
in-place 清洗）；（b）npm 包内公开面（pack 白名单 118 文件）；（c）release notes；（d）Release
资产三格式样例。docs 既有实录段与 git 历史不 rewrite（历史改写超代拍权限——残留如实
登记 §六）。**理由**：外向产物（新公开面）必须干净；既有历史为不可变审计链，改写决策
归用户，且 repo 已公开状态下历史改写=强推事故面。

### 拍板②（npm 包名/OIDC/公开时机）[代拍]
**决定**：
- **包名**：候选链取第一个可用名 `pentest-dsh`（N-0④ 官方 registry 404 实证可用；与
  plugin/pentest-dsh/package.json 既有 name 一致=零改动发布）。候选链后位（未动用）：
  @wufufu770/pentest-dsh / d2d-pentest / dsh-pentest（d2d 被 npm 0.0.1 占用）。
- **发布通道**：OIDC Trusted Publishing 走 CI（零本地 token——红线：本地 npm token 零创建；
  npmrc 现态无 authToken 实证）。工具链版本面：npm 11.16.0≥11.5.1 ✓ / Node 24.19.0≥22.14 ✓。
- **版本**：0.2.0 → **1.0.0**（与拍板③ v1.0.0 对齐；首个公开发布）。
- **公开时机**：本批族 4（tag push 触发 CI 发布）——仓库已公开（N-0⑥ 实证 visibility=PUBLIC），
  发布即公开成立。

### 拍板③（v1.0.0 打点）[代拍]
**决定**：CHANGELOG [Unreleased]→[1.0.0]（Keep a Changelog 格式，蓝图 §三骨架落地）+
annotated tag `v1.0.0`。**打点时机**=发布相族 3（全量回归绿之后、外向发布之前）。
远端既有 tags 核查：v1.0.0-clean/v1.1.0 在（历史回滚点保留不动），`v1.0.0` 本身空闲无冲突。

### 拍板④（三格式字段映射）[代拍]
**决定**：三格式=补天/漏洞盒子/教育 SRC 三平台报告模板。字段映射确认=
plugin/pentest-dsh/report.mjs 既有 src-JSON 四件套（vuln_type/title/severity/rank/
description/reproduce/assets/cvss）到三平台的字段名映射+脱敏处置（每字段 保留/剥离/删除
+理由），映射表落 §附录 C，三平台脱敏样例落 docs/report-templates/。**泄露面机械验证
=验收面**：脱敏后产物 grep 泄露清单必须零命中（清单见附录 C 尾）。

### 拍板⑤（披露渠道）[代拍]
**决定**：维持 SECURITY.md 现态——GitHub 私密披露（Security Advisories）为唯一通道
（72h 确认+7 天评估 SLA 在档）。**不新增邮箱**（零暴露面原则——公开 repo 上的邮箱地址
=spam/鱼叉攻击面；GitHub 原生通道已满足"可披露性"）。Release notes 引用该通道。

## 二、执行序列（族 1-5）
族 1 本决议书落库（授权锚先行）→ 族 2 脱敏执行+机械验证 → 族 3 CHANGELOG 定稿+
package 1.0.0+release workflow+docs 收口+全量回归 → 族 4 tag+push+npm 发布（OIDC）+
Release 双通道 → 族 5 终态对账+manifest fold。npm publish / Release publish / repo 转公开
三动作主 agent 逐步亲证（先例 11 白名单内自主派发）。

## 三、72h 召回窗条款
**起算**：族 4 全部外向动作（npm publish 成功+GitHub Release publish+可见性确认）完成
时刻（UTC 精确到分，回报节点名）。**窗内**：任一停线条件（§四）或用户指令可触发召回
——召回动作=npm unpublish（72h 内 npm 政策允许）+Release 转 draft/删除+repo 转回
private。**窗外**：视为发布定谳（后续变更走常规版本迭代）。

## 四、三硬停线（授权令原文）
1. 全史密扫任何真实凭据命中（任何待公开 ref）→ 停批回报（历史改写决策归用户——超代拍
   权限）。
2. npm 包名全链冲突 → 停下回报候选清单。
3. OIDC Trusted Publishing 不可用 → 停下回报（无 token 纪律优先——不硬凑、不落本地 token）。
其余止损：发布后 CI 红/npm 装包失败→停下回报+召回窗评估；测试基线下跌/CI 连续 3 轮红/
网络连续 8 次中断/Mimosa 无法按口径处理→停下回报。

## 五、绝不碰清单（本批红线）
既有全部条目+：本地 npm token 零创建 / kuzu 回滚资产 / backup refs（祖先性验证后保留）/
生产运行面 / 密钥面 / egress 门禁。

## 附录 A：密扫硬门报告（N-0② · 族 1 留档）
- **工具**：gitleaks 8.24.3（静态二进制，默认规则集）。
- **覆盖面**：本地 refs 全集（⊃远端公开面）——4 heads（main/backup/main-pre-clean-20261008/
  mods/improve）+13 tags（archive/*2、control-v1~v3、honest-baseline、pre-team-arch、
  t3-2-stage6、t3-3-stage65、t4-3-stage8、v0.3.0、v1.0.0-clean、v1.1.0）+33 pull refs
  （fetch +refs/pull/*/head 后扫描）——`--log-opts="--all"` 全史扫描。
- **量**：765 commits / ~11.63 MB / 10.1s。
- **原始命中**：24 条（generic-api-key 11 / jwt 6 / curl-auth-user 3 / curl-auth-header 3 /
  private-key 1）。
- **人工逐条复核定性**（规则集复核）：
  - **20 条=构造假值**（测试夹具/技术卡样例/验收文档样例）：值形态自证——`testkey…12345678`
    序列（js-scanner/burp-tools 测试）、`sk-test…12345678`（panel PROVIDER_API_KEY 测试值）、
    `sk-abc…LEAK`（handoff.md 泄露示例占位符——文档在讲"如何写泄露报告"）、`-----BEGIN`
    假私钥（scanner 测试输入）、技术卡 curl `-u admin` 演示、graphd gates 测试断言样例、
    golden-targets 验收文档样例 JWT/header。
  - **4 条=过期本地靶场会话残留**（cookies.txt/quickship.txt，8 月末历史 commit）：cookie
    jar domain=**127.0.0.1**（回环），cookie=靶场 access_token（commit 语境=crAPI/AspGoat
    本地靶件迭代，2026-08-27 战报可溯）；exp=1787771711（签发期 2026-08-末，**已过期 40+ 天**）；
    **史内修复闭环**：同日 commit f3ad6bb6 落地 .gitignore+pre-commit 凭证 hook，
    614874f untrack 两文件（现态不在跟踪）。
- **净结论**：真实可用凭据命中=**0**——不触发硬停线 1。残留面=上述夹具假值与过期靶场
  会话（历史不可 rewrite，见拍板①），本表即留档。
- 复核定性记录时间：2026-10-09（族 1）。

## 附录 B：祖先性验证（N-0③）
- `backup/main-pre-clean-20261008` → main：祖先 ✓（零独有对象，公开无害）
- tag `archive/pre-clean-20261008` → main：祖先 ✓（同上）
- tag `archive/improve-issues-74-66-86` → main：祖先 ✓
- `mods`（6 独有 commits）/`improve/burp-oob-jwt-cred-matrix`（3 独有 commits）：非祖先
  =**保留决策的预期形态**（研究资产/清单外新发现——结构相拍板保留），不在 backup/archive
  硬停线条款范围；两者纳入密扫覆盖面（附录 A）✓。

## 附录 C：脱敏字段映射表（拍板④ · 族 2 执行判据）
| 字段类 | 处置 | 理由 |
|---|---|---|
| engagement ID（`eng-MMDD-HHMM-*` 12 模式） | **剥离**→形式化（A 组/B 组/"本地靶场实证 engagement"） | 泄露清单列名；虽全为本地靶场 ID（127=回环靶、demo/spark=内部代号，无真实目标信息），机械执行剥离保证可验证性 |
| `/home/kali` 用户路径 | **剥离**→`~/` 或 `<DATA_DIR>` | 用户名泄露（清单列名） |
| 真实目标域 | **剥离**（全仓扫描零命中实证——词表/测试夹具的 weibo.cn/qq.com 为公开域名测试值，不在对外件） | 红线 |
| graphd `127.0.0.1:8766` | **保留** | 回环语义+默认服务端口=代码公开常量，非信息泄露 |
| DVWA/crAPI/AspGoat 靶场标识 | **保留** | 公开教育靶件（OWASP 族），授权演示面=框架合规姿态组成部分；抹除破坏证据链可复核性 |
| 指标/token 数/Finding 数/框架版本代号 | **保留** | 报告核心数据资产 |
| secret/JWT 值 | **N/A**（对外件零 secret——附录 A 净命中 0；report.mjs 出口自带 redactText 清洗链） | — |
| roles/.mimosa/hook-state 运行时残留 | **删除**（untrack+rm+gitignore） | 非发布资产（空状态文件，无敏感值，但不入包） |

**泄露面机械验证清单**（脱敏产物 grep 必须零命中）：`/home/kali`、`eng-[0-9]{4}-[0-9]{4}-`。
验证对象=（a）ab-report 脱敏版（b）npm pack 产物全文件（c）三格式样例（d）release notes。
（127.0.0.1/DVWA/8766 为保留级字段，不在验证清单。）

## 附录 D：密扫覆盖面与保留 refs 清单一致性（拍板⑥前置）
待公开 refs=远端全集：4 heads+13 tags+34 pull refs（GitHub 自动保留）——密扫覆盖
（本地 fetch 后 --all 扫描含 33 条 pull refs；ls-remote 34 条中 1 条与既有对象同 commit
去重，扫描对象集等价）。公开后可见 refs 与扫描覆盖面一致 ✓。

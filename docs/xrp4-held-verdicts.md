# XR-P4b held=9 逐条人工裁决表（XR-G3 族 2 · 2026-10-07）

> 裁决者：宿主主 agent（operator=host-main-agent）。裁决原则（拍板 3）：按证据判真伪，
> 不按"DVWA 已知有洞"橡皮图章——每条核对 target 形态/observed 特征/HTTP 交互相/工件内部
> 一致性；抽验 2 条经 DVWA 实际复现（curl 登录+精确 payload 重放）。
> **通道缺口定谳（N-0 #4 考古）**：A 级入图唯一通道=verifyRunner pass（reflow.mjs A 级必经
> 分支"manual/fail 不入图"编排位固化）；/write/adjudicate 接受域=gate_status verified-only
> +dual_sign disputed 两分支——不覆盖未入图 held 态（无节点可裁）。**held 裁决结论无合法
> 入图写面**（拍板 3 边界：docs 留档+缺口登记，不新建写面）。本表即裁决留档。

| # | 发现（severity） | verdict | 理由与证据引用 | 核验形态 |
|---|------------------|---------|----------------|----------|
| F-1 | UNION 注入取 users 表（critical） | **true** | target=…/sqli/（DVWA SQLi 模块）；observed=五用户 admin/gordonb/1337/pablo/smithy+MD5 hash——与 DVWA users 表公认种子数据逐名一致；步骤含 baseline 对照（id=1 正常行→payload 行） | 纸面盘点 |
| F-2 | 布尔+时间盲注（critical） | **true** | observed=布尔 oracle（'1'='1 exists / '1'='2 absent）+SLEEP(3) 实测 3145ms vs 126ms baseline——时间差 25×超出网络抖动解释域；payload 语法与 MySQL 子串提取一致 | 纸面盘点 |
| F-3 | OS 命令注入 www-data（critical） | **true** | observed=ping 127.0.0.1 后接 uid=33(www-data) gid=33(www-data)——uid 33=Debian apache 用户公认事实，DVWA 容器 debian 基底一致；`;id` 拼接形态与 DVWA exec 模块实现（shell_exec）一致 | 纸面盘点 |
| F-4 | 反射 XSS（high） | **true** | observed="Hello \<script\>alert(1)\</script\>" 原样渲染——**DVWA 实际复现 ✓**（curl 登录+精确 payload 重放，响应含该特征原文） | **实证抽验 ✓** |
| F-5 | 存储 XSS（high） | **true** | observed=guestbook 渲染原始 script 标签+每次页面加载重现——DVWA xss_s 模块 low 级无编码行为公认；步骤含写入+读回两段闭环 | 纸面盘点 |
| F-6 | LFI 任意文件读（high） | **true** | observed=root:x:0:0:root:/root:/bin/bash 渲染为文本——**DVWA 实际复现 ✓**（curl 登录+…/fi/?page=../../../../../etc/passwd 重放，响应含 root:x:0:0） | **实证抽验 ✓** |
| F-7 | 文件上传 webshell（critical） | **true** | observed=shell.php 上传成功+?c=id 执行返回 uid=33——步骤含上传响应特征（succesfully uploaded）+执行响应两段；与 DVWA upload 模块（无扩展名白名单）+hackable/uploads 可执行公认行为一致 | 纸面盘点 |
| F-8 | CSRF 密码改（medium） | **true** | observed=单 GET（password_new/password_conf/Change）即改密"Password Changed."——与 DVWA csrf 模块 low 级（无 token 无 POST 限制）一致；步骤 3 含还原操作（password 改回）=负责任披露形态 | 纸面盘点 |
| F-9 | 弱会话 ID（medium） | **true** | observed=dvwaSession=1,2,3,4,5 单调递增——DVWA weak_id 模块公认行为；五次采样捕获具体值=可复核证据 | 纸面盘点 |

**裁决汇总**：9/9 true（0 假阳性——无 rejected 样本；verify 链负例样本由第三跑 fail 形态
承接）。证据完备性：9/9 target 形态合规（http://127.0.0.1）+observed 特征具体可复核；
2/9 实证抽验（F-4/F-6 精确 payload 重放特征原文命中）。

## 通道缺口登记（XR-G5 候选开放项）
held 态（verify manual/fail）的人工裁决结论**无系统内入图写面**：adjudicate 接受域不含
未入图工件；/write/finding 是 worker 写面（host 也可写但语义=未验证新发现，非裁决结论）。
修复方向（归用户排批）：adjudicate 扩 kind=repro-artifact（以 runId+finding-id 引用
workspace 工件入图）或 held 复审通道（裁决结论随下轮 reflow 合流）。本批不新建写面
（拍板 3 边界）。

## 通道缺口闭合与全清（held-admit-8 · 2026-10-09）
上节登记的缺口已由 **XR-G4 G5** 闭合：adjudicate 扩 kind=held-finding（admit=入图起点态
candidate，FIX-1 同构 host-only+operator 审计三面；dismiss=否决零图写）。**TRANS-1**
以 F-4 生产首录（id=`xring-run-xrp4b-10071527-f-4`）。本批（held-admit-8）将其余 8 条
（F-1/F-2/F-3/F-5/F-6/F-7/F-8/F-9）逐条 admit 收口：provenance 绑本表
（`run-xrp4b-10071527 F-<n> | docs/xrp4-held-verdicts.md | held-admit-8 批量收口`），
载荷 title/severity/observed 取自第二跑 workspace 工件 repro_paths.json，repro 首行
鉴权档位（G6 形态），逐条过 finding_gates/repro_gate/config_reject/auth_tier_gate 四门。
**终态：held 管道全清**——9/9 true 全部落图 candidate（findings 779→787），逐条图内核验
（gate_status/severity/eng 三字段）+审计三面（audit.log/transition-log.jsonl/Finding 本体）
全过；四源对账（总数 787+分布求和 787+第二跑节点 9 条+迁移账 9 条=F-4+8）。reject 样本 0
（裁决表 9/9 true；verify 链负例样本由第三跑 fail 形态承接）。

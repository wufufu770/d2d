# E34 次级债项台账（P2/P3——不阻塞部署）

性质：E34-r0 打包登记。首四项（契约归一化/双轨对账/红线前置/种子对照）已 P0 清偿入档（`plugin/pentest-dsh/test/reflow-normalize.test.mjs`+`scripts/xring/normalize.mjs`+`docs/heasec-admission.md` §4），本台账只记 P2/P3。

| # | 债项 | 级 | 状态/去向 | 依据 |
|---|------|----|-----------|------|
| 1 | ECC 校准执行（统一 404 页抵扣——四批同形态证据链已足） | P2 | 转 E26 正式校准流程（`docs/ecc-form-ledger.md` 对账表挂账）；本批零判读器改动 | E33 四批 suspicious/suspicious 双记一致+scorecard 汇总 |
| 2 | XSS 平台否决口径诊断（r2 槽 1 product-edit/product-add 两端点被平台判"参数不正确"） | P2 | 答案侧单靶诊断（需主会话答案侧对卷）；已登记 r2 报告 §7 | r2 decision-log 提交失败记录 |
| 3 | TRANSPORT 工具级自愈（adapter 层重连） | P2 | **wrapper 级已实证可用**（r2 链级自愈：槽死→下一槽 handoff 重启）——标注"部署可用形态"；adapter 级工具化挂账后续批 | `docs/ops-stop-playbook.md` 形态 B |
| 4 | M3.1 影子对照（同任务双模型跑） | P2 | 生产节奏内排（部署后首战顺带）；E33 batch4 三连 TRANSPORT 死=机制面全过证据缺 | E33-r6 落槌记录 |
| 5 | 1.5.2 发版+E33/E35 实战背书 | P3 | 发版批另批（内容清单已足：429 退避 1.4.0→归一化闸+对账旗标+night-chain 组件） | 本批 devlog |
| 6 | 漏报对卷（85 靶埋点清单 vs 四批发现面查全率） | P2 | 主会话答案侧对卷（机器侧不预设） | E33 scorecard 漏报面节 |
| 7 | #2 判据二选一（修判据 vs 部分达标披露） | P2 | 主会话裁决挂起项（准入已解耦——短板并列披露形态不阻部署） | `docs/heasec-admission.md` §1 |

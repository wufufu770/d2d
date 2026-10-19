# ECC 判级-形态对账表（Phase 4 · E21 固化——随场验轮次滚动追加）

> 判级序列与真实形态强度对账——阈值校准的依据表。判级=ecc.assess 输出；形态强度=
> 指纹域（全量 tarpit 域/部分封锁域/正常异构）+路径 401 层占比的操作者事后定性。

| # | 轮次 | 判级 | 信号 kinds | 形态强度（事后定性） | 指纹域 | 对账结论 |
|---|------|------|-----------|---------------------|--------|---------|
| 1 | E17-r1 (10170314) | likely | homogeneous-response | 全量 tarpit（5/5 同指纹） | de3707ebbd69 域 | 判级与形态一致 ✓ |
| 2 | E17-r2 (10170323) | likely | homogeneous-response | 全量 tarpit 持续 | 同上（5/5 同） | 稳定形态不误报漂移 ✓ |
| 3 | E20-r1 (10170733) | suspicious | homogeneous-response | 部分封锁（3/5 同+2 路 401 层） | ee450095f726 域 | 弱形态=降级判级 ✓（梯度语义生效） |

> **E25 考古修正注（#3 定性回溯修正）**：E20-r1 指纹与 E22 真实恢复态**逐字节同构**
> （SPA 200 398B ee450095f726+API 401 64B 7d44a2950cc7——E22 时操作者确证 401 层为真
> auth 层）。#3 原"部分封锁"定性系当时语境偏见（E17 tarpit 后默认怀疑），修正为
> **真实面**。连带两处：①E20-r1→r2 转变定性升级为"真实面 13min 内被打回 tarpit"（行
> 为驱动证据增强）；②#3 判级 suspicious 对真实面=**假阳第二例**（先于 #5）——假阳非
> 随机，与 #5 同为"SPA fallback+auth 层"形态触发的**系统性盲区**（homogeneous 信号在
> SPA 入口形态上的固有假阳倾向）。校准叙事更新：假阳率 2/5（#3/#5），同型；"API 面
> 401 抵扣 homogeneous 置信"校准候选（E22 追记）获得第二个支持样本。
| 4 | E20-r2 (10170746) | likely | homogeneous-response+fingerprint-drift | 形态真变（部分→全量，5/5 漂移） | 域间切换 | **跨轮漂移检出现场命中** ✓ |
| 5 | E22-r1 (10171337) | likely | homogeneous-response(low 3/5)+fingerprint-drift(high 5/5) | **服务真恢复**（SPA 398B ee450095f726 域+API 401 64B 真 auth 层=正常异构域） | ee450095f726 域（正常） | **首假阳**：SPA 路由 fallback 的同指纹（3/5 路径返同一 index.html）触发 homogeneous 信号——正常形态被疑为 tarpit ✗ |
| 6 | E30-r1/r2 (10190618/0634, GSHOP 新目标) | **none / none（双记一致）** | 无信号（五路径五异构：200 html/404 JSON 反射/404 html/401 登录页/404 JSON） | 正常服务（API 面+auth 层+静态面全异构） | 新目标基线 | **校准后双记首点**：正常形态下 raw/cal 同判 none——校准规则零干扰（无 401 抵扣场景的基线行为实证）；校准不产生新假阳 ✓ |

## 阈值结论（E21 时点）

四点判级-形态**全对账**（无假阳/无漏检）——梯度语义（信号数+置信→none/suspicious/likely）
与形态强度相关。**阈值维持不校准**（场验批 3 后再议；对账表 <10 点不做统计结论）。

## E26 校准实施（401-JSON 在场性抵扣——双记过渡）

**校准内容**（scripts/xring/ecc.mjs——判级逻辑面，探针/采集语义零改动）：①单轮信号：best
组为 200-html 页面形态且组外存在 401-JSON 异指纹路径 → homogeneous 置信降一档（low 档移
除，detail 留痕）；②汇诊复合：当前探针含 401-JSON auth 层时 drift 信号置信降一档（drift
在"恢复向切换"上同型假阳——tarpit 基线→真实面=5/5 全变，E22 实录）。

**历史数据双记**（原判级不改写）：

| # | 原判级（历史） | 校准后判级（E26 回测） | 回测结果 |
|---|---------------|----------------------|---------|
| 1 | likely（真 tarpit） | likely（组外空不触发） | 不误伤真阳 ✓ |
| 2 | likely（真 tarpit） | likely | 不误伤 ✓ |
| 3 | suspicious（原定性部分封锁→E25 修正真实面） | **none**（全信号抵扣） | 假阳翻正 ✓ |
| 4 | likely（真 tarpit） | likely | 不误伤 ✓ |
| 5 | likely（真实面假阳） | **suspicious**（homogeneous 移除+drift 复合降档） | 假阳翻正 ✓ |
| 6 | （E24 失联未判级） | — | — |

**测试背书**：plugin/pentest-dsh/test/ecc-calibration.test.mjs 六例（#5/#3 回测翻正/抵扣
中间档留痕/真 tarpit 不回退/缺省零变化（合成 probes 无 content_type）/边界两形态）；全量
mocha 2208+6=2214。**新数据双记过渡**：场验批 5 起判级双记（原口径+校准口径）直至对账表
≥10 点再议单一口径。

## E22 追记（第五点=首假阳——校准候选缘起，E26 已实施）

第五点暴露 homogeneous-response 信号的语义盲区：**SPA 入口 fallback**（所有非静态路径
返同一 index.html）与 **tarpit**（所有路径返同一诱饵页）在"多路径同指纹"特征上同形。
区分特征=tarpit 域通常伴随 status 恒 200+content-type 恒 html+跨 API 面 401 消失；
正常 SPA 域 API 面保持 401 真 auth 层。校准候选（不实施，池议）：探针路径组含 API 面
时，API 面指纹=正常 auth 错误形态（401+JSON）应抵扣 homogeneous 置信。代价侧：ECC
为 advisory 非硬闸，假阳代价=worker 对上轮结论降档使用（保守方向），可承受——这正
是 advisory 定位的价值实证：假阳不阻断，漏检才致命。**阈值维持不校准**（1/5 假阳率，
样本不足；advisory 语义下保守侧假阳可接受）。

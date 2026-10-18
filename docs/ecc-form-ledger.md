# ECC 判级-形态对账表（Phase 4 · E21 固化——随场验轮次滚动追加）

> 判级序列与真实形态强度对账——阈值校准的依据表。判级=ecc.assess 输出；形态强度=
> 指纹域（全量 tarpit 域/部分封锁域/正常异构）+路径 401 层占比的操作者事后定性。

| # | 轮次 | 判级 | 信号 kinds | 形态强度（事后定性） | 指纹域 | 对账结论 |
|---|------|------|-----------|---------------------|--------|---------|
| 1 | E17-r1 (10170314) | likely | homogeneous-response | 全量 tarpit（5/5 同指纹） | de3707ebbd69 域 | 判级与形态一致 ✓ |
| 2 | E17-r2 (10170323) | likely | homogeneous-response | 全量 tarpit 持续 | 同上（5/5 同） | 稳定形态不误报漂移 ✓ |
| 3 | E20-r1 (10170733) | suspicious | homogeneous-response | 部分封锁（3/5 同+2 路 401 层） | ee450095f726 域 | 弱形态=降级判级 ✓（梯度语义生效） |
| 4 | E20-r2 (10170746) | likely | homogeneous-response+fingerprint-drift | 形态真变（部分→全量，5/5 漂移） | 域间切换 | **跨轮漂移检出现场命中** ✓ |
| 5 | E22-r1 (10171337) | likely | homogeneous-response(low 3/5)+fingerprint-drift(high 5/5) | **服务真恢复**（SPA 398B ee450095f726 域+API 401 64B 真 auth 层=正常异构域） | ee450095f726 域（正常） | **首假阳**：SPA 路由 fallback 的同指纹（3/5 路径返同一 index.html）触发 homogeneous 信号——正常形态被疑为 tarpit ✗ |

## 阈值结论（E21 时点）

四点判级-形态**全对账**（无假阳/无漏检）——梯度语义（信号数+置信→none/suspicious/likely）
与形态强度相关。**阈值维持不校准**（场验批 3 后再议；对账表 <10 点不做统计结论）。

## E22 追记（第五点=首假阳——校准候选登记）

第五点暴露 homogeneous-response 信号的语义盲区：**SPA 入口 fallback**（所有非静态路径
返同一 index.html）与 **tarpit**（所有路径返同一诱饵页）在"多路径同指纹"特征上同形。
区分特征=tarpit 域通常伴随 status 恒 200+content-type 恒 html+跨 API 面 401 消失；
正常 SPA 域 API 面保持 401 真 auth 层。校准候选（不实施，池议）：探针路径组含 API 面
时，API 面指纹=正常 auth 错误形态（401+JSON）应抵扣 homogeneous 置信。代价侧：ECC
为 advisory 非硬闸，假阳代价=worker 对上轮结论降档使用（保守方向），可承受——这正
是 advisory 定位的价值实证：假阳不阻断，漏检才致命。**阈值维持不校准**（1/5 假阳率，
样本不足；advisory 语义下保守侧假阳可接受）。

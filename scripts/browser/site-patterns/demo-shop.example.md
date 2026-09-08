# demo-shop.example — 示例站点经验(占位域名, 格式示范)

## 业务链
- 下单流程: 购物车 → 订单确认 → 支付(聚合) → 回调，金额字段在订单创建请求体（card:payment-logic-flaws 首选）

## 接口习惯
- 优惠券核销端点 /api/coupon/redeem 无幂等键（竞态测试首选 card:race-condition）

## 已知坑
- 支付回调签名只校验 presence 不校验数值（历史观察，需复核 card:order-flow-bypass）

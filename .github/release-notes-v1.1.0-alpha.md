# d2d v1.1.0-alpha — 实弹反馈改进批（预发布）

`pentest-dsh@1.1.0-alpha`（npm dist-tag=**alpha**；`latest` 保持 1.0.1 不动直至实弹验收转正）。
**性质**：两轮实弹（r2b/r2b2）反馈的工程化落地——探测→判定→机械验证闭环的六项改进+DSH 0.2.0 兼容前置。
完整变更见 [CHANGELOG](https://github.com/wufufu770/d2d/blob/main/CHANGELOG.md)（[1.1.0-alpha] 节）；设计契约见 [docs/design-1.1.0.md](https://github.com/wufufu770/d2d/blob/main/docs/design-1.1.0.md)。

## 六项
| 项 | 一句话 |
|---|---|
| #1 TLS 分层 | repro `env.tls` insecure/ca——https 自签靶场机械验证恢复 |
| #2 AUTH 原语 | 登录→token 会话链；凭据实体文件间接引用；失败转 manual 不降级 |
| #3 目标参数化 | first-run 五参数；换目标零手写编排 |
| #4 条目级容错 | 单条 schema 失败不再拖死整文件 |
| #5 端点白名单 | 宿主登记三元组+变量展开匹配——合法循环不再被字面检测误拦 |
| #7 ID 对账闸 | 编号漂移整场拒落+差集报告 |
| +DSH 兼容 | 0.2.0-rc.2 会话 v4 代候选前插（零 blocking 并入） |

## 安全与合规
- 授权测试专用；凭据纪律全链（任务书/repro/handoff 零明文凭据，token 零落盘零回显）。
- 发布经 npm OIDC Trusted Publishing（零长期 token），provenance 自动附；**本版 dist-tag=alpha，latest=1.0.1 不变**。

_由 d2d 发布流水线自动生成；零人工编辑。_

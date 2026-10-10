# d2d v1.0.1 — 安全卫生补丁

`pentest-dsh@1.0.1`（npm: https://www.npmjs.com/package/pentest-dsh ）。**零功能变更**——
本版本为发布后召回窗内的脱敏补扫落地（SWEEP-1），变更面=注释/文档级字符串与发布卫生，
代码行为与 1.0.0 逐字节等价（除版本号）。

完整变更见 [CHANGELOG](https://github.com/wufufu770/d2d/blob/main/CHANGELOG.md)（[1.0.1] 节）。

## 变更摘要（对外口径）
- **脱敏补扫**：站点情报样例出库（迁本地经验库）、engagement ID 注释级形式化、运营计数注释脱目标化。
- **scan-clean 门禁接线**：泄露面扫描命中退出码修正（exit 1）+入库面语义+`verify-main` 消费接线（目标名单走环境变量）。
- **Mimosa 运行态泛化**：机器工具链状态目录确认零公开面（gitignore+包白名单双挡）。
- **卫生**：lockfile 版本同步（1.0.0 时序遗漏）、graphd 引擎描述更新（ladybug 转正后事实）。

## 资产
| 资产 | 说明 |
|---|---|
| `sbom.cdx.json` | CycloneDX SBOM（1.0.1 依赖树，与本 tag 同步生成） |
| `butian/vulbox/edu-src.sample.json` | 报告交付三平台字段映射样例（脱敏） |
| `ab-report-20260928-190531.md` | 历史场 A/B 对比报告（脱敏版） |

## 安全与合规
- **授权测试专用**；漏洞报告走 [SECURITY.md](https://github.com/wufufu770/d2d/blob/main/SECURITY.md) 的 GitHub 私密披露通道。
- 发布经 npm OIDC Trusted Publishing（零长期 token），provenance 自动附——`npm audit signatures` 可验。

_由 d2d 发布流水线自动生成；零人工编辑。_

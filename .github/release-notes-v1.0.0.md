# d2d v1.0.0 — 首个公开发布

三环并行自主渗透测试框架的 v1.0.0（npm: [`pentest-dsh`](https://www.npmjs.com/package/pentest-dsh)）。

完整变更清单见 [CHANGELOG](https://github.com/wufufu770/d2d/blob/main/CHANGELOG.md)（[1.0.0] 节）；
架构与决策定谳链见 [docs/decision-archive.md](https://github.com/wufufu770/d2d/blob/main/docs/decision-archive.md)；
发布授权链与拍板决议见 [docs/release-decisions.md](https://github.com/wufufu770/d2d/blob/main/docs/release-decisions.md)。

## 资产
| 资产 | 说明 |
|---|---|
| `sbom.cdx.json` | CycloneDX SBOM（npm 运行时依赖树，含 pinned @deepseek-ai/dsh-* 六包） |
| `butian.sample.json` / `vulbox.sample.json` / `edu-src.sample.json` | 报告交付三平台字段映射样例（拍板④；数据=A/B 对比报告 verified 条目，已脱敏） |
| `ab-report-20260928-190531.md` | 历史场 A/B 对比报告（脱敏版——engagement ID 形式化/用户路径泛化；机械验证 grep 泄露清单零命中） |

## 安全与合规
- **授权测试专用**：仅用于已获明确书面授权的场景（自有资产/授权靶场）；使用者对授权合规负全责。
- 漏洞报告：请走 [SECURITY.md](https://github.com/wufufu770/d2d/blob/main/SECURITY.md) 的 GitHub 私密披露通道（勿公开 Issue）。
- 本包发布经 npm OIDC Trusted Publishing（零长期 token），provenance 自动附——`npm audit signatures` 可验。

_由 d2d 发布流水线自动生成；零人工编辑。_

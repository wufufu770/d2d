# 报告模板三格式（补天 / 漏洞盒子 / 教育 SRC）——字段映射与脱敏样例

> 拍板④（WRAP-4b 发布相 · docs/release-decisions.md 附录 C）落地件。
> 源结构=plugin/pentest-dsh/report.mjs 的 src-JSON 四件套（E4）：
> `{vuln_type, title, severity, rank, description, reproduce, assets, cvss}`。
> 样例数据=A/B 对比报告 A 组 verified 条目（已按附录 C 映射表脱敏：
> engagement ID 形式化、用户路径泛化；DVWA/127.0.0.1 为保留级字段）。
> 出口脱敏链：report.mjs 对 markdown 整体 redactText + src-JSON 逐字段 redactText
> （3E-3），本样例与之同口径。

## 字段映射表（src-JSON → 三平台）

| src-JSON | 补天（butian） | 漏洞盒子（vulbox） | 教育 SRC（edu-src） | 脱敏处置 |
|---|---|---|---|---|
| title | 漏洞名称 | vul_title | title | 保留（含靶场标识=保留级） |
| vuln_type | 漏洞类型 | vul_type | type | 保留（category 常量） |
| severity + rank | 危害等级（HIGH/MEDIUM/…） | level（同枚举） | severity | 保留 |
| description | 漏洞详情 | description | desc | 剥离级字段过 redactText；engagement/用户路径不出现 |
| reproduce | 复现步骤 | reproduce | steps | 同上 |
| assets | 网站（资产） | asset | asset | 保留（授权靶场声明形态） |
| cvss | 评分（可空） | cvss | —（省略） | 保留 |
| （无源字段） | — | — | fix（加固建议） | 教育 SRC 特有：从 config_advisory 类产出 |

## 通用脱敏纪律（三平台一致）
1. 资产字段只写授权面声明（"授权靶场应用（DVWA，本地部署）"），不写真实第三方目标。
2. engagement ID / 操作者身份 / 本机用户路径不入任何字段。
3. 平台提交时凭据/会话证据一律经 redactText（前 4 后 4 脱敏）后才可粘贴。

## 样例文件
- `butian.sample.json` / `vulbox.sample.json` / `edu-src.sample.json`
- 数据源：experiments/results/ab-report-20260928-190531.md（A 组，2026-09-28 场次，
  engagement 已形式化为 A/B）。

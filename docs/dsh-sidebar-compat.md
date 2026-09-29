# dsh-better-sidebar ↔ dsh 版本对应表（T2-2b-0）

`dsh-better-sidebar`（裸包名，无 scope）与 dsh 宿主 CLI（`@deepseek-ai/dsh`）是两条独立的版本序列，版本必须按行成对，不得单边升级：

| DSH 版本 | sidebar 版本 | 备注 |
| --- | --- | --- |
| 0.1.1-rc.2（当前 pin） | 0.17.1 | 当前基线 |
| 0.1.5-rc.1 ~ 0.1.6-alpha.2 | 0.19.1 | 升级时同步 |
| 0.1.7-rc.1 ~ 0.1.7-rc.2 | 0.22.1 | 升级时同步 |
| 0.2.0-rc.1+ | 0.24.1 | 升级时同步 |

规则：升级 DSH 时必须同步升级 sidebar 且成对验证（install.sh 注释引用本文档）。

> 来源=dsh-better-sidebar release notes（npm dist-tags 实查 0.17.1/0.19.1/0.22.1/0.24.1 吻合，2026-09-29）。

校验入口：`node scripts/ops/verify-dsh-version.mjs` 检查④按本表内置同源区间表（`SIDEBAR_COMPAT_TABLE`）做 sidebar 成对性校验，跨区间 WARN（`--strict` 计失败）。

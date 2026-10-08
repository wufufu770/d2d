# Security Policy / 安全策略

## Supported Versions / 支持版本

| Version / 版本 | Supported / 支持 |
| ------- | ---------------- |
| main (HEAD) | ✅ |
| tagged releases | ✅（latest minor） |
| older tags / 历史标签 | ❌（archive 承载） |

## Reporting a Vulnerability / 漏洞报告

**中文**：如果你在 d2d 中发现安全漏洞，请**不要**公开提交 Issue。请通过 GitHub
[Security Advisories](https://github.com/wufufu770/d2d/security/advisories/new)
私密披露（/private 建议附：影响面分析、复现步骤、修复建议）。我们会在 72 小时内
确认、7 天内给出评估与修复计划。授权测试范围内发现的问题（对靶场/自有资产）不构成
本仓漏洞；**对框架自身安全门（鉴权/scope/审计/隔离）的绕过**属于本策略范围。

**English**: If you discover a security vulnerability in d2d, please **do not**
open a public issue. Report privately via GitHub
[Security Advisories](https://github.com/wufufu770/d2d/security/advisories/new)
(include impact analysis, reproduction steps, and suggested fix). We aim to
acknowledge within 72 hours and provide an assessment within 7 days.
Findings against authorized targets are out of scope; **bypasses of the
framework's own security gates (auth/scope/audit/isolation) are in scope**.

## Security Model / 安全模型概要

- 写面分级：worker token 仅结构化写；host-only 裁决面。
- OPSEC 门族：scope 门控（engagement 上下文 fail-closed）/危险命令铁律/host-token 读取拦截。
- 出口治理：egress-gateway 强制代理+DNS 校验+CONNECT pin+硬黑面。
- worker env 白名单：host 凭据面双层剥离。
- 审计：audit.log / transition-log / gate-log / run-log 四面 append-only。

详见 `docs/decision-archive.md`。

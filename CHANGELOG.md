# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-09

### Added
- 三环并行自主渗透测试框架首个公开发布（发现/深度攻击/创造探索三类 agent 并行竞速+graphd 图黑板+观测面板）。
- X-Ring 受控自主测试通道：任务书契约/预算双路径熔断/verifyRunner 机械重放（证据链 pass+独立复现分层标注）/held 人工裁决回灌（adjudicate held-finding）。
- 引擎分轨定型：生产 ladybug + 测试双轨（kuzu/ladybug 全量等值书档）。
- 报告交付三平台字段映射样例（补天/漏洞盒子/教育 SRC，脱敏版，docs/report-templates/）。

### Security
- 写面分级（worker 结构化写/host-only 裁决面）+OPSEC scope 门（engagement 上下文 fail-closed）。
- worker env 白名单双层剥离（进程级 strip+spawn 级 buildWorkerEnv——host 凭据面零残留）。
- egress-gateway 出口治理（resolve once/connect validated+CONNECT 端口 pin+硬黑面）。
- 双签验证链（dual_sign 状态机+disputed 人工仲裁闭环）+审计四面 append-only。

[Unreleased]: https://github.com/wufufu770/d2d/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/wufufu770/d2d/compare/v0.3.0...v1.0.0

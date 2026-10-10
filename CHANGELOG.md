# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-10-09

### Security
- 召回窗内脱敏补扫落地（SWEEP-1）：站点情报样例出库（迁本地经验库 `D2D_SITE_PATTERNS` 路径）、engagement ID 注释级形式化（7 处注释/文档；测试夹具与运行时字面量按豁免表保留）、运营计数注释脱目标化。
- scan-clean 门禁接线：泄露面扫描命中退出码修正（exit 1）+入库面（git 跟踪文件）语义+规则精修；`verify-main` 消费接线（目标名单走环境变量，不入代码/CI）。
- Mimosa 运行态确认零公开面（gitignore+包白名单双挡，豁免表登记）。

### Fixed
- lockfile 版本与 package.json 同步（1.0.0 发布时序遗漏）。
- graphd 引擎描述更新（ladybug 转正后事实）。

**零功能变更**：代码行为与 1.0.0 逐字节等价（除版本号与注释/文档字符串）。

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

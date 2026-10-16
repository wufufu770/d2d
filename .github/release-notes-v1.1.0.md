# d2d v1.1.0 — 1.1.0-alpha 转正版

pentest-dsh 1.1.0：X-Ring 受控自主测试通道的验证机器正式版（alpha 转正，latest 移动至本版；alpha dist-tag 保留指 1.1.0-alpha）。

## 六项实弹反馈改进（承 1.1.0-alpha）
- **verify-runner TLS 分层**：repro `env.tls`（insecure/ca 双模式，零全局 env 污染）——https 自签靶场机械验证恢复。
- **verify-runner AUTH 原语**：`AUTH <loginPath> <credRef> <tokenExtract>` 登录→token 会话链；凭据实体间接引用，token 进程内存态。
- **first-run 目标参数化**：`--target/--scope/--task-file/--record-root/--max-hours`，换目标零编排复制。
- **reflow 条目级容错**：单条 schema 失败不拖死整文件（截断+partial 标记）。
- **scope gate 端点白名单**：allowed_endpoints 三元组+循环变量展开+前缀匹配；黑名单取严。
- **回流 ID 对账闸**：handoff/repro_paths/图内三集合一致性+漂移拒落+孤儿差集审计。
- **DSH 0.2.0-rc.2 兼容**：会话文件候选表前插 v4 代（0.1.x 零行为变化）。

## 转正批增量
- **repro schema `findings[].env` 载体补全**：design#1 契约的新增可选字段落 schema——env.tls 发现可带 TLS 模式入回流管道（离线合成 e2e 闭环实证：AUTH 合成链→受保护资源→A 级直写入图）。
- **入口守卫（E11b）**：GRAPHD 值启动校验（fail-closed）+brainDir 归一守卫。
- **测试卫生（E13）**：mocha 挂死根修（真子进程收割），CI 摘除 `--exit`。
- **探针卫生（E14-B）**：凭据探针外置 `P2P_SCAN_NEEDLE`（真值字面量出库）+检查 rc 语义修复。

## 验收线诚实口径
换目标冷启动 **1m37s**（线 15min）✓；零 /tmp 手写编排 ✓；**A 级机械验证率线悬置**——第三轮靶场形态突变（tarpit 特征，A 级真漏洞零出现）使该线无现场语义，工具未被考到而非考砸。自本版起转为持续验证契约：每次实弹验证率入 devlog 台账，1.1.1 兑现定谳。

## 资产
SBOM（CycloneDX）+三平台报告字段映射样例（补天/漏洞盒子/教育 SRC，脱敏版）。

---
name: ping
description: 最小示例 skill — 对目标执行连通性探测, 验证 skill 加载器与选择器链路
version: 0.1.0
category: recon
when_to_use: 需要确认目标主机可达、验证 skills 管线时
allowed-tools: bash:ping, net:safe-url
user-invocable: true
---

# ping

最小样本 skill。正文为 markdown 指令, 加载器只解析 frontmatter, 正文原样透传。

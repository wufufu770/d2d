---
name: recon-report
description: 示例 skill — 汇总外环 recon 产出, 生成结构化侦察报告并写入 findings
version: 0.1.0
category: recon
when_to_use: 外环侦察完成后需要出报告时
allowed-tools: graphd:write, bash:report
user-invocable: true
---

# recon-report

读取本环 recon workers 的交付物, 去重后按目标分组, 写入 graphd findings。

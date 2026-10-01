---
id: skill:dvwa-upload-chain
title: "上传目录可执行链判定(webshell 落点→执行面)"
category: files
version: 1
status: quarantined
signal_affinity:
  - upload
  - webshell
  - htaccess
  - 文件上传
  - 上传
  - 执行
rings:
  - deep
evidence:
  - "tests/golden-targets/baseline.md(29 个历史 webshell 残留实测)"
  - "dvwa-reset.sh 审计实证(uploads 无 .htaccess)"
refs:
  - "OWASP WSTG Business Logic / File Upload"
created_at: 2026-10-01
---

# 触发
目标存在文件上传面(表单 file 字段/编辑器附件/头像接口)且上传目录位于 web 根可达路径
(如 /hackable/uploads/、/uploads/、/static/upload/)。黄金靶实证: DVWA uploads 目录
29 个历史 webshell 残留且无 .htaccess 执行限制。

# 步骤
1. **落点探测**: 上传最小探测文件(含唯一随机名的 .txt 与 .jpg), 从响应/目录遍历定位物理路径
   与 Web 访问路径映射关系。
2. **执行面判定**: 依次尝试 .php/.php5/.phtml/.htaccess 落点(同内容不同扩展), 每个落点后
   **访问该文件**并校验响应是否为服务端执行产物(如 `<?php echo uniqid(); ?>` 输出唯一 id
   = 执行; 原样返回字节 = 纯静态)。
3. **残留物盘点**: 对历史站点, 列举上传目录全部文件, 对可疑名(shell/evil/探针类)逐个访问
   判执行态 — 残留 webshell 可执行 = 历史防线缺口证据。
4. 每步留请求/响应全量(五段矩阵素材)。

# 验证
- 阳性: 服务端脚本扩展落点可访问且输出唯一 id(自证执行); .htaccess 落点改变目录解析行为。
- 双重验证: 同名 .txt 落点**不**执行(证明差异来自扩展名而非目录全局执行)。

# 阴性
- 上传成功但访问返回原样字节/403 = 目录静态化, 执行链不成立。
- 扩展名白名单拒绝所有脚本扩展且无法绕过 = 防线在位(记录为 config-advice 非漏洞)。
- 仅能上传至非 web 可达路径 = 无执行面。

# @wufufu770/d2d-agents

d2d agent 层薄包装：转发 `plugin/pentest-dsh` 既有导出，不复制实现。

## 转发

- `adapter-inprocess.mjs`：`createInProcessAdapter` / `inprocessWorkerToken`
  （进程内子 agent 后端，`P2P_INPROCESS=1` 时由调度器选用）；
- `adapter-dsh.mjs`：进程外 dsh CLI 子进程后端（以文件存在为准，本包导出探测结果）。

## 12 agent 形态

d2d 三环并行渗透测试由 **外环(recon)/中环(deep-dive)/内环(verify)** 三环组成，
三环共 **12 种 agent 角色**（recon/deep-dive/chain/verify/creative/link 等容量类型 +
对应角色提示词，定义在 `plugin/pentest-dsh/roles/`，容量类型见
`@wufufu770/d2d-core` 转发的 `CAP_KINDS`）。本包只转发装配入口，不定义 agent。

## 源码包说明

同 `@wufufu770/d2d-core`：`"private": true`，发布走
`scripts/pack/inline-build.mjs` 内联构建产物，不直接 publish 源码。

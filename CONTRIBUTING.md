# CONTRIBUTING

## 环境

- Node.js **≥ 22.5**（`package.json` engines 为准，README 与此处一致）
- Python ≥ 3.10 + `pip install kuzu pytest`（graphd 测试用）
- 包管理器统一 **npm**（仓库只保留 `package-lock.json`；不要提交 bun.lock / pnpm-lock.yaml / yarn.lock）

## 测试（提交前三套必须全绿）

```bash
cd plugin/pentest-dsh && npx mocha "test/*.test.mjs"   # 插件主体
cd plugin/d2d-panel  && npm test                        # 面板
python3 -m pytest tests/test_graphd_gates.py -q        # graphd 门禁
node scripts/lint.mjs                                   # 语法门
node scripts/ops/scan-clean.mjs                         # 敏感信息零命中(强制)
```

## 分支与发布

- 日常开发在 `improve/issues-74-66-86`；`main` 是干净发布快照（无运行数据/无真实目标/无凭据），只在发布节点快进
- 不要 `git add -A`——按模块显式列文件提交

## commit 规范

`type(scope): 中文摘要`，正文写清动机与关键数字（测试数）。type: feat/fix/docs/test/chore/refactor。
提交前 `git status` 确认没有卷入无关文件（历史上出过同一消息重复提交三次的事故）。

## 红线（违反直接拒绝）

1. 真实 SRC 目标、API key、token、本机绝对路径**不得进仓库**（`scripts/ops/scan-clean.mjs` 会拦）
2. 渗透工具的"by-design 高危"（对 graphd/目标的请求、curl 重放等）不为本满足静态扫描器而阉割——处置口径见 issue #12 与 `.mimosa/security-policy.json`
3. worker 不可自授权（L1 验证授权标记归宿主管）

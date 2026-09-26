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

## 分支→主干→tag 发布节奏

1. **大阶段评估合入**：每完成一个大阶段（不是逐 commit）评估合入 `main`。合流判据三条全满足才准合：
   - CI 三 workflow（`.github/workflows/` 下 `ci.yml` / `dsh-compat.yml` / `gates.yml`）在分支 HEAD 上全绿；
   - 无阻断性开放项（docs/upstream-open-items.md 已 accept 的 by-design 保留项不算阻断）；
   - 用户确认。
2. **合流方式**：`main` 自上次发布后无独立提交 → fast-forward（`git merge --ff-only`）；有独立提交 → `--no-ff` 保留阶段边界（合并节点即阶段粒度的回溯点）。
3. **合流后打语义化 tag**（`vMAJOR.MINOR.PATCH`，指向合并节点），随合流同批 `git push origin main --tags`。
4. **安全 CI 全分支覆盖先行（D7）**：安全类 workflow（`gates.yml` / `dsh-compat.yml`）触发器必须为 `branches: ['**']`，先于阶段合流就位——否则合流后红灯分不清是合流引入还是存量问题（0be7969 教训："两项必须先于 T0-A 合流"）。
5. **manifest 同批推送（红线级纪律）**：commit 改动任何 git 跟踪文件后，必须同步重生成 `manifest.sha256` 并与该 commit **同批推送**，绝不分开推。实证教训（a3628c6 提交正文）：修复 commit 与 manifest regen 分开推 → gates 的 Manifest integrity 步（gates.yml:29 `sha256sum -c manifest.sha256`）先红，修复步骤永远轮不到验证，CI 白烧一轮。
6. **绝不 force push / amend 已推送 commit**：远端历史一经推送即为事实，改写会让协作者与 CI 状态错乱；写错就追加修正 commit。

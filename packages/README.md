# packages/ — d2d npm 发布工作区

`packages/*` 是对仓库既有插件(`plugin/pentest-dsh`、`plugin/d2d-panel`)的**薄包装**：
只做转发/加载器/客户端，不复制运行中的实现，调度器依赖的 `plugin/` 路径保持不动。

## Monorepo 结构

```
/                        根 workspace(private, packageManager: pnpm@9.0.0)
├── plugin/pentest-dsh   既有: 三环调度器 dsh 插件(运行中, 勿动路径)
├── plugin/d2d-panel     既有: Web 面板
├── packages/
│   ├── d2d-core    转发 plugin/pentest-dsh/domain/* 域函数(scope/caps/experience/…)
│   ├── d2d-graphd  graphd HTTP 客户端(/health /query /write/*) + 启动指引
│   │               (postinstall 默认 noop, 不静默装依赖 — 缺陷纠正)
│   ├── d2d-agents  转发 in-process adapter + 三环 12 agent 形态说明
│   ├── d2d-skills  零依赖 SKILL.md 加载器(frontmatter 子集/校验/打分选择器) + 样例 skill
│   ├── d2d-hooks   7 事件 hook 引擎(matcher/warn|block; 不做 uid/gid 降级 — 诚实声明)
│   └── d2d-cli     统一 CLI(d2d <version|list|doctor|graphd|agents|skills|hooks|osint-cred>)
├── scripts/pack/inline-build.mjs   发布构建: 内联依赖源码 → dist/ 可发布包
└── .github/workflows/{ci,publish}.yml
```

## 为什么是「源码包 + 构建发布」而不是直接 publish

薄包装用 ESM 相对路径引用仓库内 `plugin/` 源码（`../../plugin/pentest-dsh/domain/x.mjs`），
这在 monorepo 源码树内有效，但**原样 `npm publish` 后路径失效**。为同时保住
「不复制运行中代码」和「可发布」两点：

1. 所有 `packages/*` 统一 `"private": true`——**绝不宣传对源码包直接 `npm install`/`npm i -g`**
   （避免参考实现 private:true 却宣传全局安装的自相矛盾）；
2. 发布走 `scripts/pack/inline-build.mjs`：按依赖图把被引用的仓库内源码逐文件内联到
   `dist/<pkg>/vendor/`、改写 import、产出删掉 `private` 的发布形态 `package.json`；
3. CI（`publish.yml`）只对 `dist/*` 执行 `npm publish --provenance --access public`，
   用 GitHub OIDC trusted publishing（`id-token: write`，仅 job 级），**不用 NODE_AUTH_TOKEN**。

## 与 plugin/ 的关系

- `plugin/*` 是权威实现与运行时（调度器/面板），本目录的包是它的 **npm 化外壳**；
- 包装包只转发导出，行为测试同时覆盖「导出存在」与「核心行为正确」；
- 仓库内开发时直接以相对路径引用 `packages/*/src`，无需安装即可 `node --test` 全绿。

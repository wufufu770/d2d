# @wufufu770/d2d-core

d2d 核心域函数的**薄包装包**：不复制任何代码，仅转发 `plugin/pentest-dsh/domain/*` 的既有导出。

## 转发的模块

| 导出源 | 内容 |
| --- | --- |
| `domain/scope.mjs` | OPSCOPE 门控：`DESTRUCTIVE`、`URL_RE`、`checkBash`、`_checkBash` |
| `domain/caps.mjs` | 环容量热调：`CAP_KINDS`、`parseHotCaps`、`mergeCaps` |
| `domain/experience.mjs` | 经验沉淀：`normPattern`、`patternClass`、`laplace` 等 |
| `domain/safe-url.mjs` | 目标 URL 白名单/校验 |
| `domain/triage.mjs` | finding 分诊 |
| `domain/allocator.mjs` | 任务分配纯函数 |

（以仓库内实际存在的模块为准；schema/checkpoint 等若尚未拆出，不在本包转发范围。）

## 重要：这是「源码包」，不是可直接 npm install 的包

`src/index.mjs` 使用相对路径 `../../plugin/pentest-dsh/domain/xxx.mjs` 引用仓库内源码。
**该相对引用只在 monorepo 源码树内有效**——原样 `npm publish` 后路径失效。

因此：

- 本包统一 `"private": true`（不宣传 `npm install -g`，避免自相矛盾）；
- 正式发布走 `scripts/pack/inline-build.mjs`：读依赖图、把 `plugin/` 源码逐文件内联进
  `dist/<pkg>/vendor/`、改写 import 路径、生成独立可发布的包目录，再
  `npm publish ./dist/<pkg> --provenance --access public`；
- `package.json` 的 `publishConfig` 字段注明该流程，CI（`.github/workflows/publish.yml`）
  只发布构建产物。

## 使用（仓库内）

```js
import { checkBash, DESTRUCTIVE } from '../../packages/d2d-core/src/index.mjs'
```

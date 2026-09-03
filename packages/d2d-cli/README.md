# @wufufu770/d2d-cli

d2d 统一 CLI。`bin` 名 `d2d`。子命令为纯参数分发（`node:util` `parseArgs`），
逻辑全部复用各包导出，本包不写业务：

| 子命令 | 作用 |
| --- | --- |
| `version` | 打印 monorepo 与各包版本 |
| `list` | 列出 workspace 各包与职责 |
| `doctor` | 体检：node 版本 / graphd /health 可达性 / 必需 env |
| `graphd` | graphd 连接信息与启动指引（不代装依赖，见 @wufufu770/d2d-graphd） |
| `agents` | 打印三环 12 agent 形态（来自 @wufufu770/d2d-agents） |
| `skills` | 列出/检索 skills（来自 @wufufu770/d2d-skills loader） |
| `hooks` | 列出 7 事件枚举与 matcher 语义（来自 @wufufu770/d2d-hooks） |
| `osint-cred` | 打印 OSINT 凭据/技术卡入口（technique_cards.json 路径与使用提示） |

用法：

```bash
node packages/d2d-cli/src/cli.mjs doctor --graphd-url http://127.0.0.1:8766
```

注意：本包为源码形态（`private: true`），**不宣传 `npm install -g`**；
全局可用的发布形态由 `scripts/pack/inline-build.mjs` 构建产物 + CI provenance 发布提供。

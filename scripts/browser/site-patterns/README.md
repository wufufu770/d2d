# site-patterns — 站点经验库

一个目标域一个 `.md` 文件（文件名 = 顶级域名，如 `demo-src.com.md`），由调度器在派发
discovery/deep worker 时按目标 host 匹配注入（见 `scripts/browser/match-site.mjs`）。

## 文件格式

```
aliases: demo-src.cn, demo-src.example   ← 可选首行，附加匹配域名（逗号分隔）
（其余为经验正文 markdown）
```

## 内容原则

- 只放「如何更高效地测这个站点」的经验：登录入口、接口习惯、鉴权方式、已知坑、有效 payload 形态
- 不放未验证的结论；漏洞证据与战果走图数据库（Finding/Signal），不写这里
- 涉及凭据的内容禁止出现（本目录在仓库内，随 git 分发）
- 示例文件用占位域名（demo-src.com 等），真实目标的经验文件只存在于本地 `~/.d2d-data/site-patterns/`
  （把 D2D_SITE_PATTERNS 指过去即可覆盖默认目录）

## 本地经验库

`match-site.mjs` 优先读仓库自带 `site-patterns/`；若环境变量 `D2D_SITE_PATTERNS` 指向
本地图库（不进 git），则两者合并匹配（本地图优先）。

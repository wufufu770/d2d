# assets/wordlists — 内置字典资产

> skyline 资产面采纳(P1/M3)。子域/路径字典 + resolver 池, 供资产收集引擎(`scripts/recon/collect.mjs`)
> 与 DNS 爆破通道消费。加载入口统一走 `scripts/recon/wordlists.mjs`, 缺文件静默降级不阻塞。

## 分级

| tier | 定位 | 体量 | 默认 |
|---|---|---|---|
| p0 | 高频短尾(秒级跑完) | 5000 词 + common 路径 | **默认跑** |
| p1 | 常规覆盖(1-2min) | 20000 词 | 跑(默认 `loadDict(kind,'p1')` 会并入 p0) |
| p2 | 深扫(按需) | 110000 词 + 中文生态补充 | 显式升级才跑 |

## 来源与 license

- SecLists 四件(p0/p1/p2 子域 + common 路径): **MIT**, (c) danielmiessler/SecLists contributors。
  发布时 sha256 锚定原始 txt, `scripts/recon/fetch-wordlists.mjs` 更新时哈希不符会拒绝替换。
- `p2-cn-extra.txt` / `resolvers/trusted.txt`: d2d 自维护, 原创/公共数据, MIT。
- 不打包无 license 字典(fuzzDicts/Web-Fuzzing-Box 等) — 只借鉴分类思路, 数据人工沉淀进 cn-extra。

## resolver 池

- `resolvers/trusted.txt`: 自维护 28 条可信公共 DNS(全球 + 中国), 每行一个 IP, 解析失败换 NS 重试与
  可信复验都用它。
- trickest/resolvers 池(MIT, 每日 CI 更新)按需缓存: `node scripts/recon/wordlists.mjs refresh-resolvers`
  → `~/.d2d-data/cache/resolvers.txt`(24h TTL, 拉取失败静默降级可信集)。

## 更新

```bash
node scripts/recon/wordlists.mjs list      # 清单
node scripts/recon/wordlists.mjs verify    # sha256 完整性(解压后哈希)
node scripts/recon/wordlists.mjs show subdomain p1 20
node scripts/recon/fetch-wordlists.mjs     # 重下 + 校验 + 回写(.gz)
```

升级上游字典版本 = 重下后把新 sha256/entries 写回 manifest.json 并 review(与代码变更同级, 防投毒)。

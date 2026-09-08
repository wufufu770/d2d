# scripts/recon/mapping — 空间测绘聚合层

> skyline 资产面采纳(P1/M1)。FOFA / 鹰图 Hunter / Quake 360 / ZoomEye 四家开放 API 的自研
> Node 直连客户端 + 统一查询翻译 + 配额排序 + 跨平台去重。零第三方依赖, 凭据只走环境变量。

## 凭据(全部 env 注入, 不落盘)

| env | 平台 | 获取 |
|---|---|---|
| `D2D_FOFA_KEY`(可选 `D2D_FOFA_EMAIL`) | FOFA | fofa.info 个人中心 api key(新版 key-only) |
| `D2D_HUNTER_KEY` | 鹰图 Hunter | hunter.qianxin.com 个人中心 api-key |
| `D2D_QUAKE_TOKEN` | Quake 360 | quake.360.net 个人中心 token |
| `D2D_ZOOMEYE_KEY` | ZoomEye | zoomeye.org/profile 生成 API-KEY |

## 语法差异(翻译层已收敛, `query.mjs` 单测锁定)

| DSL 键 | FOFA | 鹰图 | Quake | ZoomEye |
|---|---|---|---|---|
| `{domain}`(含子域) | `domain="x"` | `domain.suffix="x"` | `domain="x"` | `domain="x"` |
| `{icp}`(备案主体) | `icp="x"` | `icp.name="x"` | `icp.name="x"` | `icp.name="x"` |
| `{ip}`/`{cidr}`/`{cert}` | 同名 `="x"` | 同名 | 同名 | 同名 |

## 端点与配额

- FOFA: `GET /api/v1/search/all`(qbase64 + fields 二维数组); 配额 `GET /api/v1/info/my`(fofa_point)。
- 鹰图: `GET /openApi/search`(search base64); `data.rest_quota` 随查询返回剩余积分(按条扣, 1 条≈1 分)。
- Quake: `POST /api/v3/search/quake_service`(X-QuakeToken); 配额 `POST /api/v3/user/info`。
- ZoomEye: `POST /api/v2/search`(API-KEY, pagesize ≤10000); 配额 `POST /api/v2/userinfo`(points)。

## 用法

```bash
# 凭据活性检测(真实单条探针; --json 供面板后续复用)
node scripts/recon/mapping/check.mjs [--domain example.com] [--json]

# 库内调用(资产收集引擎 M2 消费)
import { searchAll } from './aggregate.mjs'
const { assets, perProvider } = await searchAll({ domain: 'example.com' }, { size: 100, maxPages: 2 })
```

出站约束: 仅 https + 固定平台域名(`kit.mjs assertHttpsHost` 断言), 拒绝回环/私有/保留地址;
超时 15s(检测 25s); FOFA ~1qps 限频内置页间 sleep。

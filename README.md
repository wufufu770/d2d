# d2d

**三环并行自主渗透测试框架** —— 发现环 / 深度攻击环 / 创造探索环三类 agent 并行竞速，共享图数据库黑板，自带星图认知层、知识脑与观测面板。以 dsh 插件形态运行。

```
发现环   绘制攻击面: 端点/参数/技术栈/认证入口 全量入图(信号带 surface/boundary 坐标)
深度环   先建模后开打 → L1 单点 → L2 组合 → L3 跨端点链, 以可复现证据产出漏洞
创造环   反转假设, 从失败记录与开放假设中寻找被忽略的攻击面
验证环   独立重放确认(双签), 杜绝 agent 自封结论
```

## 本次更新（v0.3.0）

### 星图认知层

- **产星契约** — 信号带 `surface`（request/response/js/business/flow/apk/mini）× `boundary`（outer/inner/cross）枚举坐标，覆盖分析只认枚举不认散文
- **覆盖象限图** — surface×boundary 密度：密簇=已挖透（收益递减），空白象限=下一铲位置；资产收敛后自动生成指向空白象限的对账任务
- **涟漪与候选连线** — 新信号自动扫历史同构回声建 DERIVED_FROM 边；同 host 跨类型的共现星对提名「候选连线」，自由命名攻击形态交给模型
- **假设生命周期** — claim（CAS 认领，409 保护 + 15min 租约回收）→ resolve（confirmed 必须带证据引用，无证据系统强制降级 suspected；refuted 是一等公民）
- **跨模块链路** — 同 host 跨业务链的端点对自动建 RELATES 边 + 生成跨链组合假设（身份复用/参数回注/状态转移跨越）
- **星表聚簇反哺** — 同型聚簇 ≥2 的战果自动生成策略卡草稿，人工审后经学习脑入库

### 作战纪律层

- **信号决策表 18 类** — 参数名/路径/响应特征 → 假设 → 验证方法 → 触发方向的确定性映射，随知识脑分发
- **深水作战规程** — 支付/订单/优惠券/审批流/加密参数类目标的业务模型层打法：入水三门槛 → 四工件（对象图/权限矩阵/状态机/资金权益流，前端置灰≠后端校验）→ 三线差分（越权边/重放边幂等/竞争边受控 harness）→ 加密四步法（能稳定产出合法签名请求=接入完成）
- **建模先行** — 首拍深环优先建模：业务链路四步拆解 + 假设矩阵六维（越权/篡改/时序/回注/缺权/边界）+ 完整性三锚（防捏造/防缺漏/防不足）
- **缝隙验证四问** — 身份校验在哪 / 回注参数被信任了吗 / 能跳步吗 / 并发重放乱序
- **反推七问 + 串链心法** — 判定顺序不可颠倒（权限上下文第一关），把原语当新初始条件重看资产地图
- **replay 五段矩阵** — baseline/positive/negative/impact/停止条件，随验证结论落 Finding
- **收工回报三件套** — 结论 / 证据(id) / 下一步建议，禁止只说"已完成"
- **收尾反思四步** — 失败统计 → 策略检索 → 跨 host 迁移学习 → 才许收尾

### 工程与工具

- **孤儿自愈** — 调度进程被硬杀后，engagement 停在 active/任务停在 claimed 的死锁自动回收接管
- **派发载荷修复** — 任务内容端到端到达 worker（原派发链键名断链致 focus 恒空）
- **验证管线五连修** — 结论信号消费/双签记账的静默断链根治
- **worker 查询白名单硬化** — CALL 全禁、共享黑板表无谓词全表扫禁（跨项目读隔离进硬门）
- **strategy-learn** — 从 URL/文件/文本主动学策略：出站 SSRF 防线（仅 http/https、拒本地/私有/保留地址、DNS 解析复查）→ 草稿入学习脑
- **小程序工具面** — wxapkg 定位/解包（未装工具如实阻塞）+ WMPF 调试器 CDP 六动作（只连本机回环，捕获请求流/截图/注入只读钩子）
- **聚簇目录** — 同型战果 ≥2 自动出策略卡草稿；dedup 删除留痕、跨项目物理隔离

## 特性

- **七态 FSM** — candidate → triaged → verified → isolated → reported → accepted / rejected，结论由独立重放回写，agent 无法自封
- **双签复核** — critical/high 首签后净室派第二模型独立复核，一致才 verified，不一致留人工仲裁
- **自动分诊** — 近重复检测（词集 Jaccard + trigram 语义余弦）、问题签名判据、链签名归并
- **生命周期防护** — 图状态栅栏、调度器租约（CAS + TTL 心跳 + 硬杀孤儿自愈）、取消令牌（409 优雅停机）、额度全局熔断
- **成本约束** — step 硬上限、深环短超时、task-consumer 专用短简报、面板 24h 烧速、命令级超时纪律
- **学习脑** — 文章/URL/实战洞察 → 蒸馏知识卡 → 三门禁晋级 → 经验先验注入每轮简报 → 同型聚簇反哺
- **资产面** — 测绘四家聚合(FOFA/鹰图/Quake/ZoomEye, 配额排序+凭据检测) + 收集引擎(ICP→测绘反哺→crt.sh→字典爆破→探活指纹) + 指纹→策略卡反查注入(严格门)
- **执行面** — cdp-proxy 浏览器代理(登录态/JS 渲染目标, scope 白名单 + 请求级拦截) + 企业代理/自签证书 TLS 兜底
- **25 个专家角色** — 资产测绘/信息挖掘/业务逻辑/深水作战/建模/注入/反序列化/SSRF/云凭据/移动端/小程序等按信号类型路由
- **SRC 口径内置** — 弱口令/默认口令作为入口必须找；安全头/指纹类垃圾只记信号不写 Finding
- **观测面板** — workers / findings / 策略库 / 成本烧速 / Fleet 模型矩阵 / 黑名单

## 安装

前置：Node.js ≥ 22.5、Python ≥ 3.10（`pip install kuzu`）、pnpm。

```bash
git clone https://github.com/wufufu770/d2d && cd d2d
bash install.sh                 # 数据目录/令牌/profile/插件/skill/启动脚本 一键装配
bash scripts/systemd/install.sh --start   # 守护模式(user 级, 可选)
```

## 配置（三步）

**① 模型策略** — 编辑 `~/.d2d-data/config/model-policies.json`：

```json
{
  "default": { "primary": "provider-a/model-x", "backup": "provider-a/model-x-fast" },
  "roles": {
    "discovery": { "primary": "provider-a/model-x-fast", "backup": "" },
    "deep":      { "primary": "provider-a/model-x",      "backup": "provider-b/model-y" },
    "creative":  { "primary": "provider-b/model-y",      "backup": "" },
    "verify":    { "primary": "provider-a/model-x-fast", "backup": "" },
    "study":     { "primary": "provider-a/model-x",      "backup": "" }
  }
}
```

把 `provider-a/model-x` 替换为实际接入的 `厂商/模型`。建议：深环用大上下文模型，发现环用快而便宜的模型。

**② LLM 路由** — 编辑 `~/.dsh/profiles/headless/cordis.patch.yml` 的 `llm-pi-ai` 段：接入任意厂商改 `baseURL` / `apiKeyEnv` / `models` 即可。`apiKeyEnv` 必须与 web UI Models 页的凭证引用名逐字一致。

**③ API key** — key 只经环境变量注入，不落盘：

```bash
export PROVIDER_A_API_KEY=sk-...
```

**企业代理 / 自签证书（可选）** — 原则：默认严格校验 + 注入企业根证书，不做全局放宽：

```bash
export D2D_CA_BUNDLE=/path/corporate-ca.pem   # worker curl 统一追加信任
export D2D_UPSTREAM_PROXY=proxy.corp:8080     # egress-gateway 经企业代理出网(scope/审计仍在本网关强制)
```

诊断：`node scripts/ops/doctor.mjs`。

## 启动

```bash
bash ops/start-all.sh    # graphd :8766 · egress :8888 · oast :8890 · 面板 :8899
```

浏览器打开 http://127.0.0.1:8899 ，右侧栏 **d2d** 面板。

## 使用

```
/pentest https://你的授权目标 授权scope,逗号分隔,!排除项 [instances]
/pentest-status        # 进度 / worker / 模型
/pentest-stop          # 优雅停止并冻结
```

流程自动：发现环绘面（信号带坐标）→ 建模 → 深环消费任务 → 覆盖对账 → 涟漪连线 → 自动分诊去重 → 验证环重放双签 → 经验沉淀与聚簇反哺。

## 成本预算（建议三档）

| 参数 | 🟢 日常 | 🟡 省钱 | 🔴 冲刺 |
|---|---|---|---|
| maxAgents / deepParallel | 3 / 2 | 2 / 1 | 6 / 4 |
| P2P_MAX_STEPS | 45 | 30 | 60 |
| 深环超时 | 600s | 420s | 600s |

## SRC 口径（简报内置）

- **排除**（只记信号）：安全头/Cookie 属性缺失、版本与中间件指纹、目录列举、sourcemap、裸扫描器结论
- **入口类（必须找）**：弱口令/默认口令/测试账号 → 登录后立即沿越权/敏感数据/业务逻辑深入
- **组合类**（不单独报）：通用 CORS、反射 XSS、CSRF —— 串成危害链后按链条报
- **高价值优先**：越权、支付/提现逻辑、可遍历敏感信息、SQL 注入、RCE、内网 SSRF、打后台存储 XSS

## 测试与自检

```bash
node scripts/ops/doctor.mjs                      # 运行环境自检
python3 -m pytest tests/test_graphd_gates.py     # graphd 门禁 145 例
cd plugin/pentest-dsh && npm test                # 调度/分诊/工具面 596 例
cd plugin/d2d-panel && npm test                  # 面板 46 例
node scripts/ops/backup-graph.sh                 # 图备份
```

## 隐私

所有运行数据（挖掘记录/学习内容/日志）都在本地 `~/.d2d-data/`，不在仓库内。

## 授权声明

仅用于**已获书面授权**的安全测试。请遵守目标方测试规范与当地法律法规。

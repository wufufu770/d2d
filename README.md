# d2d

**三环并行自主渗透测试框架** —— 发现环 / 深度攻击环 / 创造探索环三类 agent 并行竞速，共享图数据库黑板，自带知识脑与观测面板。以 dsh 插件形态运行。

```
发现环   绘制攻击面: 端点/参数/技术栈/认证入口 全量入图
深度环   L1 单点 → L2 组合 → L3 跨端点链, 以可复现证据产出漏洞
创造环   反转假设, 从失败记录与开放假设中寻找被忽略的攻击面
验证环   独立重放确认, 杜绝 agent 自封结论
```

## 特性

- **七态 FSM** — candidate → triaged → verified → isolated → reported → accepted / rejected，结论由独立重放回写，agent 无法自封
- **自动分诊** — 近重复检测（词集 Jaccard + trigram 语义余弦）、问题签名判据、链签名归并
- **生命周期防护** — 图状态栅栏、调度器租约（TTL 心跳）、取消令牌（409 优雅停机）、额度全局熔断
- **成本约束** — step 硬上限、深环短超时、task-consumer 专用短简报、面板 24h 烧速
- **学习脑** — 文章/实战洞察 → 蒸馏知识卡 → 三门禁晋级 → 经验先验注入每轮简报
- **SRC 口径内置** — 弱口令/默认口令作为入口必须找；安全头/指纹类垃圾只记信号不写 Finding
- **观测面板** — workers / findings / 策略库 / 成本烧速 / Fleet 模型矩阵 / 黑名单

## 安装

前置：Node.js ≥ 18、Python ≥ 3.10（`pip install kuzu`）、pnpm。

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

流程自动：发现环绘面 → 深环消费任务 → 自动分诊去重 → 验证环重放 → 经验沉淀。

## 成本预算（建议三档）

| 参数 | 🟢 日常 | 🟡 省钱 | 🔴 冲刺 |
|---|---|---|---|
| maxAgents / deepParallel | 3 / 2 | 2 / 1 | 6 / 4 |
| P2P_MAX_STEPS | 45 | 30 | 60 |
| 深环超时 | 600s | 420s | 600s |

纪律：发现环跑到面饱和即停；深环只吃高价值任务；auto-study 攒批处理。

## SRC 口径（简报内置）

- **排除**（只记信号）：安全头/Cookie 属性缺失、版本与中间件指纹、目录列举、sourcemap、裸扫描器结论
- **入口类（必须找）**：弱口令/默认口令/测试账号 → 登录后立即沿越权/敏感数据/业务逻辑深入
- **组合类**（不单独报）：通用 CORS、反射 XSS、CSRF —— 串成危害链后按链条报
- **高价值优先**：越权、支付/提现逻辑、可遍历敏感信息、SQL 注入、RCE、内网 SSRF、打后台存储 XSS

## 测试与自检

```bash
node scripts/ops/doctor.mjs                      # 16 项运行环境自检
python3 -m pytest tests/test_graphd_gates.py     # graphd 门禁 86 例
cd plugin/pentest-dsh && npm test                # 调度/分诊/工具面
node scripts/ops/backup-graph.sh                 # 图备份
```

## 隐私

所有运行数据（挖掘记录/学习内容/日志）都在本地 `~/.d2d-data/`，不在仓库内。

## 授权声明

仅用于**已获书面授权**的安全测试。请遵守目标方测试规范与当地法律法规。

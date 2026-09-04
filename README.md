# d2d — 三环并行渗透测试框架

**完全自主的并行渗透测试系统**：发现环 / 深度攻击环 / 创造探索环三类 agent 并行竞速，共享一个图数据库黑板（graphd + Kuzu），自带知识脑（经验沉淀 + 知识卡自学习）与观测面板。

- **发现环**：枚举端点/参数/技术栈/认证入口，绘制完整攻击面并全部入图
- **深度攻击环**：基于指纹与业务语义生成参数级假设，L1 单点 → L2 组合 → L3 跨端点链
- **创造探索环**：从失败记录与开放假设中反转视角，寻找被忽略的攻击面
- **验证环**：独立重放确认，杜绝 agent 自封结论

所有结论必须以**可复现证据**写入图数据库，由验证环独立重放后定为 `verified`。

## 架构

```
┌────────────┐   派发/生命周期    ┌──────────────────┐
│ dsh(宿主/CLI)│ ──────────────▶ │ scheduler 三环调度 │
└────────────┘                  └────────┬─────────┘
                                         │ spawn
                              ┌──────────▼──────────┐
                              │ discovery/deep/…     │  ← dsh headless worker
                              │ worker(多模型可路由)  │
                              └──────────┬──────────┘
        读经验/写端点/写信号/写发现        │
┌────────────┐   ◀──────────────────────┤
│ graphd 图黑板 │        :8766 (Kuzu)     │
└────────────┘                          │
      ▲ 出网 scope 强制/限速/审计        │
┌────────────┐   :8888 egress-gateway  │      :8890 OAST 带外回调
└────────────┘                          ▼
                              ┌──────────────────┐
                              │ d2d-panel 观测台   │ :8899 侧栏
                              └──────────────────┘
```

## 核心特性

- **七态 FSM**：candidate → triaged → verified → isolated → reported → accepted / rejected，结论状态由验证环独立重放回写
- **自动分诊**：近重复检测（词集 Jaccard + trigram 语义余弦）、问题签名判据、链签名归并
- **生命周期防护**：图状态栅栏（冻结即拒派）、调度器租约（120s TTL 心跳）、取消令牌（409 优雅停机）、额度全局熔断
- **成本约束**：step 硬上限（默认 60）、深环短超时（默认 10 分钟）、task-consumer 专用短简报
- **学习脑**：文章/实战洞察 → 蒸馏成知识卡（study）→ 三门禁晋级（promote）→ 经验先验注入每轮简报
- **SRC 口径内置**：只挖平台收录的类型；垃圾类（安全头/指纹/目录列举等）只记 config-advice 信号
- **观测面板**：workers / findings / 策略库（含 wins 战果）/ 成本（24h 烧速）/ Fleet 模型矩阵 / 黑名单

## 安装

前置：Node.js ≥ 18、Python ≥ 3.10（含 `kuzu`）、git、pnpm。

```bash
git clone https://github.com/wufufu770/d2d && cd d2d
bash install.sh          # 一键装配: 数据目录/令牌/profile/插件/skill/启动脚本
```

安装守护（推荐，user 级无需 root）：

```bash
bash scripts/systemd/install.sh --start
```

## 配置（三步，全部使用占位示例）

**① 模型策略** — 编辑 `~/.d2d-data/config/model-policies.json`：

```json
{
  "default": { "primary": "provider-a/model-x", "backup": "provider-a/model-x-fast" },
  "roles": {
    "discovery": { "primary": "provider-a/model-x", "backup": "provider-a/model-x-fast" },
    "deep":      { "primary": "provider-a/model-x", "backup": "provider-b/model-y" },
    "creative":  { "primary": "provider-b/model-y", "backup": "" },
    "verify":    { "primary": "provider-a/model-x-fast", "backup": "" },
    "study":     { "primary": "provider-a/model-x", "backup": "" }
  }
}
```

把 `provider-a/model-x` 等替换为实际接入的 `厂商名/模型名`。建议分层：深环用大上下文窗口模型，发现环用快而便宜的模型。

**② LLM 路由** — 编辑 `~/.dsh/profiles/headless/cordis.patch.yml` 的 `llm-pi-ai` 段：接入任意厂商只需改 `displayName` / `baseURL` / `apiKeyEnv` / `models` 四处。`apiKeyEnv` 必须与 web UI Models 页存储的凭证引用名**逐字一致**（否则模型选择器会空白）。

**③ API key** — key 只经环境变量注入进程，不落盘：

```bash
export YOUR_PROVIDER_API_KEY=sk-...   # 名称与 cordis.patch.yml 的 apiKeyEnv 对应
```

## 启动

```bash
bash ops/start-all.sh    # 或 systemd: systemctl --user start d2d-graphd d2d-egress d2d-oast d2d-dsh-web
```

- graphd → http://127.0.0.1:8766 （图黑板）
- egress-gateway → http://127.0.0.1:8888 （出网治理：scope 强制/限速/审计）
- oast → http://127.0.0.1:8890 （带外回调）
- dsh web → http://127.0.0.1:8899 （浏览器打开，右侧栏 **d2d** 面板）

## 使用

在 dsh 会话（或面板聊天框）：

```
/pentest https://你的授权目标 授权scope,逗号分隔,!排除项 [instances]
/pentest-status     # 进度/worker/模型
/pentest-stop       # 优雅停止并冻结
```

工作流（自动）：发现环绘面 → 深环消费任务 → 自动分诊去重 → 验证环独立重放 → 经验沉淀。全程可在面板观察，亦可 `node scripts/ops/doctor.mjs` 做 16 项健康自检。

## 成本预算（建议三档）

| 参数 | 🟢 日常 | 🟡 省钱 | 🔴 冲刺 |
|---|---|---|---|
| maxAgents / deepParallel | 3 / 2（面板可调） | 2 / 1 | 6 / 4 |
| P2P_MAX_STEPS | 45 | 30 | 60 |
| P2P_DEEP_TIMEOUT_MS | 600000 | 420000 | 600000 |

纪律：发现环跑到**面饱和**（新增端点明显下降）即停；深环不做常备军，只吃高价值任务；auto-study 攒批处理。

## SRC 口径（简报内置）

- **排除类**（只记 config-advice 信号，不写 Finding）：安全头/Cookie 属性缺失、版本与中间件指纹、目录列举、sourcemap 泄露、无危害证明的扫描器结论
- **入口类（必须找）**：弱口令/默认口令/测试账号 → 登录后立即沿越权/敏感数据/业务逻辑扩大战果
- **组合类**（不单独报）：通用 CORS、反射 XSS、CSRF —— 串成危害链后按链条整体报
- **高价值优先**：越权、支付/提现逻辑、可遍历敏感信息、SQL 注入拿数据、RCE/任意文件读、内网 SSRF、打后台的存储 XSS

## 测试与运维

```bash
python3 -m pytest tests/test_graphd_gates.py     # graphd 门禁 86 例
cd plugin/pentest-dsh && npm test                # 调度/分诊/工具面 139 例
node scripts/ops/doctor.mjs                      # 16 项运行环境自检
node scripts/ops/backup-graph.sh                 # 图备份
```

## 数据布局与隐私

所有运行数据（挖掘记录/学习内容/日志）都在 `~/.d2d-data/`，**不在仓库内**；`graphd/kuzu_db` 已被 .gitignore 排除。仓库本身不含任何目标、凭据与挖掘记录。

## 授权声明

仅用于**已获书面授权**的安全测试。请遵守目标方测试规范与当地法律法规。

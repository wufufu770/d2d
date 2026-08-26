# d2d — dsh 版三环并行渗透测试插件

p2p（pi 插件）的 **dsh 宿主移植版**：同一套「三环并行 + 图共享状态 + 门控 + 经验沉淀」架构，
宿主从 pi agent 换成 dsh（DeepSeek agent）。

## 架构

```
dsh (--profile headless)
└── plugin/pentest-dsh   三环调度 / scope门控 / 看门狗 / 进程组击杀
    ├── graphd (:8766)   Kuzu 单写者共享状态层(与 p2p 的 :8765 相互独立)
    └── home/.dsh/skills/pentest/SKILL.md   9区边界文件(垃圾洞清单/七问验证门/决策树)
```

- **三环**：广度发现环(n实例×业务链) / 深度攻击环(三层递进) / 创造探索环(假设反转)
- **角色素材库**：`roles/*.json`(侦察通才/认证绕过专精/注入专精/攻击链构造师/红队理论家/开发者视角)——Role 是全局模板，worker 是临时演员；deep 环按 open 信号类型与角色 signal_affinity 择优选角，creative 按唤醒次数交替双人格
- **Handoff 制度**：每个 worker 有专属 `runs/<eng>/artifacts/<worker-id>/` 产物目录，收工必写 evidence.md + handoff.md；后继成员 brief 注入上游 handoff 文件引用(防电话游戏)
- **协调日志**：调度器单写入者，`runs/<eng>/run-log.jsonl` 追加式记录 dispatch/terminal/wake/close 全事件流
- **持久化**：AgentIdentity checkpoint，worker 失忆零进度损失
- **门控**：engagement scope 从图解析(跨进程有效) + graphd 写操作 URL 启发式 + token 认证
- **经验沉淀**：ExperienceWeight 拉普拉斯先验 prior=(wins+1)/(hits+2)，复用计数回写
- **防孤儿**：OS `timeout --signal=KILL` 包装器 + detached 进程组负 pid 组杀(缺陷#11)

## 安装(一键, GitHub 直装)

```bash
# 一条命令: 克隆 + bundle注册 + graphd服务化 + 冒烟
curl -fsSL https://raw.githubusercontent.com/wufufu770/d2d/main/install.sh | bash -s -- [profile名] [安装目录]
# 默认 profile=headless, 安装到 ~/d2d

# 启动三环渗透
dsh --profile headless "对 http://目标 进行三环渗透测试"
```

手工方式(可选):

```bash
# dsh 本体
bun install          # 于 dsh/ 目录(不入库)

# graphd(Kuzu 单写者 sidecar)
pip install kuzu
python3 graphd/app.py &        # 监听 :8766

# 插件装入 dsh HOME(作为标准 dsh bundle)
cd ~/.dsh/profiles/headless
pnpm add pentest-dsh@link:/path/to/d2d/plugin/pentest-dsh
# 在 package.json 的 dsh.profile.bundles 中加入 "pentest-dsh"
```

## 使用

```bash
node round-launch.mjs dsh      # 对 $R_TARGET 发射一轮三环测试
python3 eval_profile.py 8766 profile.json   # 按靶场档案评估覆盖/artifacts/误报
python3 compliance_check.py    # 架构合规审计(三环/图/门控是否真实生效)
```

## 与 p2p 的关系

| | p2p | d2d |
|---|---|---|
| 宿主 | pi agent (@earendil-works) | dsh |
| 图端口 | 8765 | 8766 |
| 插件语言 | TypeScript(jiti) | JavaScript |
| 共享信息 | **无** —— 两套独立经验库，各自迭代 |

## 实现状态(声明即契约 —— 与 compliance_check.py 机读检查项对应)

| 声明 | 状态 | 验证途径 |
|---|---|---|
| 三环并行 + 图共享状态 | ✅ 实装 | compliance_check Check1/2 |
| 角色素材库(6角色+信号亲和选角) | ✅ 实装 | run-log role 字段 |
| Handoff 产物制度 | ✅ 实装 | runs/<eng>/artifacts/ |
| run-log 单写者协调日志 | ✅ 实装 | runs/<eng>/run-log.jsonl |
| AgentIdentity checkpoint 写入 | ✅ 实装 | Check3 |
| checkpoint 继任者恢复注入 | ✅ 实装(方向5后半) | 同环同链路最近 checkpoint 自动注入新 worker |
| 规划器(经验加权 Top-N 计划) | ✅ 实装(方向4) | Plan 节点 + deep focus 注入 |
| 验证器环(Finding 独立重放) | ✅ 实装(方向2) | verified_at/verified_log + quarantine |
| 报告引擎(Markdown 交付物) | ✅ 实装(方向8) | report.mjs |
| eval v2 endpoint级 must_repro 严格模式 | ✅ 实装(方向7) | merge_eval.py |
| scope 门控(worker 进程级) | ✅ 实装 | tools/pre-execute 拦截 |
| 垃圾洞清单机械门 | ✅ 实装 | tests/test_graphd_gates.py |
| PII 机械脱敏 | ✅ 实装(P5) | /write/finding 打码 |
| 经验库防投毒(host token) | ✅ 实装(#32) | graphd 双 token + 自动 token 文件 |
| 一键安装器 | ✅ 实装 | install.sh (GitHub 直装) |
| 多车道并行测试 | ✅ 实装 | LANE_GRAPHD/RUNS_DIR + eval_union |

## 靶场验证记录

| 靶场 | 结果 | 备注 |
|---|---|---|
| vuln-bank (本地) | ✅ PASS | SQLi/BOLA/SSRF/JWT/竞态/LLM注入 全谱系 |
| dvws-node (本地) | ✅ PASS | 92% + 4/4 artifacts + 0FP |
| VAmPI (本地) | ✅ PASS | dsh 16/19 + 4/4 + 0FP |
| DVS (本地) | 🔄 迭代中 | 34类 深度覆盖 |
| crAPI (在线, OWASP 官方托管) | 🔄 迭代中 | OWASP API Top10 真实大厂漏洞原型 |

## 控制组与晋升策略

- `d2d-control/` 为只读晋升目标(不参与靶场测试)
- 测试组每 PASS 一个靶场 → 修复晋升到 control + 冒烟回归 → 测试组继续下一靶场
- 多车道并行(本地+在线靶场)以本机内存为限

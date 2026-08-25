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

## 安装

```bash
# dsh 本体
bun install          # 于 dsh/ 目录(不入库)

# graphd(Kuzu 单写者 sidecar)
pip install kuzu
python3 graphd/app.py &        # 监听 :8766

# 插件装入 dsh HOME
cp -r plugin/pentest-dsh ~/.dsh/profiles/headless/plugins/  # 或按 dsh 插件规范挂载
cp -r home/.dsh/skills ~/.dsh/
source env.sh                  # PATH/HOME 隔离切换
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
| Handoff 产物制度 | ✅ 实装(Wave0 后) | runs/<eng>/artifacts/ |
| run-log 单写者协调日志 | ✅ 实装(Wave0 后) | runs/<eng>/run-log.jsonl |
| AgentIdentity checkpoint 写入 | ✅ 实装(Wave0 后) | Check3 |
| checkpoint 继任者恢复注入 | ⏳ 计划中(方向5) | — |
| scope 门控(worker 进程级) | ✅ 实装 | tools/pre-execute 拦截 |
| scope 门控(连接层) | ⏳ proxygate 已建成未接线 | packages/tools/proxygate.mjs |
| 垃圾洞清单机械门 | ✅ 实装 | tests/test_graphd_gates.py |
| PII 机械脱敏 | ✅ 实装(P5) | /write/finding 打码 |
| 验证器环(Finding 独立重放) | ⏳ 计划中(方向2) | — |
| 经验库防投毒(host token) | ✅ 实装 | graphd 双 token |

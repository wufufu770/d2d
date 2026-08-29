# DAG 工作流整合方案（2026-08-29 评审 + 采纳决定）

外部交付物：dag.yaml(15 节点 19 边) / orchestrator.py(45 方法) / 28 类探测矩阵 / 7 态状态机 / 限速策略表 / 25 剧本。

## 采纳判定（按价值排序）
| 组件 | 判定 | 理由 | 落点 |
|---|---|---|---|
| §0 授权红线四列表(target/authorization/window/forbidden_actions) | **立即采纳** | d2d 现在只有 scope 字符串；窗口期+禁止手段+授权凭证是 SRC 合规硬门槛 | profiles 增 roe 块；watchdog 每节点复查窗口，过期 exit 42；egress-gateway 消费 forbidden_actions |
| §6 限速策略表(自适应降速/封禁冷却/UA 轮换) | **立即采纳** | egress-gateway 已有令牌桶，补 adaptive(2×429/403→×0.5) 与 cooldown(3×403→600s) | gateway 两个函数，100 行内 |
| §4 28 类探测矩阵(payload 族/证据字段/误报排除三列) | **立即采纳** | 与 G1 断言收严同构；payload 模板族喂 gapHints/seeds | profiles 类定义扩展三字段 |
| §5 Finding 7 态状态机(CAS/幂等) | **R3 采纳** | 与审查报告 R3 提案一致；validator 写 transition | graphd /write/transition |
| §3 DAG orchestrator(S1-S8 侦察段) | **R2 后半采纳** | subfinder/httpx/ffuf/katana 产出的端点直接喂 d2d 的 Endpoint 图——侦察前置层 | scripts/recon/ 包装，输出写 graphd |
| S9-S10(nuclei/sqlmap) | **谨慎采纳** | nuclei 模板化补充 deep 环；sqlmap 受 forbidden_actions 门控 | deep 环工具节点 |
| §2 其余/§7 厂商对标/§9 B4/B5(移动/云原生) | D-defer | 本机内存与授权边界；B2/B6/B7/B8 已在 d2d 达成对应物 | — |

## 与既有 G2-G6 的关系
- G2 OAST = §4 矩阵的 S11 interactsh + 4/16 类的带外列 → oast.mjs 自建回调(dnslog 式)
- G3 凭据化 = §4 的 22/23/25 类(双账号 diff/三角色矩阵) 的前置条件
- G4 ROE = §0 四列表；G5 去重 = §8 剧本 18(MD5 合并)；G6 模型轮换独立

## 执行顺序
R2a: 四列表+窗口门+gateway 自适应/冷却（合规底座）→ R2b: G2 OAST + G3 凭据 → R2c: zerobank/aspgoat 难类 + dvwa 入队全队列重打 → R2d: DAG 侦察前置层(S1-S8) 接 Endpoint 图。

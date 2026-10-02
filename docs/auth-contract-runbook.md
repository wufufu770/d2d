# 授权契约使用 runbook（T3-3-3，操作者手册）

> 自用手册：签发/轮换/验证的完整操作步骤。安全纪律一句话：**验签失败不放行**
> （invalid/expired 恒拒），灰度 `P2P_AUTH_CONTRACT` 只影响 missing 态（缺省 off=警告放行）。

## 0. 一次性认知
- 密钥：`~/.config/d2d/auth-signing/<kid>.{pkcs8,spki}.pem`（目录 0700/文件 0600）。
  kid = 公钥指纹前 16 hex。私钥(pkcs8)只用于签发，验签端只需要 spki。
- 契约：`~/.config/d2d/auth-contracts/<contract_id>.json`（0600）——engagement 级
  授权文件，字段 version/contract_id/target/scope/principal/objective/key_id/alg/
  issued_at/expires_at + 一体签名（对规范化载荷，防字段剥离）。
- seen 记忆：`~/.d2d-data/trust/seen-auth.json` —— 系统见过某 kid/契约后，契约文件
  消失不会静默回落 legacy：放行但持续警告（audit `auth-contract-vanished`）。
- 验签挂接点：engagement 启动（startEngagement 入口，覆盖全部路径含面板 adopt）/
  p2p_start 工具预检 / bash 门组合层 / egress 网关 scope 刷新（30s）。

## 1. 密钥生成（首次）
```bash
node scripts/ops/authctl.mjs keygen
node scripts/ops/authctl.mjs keys        # 确认 kid 与私钥"在"
```

## 2. 契约签发（每个授权目标一次）
```bash
AUTH_PRINCIPAL=<委托人标识> node scripts/ops/authctl.mjs issue \
  --target example.com \
  --scope "example.com,!secret.example.com" \
  --days 30 --objective "SRC 项目"
# 签发后手动复核一遍:
node scripts/ops/authctl.mjs verify --target example.com --scope api.example.com
# exit 0 = 放行语义(按灰度矩阵); exit 1 = 拒
```
注意 scope 语法与既有域控一致（逗号分隔、`!` 前缀排除）；启动时的请求 scope 必须
是契约 scope 的子集（hostAllowed 归属判定），超集启动被拒。

## 3. 打开强制模式（可选，缺省 off）
```bash
export P2P_AUTH_CONTRACT=on   # missing 态从「警告放行」变「拒」; invalid/expired 恒拒
```
横幅会显示 `enforcing`（off 显示 `warning-only`）——横幅文案与实际判定一致。

## 4. 密钥轮换（只增不改）
```bash
node scripts/ops/authctl.mjs keygen                       # 新 kid（旧钥保留）
AUTH_PRINCIPAL=... node scripts/ops/authctl.mjs issue ... # 新契约自动用最新 kid
# 旧契约全部过期后:
rm ~/.config/d2d/auth-signing/<旧kid>.spki.pem            # 吊销旧 kid(验签端 fail-closed 拒)
rm ~/.config/d2d/auth-signing/<旧kid>.pkcs8.pem           # 最后移除私钥
```
轮换期双 kid 共存：验签按契约内 key_id 选公钥，互不影响。

## 5. 常见拒绝排障
| audit/警告事件 | 含义 | 处置 |
|---|---|---|
| `auth-contract-missing` | 无匹配 target 的契约文件 | off=照旧+签契约; on=先签契约再启动 |
| `auth-contract-invalid` | 签名/格式/kid 未知/scope 超契约 | 用 verify 看原因；重新签发；**绝不手改契约 JSON**（签名即失效） |
| `auth-contract-expired` | 时间窗外 | 重新 issue（新 contract_id）；运行中触发=软截止（不派新任务，取证链走完） |
| `auth-contract-vanished` | 曾见有效契约、文件已消失 | 恢复文件或重新签发；此态不锁死但持续警告 |
| `scope-contract-rejected`(egress) | active engagement 契约违约 | 修复契约后 30s 内 scope 自动恢复 |

## 6. 红线
- **绝不手改契约 JSON 的 payload 字段**（一体签名，改即 invalid）。
- 私钥(pkcs8)永不进仓库/聊天/日志；泄漏=立即 rm 对应 spki+pkcs8（吊销）并重签。
- 灰度 off 不是安全模式：invalid/expired 在 off 下同样拒——off 只是不强制"必须有契约"。

# d2d v1.5.1 — ECC 判级校准+资产图数据层+契约示例修复

pentest-dsh 1.5.1：小步迭代（版本纪律：小步递增，大数字跳变仅限大版本迭代）。**升级零行为变化**——全部新增面缺省加性。

## Added

### 1. 资产图数据层
- 三节点：Asset（目标级聚合）/EnvSnapshot（环境快照，双判级字段）/Verification（验证事件，append-only——"结论可被新验证推翻，历史不改写"）。
- 四边：HOSTS/SNAPSHOT/VERIFIED_BY/JUDGED_BY；三写端点（host-only，worker 零写权契约不变）。
- 事件去重门：同 run+kind+引用幂等拒重（重放安全）。编排侧 helper 三函数。

### 2. ECC 判级校准
- 401-JSON 在场性抵扣：多路径同指纹（SPA fallback）与 tarpit 同形的区分特征代码化——组外真实 auth 层证据使置信降档。
- 跨轮漂移"恢复向切换"复合降档。正常形态判 none 与旧口径一致（零干扰对照测试背书）。

## Fixed

- 竞速变体契约形态示例：产出契约表补 variants 形态显式示例（与 schema 强制形态对齐——此前引导语无示例导致 worker 自然形态被整份拒收）。
- selfcheck TLS 分层检自包含化（内建本地自签靶，零外部依赖）。

## 内部

- 公开面卫生：测试面字面量代号化（语义等价零信息损失）+push 前扫描闸+实录移出版本库跟踪。

## 验证口径

pytest 436（含资产图端点集成与去重门锁回归 7 例）/mocha 2214/selfcheck 12——三轨全绿；npm pack 增量对账零意外；schema 迁移三段实测（存量零破坏/新表可用/回滚步骤）。

## 资产

SBOM（CycloneDX）+三平台报告字段映射样例（脱敏版）。

# LBD-2 观察期判定报告（LBD-2-F · 判定数据包）

> **测量时点声明（置顶）**：宿主时钟 2026-10-08 19:52 CST——观察期第 5 天，**名义判定日
> 10-18 未至**。本报告=判定数据包的前置完整版：四面数据全量可测且与时长无关的部分
> （崩溃/延迟/等值/图完整性）已具判定效力；"≥2 周满期"字面条件未满足——**10-18 当天
> 按本报告同款流程复测一次（或对 E1/E3 两面快测）即为终版输入**。终裁归用户。

## 现役进程硬数据（E1 口径=ps 硬输出）
```
pid=2720938  lstart=Mon Oct  5 22:34:52 2026  etime=2-21:17:25  rss=86864KB(84.8MB)
cmd=/usr/bin/python3 /home/kali/d2d/graphd/app.py
托管=systemd --user unit d2d-graphd.service（enabled, Restart=on-failure RestartSec=3）
```
- **E1 判定面**：RSS 84.8MB（MID-1 时点 84.7MB——**零爬升，同量级稳定**）；低于 soak
  基线带（150-160MB）方向健康。**达标**。
- 口径注记（诚实条目）：/health 的 started_at（10-04T15:49Z）与 ps lstart（10-05 22:34
  CST）不同源——应用内时间戳为持久化时刻非进程代际；现役世代以 ps lstart 为准
  （=LBD-2 切换 B 五步的计划内重启产物）。

## E2 查询延迟（六项对照 LBD-1 基线 0.82~1.22x 无红线）
本时点六项实测（秒）：0.0136 / 0.0145 / 0.0181 / 0.0108 / 0.0138 / 0.0279——全部两位 ms
段，与 LBD-1 基线及 MID-1（17.4-22.2ms）同量级，无劣化信号。**达标**。

## E3 现役进程窗口零原生崩溃（口径已钉死=ps lstart 起）
- 现役世代（10-05 22:34 起）journal+dmesg **零 segfault/零 core/零原生崩溃**
  （后半程 10-08 起复扫=0/0）。
- 窗口内唯一原生崩溃记录仍为 10-04 两条（探路复现，窗口前置——归因分离维持）。
- **达标**。判定红线（窗口内任何原生崩溃=直接重估）未触发。

## E4 退役复评数据包
- **双轨四等值点**：FIX-1 428=428 → XR-G4 429=429 → MID-1 429=429 → **本批复测
  kuzu 429 = ladybug 429（本时点新鲜）**。
- kuzu==0.11.3 在位（测试轨+bak 恢复路径）；backup-graph.sh 在位；unit 回滚形态明确
  （删三行 Environment+daemon-reload+restart——cutover-record 注释原文）。
- 退役复评本身=变更窗口动作，本报告只交数据包。

## 图完整性终检（全观察期总账）
- 双源勾稽：findings=**778**（基线 777+第四跑 F-6——与回流台账一致）/ experiences=25 /
  hypotheses=481 / quarantined=25（与四轮 reflow written 累计勾稽一致）。
- 零 active engagement 僵尸（active count=0——xring 四轮 frozen 终态）。
- 审计链连续：四轮 events.jsonl append-only 在库+graphd audit.log 既有链无缺口。
- 零越界写：四轮 envScan hits=[]+OPSEC 门 fail-closed 全程+egress 未涉。

## 事件总清单（前半 7 条+后半增补=完备性优先）
前半（10-04~10-08 午，见 lbd2-midpoint.md）：探路 segfault ×2（前置）/Mimosa sed 拦截/
网络窗口/semgrep 一次性红 ×2/G5 版本差 404/deepEqual 一次性红。
后半增补（10-08 午后~本时点）：
| 时点 | 事件 | 分级 |
|------|------|------|
| 10-08 | WRAP-4a 全程零事件（纯 docs 批一次通过） | 无 |
| 10-08 | started_at vs lstart 时间戳不同源发现 | 口径注记（非异常——现役世代以 ps 为准） |
| 10-08 | "第二把锁"定义仓内零命中 | 待用户指认（GO 前置缺口，见下） |
后半程 CI：三批（MID-1/WRAP-4a）全一次通过零红。**零引擎行为异常（全期维持）**。

## GO/NO-GO 建议案（终裁归用户）
**建议：GO（条件附下）**——四面对照 E 节原文全部达标+四等值点+图完整性+零引擎异常；
唯一保留=名义满期（≥2 周）字面条件，建议 10-18 当天对 E1/E3 快测复确认后生效。
**变更窗口三操作前置核对**：
1. **引擎转正**：unit 三件 Environment 在位确认（P2P_GRAPH_ENGINE=ladybug/P2P_GRAPH=
   ladybug_db/LBUG_C_API_LIB_PATH）——转正形态=按 runbook 调整（kuzu 退役=requirements
   移除+测试轨切 ladybug 缺省；回滚=删三行+daemon-reload+restart，cutover-record 注释原文）。
2. **"开第二把锁"**：⚠ **仓内零命中（docs/code 全查）——定义待用户指认**。候选解读：
   ①实例互斥 flock 之外的第二道保护（无既有锚）②引擎开关移除后的依赖钉版锁 ③其他
   机制。指认前进不了变更窗口清单（OOB-1 同款处理：定义不明不执行）。
3. **G5 生产部署**：graphd systemd 重启加载新代码（systemctl --user restart d2d-graphd
   ——Restart=on-failure 语义下安全；生产库文件零触碰，kuzu/ladybug 库不迁移）；
   部署后 /health+held-finding admit 生产实测为验收。**前置依赖=拍板点②指认完成**。

## 零改动纪律声明
本批测量全程零代码/零部署/零重启/零配置；双轨复测=tmp 测试实例零生产写。

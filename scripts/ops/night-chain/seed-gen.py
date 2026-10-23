#!/usr/bin/env python3
# seed-gen.py <run-record-dir> — 从前棒 run record 提取夜班交接种子（目标 ≤9KB 封顶）
# 五项: 终版报告摘要+open leads+负向结论集+持留 findings+秘密路径进度
# E35-r2 实测: 章节匹配需兼容中文数字标题（槽 1「一、本腿成果」形态——阿拉伯 key 全脱靶）
import json, os, re, sys

rundir = sys.argv[1]
ws = os.path.join(rundir, 'workspace')
out = [f'# 夜班交接种子（自 {os.path.basename(rundir)}）', '',
'> 引用规范（E34）: 讨论前棒条目时用其 id（`H-n`/`F-n`/`L-n`——下表每条已带），',
'> 便于棒间机械对账; 下文 id→语义即对照表。', '']

hj = os.path.join(ws, 'handoff.json')
if os.path.exists(hj):
    h = json.load(open(hj))
    c = h.get('carriers', {})
    out.append(f"run_id: {h.get('run_id')}  generated_at: {h.get('generated_at')}")
    facts = c.get('facts', [])
    out.append(f"\n## 已证底账 facts（{len(facts)} 条——已计分/已入图, 不可重复提交）")
    for f in facts:
        out.append(f"- [{f.get('severity','?')}] {f.get('title','')[:150]}")
    leads = c.get('leads', [])
    held = [l for l in leads if l.get('origin') == 'held-manual']
    other = [l for l in leads if l.get('origin') != 'held-manual']
    out.append(f"\n## 持留 findings（host 重放未过——本棒 live-state 重验目标, {len(held)} 条）")
    for l in held:
        out.append(f"- {l.get('id','')}: {l.get('statement','')[:220]}")
    high = [l for l in other if l.get('priority') == 'high'][:10]
    out.append(f"\n## open leads（high 优先级前 {len(high)} 条/共 {len(other)} 条 open）")
    for l in high:
        out.append(f"- {l.get('id','')}: {l.get('statement','')[:220]}")
    fals = c.get('falsified', [])
    out.append(f"\n## 负向结论集（{len(fals)} 条——已证伪, 不重打）")
    for f in fals[:24]:
        s = f.get('statement') or f.get('reason') or ''
        out.append(f"- {f.get('id','')}: {s[:150]}")
    intents = c.get('intents', [])
    pend = [i for i in intents if i.get('status') == 'pending'][:8]
    if pend:
        out.append(f"\n## 前棒未完成方向 intents（{len(pend)} 条 pending）")
        for i in pend:
            out.append(f"- {i.get('id','')}: {i.get('direction','')[:180]}")

fr = os.path.join(ws, 'final-report.md')
if os.path.exists(fr):
    t = open(fr, encoding='utf-8').read()
    secs = re.split(r'(?m)^## ', t)
    # 章节匹配兼容阿拉伯/中文数字标题（槽 1 实证: 「一、本腿成果」形态——r2 patch）
    want = [('摘要|成果', 3500), ('负面|否证', 2600), ('卡片|秘密|20 位', 1800), ('自评|自审|撤回|合规', 2200), ('交接|未完成', 1600)]
    for key, cap in want:
        for s in secs:
            head = s.splitlines()[0][:40]
            if re.search(key, head):
                body = s.split('\n', 1)[-1][:cap]
                out.append(f"\n## [前棒报告·{head}]\n{body}")
                break

text = '\n'.join(out)
if len(text) > 9000:
    text = text[:9000] + '\n...[种子截断——完整报告见前棒 workspace/final-report.md]'
sys.stdout.write(text)

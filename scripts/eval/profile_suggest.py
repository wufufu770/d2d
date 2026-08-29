#!/usr/bin/env python3
"""profile_suggest.py <port> <profile.json> [--apply]
根治"profile 建模滞后于 worker 战果"(2026-08-29 第三次实证):
未匹配任何类关键词的 finding(FP)按 worker 自报 category 聚类 ->
  category 已是既有类名  -> 建议向该类追加标题关键词
  category 是新词        -> 建议新增该类(kw=类名+标题特征词)
--apply 直接写回 profile JSON(供人 review 后提交)。
"""
import json, sys, os, urllib.request
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from eval_profile import _norm, _auth_header  # 单点真源: 归一化与鉴权


def q(port, cypher):
    headers = {"Content-Type": "application/json"}
    tok = _auth_header()
    if tok:
        headers["X-Auth"] = tok
    req = urllib.request.Request(f"http://127.0.0.1:{port}/query",
        data=json.dumps({"cypher": cypher}).encode(), headers=headers)
    return json.loads(urllib.request.urlopen(req, timeout=10).read()).get("rows", [])


def main():
    port, prof_file = int(sys.argv[1]), sys.argv[2]
    apply_mode = "--apply" in sys.argv
    P = json.load(open(prof_file))
    rows = q(port, "MATCH (f:Finding) RETURN f.id AS id, f.title AS a, f.category AS c, f.repro AS b")
    all_kws = set(_norm(k) for s in P["classes"].values() for k in s["kw"])
    all_kws |= {_norm(c) for c in P["classes"]}
    fps = []
    for r in rows:
        text = _norm(f"{r.get('a') or ''} | {r.get('c') or ''} | {r.get('b') or ''}")
        if r.get("id") and not any(k in text for k in all_kws):
            fps.append(r)
    if not fps:
        print(json.dumps({"suggest": [], "note": "no unmatched findings"}, ensure_ascii=False))
        return
    STOP = {"the", "and", "via", "with", "allows", "without", "using", "from", "that", "this"}
    groups = {}
    for r in fps:
        cat = _norm(str(r.get("c") or "vuln"))[:40]
        toks = [t for t in _norm(str(r.get("a") or "")).split() if len(t) > 3 and t not in STOP]
        groups.setdefault(cat, {"ids": [], "toks": []})
        groups[cat]["ids"].append(r["id"])
        groups[cat]["toks"] += toks[:6]
    suggestions = []
    for cat, g in sorted(groups.items()):
        kws = list(dict.fromkeys([cat] + g["toks"]))[:4]
        if cat in P["classes"]:
            suggestions.append({"action": "extend_kw", "class": cat, "kw": kws[1:], "findings": g["ids"]})
        else:
            suggestions.append({"action": "new_class", "class": cat, "kw": kws, "findings": g["ids"]})
    print(json.dumps({"suggest": suggestions}, ensure_ascii=False, indent=1))
    if apply_mode:
        for s in suggestions:
            if s["action"] == "new_class":
                P["classes"][s["class"]] = {"kw": s["kw"]}
            else:
                P["classes"][s["class"]]["kw"] = list(dict.fromkeys(
                    P["classes"][s["class"]].get("kw", []) + s["kw"]))
        json.dump(P, open(prof_file, "w"), ensure_ascii=False, indent=1)
        print(f"[applied] {prof_file} 更新, 请 git diff 复核后提交")


if __name__ == "__main__":
    main()

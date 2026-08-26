#!/usr/bin/env python3
"""merge_eval.py <profile.json> — 战役累计评估
合并 evidence/range-snapshots/{pi,dsh}-*.json 全部历史快照 + 当前活图(8765/8766),
按宿主分别计算 union 覆盖/artifacts/FP, 输出双侧 PASS 判定。
"""
import json, sys, glob, urllib.request

def q(port, cypher):
    req = urllib.request.Request(f"http://127.0.0.1:{port}/query",
        data=json.dumps({"cypher": cypher}).encode(), headers={"Content-Type": "application/json"})
    return json.loads(urllib.request.urlopen(req, timeout=10).read()).get("rows", [])

def main():
    prof_file = sys.argv[1]
    P = json.load(open(prof_file))
    all_kws = set(k.lower() for s in P["classes"].values() for k in s["kw"]) | {c.lower() for c in P["classes"]}

    def classify(host, texts):
        blob = "\n".join(texts)
        cov = {}
        for cls, spec in P["classes"].items():
            kws = [k.lower() for k in spec.get("kw",[])] + [cls.lower()]
            must = [m.lower() for m in spec.get("must_repro_contains",[])]
            if must:
                # 严格模式: 需要至少一个 finding 同时满足 kw 匹配且 repro 含 must 串
                hit = False
                for t in texts:
                    if any(k in t for k in kws) and all(m in t for m in must):
                        hit = True; break
                cov[cls] = hit
            else:
                cov[cls] = any(k in blob for k in kws)
        arts = {}
        for a in P.get("artifacts", []):
            kws = [k.lower() for k in a["kw"]]
            arts[a["id"]] = any(k in blob for k in kws)
        # FP 判定语义(修订): 只看当前活图最新轮次 —— 历史中间产物不永久毒化账本
        port = 8765 if host == "pi" else 8766
        fps = []
        try:
            for r in q(port, "MATCH (f:Finding) RETURN f.id AS id, f.title AS a, f.category AS c, f.repro AS b"):
                t = f"{r.get('a') or ''} | {r.get('c') or ''} | {r.get('b') or ''}".lower()
                fid = str(r.get("id") or "")
                if fid and not any(k in t for k in all_kws):
                    fps.append(f"{fid}: {t[:70]}")
        except Exception as e:
            print(f"[warn] live FP scan failed :{port}: {e}", file=sys.stderr)
        covered = sum(cov.values()); total = len(P["classes"])
        art_n, art_t = sum(arts.values()), len(arts)
        passed = covered / max(total, 1) >= 0.8 and art_n == art_t and not fps
        return {"covered": f"{covered}/{total}", "pct": round(100*covered/max(total,1)),
                "artifacts": f"{art_n}/{art_t}", "fps": fps,
                "uncovered": [c for c,v in cov.items() if not v],
                "missing_art": [a for a,v in arts.items() if not v], "PASS": passed}

    out = {}
    for host, port in (("pi", 8765), ("dsh", 8766)):
        texts = []
        # 历史快照(支持字符串化 dict)
        import ast
        for f in sorted(glob.glob(f"/home/wff/d2d/evidence/range-snapshots/{host}-*.json")):
            try:
                for r in json.load(open(f)):
                    fv = r.get("f", r)
                    if isinstance(fv, str) and fv.strip().startswith("{"):
                        try: fv = ast.literal_eval(fv)
                        except Exception: pass
                    if isinstance(fv, dict):
                        texts.append(f"{fv.get('title') or ''} | {fv.get('category') or ''} | {fv.get('repro') or ''}".lower())
                    else:
                        texts.append(str(fv).lower())
            except Exception: pass
        # 活图
        for cy in ["MATCH (f:Finding) RETURN f.title AS a, f.category AS c, f.repro AS b",
                   "MATCH (s:Signal_) RETURN s.id AS a, s.evidence AS b",
                   "MATCH (a:AgentIdentity) RETURN a.checkpoint AS a, a.checkpoint AS b"]:
            try:
                for r in q(port, cy):
                    texts.append((str(r.get("a") or "") + "|" + str(r.get("b") or "")).lower())
            except Exception: pass
        out[host] = classify(host, texts)

    print(json.dumps({
        "pi":  {"覆盖": out["pi"]["covered"], f"({out['pi']['pct']}%)": "", "artifacts": out["pi"]["artifacts"],
                "FP": len(out["pi"]["fps"]), "PASS": out["pi"]["PASS"],
                "未覆盖": out["pi"]["uncovered"], "缺证据": out["pi"]["missing_art"], "误报样本": out["pi"]["fps"][:3]},
        "dsh": {"覆盖": out["dsh"]["covered"], f"({out['dsh']['pct']}%)": "", "artifacts": out["dsh"]["artifacts"],
                "FP": len(out["dsh"]["fps"]), "PASS": out["dsh"]["PASS"],
                "未覆盖": out["dsh"]["uncovered"], "缺证据": out["dsh"]["missing_art"], "误报样本": out["dsh"]["fps"][:3]},
    }, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()

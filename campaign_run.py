#!/usr/bin/env python3
"""自治50靶场战役: campaign_run.py <start_round> <end_round> [seed_base]
每轮: 生成靶场 -> 清engagement数据(保留经验) -> 双侧发射 -> 等完成/超时 -> 评估 -> 记录 -> 删靶场
R1R2同seed用于先验优势量化; 之后每轮独立seed。结果追加 campaign_results.jsonl"""
import json
import sys
import os
import subprocess
import time
import urllib.request

D2D = "/home/wff/d2d"
RESULTS = f"{D2D}/campaign_results.jsonl"


def q(port, cypher):
    try:
        req = urllib.request.Request(f"http://127.0.0.1:{port}/query",
            data=json.dumps({"cypher": cypher}).encode(), headers={"Content-Type": "application/json"})
        return json.loads(urllib.request.urlopen(req, timeout=10).read())
    except Exception as e:
        return {"ok": False, "error": str(e), "rows": []}


def clear_engagement_data():
    for port in (8765, 8766):
        for cy in ["MATCH (s:Signal_) DETACH DELETE s", "MATCH (x:Endpoint) DETACH DELETE x",
                   "MATCH (f:Finding) DETACH DELETE f", "MATCH (h:Hypothesis) DETACH DELETE h",
                   "MATCH (a:AgentIdentity) DETACH DELETE a", "MATCH (e:Engagement) DETACH DELETE e"]:
            q(port, cy)


def eng_status(port):
    rows = q(port, "MATCH (e:Engagement) WHERE e.status='completed' RETURN count(e) AS c").get("rows", [])
    return rows and rows[0]["c"] > 0


def wait_done(timeout_s=2100):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        d = eng_status(8766)
        p = eng_status(8765)
        if d and p:
            return "both_completed"
        if d or p:
            done_side = "dsh" if d else "pi"
            other_running = q(8765 if d else 8766, "MATCH (a:AgentIdentity) WHERE a.status='running' RETURN count(a) AS c").get("rows", [])
            n = other_running[0]["c"] if other_running else 1
            elapsed = time.time() - t0
            if elapsed > timeout_s * 0.75:
                return f"{done_side}_done_other_slow({n}running)"
        time.sleep(60)
    return "timeout"


def launch(side, target):
    env = dict(os.environ, R_TARGET=target, R_SCOPE="127.0.0.1", R_INST="2")
    subprocess.Popen(["node", f"{D2D}/round-launch.mjs", side], cwd=D2D, env=env,
                     stdout=open(f"{D2D}/camp-{side}-r.log", "a"), stderr=subprocess.STDOUT)


def main():
    start_r, end_r = int(sys.argv[1]), int(sys.argv[2])
    for rnd in range(start_r, end_r + 1):
        port = 8200 + (rnd % 400)
        seed = "prior-test" if rnd <= 2 else f"camp{rnd}"
        print(f"\n===== ROUND {rnd} port={port} seed={seed} =====", flush=True)
        # 清旧 engagement 数据(保留 ExperienceWeight)
        clear_engagement_data()
        # 启动靶场
        round_t0 = time.time()
        rng = subprocess.Popen(["python3", f"{D2D}/gen_range.py", str(rnd), str(port), seed],
                               stdout=open(f"{D2D}/ranges/gen_r{rnd}.log", "w"), stderr=subprocess.STDOUT)
        time.sleep(3)
        # 发射双侧
        subprocess.run(["rm", "-rf", "/tmp/jiti"], capture_output=True)
        launch("pi", f"http://127.0.0.1:{port}")
        time.sleep(4)
        launch("dsh", f"http://127.0.0.1:8080" if False else f"http://127.0.0.1:{port}")
        # 等待
        outcome = wait_done()
        print(f"[round {rnd}] outcome={outcome}", flush=True)
        # 评估
        truth_file = f"{D2D}/ranges/truth_r{rnd}.json"
        rec = {"round": rnd, "port": port, "outcome": outcome}
        for side, gport in (("pi", 8765), ("dsh", 8766)):
            try:
                ev = subprocess.run(["python3", f"{D2D}/eval_round.py", str(gport), truth_file],
                                    capture_output=True, text=True, timeout=60)
                rec[side] = json.loads(ev.stdout)
                rec[side]["duration_min"] = round((time.time() - round_t0) / 60, 1)
            except Exception as e:
                rec[side] = {"error": str(e)}
        with open(RESULTS, "a") as f:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
        for side, gport in (("pi", 8765), ("dsh", 8766)):
            try:
                comp = subprocess.run(["python3", f"{D2D}/compliance_check.py", str(gport), side],
                                      capture_output=True, text=True, timeout=60)
                score = [l for l in comp.stdout.splitlines() if "合规分" in l]
                items = [l.strip()[:60] for l in comp.stdout.splitlines() if l.strip().startswith(("✅","❌"))]
                rec[side]["compliance"] = {"score": score[0].split(":")[-1].strip() if score else "?",
                                           "fails": [i for i in items if i.startswith("❌")]}
            except Exception as e:
                rec[side]["compliance"] = {"error": str(e)[:100]}
        pi_pass = rec.get("pi", {}).get("PASS")
        dsh_pass = rec.get("dsh", {}).get("PASS")
        print(f"[round {rnd}] pi_PASS={pi_pass} dsh_PASS={dsh_pass}", flush=True)
        # 删靶场进程
        rng.kill() if rng.poll() is None else None
        subprocess.run(["pkill", "-f", f"gen_range.py {rnd} {port}"], capture_output=True)
        time.sleep(5)
    print("CAMPAIGN DONE", flush=True)


if __name__ == "__main__":
    main()

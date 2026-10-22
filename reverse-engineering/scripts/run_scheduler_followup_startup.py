"""Collect one cold-start/no-input SCN-0004 A window.

Usage: python3 reverse-engineering/scripts/run_scheduler_followup_startup.py baseline|trace 01
Each run uses a new working directory and never replaces existing evidence.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

sys.dont_write_bytecode = True
from scheduler_xdamage import measure

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-r3"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size, "sha256": h.hexdigest()}


def proc_sample(pid):
    stat = Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()
    return {"mono_ns": time.monotonic_ns(), "utime_ticks": int(stat[11]), "stime_ticks": int(stat[12]),
            "clock_ticks_per_second": os.sysconf("SC_CLK_TCK")}


def find_window(pid):
    tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
    frames = re.findall(r'(0x[0-9a-f]+) "FreeJ2ME-Plus"', tree)
    matching = []
    for frame in frames:
        prop = subprocess.run(["xprop", "-id", frame, "_NET_WM_PID"], text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False).stdout
        if re.search(r"_NET_WM_PID\(CARDINAL\) = " + str(pid) + r"\b", prop):
            matching.append(frame)
    if len(matching) != 1:
        raise RuntimeError(f"Expected one FreeJ2ME window for PID {pid}; frames={frames}; matching={matching}")
    return int(matching[0], 16), tree


def main():
    mode, repeat = sys.argv[1:]
    if mode not in ("baseline", "trace"):
        raise ValueError("mode must be baseline or trace")
    run = f"M15-SCN-0004-A-{mode}-R{repeat}"
    rd = EVIDENCE / run
    work = ROOT / "reference/recordings" / run
    shots = ROOT / "reference/screenshots" / run
    rd.mkdir(parents=True, exist_ok=False)
    work.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1"]
    if mode == "trace":
        argv += [f"-javaagent:{BUILD / 'probe.jar'}={rd / 'trace.jsonl'}|{run}"]
    argv += ["-jar", str(BUILD / "emulator-traced.jar" if mode == "trace" else EMU),
             GAME.as_uri() if mode == "baseline" else (BUILD / "game-traced.jar").as_uri(),
             "0", "240", "320", "2", "2", "60"]
    start_ns = time.monotonic_ns()
    with (rd / "console.log").open("w") as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
    write(rd / "launch.json", {
        "run_id": run, "pid": process.pid, "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mono_ns": start_ns, "argv": argv, "cwd": str(work.relative_to(ROOT)), "mode": mode,
        "scenario_variant": "A cold startup, no input; 5 s warm-up then 30 s measurement",
        "game_field_writes": False, "fixture": None, "rng_controlled": False,
        "host_display": os.environ.get("DISPLAY"), "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"
    })
    try:
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited before startup checkpoint: returncode={process.returncode}")
        window, tree = find_window(process.pid)
        (rd / "window-tree.txt").write_text(tree)
        subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                        str(rd / "checkpoint-x11.jsonl"), "capture", hex(window),
                        str(shots / "10s-no-input.png")], check=True)
        time.sleep(5)
        before = proc_sample(process.pid)
        subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                        str(rd / "checkpoint-x11.jsonl"), "capture", hex(window),
                        str(shots / "15s-window-start.png")], check=True)
        result = measure(window, 30, rd / "xdamage.json")
        after = proc_sample(process.pid)
        write(rd / "process-window.json", {"before": before, "after": after})
        subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                        str(rd / "checkpoint-x11.jsonl"), "capture", hex(window),
                        str(shots / "45s-window-end.png")], check=True)
        write(rd / "window.json", {"start_mono_ns": result["start_ns"], "end_mono_ns": result["end_ns"],
                                  "duration_seconds": result["seconds"], "xdamage_events": len(result["events"]),
                                  "physical_presentation": False})
        write(rd / "stop.json", {"requested": "SIGTERM", "mono_ns": time.monotonic_ns()})
    except Exception as e:
        write(rd / "invalid.json", {"error": repr(e), "mono_ns": time.monotonic_ns()})
        raise
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        write(rd / "process-exit.json", {"returncode": process.returncode,
                                          "proc_absent": not Path(f"/proc/{process.pid}").exists(),
                                          "mono_ns": time.monotonic_ns()})
    console = (rd / "console.log").read_text(errors="replace") if (rd / "console.log").exists() else ""
    fatal = any(marker in console for marker in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "'))
    if fatal:
        write(rd / "invalid.json", {"reason": "fatal emulator/application thread error in console",
                                     "markers": [m for m in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "') if m in console]})
    if mode == "trace" and not (rd / "trace-health.json").exists():
        write(rd / "invalid.json", {"reason": "trace agent did not flush trace-health.json"})
        fatal = True
    files = [p for p in rd.rglob("*") if p.is_file() and p.name != "manifest.json"]
    files.extend(p for p in shots.rglob("*") if p.is_file())
    write(rd / "manifest.json", {"run_id": run, "files": [digest(p) for p in sorted(files)]})
    print(json.dumps({"run_id": run, "valid": not fatal, "xdamage_events": len(result["events"]),
                      "trace": (rd / "trace.jsonl").exists(),
                      "manifest": str((rd / "manifest.json").relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()

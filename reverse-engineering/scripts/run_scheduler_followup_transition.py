"""Capture a real save-load screen transition for SCN-0004 variant D.

Usage: python3 reverse-engineering/scripts/run_scheduler_followup_transition.py baseline|trace 01
The run starts from HOUSE-INPUT-001 and reaches the save only through the UI.
"""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import threading
import time

sys.dont_write_bytecode = True
from scheduler_xdamage import measure

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-r6"
SIDECARS = ROOT / "reference/recordings/scheduler-sidecars"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
SNAPSHOT = ROOT / "reference/recordings/snapshots/HOUSE-INPUT-001"
SNAPSHOT_MANIFEST = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0006-P1M-R05L/HOUSE-INPUT-001-storage.json"


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def append(path, event, **fields):
    row = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "mono_ns": time.monotonic_ns(), "event": event, **fields}
    with path.open("a") as f:
        f.write(json.dumps(row, ensure_ascii=False) + "\n")


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size, "sha256": h.hexdigest()}


def copy_fixture(destination):
    meta = json.loads(SNAPSHOT_MANIFEST.read_text())
    shutil.copytree(SNAPSHOT, destination)
    checks = []
    for item in meta["files"]:
        path = destination / item["relative_path"]
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        valid = path.stat().st_size == item["size"] and actual == item["sha256"]
        checks.append({"path": item["relative_path"], "size": path.stat().st_size,
                       "sha256": actual, "valid": valid})
        if not valid:
            raise RuntimeError(f"Fixture verification failed: {path}")
    return checks


def proc_sample(pid):
    stat = Path(f"/proc/{pid}/stat").read_text().split(") ", 1)[1].split()
    return {"mono_ns": time.monotonic_ns(), "utime_ticks": int(stat[11]), "stime_ticks": int(stat[12]),
            "clock_ticks_per_second": os.sysconf("SC_CLK_TCK")}


def find_window(pid):
    tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
    # AWT may leave the top-level frame unnamed in xwininfo's tree even while
    # WM_NAME is set. Discover candidate XIDs from the tree and identify the
    # frame by its _NET_WM_PID instead of relying on the printed title.
    frames = list(dict.fromkeys(re.findall(r'\b(0x[0-9a-f]+)\b', tree)))
    matching = []
    for frame in frames:
        prop = subprocess.run(["xprop", "-id", frame, "_NET_WM_PID"], text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False).stdout
        if re.search(r"_NET_WM_PID\(CARDINAL\) = " + str(pid) + r"\b", prop):
            matching.append(frame)
    if len(matching) != 1:
        raise RuntimeError(f"Expected one FreeJ2ME window for PID {pid}; frames={frames}; matching={matching}")
    return int(matching[0], 16), tree


def capture(window, log, image):
    subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                    str(log), "capture", hex(window), str(image)], check=True)


def agent(pid, jar, args):
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(SIDECARS),
                    "RuntimeStateProbe", str(pid), str(jar), args], check=True)


def tap(pid, rd, index, window, timeline, shots, checkpoint, post_wait=1):
    out = rd / f"input-{index:02d}.log"
    append(timeline, "synthetic_key_press_begin", step=index, awt_code=10, hold_ms=10)
    agent(pid, SIDECARS / "probe-current.jar", f"{out}|10|10")
    append(timeline, "synthetic_key_press_end", step=index, awt_code=10, hold_ms=10)
    time.sleep(post_wait)
    capture(window, rd / "checkpoint-x11.jsonl", shots / checkpoint)
    append(timeline, "x11_checkpoint", step=index, label=checkpoint)


def main():
    mode, repeat = sys.argv[1:]
    if mode not in ("baseline", "trace"):
        raise ValueError("mode must be baseline or trace")
    run = f"M15-SCN-0004-D-{mode}-R{repeat}"
    rd = EVIDENCE / run
    work = ROOT / "reference/recordings" / run
    shots = ROOT / "reference/screenshots" / run
    rd.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    checks = copy_fixture(work)
    write(rd / "fixture-verification.json", {"source_manifest": str(SNAPSHOT_MANIFEST.relative_to(ROOT)),
                                               "verified_files": len(checks), "files": checks})
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
        "scenario_variant": "D real UI save-load transition, pending command and worker observed",
        "fixture": "HOUSE-INPUT-001", "synthetic_input": "AWT LCD KeyListener sidecar; not physical",
        "game_field_writes": False, "rng_controlled": False, "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"
    })
    timeline = rd / "timeline.jsonl"
    measurement = {}
    failures = []
    observer = None
    try:
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited before UI route: returncode={process.returncode}")
        window, tree = find_window(process.pid)
        (rd / "window-tree.txt").write_text(tree)
        capture(window, rd / "checkpoint-x11.jsonl", shots / "01-startup.png")
        append(timeline, "startup_checkpoint", no_input_seconds=10)

        cpu_before = proc_sample(process.pid)
        ready = threading.Event()
        def observe():
            try:
                ready.set()
                measurement["xdamage"] = measure(window, 30, rd / "xdamage.json")
            except Exception as e:
                measurement["error"] = repr(e)
        observer = threading.Thread(target=observe, name=f"{run}-xdamage", daemon=True)
        observer.start()
        ready.wait(timeout=2)
        append(timeline, "transition_window_started", requested_seconds=30)

        tap(process.pid, rd, 1, window, timeline, shots, "02-menu.png")
        tap(process.pid, rd, 2, window, timeline, shots, "03-load-Ronin.png")
        tap(process.pid, rd, 3, window, timeline, shots, "04-after-load.png", post_wait=10)
        if mode == "trace":
            agent(process.pid, SIDECARS / "probe-current.jar", str(rd / "state-after-load.log"))
        observer.join(timeout=35)
        if observer.is_alive():
            raise RuntimeError("XDamage observer did not finish within 35 seconds")
        cpu_after = proc_sample(process.pid)
        write(rd / "process-window.json", {"before": cpu_before, "after": cpu_after})
        append(timeline, "transition_window_finished", result=measurement.get("xdamage", {}).get("events") and len(measurement["xdamage"]["events"]))
        write(rd / "window.json", {"start_mono_ns": measurement.get("xdamage", {}).get("start_ns"),
                                  "end_mono_ns": measurement.get("xdamage", {}).get("end_ns"),
                                  "duration_seconds": measurement.get("xdamage", {}).get("seconds"),
                                  "xdamage_events": len(measurement.get("xdamage", {}).get("events", [])),
                                  "includes_input_and_loading_transition": True,
                                  "physical_presentation": False})
    except Exception as e:
        failures.append(repr(e))
        write(rd / "invalid.json", {"reason": "runner failure", "error": repr(e)})
    finally:
        if observer and observer.is_alive():
            observer.join(timeout=35)
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

    console = (rd / "console.log").read_text(errors="replace")
    fatal_markers = [m for m in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "') if m in console]
    if fatal_markers:
        failures.append("fatal console markers: " + ", ".join(fatal_markers))
    if measurement.get("error"):
        failures.append(measurement["error"])
    if mode == "trace" and not (rd / "trace-health.json").exists():
        failures.append("trace agent did not flush trace-health.json")
    if mode == "trace" and (rd / "trace-health.json").exists():
        health = json.loads((rd / "trace-health.json").read_text())
        if health.get("dropped", 0) or health.get("field_read_errors", 0):
            failures.append(f"trace health not clean: dropped={health.get('dropped')} field_read_errors={health.get('field_read_errors')}")
    if failures:
        write(rd / "invalid.json", {"run_id": run, "valid": False, "reasons": failures})
    else:
        write(rd / "valid.json", {"run_id": run, "valid": True,
                                  "xdamage_events": len(measurement.get("xdamage", {}).get("events", []))})
    files = [p for p in rd.rglob("*") if p.is_file() and p.name != "manifest.json"]
    files.extend(p for p in shots.rglob("*") if p.is_file())
    write(rd / "manifest.json", {"run_id": run, "files": [digest(p) for p in sorted(files)]})
    print(json.dumps({"run_id": run, "valid": not failures,
                      "xdamage_events": len(measurement.get("xdamage", {}).get("events", [])),
                      "workers_trace_path": str((rd / "trace.jsonl").relative_to(ROOT)) if mode == "trace" else None,
                      "manifest": str((rd / "manifest.json").relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()

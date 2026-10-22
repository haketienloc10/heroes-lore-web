"""Explore natural input routes that may reach uncovered SCN-0004 branches.

This is a trace-only branch scout, not a cadence trial. It starts from
HOUSE-INPUT-001 and uses the UI plus synthetic AWT KeyListener input.
"""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_scheduler_followup_transition as common

ROOT = common.ROOT
EVIDENCE = common.EVIDENCE
BUILD = common.BUILD
SIDECARS = common.SIDECARS
GAME = common.GAME
SNAPSHOT = common.SNAPSHOT
RUN = "M15-SCN-0004-E-state-scout-R01"


def append(path, event, **fields):
    row = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "mono_ns": time.monotonic_ns(), "event": event, **fields}
    with path.open("a") as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def capture(window, rd, shots, filename, timeline):
    image = shots / filename
    subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                    str(rd / "checkpoint-x11.jsonl"), "capture", hex(window), str(image)],
                   check=True)
    append(timeline, "x11_checkpoint", label=filename, output=str(image.relative_to(ROOT)))


def send(pid, rd, code, hold_ms, wait_ms, step, window, shots, timeline):
    output = rd / f"input-{step:02d}.log"
    append(timeline, "synthetic_key_begin", step=step, awt_key_code=code, hold_ms=hold_ms)
    common.agent(pid, SIDECARS / "probe-current.jar", f"{output}|{code}|{hold_ms}")
    append(timeline, "synthetic_key_end", step=step, awt_key_code=code, hold_ms=hold_ms)
    time.sleep(wait_ms / 1000)
    state = rd / f"state-after-step-{step:02d}.log"
    common.agent(pid, SIDECARS / "probe-current.jar", str(state))
    capture(window, rd, shots, f"step-{step:02d}-key-{code}.png", timeline)


def main():
    rd = EVIDENCE / RUN
    work = ROOT / "reference/recordings" / RUN
    shots = ROOT / "reference/screenshots" / RUN
    rd.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    fixture = common.copy_fixture(work)
    common.write(rd / "fixture-verification.json", {
        "source_manifest": str(common.SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "verified_files": len(fixture), "files": fixture})

    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{BUILD / 'probe.jar'}={rd / 'trace.jsonl'}|{RUN}",
            "-jar", str(BUILD / "emulator-traced.jar"),
            (BUILD / "game-traced.jar").as_uri(), "0", "240", "320", "2", "2", "60"]
    started = time.monotonic_ns()
    with (rd / "console.log").open("w") as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    common.write(rd / "launch.json", {
        "run_id": RUN, "pid": process.pid,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mono_ns": started, "argv": argv, "cwd": str(work.relative_to(ROOT)),
        "mode": "trace-only exploratory branch scout",
        "fixture": "HOUSE-INPUT-001",
        "input": "synthetic AWT KeyListener; no physical repeat claim",
        "game_field_writes": False, "rng_controlled": False,
        "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"})
    timeline = rd / "timeline.jsonl"
    try:
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"emulator exited before route: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree.txt").write_text(tree)
        capture(window, rd, shots, "01-startup.png", timeline)

        step = 0
        # Load the known house through the UI: startup -> menu -> Load Game -> Ronin.
        for wait_ms in (1000, 1000, 10000):
            step += 1
            send(process.pid, rd, 10, 10, wait_ms, step, window, shots, timeline)

        # Reproduce the documented two Down holds to leave the house, then
        # explore the nearby NPC/action route that did not open dialogue before.
        for code, hold, wait in ((98, 1000, 1000), (98, 1000, 5000),
                                 (100, 1000, 1000), (100, 1000, 1000),
                                 (101, 100, 2000), (10, 100, 2000),
                                 (87, 100, 1000), (87, 100, 1000)):
            step += 1
            send(process.pid, rd, code, hold, wait, step, window, shots, timeline)

        common.write(rd / "scout-summary.json", {
            "run_id": RUN, "steps": step,
            "purpose": "observe natural state/flag/paint returns while leaving HOUSE-INPUT and trying nearby interaction",
            "cadence_sample": False,
            "state_values_from_sidecar_are_sequential_snapshots": True,
            "synthetic_input_is_not_physical": True})
    except Exception as exc:
        common.write(rd / "scout-error.json", {"error": repr(exc), "mono_ns": time.monotonic_ns()})
        raise
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        common.write(rd / "process-exit.json", {
            "returncode": process.returncode,
            "proc_absent": not Path(f"/proc/{process.pid}").exists(),
            "mono_ns": time.monotonic_ns()})

    files = [p for p in rd.rglob("*") if p.is_file() and p.name != "manifest.json"]
    files.extend(p for p in shots.rglob("*") if p.is_file())
    common.write(rd / "manifest.json", {
        "run_id": RUN,
        "files": [common.digest(p) for p in sorted(files)]})
    print(json.dumps({"run_id": RUN, "trace": str((rd / "trace.jsonl").relative_to(ROOT)),
                      "manifest": str((rd / "manifest.json").relative_to(ROOT)),
                      "steps": step}, ensure_ascii=False))


if __name__ == "__main__":
    main()

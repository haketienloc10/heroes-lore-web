"""Explore the central house exit and nearby interaction route from a fresh fixture."""
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_scheduler_followup_state_scout as scout

common = scout.common
ROOT = common.ROOT
EVIDENCE = common.EVIDENCE
BUILD = common.BUILD
SIDECARS = common.SIDECARS
RUN = "M15-SCN-0004-E-exit-scout-R03"


def send_overlapping_key_pair(pid, rd, down_step, down_code, down_hold_ms,
                              overlap_code, overlap_hold_ms, start_overlap_after_ms):
    """Overlap a second AWT key with the doorway transition input."""
    down_log = rd / f"input-{down_step:02d}-down-agent.log"
    overlap_log = rd / f"input-{down_step:02d}-overlap-agent.log"
    down_out = rd / f"input-{down_step:02d}.log"
    down_args = ["java", "--add-modules", "jdk.attach", "-cp", str(SIDECARS),
                 "RuntimeStateProbe", str(pid), str(SIDECARS / "probe-current.jar"),
                 f"{down_out}|{down_code}|{down_hold_ms}"]
    scout.append(rd / "timeline.jsonl", "synthetic_key_begin", step=down_step,
                 awt_key_code=down_code, hold_ms=down_hold_ms)
    with down_log.open("w") as log:
        down_proc = subprocess.Popen(down_args, stdout=log, stderr=subprocess.STDOUT)
    time.sleep(start_overlap_after_ms / 1000)
    overlap_out = rd / f"input-{down_step:02d}-overlap.log"
    overlap_args = ["java", "--add-modules", "jdk.attach", "-cp", str(SIDECARS),
                    "RuntimeStateProbe", str(pid), str(SIDECARS / "probe-current.jar"),
                    f"{overlap_out}|{overlap_code}|{overlap_hold_ms}"]
    scout.append(rd / "timeline.jsonl", "synthetic_key_overlap_begin", step=down_step,
                 awt_key_code=overlap_code, hold_ms=overlap_hold_ms,
                 delay_after_down_begin_ms=start_overlap_after_ms)
    with overlap_log.open("w") as log:
        overlap_proc = subprocess.Popen(overlap_args, stdout=log, stderr=subprocess.STDOUT)
    overlap_rc = overlap_proc.wait(timeout=30)
    scout.append(rd / "timeline.jsonl", "synthetic_key_overlap_end", step=down_step,
                 awt_key_code=overlap_code, returncode=overlap_rc)
    down_rc = down_proc.wait(timeout=30)
    scout.append(rd / "timeline.jsonl", "synthetic_key_end", step=down_step,
                 awt_key_code=down_code, hold_ms=down_hold_ms, returncode=down_rc)
    if overlap_rc or down_rc:
        raise RuntimeError(f"overlapping key agents returned {down_rc}/{overlap_rc}")


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
    with (rd / "console.log").open("w") as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    common.write(rd / "launch.json", {
        "run_id": RUN, "pid": process.pid,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mono_ns": time.monotonic_ns(), "argv": argv,
        "cwd": str(work.relative_to(ROOT)), "mode": "trace-only route and interaction scout",
        "fixture": "HOUSE-INPUT-001", "game_field_writes": False,
        "input": "synthetic AWT KeyListener; not physical",
        "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"})
    timeline = rd / "timeline.jsonl"
    step = 0
    try:
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"emulator exited before route: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree.txt").write_text(tree)
        scout.capture(window, rd, shots, "01-startup.png", timeline)

        # UI load of the known house save.
        for wait_ms in (1000, 1000, 10000):
            step += 1
            scout.send(process.pid, rd, 10, 10, wait_ms, step, window, shots, timeline)

        # The save starts in the lower-left room. Move to the central hallway,
        # down through the exit, then try the nearby action and confirm keys.
        sequence = (
            (102, 1000, 1000),
        )
        for code, hold, wait in sequence:
            step += 1
            scout.send(process.pid, rd, code, hold, wait, step, window, shots, timeline)

        # In R02 the house-to-street transition began about 0.93 s into this
        # Down hold and the loading state lasted about 0.29 s. Send W during
        # that interval to see whether state 4 routes it through ag.a(II)V.
        step += 1
        send_overlapping_key_pair(process.pid, rd, step, 98, 1000, 87, 100, 750)
        time.sleep(2000 / 1000)
        state = rd / f"state-after-step-{step:02d}.log"
        common.agent(process.pid, SIDECARS / "probe-current.jar", str(state))
        scout.capture(window, rd, shots, f"step-{step:02d}-overlap.png", timeline)

        sequence = (
            (98, 1000, 5000),
            (100, 1500, 2000),
            (101, 100, 1500), (10, 100, 2000),
            (87, 100, 1000), (87, 100, 1000),
        )
        for code, hold, wait in sequence:
            step += 1
            scout.send(process.pid, rd, code, hold, wait, step, window, shots, timeline)

        common.write(rd / "scout-summary.json", {
            "run_id": RUN, "steps": step,
            "purpose": "route from lower-left house spawn through the central exit and try nearby interaction",
            "cadence_sample": False,
            "state_snapshots_are_sequential": True,
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
        "run_id": RUN, "files": [common.digest(p) for p in sorted(files)]})
    print(json.dumps({"run_id": RUN, "steps": step,
                      "manifest": str((rd / "manifest.json").relative_to(ROOT))},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

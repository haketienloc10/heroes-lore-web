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
RUN = "M15-SCN-0004-E-exit-scout-R04"


def send_without_snapshot(pid, rd, code, hold_ms, wait_ms, step,
                          window, shots, timeline):
    """Inject input and capture X11 without attaching a reflective snapshot."""
    output = rd / f"input-{step:02d}.log"
    scout.append(timeline, "synthetic_key_begin", step=step,
                 awt_key_code=code, hold_ms=hold_ms)
    common.agent(pid, SIDECARS / "probe-current.jar", f"{output}|{code}|{hold_ms}")
    scout.append(timeline, "synthetic_key_end", step=step,
                 awt_key_code=code, hold_ms=hold_ms)
    time.sleep(wait_ms / 1000)
    scout.capture(window, rd, shots, f"step-{step:02d}-key-{code}.png", timeline)


def send_overlapping_key_pair(pid, rd, down_step, down_code, down_hold_ms,
                              overlap_code, overlap_hold_ms, start_overlap_after_ms):
    """Send both keys from one sequence agent to avoid attach serialization."""
    plan = rd / f"input-{down_step:02d}-overlap.plan"
    trailing_wait = down_hold_ms - start_overlap_after_ms - overlap_hold_ms
    if trailing_wait < 0:
        raise ValueError("overlap timing exceeds Down hold")
    plan.write_text(
        f"down {down_code}\nwait {start_overlap_after_ms}\n"
        f"down {overlap_code}\nwait {overlap_hold_ms}\n"
        f"up {overlap_code}\nwait {trailing_wait}\nup {down_code}\n")
    scout.append(rd / "timeline.jsonl", "synthetic_key_begin", step=down_step,
                 awt_key_code=down_code, hold_ms=down_hold_ms)
    scout.append(rd / "timeline.jsonl", "synthetic_key_overlap_begin", step=down_step,
                 awt_key_code=overlap_code, hold_ms=overlap_hold_ms,
                 delay_after_down_begin_ms=start_overlap_after_ms)
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(SIDECARS),
                    "RuntimeStateProbe", str(pid), str(SIDECARS / "sequence-probe.jar"),
                    f"{rd}|{plan}|{ROOT / 'reference/screenshots' / RUN}"], check=True)
    scout.append(rd / "timeline.jsonl", "synthetic_key_end", step=down_step,
                 awt_key_code=down_code, hold_ms=down_hold_ms)
    scout.append(rd / "timeline.jsonl", "synthetic_key_overlap_end", step=down_step,
                 awt_key_code=overlap_code)


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
            send_without_snapshot(process.pid, rd, 10, 10, wait_ms, step,
                                  window, shots, timeline)

        # The save starts in the lower-left room. Move to the central hallway,
        # down through the exit, then try the nearby action and confirm keys.
        sequence = (
            (102, 1000, 1000),
        )
        for code, hold, wait in sequence:
            step += 1
            send_without_snapshot(process.pid, rd, code, hold, wait, step,
                                  window, shots, timeline)

        # In R02 the house-to-street transition began about 0.93 s into this
        # Down hold and the loading state lasted about 0.29 s. Replay W during
        # that interval through one sequence sidecar to avoid attach delays.
        step += 1
        send_overlapping_key_pair(process.pid, rd, step, 98, 1500, 87, 100, 950)
        time.sleep(2000 / 1000)
        scout.capture(window, rd, shots, f"step-{step:02d}-overlap.png", timeline)

        sequence = (
            (98, 1000, 5000),
            (100, 1500, 2000),
            (101, 100, 1500), (10, 100, 2000),
            (87, 100, 1000), (87, 100, 1000),
        )
        for code, hold, wait in sequence:
            step += 1
            send_without_snapshot(process.pid, rd, code, hold, wait, step,
                                  window, shots, timeline)

        common.write(rd / "scout-summary.json", {
            "run_id": RUN, "steps": step,
            "purpose": "route from lower-left house spawn through the central exit and try nearby interaction",
            "cadence_sample": False,
            "state_snapshots_collected": False,
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

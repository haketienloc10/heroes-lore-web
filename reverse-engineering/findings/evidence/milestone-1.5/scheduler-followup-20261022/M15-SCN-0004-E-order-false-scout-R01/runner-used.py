"""Reach the br.d=false render-order branch through the game's settings UI.

Trace-only exploratory run from HOUSE-INPUT-001. The option is toggled using
normal AWT KeyListener input; no game field is written by the harness.
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
import run_scheduler_followup_state_scout as scout

common = scout.common
ROOT = common.ROOT
EVIDENCE = common.EVIDENCE
BUILD = common.BUILD
SIDECARS = common.SIDECARS
RUN = "M15-SCN-0004-E-order-false-scout-R01"


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
        "cwd": str(work.relative_to(ROOT)),
        "mode": "trace-only natural settings branch scout",
        "fixture": "HOUSE-INPUT-001",
        "input": "synthetic AWT KeyListener; no physical input claim",
        "game_field_writes": False, "rng_controlled": False,
        "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"})
    timeline = rd / "timeline.jsonl"
    step = 0

    def capture(label):
        scout.capture(window, rd, shots, label + ".png", timeline)

    def tap(code, wait_ms=500, hold_ms=100):
        nonlocal step
        step += 1
        output = rd / f"input-{step:02d}.log"
        scout.append(timeline, "synthetic_key_begin", step=step,
                     awt_key_code=code, hold_ms=hold_ms)
        common.agent(process.pid, SIDECARS / "probe-current.jar",
                     f"{output}|{code}|{hold_ms}")
        scout.append(timeline, "synthetic_key_end", step=step,
                     awt_key_code=code, hold_ms=hold_ms)
        time.sleep(wait_ms / 1000)

    try:
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"emulator exited before route: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree.txt").write_text(tree)
        capture("01-startup")

        # Startup -> main menu -> Load Game -> Ronin -> HOUSE-INPUT save.
        tap(10, 1000, 100); capture("02-main-menu")
        tap(10, 1000, 100); capture("03-load-selection")
        tap(10, 10000, 100); capture("04-loaded-gameplay")

        # Open Status, move to System tab (five right steps), choose Options.
        tap(87, 1000); capture("05-status")
        for _ in range(5):
            tap(39, 300)
        capture("06-system")
        tap(40, 300); tap(40, 300); capture("07-options-selected")
        tap(10, 1000); capture("08-settings")

        # bd row 3 controls br.d:Z. Move there and toggle once via Right.
        for _ in range(3):
            tap(40, 300)
        capture("09-order-row-selected")
        tap(39, 1000); capture("10-order-toggled")

        # Settings Back saves the normal preference to this run's working copy.
        tap(87, 1000); capture("11-settings-return")
        tap(87, 1000); capture("12-system-return")
        tap(87, 1000); capture("13-gameplay-return")
        time.sleep(5000)
        capture("14-gameplay-after-toggle")

        common.write(rd / "scout-summary.json", {
            "run_id": RUN, "steps": step,
            "purpose": "observe br.d=false after normal in-game Settings toggle",
            "cadence_sample": False,
            "settings_changed_via_ui": True,
            "game_field_writes": False,
            "state_snapshots_collected": False,
            "synthetic_input_is_not_physical": True})
    except Exception as exc:
        common.write(rd / "scout-error.json", {"error": repr(exc), "mono_ns": time.monotonic_ns()})
        raise
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=30)
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
                      "trace": str((rd / "trace.jsonl").relative_to(ROOT)),
                      "manifest": str((rd / "manifest.json").relative_to(ROOT))},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

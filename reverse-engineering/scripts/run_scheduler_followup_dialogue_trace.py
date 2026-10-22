"""Open a user-operated SCN-0004 trace build with ag.a(II)V instrumentation."""
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
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-dialogue-r1"
RUN = "M15-SCN-0004-E-dialogue-trace-R02"


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
            f"-javaagent:{BUILD / 'probe-dialogue.jar'}={rd / 'trace.jsonl'}|{RUN}",
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
        "mode": "user-operated trace-only session; original game/emulator artifacts remain unchanged",
        "fixture": "HOUSE-INPUT-001",
        "instrumented_game_sha256": common.hashlib.sha256((BUILD / "game-traced.jar").read_bytes()).hexdigest(),
        "instrumented_emulator_sha256": common.hashlib.sha256((BUILD / "emulator-traced.jar").read_bytes()).hexdigest(),
        "trace_target": "ag.a(II)V entry and normal return, plus existing r6 scheduler/render hooks",
        "input": "user-operated window; no input injection or game-field writes",
        "rng_controlled": False, "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"})
    timeline = rd / "timeline.jsonl"
    try:
        time.sleep(8)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree-startup.txt").write_text(tree)
        common.capture(window, rd / "checkpoint-x11.jsonl", shots / "01-startup.png")
        title = "FreeJ2ME-Plus - SCN-0004 dialogue trace"
        subprocess.run(["xprop", "-id", hex(window), "-set", "WM_NAME", title], check=True)
        subprocess.run(["xprop", "-id", hex(window), "-f", "_NET_WM_NAME", "8s",
                        "-set", "_NET_WM_NAME", title], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        common.append(timeline, "interactive_trace_ready", window=hex(window), title=title,
                      screenshot=str((shots / "01-startup.png").relative_to(ROOT)),
                      target="ag.a(II)V")
        (rd / "operator-guide.md").write_text(
            "# User-operated dialogue trace\n\n"
            "Use the window titled `FreeJ2ME-Plus - SCN-0004 dialogue trace`. Load the same Ronin save, "
            "reach the Villager and open the dialogue. Stop at the first dialogue page so it can be captured. "
            "After that checkpoint, continue through the conversation and close this trace window to flush the trace.\n\n"
            "The trace build instruments `ag.a(II)V` entry/normal return and carries the existing scheduler/render hooks. "
            "It runs from an isolated copy of HOUSE-INPUT-001. The original JARs are not modified.\n")
        print(json.dumps({"run_id": RUN, "pid": process.pid, "window": hex(window),
                          "title": title, "startup_screenshot": str((shots / "01-startup.png").relative_to(ROOT)),
                          "instruction": "Reach and open the Villager dialogue, then pause for a screenshot."}, ensure_ascii=False))
    except Exception as exc:
        common.write(rd / "startup-error.json", {"error": repr(exc), "mono_ns": time.monotonic_ns()})
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        raise


if __name__ == "__main__":
    main()

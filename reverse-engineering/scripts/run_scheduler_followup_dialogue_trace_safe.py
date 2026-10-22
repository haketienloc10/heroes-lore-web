"""Open a clean user-operated trace window for SCN-0004 dialogue input."""
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
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-dialogue-r2"
RUN = "M15-SCN-0004-E-dialogue-trace-R03"


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
            f"-javaagent:{BUILD / 'probe-dialogue-safe.jar'}={rd / 'trace.jsonl'}|{RUN}",
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
        "mode": "user-operated trace-only session; original artifacts remain unchanged",
        "fixture": "HOUSE-INPUT-001",
        "instrumented_game_sha256": common.hashlib.sha256((BUILD / "game-traced.jar").read_bytes()).hexdigest(),
        "instrumented_emulator_sha256": common.hashlib.sha256((BUILD / "emulator-traced.jar").read_bytes()).hexdigest(),
        "trace_target": ["ar.keyPressed(I)V", "ag.a(II)V"],
        "probe_reflection": False, "game_state_reads": False,
        "input": "user-operated window; no input injection or game-field writes",
        "rng_controlled": False, "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"})
    try:
        time.sleep(8)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree-startup.txt").write_text(tree)
        common.capture(window, rd / "checkpoint-x11.jsonl", shots / "01-startup.png")
        title = "FreeJ2ME-Plus - SCN-0004 dialogue trace safe"
        subprocess.run(["xprop", "-id", hex(window), "-set", "WM_NAME", title], check=True)
        subprocess.run(["xprop", "-id", hex(window), "-f", "_NET_WM_NAME", "8s",
                        "-set", "_NET_WM_NAME", title], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        common.append(rd / "timeline.jsonl", "interactive_trace_ready", window=hex(window),
                      title=title, screenshot=str((shots / "01-startup.png").relative_to(ROOT)),
                      targets=["ar.keyPressed(I)V", "ag.a(II)V"], reflection=False)
        common.write(rd / "session-status.json", {
            "run_id": RUN, "captured_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "pid": process.pid, "pid_alive": True, "status": "waiting for user-operated route to Villager dialogue",
            "user_input_started": False, "harness_input_sent": False,
            "trace_output": "DialogueTraceProbe retains a bounded two-method trace and flushes on shutdown",
            "trace_targets": ["ar.keyPressed(I)V", "ag.a(II)V"],
            "probe_reflection": False, "game_state_reads": False,
            "next_checkpoint": "pause at first Villager dialogue page for paired presentation capture"})
        (rd / "operator-guide.md").write_text(
            "# User-operated dialogue trace\n\n"
            "Use the window titled `FreeJ2ME-Plus - SCN-0004 dialogue trace safe`. Load the Ronin save, "
            "reach the Villager, open the dialogue, and pause at its first page. After that checkpoint, "
            "continue through the conversation and close this trace window to flush the two-method trace.\n\n"
            "This build records only `ar.keyPressed(I)V` and `ag.a(II)V`. It performs no reflection, "
            "game-state reads, input injection, or game-field writes. It runs from an isolated fixture copy.\n")
        print(json.dumps({"run_id": RUN, "pid": process.pid, "window": hex(window),
                          "title": title, "startup_screenshot": str((shots / "01-startup.png").relative_to(ROOT)),
                          "instruction": "Reach the Villager dialogue and pause at its first page."}, ensure_ascii=False))
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

"""Open a clean user-operated trace window for the state-2 Camera branch."""
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
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-render-r1"
RUN = "M15-SCN-0004-E-render-order-R01"


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
            f"-javaagent:{BUILD / 'probe-render-order-safe.jar'}={rd / 'trace.jsonl'}|{RUN}",
            "-jar", str(common.EMU), (BUILD / "game-traced.jar").as_uri(), "0", "240", "320", "2", "2", "60"]
    started = time.monotonic_ns()
    with (rd / "console.log").open("w") as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    common.write(rd / "launch.json", {
        "run_id": RUN, "pid": process.pid,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "mono_ns": started,
        "argv": argv, "cwd": str(work.relative_to(ROOT)), "fixture": "HOUSE-INPUT-001",
        "mode": "user-operated trace-only session; game methods instrumented in isolated JAR copy",
        "instrumented_game_sha256": common.hashlib.sha256((BUILD / "game-traced.jar").read_bytes()).hexdigest(),
        "emulator_sha256": common.hashlib.sha256(common.EMU.read_bytes()).hexdigest(),
        "trace_target": ["ar.paint(Graphics)V", "m.i()V", "m.g()V", "br.d:Z operand before original IFEQ BCI 94"],
        "probe_reflection": False, "game_state_reads": False, "game_state_writes": False,
        "input": "user-operated window; no input injection", "rng_controlled": False,
        "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"})
    try:
        time.sleep(8)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree-startup.txt").write_text(tree)
        common.capture(window, rd / "checkpoint-x11.jsonl", shots / "01-startup.png")
        title = "FreeJ2ME-Plus - SCN-0004 render-order trace safe"
        subprocess.run(["xprop", "-id", hex(window), "-set", "WM_NAME", title], check=True)
        subprocess.run(["xprop", "-id", hex(window), "-f", "_NET_WM_NAME", "8s",
                        "-set", "_NET_WM_NAME", title], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        common.append(rd / "timeline.jsonl", "interactive_trace_ready", window=hex(window),
                      title=title, screenshot=str((shots / "01-startup.png").relative_to(ROOT)),
                      targets=["ar.paint(Graphics)V", "m.i()V", "m.g()V", "br.d:Z operand"],
                      reflection=False, game_state_reads=False)
        common.write(rd / "session-status.json", {
            "run_id": RUN, "captured_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "pid": process.pid, "pid_alive": True, "status": "waiting for user to load save and toggle Camera Off",
            "user_input_started": False, "harness_input_sent": False,
            "trace_targets": ["ar.paint(Graphics)V", "m.i()V", "m.g()V", "br.d:Z operand"],
            "probe_reflection": False, "game_state_reads": False, "game_state_writes": False,
            "next_checkpoint": "load Ronin save, note Camera On, switch Camera Off in System/Options, return to gameplay, then capture state and screenshots"})
        (rd / "operator-guide.md").write_text(
            "# User-operated Camera branch trace\n\n"
            "Use the window titled `FreeJ2ME-Plus - SCN-0004 render-order trace safe`. Load the Ronin save. "
            "Open System/Options, note the current Camera value, switch Camera Off, return to gameplay, and pause. "
            "Report `Camera Off, gameplay`; a read-only checkpoint will capture X11, frontbuffer, and selected flags. "
            "Then let gameplay idle briefly and close the trace window so the bounded trace flushes.\n\n"
            "The probe records `ar.paint`, `m.i`, and `m.g`, plus the actual boolean operand loaded from `br.d:Z` "
            "immediately before the original `IFEQ` branch. It does not use reflection, read game fields, write game "
            "state, or inject input. Only the game JAR copy is instrumented; the emulator and original JAR remain unchanged.\n")
        print(json.dumps({"run_id": RUN, "pid": process.pid, "window": hex(window), "title": title,
                          "startup_screenshot": str((shots / "01-startup.png").relative_to(ROOT)),
                          "instruction": "Load Ronin, switch Camera Off, return to gameplay and report."}, ensure_ascii=False))
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

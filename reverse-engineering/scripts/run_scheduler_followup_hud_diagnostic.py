"""Open an uninstrumented, user-operated copy for scene checkpoint review."""
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
RUN = "M15-SCN-0004-E-hud-diagnosis-R01"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def main():
    if common.hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    if common.hashlib.sha256(EMU.read_bytes()).hexdigest() != EXPECTED_EMU:
        raise RuntimeError("Original emulator JAR identity mismatch")
    rd = EVIDENCE / RUN
    work = ROOT / "reference/recordings" / RUN
    shots = ROOT / "reference/screenshots" / RUN
    rd.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    fixture = common.copy_fixture(work)
    common.write(rd / "fixture-verification.json", {
        "source_manifest": str(common.SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "verified_files": len(fixture), "files": fixture})
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1", "-jar", str(EMU),
            GAME.as_uri(), "0", "240", "320", "2", "2", "60"]
    started = time.monotonic_ns()
    with (rd / "console.log").open("w") as log:
        process = subprocess.Popen(argv, cwd=work, stdout=log, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    common.write(rd / "launch.json", {
        "run_id": RUN, "pid": process.pid,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(), "mono_ns": started,
        "argv": argv, "cwd": str(work.relative_to(ROOT)), "fixture": "HOUSE-INPUT-001",
        "mode": "user-operated uninstrumented baseline; original JARs read-only",
        "game_sha256": common.hashlib.sha256(GAME.read_bytes()).hexdigest(),
        "emulator_sha256": common.hashlib.sha256(EMU.read_bytes()).hexdigest(),
        "input": "user-operated; no input injection", "game_instrumentation": False,
        "game_state_writes": False, "rng_controlled": False, "host_display": os.environ.get("DISPLAY"),
        "profile": "FreeJ2ME-Plus 1.52, Motorola, 240x320, limiter 60"})
    try:
        time.sleep(8)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree-startup.txt").write_text(tree)
        common.capture(window, rd / "checkpoint-x11.jsonl", shots / "01-startup.png")
        title = "FreeJ2ME-Plus - SCN-0004 HUD diagnosis baseline"
        subprocess.run(["xprop", "-id", hex(window), "-set", "WM_NAME", title], check=True)
        subprocess.run(["xprop", "-id", hex(window), "-f", "_NET_WM_NAME", "8s",
                        "-set", "_NET_WM_NAME", title], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        common.append(rd / "timeline.jsonl", "baseline_diagnostic_ready", window=hex(window),
                      title=title, screenshot=str((shots / "01-startup.png").relative_to(ROOT)))
        common.write(rd / "session-status.json", {
            "run_id": RUN, "captured_utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "pid": process.pid, "pid_alive": True, "status": "waiting for user-operated save/load route",
            "user_input_started": False, "harness_input_sent": False,
            "instrumentation": False,
            "next_checkpoint": "pause if HUD-only/black appears or after entering the loaded scene; capture X11, frontbuffer and selected state"})
        (rd / "operator-guide.md").write_text(
            "# Uninstrumented HUD-only diagnostic\n\n"
            "Use the window titled `FreeJ2ME-Plus - SCN-0004 HUD diagnosis baseline`. Follow the same "
            "Ronin save/load route. If the map/background disappears while the HUD remains, pause and report; "
            "do not press more keys until paired X11/frontbuffer/state capture is taken. If the house renders, "
            "pause in the loaded scene and report that instead. This run uses the original game/emulator JARs "
            "from an isolated fixture copy, with no agent, input injection, or game-state writes.\n")
        print(json.dumps({"run_id": RUN, "pid": process.pid, "window": hex(window), "title": title,
                          "startup_screenshot": str((shots / "01-startup.png").relative_to(ROOT)),
                          "instruction": "Repeat the Ronin save/load route; pause if HUD-only/black appears."}, ensure_ascii=False))
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

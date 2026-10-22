"""Run one isolated SCN-0004 repaint-to-AWT-paint capture from HOUSE-INPUT-001."""
import datetime
import hashlib
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
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-repaint-causality"
RUN_ID = os.environ.get("REPAINT_CAUSALITY_RUN_ID", "M15-SCN-0004-E-repaint-causality-R01")
RUN = BASE / RUN_ID
WORK = ROOT / "reference/recordings" / RUN_ID
SCREENSHOTS = ROOT / "reference/screenshots" / RUN_ID
BUILD = ROOT / "reference/recordings/scheduler-repaint-causality-20261023-r1"
AGENT = BUILD / "repaint-causality-agent.jar"
TRACED_GAME = BUILD / "game-repaint-causality.jar"
TRACED_EMULATOR = BUILD / "emulator-repaint-causality.jar"
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def digest(path):
    path = Path(path)
    try:
        rel = str(path.relative_to(ROOT))
    except ValueError:
        rel = str(path)
    return {"path": rel, "size": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def tap(process, step, code, wait_ms):
    output = RUN / f"input-{step:02d}.log"
    common.append(RUN / "timeline.jsonl", "synthetic_key_begin", step=step,
                  awt_code=code, hold_ms=10, wait_ms=wait_ms)
    common.agent(process.pid, common.SIDECARS / "probe-current.jar", f"{output}|{code}|10")
    common.append(RUN / "timeline.jsonl", "synthetic_key_end", step=step,
                  awt_code=code, hold_ms=10)
    time.sleep(wait_ms / 1000)


def save_manifest():
    files = [path for path in RUN.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in SCREENSHOTS.rglob("*") if path.is_file())
    write(RUN / "manifest.json", {"run_id": RUN_ID, "files": [digest(path) for path in sorted(files)]})


def main():
    if RUN.exists() or WORK.exists() or SCREENSHOTS.exists():
        raise RuntimeError(f"Refusing to overwrite run artifacts for {RUN_ID}")
    if hashlib.sha256(common.GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    if hashlib.sha256(common.EMU.read_bytes()).hexdigest() != EXPECTED_EMU:
        raise RuntimeError("Original emulator JAR identity mismatch")
    for artifact in (AGENT, TRACED_GAME, TRACED_EMULATOR, BUILD / "build-manifest.json"):
        if not artifact.is_file():
            raise RuntimeError(f"Missing build artifact: {artifact}")

    RUN.mkdir(parents=True)
    SCREENSHOTS.mkdir(parents=True)
    fixture_checks = common.copy_fixture(WORK)
    if not all(row["valid"] for row in fixture_checks):
        raise RuntimeError("Fixture copy verification failed")
    game_conf = WORK / "config/Heroes Lore/game.conf"
    config = game_conf.read_text(errors="replace")
    phone_lines = [line for line in config.splitlines() if line.startswith("phone:")]
    if len(phone_lines) != 1:
        raise RuntimeError(f"Expected one emulator profile line, found {phone_lines}")
    profile = phone_lines[0].split(":", 1)[1]

    trace = RUN / "trace.jsonl"
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{AGENT}={trace}|{RUN_ID}", "-jar", str(TRACED_EMULATOR),
            TRACED_GAME.as_uri(), "0", "240", "320", "2", "2", "60"]
    start_mono = time.monotonic_ns()
    with (RUN / "console.log").open("w") as console:
        process = subprocess.Popen(argv, cwd=WORK, stdout=console, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    write(RUN / "fixture-verification.json", {
        "fixture": "HOUSE-INPUT-001", "verified_files": len(fixture_checks),
        "files": fixture_checks, "game_conf_profile": profile,
        "game_state_writes": False, "input_injection": "AWT KeyListener menu input only"})
    write(RUN / "launch.json", {
        "run_id": RUN_ID, "pid": process.pid,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mono_ns": start_mono, "argv": argv, "cwd": str(WORK.relative_to(ROOT)),
        "fixture": "HOUSE-INPUT-001", "profile": profile,
        "route": "Three synthetic Enter taps load Ronin through the original UI, then idle gameplay capture",
        "source_game_sha256": EXPECTED_GAME, "source_emulator_sha256": EXPECTED_EMU,
        "instrumented_game": digest(TRACED_GAME), "instrumented_emulator": digest(TRACED_EMULATOR),
        "agent": digest(AGENT), "game_state_reads": "direct GETSTATIC m.e:I at ar.paint entry",
        "game_field_writes": False, "physical_input": False,
        "trace_targets": ["ar.paint(Graphics) state at entry", "MobilePlatform.flushGraphics entry/exit",
                          "FreeJ2ME$6.run entry/exit", "LCD.repaint callsite ticket",
                          "LCD.paint(Graphics) and EventQueue.getCurrentEvent()"]})

    error = None
    try:
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (RUN / "window-tree.txt").write_text(tree)
        common.capture(window, RUN / "checkpoint-x11.jsonl", SCREENSHOTS / "01-startup.png")
        common.append(RUN / "timeline.jsonl", "startup_checkpoint", no_input_seconds=10)
        for step, wait_ms in enumerate((1000, 1000, 10000), 1):
            tap(process, step, 10, wait_ms)
        common.capture(window, RUN / "checkpoint-x11.jsonl", SCREENSHOTS / "02-gameplay-after-load.png")
        common.append(RUN / "timeline.jsonl", "gameplay_after_load_checkpoint",
                      screenshot=str((SCREENSHOTS / "02-gameplay-after-load.png").relative_to(ROOT)))
        idle_start = time.monotonic_ns()
        time.sleep(10)
        common.capture(window, RUN / "checkpoint-x11.jsonl", SCREENSHOTS / "03-gameplay-after-idle.png")
        common.append(RUN / "timeline.jsonl", "idle_capture_finished", duration_ms=10000,
                      start_mono_ns=idle_start)
    except Exception as exc:
        error = repr(exc)
        write(RUN / "run-error.json", {"error": error, "mono_ns": time.monotonic_ns()})
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        write(RUN / "process-exit.json", {"returncode": process.returncode,
                                           "proc_absent": not Path(f"/proc/{process.pid}").exists(),
                                           "mono_ns": time.monotonic_ns()})

    fatal = [token for token in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError",
                                 'Exception in thread "')
             if token in (RUN / "console.log").read_text(errors="replace")]
    if fatal:
        error = (error + "; " if error else "") + "fatal console markers: " + ", ".join(fatal)
    if error:
        write(RUN / "invalid.json", {"valid": False, "reason": error})
    if trace.is_file() and (RUN / "trace-health.json").is_file():
        env = {**os.environ, "REPAINT_CAUSALITY_RUN_ID": RUN_ID}
        subprocess.run([sys.executable, str(ROOT / "reverse-engineering/scripts/analyze_repaint_causality_probe.py")],
                       env=env, check=True)
    save_manifest()
    print(json.dumps({"run_id": RUN_ID, "valid_runner": error is None,
                      "trace": str(trace.relative_to(ROOT)),
                      "manifest": str((RUN / "manifest.json").relative_to(ROOT)),
                      "error": error}, ensure_ascii=False))


if __name__ == "__main__":
    main()

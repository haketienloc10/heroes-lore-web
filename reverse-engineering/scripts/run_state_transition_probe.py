"""Trace the house-exit route and correlate the 2->4 setter with m.i()/m.n()."""
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
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-transition-attribution"
RUN_ID = os.environ.get("STATE_TRANSITION_RUN_ID", "M15-SCN-0004-E-transition-attribution-R01")
RUN = BASE / RUN_ID
WORK = ROOT / "reference/recordings" / RUN_ID
SCREENSHOTS = ROOT / "reference/screenshots" / RUN_ID
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261023-transition-attribution-r1"
TRACED_GAME = BUILD / "game-transition-attribution.jar"
AGENT = BUILD / "probe-transition-attribution.jar"
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"
EXPECTED_EMU = "92f84012958f2ca0692dbe7d258cea7aebd4e96f664445d8e92dd0297e12df0e"


def digest(path):
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size,
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}


def write(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def action(process, step, key_code, hold_ms, wait_ms):
    output = RUN / f"input-{step:02d}.log"
    common.append(RUN / "timeline.jsonl", "synthetic_key_begin", step=step,
                  awt_key_code=key_code, hold_ms=hold_ms, wait_ms=wait_ms)
    common.agent(process.pid, common.SIDECARS / "probe-current.jar",
                 f"{output}|{key_code}|{hold_ms}")
    common.append(RUN / "timeline.jsonl", "synthetic_key_end", step=step,
                  awt_key_code=key_code, hold_ms=hold_ms)
    time.sleep(wait_ms / 1000)


def build_run_manifest():
    files = [p for p in RUN.rglob("*") if p.is_file() and p.name != "manifest.json"]
    files.extend(p for p in SCREENSHOTS.rglob("*") if p.is_file())
    write(RUN / "manifest.json", {"run_id": RUN_ID, "files": [digest(p) for p in sorted(files)]})


def main():
    if RUN.exists() or WORK.exists() or SCREENSHOTS.exists():
        raise RuntimeError("Refusing to overwrite state-pacing bypass evidence")
    if hashlib.sha256(common.GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    if hashlib.sha256(common.EMU.read_bytes()).hexdigest() != EXPECTED_EMU:
        raise RuntimeError("Original emulator JAR identity mismatch")
    for path in (TRACED_GAME, AGENT, BUILD / "build-manifest.json"):
        if not path.exists():
            raise RuntimeError(f"Missing isolated probe build artifact: {path}")

    RUN.mkdir(parents=True)
    SCREENSHOTS.mkdir(parents=True)
    checks = common.copy_fixture(WORK)
    if not all(item["valid"] for item in checks):
        raise RuntimeError("Fixture copy verification failed")
    write(RUN / "fixture-verification.json", {
        "fixture": "HOUSE-INPUT-001", "source_manifest": str(common.SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "verified_files": len(checks), "files": checks})

    config = WORK / "config/Heroes Lore/game.conf"
    before = config.read_bytes()
    lines = before.decode("utf-8").splitlines()
    profile_lines = [i for i, line in enumerate(lines) if line.startswith("phone:")]
    if len(profile_lines) != 1:
        raise RuntimeError(f"Expected one phone profile in fixture; found {len(profile_lines)}")
    source_profile = lines[profile_lines[0]].split(":", 1)[1]
    lines[profile_lines[0]] = "phone:Motorola"
    config.write_text("\n".join(lines) + "\n", encoding="utf-8")
    after = config.read_bytes()
    write(RUN / "emulator-profile-override.json", {
        "setting": "phone", "source_value": source_profile, "run_value": "Motorola",
        "scope": "isolated work copy only; source fixture and original JARs unchanged",
        "config_path": str(config.relative_to(ROOT)),
        "sha256_before": hashlib.sha256(before).hexdigest(),
        "sha256_after": hashlib.sha256(after).hexdigest()})

    trace = RUN / "trace.jsonl"
    actions = RUN / "trigger-actions.jsonl"
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{AGENT}={trace}|{RUN_ID}|{actions}", "-jar", str(common.EMU),
            TRACED_GAME.as_uri(), "0", "240", "320", "2", "2", "60"]
    started_ns = time.monotonic_ns()
    with (RUN / "console.log").open("w") as console:
        process = subprocess.Popen(argv, cwd=WORK, stdout=console, stderr=subprocess.STDOUT,
                                   start_new_session=True)
    write(RUN / "launch.json", {
        "run_id": RUN_ID, "pid": process.pid,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mono_ns": started_ns, "argv": argv, "cwd": str(WORK.relative_to(ROOT)),
        "fixture": "HOUSE-INPUT-001", "fixture_verified_files": len(checks),
        "mode": "controlled route trace; state stores and m.i()/m.n() entry/exit spans are traced",
        "profile": "FreeJ2ME-Plus 1.52, phone:Motorola, 240x320, limiter 60",
        "trace_targets": ["m.a(I)V store to m.e:I", "m.i()V entry/exit", "m.n()V entry/exit",
                          "ar.keyPressed(I)V raw and m.e switch operand",
                          "ag.a(II)V args", "br.b()V", "ag.a:Z branch operand", "br.a(JJ)V",
                          "Thread.sleep(J) callsite in br.a(JJ)V", "Thread.yield() callsite in br.a(JJ)V",
                          "second br.a(JJ)V long argument (target period)"],
        "input_source": "synthetic AWT KeyListener events using the existing RuntimeStateProbe sidecar",
        "state_triggered_input": "instrumented probe queues one AWT VK_W press after the original m.e=4 store",
        "probe_reflection": False, "direct_game_method_calls": False,
        "direct_game_field_writes": False,
        "build_manifest": str((BUILD / "build-manifest.json").relative_to(ROOT)),
        "instrumented_game": digest(TRACED_GAME), "probe_agent": digest(AGENT),
        "original_game_sha256": EXPECTED_GAME, "original_emulator_sha256": EXPECTED_EMU,
        "host_display": os.environ.get("DISPLAY")})

    try:
        time.sleep(8)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (RUN / "window-tree.txt").write_text(tree)
        common.capture(window, RUN / "checkpoint-x11.jsonl", SCREENSHOTS / "01-startup.png")
        for step, wait_ms in enumerate((1000, 1000, 10000), 1):
            action(process, step, 10, 10, wait_ms)
        common.capture(window, RUN / "checkpoint-x11.jsonl", SCREENSHOTS / "02-gameplay-before-exit.png")
        common.append(RUN / "timeline.jsonl", "gameplay_checkpoint",
                      screenshot=str((SCREENSHOTS / "02-gameplay-before-exit.png").relative_to(ROOT)))
        action(process, 4, 102, 1000, 1000)
        action(process, 5, 98, 1000, 1800)
        common.capture(window, RUN / "checkpoint-x11.jsonl", SCREENSHOTS / "03-after-exit-transition.png")
        common.append(RUN / "timeline.jsonl", "post_transition_checkpoint",
                      screenshot=str((SCREENSHOTS / "03-after-exit-transition.png").relative_to(ROOT)))
        write(RUN / "route.json", {
            "route": "load the Ronin save from HOUSE-INPUT-001, move right in the house, then start house exit with Down",
            "input_steps": [{"step": 1, "key_code": 10, "purpose": "menu progression"},
                            {"step": 2, "key_code": 10, "purpose": "menu progression"},
                            {"step": 3, "key_code": 10, "purpose": "load save"},
                            {"step": 4, "key_code": 102, "hold_ms": 1000, "purpose": "align with documented exit route"},
                            {"step": 5, "key_code": 98, "hold_ms": 1000, "purpose": "natural state 2 to 4 transition"}],
            "branch_input": "one W/Right Soft event is queued by the probe only after observed state setter stores 4",
            "cadence_sample": False, "physical_input": False, "game_state_injected": False})
    except Exception as exc:
        write(RUN / "run-error.json", {"error": repr(exc), "mono_ns": time.monotonic_ns()})
        raise
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        write(RUN / "process-exit.json", {
            "returncode": process.returncode,
            "proc_absent": not Path(f"/proc/{process.pid}").exists(),
            "mono_ns": time.monotonic_ns()})

    subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/analyze_state_transition_probe.py")],
                   check=True)
    build_run_manifest()
    print(json.dumps({"run_id": RUN_ID, "analysis": str((RUN / "analysis.json").relative_to(ROOT)),
                      "manifest": str((RUN / "manifest.json").relative_to(ROOT)),
                      "trace": str(trace.relative_to(ROOT)), "action_log": str(actions.relative_to(ROOT))},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Open one user-operated key-input trace from the verified house fixture."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_scheduler_followup_transition as common

ROOT = common.ROOT
EVIDENCE = common.EVIDENCE
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-dialogue-r2"
RUN = "M15-SCN-0004-E-key-input-physical-R01"
RUN_DIR = EVIDENCE / RUN
EXPECTED_BUILD = {
    "probe-dialogue-safe.jar": "e895df1f05fec051a988bda40be08681695ce16e023c71d8f917fb4b94ed6557",
    "game-traced.jar": "098edbe73145c677536d4d65315d1b0562093a7cb18f495fd47ae741c06618ce",
    "emulator-traced.jar": "5d9d0c3d9860e904e38afc1f690a9c5990fdd1c0220133df1958cedee1215300",
}


def write(path, data):
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        name = str(path.relative_to(ROOT))
    except ValueError:
        name = str(path)
    return {"path": name, "size": path.stat().st_size, "sha256": h}


def summarize(trace_path, ready_ns):
    rows = [json.loads(line) for line in trace_path.read_text().splitlines() if line.strip()]
    game_rows = [row for row in rows if row.get("method") == "keyPressed(I)V"
                 and row.get("phase") == "entry" and row.get("t_mono_ns", 0) >= ready_ns]
    by_raw = {}
    for row in game_rows:
        by_raw[str(row.get("arg0_int"))] = by_raw.get(str(row.get("arg0_int")), 0) + 1
    intervals = []
    previous = {}
    for row in game_rows:
        raw = str(row.get("arg0_int"))
        if raw in previous:
            intervals.append({"raw_key": int(raw),
                              "delta_ms": round((row["t_mono_ns"] - previous[raw]) / 1e6, 3)})
        previous[raw] = row["t_mono_ns"]
    return {"run_id": RUN, "status": "captured", "trace_events_total": len(rows),
            "ar_keyPressed_entries_after_user_ready": len(game_rows),
            "entries_by_raw_key": by_raw, "same_raw_key_intervals_ms": intervals,
            "repeat_candidate_observed": any(item["delta_ms"] <= 500 for item in intervals),
            "operator_input_source": "physical keyboard as reported by user; host AWT event timestamps are not captured",
            "interpretation_limit": "Callbacks show entry into ar.keyPressed, not action consumption or presentation. This probe does not hook inherited Canvas.keyRepeated.",
            "ready_mono_ns": ready_ns}


def main():
    if RUN_DIR.exists():
        raise RuntimeError(f"Refusing to overwrite {RUN_DIR}")
    for name, expected in EXPECTED_BUILD.items():
        path = BUILD / name
        if hashlib.sha256(path.read_bytes()).hexdigest() != expected:
            raise RuntimeError(f"Safe probe build hash mismatch: {path}")

    RUN_DIR.mkdir(parents=True)
    screenshots = ROOT / "reference/screenshots" / RUN
    screenshots.mkdir(parents=True)
    scratch = tempfile.TemporaryDirectory(prefix="heroes-lore-physical-key-")
    work = Path(scratch.name) / "work"
    trace_path = RUN_DIR / "trace.jsonl"
    process = None
    failures = []
    user_done = False
    ready_ns = None
    fixture_checks = []
    try:
        fixture_checks = common.copy_fixture(work)
        config = work / "config/Heroes Lore/game.conf"
        if "phone:Standard" not in config.read_text(errors="replace"):
            raise RuntimeError("HOUSE-INPUT-001 work copy is not phone:Standard")
        argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
                f"-javaagent:{BUILD / 'probe-dialogue-safe.jar'}={trace_path}|{RUN}",
                "-jar", str(BUILD / "emulator-traced.jar"),
                (BUILD / "game-traced.jar").as_uri(), "0", "240", "320", "2", "2", "60"]
        started_ns = time.monotonic_ns()
        with (RUN_DIR / "console.log").open("w") as console:
            process = subprocess.Popen(argv, cwd=work, stdout=console, stderr=subprocess.STDOUT,
                                       start_new_session=True)
        write(RUN_DIR / "launch.json", {
            "run_id": RUN, "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "mono_ns": started_ns, "pid": process.pid, "argv": argv,
            "fixture": "HOUSE-INPUT-001", "fixture_verified_files": len(fixture_checks),
            "work_copy_profile": "phone:Standard",
            "fixture_restore_input": "RuntimeStateProbe AWT KeyListener; three Enter taps",
            "measurement_input": "user-operated physical keyboard",
            "trace_targets": ["ar.keyPressed(I)V", "ag.a(II)V"],
            "probe_reflection": False, "game_state_reads": False,
            "build_manifest": str((BUILD / "build-manifest.json").relative_to(ROOT)),
            "build_sha256": EXPECTED_BUILD, "display": os.environ.get("DISPLAY")})

        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (RUN_DIR / "window-tree.txt").write_text(tree)
        common.capture(window, RUN_DIR / "checkpoint-x11.jsonl", screenshots / "01-startup.png")
        for step, post_wait in enumerate((1.0, 1.0, 10.0), 1):
            out = RUN_DIR / f"restore-input-{step:02d}.log"
            common.agent(process.pid, common.SIDECARS / "probe-current.jar", f"{out}|10|100")
            time.sleep(post_wait)
        common.capture(window, RUN_DIR / "checkpoint-x11.jsonl", screenshots / "02-gameplay-ready.png")
        title = "FreeJ2ME-Plus - SCN-0004 key input trace"
        subprocess.run(["xprop", "-id", hex(window), "-set", "WM_NAME", title], check=True)
        subprocess.run(["xprop", "-id", hex(window), "-f", "_NET_WM_NAME", "8s",
                        "-set", "_NET_WM_NAME", title], check=False,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        ready_ns = time.monotonic_ns()
        write(RUN_DIR / "session-status.json", {
            "run_id": RUN, "status": "waiting for one physical key-input sequence",
            "pid": process.pid, "window": hex(window), "ready_mono_ns": ready_ns,
            "screenshot": str((screenshots / "02-gameplay-ready.png").relative_to(ROOT)),
            "user_input_started": False,
            "probe": "ar.keyPressed(I)V and ag.a(II)V only; no field reads or game-field writes"})
        print(json.dumps({"run_id": RUN, "pid": process.pid, "window": hex(window),
                          "title": title,
                          "gameplay_checkpoint": str((screenshots / "02-gameplay-ready.png").relative_to(ROOT)),
                          "instruction": "Click inside the game scene to focus it. Hold Right/Numpad 6 for about two seconds; while still holding it, press and hold Up/Numpad 8 for about half a second; release Up, then Right. Then report done.",
                          "trace": str(trace_path.relative_to(ROOT))}, ensure_ascii=False), flush=True)
        input("Waiting for user to finish the key sequence; type done or abort: ")
        user_done = True
        common.capture(window, RUN_DIR / "checkpoint-x11.jsonl", screenshots / "03-after-user-input.png")
        write(RUN_DIR / "operator-report.json", {
            "run_id": RUN, "operator_confirmed_sequence": "Right held, Up pressed while Right remained held, Up released, then Right released",
            "duration": "approximate, per operator instruction; no exact physical timing claimed",
            "focus": "user clicked the game scene before input"})
    except Exception as exc:
        failures.append(repr(exc))
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if process is not None:
            write(RUN_DIR / "process-exit.json", {
                "returncode": process.returncode,
                "proc_absent": not Path(f"/proc/{process.pid}").exists(),
                "mono_ns": time.monotonic_ns()})
        scratch.cleanup()

    if not trace_path.exists():
        failures.append("safe probe did not flush trace.jsonl")
        summary = {"run_id": RUN, "status": "invalid", "trace_events_total": 0}
    else:
        summary = summarize(trace_path, ready_ns or time.monotonic_ns())
        summary["status"] = "captured" if user_done and not failures else "incomplete"
    summary["fixture_verified_files"] = len(fixture_checks)
    summary["failures"] = failures
    health_path = RUN_DIR / "trace-health.json"
    if health_path.exists():
        summary["trace_health"] = json.loads(health_path.read_text())
        if summary["trace_health"].get("dropped", 0):
            failures.append("trace collector reported dropped events")
    write(RUN_DIR / "key-input-analysis.json", summary)
    write(RUN_DIR / "fixture-verification.json", {
        "source_manifest": str(common.SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "verified_files": len(fixture_checks), "files": fixture_checks})

    files = [path for path in RUN_DIR.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in screenshots.rglob("*") if path.is_file())
    write(RUN_DIR / "manifest.json", {"run_id": RUN,
                                      "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": RUN, "status": summary.get("status"),
                      "key_input": {key: summary.get(key) for key in (
                          "ar_keyPressed_entries_after_user_ready", "entries_by_raw_key",
                          "same_raw_key_intervals_ms", "repeat_candidate_observed", "failures")},
                      "manifest": str((RUN_DIR / "manifest.json").relative_to(ROOT))}, ensure_ascii=False))
    if failures:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

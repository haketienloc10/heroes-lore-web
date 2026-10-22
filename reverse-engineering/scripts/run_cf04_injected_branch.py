"""Run one compact, controlled CF-04 branch-body trace from HOUSE-INPUT-001."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
RUN_ID = "M15-SCN-0004-CF04-injected-R01"
RUN_DIR = BASE / RUN_ID
BUILD = ROOT / "reference/recordings/scheduler-cf04-injected-v4-20261022"
SNAPSHOT = ROOT / "reference/recordings/snapshots/HOUSE-INPUT-001"
SNAPSHOT_MANIFEST = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021/M15-SCN-0006-P1M-R05L/HOUSE-INPUT-001-storage.json"
SIDECARS = ROOT / "reference/recordings/scheduler-sidecars"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"


def digest(path):
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size, "sha256": h}


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def verify_fixture(work):
    manifest = json.loads(SNAPSHOT_MANIFEST.read_text())
    checked = []
    for item in manifest["files"]:
        path = work / item["relative_path"]
        sha = hashlib.sha256(path.read_bytes()).hexdigest()
        valid = path.stat().st_size == item["size"] and sha == item["sha256"]
        checked.append({"path": item["relative_path"], "size": path.stat().st_size,
                        "sha256": sha, "valid": valid})
        if not valid:
            raise RuntimeError(f"Fixture hash mismatch: {path}")
    return checked


def send_enter(pid, step, scratch):
    sent_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    sent_mono_ns = time.monotonic_ns()
    output = scratch / f"input-{step:02d}.jsonl"
    command = ["java", "--add-modules", "jdk.attach", "-cp", str(SIDECARS),
               "RuntimeStateProbe", str(pid), str(SIDECARS / "probe-current.jar"),
               f"{output}|10|10"]
    result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=20)
    captured = output.read_text(errors="replace") if output.exists() else ""
    return {"step": step, "utc": sent_utc, "mono_ns": sent_mono_ns,
            "awt_code": 10, "hold_ms": 10, "physical": False,
            "stdout": result.stdout.strip(), "stderr": result.stderr.strip(), "sidecar_output": captured}


def validate_trace(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    failures = []
    seqs = [row.get("seq") for row in rows]
    if seqs != list(range(1, len(rows) + 1)):
        failures.append("probe sequence is not contiguous")
    if any(row.get("run_id") != RUN_ID for row in rows):
        failures.append("trace contains a mismatched run_id")
    injections = [row for row in rows if row.get("site") == "controlled_injection_requested"]
    if len(injections) != 1:
        failures.append(f"expected one controlled injection, got {len(injections)}")
    setters = [row for row in rows if row.get("site") == "m.a(BB)_entry" and
               row.get("argument_command") == 21 and row.get("argument_param") == 2]
    if len(setters) != 1:
        failures.append(f"expected one m.a(BB)(21,2), got {len(setters)}")
    entries = [row for row in rows if row.get("site") == "m.e_entry_pending" and
               row.get("m.e:I") == 2 and row.get("m.b:B") == 21 and row.get("m.c:B") == 2]
    if len(entries) != 1:
        failures.append(f"expected one matching m.e span, got {len(entries)}")
    span_id = entries[0]["m_e_span"] if entries else None
    span_rows = [row for row in rows if row.get("m_e_span") == span_id] if span_id is not None else []
    sites = [row.get("site") for row in span_rows]
    required_order = ["m.e_call_m.c;opcode_index=" + next(
        (site.split("opcode_index=", 1)[1] for site in sites
         if isinstance(site, str) and site.startswith("m.e_call_m.c;opcode_index=")), "missing"),
        "m.a(I)_state_setter", "m.e_call_bt.d;opcode_index=" + next(
        (site.split("opcode_index=", 1)[1] for site in sites
         if isinstance(site, str) and site.startswith("m.e_call_bt.d;opcode_index=")), "missing"),
        "bt.d_after_mode_store", "bt_worker_constructed", "bt.d_return",
        "m.e_return_immediately_after_bt.d", "m.e_return"]
    positions = []
    for expected in required_order:
        try:
            positions.append(sites.index(expected))
        except ValueError:
            failures.append("missing span event " + expected)
    if len(positions) == len(required_order) and positions != sorted(positions):
        failures.append("m.e branch events are out of order")
    state_setters = [row for row in span_rows if row.get("site") == "m.a(I)_state_setter"]
    if len(state_setters) != 1 or state_setters[0].get("new_m.e:I") != 1:
        failures.append("state setter did not record state 1 exactly once")
    for site in ("bt.d_after_mode_store", "bt.d_return"):
        matches = [row for row in span_rows if row.get("site") == site]
        if len(matches) != 1 or matches[0].get("bt.a:B") != 5:
            failures.append(f"{site} did not record worker mode 5 exactly once")
    worker_creates = [row for row in span_rows if row.get("site") == "bt_worker_constructed"]
    worker_ids = {row.get("worker_id") for row in worker_creates}
    case5 = [row for row in rows if row.get("site") == "bt.run_case5_BCI_190" and
             row.get("m_e_span") == span_id and row.get("bt.a:B") == 5 and
             row.get("worker_id") in worker_ids]
    if len(worker_creates) != 1 or len(case5) != 1:
        failures.append(f"expected one identity-linked mode-5 worker case, got create={len(worker_creates)}, case5={len(case5)}")
    if case5 and worker_creates and case5[0].get("thread_id") == worker_creates[0].get("thread_id"):
        failures.append("worker case ran on the constructing thread")
    if len([row for row in span_rows if row.get("site") == "m.e_return_immediately_after_bt.d"]) != 1:
        failures.append("CF-04 path did not return immediately after bt.d")
    return {"valid": not failures, "failures": failures, "event_count": len(rows),
            "span_id": span_id, "span_events": span_rows, "identity_linked_mode5_worker_events": case5,
            "injection_events": injections, "pending_setter_events": setters}


def main():
    if RUN_DIR.exists():
        raise RuntimeError(f"Refusing to overwrite {RUN_DIR}")
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    RUN_DIR.mkdir(parents=True)
    scratch_root = Path(tempfile.mkdtemp(prefix="heroes-lore-cf04-"))
    work = scratch_root / "work"
    shutil.copytree(SNAPSHOT, work)
    fixture_checks = verify_fixture(work)
    config = (work / "config/Heroes Lore/game.conf").read_text(errors="replace")
    if "phone:Standard" not in config:
        raise RuntimeError("HOUSE-INPUT-001 does not use the audited Standard profile")
    trace_path = RUN_DIR / "trace.jsonl"
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{BUILD / 'cf04-probe.jar'}={trace_path}|{RUN_ID}",
            "-jar", str(EMU), (BUILD / "heroes-lore-cf04-probed.jar").as_uri(),
            "0", "240", "320", "2", "2", "60"]
    process = None
    inputs = []
    launch = {"run_id": RUN_ID, "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
              "mono_ns": time.monotonic_ns(), "argv": argv, "fixture": "HOUSE-INPUT-001",
              "fixture_verified_file_count": len(fixture_checks), "profile": "FreeJ2ME-Plus 1.52; Standard; 240x320; limiter 60",
              "input": "Three synthetic AWT Enter keypresses via RuntimeStateProbe; no game field writes from sidecar",
              "controlled_injection": "ar.paint waits for m.e:I==2 and pending m.b:B==0, then calls m.a(BB)V with (21,2) once",
              "display": os.environ.get("DISPLAY"), "emulator_sha256": hashlib.sha256(EMU.read_bytes()).hexdigest()}
    start_ns = time.monotonic_ns()
    launch["mono_ns"] = start_ns
    failure = None
    process_exit = None
    try:
        with (RUN_DIR / "console.log").open("w") as console:
            process = subprocess.Popen(argv, cwd=work, stdout=console, stderr=subprocess.STDOUT,
                                       start_new_session=True)
        launch["pid"] = process.pid
        write(RUN_DIR / "launch.json", launch)
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        for step in (1, 2, 3):
            inputs.append(send_enter(process.pid, step, scratch_root))
            time.sleep(1 if step < 3 else 12)
        time.sleep(3)
    except Exception as error:
        failure = repr(error)
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=25)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        process_exit = {"returncode": process.returncode if process else None,
                        "proc_absent": not Path(f"/proc/{process.pid}").exists() if process else True,
                        "mono_ns": time.monotonic_ns()}
        shutil.rmtree(scratch_root, ignore_errors=True)

    analysis = validate_trace(trace_path) if trace_path.exists() else {
        "valid": False, "failures": ["probe did not flush trace.jsonl"], "event_count": 0}
    if failure:
        analysis["valid"] = False
        analysis["failures"].append("run failure: " + failure)
    console_text = (RUN_DIR / "console.log").read_text(errors="replace")
    for marker in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "'):
        if marker in console_text:
            analysis["valid"] = False
            analysis["failures"].append("fatal console marker: " + marker)
    result = {
        "run_id": RUN_ID,
        "status": "controlled_branch_body_observed" if analysis["valid"] else "invalid_or_incomplete",
        "valid": analysis["valid"], "failures": analysis["failures"],
        "game_sha256": EXPECTED_GAME,
        "build_manifest": str((BUILD / "build-manifest.json").relative_to(ROOT)),
        "fixture_manifest": str(SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "fixture_verification": {"count": len(fixture_checks), "all_valid": all(item["valid"] for item in fixture_checks),
                                 "files": fixture_checks},
        "synthetic_inputs": inputs, "process_exit": process_exit,
        "trace": str(trace_path.relative_to(ROOT)), "event_count": analysis["event_count"],
        "controlled_injection_events": analysis.get("injection_events", []),
        "m_e_span_id": analysis.get("span_id"), "m_e_span_events": analysis.get("span_events", []),
        "identity_linked_mode5_worker_events": analysis.get("identity_linked_mode5_worker_events", []),
        "pending_setter_events": analysis.get("pending_setter_events", []),
        "original_bci_mapping": {"m.c()V": 439, "ah.a(false)": 446, "m.a(1)": 450,
                                 "bt.d()V": 453, "return after bt.d()": 456,
                                 "bt.run() mode-5 switch target": 190},
        "scope_limit": "Controlled injection validates the branch body and identity-linked worker mode-5 dispatch. It does not establish natural UI reachability of state 14 or command 21/2, nor does it prove the 0.9-second bypass case.",
    }
    write(RUN_DIR / "analysis.json", result)
    files = [p for p in RUN_DIR.rglob("*") if p.is_file() and p.name != "manifest.json"]
    write(RUN_DIR / "manifest.json", {"run_id": RUN_ID, "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": RUN_ID, "valid": analysis["valid"], "failures": analysis["failures"],
                      "event_count": analysis["event_count"], "manifest": str((RUN_DIR / "manifest.json").relative_to(ROOT))},
                     ensure_ascii=False))
    if not analysis["valid"]:
        raise RuntimeError("CF-04 controlled branch trace incomplete; see analysis.json")


if __name__ == "__main__":
    main()

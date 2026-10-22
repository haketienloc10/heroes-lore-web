"""Run a compact, automated UI save-load trace for the CF-02 BCI 146/149 branch."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
BUILD = ROOT / "reference/recordings/scheduler-cf02-branch-20261022"
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


def log(log_path, event, **fields):
    row = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
           "mono_ns": time.monotonic_ns(), "event": event, **fields}
    with log_path.open("a") as stream:
        stream.write(json.dumps(row, ensure_ascii=False) + "\n")


def locate_window(pid):
    tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
    frames = list(dict.fromkeys(re.findall(r"\b(0x[0-9a-f]+)\b", tree)))
    matches = []
    for frame in frames:
        prop = subprocess.run(["xprop", "-id", frame, "_NET_WM_PID"], text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                              check=False).stdout
        if re.search(r"_NET_WM_PID\(CARDINAL\) = " + str(pid) + r"\b", prop):
            matches.append(frame)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one window for pid {pid}, found {matches}")
    return int(matches[0], 16), tree


def capture(window, log_path, output):
    subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                    str(log_path), "capture", hex(window), str(output)], check=True)


def send_enter(pid, run_dir, step):
    target = run_dir / f"input-{step:02d}.log"
    log(run_dir / "timeline.jsonl", "synthetic_key_press_begin", step=step,
        awt_code=10, hold_ms=10, physical=False)
    subprocess.run(["java", "--add-modules", "jdk.attach", "-cp", str(SIDECARS),
                    "RuntimeStateProbe", str(pid), str(SIDECARS / "probe-current.jar"),
                    f"{target}|10|10"], check=True, timeout=20)
    log(run_dir / "timeline.jsonl", "synthetic_key_press_end", step=step,
        awt_code=10, hold_ms=10, physical=False)


def verify_fixture(work):
    manifest = json.loads(SNAPSHOT_MANIFEST.read_text())
    checks = []
    for item in manifest["files"]:
        path = work / item["relative_path"]
        actual = hashlib.sha256(path.read_bytes()).hexdigest()
        valid = path.stat().st_size == item["size"] and actual == item["sha256"]
        checks.append({"path": item["relative_path"], "size": path.stat().st_size,
                       "sha256": actual, "valid": valid})
        if not valid:
            raise RuntimeError(f"Fixture hash mismatch: {path}")
    return checks


def analyze_trace(path, run_id):
    events = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    if any(event.get("run_id") != run_id for event in events):
        raise RuntimeError("Trace run_id mismatch")
    spans = {}
    for event in events:
        spans.setdefault(event["span_id"], []).append(event)
    decisions = []
    required = ["common_join_BCI_150", "call_j_BCI_151", "call_k_BCI_155",
                "call_m_b_BBBB_BCI_168", "q_b_store_after_BCI_172", "normal_return_BCI_175"]
    for span_id, group in spans.items():
        sites = [event["site"] for event in group]
        if "worker_entry" not in sites:
            continue
        decision = ("success_BCI_146" if "load_success_branch_BCI_146" in sites else
                    "catch_BCI_149" if "exception_handler_BCI_149" in sites else "undetermined")
        positions = {site: sites.index(site) for site in sites}
        suffix_present = all(site in positions for site in required)
        suffix_ordered = suffix_present and all(positions[left] < positions[right]
            for left, right in zip(required, required[1:]))
        store = next((event for event in group if event.get("site") == "q_b_store_after_BCI_172"), None)
        decisions.append({"span_id": span_id, "thread_id": group[0]["thread_id"],
                          "mode": group[0]["mode"], "decision": decision,
                          "sites": sites, "suffix_present": suffix_present,
                          "suffix_ordered": suffix_ordered,
                          "q_b_store_value": store.get("q.b:Z") if store else None})
    if not decisions:
        raise RuntimeError("No mode-1 worker invocation was recorded")
    return {"event_count": len(events), "events": events, "worker_invocations": decisions}


def write_campaign_audit():
    run_ids = [f"M15-SCN-0004-CF02-branch-R{number:02d}" for number in (2, 3, 4)]
    records = []
    for run_id in run_ids:
        run_dir = BASE / run_id
        valid_path = run_dir / "valid.json"
        if not valid_path.exists():
            return
        valid = json.loads(valid_path.read_text())
        screenshot = ROOT / "reference/screenshots" / run_id / "04-after-load.png"
        decisions = valid.get("mode1_invocations", [])
        records.append({
            "run_id": run_id,
            "valid": valid["valid"],
            "failure_reasons": valid["failures"],
            "worker_invocations": decisions,
            "trace": str((run_dir / "trace.jsonl").relative_to(ROOT)),
            "validity_record": str(valid_path.relative_to(ROOT)),
            "input_timeline": str((run_dir / "timeline.jsonl").relative_to(ROOT)),
            "fixture_verification": str((run_dir / "fixture-verification.json").relative_to(ROOT)),
            "screenshot": str(screenshot.relative_to(ROOT)) if screenshot.exists() else None,
            "screenshot_sha256": hashlib.sha256(screenshot.read_bytes()).hexdigest() if screenshot.exists() else None,
            "per_run_manifest": str((run_dir / "manifest.json").relative_to(ROOT)),
        })
    all_success = all(record["valid"] and len(record["worker_invocations"]) == 1 and
                      record["worker_invocations"][0]["decision"] == "success_BCI_146" and
                      record["worker_invocations"][0]["suffix_ordered"] and
                      record["worker_invocations"][0]["q_b_store_value"] is True
                      for record in records)
    audit = {
        "finding": "CF-02",
        "date": "2026-10-22",
        "status": "three_success_routes_observed" if all_success else "partial_or_mixed_result",
        "criterion": "Three independent UI save-load launches observe mode-1 bt.run()V take success BCI 146, avoid catch handler BCI 149, execute the common suffix through q.b=true, and return normally.",
        "result": "All three traces contain the success-branch marker and common suffix in one mode-1 invocation." if all_success else "Review each per-run decision and suffix record; do not infer missing markers as success.",
        "instrumentation": {
            "instrumenter": "reverse-engineering/scripts/CF02Instrumenter.java",
            "probe": "reverse-engineering/scripts/CF02TraceProbe.java",
            "build_manifest": str((BUILD / "build-manifest.json").relative_to(ROOT)),
            "BCI_146": "marker immediately before original goto 150; executing it identifies the success path.",
            "BCI_149": "marker immediately before original exception-handler pop; the exception object remains on the stack.",
            "join_and_suffix_markers": ["150", "151", "155", "168", "172", "175"],
            "original_game_jar_modified": False,
        },
        "methodology_limits": [
            "Each run begins from the hash-verified HOUSE-INPUT-001 fixture and enters the load path through the actual UI using synthetic AWT Enter events; input is not physical.",
            "The instrumentation is in a separate game-JAR copy and records only bt.run() mode-1 branch events; it still adds small runtime overhead.",
            "The screenshot is an X11 window capture and does not establish compositor or physical presentation timing.",
        ],
        "excluded_pilot": {
            "run_id": "M15-SCN-0004-CF02-branch-R01",
            "reason": "The trace reached BCI 146 and the complete suffix, but a timeline logging keyword collision raised after the screenshot capture. It is retained as an invalid pilot and excluded from the three-run result.",
            "record": "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF02-branch-R01/valid.json",
        },
        "runs": records,
    }
    write(BASE / "cf-02-branch-proof.json", audit)


def run(repeat):
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Game JAR identity mismatch")
    run_id = f"M15-SCN-0004-CF02-branch-R{repeat}"
    run_dir = BASE / run_id
    shot_dir = ROOT / "reference/screenshots" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    shot_dir.mkdir(parents=True, exist_ok=False)
    scratch = Path(tempfile.mkdtemp(prefix="heroes-lore-cf02-"))
    work = scratch / "work"
    shutil.copytree(SNAPSHOT, work)
    fixture_checks = verify_fixture(work)
    write(run_dir / "fixture-verification.json", {
        "source_manifest": str(SNAPSHOT_MANIFEST.relative_to(ROOT)),
        "source_fixture": str(SNAPSHOT.relative_to(ROOT)),
        "verified_file_count": len(fixture_checks), "files": fixture_checks})
    config = (work / "config/Heroes Lore/game.conf").read_text(errors="replace")
    if "phone:Standard" not in config:
        raise RuntimeError("Fixture does not contain the audited phone:Standard profile")
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{BUILD / 'cf02-probe.jar'}={run_dir / 'trace.jsonl'}|{run_id}",
            "-jar", str(EMU), (BUILD / "heroes-lore-cf02-probed.jar").as_uri(),
            "0", "240", "320", "2", "2", "60"]
    start_ns = time.monotonic_ns()
    process = None
    failures = []
    try:
        with (run_dir / "console.log").open("w") as console:
            process = subprocess.Popen(argv, cwd=work, stdout=console,
                                       stderr=subprocess.STDOUT, start_new_session=True)
        write(run_dir / "launch.json", {
            "run_id": run_id, "pid": process.pid,
            "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "mono_ns": start_ns, "argv": argv, "mode": "CF-02 branch trace",
            "fixture": "HOUSE-INPUT-001", "fixture_hashes_verified": len(fixture_checks),
            "input": "AWT LCD KeyListener sidecar; synthetic, not physical",
            "game_field_writes": False, "rng_controlled": False,
            "profile": "FreeJ2ME-Plus 1.52; phone:Standard; 240x320; limiter 60",
            "display": os.environ.get("DISPLAY")})
        timeline = run_dir / "timeline.jsonl"
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited during startup: {process.returncode}")
        window, _ = locate_window(process.pid)
        launch_record = json.loads((run_dir / "launch.json").read_text())
        launch_record["window_xid"] = hex(window)
        write(run_dir / "launch.json", launch_record)
        log(timeline, "startup_ready", wait_seconds=10)
        for step in (1, 2, 3):
            send_enter(process.pid, run_dir, step)
            if step < 3:
                time.sleep(1)
            else:
                time.sleep(10)
        capture(window, run_dir / "timeline.jsonl", shot_dir / "04-after-load.png")
        log(timeline, "after_load_capture", path=str((shot_dir / "04-after-load.png").relative_to(ROOT)))
    except Exception as error:
        failures.append(repr(error))
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=25)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        process_exit = {
            "returncode": process.returncode if process else None,
            "proc_absent": not Path(f"/proc/{process.pid}").exists() if process else True,
            "mono_ns": time.monotonic_ns()}
        shutil.rmtree(scratch, ignore_errors=True)

    trace_path = run_dir / "trace.jsonl"
    analysis = None
    if not trace_path.exists():
        failures.append("probe did not flush trace.jsonl")
    else:
        try:
            analysis = analyze_trace(trace_path, run_id)
        except Exception as error:
            failures.append(repr(error))
    if not (shot_dir / "04-after-load.png").exists():
        failures.append("after-load screenshot missing")
    if analysis:
        for invocation in analysis["worker_invocations"]:
            if invocation["decision"] == "undetermined":
                failures.append(f"branch decision missing in span {invocation['span_id']}")
            if invocation["decision"] == "success_BCI_146" and not invocation["suffix_ordered"]:
                failures.append(f"success suffix incomplete in span {invocation['span_id']}")
    console_text = (run_dir / "console.log").read_text(errors="replace") if (run_dir / "console.log").exists() else ""
    for marker in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "'):
        if marker in console_text:
            failures.append("fatal console marker: " + marker)
    valid = not failures
    write(run_dir / "valid.json", {"run_id": run_id, "valid": valid,
                                    "failures": failures,
                                    "process_exit": process_exit,
                                    "event_count": analysis["event_count"] if analysis else None,
                                    "mode1_invocations": analysis["worker_invocations"] if analysis else []})
    files = [p for p in run_dir.rglob("*") if p.is_file() and p.name != "manifest.json"]
    files.append(shot_dir / "04-after-load.png")
    write(run_dir / "manifest.json", {"run_id": run_id,
                                       "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": run_id, "valid": valid, "failures": failures,
                      "decisions": analysis["worker_invocations"] if analysis else [],
                      "manifest": str((run_dir / "manifest.json").relative_to(ROOT))},
                     ensure_ascii=False))
    if not valid:
        raise RuntimeError(f"CF-02 run {run_id} invalid: {failures}")
    write_campaign_audit()


if __name__ == "__main__":
    run(sys.argv[1])

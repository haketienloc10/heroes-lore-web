"""Capture a bounded natural Camera-On render-order trace from HOUSE-INPUT-001."""
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
EVIDENCE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261022-render-r1"
SIDECARS = ROOT / "reference/recordings/scheduler-sidecars"
RUN = "M15-SCN-0004-E-render-order-camera-on-R02"


def analyze(trace):
    rows = [json.loads(line) for line in trace.read_text().splitlines() if line.strip()]
    paints = [row for row in rows if row.get("event") == "method" and row.get("class") == "ar"
              and row.get("method") == "paint(Ljavax/microedition/lcdui/Graphics;)V" and row.get("phase") == "entry"]
    branches = [row for row in rows if row.get("event") == "branch_value"]
    calls = [row for row in rows if row.get("event") == "method" and row.get("phase") == "entry"
             and row.get("class") == "m" and row.get("method") in ("i()V", "g()V")]
    results = []
    for paint in paints:
        span = paint["span_id"]
        paint_branches = sorted([row for row in branches if row.get("span_id") == span], key=lambda row: row["seq"])
        paint_exit = next((row for row in rows if row.get("event") == "method" and row.get("class") == "ar"
                           and row.get("method") == "paint(Ljavax/microedition/lcdui/Graphics;)V"
                           and row.get("phase") == "exit" and row.get("span_id") == span), None)
        for index, branch in enumerate(paint_branches):
            boundary_seq = paint_branches[index + 1]["seq"] if index + 1 < len(paint_branches) else (
                paint_exit["seq"] if paint_exit else float("inf"))
            branch_calls = [row for row in calls if row.get("parent_span_id") == span
                            and branch["seq"] < row["seq"] < boundary_seq]
            names = [row["method"] for row in sorted(branch_calls, key=lambda row: row["seq"])]
            value = branch.get("value")
            expected = ["g()V", "i()V"] if value is True else ["i()V", "g()V"]
            results.append({"seq": branch.get("seq"), "value": value, "paint_span_id": span,
                            "calls_before_next_branch_or_paint_exit": names,
                            "expected_order": expected,
                            "matches_expected": names == expected,
                            "boundary": "next_branch" if index + 1 < len(paint_branches) else
                                       "paint_exit" if paint_exit else "trace_end"})
    health = json.loads(trace.with_name("trace-health.json").read_text())
    return {
        "run_id": RUN,
        "event_count": len(rows),
        "sequence_contiguous": [row.get("seq") for row in rows] == list(range(1, len(rows) + 1)),
        "trace_health": health,
        "branch_counts": {str(value): sum(row.get("value") is value for row in branches)
                          for value in (True, False)},
        "branch_orders": results,
        "camera_on_confirmed_in_gameplay": False,
        "analysis_note": "Set camera_on_confirmed_in_gameplay only after the read-only checkpoint reports m.e:I=2 and br.d:Z=true, and post-checkpoint branch segments show true with m.g()V then m.i()V."
    }


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
        "run_id": RUN, "pid": process.pid, "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "mono_ns": started, "argv": argv, "cwd": str(work.relative_to(ROOT)),
        "fixture": "HOUSE-INPUT-001", "route": "Three synthetic Enter callbacks through the save UI",
        "mode": "bounded trace-only run on an isolated instrumented game copy",
        "instrumented_game_sha256": common.hashlib.sha256((BUILD / "game-traced.jar").read_bytes()).hexdigest(),
        "emulator_sha256": common.hashlib.sha256(common.EMU.read_bytes()).hexdigest(),
        "trace_target": ["ar.paint(Graphics)V", "m.i()V", "m.g()V", "br.d:Z operand before original IFEQ BCI 94"],
        "probe_reflection": False, "game_state_reads": False, "game_state_writes": False,
        "synthetic_awt_input": True, "physical_input": False, "rng_controlled": False,
        "host_display": os.environ.get("DISPLAY"),
        "emulator_profile": "effective profile recorded by the read-only runtime snapshot"})
    try:
        time.sleep(10)
        if process.poll() is not None:
            raise RuntimeError(f"emulator exited during startup: {process.returncode}")
        window, tree = common.find_window(process.pid)
        (rd / "window-tree.txt").write_text(tree)
        common.capture(window, rd / "checkpoint-x11.jsonl", shots / "01-startup.png")
        for index in range(1, 4):
            common.agent(process.pid, SIDECARS / "probe-current.jar",
                         f"{rd / f'input-{index:02d}.log'}|10|10")
            time.sleep(1.5)
        time.sleep(8.5)
        common.agent(process.pid, SIDECARS / "probe-current.jar", str(rd / "runtime-state-after-load.log"))
        common.capture(window, rd / "checkpoint-x11.jsonl", shots / "02-after-load.png")
        time.sleep(20)
    finally:
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()

    common.write(rd / "process-exit.json", {
        "returncode": process.returncode,
        "proc_absent": not Path(f"/proc/{process.pid}").exists(),
        "mono_ns": time.monotonic_ns()})
    console = (rd / "console.log").read_text(errors="replace")
    fatal = [marker for marker in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "')
             if marker in console]
    if not (rd / "trace-health.json").exists():
        raise RuntimeError("trace agent did not flush trace-health.json")
    result = analyze(rd / "trace.jsonl")
    result["fatal_console_markers"] = fatal
    snapshot = (rd / "runtime-state-after-load.log").read_text(errors="replace")
    fields = {}
    for line in snapshot.splitlines():
        if " field m.e:int=" in line:
            fields["m.e:I"] = int(line.rsplit("=", 1)[1])
        elif " field br.d:boolean=" in line:
            fields["br.d:Z"] = line.rsplit("=", 1)[1].lower() == "true"
    state_lines = [line for line in snapshot.splitlines() if "mono_ns=" in line]
    checkpoint_mono_ns = int(state_lines[-1].split("mono_ns=", 1)[1].split()[0]) if state_lines else None
    result["gameplay_checkpoint"] = {"mono_ns": checkpoint_mono_ns, "fields": fields,
                                     "snapshot_path": str((rd / "runtime-state-after-load.log").relative_to(ROOT))}
    # Use each segment's branch timestamp to establish it occurred after the snapshot.
    trace_rows = [json.loads(line) for line in (rd / "trace.jsonl").read_text().splitlines() if line.strip()]
    branch_time = {row.get("seq"): row.get("t_mono_ns") for row in trace_rows if row.get("event") == "branch_value"}
    post_checkpoint = [row for row in result["branch_orders"]
                       if checkpoint_mono_ns is not None and branch_time.get(row["seq"], 0) >= checkpoint_mono_ns]
    post_checkpoint_call_bearing = [row for row in post_checkpoint
                                    if row["calls_before_next_branch_or_paint_exit"]]
    result["post_checkpoint_branch_orders"] = post_checkpoint
    result["post_checkpoint_call_bearing_segments"] = len(post_checkpoint_call_bearing)
    result["camera_on_confirmed_in_gameplay"] = (
        fields.get("m.e:I") == 2 and fields.get("br.d:Z") is True and bool(post_checkpoint_call_bearing)
        and all(row["value"] is True and row["matches_expected"] for row in post_checkpoint_call_bearing))
    result["runtime_snapshot"] = snapshot
    result["images"] = [str((shots / name).relative_to(ROOT)) for name in ("01-startup.png", "02-after-load.png")]
    result["limitations"] = ["One saved-game route and one run; not evidence for every game state.",
                             "Synthetic AWT input; not physical keyboard input.",
                             "X11 capture is not compositor or physical-presentation timing."]
    common.write(rd / "render-order-analysis.json", result)
    files = [path for path in rd.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in shots.rglob("*") if path.is_file())
    common.write(rd / "manifest.json", {"run_id": RUN, "files": [common.digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": RUN, "event_count": result["event_count"],
                      "sequence_contiguous": result["sequence_contiguous"],
                      "branch_counts": result["branch_counts"],
                      "gameplay_checkpoint": result["gameplay_checkpoint"],
                      "camera_on_confirmed_in_gameplay": result["camera_on_confirmed_in_gameplay"],
                      "post_checkpoint_segments": len(post_checkpoint),
                      "post_checkpoint_call_bearing_segments": len(post_checkpoint_call_bearing),
                      "branch_orders": result["branch_orders"][:4],
                      "trace_health": result["trace_health"], "fatal_console_markers": fatal},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

"""Run an independent, no-input cold-start capture for one CF-01 trial."""
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
BUILD = ROOT / "reference/recordings/scheduler-cf01-startup-20261022"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    try:
        relative = str(path.relative_to(ROOT))
    except ValueError:
        relative = str(path)
    return {"path": relative, "size": path.stat().st_size, "sha256": h.hexdigest()}


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def locate_window(pid):
    tree = subprocess.check_output(["xwininfo", "-root", "-tree"], text=True)
    frames = list(dict.fromkeys(re.findall(r"\b(0x[0-9a-f]+)\b", tree)))
    matches = []
    for frame in frames:
        prop = subprocess.run(["xprop", "-id", frame, "_NET_WM_PID"], text=True,
                              stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False).stdout
        if re.search(r"_NET_WM_PID\(CARDINAL\) = " + str(pid) + r"\b", prop):
            matches.append(frame)
    if len(matches) != 1:
        raise RuntimeError(f"Expected one FreeJ2ME window for pid {pid}; matches={matches}")
    return int(matches[0], 16), tree


def run(repeat):
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    run_id = f"M15-SCN-0004-CF01-startup-R{repeat}"
    run_dir = BASE / run_id
    work = ROOT / "reference/recordings" / run_id
    shots = ROOT / "reference/screenshots" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    work.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{BUILD / 'cf01-probe.jar'}={run_dir / 'trace.jsonl'}|{run_id}",
            "-jar", str(EMU), (BUILD / "heroes-lore-cf01-probed.jar").as_uri(),
            "0", "240", "320", "2", "2", "60"]
    start_ns = time.monotonic_ns()
    process = None
    try:
        with (run_dir / "console.log").open("w") as console:
            process = subprocess.Popen(argv, cwd=work, stdout=console,
                                       stderr=subprocess.STDOUT, start_new_session=True)
        write(run_dir / "launch.json", {
            "run_id": run_id, "pid": process.pid,
            "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "mono_ns": start_ns, "argv": argv,
            "scenario_variant": "natural cold start, no input; CF-01 startup trace",
            "game_jar": digest(GAME), "emulator_jar": digest(EMU),
            "game_field_writes": False, "input_sent": False,
            "profile": "FreeJ2ME-Plus 1.52; 240x320; limiter 60; no phone profile override",
            "display": os.environ.get("DISPLAY")})
        time.sleep(12)
        if process.poll() is not None:
            raise RuntimeError(f"Emulator exited before capture: returncode={process.returncode}")
        window, tree = locate_window(process.pid)
        (run_dir / "window-tree.txt").write_text(tree)
        write(run_dir / "checkpoint.json", {"mono_ns": time.monotonic_ns(), "window_xid": hex(window),
                                               "input": "none", "capture": "X11 window, not physical presentation"})
        subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                        str(run_dir / "capture.jsonl"), "capture", hex(window),
                        str(shots / "12s-cold-start.png")], check=True)
        write(run_dir / "stop.json", {"requested": "SIGTERM", "mono_ns": time.monotonic_ns()})
    except Exception as error:
        write(run_dir / "invalid.json", {"error": repr(error), "mono_ns": time.monotonic_ns()})
        raise
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        if process is not None:
            write(run_dir / "process-exit.json", {"returncode": process.returncode,
                                                    "proc_absent": not Path(f"/proc/{process.pid}").exists(),
                                                    "mono_ns": time.monotonic_ns()})

    trace_path = run_dir / "trace.jsonl"
    events = [json.loads(line) for line in trace_path.read_text().splitlines() if line.strip()] if trace_path.exists() else []
    trace_ok = bool(events) and all(event.get("run_id") == run_id for event in events)
    spans = {}
    for event in events:
        spans.setdefault(event["span_id"], []).append(event)
    invocation_results = []
    expected_order = ["bf_run_entry", "resource_load_success_goto_BCI_92", "call_cd_y_BCI_96",
                      "call_cd_A_BCI_99", "call_bf_b_BCI_208", "call_q_k_BCI_211", "bf_run_exit"]
    for span_id, group in spans.items():
        sites = [event["site"] for event in group]
        state = group[0]
        positions = {site: sites.index(site) for site in sites}
        success = (state["bf.a:B"] == 0 and state["bf.b:B"] == 1 and
                   all(site in positions for site in expected_order) and
                   all(positions[left] < positions[right] for left, right in zip(expected_order, expected_order[1:])) and
                   "resource_load_exception_handler_BCI_95" not in sites and
                   group[-1].get("outcome") == "normal_return")
        invocation_results.append({"span_id": span_id, "thread_id": state["thread_id"],
                                   "bf.a:B": state["bf.a:B"], "bf.b:B": state["bf.b:B"],
                                   "sites": sites, "decision": "success_BCI_92" if success else "partial_or_other",
                                   "ordered_suffix": success,
                                   "exception_handler_observed": "resource_load_exception_handler_BCI_95" in sites,
                                   "return_outcome": group[-1].get("outcome")})
    valid = trace_ok and any(item["decision"] == "success_BCI_92" for item in invocation_results)
    analysis = {"run_id": run_id, "valid": valid, "trace_event_count": len(events),
                "trace_sequence_contiguous": [e["seq"] for e in events] == list(range(1, len(events) + 1)),
                "invocations": invocation_results,
                "interpretation": "Success requires the same bf.run() invocation to enter a=0,b=1, execute the success goto, run cd.y/cd.A/bf.b/q.k, and return normally without the IOException handler marker."}
    write(run_dir / "analysis.json", analysis)
    console = (run_dir / "console.log").read_text(errors="replace")
    if any(marker in console for marker in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "')):
        valid = False
        analysis["valid"] = False
        analysis["console_error_markers"] = [marker for marker in ("VerifyError", "NoClassDefFoundError", "IllegalAccessError", 'Exception in thread "') if marker in console]
        write(run_dir / "analysis.json", analysis)
    files = [path for path in run_dir.rglob("*") if path.is_file() and path.name != "manifest.json"]
    shot_files = [path for path in shots.rglob("*") if path.is_file()]
    write(run_dir / "manifest.json", {"run_id": run_id, "files": [digest(path) for path in sorted(files + shot_files)]})
    print(json.dumps({"run_id": run_id, "valid": valid, "events": len(events),
                      "invocations": invocation_results,
                      "screenshot": str((shots / "12s-cold-start.png").relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    run(sys.argv[1])

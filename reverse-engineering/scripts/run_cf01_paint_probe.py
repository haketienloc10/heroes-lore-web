"""Capture natural no-input cold-start paint states at 12, 15, and 45 seconds."""
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
BUILD = ROOT / "reference/recordings/scheduler-cf01-paint-20261022"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    try:
        name = str(path.relative_to(ROOT))
    except ValueError:
        name = str(path)
    return {"path": name, "size": path.stat().st_size, "sha256": h.hexdigest()}


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
    actual_game = hashlib.sha256(GAME.read_bytes()).hexdigest()
    if actual_game != EXPECTED_GAME:
        raise RuntimeError(f"Original game JAR identity mismatch: {actual_game}")
    run_id = f"M15-SCN-0004-CF01-paint-R{repeat}"
    run_dir = BASE / run_id
    work = ROOT / "reference/recordings" / run_id
    shots = ROOT / "reference/screenshots" / run_id
    run_dir.mkdir(parents=True, exist_ok=False)
    work.mkdir(parents=True, exist_ok=False)
    shots.mkdir(parents=True, exist_ok=False)
    trace = run_dir / "trace.jsonl"
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{BUILD / 'cf01-paint-probe.jar'}={trace}|{run_id}",
            "-jar", str(EMU), (BUILD / "heroes-lore-cf01-paint-probed.jar").as_uri(),
            "0", "240", "320", "2", "2", "60"]
    process = None
    checkpoints = []
    started = time.monotonic_ns()
    try:
        with (run_dir / "console.log").open("w") as console:
            process = subprocess.Popen(argv, cwd=work, stdout=console,
                                       stderr=subprocess.STDOUT, start_new_session=True)
        write(run_dir / "launch.json", {"run_id": run_id, "pid": process.pid,
                                         "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                                         "mono_ns": started, "argv": argv,
                                         "scenario_variant": "natural cold start, no input; observe bf.paint state",
                                         "game_jar": digest(GAME), "emulator_jar": digest(EMU),
                                         "input_sent": False, "game_field_writes": False,
                                         "display": os.environ.get("DISPLAY")})
        window = None
        tree = ""
        for checkpoint in (12, 15, 45):
            target = started + checkpoint * 1_000_000_000
            time.sleep(max(0, (target - time.monotonic_ns()) / 1_000_000_000))
            if process.poll() is not None:
                raise RuntimeError(f"Emulator exited before {checkpoint}s checkpoint: {process.returncode}")
            if window is None:
                window, tree = locate_window(process.pid)
                (run_dir / "window-tree.txt").write_text(tree)
            output = shots / f"{checkpoint}s-cold-start.png"
            subprocess.run(["python3", str(ROOT / "reverse-engineering/scripts/runtime_x11.py"),
                            str(run_dir / "capture.jsonl"), "capture", hex(window), str(output)], check=True)
            checkpoints.append({"elapsed_target_seconds": checkpoint, "mono_ns": time.monotonic_ns(),
                                "screenshot": str(output.relative_to(ROOT)), "input": "none"})
        write(run_dir / "checkpoints.json", {"checkpoints": checkpoints,
                                               "presentation": "X11 window capture only; not physical presentation"})
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
    events = [json.loads(line) for line in trace.read_text().splitlines() if line.strip()] if trace.exists() else []
    if any(event.get("run_id") != run_id for event in events):
        raise RuntimeError("Trace contains a different run_id")
    sequence_ok = [event["seq"] for event in events] == list(range(1, len(events) + 1))
    paints = [event for event in events if event["site"] == "bf_paint_entry"]
    state_counts = {}
    for event in paints:
        state_counts[str(event["bf.a:B"])] = state_counts.get(str(event["bf.a:B"]), 0) + 1
    analysis = {"run_id": run_id, "trace_event_count": len(events), "trace_sequence_contiguous": sequence_ok,
                "bf_paint_entry_count": len(paints), "paint_counts_by_bf_a": state_counts,
                "field_writes": [event for event in events if event["site"] == "bf_a_field_write"],
                "checkpoints": checkpoints,
                "interpretation_limit": "Paint-state events are game-canvas calls; X11 screenshots do not establish compositor or physical presentation."}
    write(run_dir / "analysis.json", analysis)
    files = [path for path in run_dir.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in shots.rglob("*") if path.is_file())
    write(run_dir / "manifest.json", {"run_id": run_id, "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": run_id, "trace_events": len(events), "trace_sequence_contiguous": sequence_ok,
                      "bf_paint_entries": len(paints), "paint_counts_by_bf_a": state_counts,
                      "checkpoints": checkpoints}, ensure_ascii=False))


if __name__ == "__main__":
    run(sys.argv[1])

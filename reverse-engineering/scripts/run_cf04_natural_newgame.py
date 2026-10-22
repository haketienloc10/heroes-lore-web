"""Trace CF-04 natural reachability through the documented New Game intro route."""
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
RUN_ID = "M15-SCN-0004-CF04-natural-R01"
RUN_DIR = BASE / RUN_ID
BUILD = ROOT / "reference/recordings/scheduler-cf04-natural-v3-20261022"
SEED = ROOT / "reference/recordings/snapshots/HOUSE-INPUT-001"
SIDECARS = ROOT / "reference/recordings/scheduler-sidecars"
GAME = ROOT / "original/heroes-lore-v2.1.2.jar"
EMU = Path("/home/locdt/tools/freej2me-plus-v1.52/freej2me.jar")
EXPECTED_GAME = "7eb032297967f5d8382cc4f1ab5c3016459e01b235b42a3b88c6a8bfe46c5f61"


def digest(path):
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        name = str(path.relative_to(ROOT))
    except ValueError:
        name = str(path)
    return {"path": name, "size": path.stat().st_size, "sha256": h}


def write(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def tap(pid, step, code, workdir):
    output = workdir / f"input-{step:02d}.jsonl"
    begin_utc = datetime.datetime.now(datetime.timezone.utc).isoformat()
    begin_mono = time.monotonic_ns()
    command = ["java", "--add-modules", "jdk.attach", "-cp", str(SIDECARS),
               "RuntimeStateProbe", str(pid), str(SIDECARS / "probe-current.jar"),
               f"{output}|{code}|100"]
    result = subprocess.run(command, capture_output=True, text=True, check=True, timeout=20)
    return {"step": step, "awt_code": code, "hold_ms": 100, "physical": False,
            "utc": begin_utc, "mono_ns": begin_mono, "stdout": result.stdout.strip(),
            "stderr": result.stderr.strip(), "sidecar_output": output.read_text(errors="replace") if output.exists() else ""}


def analyze(path):
    rows = [json.loads(line) for line in path.read_text().splitlines() if line.strip()]
    failures = []
    if [row.get("seq") for row in rows] != list(range(1, len(rows) + 1)):
        failures.append("probe sequence is not contiguous")
    if any(row.get("run_id") != RUN_ID for row in rows):
        failures.append("trace run_id mismatch")
    setters = [row for row in rows if row.get("site") == "m.a(BB)_entry" and
               row.get("argument_command") == 21 and row.get("argument_param") == 2]
    text_calls = [row for row in rows if row.get("site") == "ar.e_text_completion_calls_pending_setter"]
    key_calls = [row for row in rows if row.get("site") == "ar.keyPressed_natural_command_setter"]
    state12 = [row for row in rows if row.get("site") == "m.a(I)_state_setter" and row.get("new_m.e:I") == 12]
    state13 = [row for row in rows if row.get("site") == "m.a(I)_state_setter" and row.get("new_m.e:I") == 13]
    spans = {}
    for row in rows:
        if row.get("site") == "m.e_entry_pending":
            spans[row.get("m_e_span")] = [row]
        elif row.get("m_e_span") in spans:
            spans[row["m_e_span"]].append(row)
    target_spans = []
    for span_id, group in spans.items():
        first = group[0]
        if first.get("m.b:B") != 21 or first.get("m.c:B") != 2:
            continue
        sites = [row.get("site") for row in group]
        worker_ids = {row.get("worker_id") for row in group if row.get("site") == "bt_worker_constructed"}
        worker_case5 = [row for row in rows if row.get("m_e_span") == span_id and
                        row.get("site") == "bt.run_case5_BCI_190" and row.get("bt.a:B") == 5 and
                        row.get("worker_id") in worker_ids]
        target_spans.append({"span_id": span_id, "state": first.get("m.e:I"),
                             "pending_command": first.get("m.b:B"), "param": first.get("m.c:B"),
                             "thread_id": first.get("thread_id"), "sites": sites,
                             "mode5_worker_case": worker_case5})
    natural_text_sequence = False
    if setters and text_calls:
        text_seq = text_calls[0].get("seq")
        natural_text_sequence = any(row.get("seq") > text_seq and row.get("argument_command") == 21 and
                                    row.get("argument_param") == 2 and row.get("thread_id") == text_calls[0].get("thread_id")
                                    for row in setters)
    natural_key_sequence = False
    if setters and key_calls:
        key_seq = key_calls[0].get("seq")
        natural_key_sequence = any(row.get("seq") > key_seq and row.get("argument_command") == 21 and
                                   row.get("argument_param") == 2 and row.get("thread_id") == key_calls[0].get("thread_id")
                                   for row in setters)
    natural = bool(setters and (natural_text_sequence or natural_key_sequence))
    relevant_sites = {"m.a(BB)_entry", "m.e_entry_pending", "m.e_return",
                      "m.e_return_immediately_after_bt.d", "m.e_call_m.c;opcode_index=126",
                      "m.e_call_bt.d;opcode_index=132", "m.a(I)_state_setter",
                      "bt_worker_constructed", "bt.d_after_mode_store", "bt.d_return",
                      "bt.run_entry", "bt.run_case5_BCI_190",
                      "ar.e_text_completion_calls_pending_setter",
                      "ar.keyPressed_natural_command_setter"}
    relevant = [row for row in rows if row.get("site") in relevant_sites or
                (isinstance(row.get("site"), str) and row["site"].startswith("m.e_call_"))]
    return {"event_count": len(rows), "sequence_contiguous": not any("sequence" in item for item in failures),
            "relevant_events": relevant, "command_21_2_setter_count": len(setters),
            "ar_e_text_completion_call_count": len(text_calls),
            "ar_keyPressed_command_call_count": len(key_calls),
            "state12_setter_count": len(state12), "state13_setter_count": len(state13),
            "natural_text_setter_sequence": natural_text_sequence,
            "natural_key_setter_sequence": natural_key_sequence,
            "natural_command_21_2_observed": natural,
            "target_m_e_spans": target_spans,
            "failures": failures}


def main():
    if RUN_DIR.exists():
        raise RuntimeError(f"Refusing to overwrite {RUN_DIR}")
    if hashlib.sha256(GAME.read_bytes()).hexdigest() != EXPECTED_GAME:
        raise RuntimeError("Original game JAR identity mismatch")
    RUN_DIR.mkdir(parents=True)
    scratch = Path(tempfile.mkdtemp(prefix="heroes-lore-cf04-natural-"))
    work = scratch / "work"
    shutil.copytree(SEED, work)
    rms = work / "rms/Heroes Lore"
    removed_rms = []
    for path in rms.iterdir():
        if path.is_file():
            removed_rms.append({"relative_path": str(path.relative_to(work)), **digest(path)})
            path.unlink()
        elif path.is_dir():
            shutil.rmtree(path)
    game_conf = work / "config/Heroes Lore/game.conf"
    old_config = game_conf.read_text(errors="replace")
    if "phone:Standard" not in old_config:
        raise RuntimeError("Expected Standard profile in seed fixture")
    game_conf.write_text(old_config.replace("phone:Standard", "phone:Motorola", 1))
    launch = {
        "run_id": RUN_ID,
        "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "game": digest(GAME), "emulator": digest(EMU),
        "seed_snapshot": str(SEED.relative_to(ROOT)), "seed_game_rms_removed": removed_rms,
        "work_profile": "FreeJ2ME-Plus 1.52; phone:Motorola; 240x320; limiter 60",
        "route": "New Game intro via existing SCN-0002/HOUSE-EXIT-001 recipe, then 30 s idle; no 0.9-second timing action",
        "natural_probe": True, "game_field_writes": False,
        "injection": False, "physical_input": False,
        "display": os.environ.get("DISPLAY"),
        "source_game_sha256": EXPECTED_GAME,
        "work_config_sha256": hashlib.sha256(game_conf.read_bytes()).hexdigest(),
    }
    argv = ["java", "-Dfile.encoding=ISO_8859_1", "-Dsun.java2d.uiScale=1",
            f"-javaagent:{BUILD / 'cf04-probe.jar'}={RUN_DIR / 'trace.jsonl'}|{RUN_ID}",
            "-jar", str(EMU), (BUILD / "heroes-lore-cf04-probed.jar").as_uri(),
            "0", "240", "320", "2", "2", "60"]
    launch["argv"] = argv
    launch["mono_ns"] = time.monotonic_ns()
    process = None
    inputs = []
    error = None
    try:
        with (RUN_DIR / "console.log").open("w") as console:
            process = subprocess.Popen(argv, cwd=work, stdout=console, stderr=subprocess.STDOUT,
                                       start_new_session=True)
        launch["pid"] = process.pid
        time.sleep(10)
        sequence = [(10, 2000), (40, 700), (38, 700), (10, 700), (87, 700),
                    (10, 700), (10, 700), (10, 700), (10, 700), (39, 700),
                    (10, 700), (37, 700), (10, 10000)]
        for step, (code, wait_ms) in enumerate(sequence, 1):
            inputs.append(tap(process.pid, step, code, scratch))
            time.sleep(wait_ms / 1000)
        idle_start = time.monotonic_ns()
        time.sleep(30)
        launch["idle_after_intro_start_mono_ns"] = idle_start
    except Exception as exc:
        error = repr(exc)
    finally:
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=25)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        launch["process_exit"] = {"returncode": process.returncode if process else None,
                                  "proc_absent": not Path(f"/proc/{process.pid}").exists() if process else True,
                                  "mono_ns": time.monotonic_ns()}
        shutil.rmtree(scratch, ignore_errors=True)

    write(RUN_DIR / "launch.json", launch)
    analysis = analyze(RUN_DIR / "trace.jsonl") if (RUN_DIR / "trace.jsonl").exists() else {
        "event_count": 0, "sequence_contiguous": False, "relevant_events": [], "command_21_2_setter_count": 0,
        "ar_e_text_completion_call_count": 0, "ar_keyPressed_command_call_count": 0,
        "state12_setter_count": 0, "state13_setter_count": 0,
        "natural_text_setter_sequence": False, "natural_key_setter_sequence": False,
        "natural_command_21_2_observed": False, "target_m_e_spans": [],
        "failures": ["probe did not flush trace.jsonl"]}
    if error:
        analysis["failures"].append("run error: " + error)
    result = {
        "run_id": RUN_ID,
        "status": "natural_21_2_observed" if analysis["natural_command_21_2_observed"] else "route_did_not_reach_21_2",
        "inputs": inputs, "analysis": analysis,
        "route_specific_limit": "A single fresh New Game intro route only; absence of 21/2 does not prove global UI unreachability.",
        "skipped_case": "The requested 0.9-second bypass timing action was not attempted.",
    }
    write(RUN_DIR / "analysis.json", result)
    files = [path for path in RUN_DIR.rglob("*") if path.is_file() and path.name != "manifest.json"]
    write(RUN_DIR / "manifest.json", {"run_id": RUN_ID, "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": RUN_ID, "status": result["status"],
                      "events": analysis["event_count"], "state12": analysis["state12_setter_count"],
                      "state13": analysis["state13_setter_count"],
                      "command_21_2": analysis["command_21_2_setter_count"],
                      "text_completion": analysis["natural_text_setter_sequence"],
                      "failures": analysis["failures"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

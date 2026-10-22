"""Reanalyze and hash the three state-triggered scheduler bypass runs."""
import hashlib
import json
import os
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023"
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261023-bypass-state-trigger-r1"
RUN_IDS = [f"M15-SCN-0004-E-bypass-state-triggered-R0{i}" for i in range(1, 4)]
SOURCES = [
    "reverse-engineering/scripts/StateTriggeredBypassInstrumenter.java",
    "reverse-engineering/scripts/StateTriggeredBypassTraceProbe.java",
    "reverse-engineering/scripts/build_state_triggered_bypass_probe.py",
    "reverse-engineering/scripts/run_state_triggered_bypass.py",
    "reverse-engineering/scripts/analyze_state_triggered_bypass.py",
    "reverse-engineering/scripts/finalize_state_triggered_bypass.py",
    "reference/scenarios/SCN-0004-game-loop.md",
    "reverse-engineering/findings/FND-0004-runtime-scheduler.md",
    "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023/README.md",
]


def digest(path):
    value = hashlib.sha256(path.read_bytes()).hexdigest()
    try:
        name = str(path.relative_to(ROOT))
    except ValueError:
        name = str(path)
    return {"path": name, "size": path.stat().st_size, "sha256": value}


def write(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def run_manifest(run_id):
    run = BASE / run_id
    screenshots = ROOT / "reference/screenshots" / run_id
    files = [path for path in run.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in screenshots.rglob("*") if path.is_file())
    manifest = {"run_id": run_id, "files": [digest(path) for path in sorted(files)]}
    write(run / "manifest.json", manifest)
    return manifest


def main():
    summaries = []
    referenced = set()
    files_checked = 0
    for run_id in RUN_IDS:
        subprocess.run([sys.executable, str(ROOT / "reverse-engineering/scripts/analyze_state_triggered_bypass.py")],
                       env={**os.environ, "STATE_TRIGGERED_RUN_ID": run_id}, check=True)
        manifest = run_manifest(run_id)
        for item in manifest["files"]:
            path = ROOT / item["path"]
            if path.stat().st_size != item["size"] or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
                raise RuntimeError(f"Per-run manifest mismatch: {item['path']}")
            referenced.add(path)
            files_checked += 1
        analysis = json.loads((BASE / run_id / "analysis.json").read_text())
        if analysis["assessment"] != "runtime_true_branch_observed":
            raise RuntimeError(f"Run did not observe true branch: {run_id}")
        if not analysis["state4_intervals"] or analysis["state4_intervals"][0]["previous_state"] != 2:
            raise RuntimeError(f"Run did not show state 2->4: {run_id}")
        summaries.append(analysis)

    transition_durations = [item["state4_intervals"][0]["duration_ms"] for item in summaries]
    state4_to_key = [item["state4_to_key_ms"] for item in summaries]
    down_to_state4 = [item["down_key_to_state4_ms"] for item in summaries]
    aggregate = {
        "purpose": "controlled runtime verification of the state-4 Right Soft pacing bypass",
        "run_count": len(summaries),
        "independent_fixture_copies": len(summaries),
        "state_2_to_4_observed": sum(item["state4_intervals"][0]["previous_state"] == 2 for item in summaries),
        "right_soft_raw_minus_22_in_state_4": sum(bool(item["state4_right_soft_callbacks"]) for item in summaries),
        "ag_a_ii_calls_after_triggered_key": sum(item["ag_handler_calls_after_state4_right_soft"] > 0 for item in summaries),
        "true_bypass_observations": sum(item["br_b_true_operand_observations"] for item in summaries),
        "true_bypass_spans_without_br_a_helper": sum(item["br_b_true_without_br_a_helper"] for item in summaries),
        "helper_calls_in_false_pacing_spans": sum(item["br_a_helper_calls"] for item in summaries),
        "trace_events_total": sum(item["trace_events"] for item in summaries),
        "trace_dropped_total": sum(item["trace_health"]["dropped"] for item in summaries),
        "timing_ms": {
            "Down_key_to_state_4": {"values": down_to_state4, "min": min(down_to_state4),
                                     "median": statistics.median(down_to_state4), "max": max(down_to_state4)},
            "state_4_to_Right_Soft_callback": {"values": state4_to_key, "min": min(state4_to_key),
                                               "median": statistics.median(state4_to_key), "max": max(state4_to_key)},
            "state_4_to_next_state_1_after_trigger": {"values": transition_durations,
                                                        "min": min(transition_durations),
                                                        "median": statistics.median(transition_durations),
                                                        "max": max(transition_durations)},
        },
        "runs": [{"run_id": item["run_id"], "assessment": item["assessment"],
                  "state4_transition": item["state4_intervals"][0],
                  "down_key_to_state4_ms": item["down_key_to_state4_ms"],
                  "state4_to_key_ms": item["state4_to_key_ms"],
                  "key": item["state4_right_soft_callbacks"][0],
                  "handler": item["ag_handler_calls_after_state4_right_soft"],
                  "true_branches_without_helper": item["br_b_true_without_br_a_helper"],
                  "trace_events": item["trace_events"], "trace_dropped": item["trace_health"]["dropped"]}
                 for item in summaries],
        "limitations": ["synthetic AWT inputs; not physical keyboard input",
                        "one fixed save-exit route and Motorola profile",
                        "does not measure compositor or physical presentation latency"],
    }
    write(BASE / "aggregate.json", aggregate)

    files = {path for path in BASE.rglob("*") if path.is_file() and path != BASE / "manifest.json"}
    files.update(referenced)
    files.update(path for path in BUILD.rglob("*") if path.is_file())
    files.update(ROOT / path for path in SOURCES)
    manifest = {
        "producer": "finalize_state_triggered_bypass.py; SHA-256 metadata only",
        "date": "2026-10-23",
        "run_count": len(RUN_IDS),
        "per_run_manifest_files_checked": files_checked,
        "files": [digest(path) for path in sorted(files)],
    }
    write(BASE / "manifest.json", manifest)
    print(json.dumps({"manifest": str((BASE / "manifest.json").relative_to(ROOT)),
                      "run_count": len(RUN_IDS), "per_run_files_checked": files_checked,
                      "files_hashed": len(files), "true_branch_runs": aggregate["right_soft_raw_minus_22_in_state_4"],
                      "state_2_to_4_runs": aggregate["state_2_to_4_observed"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

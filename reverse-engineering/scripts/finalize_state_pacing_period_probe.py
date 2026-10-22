"""Validate and hash the one-route effective pacing-period capture."""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-pacing-period"
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261023-pacing-period-r1"
RUN_ID = "M15-SCN-0004-E-pacing-period-R01"
SOURCES = [
    "reverse-engineering/scripts/StatePacingPeriodInstrumenter.java",
    "reverse-engineering/scripts/StatePacingPeriodTraceProbe.java",
    "reverse-engineering/scripts/build_state_pacing_period_probe.py",
    "reverse-engineering/scripts/run_state_pacing_period_probe.py",
    "reverse-engineering/scripts/analyze_state_pacing_period_probe.py",
    "reverse-engineering/scripts/finalize_state_pacing_period_probe.py",
    "reference/scenarios/SCN-0004-game-loop.md",
    "reverse-engineering/findings/FND-0004-runtime-scheduler.md",
    "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-pacing-period/README.md",
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


def main():
    run = BASE / RUN_ID
    subprocess.run([sys.executable, str(ROOT / "reverse-engineering/scripts/analyze_state_pacing_period_probe.py")],
                   env={**os.environ, "STATE_PACING_PERIOD_RUN_ID": RUN_ID}, check=True)
    analysis = json.loads((run / "analysis.json").read_text())
    if analysis["assessment"] != "runtime_period_argument_observed":
        raise RuntimeError("Runtime target period capture is inconclusive")
    if not analysis["trace_contiguous"] or analysis["trace_health"].get("dropped") != 0:
        raise RuntimeError("Trace continuity/health validation failed")
    if analysis["helper_entries"] != analysis["period_markers"]:
        raise RuntimeError("Helper entries and target-period markers differ")
    periods = analysis["target_period_ms_by_last_observed_state_setter"]
    expected = {"1": {"200": 35}, "2": {"71": 130}, "4": {"71": 2}, "9": {"50": 43}}
    for state, values in expected.items():
        if periods.get(state) != values:
            raise RuntimeError(f"Unexpected target period distribution for state {state}: {periods.get(state)}")

    screenshots = ROOT / "reference/screenshots" / RUN_ID
    files = [path for path in run.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in screenshots.rglob("*") if path.is_file())
    run_manifest = {"run_id": RUN_ID, "files": [digest(path) for path in sorted(files)]}
    write(run / "manifest.json", run_manifest)
    checked = set()
    for item in run_manifest["files"]:
        path = ROOT / item["path"]
        if path.stat().st_size != item["size"] or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
            raise RuntimeError(f"Per-run manifest mismatch: {item['path']}")
        checked.add(path)

    aggregate = {
        "purpose": "direct observation of br.a(JJ)V second long argument, which br.b() loads from br.d:I",
        "run_count": 1,
        "independent_fixture_copies": 1,
        "profile": "FreeJ2ME-Plus 1.52, phone:Motorola, 240x320, limiter 60",
        "trace_events": analysis["trace_events"],
        "trace_dropped": analysis["trace_health"]["dropped"],
        "helper_entries": analysis["helper_entries"],
        "period_markers": analysis["period_markers"],
        "target_period_ms_by_last_observed_state_setter": periods,
        "run_id": RUN_ID,
        "limitations": analysis["limitations"],
    }
    write(BASE / "aggregate.json", aggregate)

    all_files = {path for path in BASE.rglob("*") if path.is_file() and path != BASE / "manifest.json"}
    all_files.update(checked)
    all_files.update(path for path in BUILD.rglob("*") if path.is_file())
    all_files.update(ROOT / path for path in SOURCES)
    manifest = {
        "producer": "finalize_state_pacing_period_probe.py; SHA-256 metadata only",
        "date": "2026-10-23",
        "run_count": 1,
        "per_run_manifest_files_checked": len(checked),
        "files": [digest(path) for path in sorted(all_files)],
    }
    write(BASE / "manifest.json", manifest)
    print(json.dumps({"manifest": str((BASE / "manifest.json").relative_to(ROOT)),
                      "run_count": 1, "per_run_files_checked": len(checked),
                      "files_hashed": len(all_files), "helper_entries": aggregate["helper_entries"],
                      "target_periods_by_state": periods}, ensure_ascii=False))


if __name__ == "__main__":
    main()

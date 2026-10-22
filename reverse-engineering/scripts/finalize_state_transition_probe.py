"""Validate and hash the runtime attribution of the m.e 2->4 setter to m.n inside m.i."""
import hashlib
import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-transition-attribution"
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261023-transition-attribution-r1"
RUN_ID = "M15-SCN-0004-E-transition-attribution-R01"
SOURCES = [
    "reverse-engineering/scripts/StateTransitionInstrumenter.java",
    "reverse-engineering/scripts/StateTransitionTraceProbe.java",
    "reverse-engineering/scripts/build_state_transition_probe.py",
    "reverse-engineering/scripts/run_state_transition_probe.py",
    "reverse-engineering/scripts/analyze_state_transition_probe.py",
    "reverse-engineering/scripts/finalize_state_transition_probe.py",
    "reference/scenarios/SCN-0004-game-loop.md",
    "reverse-engineering/findings/FND-0004-runtime-scheduler.md",
    "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-transition-attribution/README.md",
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
    subprocess.run([sys.executable, str(ROOT / "reverse-engineering/scripts/analyze_state_transition_probe.py")],
                   env={**os.environ, "STATE_TRANSITION_RUN_ID": RUN_ID}, check=True)
    analysis = json.loads((run / "analysis.json").read_text())
    if analysis["assessment"] != "state2_to4_attributed_to_m_n_inside_m_i":
        raise RuntimeError("State transition caller attribution is inconclusive")
    if not analysis["trace_contiguous"] or analysis["trace_health"].get("dropped") != 0:
        raise RuntimeError("Trace continuity/health validation failed")
    proof = analysis["state4_attribution"]
    if len(proof) != 1 or proof[0].get("nested_state2_to4_in_m_n_inside_m_i") is not True:
        raise RuntimeError("Expected one nested state 2->4 attribution proof")

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
        "purpose": "runtime attribution of the original m.e:I 2->4 store to m.n() nested inside m.i()",
        "run_count": 1,
        "independent_fixture_copies": 1,
        "trace_events": analysis["trace_events"],
        "trace_dropped": analysis["trace_health"]["dropped"],
        "state4_attribution": proof[0],
        "transition_stack_errors": analysis["transition_stack_errors"],
        "limitations": analysis["limitations"],
    }
    write(BASE / "aggregate.json", aggregate)

    all_files = {path for path in BASE.rglob("*") if path.is_file() and path != BASE / "manifest.json"}
    all_files.update(checked)
    all_files.update(path for path in BUILD.rglob("*") if path.is_file())
    all_files.update(ROOT / path for path in SOURCES)
    manifest = {
        "producer": "finalize_state_transition_probe.py; SHA-256 metadata only",
        "date": "2026-10-23",
        "run_count": 1,
        "per_run_manifest_files_checked": len(checked),
        "files": [digest(path) for path in sorted(all_files)],
    }
    write(BASE / "manifest.json", manifest)
    print(json.dumps({"manifest": str((BASE / "manifest.json").relative_to(ROOT)),
                      "run_count": 1, "per_run_files_checked": len(checked),
                      "files_hashed": len(all_files), "trace_events": analysis["trace_events"],
                      "state2_to4_attribution": proof[0]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

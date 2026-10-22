"""Reanalyze, aggregate and hash per-state pacing observations from the three runs."""
import hashlib
import json
import math
import os
import statistics
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-pacing-state"
BUILD = ROOT / "reference/recordings/scheduler-probe-followup-20261023-pacing-state-r1"
RUN_IDS = [f"M15-SCN-0004-E-pacing-state-R0{i}" for i in range(1, 4)]
SOURCES = [
    "reverse-engineering/scripts/StatePacingInstrumenter.java",
    "reverse-engineering/scripts/StatePacingTraceProbe.java",
    "reverse-engineering/scripts/build_state_pacing_probe.py",
    "reverse-engineering/scripts/run_state_pacing_probe.py",
    "reverse-engineering/scripts/analyze_state_pacing_probe.py",
    "reverse-engineering/scripts/finalize_state_pacing_probe.py",
    "reference/scenarios/SCN-0004-game-loop.md",
    "reverse-engineering/findings/FND-0004-runtime-scheduler.md",
    "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-pacing-state/README.md",
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
    analyses = []
    referenced = set()
    files_checked = 0
    for run_id in RUN_IDS:
        subprocess.run([sys.executable, str(ROOT / "reverse-engineering/scripts/analyze_state_pacing_probe.py")],
                       env={**os.environ, "STATE_PACING_RUN_ID": run_id}, check=True)
        manifest = run_manifest(run_id)
        for item in manifest["files"]:
            path = ROOT / item["path"]
            if path.stat().st_size != item["size"] or hashlib.sha256(path.read_bytes()).hexdigest() != item["sha256"]:
                raise RuntimeError(f"Per-run manifest mismatch: {item['path']}")
            referenced.add(path)
            files_checked += 1
        analysis = json.loads((BASE / run_id / "analysis.json").read_text())
        if analysis["assessment"] != "complete_for_observed_route":
            raise RuntimeError(f"Pacing attribution is inconclusive: {run_id}")
        if not analysis["trace_contiguous"] or not analysis["trace_single_game_thread"]:
            raise RuntimeError(f"Trace continuity/thread invariant failed: {run_id}")
        if analysis["trace_health"].get("dropped") != 0 or analysis["span_errors"]:
            raise RuntimeError(f"Trace health/span validation failed: {run_id}")
        analyses.append(analysis)

    state_names = sorted({state for analysis in analyses
                          for state in analysis["pacing_by_last_observed_state_setter"]})
    totals = {}
    for state in state_names:
        totals[state] = {}
        metric_names = set().union(*(analysis["pacing_by_last_observed_state_setter"].get(state, {}).keys()
                                     for analysis in analyses))
        for metric in sorted(metric_names):
            values = [analysis["pacing_by_last_observed_state_setter"].get(state, {}).get(metric, 0)
                      for analysis in analyses]
            totals[state][metric] = {"per_run": values, "total": sum(values)}

    pooled_durations = {}
    duration_states = sorted({state for analysis in analyses
                              for state in analysis["helper_duration_samples_ms"]})
    for state in duration_states:
        pooled_durations[state] = {}
        kinds = sorted({kind for analysis in analyses
                        for kind in analysis["helper_duration_samples_ms"].get(state, {})})
        for kind in kinds:
            samples = [value for analysis in analyses
                       for value in analysis["helper_duration_samples_ms"].get(state, {}).get(kind, [])]
            sorted_samples = sorted(samples)
            pooled_durations[state][kind] = {
                "n": len(samples),
                "min": min(samples),
                "median": round(statistics.median(samples), 6),
                "p95_nearest_rank": sorted_samples[math.ceil(0.95 * len(sorted_samples)) - 1],
                "max": max(samples),
                "per_run_median": [analysis["helper_duration_stats_ms"].get(state, {}).get(kind, {}).get("median")
                                   for analysis in analyses],
                "per_run_p95": [analysis["helper_duration_stats_ms"].get(state, {}).get(kind, {}).get("p95_nearest_rank")
                                for analysis in analyses],
            }

    aggregate = {
        "purpose": "classify br.a(JJ)V Thread.sleep/Thread.yield callsites by the latest observed m.e:I setter in a controlled house-exit route",
        "run_count": len(analyses),
        "independent_fixture_copies": len(analyses),
        "profile": "FreeJ2ME-Plus 1.52, phone:Motorola, 240x320, limiter 60",
        "trace_events_total": sum(item["trace_events"] for item in analyses),
        "trace_dropped_total": sum(item["trace_health"]["dropped"] for item in analyses),
        "runs_with_complete_state_attribution": sum(item["assessment"] == "complete_for_observed_route"
                                                      for item in analyses),
        "pacing_by_last_observed_state_setter": totals,
        "helper_duration_ms_by_state_and_callsite": pooled_durations,
        "runs": [{"run_id": item["run_id"], "trace_events": item["trace_events"],
                  "state_setters": item["state_setters"],
                  "state_totals": item["pacing_by_last_observed_state_setter"]}
                 for item in analyses],
        "limitations": [
            "the state attribution applies only between instrumented m.a(I)V stores to m.e:I on the observed game thread",
            "states 1, 2, 4 and 9 occur on this house-exit route; unknown pre-first-store spans are reported separately",
            "sleep/yield counts are callsite observations immediately before invocation, not measured blocked durations",
            "helper entry-to-exit duration includes probe overhead and helper computations; it is not pure sleep time",
            "synthetic AWT input; no physical keyboard-repeat or compositor-presentation claim",
        ],
    }
    write(BASE / "aggregate.json", aggregate)

    files = {path for path in BASE.rglob("*") if path.is_file() and path != BASE / "manifest.json"}
    files.update(referenced)
    files.update(path for path in BUILD.rglob("*") if path.is_file())
    files.update(ROOT / path for path in SOURCES)
    manifest = {
        "producer": "finalize_state_pacing_probe.py; SHA-256 metadata only",
        "date": "2026-10-23",
        "run_count": len(RUN_IDS),
        "per_run_manifest_files_checked": files_checked,
        "files": [digest(path) for path in sorted(files)],
    }
    write(BASE / "manifest.json", manifest)
    print(json.dumps({"manifest": str((BASE / "manifest.json").relative_to(ROOT)),
                      "run_count": len(RUN_IDS), "per_run_files_checked": files_checked,
                      "files_hashed": len(files), "trace_events": aggregate["trace_events_total"],
                      "dropped": aggregate["trace_dropped_total"]}, ensure_ascii=False))


if __name__ == "__main__":
    main()

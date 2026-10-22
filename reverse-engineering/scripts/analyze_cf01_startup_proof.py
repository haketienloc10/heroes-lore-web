"""Aggregate and audit three no-input CF-01 startup traces."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
RUNS = ["M15-SCN-0004-CF01-startup-R02", "M15-SCN-0004-CF01-startup-R03",
        "M15-SCN-0004-CF01-startup-R04"]


def digest(path):
    h = hashlib.sha256(path.read_bytes()).hexdigest()
    return h


def main():
    records = []
    all_success = True
    for run_id in RUNS:
        run_dir = BASE / run_id
        analysis = json.loads((run_dir / "analysis.json").read_text())
        manifest = json.loads((run_dir / "manifest.json").read_text())
        checks = []
        for item in manifest["files"]:
            path = ROOT / item["path"]
            actual = {"size": path.stat().st_size, "sha256": digest(path)}
            valid = actual["size"] == item["size"] and actual["sha256"] == item["sha256"]
            checks.append(valid)
            if not valid:
                raise RuntimeError(f"Manifest mismatch: {item['path']}")
        invocations = analysis["invocations"]
        success = (analysis["valid"] and analysis["trace_sequence_contiguous"] and
                   len(invocations) == 1 and invocations[0]["decision"] == "success_BCI_92" and
                   invocations[0]["ordered_suffix"] and not invocations[0]["exception_handler_observed"])
        all_success = all_success and success
        screenshot = ROOT / "reference/screenshots" / run_id / "12s-cold-start.png"
        records.append({
            "run_id": run_id, "valid": success, "trace_event_count": analysis["trace_event_count"],
            "trace": str((run_dir / "trace.jsonl").relative_to(ROOT)),
            "analysis": str((run_dir / "analysis.json").relative_to(ROOT)),
            "invocations": invocations,
            "launch_record": str((run_dir / "launch.json").relative_to(ROOT)),
            "screenshot": str(screenshot.relative_to(ROOT)),
            "screenshot_sha256": digest(screenshot),
            "per_run_manifest": str((run_dir / "manifest.json").relative_to(ROOT)),
            "per_run_manifest_files_verified": len(checks),
        })
    audit = {
        "finding": "CF-01", "date": "2026-10-22",
        "status": "three_natural_startup_success_routes_observed" if all_success else "partial_or_mixed_result",
        "criterion": "Three independent no-input cold starts observe bf.run()V with a=0,b=1 take the resource-load success goto at original BCI 92, avoid the IOException handler at BCI 95, execute cd.y/cd.A/bf.b/q.k, and return normally.",
        "result": "All three traces record the same ordered success suffix and normal return; no IOException handler marker is present." if all_success else "Review per-run results; do not infer missing events as success.",
        "instrumentation": {
            "instrumenter": "reverse-engineering/scripts/CF01Instrumenter.java",
            "probe": "reverse-engineering/scripts/CF01TraceProbe.java",
            "build_manifest": "reference/recordings/scheduler-cf01-startup-20261022/build-manifest.json",
            "original_bci_sites": {"success_goto": 92, "exception_handler_pop": 95, "cd.y": 96,
                                    "cd.A": 99, "bf.b": 208, "q.k": 211, "return": 214},
            "game_jar_modified": False,
            "probe_reads": "bf.a:B and bf.b:B are read directly at bf.run entry; no reflection, game method calls, field writes, or input injection.",
        },
        "methodology_limits": [
            "Three independent cold starts run in fresh working directories; no input or fixture state is used.",
            "The instrumented game is a separate copy and adds small execution overhead; the original JAR is unchanged.",
            "The 12-second checkpoint is an X11 window capture showing the logo; it is not a physical-presentation measurement.",
            "The exception route was not induced; evidence is limited to natural resource-load success during these starts.",
        ],
        "excluded_pilot": {
            "run_id": "M15-SCN-0004-CF01-startup-R01",
            "reason": "Harness metadata path error occurred before emulator launch; no game process ran and it is excluded.",
            "record": "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022/M15-SCN-0004-CF01-startup-R01/invalid.json",
        },
        "runs": records,
    }
    if not all_success:
        raise RuntimeError("CF-01 did not satisfy the three-run criterion")
    target = BASE / "cf-01-branch-proof.json"
    target.write_text(json.dumps(audit, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"audit": str(target.relative_to(ROOT)), "runs": len(records),
                      "all_success": all_success, "manifest_files_checked": sum(x["per_run_manifest_files_verified"] for x in records)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

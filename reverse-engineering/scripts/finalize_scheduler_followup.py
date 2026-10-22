"""Verify per-run manifests and write the SCN-0004 follow-up evidence manifest."""
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
SOURCES = [
    "reference/scenarios/SCN-0004-game-loop.md",
    "reference/scenarios/SCN-0001-startup.md",
    "reference/scenarios/SCN-0008-control-flow.md",
    "reverse-engineering/findings/FND-0002-runtime-verification.md",
    "reverse-engineering/findings/FND-0004-runtime-scheduler.md",
    "reverse-engineering/scripts/CF02Instrumenter.java",
    "reverse-engineering/scripts/CF02TraceProbe.java",
    "reverse-engineering/scripts/build_cf02_branch_probe.py",
    "reverse-engineering/scripts/run_cf02_branch_proof.py",
    "reverse-engineering/scripts/CF01Instrumenter.java",
    "reverse-engineering/scripts/CF01TraceProbe.java",
    "reverse-engineering/scripts/build_cf01_startup_probe.py",
    "reverse-engineering/scripts/run_cf01_startup_proof.py",
    "reverse-engineering/scripts/analyze_cf01_startup_proof.py",
    "reverse-engineering/findings/evidence/milestone-1.5/scheduler-20261021/README.md",
    "reverse-engineering/scripts/finalize_scheduler_followup.py",
    "reverse-engineering/scripts/analyze_scheduler_followup.py",
    "reverse-engineering/scripts/run_scheduler_followup_startup.py",
    "reverse-engineering/scripts/run_scheduler_followup_transition.py",
    "reverse-engineering/scripts/run_scheduler_followup_state_scout.py",
    "reverse-engineering/scripts/run_scheduler_followup_exit_scout.py",
    "reverse-engineering/scripts/run_scheduler_followup_exit_scout_r02.py",
    "reverse-engineering/scripts/run_scheduler_followup_exit_scout_r03.py",
    "reverse-engineering/scripts/run_scheduler_followup_exit_scout_r04.py",
    "reverse-engineering/scripts/run_scheduler_followup_order_false_scout.py",
    "reverse-engineering/scripts/run_scheduler_followup_key_input.py",
    "reverse-engineering/scripts/run_scheduler_followup_physical_key_input.py",
    "reverse-engineering/scripts/build_scheduler_probe_followup.py",
    "reverse-engineering/scripts/analyze_scheduler_followup_scouts.py",
    "reverse-engineering/scripts/RuntimeInputObserver.java",
    "reverse-engineering/scripts/build_runtime_input_observer.py",
    "reverse-engineering/scripts/RuntimeFlagSnapshot.java",
    "reverse-engineering/scripts/build_runtime_flag_snapshot.py",
    "reverse-engineering/scripts/SchedulerInstrumenterFollowup.java",
    "reverse-engineering/scripts/TraceProbeFollowup.java",
    "reverse-engineering/scripts/TraceSnapshotProbe.java",
    "reverse-engineering/scripts/build_trace_snapshot_probe.py",
    "reverse-engineering/scripts/runtime_x11.py",
    "reverse-engineering/scripts/scheduler_xdamage.py",
    "reverse-engineering/scripts/build_scheduler_probe_dialogue.py",
    "reverse-engineering/scripts/run_scheduler_followup_dialogue_trace.py",
    "reverse-engineering/scripts/DialogueInstrumenter.java",
    "reverse-engineering/scripts/DialogueTraceProbe.java",
    "reverse-engineering/scripts/build_dialogue_probe_safe.py",
    "reverse-engineering/scripts/run_scheduler_followup_dialogue_trace_safe.py",
    "reverse-engineering/scripts/run_scheduler_followup_hud_diagnostic.py",
    "reverse-engineering/scripts/capture_scheduler_hud_checkpoint.py",
    "reverse-engineering/scripts/RenderOrderInstrumenter.java",
    "reverse-engineering/scripts/RenderOrderProbe.java",
    "reverse-engineering/scripts/build_render_order_probe_safe.py",
    "reverse-engineering/scripts/run_scheduler_followup_render_order.py",
    "reverse-engineering/scripts/capture_scheduler_render_order_checkpoint.py",
    "reverse-engineering/scripts/analyze_render_order_trace.py",
    "reverse-engineering/scripts/finalize_render_order_run.py",
    "reverse-engineering/scripts/run_render_order_camera_on.py",
    "reverse-engineering/scripts/BypassInstrumenter.java",
    "reverse-engineering/scripts/BypassTraceProbe.java",
    "reverse-engineering/scripts/build_bypass_probe_safe.py",
    "reverse-engineering/scripts/run_scheduler_followup_bypass_trace.py",
    "reverse-engineering/scripts/analyze_bypass_trace.py",
    "reverse-engineering/scripts/finalize_bypass_trace_run.py",
    "reverse-engineering/scripts/audit_scheduler_phone_profile.py",
    "reverse-engineering/scripts/RuntimeTraceSnapshot.java",
    "reverse-engineering/scripts/build_runtime_trace_snapshot.py",
    "reverse-engineering/scripts/CF01PaintInstrumenter.java",
    "reverse-engineering/scripts/CF01PaintTraceProbe.java",
    "reverse-engineering/scripts/build_cf01_paint_probe.py",
    "reverse-engineering/scripts/run_cf01_paint_probe.py",
    "reverse-engineering/scripts/CF01PaintInstrumenterV2.java",
    "reverse-engineering/scripts/CF01PaintTraceProbeV2.java",
    "reverse-engineering/scripts/build_cf01_paint_probe_v2.py",
    "reverse-engineering/scripts/run_cf01_paint_probe_v2.py",
    "reverse-engineering/scripts/analyze_cf01_paint_probe_v2.py",
    "reverse-engineering/scripts/CF04Instrumenter.java",
    "reverse-engineering/scripts/CF04TraceProbe.java",
    "reverse-engineering/scripts/build_cf04_probe.py",
    "reverse-engineering/scripts/run_cf04_injected_branch.py",
    "reverse-engineering/scripts/run_cf04_natural_newgame.py",
    "reverse-engineering/scripts/FindCf04Reachability.java",
    "reverse-engineering/scripts/scan_cf04_reachability.py",
]
BUILDS = [
    "reference/recordings/scheduler-probe-followup-20261022-r3",
    "reference/recordings/scheduler-probe-followup-20261022-r6",
    "reference/recordings/scheduler-probe-followup-20261022-dialogue-r1",
    "reference/recordings/scheduler-probe-followup-20261022-dialogue-r2",
    "reference/recordings/scheduler-probe-followup-20261022-render-r1",
    "reference/recordings/scheduler-probe-followup-20261022-bypass-r1",
    "reference/recordings/scheduler-cf02-branch-20261022",
    "reference/recordings/scheduler-cf01-startup-20261022",
    "reference/recordings/scheduler-cf01-paint-20261022",
    "reference/recordings/scheduler-cf01-paint-v2-20261022",
    "reference/recordings/scheduler-cf04-injected-v5-20261022",
    "reference/recordings/scheduler-cf04-natural-v3-20261022",
    "reference/recordings/cf04-reachability-scan-20261022",
]
AUXILIARIES = [
    "reference/recordings/scheduler-sidecars/RuntimeStateProbe.class",
    "reference/recordings/scheduler-sidecars/frame-probe.jar",
    "reference/recordings/scheduler-sidecars/manual-input-observer.jar",
    "reference/recordings/scheduler-sidecars/probe-current.jar",
    "reference/recordings/scheduler-sidecars/runtime-flag-snapshot.jar",
    "reference/recordings/scheduler-sidecars/sequence-probe.jar",
    "reference/recordings/scheduler-sidecars/runtime-trace-snapshot.jar",
]


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as f:
        for block in iter(lambda: f.read(1024 * 1024), b""):
            h.update(block)
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size,
            "sha256": h.hexdigest()}


def main():
    run_manifests = sorted(BASE.glob("M15-SCN-0004-*/manifest.json"))
    referenced = set()
    checked = 0
    for manifest_path in run_manifests:
        manifest = json.loads(manifest_path.read_text())
        for item in manifest["files"]:
            path = ROOT / item["path"]
            actual = digest(path)
            if actual["size"] != item["size"] or actual["sha256"] != item["sha256"]:
                raise RuntimeError(f"Manifest mismatch in {manifest_path.relative_to(ROOT)}: {item['path']}")
            referenced.add(path)
            checked += 1

    files = set(p for p in BASE.rglob("*") if p.is_file() and p != BASE / "manifest.json")
    files.update(run_manifests)
    files.update(referenced)
    for source in SOURCES:
        files.add(ROOT / source)
    for build in BUILDS:
        files.update(p for p in (ROOT / build).rglob("*") if p.is_file())
    files.update(ROOT / path for path in AUXILIARIES)
    manifest = {
        "producer": "finalize_scheduler_followup.py; SHA-256 metadata only",
        "date": "2026-10-22",
        "per_run_manifest_files_checked": checked,
        "per_run_manifest_count": len(run_manifests),
        "files": [digest(p) for p in sorted(files)],
    }
    target = BASE / "manifest.json"
    target.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"manifest": str(target.relative_to(ROOT)),
                      "per_run_manifest_count": len(run_manifests),
                      "per_run_file_hashes_checked": checked,
                      "files_hashed": len(files)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

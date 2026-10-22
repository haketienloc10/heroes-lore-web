"""Finalize the user-operated Camera-Off render-order run and hash its evidence."""
import datetime
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RUN = "M15-SCN-0004-E-render-order-R01"
EVIDENCE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022" / RUN
SCREENSHOTS = ROOT / "reference/screenshots" / RUN


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def dump(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n")


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size,
            "sha256": h.hexdigest()}


def main():
    required = ["launch.json", "trace.jsonl", "trace-health.json", "trace-probe-start.json",
                "runtime-state-camera-off-gameplay-after-back.json", "render-order-analysis.json"]
    missing = [name for name in required if not (EVIDENCE / name).is_file()]
    if missing:
        raise RuntimeError(f"Missing required run artifacts: {missing}")
    launch = json.loads((EVIDENCE / "launch.json").read_text())
    pid = launch["pid"]
    if Path(f"/proc/{pid}").exists():
        raise RuntimeError(f"Run process {pid} is still alive; close it before finalizing")
    health = json.loads((EVIDENCE / "trace-health.json").read_text())
    analysis = json.loads((EVIDENCE / "render-order-analysis.json").read_text())
    state = json.loads((EVIDENCE / "runtime-state-camera-off-gameplay-after-back.json").read_text())
    now = utc_now()

    boundary = {
        "run_id": RUN,
        "finalized_utc": now,
        "user_reported_window_closed": True,
        "reported_close_time_exact": False,
        "pid_absent_at_finalization": True,
        "pid": pid,
        "gameplay_checkpoint_mono_ns": state["mono_ns"],
        "gameplay_checkpoint_fields": state["fields"],
        "reclassified_menu_checkpoint": {
            "tag": "camera-off-gameplay",
            "observed_state": json.loads((EVIDENCE / "runtime-state-camera-off-gameplay.json").read_text())["fields"],
            "classification": "Options menu, m.e:I=5; excluded from gameplay analysis"
        },
        "trace_serialized_rows": analysis["trace_integrity"]["serialized_rows"],
        "health_events_seen": health["events_seen"],
        "health_retained": health["retained"],
        "capacity_dropped": health["dropped"],
        "health_minus_serialized": health["events_seen"] - analysis["trace_integrity"]["serialized_rows"],
        "incomplete_paint_spans_at_trace_end": analysis["trace_integrity"]["incomplete_paint_spans_at_trace_end"],
        "interpretation": "The shutdown hook serialized a contiguous trace prefix. Its events_seen counter exceeds serialized rows by eight, and the last paint span has no observed normal exit; the censored tail is excluded from completed branch-to-call segments."
    }
    dump(EVIDENCE / "capture-boundary.json", boundary)

    status_path = EVIDENCE / "session-status.json"
    status = json.loads(status_path.read_text())
    status.update({
        "updated_utc": now,
        "pid_alive": False,
        "status": "user reported window closed; PID absent at finalization; trace and health files present with an eight-event shutdown-tail discrepancy",
        "user_input_started": True,
        "harness_input_sent": False,
        "game_state_reads": False,
        "game_state_writes": False,
        "gameplay_checkpoint_fields": state["fields"],
        "trace_serialized_rows": analysis["trace_integrity"]["serialized_rows"],
        "trace_health_events_seen": health["events_seen"],
        "trace_capacity_dropped": health["dropped"],
        "terminal_incomplete_paint_spans": analysis["trace_integrity"]["incomplete_paint_spans_at_trace_end"],
        "next_checkpoint": None
    })
    dump(status_path, status)

    timeline_path = EVIDENCE / "timeline.jsonl"
    reclassification = {"utc": now, "event": "checkpoint_reclassified_after_runtime_state_review",
                        "tag": "camera-off-gameplay",
                        "observed_state": json.loads((EVIDENCE / "runtime-state-camera-off-gameplay.json").read_text())["fields"],
                        "classification": "Options menu (m.e:I=5); excluded from gameplay evidence"}
    event = {"utc": now, "event": "user_reported_window_closed_and_pid_absent_at_finalization",
             "pid": pid, "trace_serialized_rows": analysis["trace_integrity"]["serialized_rows"],
             "health_events_seen": health["events_seen"], "capacity_dropped": health["dropped"],
             "terminal_incomplete_paint_spans": analysis["trace_integrity"]["incomplete_paint_spans_at_trace_end"],
             "evidence": [str((EVIDENCE / "capture-boundary.json").relative_to(ROOT)),
                          str((EVIDENCE / "trace.jsonl").relative_to(ROOT)),
                          str((EVIDENCE / "trace-health.json").relative_to(ROOT))]}
    with timeline_path.open("a") as stream:
        stream.write(json.dumps(reclassification, ensure_ascii=False) + "\n")
        stream.write(json.dumps(event, ensure_ascii=False) + "\n")

    files = [path for path in EVIDENCE.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in SCREENSHOTS.rglob("*") if path.is_file())
    dump(EVIDENCE / "manifest.json", {"run_id": RUN, "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": RUN, "manifest_entries": len(files),
                      "gameplay_state": state["fields"].get("m.e:I"),
                      "camera_flag": state["fields"].get("br.d:Z"),
                      "serialized_rows": analysis["trace_integrity"]["serialized_rows"],
                      "health_events_seen": health["events_seen"],
                      "capacity_dropped": health["dropped"],
                      "post_gameplay_branch_segments": analysis["post_gameplay_checkpoint"]["branch_to_next_call_segment_counts"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

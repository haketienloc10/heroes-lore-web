"""Finalize a completed user-operated scheduler-bypass trace run."""
import datetime
import hashlib
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
RUN = sys.argv[1] if len(sys.argv) > 1 else "M15-SCN-0004-E-bypass-R01"
EVIDENCE = BASE / RUN
SCREENSHOTS = ROOT / "reference/screenshots" / RUN


def digest(path):
    h = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            h.update(block)
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size,
            "sha256": h.hexdigest()}


def dump(path, value):
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def main():
    launch = json.loads((EVIDENCE / "launch.json").read_text())
    health = json.loads((EVIDENCE / "trace-health.json").read_text())
    analysis = json.loads((EVIDENCE / "bypass-trace-analysis.json").read_text())
    pid = launch["pid"]
    if Path(f"/proc/{pid}").exists():
        raise RuntimeError(f"Process {pid} is still alive")
    if health["retained"] != analysis["trace_integrity"]["serialized_rows"]:
        raise RuntimeError("Trace health and analysis disagree")
    if health["dropped"] != 0:
        raise RuntimeError("Unexpected trace buffer drops")

    now = datetime.datetime.now(datetime.timezone.utc).isoformat()
    state4_key_count = len(analysis["trigger_assessment"]["state4_key_events"])
    ag_call_count = len(analysis["ag_a_invocations"])
    bypass_true_count = analysis["bypass_branch_observations"]["true"]
    timeline_path = EVIDENCE / "timeline.jsonl"
    timeline_rows = [json.loads(line) for line in timeline_path.read_text().splitlines() if line.strip()]
    reported_actions = [row for row in timeline_rows if row.get("event", "").startswith("operator_report_")
                        or row.get("event") == "operator_requested_skip"]
    skipped_by_user = any(row.get("event") == "operator_requested_skip" for row in reported_actions)
    boundary = {
        "run_id": RUN,
        "finalized_utc": now,
        "pid": pid,
        "pid_absent_at_finalization": True,
        "user_reported_window_closed": False,
        "shutdown_action": "Assistant sent SIGTERM after the user's reported input attempt to flush the bounded in-memory trace; JVM shutdown hook completed and wrote trace-health.json.",
        "trace_serialized_rows": analysis["trace_integrity"]["serialized_rows"],
        "health_events_seen": health["events_seen"],
        "capacity_dropped": health["dropped"],
        "contiguous_prefix": analysis["trace_integrity"]["contiguous_prefix"],
        "incomplete_method_spans": analysis["trace_integrity"]["incomplete_method_spans"],
        "trigger_assessment": analysis["trigger_assessment"]["assessment"],
        "target_state4_key_events": state4_key_count,
        "ag_a_ii_invocations": ag_call_count,
        "bypass_true_observations": bypass_true_count,
        "operator_reported_actions": reported_actions,
        "interpretation": ("The user skipped this timing-sensitive input case before attempting input. The synchronized shutdown retained a contiguous trace prefix with no dropped events; this idle trace is not evidence about target-state reachability or branch behavior." if skipped_by_user else "The synchronized shutdown retained a contiguous trace prefix with no dropped events. Any method spans still open at shutdown are censored. The target state-4 key route was not observed; this does not establish that the true branch is unreachable.")
    }
    dump(EVIDENCE / "capture-boundary.json", boundary)

    status_path = EVIDENCE / "session-status.json"
    status = json.loads(status_path.read_text())
    status.update({
        "updated_utc": now,
        "pid_alive": False,
        "status": ("user requested skip of the precision-timing input case before attempting input; assistant sent SIGTERM and flushed the trace successfully" if skipped_by_user else "user reported pressing W during loading; assistant sent SIGTERM to flush the trace; trace and health flushed successfully" if reported_actions else "trace finalized after the reported input attempt; trace and health flushed successfully"),
        "user_input_started": True,
        "harness_input_sent": False,
        "game_state_reads": False,
        "game_state_writes": False,
        "trace_serialized_rows": health["retained"],
        "trace_capacity_dropped": health["dropped"],
        "target_state4_key_events": state4_key_count,
        "ag_a_ii_invocations": ag_call_count,
        "bypass_true_observations": bypass_true_count,
        "next_checkpoint": ("Do not repeat the manual precision-timing case; it was skipped at the user's request and bypass remains unverified. Continue other SCN-0004 runtime gaps." if skipped_by_user else "Use a fresh Motorola-profile trace; from the house interior, start leaving with Down, then press Right Soft (W in this run's input map) about 0.9 seconds after Down starts, before NOW LOADING appears. The scout measured state 4 starting about 0.934 seconds after Down and lasting about 286 ms.")
    })
    dump(status_path, status)

    existing_events = {row.get("event") for row in timeline_rows}
    with timeline_path.open("a") as stream:
        if "assistant_sent_sigterm_after_user_attempt" not in existing_events:
            stream.write(json.dumps({"utc": now, "event": "assistant_sent_sigterm_after_user_attempt",
                                    "pid": pid, "reason": "flush bounded in-memory probe buffer after the reported input attempt",
                                    "trace_serialized_rows": health["retained"]}, ensure_ascii=False) + "\n")
        if "trace_run_finalized" not in existing_events:
            stream.write(json.dumps({"utc": now, "event": "trace_run_finalized",
                                    "trigger_assessment": analysis["trigger_assessment"]["assessment"],
                                    "target_state4_key_events": state4_key_count,
                                    "ag_a_ii_invocations": ag_call_count,
                                    "bypass_true_observations": bypass_true_count,
                                    "evidence": [str((EVIDENCE / "trace.jsonl").relative_to(ROOT)),
                                                 str((EVIDENCE / "trace-health.json").relative_to(ROOT)),
                                                 str((EVIDENCE / "bypass-trace-analysis.json").relative_to(ROOT))]},
                                   ensure_ascii=False) + "\n")

    files = [path for path in EVIDENCE.rglob("*") if path.is_file() and path.name != "manifest.json"]
    files.extend(path for path in SCREENSHOTS.rglob("*") if path.is_file())
    dump(EVIDENCE / "manifest.json", {"run_id": RUN, "files": [digest(path) for path in sorted(files)]})
    print(json.dumps({"run_id": RUN, "manifest_entries": len(files),
                      "serialized_rows": health["retained"], "bypass_true": analysis["bypass_branch_observations"]["true"],
                      "target_state4_key_events": len(analysis["trigger_assessment"]["state4_key_events"]),
                      "ag_a_ii_invocations": len(analysis["ag_a_invocations"])}, ensure_ascii=False))


if __name__ == "__main__":
    main()

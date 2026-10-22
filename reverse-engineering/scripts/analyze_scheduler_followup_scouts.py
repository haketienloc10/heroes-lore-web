"""Summarize valid SCN-0004 branch-scout traces without treating them as cadence trials."""
import hashlib
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"
VALID_RUNS = [
    "M15-SCN-0004-E-state-scout-R01",
    "M15-SCN-0004-E-exit-scout-R01",
    "M15-SCN-0004-E-exit-scout-R02",
]
INVALID_RUNS = [
    "M15-SCN-0004-E-exit-scout-R03",
    "M15-SCN-0004-E-exit-scout-R04",
    "M15-SCN-0004-E-order-false-scout-R01",
]


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def transitions(events):
    result = []
    for event in events:
        if (event.get("class") == "m" and event.get("method") == "a(I)V"
                and event.get("phase") == "point"
                and "field_store_after=m.e:I" in event.get("detail", "")):
            result.append({"seq": event["seq"], "t_mono_ns": event["t_mono_ns"],
                           "state": event.get("arg0_int")})
    return result


def summarize_valid(run):
    folder = BASE / run
    events = read_jsonl(folder / "trace.jsonl")
    health = json.loads((folder / "trace-health.json").read_text())
    values = [event.get("m.e:I") for event in events if event.get("m.e:I") is not None]
    changes = transitions(events)
    sleeps = [event for event in events if "thread_sleep_requested_ms" in event.get("detail", "")]
    yields = [event for event in events if "yield" in event.get("detail", "").lower()]
    state4 = []
    for index, change in enumerate(changes):
        if change["state"] != 4:
            continue
        next_change = next((item for item in changes[index + 1:] if item["state"] != 4), None)
        state4.append({
            "entered_seq": change["seq"],
            "entered_t_mono_ns": change["t_mono_ns"],
            "next_state": next_change["state"] if next_change else None,
            "left_t_mono_ns": next_change["t_mono_ns"] if next_change else None,
            "duration_ms": ((next_change["t_mono_ns"] - change["t_mono_ns"]) / 1_000_000
                            if next_change else None),
            "trace_events_with_state_4": sum(value == 4 for value in values),
            "ar_paint_returns_state_4": sum(
                event.get("class") == "ar"
                and event.get("method") == "paint(Ljavax/microedition/lcdui/Graphics;)V"
                and event.get("phase") == "exit" and event.get("m.e:I") == 4
                for event in events),
            "sleep_requests_state_4": sum(event.get("m.e:I") == 4 for event in sleeps),
        })

    timeline_path = folder / "timeline.jsonl"
    timeline = read_jsonl(timeline_path) if timeline_path.exists() else []
    for transition in state4:
        prior_inputs = [event for event in timeline
                        if event.get("event") == "synthetic_key_begin"
                        and event.get("mono_ns", 0) <= transition["entered_t_mono_ns"]]
        if prior_inputs:
            input_start = max(prior_inputs, key=lambda event: event["mono_ns"])
            transition["preceding_input"] = {
                "step": input_start.get("step"),
                "awt_key_code": input_start.get("awt_key_code"),
                "offset_from_input_begin_ms": round(
                    (transition["entered_t_mono_ns"] - input_start["mono_ns"]) / 1_000_000, 3),
            }

    return {
        "run_id": run,
        "valid_for_branch_observation": True,
        "cadence_trial": False,
        "trace_events": len(events),
        "trace_health": health,
        "state_event_counts": {str(key): count for key, count in sorted(Counter(values).items())},
        "state_transitions": changes,
        "ag_a_values": sorted({event.get("ag.a:Z") for event in events
                                if event.get("ag.a:Z") is not None}),
        "br_d_values": sorted({event.get("br.d:Z") for event in events
                                if event.get("br.d:Z") is not None}),
        "ag_bypass_reads_true": sum(
            "observed_getstatic_ag.a:Z" in event.get("detail", "")
            and "value=1" in event.get("detail", "") for event in events),
        "br_d_false_events": sum(event.get("br.d:Z") is False for event in events),
        "sleep_request_count": len(sleeps),
        "yield_marker_count": len(yields),
        "paint_return_branches": dict(Counter(
            event.get("detail", "") for event in events
            if event.get("class") == "ar"
            and event.get("method") == "paint(Ljavax/microedition/lcdui/Graphics;)V"
            and event.get("phase") == "exit")),
        "ag_a_ii_invocations": sum(
            event.get("class") == "ag" and event.get("method") == "a(II)V"
            and event.get("phase") == "entry" for event in events),
        "state_4_intervals": state4,
        "evidence_dir": str(folder.relative_to(ROOT)),
    }


def summarize_invalid(run):
    folder = BASE / run
    invalid = json.loads((folder / "invalid.json").read_text())
    exit_path = folder / "process-exit.json"
    process_exit = json.loads(exit_path.read_text()) if exit_path.exists() else None
    screenshots = ROOT / "reference/screenshots" / run
    hashes = sorted({hashlib.sha256(path.read_bytes()).hexdigest()
                     for path in screenshots.rglob("*") if path.is_file()})
    sequence = folder / "sequence-input.log"
    input_logs = sorted(folder.glob("input-*.log"))
    return {
        "run_id": run,
        "valid_for_branch_observation": False,
        "reason": invalid.get("reason", "; ".join(invalid.get("reasons", []))),
        "process_exit": process_exit,
        "captured_checkpoints": invalid.get("captured_checkpoints"),
        "sequence_listener_dispatch_lines": (sum("listener_dispatch_" in line
                                                 for line in sequence.read_text().splitlines())
                                              if sequence.exists() else 0),
        "sidecar_input_log_files": len(input_logs),
        "sidecar_key_down_dispatches": sum(
            line.startswith("20") and " emulator_key_down " in line
            for path in input_logs for line in path.read_text().splitlines()),
        "unique_screenshot_hashes": len(hashes),
        "trace_exists": (folder / "trace.jsonl").exists(),
        "evidence_dir": str(folder.relative_to(ROOT)),
    }


def main():
    result = {
        "purpose": "natural input route scouts; not cadence trials",
        "valid_scouts": [summarize_valid(run) for run in VALID_RUNS],
        "invalid_attempts": [summarize_invalid(run) for run in INVALID_RUNS],
    }
    output = BASE / "branch-scout-analysis.json"
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"output": str(output.relative_to(ROOT)),
                      "valid_scouts": len(VALID_RUNS),
                      "invalid_attempts": len(INVALID_RUNS)}, ensure_ascii=False))


if __name__ == "__main__":
    main()

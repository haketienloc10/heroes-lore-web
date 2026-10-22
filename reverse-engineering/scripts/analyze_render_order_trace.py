"""Summarize branch-to-call segments in the observed ar.paint trace."""
import json
from collections import Counter, defaultdict
from pathlib import Path
import sys


PAINT_METHOD = "paint(Ljavax/microedition/lcdui/Graphics;)V"


def main():
    if len(sys.argv) not in (2, 3):
        raise SystemExit("usage: analyze_render_order_trace.py TRACE.jsonl [GAMEPLAY_STATE.json]")
    trace_path = Path(sys.argv[1])
    rows = [json.loads(line) for line in trace_path.read_text().splitlines() if line.strip()]
    gameplay_state_path = Path(sys.argv[2]) if len(sys.argv) == 3 else None
    state = json.loads(gameplay_state_path.read_text()) if gameplay_state_path else None
    cutoff_ns = state.get("mono_ns") if state else None

    paints = [row for row in rows if row.get("event") == "method"
              and row.get("class") == "ar" and row.get("method") == PAINT_METHOD
              and row.get("phase") == "entry"]
    paint_spans = {row["span_id"] for row in paints}
    rows_by_paint = defaultdict(list)
    for row in rows:
        # A branch marker's span and parent are both the paint span; dedupe it.
        owners = {row.get("span_id"), row.get("parent_span_id")} & paint_spans
        for span_id in owners:
            rows_by_paint[span_id].append(row)

    segment_counts = Counter()
    branch_counts = Counter()
    post_segment_counts = Counter()
    post_branch_counts = Counter()
    samples = []
    mismatches = []
    post_paint_spans = set()
    post_paint_exits = set()
    incomplete_paint_spans = set()
    for paint in paints:
        span_id = paint["span_id"]
        scoped = sorted({row["seq"]: row for row in rows_by_paint[span_id]}.values(),
                        key=lambda row: row["seq"])
        branches = [row for row in scoped if row.get("event") == "branch_value"
                    and row.get("field") == "br.d:Z"]
        exits = [row for row in scoped if row.get("event") == "method"
                 and row.get("class") == "ar" and row.get("method") == PAINT_METHOD
                 and row.get("phase") == "exit"]
        if not exits:
            incomplete_paint_spans.add(span_id)
        else:
            post_paint_exits.add(span_id)
        if cutoff_ns is not None and paint["t_mono_ns"] >= cutoff_ns:
            post_paint_spans.add(span_id)

        for index, branch in enumerate(branches):
            boundary = branches[index + 1] if index + 1 < len(branches) else (exits[0] if exits else None)
            upper_seq = boundary["seq"] if boundary else float("inf")
            calls = [row for row in scoped if row.get("event") == "method"
                     and row.get("class") == "m" and row.get("method") in ("i()V", "g()V")
                     and row.get("phase") == "entry" and row.get("parent_span_id") == span_id
                     and branch["seq"] < row["seq"] < upper_seq]
            order = [row["method"][:-3] for row in calls]
            value = branch["value"]
            expected = ["g", "i"] if value else ["i", "g"]
            boundary_kind = "next_branch" if index + 1 < len(branches) else ("paint_exit" if exits else "trace_end")
            key = (str(value).lower(), tuple(order), boundary_kind)
            segment_counts[key] += 1
            branch_counts[str(value).lower()] += 1
            is_after = cutoff_ns is not None and branch["t_mono_ns"] >= cutoff_ns
            if is_after:
                post_segment_counts[key] += 1
                post_branch_counts[str(value).lower()] += 1
            if order and order != expected:
                mismatches.append({"paint_span_id": span_id, "branch_seq": branch["seq"],
                                   "branch_value": value, "observed_order": order,
                                   "expected_order": expected})
            if order and len(samples) < 100:
                samples.append({"paint_span_id": span_id, "branch_seq": branch["seq"],
                                "branch_value": value, "observed_order": order,
                                "expected_order": expected, "matches_expected": order == expected,
                                "boundary": boundary_kind, "thread_id": branch["thread_id"],
                                "thread_name": branch["thread_name"],
                                "branch_mono_ns": branch["t_mono_ns"]})

    health_path = trace_path.with_name("trace-health.json")
    health = json.loads(health_path.read_text()) if health_path.exists() else None
    sequences = [row["seq"] for row in rows]
    seq_gaps = sorted(set(range(min(sequences), max(sequences) + 1)) - set(sequences)) if sequences else []
    serialized_rows = len(rows)
    result = {
        "producer": "analyze_render_order_trace.py; derived from bounded no-reflection method trace",
        "trace_path": str(trace_path),
        "gameplay_checkpoint_path": str(gameplay_state_path) if gameplay_state_path else None,
        "gameplay_checkpoint_mono_ns": cutoff_ns,
        "trace_integrity": {
            "serialized_rows": serialized_rows,
            "unique_sequence_values": len(set(sequences)),
            "sequence_min": min(sequences) if sequences else None,
            "sequence_max": max(sequences) if sequences else None,
            "sequence_gaps_within_file": seq_gaps,
            "health_events_seen": health.get("events_seen") if health else None,
            "health_retained": health.get("retained") if health else None,
            "health_dropped_capacity": health.get("dropped") if health else None,
            "health_events_seen_minus_serialized": health.get("events_seen", serialized_rows) - serialized_rows if health else None,
            "incomplete_paint_spans_at_trace_end": len(incomplete_paint_spans),
            "shutdown_note": "The health counter exceeds serialized rows; the probe shutdown hook snapshots a concurrent queue while game threads may still emit events. Treat the terminal trace segment as censored; capacity dropped count remains a separate metric."
        },
        "paint_entry_spans": len(paints),
        "paint_exit_spans": len({row["span_id"] for row in rows if row.get("event") == "method"
                                  and row.get("class") == "ar" and row.get("method") == PAINT_METHOD
                                  and row.get("phase") == "exit"}),
        "branch_observations": dict(branch_counts),
        "branch_to_next_call_segment_counts": {
            f"{value}:{'→'.join(order) if order else 'no calls'}:{boundary}": count
            for (value, order, boundary), count in sorted(segment_counts.items())},
        "expected_order_mismatches_with_calls": mismatches,
        "samples_first_100_call_bearing_segments": samples,
        "gameplay_checkpoint_fields": state.get("fields") if state else None,
        "post_gameplay_checkpoint": {
            "paint_entry_spans": len(post_paint_spans),
            "paint_exit_spans": len(post_paint_spans & post_paint_exits),
            "branch_observations": dict(post_branch_counts),
            "branch_to_next_call_segment_counts": {
                f"{value}:{'→'.join(order) if order else 'no calls'}:{boundary}": count
                for (value, order, boundary), count in sorted(post_segment_counts.items())}
        } if state else None,
        "limits": [
            "The probe logs the boolean operand immediately before the original IFEQ at BCI 94; it does not read game fields reflectively.",
            "Call order is grouped from a branch marker up to the next visit to that branch or the containing paint return; it establishes observed method order, not rendering causality.",
            "The gameplay checkpoint is a sequential read-only field snapshot and screenshot, not synchronized with each paint invocation.",
            "Only normal method returns are hooked; exceptional exits are not represented.",
            "Trace timing includes instrumentation overhead and is not a physical presentation measurement."
        ]
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

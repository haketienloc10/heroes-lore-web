"""Analyze the bounded, no-reflection scheduler-bypass trace for a run."""
import json
from collections import Counter, defaultdict
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"


def main():
    run_id = sys.argv[1] if len(sys.argv) > 1 else "M15-SCN-0004-E-bypass-R01"
    run = BASE / run_id
    trace_path = run / "trace.jsonl"
    health_path = run / "trace-health.json"
    rows = [json.loads(line) for line in trace_path.read_text().splitlines() if line.strip()]
    health = json.loads(health_path.read_text())
    seqs = [row["seq"] for row in rows]
    if seqs != list(range(1, len(rows) + 1)):
        raise RuntimeError("Trace sequence is not a contiguous prefix beginning at 1")
    if health["retained"] != len(rows):
        raise RuntimeError("Trace health retained count does not match serialized rows")

    events = Counter(row["event"] for row in rows)
    methods = Counter((row["class"], row["method"], row["phase"])
                      for row in rows if row["event"] == "method")
    key_entries = [row for row in rows if row["event"] == "method"
                   and row["class"] == "ar" and row["method"] == "keyPressed(I)V"
                   and row["phase"] == "entry"]
    states_by_span = {row["span_id"]: row["arg0_int"] for row in rows
                      if row["event"] == "game_state_value"}
    key_observations = [{
        "seq": row["seq"], "t_mono_ns": row["t_mono_ns"],
        "raw_key_code": row["arg0_int"],
        "game_state": states_by_span.get(row["span_id"]),
        "span_id": row["span_id"]
    } for row in key_entries]

    ag_entries = [row for row in rows if row["event"] == "method"
                  and row["class"] == "ag" and row["method"] == "a(II)V"
                  and row["phase"] == "entry"]
    bypass_values = [row for row in rows if row["event"] == "bypass_value"]
    bypass_by_span = defaultdict(list)
    for row in bypass_values:
        bypass_by_span[row["span_id"]].append(row["value"])
    br_entries = [row for row in rows if row["event"] == "method"
                  and row["class"] == "br" and row["method"] == "b()V"
                  and row["phase"] == "entry"]
    br_a_entries = [row for row in rows if row["event"] == "method"
                    and row["class"] == "br" and row["method"] == "a(JJ)V"
                    and row["phase"] == "entry"]
    br_a_children = Counter(row["parent_span_id"] for row in br_a_entries)
    branch_rows = []
    for row in br_entries:
        values = bypass_by_span.get(row["span_id"], [])
        branch_rows.append({
            "span_id": row["span_id"], "entry_seq": row["seq"],
            "bypass_values": values,
            "scheduler_call_count": br_a_children[row["span_id"]]
        })
    true_branches = [row for row in branch_rows if True in row["bypass_values"]]
    false_branches = [row for row in branch_rows if False in row["bypass_values"]]
    state4_keys = [row for row in key_observations if row["game_state"] == 4]
    trigger_key_events = [row for row in state4_keys if row["raw_key_code"] in (-22, 22)]
    bypass_true_count = sum(row["value"] is True for row in bypass_values)
    bypass_false_count = sum(row["value"] is False for row in bypass_values)
    incomplete_methods = []
    entries = {}
    for row in rows:
        if row["event"] != "method":
            continue
        key = (row["class"], row["method"], row["span_id"])
        if row["phase"] == "entry":
            entries[key] = row["seq"]
        elif row["phase"] == "exit":
            entries.pop(key, None)
    incomplete_methods = [{"class": key[0], "method": key[1], "span_id": key[2],
                           "entry_seq": seq} for key, seq in entries.items()]
    observed_key_states = sorted({row["game_state"] for row in key_observations
                                  if row["game_state"] is not None})

    result = {
        "run_id": run_id,
        "producer": "analyze_bypass_trace.py",
        "trace_integrity": {
            "serialized_rows": len(rows), "first_seq": seqs[0] if seqs else None,
            "last_seq": seqs[-1] if seqs else None,
            "events_seen": health["events_seen"], "retained": health["retained"],
            "dropped": health["dropped"], "contiguous_prefix": True,
            "health_matches_serialized_rows": health["events_seen"] == len(rows),
            "incomplete_method_spans": incomplete_methods
        },
        "event_counts": dict(events),
        "method_counts": {".".join(key): value for key, value in sorted(methods.items())},
        "key_observations": key_observations,
        "game_state_values": dict(Counter(row["arg0_int"] for row in rows
                                           if row["event"] == "game_state_value")),
        "ag_a_invocations": [{"seq": row["seq"], "span_id": row["span_id"],
                               "parent_span_id": row["parent_span_id"],
                               "arg0_int": row["arg0_int"], "arg1_int": row["arg1_int"]}
                              for row in ag_entries],
        "bypass_branch_observations": {
            "true": bypass_true_count, "false": bypass_false_count,
            "br_b_entries": len(br_entries), "br_a_entries": len(br_a_entries),
            "true_branch_scheduler_call_count": sum(row["scheduler_call_count"]
                                                     for row in true_branches),
            "false_branch_scheduler_call_count": sum(row["scheduler_call_count"]
                                                      for row in false_branches),
            "branches": branch_rows
        },
        "trigger_assessment": {
            "required_game_state": 4,
            "required_raw_key_codes": [-22, 22],
            "state4_key_events": state4_keys,
            "candidate_trigger_key_events": trigger_key_events,
            "ag_a_received_minus8": any(row["arg1_int"] == -8 for row in ag_entries),
            "bypass_true_observed": bypass_true_count > 0,
            "assessment": "trigger_not_observed" if not trigger_key_events and not ag_entries
                         and bypass_true_count == 0 else "see_event_correlations",
            "interpretation": (
                f"This run does not exercise the target transition: key callbacks were observed in "
                f"states {observed_key_states}; no state-4 key callback or ag.a(II)V invocation "
                "was recorded, and the scheduler bypass operand remained false. This is not "
                "evidence that the true branch is unreachable under the configured phone profile."
            ) if not trigger_key_events and not ag_entries and bypass_true_count == 0 else None
        }
    }
    output = run / "bypass-trace-analysis.json"
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"run_id": run_id, "serialized_rows": len(rows),
                      "key_observations": key_observations,
                      "state4_key_events": len(state4_keys),
                      "ag_a_invocations": len(ag_entries),
                      "bypass_true": bypass_true_count,
                      "bypass_false": bypass_false_count,
                      "incomplete_method_spans": len(incomplete_methods),
                      "analysis": str(output.relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()

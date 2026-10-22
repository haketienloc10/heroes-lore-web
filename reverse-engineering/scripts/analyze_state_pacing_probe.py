"""Attribute observed br.b sleep/yield paths to the latest m.e state setter."""
import json
import math
import os
from collections import defaultdict
from pathlib import Path
from statistics import median

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-pacing-state"
RUN_ID = os.environ.get("STATE_PACING_RUN_ID", "M15-SCN-0004-E-pacing-state-R01")
RUN = BASE / RUN_ID


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def analyze():
    events = read_jsonl(RUN / "trace.jsonl")
    health = json.loads((RUN / "trace-health.json").read_text())
    contiguous = [e.get("seq") for e in events] == list(range(1, len(events) + 1))
    threads = {(e.get("thread_id"), e.get("thread_name")) for e in events}
    same_thread = len(threads) == 1
    setters = sorted((e for e in events if e.get("event") == "state_setter"),
                     key=lambda e: (e.get("t_mono_ns", 0), e.get("seq", 0)))
    entries = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
               and e.get("method") == "b()V" and e.get("phase") == "entry"]
    exits = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
             and e.get("method") == "b()V" and e.get("phase") == "exit"]
    values = [e for e in events if e.get("event") == "bypass_value"]
    helpers = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
               and e.get("method") == "a(JJ)V" and e.get("phase") == "entry"]
    helper_exits = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
                    and e.get("method") == "a(JJ)V" and e.get("phase") == "exit"]
    sleeps = [e for e in events if e.get("event") == "pacing_sleep"]
    yields = [e for e in events if e.get("event") == "pacing_yield"]

    def state_at(event):
        prior = [s for s in setters if s.get("thread_id") == event.get("thread_id")
                 and s.get("t_mono_ns", 0) <= event.get("t_mono_ns", 0)]
        if not prior:
            return "unknown_before_first_m_e_store"
        return str(prior[-1].get("arg0_int"))

    by_state = defaultdict(lambda: {
        "br_b_calls": 0, "true_bypass_calls": 0, "false_branch_calls": 0,
        "br_a_helper_calls": 0, "thread_sleep_calls": 0, "thread_yield_calls": 0,
        "false_branch_without_helper": 0, "helper_without_sleep_or_yield": 0,
        "helper_duration_censored": 0,
    })
    span_errors = []
    duration_samples = defaultdict(list)
    for entry in entries:
        span = entry.get("span_id")
        thread_id = entry.get("thread_id")
        matching_values = [e for e in values if e.get("thread_id") == thread_id and e.get("span_id") == span]
        matching_helpers = [e for e in helpers if e.get("thread_id") == thread_id and e.get("span_id") == span]
        matching_helper_exits = [e for e in helper_exits if e.get("thread_id") == thread_id
                                 and e.get("span_id") == span]
        matching_sleeps = [e for e in sleeps if e.get("thread_id") == thread_id and e.get("span_id") == span]
        matching_yields = [e for e in yields if e.get("thread_id") == thread_id and e.get("span_id") == span]
        state = state_at(entry)
        row = by_state[state]
        row["br_b_calls"] += 1
        if len(matching_values) != 1:
            span_errors.append({"span_id": span, "issue": "expected exactly one ag.a:Z branch marker",
                                "count": len(matching_values)})
            continue
        if matching_values[0].get("value") is True:
            row["true_bypass_calls"] += 1
        else:
            row["false_branch_calls"] += 1
        if matching_helpers:
            row["br_a_helper_calls"] += len(matching_helpers)
            row["thread_sleep_calls"] += len(matching_sleeps)
            row["thread_yield_calls"] += len(matching_yields)
            if matching_values[0].get("value") is True:
                span_errors.append({"span_id": span, "issue": "true bypass branch unexpectedly entered br.a helper"})
            if not matching_sleeps and not matching_yields:
                row["helper_without_sleep_or_yield"] += 1
            if len(matching_helpers) != 1 or len(matching_sleeps) + len(matching_yields) != 1:
                span_errors.append({"span_id": span, "issue": "helper did not contain one sleep/yield call",
                                    "helpers": len(matching_helpers), "sleep": len(matching_sleeps),
                                    "yield": len(matching_yields)})
            if len(matching_helpers) == 1 and len(matching_helper_exits) == 1:
                duration_ms = (matching_helper_exits[0]["t_mono_ns"] - matching_helpers[0]["t_mono_ns"]) / 1e6
                if duration_ms < 0:
                    span_errors.append({"span_id": span, "issue": "negative helper duration"})
                else:
                    kind = "sleep" if matching_sleeps else "yield"
                    duration_samples[(state, kind)].append(round(duration_ms, 6))
            elif len(matching_helpers) == 1 and len(matching_helper_exits) == 0:
                row["helper_duration_censored"] += 1
            else:
                span_errors.append({"span_id": span, "issue": "helper duration boundaries incomplete",
                                    "helper_entries": len(matching_helpers),
                                    "helper_exits": len(matching_helper_exits)})
        elif matching_values[0].get("value") is False:
            row["false_branch_without_helper"] += 1
            span_errors.append({"span_id": span, "issue": "false pacing branch skipped br.a helper"})
        elif matching_sleeps or matching_yields:
            span_errors.append({"span_id": span, "issue": "sleep/yield marker without br.a helper"})

    state_intervals = []
    for index, setter in enumerate(setters):
        next_setter = setters[index + 1] if index + 1 < len(setters) else None
        state_intervals.append({
            "state": setter.get("arg0_int"),
            "setter_seq": setter.get("seq"),
            "entry_t_mono_ns": setter.get("t_mono_ns"),
            "exit_state": next_setter.get("arg0_int") if next_setter else None,
            "exit_t_mono_ns": next_setter.get("t_mono_ns") if next_setter else None,
            "duration_ms": round((next_setter["t_mono_ns"] - setter["t_mono_ns"]) / 1e6, 3)
                           if next_setter else None,
        })

    health_ok = health.get("dropped") == 0 and health.get("retained") == len(events)
    assessment = "complete_for_observed_route" if (contiguous and same_thread and health_ok
                   and len(exits) <= len(entries) and not span_errors) else "inconclusive"
    duration_samples_by_state = defaultdict(dict)
    for (state, kind), samples in duration_samples.items():
        duration_samples_by_state[state][kind] = samples
    result = {
        "run_id": RUN_ID,
        "assessment": assessment,
        "trace_events": len(events),
        "trace_contiguous": contiguous,
        "trace_single_game_thread": same_thread,
        "trace_health": health,
        "br_b_entries": len(entries),
        "br_b_exits": len(exits),
        "state_setters": [e.get("arg0_int") for e in setters],
        "state_intervals": state_intervals,
        "pacing_by_last_observed_state_setter": {state: dict(counts)
                                                   for state, counts in sorted(by_state.items())},
        "helper_duration_samples_ms": {state: dict(sorted(kinds.items()))
                                        for state, kinds in sorted(duration_samples_by_state.items())},
        "helper_duration_stats_ms": {
            state: {
                kind: {
                    "n": len(samples),
                    "min": min(samples),
                    "median": round(median(samples), 6),
                    "p95_nearest_rank": sorted(samples)[math.ceil(0.95 * len(samples)) - 1],
                    "max": max(samples),
                }
                for (sample_state, kind), samples in sorted(duration_samples.items())
                if sample_state == state
            }
            for state in sorted({sample_state for sample_state, _kind in duration_samples})
        },
        "span_errors": span_errors,
        "limitations": [
            "state attribution applies only between observed m.a(I)V stores to m.e:I on this single game thread",
            "one HOUSE-INPUT-001 house-exit route on the Motorola emulator profile; not all game states or routes",
            "sleep/yield events mark the callsite immediately before invocation; they do not measure blocked duration",
            "br.a(JJ)V entry/exit elapsed includes probe overhead and helper computations as well as any blocking",
            "synthetic AWT input; does not measure physical keyboard repeat or compositor presentation",
        ],
    }
    (RUN / "analysis.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"run_id": RUN_ID, "assessment": assessment, "events": len(events),
                      "states": result["pacing_by_last_observed_state_setter"],
                      "span_errors": len(span_errors)}, ensure_ascii=False))


if __name__ == "__main__":
    analyze()

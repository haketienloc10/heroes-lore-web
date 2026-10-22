"""Attribute br.a(JJ)V's runtime target-period argument to observed m.e state."""
import json
import os
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-pacing-period"
RUN_ID = os.environ.get("STATE_PACING_PERIOD_RUN_ID", "M15-SCN-0004-E-pacing-period-R01")
RUN = BASE / RUN_ID


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def analyze():
    events = read_jsonl(RUN / "trace.jsonl")
    health = json.loads((RUN / "trace-health.json").read_text())
    contiguous = [e.get("seq") for e in events] == list(range(1, len(events) + 1))
    threads = {(e.get("thread_id"), e.get("thread_name")) for e in events}
    setters = sorted((e for e in events if e.get("event") == "state_setter"),
                     key=lambda e: (e.get("t_mono_ns", 0), e.get("seq", 0)))
    helpers = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
               and e.get("method") == "a(JJ)V" and e.get("phase") == "entry"]
    targets = [e for e in events if e.get("event") == "pacing_target_period"]

    def state_at(event):
        prior = [s for s in setters if s.get("thread_id") == event.get("thread_id")
                 and s.get("t_mono_ns", 0) <= event.get("t_mono_ns", 0)]
        return str(prior[-1].get("arg0_int")) if prior else "unknown_before_first_m_e_store"

    grouped = defaultdict(lambda: defaultdict(int))
    errors = []
    for helper in helpers:
        matches = [e for e in targets if e.get("thread_id") == helper.get("thread_id")
                   and e.get("span_id") == helper.get("span_id")]
        if len(matches) != 1:
            errors.append({"span_id": helper.get("span_id"), "issue": "expected one target-period marker",
                           "count": len(matches)})
            continue
        grouped[state_at(helper)][str(matches[0].get("arg0_int"))] += 1

    if len(threads) != 1:
        errors.append({"issue": "trace includes multiple thread identities", "threads": sorted(map(str, threads))})
    if len(targets) != len(helpers):
        errors.append({"issue": "period marker/helper-entry counts differ", "markers": len(targets),
                       "helpers": len(helpers)})
    health_ok = health.get("dropped") == 0 and health.get("retained") == len(events)
    assessment = "runtime_period_argument_observed" if contiguous and health_ok and not errors else "inconclusive"
    result = {
        "run_id": RUN_ID,
        "assessment": assessment,
        "trace_events": len(events),
        "trace_contiguous": contiguous,
        "trace_health": health,
        "game_thread": next(iter(threads)) if len(threads) == 1 else None,
        "state_setters": [e.get("arg0_int") for e in setters],
        "helper_entries": len(helpers),
        "period_markers": len(targets),
        "target_period_ms_by_last_observed_state_setter": {
            state: {period: count for period, count in sorted(periods.items(), key=lambda item: int(item[0]))}
            for state, periods in sorted(grouped.items())
        },
        "errors": errors,
        "limitations": [
            "target period is observed from br.a(JJ)V's second long argument; original br.b() bytecode passes br.d:I there",
            "state attribution applies only between observed m.a(I)V stores on this single game thread",
            "one controlled HOUSE-INPUT-001 route, Motorola profile; no claim for other states/routes",
            "target period is a requested pacing interval, not observed callback or presentation rate",
            "synthetic AWT input; not a physical keyboard or compositor measurement",
        ],
    }
    (RUN / "analysis.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"run_id": RUN_ID, "assessment": assessment, "helper_entries": len(helpers),
                      "periods_by_state": result["target_period_ms_by_last_observed_state_setter"],
                      "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    analyze()

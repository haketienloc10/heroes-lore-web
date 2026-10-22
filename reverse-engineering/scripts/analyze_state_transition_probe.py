"""Verify the natural state-2->4 setter occurs inside nested m.n()/m.i() spans."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-transition-attribution"
RUN_ID = os.environ.get("STATE_TRANSITION_RUN_ID", "M15-SCN-0004-E-transition-attribution-R01")
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
    transitions = [e for e in events if e.get("event") == "transition_method"]
    stack_errors = [e for e in events if e.get("event") == "transition_stack_error"]
    calls = {}
    for event in transitions:
        key = (event.get("method"), event.get("span_id"))
        calls.setdefault(key, {})[event.get("phase")] = event

    state4_proofs = []
    errors = []
    for index, setter in enumerate(setters):
        if setter.get("arg0_int") != 4:
            continue
        previous_state = setters[index - 1].get("arg0_int") if index else None
        nested_span = setter.get("span_id")
        outer_span = setter.get("arg1_int")
        inner = calls.get(("n()V", nested_span), {})
        outer = calls.get(("i()V", outer_span), {})
        proof = {
            "setter_seq": setter.get("seq"),
            "previous_state": previous_state,
            "state": setter.get("arg0_int"),
            "setter_thread": setter.get("thread_name"),
            "m_n_span_id": nested_span,
            "m_i_span_id": outer_span,
            "m_n_entry_seq": inner.get("entry", {}).get("seq"),
            "m_n_exit_seq": inner.get("exit", {}).get("seq"),
            "m_i_entry_seq": outer.get("entry", {}).get("seq"),
            "m_i_exit_seq": outer.get("exit", {}).get("seq"),
            "m_n_parent_span_id": inner.get("entry", {}).get("arg1_int"),
        }
        nested = (previous_state == 2 and inner.get("entry") and inner.get("exit")
                  and outer.get("entry") and outer.get("exit")
                  and inner["entry"].get("arg1_int") == outer_span
                  and outer["entry"].get("seq", 0) < inner["entry"].get("seq", 0)
                  and inner["entry"].get("seq", 0) <= setter.get("seq", 0)
                  and setter.get("seq", 0) <= inner["exit"].get("seq", 0)
                  and inner["exit"].get("seq", 0) < outer["exit"].get("seq", 0)
                  and len(threads) == 1)
        proof["nested_state2_to4_in_m_n_inside_m_i"] = bool(nested)
        state4_proofs.append(proof)
        if not nested:
            errors.append({"setter_seq": setter.get("seq"), "issue": "state-4 setter not enclosed by expected m.n()->m.i() spans"})
    if not state4_proofs:
        errors.append({"issue": "no state-4 setter observed"})
    if stack_errors:
        errors.extend({"seq": e.get("seq"), "issue": "transition stack mismatch"} for e in stack_errors)

    health_ok = health.get("dropped") == 0 and health.get("retained") == len(events)
    assessment = "state2_to4_attributed_to_m_n_inside_m_i" if contiguous and health_ok and not errors else "inconclusive"
    result = {
        "run_id": RUN_ID,
        "assessment": assessment,
        "trace_events": len(events),
        "trace_contiguous": contiguous,
        "trace_health": health,
        "game_thread": next(iter(threads)) if len(threads) == 1 else None,
        "state_setters": [e.get("arg0_int") for e in setters],
        "transition_method_spans": len(transitions) // 2,
        "state4_attribution": state4_proofs,
        "transition_stack_errors": len(stack_errors),
        "errors": errors,
        "limitations": [
            "one controlled HOUSE-INPUT-001 route and Motorola profile; the state transition is natural within that route",
            "m.i()/m.n() markers cover normal returns; this result applies to the observed normal invocation",
            "synthetic AWT inputs; no physical keyboard, compositor or input-to-visible measurement",
        ],
    }
    (RUN / "analysis.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"run_id": RUN_ID, "assessment": assessment,
                      "state4_attribution": state4_proofs, "errors": errors}, ensure_ascii=False))


if __name__ == "__main__":
    analyze()

"""Analyze the state-triggered Right Soft input against the bypass trace."""
import json
import os
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023"
RUN_ID = os.environ.get("STATE_TRIGGERED_RUN_ID", "M15-SCN-0004-E-bypass-state-triggered-R01")
RUN = BASE / RUN_ID


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def analyze():
    events = read_jsonl(RUN / "trace.jsonl")
    actions = read_jsonl(RUN / "trigger-actions.jsonl")
    health = json.loads((RUN / "trace-health.json").read_text())
    state4 = [e for e in events if e.get("event") == "state_setter" and e.get("arg0_int") == 4]
    state_setters = [e for e in events if e.get("event") == "state_setter"]
    state4_intervals = []
    for index, entered in enumerate(state_setters):
        if entered.get("arg0_int") != 4:
            continue
        left = next((e for e in state_setters[index + 1:] if e.get("arg0_int") != 4), None)
        state4_intervals.append({
            "previous_state": state_setters[index - 1].get("arg0_int") if index else None,
            "entry_t_mono_ns": entered.get("t_mono_ns"),
            "exit_state": left.get("arg0_int") if left else None,
            "exit_t_mono_ns": left.get("t_mono_ns") if left else None,
            "duration_ms": round((left["t_mono_ns"] - entered["t_mono_ns"]) / 1e6, 3) if left else None})
    down_event = None
    down_log = RUN / "input-05.log"
    if down_log.exists():
        for line in down_log.read_text().splitlines():
            match = re.search(r"mono_ns=(\d+) emulator_key_down code=98", line)
            if match:
                down_event = int(match.group(1))
                break
    down_to_state4_ms = (round((state4[0]["t_mono_ns"] - down_event) / 1e6, 3)
                         if state4 and down_event else None)
    key_entries = [e for e in events if e.get("event") == "method"
                   and e.get("class") == "ar" and e.get("method") == "keyPressed(I)V"
                   and e.get("phase") == "entry"]
    key_states = [e for e in events if e.get("event") == "key_state"]
    state4_keys = []
    for key in key_entries:
        if key.get("arg0_int") != -22:
            continue
        state = next((item for item in key_states if item.get("thread_id") == key.get("thread_id")
                      and 0 <= item.get("t_mono_ns", 0) - key.get("t_mono_ns", 0) <= 10_000_000), None)
        if state and state.get("arg0_int") == 4:
            state4_keys.append({"key": key, "state": state})

    handlers = [e for e in events if e.get("event") == "method" and e.get("class") == "ag"
                and e.get("method") == "a(II)V" and e.get("phase") == "entry"]
    handler_after_state4_key = []
    for target in state4_keys:
        key = target["key"]
        matches = [e for e in handlers if e.get("thread_id") == key.get("thread_id")
                   and 0 <= e.get("t_mono_ns", 0) - key.get("t_mono_ns", 0) <= 20_000_000]
        handler_after_state4_key.extend(matches)

    br_entries = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
                  and e.get("method") == "b()V" and e.get("phase") == "entry"]
    br_exits = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
                and e.get("method") == "b()V" and e.get("phase") == "exit"]
    bypass = [e for e in events if e.get("event") == "bypass_value"]
    helpers = [e for e in events if e.get("event") == "method" and e.get("class") == "br"
               and e.get("method") == "a(JJ)V" and e.get("phase") == "entry"]
    true_values = [e for e in bypass if e.get("value") is True]
    true_no_helper = [e for e in true_values if not any(h.get("span_id") == e.get("span_id")
                                                        and h.get("thread_id") == e.get("thread_id")
                                                        for h in helpers)]
    action_names = [a.get("event") for a in actions]
    triggered = "natural_state_4_observed" in action_names
    dispatched = "auto_key_down_dispatched" in action_names
    contiguous = [e.get("seq") for e in events] == list(range(1, len(events) + 1))
    no_drops = health.get("dropped") == 0 and health.get("retained") == len(events)
    key_row = state4_keys[0]["key"] if state4_keys else None
    key_state = state4_keys[0]["state"] if state4_keys else None
    handler = handler_after_state4_key[0] if handler_after_state4_key else None
    branch = next((e for e in true_no_helper if handler
                   and e.get("thread_id") == handler.get("thread_id")
                   and e.get("t_mono_ns", 0) >= handler.get("t_mono_ns", 0)), None)
    natural_2_to_4 = any(item.get("previous_state") == 2 for item in state4_intervals)
    observed = bool(triggered and dispatched and natural_2_to_4 and key_row and key_state
                    and handler and branch and no_drops and contiguous)
    result = {
        "run_id": RUN_ID,
        "assessment": "runtime_true_branch_observed" if observed else "inconclusive",
        "input_mode": "controlled AWT W input queued once after the original state setter stored m.e=4",
        "trace_events": len(events),
        "trace_contiguous": contiguous,
        "trace_health": health,
        "natural_state4_setter_count": len(state4),
        "state4_intervals": state4_intervals,
        "down_key_to_state4_ms": down_to_state4_ms,
        "trigger_action_events": action_names,
        "state4_right_soft_callbacks": [{"seq": item["key"].get("seq"),
                                         "t_mono_ns": item["key"].get("t_mono_ns"),
                                         "raw_key": item["key"].get("arg0_int"),
                                         "m_e_operand": item["state"].get("arg0_int"),
                                         "thread": item["key"].get("thread_name")}
                                        for item in state4_keys],
        "ag_handler_calls": [{"seq": e.get("seq"), "t_mono_ns": e.get("t_mono_ns"),
                              "arg0": e.get("arg0_int"), "arg1": e.get("arg1_int"),
                              "thread": e.get("thread_name")} for e in handlers],
        "ag_handler_calls_after_state4_right_soft": len(handler_after_state4_key),
        "br_b_calls": len(br_entries),
        "br_b_normal_exits": len(br_exits),
        "br_b_true_operand_observations": len(true_values),
        "br_b_true_without_br_a_helper": len(true_no_helper),
        "br_a_helper_calls": len(helpers),
        "target_true_branch": ({"seq": branch.get("seq"), "t_mono_ns": branch.get("t_mono_ns"),
                                "br_b_span_id": branch.get("span_id"), "value": branch.get("value"),
                                "thread": branch.get("thread_name"),
                                "same_thread_as_handler": branch.get("thread_id") == handler.get("thread_id") if handler else False,
                                "ms_after_handler": round((branch["t_mono_ns"] - handler["t_mono_ns"]) / 1e6, 3) if handler else None,
                                "no_br_a_helper_in_span": True} if branch else None),
        "state4_to_key_ms": (round((key_row["t_mono_ns"] - state4[-1]["t_mono_ns"]) / 1e6, 3)
                             if key_row and state4 else None),
        "limitations": ["synthetic AWT input, not physical keyboard input",
                        "one state-triggered route; does not prove all profiles or routes",
                        "does not measure compositor presentation or input-to-visible latency"],
        "failures": [] if observed else ["state4 Right Soft true-branch chain not fully observed"],
    }
    (RUN / "analysis.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"run_id": RUN_ID, "assessment": result["assessment"],
                      "state4_setters": len(state4), "state4_right_soft": len(state4_keys),
                      "ag_calls": len(handlers), "true_bypass": len(true_values),
                      "true_bypass_without_helper": len(true_no_helper),
                      "trace_events": len(events), "dropped": health.get("dropped")}, ensure_ascii=False))


if __name__ == "__main__":
    analyze()

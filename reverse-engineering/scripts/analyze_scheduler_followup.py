"""Derive follow-up metrics for SCN-0004 variants A and D."""
import json
import math
from pathlib import Path
import statistics

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"


def nearest(values, q):
    values = sorted(values)
    return None if not values else values[max(0, math.ceil(q * len(values)) - 1)]


def stats(values):
    if not values:
        return {"n": 0, "median": None, "p95": None, "max": None}
    return {"n": len(values), "median": statistics.median(values),
            "p95": nearest(values, 0.95), "max": max(values)}


def load_trace(run):
    path = BASE / run / "trace.jsonl"
    return [] if not path.exists() else [json.loads(line) for line in path.open()]


def selected(events, window, owner=None, method=None, phase=None, detail_prefix=None):
    start, end = window["start_mono_ns"], window["end_mono_ns"]
    return [x for x in events if start <= x["t_mono_ns"] < end
            and (owner is None or x["class"] == owner)
            and (method is None or x["method"] == method)
            and (phase is None or x["phase"] == phase)
            and (detail_prefix is None or x["detail"].startswith(detail_prefix))]


def event_series(events, window, owner, method):
    rows = selected(events, window, owner, method, "entry")
    ts = [x["t_mono_ns"] for x in rows]
    intervals = [(b-a)/1e6 for a, b in zip(ts, ts[1:])]
    return {"count": len(rows), "rate_hz": len(rows)/30,
            "interval_ms": stats(intervals), "threads": sorted({x["thread_name"] for x in rows})}


def xdamage(run):
    record = json.loads((BASE / run / "xdamage.json").read_text())
    ts = [x["t_mono_ns"] for x in record["events"]
          if record["start_ns"] <= x["t_mono_ns"] < record["end_ns"]]
    intervals = [(b-a)/1e6 for a, b in zip(ts, ts[1:])]
    return {"count": len(ts), "rate_hz": len(ts)/record["seconds"],
            "interval_ms": stats(intervals), "window_seconds": record["seconds"]}


def helper_metrics(events, window):
    entries = selected(events, window, "br", "a(JJ)V", "entry")
    exits = selected(events, window, "br", "a(JJ)V", "exit")
    by_entry = {x["span_id"]: x for x in entries}
    durations = [(x["t_mono_ns"]-by_entry[x["span_id"]]["t_mono_ns"])/1e6
                 for x in exits if x["span_id"] in by_entry]
    requested = selected(events, window, "br", "a(JJ)V", detail_prefix="thread_sleep_requested_ms")
    before, slept = {}, []
    for x in selected(events, window, "br", "a(JJ)V"):
        if x["detail"].startswith("before_Thread.sleep"):
            before[x["span_id"]] = x
        elif x["detail"].startswith("after_Thread.sleep") and x["span_id"] in before:
            slept.append((x["t_mono_ns"]-before[x["span_id"]]["t_mono_ns"])/1e6)
    return {"helper_entries": len(entries), "inclusive_duration_ms": stats(durations),
            "sleep_requested_ms": stats([x["arg0_long"] for x in requested if x["arg0_long"] is not None]),
            "sleep_call_count": len(requested),
            "observed_sleep_bracket_ms": stats(slept),
            "yield_call_count": len(selected(events, window, "br", "a(JJ)V", detail_prefix="before_Thread.yield"))}


def trace_window_metrics(events, window):
    domains = {
        "scheduler_run": ("br", "run()V"),
        "scheduler_pacing": ("br", "b()V"),
        "scheduler_wait_helper": ("br", "a(JJ)V"),
        "midp_ar_paint": ("ar", "paint(Ljavax/microedition/lcdui/Graphics;)V"),
        "emulator_awt_paint": ("org/recompile/freej2me/FreeJ2ME$LCD", "paint(Ljava/awt/Graphics;)V"),
        "emulator_flush": ("org/recompile/mobile/MobilePlatform", "flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V"),
        "m_e": ("m", "e()V")
    }
    result = {name: event_series(events, window, *target) for name, target in domains.items()}
    rows = selected(events, window)
    result["ag_a_values"] = sorted({str(x["ag.a:Z"]) for x in rows})
    result["br_d_order_values"] = sorted({str(x["br.d:Z"]) for x in rows})
    result["br_d_period_values_ms"] = sorted({x["br.d:I"] for x in rows if x["br.d:I"] is not None})
    result["pacing_helper"] = helper_metrics(events, window)
    calls = selected(events, window, "javax/microedition/lcdui/Display",
                     "callSerially(Ljava/lang/Runnable;)V", "entry")
    callbacks = selected(events, window, "br", "run()V", "entry")
    result["serial_identity"] = {
        "callSerially_entries": len(calls), "br_run_callbacks": len(callbacks),
        "matched_callback_runnable_ids": sum(x["call_serially_id"] > 0 for x in callbacks),
        "bootstrap_or_unmatched": sum(x["call_serially_id"] == 0 for x in callbacks)}
    repaint = [x for x in selected(events, window, "javax/microedition/lcdui/Canvas", phase="entry")
               if x["method"].startswith("repaint(")]
    ids = sorted({x["repaint_request_id"] for x in repaint if x["repaint_request_id"]})
    paints = selected(events, window, "org/recompile/freej2me/FreeJ2ME$LCD",
                      "paint(Ljava/awt/Graphics;)V", "entry")
    sizes = [len(x["paint_request_candidates"]) for x in paints if x["paint_request_candidates"]]
    result["repaint_paint_candidate_sets"] = {
        "unique_request_ids": len(ids), "paint_callbacks": len(paints),
        "callbacks_with_candidates": len(sizes), "candidate_links": sum(sizes),
        "candidate_count_per_paint": stats(sizes),
        "interpretation": "candidate sets only; no one-to-one causal claim"}
    return result


def worker_metrics(events):
    branches = [{"thread": x["thread_name"], "detail": x["detail"], "bt.a:B": x["bt.a:B"],
                 "m.b:B": x["m.b:B"], "m.c:B": x["m.c:B"], "m.d:B": x["m.d:B"],
                 "q.b:Z": x["q.b:Z"], "span_id": x["span_id"]}
                for x in events if x["class"] == "bt" and
                ("worker_mode" in x["detail"] or "worker_post" in x["detail"])]
    stores = [{"thread": x["thread_name"], "method": x["class"]+"."+x["method"],
               "detail": x["detail"], "m.e:I": x["m.e:I"], "m.b:B": x["m.b:B"],
               "m.c:B": x["m.c:B"], "m.d:B": x["m.d:B"], "q.b:Z": x["q.b:Z"]}
              for x in events if x["phase"] == "point" and x["detail"].startswith("field_store_after=")
              and any(f in x["detail"] for f in ("m.b:B", "m.c:B", "m.d:B", "q.b:Z"))]
    returns = [x["detail"] for x in events if x["class"] == "ar" and x["method"].startswith("paint(")
               and x["phase"] == "exit"]
    after_e = [str(x["m.e:I"]) for x in events if x["class"] == "ar" and x["method"].startswith("paint(")
               and x["phase"] == "point" and x["detail"].startswith("after_call_m.e")]
    return {"bf_run_entries": sum(x["class"] == "bf" and x["method"] == "run()V" and x["phase"] == "entry" for x in events),
            "bt_run_entries": sum(x["class"] == "bt" and x["method"] == "run()V" and x["phase"] == "entry" for x in events),
            "bt_modes_observed": sorted({x["bt.a:B"] for x in events if x["bt.a:B"] is not None}),
            "bt_worker_branch_markers": branches, "pending_and_worker_field_stores": stores,
            "q_b_values": sorted({str(x["q.b:Z"]) for x in events if x["q.b:Z"] is not None}),
            "ar_paint_return_markers": {k: returns.count(k) for k in sorted(set(returns))},
            "ar_paint_after_m_e_states": {k: after_e.count(k) for k in sorted(set(after_e))},
            "ag_a_values": sorted({str(x["ag.a:Z"]) for x in events}),
            "br_d_order_values": sorted({str(x["br.d:Z"]) for x in events})}


def run_summary(run, mode, variant):
    rd = BASE / run
    window = json.loads((rd / "window.json").read_text())
    result = {"run_id": run, "mode": mode, "variant": variant,
              "xdamage": xdamage(run), "window": window}
    if mode == "trace":
        result["trace_health"] = json.loads((rd / "trace-health.json").read_text())
        trace = load_trace(run)
        result["trace_window"] = trace_window_metrics(trace, window)
        result["worker_and_dispatch"] = worker_metrics(trace) if variant == "D" else None
    return result


def main():
    runs = []
    for variant in ("A", "D"):
        for mode in ("baseline", "trace"):
            accepted = [rd.name for rd in sorted(BASE.glob(f"M15-SCN-0004-{variant}-{mode}-R*"))
                        if not (rd / "scenario-validation.json").exists()
                        and not (rd / "invalid.json").exists()]
            if len(accepted) != 3:
                raise RuntimeError(f"Expected 3 accepted {variant}/{mode} runs, found {accepted}")
            runs.extend(run_summary(name, mode, variant) for name in accepted)
    aggregate = {"producer": "analyze_scheduler_followup.py", "date": "2026-10-22",
                 "scope": "SCN-0004 variants A and D", "valid_run_count": len(runs), "groups": {}}
    for variant in ("A", "D"):
        group = [r for r in runs if r["variant"] == variant]
        base_rates = [r["xdamage"]["rate_hz"] for r in group if r["mode"] == "baseline"]
        trace_rates = [r["xdamage"]["rate_hz"] for r in group if r["mode"] == "trace"]
        aggregate["groups"][variant] = {
            "runs": group, "baseline_xdamage_rate_hz_median": statistics.median(base_rates),
            "trace_xdamage_rate_hz_median": statistics.median(trace_rates),
            "trace_xdamage_rate_hz_p95_three_trials": nearest(trace_rates, 0.95)}
    (BASE / "aggregate.json").write_text(json.dumps(aggregate, indent=2, ensure_ascii=False) + "\n")
    a, d = aggregate["groups"]["A"], aggregate["groups"]["D"]
    def fmt(value):
        return "—" if value is None else f"{value:.3f}"
    lines = [
        "# Follow-up metrics SCN-0004 (2026-10-22)", "",
        "**Scope:** cold-start, no-input window (A) and real UI save-load transition (D).",
        "**Accepted sample:** 12 runs: A/D × baseline/trace × 3. Invalid instrumentation pilots remain excluded.",
        "All windows are 30 s. XDamage is a host receive-time proxy, not physical presentation.", "",
        "## Variant A — cold start, no input", "",
        "| Mode | XDamage counts across three runs | Median rate (Hz) | Trace scheduler rate (Hz) | Helper sleep calls |",
        "|---|---|---:|---:|---:|"
    ]
    for mode in ("baseline", "trace"):
        selected_runs = [r for r in a["runs"] if r["mode"] == mode]
        counts = ", ".join(str(r["xdamage"]["count"]) for r in selected_runs)
        rate = a["baseline_xdamage_rate_hz_median"] if mode == "baseline" else a["trace_xdamage_rate_hz_median"]
        if mode == "trace":
            scheduler = statistics.median([r["trace_window"]["scheduler_run"]["rate_hz"] for r in selected_runs])
            sleeps = ", ".join(str(r["trace_window"]["pacing_helper"]["sleep_call_count"]) for r in selected_runs)
        else:
            scheduler, sleeps = None, "—"
        lines.append(f"| {mode} | {counts} | {fmt(rate)} | {fmt(scheduler)} | {sleeps} |")
    lines += [
        "",
        "The three A trace runs had zero drops and zero field-read errors. X11 window captures are heterogeneous: the logo is visible at the 15 s checkpoint in 4/6 accepted runs and at 45 s in 2/6; the others show a blank white canvas. The cause is unresolved. During these windows m.e:I was unavailable because gameplay/menu state was not active. br.d:Z was true, ag.a:Z was false, and the helper called Thread.sleep 449–450 times per run; no helper yield occurred. The requested sleep median was 65 ms (p95 66 ms); observed before/after sleep brackets are in aggregate.json. This cold-start sample is not a stable menu or gameplay cadence.",
        "",
        "## Variant D — save-load transition", "",
        "| Mode | XDamage counts across mixed 30 s windows | Median receive rate (Hz) |",
        "|---|---|---:|"
    ]
    for mode in ("baseline", "trace"):
        selected_runs = [r for r in d["runs"] if r["mode"] == mode]
        counts = ", ".join(str(r["xdamage"]["count"]) for r in selected_runs)
        rate = d["baseline_xdamage_rate_hz_median"] if mode == "baseline" else d["trace_xdamage_rate_hz_median"]
        lines.append(f"| {mode} | {counts} | {fmt(rate)} |")
    lines += [
        "",
        "The D window spans menu input, save selection, loading, and the resulting in-house scene; its receive rate is mixed-state data, not stable cadence. Three of six accepted X11 after-load captures show the HUD over a black center (two baseline, one trace); the other three show the house. This is also present without instrumentation, but the cause is unresolved. Each accepted trace records worker mode 1 reaching m.b(BBBB)V at original BCI 168, followed by a q.b:Z=true store, and mode 2 calling bt.a()Lad; at original BCI 49. In all three traces, object identity links Display.callSerially to the later br.run callback. Each D trace window also includes 382–384 Thread.sleep calls and one Thread.yield call.",
        "",
        "D traces retain m.b:B pending-slot writes and m.c:B/m.d:B snapshots. q.b:Z is stored true by worker mode 1, then false on the UI path after the command; this is a recorded path, not an exhaustive overwrite/interleaving proof. Field reads are sequential, not an atomic snapshot. All accepted D trace runs had zero dropped events and zero field-read errors.",
        "",
        "Repaint-to-paint evidence is a candidate request set at AWT paint entry. One callback can have multiple candidate request IDs; this does not prove one-to-one causality. XDamage is not compositor presentation or visible-frame latency.",
        "",
        "## Excluded pilots and remaining limits", "",
        "- A trace R01: excluded after a probe VerifyError; the operand-stack marker was corrected in the later build.",
        "- D trace R01: partial route pilot; final image was still the loading screen and worker fields were unavailable.",
        "- D trace R02: partial route pilot; early worker-class lookup caused 45,034 field-read errors.",
        "- ag.a:Z=true, br.d:Z=false, physical repeat/multiple-key input, compositor presentation, the HUD-only image cause, and every possible worker interleaving remain unverified."
    ]
    (BASE / "metrics.md").write_text("\n".join(lines) + "\n")
    print(json.dumps({"valid_run_count": len(runs),
                      "A_baseline_median_xdamage_hz": a["baseline_xdamage_rate_hz_median"],
                      "A_trace_median_xdamage_hz": a["trace_xdamage_rate_hz_median"],
                      "D_baseline_median_mixed_xdamage_hz": d["baseline_xdamage_rate_hz_median"],
                      "D_trace_median_mixed_xdamage_hz": d["trace_xdamage_rate_hz_median"],
                      "aggregate": str((BASE / "aggregate.json").relative_to(ROOT)),
                      "metrics": str((BASE / "metrics.md").relative_to(ROOT))}, ensure_ascii=False))


if __name__ == "__main__":
    main()

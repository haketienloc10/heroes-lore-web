"""Analyze exact repaint-request to PaintEvent.UPDATE to FreeJ2ME LCD paint links."""
import json
import os
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261023-repaint-causality"
RUN_ID = os.environ.get("REPAINT_CAUSALITY_RUN_ID", "M15-SCN-0004-E-repaint-causality-R01")
RUN = BASE / RUN_ID
LCD_OWNER = "org/recompile/freej2me/FreeJ2ME$LCD"
PAINT_EVENT_UPDATE = 801


def read_jsonl(path):
    return [json.loads(line) for line in path.read_text().splitlines() if line.strip()]


def is_ancestor(span_id, spans, predicate):
    seen = set()
    while span_id and span_id not in seen:
        seen.add(span_id)
        span = spans.get(span_id)
        if span is None:
            return False
        if predicate(span):
            return True
        span_id = span.get("parent_span_id", 0)
    return False


def main():
    rows = read_jsonl(RUN / "trace.jsonl")
    health = json.loads((RUN / "trace-health.json").read_text())
    timeline = read_jsonl(RUN / "timeline.jsonl")
    sequence_ok = [row.get("seq") for row in rows] == list(range(1, len(rows) + 1))
    run_ids_ok = all(row.get("run_id") == RUN_ID for row in rows)
    spans = {row["span_id"]: row for row in rows if row.get("kind") == "span_entry"}
    requests = {row["repaint_request_id"]: row for row in rows
                if row.get("kind") == "lcd_repaint_request"}
    game_paints = [row for row in rows if row.get("kind") == "span_entry" and
                   row.get("owner") == "ar" and row.get("method") == "paint(Ljavax/microedition/lcdui/Graphics;)V"]
    flushes = [row for row in rows if row.get("kind") == "span_entry" and
               row.get("owner") == "org/recompile/mobile/MobilePlatform" and
               row.get("method") == "flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V"]
    painter_runs = [row for row in rows if row.get("kind") == "span_entry" and
                    row.get("owner") == "org/recompile/freej2me/FreeJ2ME$6" and row.get("method") == "run()V"]
    lcd_paints = [row for row in rows if row.get("kind") == "span_entry" and
                  row.get("owner") == LCD_OWNER and row.get("method") == "paint(Ljava/awt/Graphics;)V"]
    linked_paints = []
    linked_request_ids = set()
    for row in lcd_paints:
        if (row.get("awt_event_class") != "java.awt.event.PaintEvent" or
                row.get("awt_event_type") != PAINT_EVENT_UPDATE or
                row.get("awt_source_matches_receiver") is not True):
            continue
        request_ids = row.get("paint_request_ids", [])
        valid_ids = [request_id for request_id in request_ids if request_id in requests]
        if not valid_ids:
            continue
        request_chains = []
        for request_id in valid_ids:
            request = requests[request_id]
            parent = request.get("parent_span_id", 0)
            has_painter = is_ancestor(parent, spans, lambda s: s.get("owner") == "org/recompile/freej2me/FreeJ2ME$6")
            has_flush = is_ancestor(parent, spans, lambda s: s.get("owner") == "org/recompile/mobile/MobilePlatform" and
                                    s.get("method") == "flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V")
            has_game_paint = is_ancestor(parent, spans, lambda s: s.get("owner") == "ar" and
                                         s.get("method") == "paint(Ljavax/microedition/lcdui/Graphics;)V")
            has_gameplay_paint = is_ancestor(parent, spans, lambda s: s.get("owner") == "ar" and
                                              s.get("method") == "paint(Ljavax/microedition/lcdui/Graphics;)V" and
                                              s.get("game_state") == 2)
            request_chains.append({"request_id": request_id,
                                   "request_seq": request.get("seq"),
                                   "request_thread": request.get("thread_name"),
                                   "painter_run_ancestor": has_painter,
                                   "flush_graphics_ancestor": has_flush,
                                   "game_ar_paint_ancestor": has_game_paint,
                                   "game_state_2_ar_paint_ancestor": has_gameplay_paint,
                                   "same_lcd_identity": request.get("receiver_identity") == row.get("receiver_identity")})
            linked_request_ids.add(request_id)
        linked_paints.append({"paint_event_id": row.get("awt_event_id"),
                              "paint_seq": row.get("seq"),
                              "paint_thread": row.get("thread_name"),
                              "receiver_identity": row.get("receiver_identity"),
                              "request_ids": valid_ids,
                              "request_count": len(valid_ids),
                              "request_chains": request_chains})

    gameplay_checkpoint = next((row for row in timeline if row.get("event") == "gameplay_after_load_checkpoint"), None)
    idle_finished = next((row for row in timeline if row.get("event") == "idle_capture_finished"), None)
    gameplay_start_ns = gameplay_checkpoint.get("mono_ns") if gameplay_checkpoint else None
    gameplay_end_ns = idle_finished.get("mono_ns") if idle_finished else None
    after_checkpoint = [row for row in rows if gameplay_start_ns is not None and
                        row.get("t_mono_ns", 0) >= gameplay_start_ns and
                        (gameplay_end_ns is None or row.get("t_mono_ns", 0) <= gameplay_end_ns)]
    after_cp_request_ids = {row["repaint_request_id"] for row in after_checkpoint
                            if row.get("kind") == "lcd_repaint_request"}
    after_cp_linked = [paint for paint in linked_paints
                       if paint["paint_seq"] and
                       next((row.get("t_mono_ns", 0) for row in after_checkpoint
                             if row.get("seq") == paint["paint_seq"]), 0) > 0]
    after_cp_linked_request_ids = {request_id for paint in after_cp_linked for request_id in paint["request_ids"]
                                   if request_id in after_cp_request_ids}
    exit_span_ids = {row.get("span_id") for row in rows if row.get("kind") == "span_exit" and row.get("span_id")}
    censored_spans = [{"span_id": span_id, "owner": row.get("owner"), "method": row.get("method"),
                       "thread_name": row.get("thread_name"), "game_state": row.get("game_state"),
                       "entry_seq": row.get("seq")}
                      for span_id, row in spans.items() if span_id not in exit_span_ids]

    flush_repaint_requests = {request_id for request_id, request in requests.items()
                              if is_ancestor(request.get("parent_span_id", 0), spans,
                                             lambda s: s.get("owner") == "org/recompile/freej2me/FreeJ2ME$6") and
                              is_ancestor(request.get("parent_span_id", 0), spans,
                                          lambda s: s.get("owner") == "org/recompile/mobile/MobilePlatform" and
                                          s.get("method") == "flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V")}
    one_request_per_event = all(paint["request_count"] == 1 for paint in linked_paints)
    unique_linked_paint_events = len({paint["paint_event_id"] for paint in linked_paints})
    all_linked_requests_same_receiver = all(
        item["same_lcd_identity"] for paint in linked_paints for item in paint["request_chains"])
    all_linked_requests_retained = (linked_request_ids == set(requests) and
                                    health.get("unmatched_repaint_requests") == 0)
    checks = {
        "trace_sequence_contiguous": sequence_ok,
        "run_id_consistent": run_ids_ok,
        "trace_fully_retained": health.get("dropped") == 0 and health.get("events_seen") == len(rows),
        "span_stack_clean": health.get("span_errors") == 0,
        "awt_event_lookup_clean": health.get("awt_lookup_errors") == 0,
        "request_queue_clean": health.get("request_queue_overflow") == 0,
        "paint_event_id_clean": health.get("paint_event_id_overflow") == 0,
        "same_lcd_identity_for_links": all_linked_requests_same_receiver,
        "every_lcd_repaint_request_nested_in_flush_and_painter": len(flush_repaint_requests) == len(requests) and bool(requests),
        "awt_update_event_to_lcd_paint_observed": bool(linked_paints),
        "every_request_linked_to_same_source_update_paint": all_linked_requests_retained,
        "distinct_update_event_per_request_in_this_window": one_request_per_event and unique_linked_paint_events == len(linked_request_ids),
    }
    valid = all(checks.values()) and bool(linked_paints)
    result = {
        "run_id": RUN_ID,
        "assessment": "flush_repaint_update_event_lcd_paint_causality_observed" if valid else "inconclusive",
        "trace_events": len(rows),
        "trace_health": health,
        "checks": checks,
        "counts": {
            "ar_paint_entries": len(game_paints),
            "ar_paint_state_2_entries": sum(row.get("game_state") == 2 for row in game_paints),
            "flush_graphics_entries": len(flushes),
            "painter_run_entries": len(painter_runs),
            "lcd_repaint_requests": len(requests),
            "lcd_paint_entries": len(lcd_paints),
            "paint_event_update_same_lcd": sum(
                row.get("awt_event_class") == "java.awt.event.PaintEvent" and
                row.get("awt_event_type") == PAINT_EVENT_UPDATE and
                row.get("awt_source_matches_receiver") is True for row in lcd_paints),
            "linked_update_event_lcd_paints": len(linked_paints),
            "request_ids_linked_to_lcd_paint": len(linked_request_ids),
            "request_ids_nested_in_flush_and_painter": len(flush_repaint_requests),
            "request_ids_with_gameplay_ar_paint_ancestor": sum(
                item["game_state_2_ar_paint_ancestor"] for paint in linked_paints for item in paint["request_chains"]),
            "distinct_linked_paint_event_ids": unique_linked_paint_events,
            "one_request_per_update_event": one_request_per_event,
            "unmatched_requests_at_shutdown": health.get("unmatched_repaint_requests"),
            "update_paints_without_tracked_requests": health.get("unmatched_update_paint_entries"),
            "paints_outside_paint_event": health.get("non_paint_context_entries"),
        },
        "gameplay_capture_window": {
            "start_mono_ns": gameplay_start_ns,
            "end_mono_ns": gameplay_end_ns,
            "duration_seconds": round((gameplay_end_ns - gameplay_start_ns) / 1_000_000_000, 3)
                if gameplay_start_ns is not None and gameplay_end_ns is not None else None,
            "ar_paint_state_2_entries": sum(row.get("kind") == "span_entry" and row.get("owner") == "ar" and
                                             row.get("game_state") == 2 for row in after_checkpoint),
            "flush_graphics_entries": sum(row.get("kind") == "span_entry" and
                                           row.get("owner") == "org/recompile/mobile/MobilePlatform" and
                                           row.get("method") == "flushGraphics(Lorg/recompile/mobile/PlatformImage;IIII)V"
                                           for row in after_checkpoint),
            "lcd_repaint_requests": len(after_cp_request_ids),
            "same_source_update_lcd_paints": sum(row.get("kind") == "span_entry" and row.get("owner") == LCD_OWNER and
                                                  row.get("awt_event_type") == PAINT_EVENT_UPDATE and
                                                  row.get("awt_source_matches_receiver") is True for row in after_checkpoint),
            "request_ids_linked_to_update_paint": len(after_cp_linked_request_ids),
            "every_gameplay_window_request_linked": after_cp_linked_request_ids == after_cp_request_ids,
        },
        "censored_spans_at_shutdown": censored_spans,
        "linked_paint_events": linked_paints[:40],
        "limitations": [
            "One controlled fixture route and emulator profile; the result applies to captured events only.",
            "One PaintEvent.UPDATE can consume several pending repaint calls; this measures batching/coalescing, not one request per paint.",
            "PaintEvent.PAINT expose events and presentation by the desktop compositor are outside the request-to-update link.",
            "The captured ar.paint state-2 entries are not stack ancestors of the emulator flush/repaint call; the evidence links the FreeJ2ME repaint request to its AWT paint, not each game update to a displayed frame.",
            "Normal method returns are hooked; exceptional exits can leave method spans censored.",
            "Synthetic AWT menu input is used; physical keyboard and input-to-visible latency are not measured.",
        ],
    }
    (RUN / "analysis.json").write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"run_id": RUN_ID, "assessment": result["assessment"],
                      "trace_events": len(rows), "checks": checks, "counts": result["counts"]},
                     ensure_ascii=False))


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Summarize bounded live-J2ME and browser walk timing captures.

This compares observed frontbuffer image-change spacing with browser pose-cursor
change spacing. It cannot identify the J2ME actor frame cursor or separate player
motion, camera motion, and world repaint timing.
"""

import argparse
import hashlib
import json
from pathlib import Path
import statistics


ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/runtime-20261021"
SCREENSHOTS = ROOT / "reference/screenshots"


def summary(values):
    if not values:
        return None
    return {
        "count": len(values),
        "min_ms": round(min(values), 3),
        "median_ms": round(statistics.median(values), 3),
        "mean_ms": round(statistics.mean(values), 3),
        "max_ms": round(max(values), 3),
    }


def source_capture(run_id, stem):
    log = EVIDENCE / run_id / f"{stem}-samples.log"
    image_dir = SCREENSHOTS / run_id
    rows = []
    requested_interval_ms = None
    for line in log.read_text().splitlines():
        if line.startswith("#"):
            for field in line.split():
                if field.startswith("requested_interval_ms="):
                    requested_interval_ms = int(field.split("=", 1)[1])
            continue
        if not line:
            continue
        ordinal, start_ns, end_ns, name = line.split()
        digest = hashlib.sha256((image_dir / name).read_bytes()).hexdigest()
        rows.append({"ordinal": int(ordinal), "start_ns": int(start_ns), "end_ns": int(end_ns),
                     "file": name, "sha256": digest})

    if not rows:
        raise ValueError(f"No source samples in {log}")
    groups = []
    for row in rows:
        if not groups or groups[-1]["sha256"] != row["sha256"]:
            groups.append({"first_ordinal": row["ordinal"], "last_ordinal": row["ordinal"],
                           "first_start_ns": row["start_ns"], "last_end_ns": row["end_ns"],
                           "sample_count": 1, "sha256": row["sha256"]})
        else:
            group = groups[-1]
            group["last_ordinal"] = row["ordinal"]
            group["last_end_ns"] = row["end_ns"]
            group["sample_count"] += 1

    transitions = []
    for previous, current in zip(groups, groups[1:]):
        lower_ns = previous["last_end_ns"]
        upper_ns = current["first_start_ns"]
        transitions.append({
            "from_ordinal": previous["last_ordinal"],
            "to_ordinal": current["first_ordinal"],
            "lower_bound_ns": lower_ns,
            "upper_bound_ns": upper_ns,
            "midpoint_ns": (lower_ns + upper_ns) // 2,
            "bracket_width_ms": round((upper_ns - lower_ns) / 1_000_000, 3),
        })
    periods = [round((b["midpoint_ns"] - a["midpoint_ns"]) / 1_000_000, 3)
               for a, b in zip(transitions, transitions[1:])]
    sample_intervals = [(b["start_ns"] - a["start_ns"]) / 1_000_000
                        for a, b in zip(rows, rows[1:])]
    copy_ms = [(row["end_ns"] - row["start_ns"]) / 1_000_000 for row in rows]
    return {
        "run_id": run_id,
        "stem": stem,
        "requested_interval_ms": requested_interval_ms,
        "sample_count": len(rows),
        "capture_window_ms": round((rows[-1]["end_ns"] - rows[0]["start_ns"]) / 1_000_000, 3),
        "sample_interval_ms": summary(sample_intervals),
        "copy_duration_ms": summary(copy_ms),
        "unique_consecutive_full_frames": len(groups),
        "visible_frame_runs": [{
            "first_ordinal": g["first_ordinal"],
            "last_ordinal": g["last_ordinal"],
            "sample_count": g["sample_count"],
            "duration_ms": round((g["last_end_ns"] - g["first_start_ns"]) / 1_000_000, 3),
            "sha256": g["sha256"],
        } for g in groups],
        "visible_change_transition_brackets": transitions,
        "visible_change_periods_ms": periods,
        "visible_change_period_summary": summary(periods),
        "limitation": "full-frame changes can include player motion, camera motion, repaint, or animation; frontbuffer copies are unsynchronized with paint, so transition times are bounded by adjacent samples rather than source update timestamps; no J2ME player frame cursor was observed",
    }


def browser_capture(path):
    result = json.loads(path.read_text())
    timeline = result.get("walkTimeline")
    if timeline is None:
        raise ValueError(f"Browser result has no walkTimeline: {path}")
    changes = [entry for entry in timeline["changes"]
               if entry["pose"].get("moving") is True and entry["pose"].get("animationSlot") == 1]
    periods = [round(b["relativeMs"] - a["relativeMs"], 3)
               for a, b in zip(changes, changes[1:])]
    return {
        "result_path": str(path.relative_to(ROOT)),
        "milestone": result.get("id"),
        "passed": result.get("passed"),
        "profile": result.get("profile"),
        "scenario": result.get("scenario"),
        "map_id": result.get("walkStart", {}).get("mapId"),
        "walk_frames": result.get("walkingFrames"),
        "pre_move": result.get("preMove"),
        "raf_samples": timeline["rafSamples"],
        "timeline_window_ms": round(timeline["stoppedAtMs"] - timeline["startedAtMs"], 3),
        "moving_pose_changes": [{
            "relative_ms": round(entry["relativeMs"], 3),
            "animation_slot": entry["pose"].get("animationSlot"),
            "frame_index": entry["pose"].get("frameIndex"),
            "direction_slot": entry["pose"].get("directionSlot"),
        } for entry in changes],
        "pose_change_periods_ms": periods,
        "pose_change_period_summary": summary(periods),
        "limitation": "in-page requestAnimationFrame samples the exposed browser pose telemetry; timing is quantized by browser RAF and does not measure physical display presentation",
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--milestone", default="M1058", help="evidence milestone label")
    parser.add_argument("--source-run", required=True, help="SCN-0005 run ID, e.g. M15-SCN-0005-P1M-R21")
    parser.add_argument("--source-stem", required=True, help="burst prefix, e.g. 03-down-held")
    parser.add_argument("--browser-result", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    browser_result = args.browser_result if args.browser_result.is_absolute() else ROOT / args.browser_result
    output = args.output if args.output.is_absolute() else ROOT / args.output
    source = source_capture(args.source_run, args.source_stem)
    browser = browser_capture(browser_result)
    source_median = source["visible_change_period_summary"]["median_ms"]
    browser_median = browser["pose_change_period_summary"]["median_ms"]
    payload = {
        "milestone": args.milestone,
        "producer": "analyze_walk_cadence.py; SHA-256 of captured PNGs and timestamps recorded by the attached FreeJ2ME reader and in-page browser RAF sampler",
        "source": source,
        "browser": browser,
        "comparison": {
            "source_visible_change_median_ms": source_median,
            "browser_pose_change_median_ms": browser_median,
            "source_visible_change_mean_ms": source["visible_change_period_summary"]["mean_ms"],
            "browser_pose_change_mean_ms": browser["pose_change_period_summary"]["mean_ms"],
            "absolute_median_difference_ms": round(abs(source_median - browser_median), 3),
            "absolute_mean_difference_ms": round(abs(source["visible_change_period_summary"]["mean_ms"] - browser["pose_change_period_summary"]["mean_ms"]), 3),
            "interpretation": "The single-sample means are close; browser RAF quantizes observed pose changes to roughly 16.7 ms steps. The comparison is between unsynchronized full source framebuffer changes and browser animation-cursor changes, so it does not establish exact actor-only cadence parity.",
        },
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(payload, indent=2) + "\n")
    print(json.dumps({
        "output": str(output),
        "source_samples": source["sample_count"],
        "source_visible_change_periods_ms": source["visible_change_periods_ms"],
        "source_median_ms": source_median,
        "browser_pose_change_periods_ms": browser["pose_change_periods_ms"],
        "browser_median_ms": browser_median,
        "source_mean_ms": source["visible_change_period_summary"]["mean_ms"],
        "browser_mean_ms": browser["pose_change_period_summary"]["mean_ms"],
        "absolute_median_difference_ms": payload["comparison"]["absolute_median_difference_ms"],
        "absolute_mean_difference_ms": payload["comparison"]["absolute_mean_difference_ms"],
    }, indent=2))


if __name__ == "__main__":
    main()

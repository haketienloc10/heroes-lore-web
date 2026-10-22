"""Summarize repeated no-input CF-01 paint-state probes."""
import hashlib
import json
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
BASE = ROOT / "reverse-engineering/findings/evidence/milestone-1.5/scheduler-followup-20261022"


def digest(path):
    value = hashlib.sha256(path.read_bytes()).hexdigest()
    return {"path": str(path.relative_to(ROOT)), "size": path.stat().st_size, "sha256": value}


def main():
    runs = []
    for run_dir in sorted(BASE.glob("M15-SCN-0004-CF01-paint-v2-R*")):
        trace_path = run_dir / "trace.jsonl"
        if not trace_path.exists():
            continue
        events = [json.loads(line) for line in trace_path.read_text().splitlines() if line.strip()]
        checkpoints = json.loads((run_dir / "checkpoints.json").read_text())["checkpoints"]
        paints = [event for event in events if event.get("site") == "bf_paint_entry"]
        states = Counter(str(event.get("bf.a:B")) for event in paints)
        field_domains = defaultdict(set)
        for event in paints:
            for name, value in event.items():
                if name.startswith("bf.") or name.startswith("q."):
                    field_domains[name].add(value)
        image_events = [event for event in events if event.get("site") == "cd.j_logo_image_array"]
        checkpoint_states = []
        for checkpoint in checkpoints:
            target = checkpoint["mono_ns"]
            prior = [event for event in paints if event["t_mono_ns"] <= target]
            event = prior[-1] if prior else None
            screenshot = ROOT / checkpoint["screenshot"]
            checkpoint_states.append({
                "elapsed_target_seconds": checkpoint["elapsed_target_seconds"],
                "screenshot": digest(screenshot),
                "nearest_prior_paint": ({"t_mono_ns": event["t_mono_ns"], "bf.a:B": event.get("bf.a:B"),
                                         **{key: event.get(key) for key in ["bf.b:B", "bf.a:I", "bf.a:S", "bf.b:S",
                                                                            "bf.c:B", "bf.c:S", "bf.d:S", "bf.d:B",
                                                                            "bf.c:Z", "q.g:I", "q.h:I"]}}
                                        if event else None),
            })
        rows = [event["seq"] for event in events]
        runs.append({
            "run_id": run_dir.name,
            "event_count": len(events),
            "sequence_contiguous": rows == list(range(1, len(rows) + 1)),
            "run_id_consistent": all(event.get("run_id") == run_dir.name for event in events),
            "paint_entry_count": len(paints),
            "paint_counts_by_bf_a": dict(sorted(states.items())),
            "paint_field_values": {key: sorted(values, key=str) for key, values in sorted(field_domains.items())},
            "logo_image_array_observations": image_events,
            "checkpoints": checkpoint_states,
        })
    result = {
        "purpose": "Compare no-input splash paint state, animation field values, and logo Image[] availability near X11 screenshots.",
        "runs": runs,
        "interpretation_limit": "The game paint call and Image[] null status do not establish framebuffer blit success, compositor presentation, or the causal reason a captured X11 window appears blank.",
    }
    output = BASE / "cf-01-paint-state-audit.json"
    output.write_text(json.dumps(result, indent=2, ensure_ascii=False) + "\n")
    print(json.dumps({"output": str(output.relative_to(ROOT)), "runs": [
        {"run_id": row["run_id"], "events": row["event_count"], "paints": row["paint_entry_count"],
         "sequence_contiguous": row["sequence_contiguous"], "states": row["paint_counts_by_bf_a"],
         "image_arrays": len(row["logo_image_array_observations"])} for row in runs
    ]}, ensure_ascii=False))


if __name__ == "__main__":
    main()
